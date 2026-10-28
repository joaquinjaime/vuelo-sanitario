<#
.SYNOPSIS
  Diagnostico no destructivo previo a Flyway para SQL Server.
.DESCRIPTION
  Lee solo la tabla de historial, catalogos del esquema y datos que pueden impedir
  restricciones conocidas de las migraciones V42-V47. No ejecuta migraciones ni
  modifica datos. Requiere sqlcmd; no lee ni guarda archivos .env.
.EXAMPLE
  $env:MIGRATION_SQL_USERNAME='vuelos_app'
  $env:SQLCMDPASSWORD=$env:MIGRATION_SQL_PASSWORD
  .\scripts\prevalidate-migrations.ps1 -Server 'tcp:127.0.0.1,14332' -Database 'vuelos_sanitarios'
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$Server,
    [Parameter(Mandatory=$true)][string]$Database
)
$ErrorActionPreference = 'Stop'

$migrationDir = Join-Path $PSScriptRoot '..\backend-java\src\main\resources\db\migration'
$versions = @(Get-ChildItem -LiteralPath $migrationDir -Filter 'V*.sql' | ForEach-Object {
    if ($_.BaseName -match '^V(\d+)__') { [int]$Matches[1] }
}) | Sort-Object -Unique
if (-not $versions.Count) { throw "No se encontraron migraciones en $migrationDir" }
$targetVersion = $versions[-1]

$query = @'
SET NOCOUNT ON;
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
SELECT CONCAT(N'INFO|database|', DB_NAME());
IF OBJECT_ID(N'dbo.flyway_schema_history', N'U') IS NULL
    SELECT N'ISSUE|historial Flyway ausente; confirme manualmente baseline y esquema.';
ELSE BEGIN
    DECLARE @current int = (SELECT MAX(TRY_CONVERT(int, version)) FROM dbo.flyway_schema_history WHERE success=1);
    SELECT CONCAT(N'INFO|flyway-current|', COALESCE(CONVERT(nvarchar(20), @current), N'<<sin version>>'));
    IF EXISTS (SELECT 1 FROM dbo.flyway_schema_history WHERE success=0)
        SELECT N'ISSUE|historial Flyway contiene migraciones fallidas; requiere diagnostico manual.';
    IF EXISTS (SELECT 1 FROM dbo.flyway_schema_history WHERE version IS NOT NULL AND TRY_CONVERT(int, version) IS NULL)
        SELECT N'WARNING|hay versiones Flyway no numericas; revise migraciones repetibles o baselines.';

    IF OBJECT_ID(N'dbo.personas', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.personas', N'dni') IS NOT NULL BEGIN
        IF OBJECT_ID(N'dbo.fn_dni_solo_digitos', N'FN') IS NOT NULL BEGIN
            IF EXISTS (SELECT dbo.fn_dni_solo_digitos(dni) FROM dbo.personas WHERE dni IS NOT NULL GROUP BY dbo.fn_dni_solo_digitos(dni) HAVING COUNT(*) > 1)
                SELECT N'ISSUE|DNI distintos colisionan al normalizar solo digitos; resolver identidades manualmente.';
            IF EXISTS (SELECT 1 FROM dbo.personas WHERE dni IS NOT NULL AND dbo.fn_dni_solo_digitos(dni)=N'')
                SELECT N'ISSUE|hay DNI informados sin digitos.';
            IF EXISTS (SELECT 1 FROM dbo.personas WHERE dni IS NOT NULL AND dni<>dbo.fn_dni_solo_digitos(dni))
                SELECT N'WARNING|hay DNI no canonicos; V13 puede haberlos normalizado si aun esta pendiente.';
        END ELSE IF EXISTS (
            SELECT REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(dni)),N'.',N''),N' ',N''),N'-',N'')
            FROM dbo.personas WHERE dni IS NOT NULL
            GROUP BY REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(dni)),N'.',N''),N' ',N''),N'-',N'')
            HAVING COUNT(*) > 1)
            SELECT N'ISSUE|DNI duplicados tras retirar puntos, espacios y guiones.';
    END;
    IF OBJECT_ID(N'dbo.usuarios', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.usuarios', N'nombre_usuario') IS NOT NULL
       AND EXISTS (SELECT nombre_usuario FROM dbo.usuarios WHERE nombre_usuario IS NOT NULL GROUP BY nombre_usuario HAVING COUNT(*) > 1)
        SELECT N'ISSUE|nombres de usuario duplicados segun la intercalacion de SQL Server.';
    IF OBJECT_ID(N'dbo.informes_finales_vuelo', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.informes_finales_vuelo', N'es_version_actual') IS NOT NULL
       AND EXISTS (SELECT id_vuelos FROM dbo.informes_finales_vuelo WHERE es_version_actual=1 GROUP BY id_vuelos HAVING COUNT(*) > 1)
        SELECT N'ISSUE|un vuelo tiene varias versiones actuales de informe final; V42 no podra crear el indice filtrado.';
    IF OBJECT_ID(N'dbo.vuelos_tripulantes', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.vuelos_tripulantes', N'id_vuelos') IS NOT NULL
       AND COL_LENGTH(N'dbo.vuelos_tripulantes', N'id_usuarios') IS NOT NULL BEGIN
        IF COL_LENGTH(N'dbo.vuelos_tripulantes', N'fecha_baja') IS NOT NULL BEGIN
            EXEC(N'IF EXISTS (SELECT id_vuelos,id_usuarios FROM dbo.vuelos_tripulantes WHERE fecha_baja IS NULL GROUP BY id_vuelos,id_usuarios HAVING COUNT(*) > 1) SELECT N''ISSUE|asignaciones vigentes repetidas por vuelo y tripulante; V45 no podra crear el indice.'';');
        END ELSE IF EXISTS (SELECT id_vuelos,id_usuarios FROM dbo.vuelos_tripulantes GROUP BY id_vuelos,id_usuarios HAVING COUNT(*) > 1)
            SELECT N'ISSUE|asignaciones repetidas por vuelo y tripulante; V45 no podra crear el indice filtrado.';
    END;
    IF OBJECT_ID(N'dbo.coordinaciones_aa2000', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.coordinaciones_aa2000', N'estado_autorizacion') IS NOT NULL
       AND EXISTS (SELECT 1 FROM dbo.coordinaciones_aa2000 WHERE estado_autorizacion NOT IN (N'PENDIENTE',N'EN_SEGUIMIENTO',N'CONFIRMADO',N'RECHAZADO',N'CANCELADO'))
        SELECT N'ISSUE|hay coordinaciones con estados que V41 rechazara.';
    IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE is_disabled=1 OR is_not_trusted=1)
        SELECT N'ISSUE|hay claves foraneas deshabilitadas o no confiables.';
    IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE is_disabled=1 OR is_not_trusted=1)
        SELECT N'ISSUE|hay restricciones CHECK deshabilitadas o no confiables.';
    IF EXISTS (SELECT 1 FROM sys.triggers WHERE parent_class=1 AND is_disabled=1)
        SELECT N'WARNING|hay triggers de tabla deshabilitados; revise las reglas de integridad.';

    IF @current < 41 AND OBJECT_ID(N'dbo.coordinaciones_aa2000',N'U') IS NULL
        SELECT N'ISSUE|falta dbo.coordinaciones_aa2000, requerida por V41.';
    IF @current < 42 AND (OBJECT_ID(N'dbo.informes_finales_vuelo',N'U') IS NULL OR OBJECT_ID(N'dbo.obligaciones_informe_final',N'U') IS NULL)
        SELECT N'ISSUE|faltan informes u obligaciones de cierre, requeridos por V42.';
    IF @current < 44 AND (OBJECT_ID(N'dbo.negociaciones_horario_vuelo',N'U') IS NULL OR OBJECT_ID(N'dbo.estados_solicitud_sanitaria',N'U') IS NULL)
        SELECT N'ISSUE|faltan negociaciones o catalogo de estados sanitarios, requeridos por V44.';
    IF @current < 45 AND OBJECT_ID(N'dbo.vuelos_tripulantes',N'U') IS NULL
        SELECT N'ISSUE|falta dbo.vuelos_tripulantes, requerida por V45.';
    IF @current < 46 AND OBJECT_ID(N'dbo.eventos_auditoria',N'U') IS NULL
        SELECT N'ISSUE|falta dbo.eventos_auditoria, requerida por V46.';
    IF @current < 47 AND (OBJECT_ID(N'dbo.personas',N'U') IS NULL OR OBJECT_ID(N'dbo.usuarios',N'U') IS NULL OR OBJECT_ID(N'dbo.eventos_auditoria',N'U') IS NULL)
        SELECT N'ISSUE|faltan personas, usuarios o auditoria, requeridos por V47.';

    IF @current < 42 AND OBJECT_ID(N'dbo.informes_finales_vuelo',N'U') IS NOT NULL AND COL_LENGTH(N'dbo.informes_finales_vuelo',N'es_version_actual') IS NOT NULL
       AND EXISTS (SELECT id_vuelos FROM dbo.informes_finales_vuelo WHERE es_version_actual=1 GROUP BY id_vuelos HAVING COUNT(*) > 1)
        SELECT N'ISSUE|varios informes finales actuales por vuelo impedirian el indice unico de V42.';

    IF OBJECT_ID(N'dbo.vuelos',N'U') IS NOT NULL AND OBJECT_ID(N'dbo.estados_vuelo',N'U') IS NOT NULL BEGIN
        IF EXISTS (
            SELECT 1 FROM dbo.vuelos a JOIN dbo.estados_vuelo ea ON ea.id_estados_vuelo=a.id_estados_vuelo
            JOIN dbo.vuelos b ON b.id_vuelos>a.id_vuelos AND a.id_aeronaves=b.id_aeronaves
            JOIN dbo.estados_vuelo eb ON eb.id_estados_vuelo=b.id_estados_vuelo
            WHERE a.id_aeronaves IS NOT NULL AND ea.codigo_estado_vuelo IN (N'PENDIENTE_CONFIRMACION_COMANDANTE',N'PENDIENTE_RESPUESTA_OPERACIONES',N'PLANIFICADO',N'EN_CURSO')
              AND eb.codigo_estado_vuelo IN (N'PENDIENTE_CONFIRMACION_COMANDANTE',N'PENDIENTE_RESPUESTA_OPERACIONES',N'PLANIFICADO',N'EN_CURSO')
              AND a.fecha_planificada_salida IS NOT NULL AND a.fecha_planificada_llegada IS NOT NULL
              AND b.fecha_planificada_salida IS NOT NULL AND b.fecha_planificada_llegada IS NOT NULL
              AND a.fecha_planificada_salida < b.fecha_planificada_llegada AND a.fecha_planificada_llegada > b.fecha_planificada_salida)
            SELECT N'ISSUE|aeronaves con vuelos comprometidos y horarios superpuestos.';
        IF EXISTS (
            SELECT 1 FROM dbo.vuelos a JOIN dbo.estados_vuelo ea ON ea.id_estados_vuelo=a.id_estados_vuelo
            JOIN dbo.vuelos b ON b.id_vuelos>a.id_vuelos AND a.id_usuario_comandante=b.id_usuario_comandante
            JOIN dbo.estados_vuelo eb ON eb.id_estados_vuelo=b.id_estados_vuelo
            WHERE a.id_usuario_comandante IS NOT NULL AND ea.codigo_estado_vuelo IN (N'PENDIENTE_CONFIRMACION_COMANDANTE',N'PENDIENTE_RESPUESTA_OPERACIONES',N'PLANIFICADO',N'EN_CURSO')
              AND eb.codigo_estado_vuelo IN (N'PENDIENTE_CONFIRMACION_COMANDANTE',N'PENDIENTE_RESPUESTA_OPERACIONES',N'PLANIFICADO',N'EN_CURSO')
              AND a.fecha_planificada_salida IS NOT NULL AND a.fecha_planificada_llegada IS NOT NULL
              AND b.fecha_planificada_salida IS NOT NULL AND b.fecha_planificada_llegada IS NOT NULL
              AND a.fecha_planificada_salida < b.fecha_planificada_llegada AND a.fecha_planificada_llegada > b.fecha_planificada_salida)
            SELECT N'ISSUE|comandantes con vuelos comprometidos y horarios superpuestos.';
    END;
    IF OBJECT_ID(N'dbo.vuelos_tripulantes',N'U') IS NOT NULL AND OBJECT_ID(N'dbo.vuelos',N'U') IS NOT NULL AND OBJECT_ID(N'dbo.estados_vuelo',N'U') IS NOT NULL BEGIN
        DECLARE @crewOverlapSql nvarchar(max) = N'IF EXISTS (
            SELECT 1 FROM dbo.vuelos_tripulantes x JOIN dbo.vuelos a ON a.id_vuelos=x.id_vuelos
            JOIN dbo.estados_vuelo ea ON ea.id_estados_vuelo=a.id_estados_vuelo
            JOIN dbo.vuelos_tripulantes y ON y.id_usuarios=x.id_usuarios AND y.id_vuelos>a.id_vuelos
            JOIN dbo.vuelos b ON b.id_vuelos=y.id_vuelos
            JOIN dbo.estados_vuelo eb ON eb.id_estados_vuelo=b.id_estados_vuelo
            WHERE ea.codigo_estado_vuelo IN (N''PENDIENTE_CONFIRMACION_COMANDANTE'',N''PENDIENTE_RESPUESTA_OPERACIONES'',N''PLANIFICADO'',N''EN_CURSO'')
              AND eb.codigo_estado_vuelo IN (N''PENDIENTE_CONFIRMACION_COMANDANTE'',N''PENDIENTE_RESPUESTA_OPERACIONES'',N''PLANIFICADO'',N''EN_CURSO'')
              AND a.fecha_planificada_salida IS NOT NULL AND a.fecha_planificada_llegada IS NOT NULL
              AND b.fecha_planificada_salida IS NOT NULL AND b.fecha_planificada_llegada IS NOT NULL
              AND a.fecha_planificada_salida < b.fecha_planificada_llegada AND a.fecha_planificada_llegada > b.fecha_planificada_salida';
        IF COL_LENGTH(N'dbo.vuelos_tripulantes',N'fecha_baja') IS NOT NULL
            SET @crewOverlapSql += N' AND x.fecha_baja IS NULL AND y.fecha_baja IS NULL';
        SET @crewOverlapSql += N') SELECT N''ISSUE|tripulantes con vuelos comprometidos y horarios superpuestos.'';';
        EXEC(@crewOverlapSql);
    END;

    -- V48-V55 (identidad, contactos, documentos, verificacion de correos y revision de rutas). Nada de esto modifica datos.
    IF @current < 52 AND OBJECT_ID(N'dbo.documentos_vuelo',N'U') IS NOT NULL AND OBJECT_ID(N'dbo.versiones_documento_vuelo',N'U') IS NOT NULL
       AND COL_LENGTH(N'dbo.documentos_vuelo',N'esta_activo') IS NOT NULL
       AND EXISTS (SELECT 1 FROM dbo.documentos_vuelo d WHERE d.esta_activo=0 AND NOT EXISTS (SELECT 1 FROM dbo.versiones_documento_vuelo v WHERE v.id_documentos_vuelo=d.id_documentos_vuelo))
        SELECT N'ISSUE|hay documentos inactivos sin versiones: V52 se detiene con THROW 51052 porque no puede atribuir la baja; revise esos registros.';
    -- V56-V60 (I-5.7). V57 se detiene (THROW 51057) si hay licencias de comandante duplicadas: se avisa antes de la ventana. V59 y V60 no tienen condiciones de aborto sobre datos.
    IF @current < 57 AND OBJECT_ID(N'dbo.perfiles_comandante',N'U') IS NOT NULL AND COL_LENGTH(N'dbo.perfiles_comandante',N'numero_licencia_normalizada') IS NOT NULL
       AND EXISTS (SELECT 1 FROM dbo.perfiles_comandante GROUP BY numero_licencia_normalizada HAVING COUNT(*) > 1)
        SELECT N'ISSUE|hay licencias aeronauticas de comandante duplicadas: V57 se detiene con THROW 51057; resuelvalas manualmente (no se elige cual conservar).';
    IF @current < 59 AND OBJECT_ID(N'dbo.documentos_habilitacion',N'U') IS NOT NULL BEGIN
        DECLARE @legacyDocs int = (SELECT COUNT(*) FROM dbo.documentos_habilitacion);
        IF @legacyDocs > 0 SELECT CONCAT(N'WARNING|V59 dejara ', @legacyDocs, N' documento(s) de habilitacion como LEGADO_SIN_ANALISIS (restringidos hasta regularizarlos con un antivirus acreditado); V60 los clasificara como ANTERIOR_V59.');
    END;
    IF @current < 59 SELECT N'INFO|politicas-habilitacion|V59 no siembra ninguna: hasta activar una politica (docs/POLITICAS_HABILITACION_PROPUESTA_I57_2026-10-28.md) nadie sera elegible para ninguna funcion.';
    IF @current < 49 AND OBJECT_ID(N'dbo.correos_electronicos',N'U') IS NOT NULL AND COL_LENGTH(N'dbo.correos_electronicos',N'direccion_normalizada') IS NULL BEGIN
        DECLARE @dupMail int = (SELECT COUNT(*) FROM (SELECT id_personas FROM dbo.correos_electronicos GROUP BY id_personas, LOWER(LTRIM(RTRIM(direccion))) HAVING COUNT(*) > 1) x);
        IF @dupMail > 0 SELECT CONCAT(N'WARNING|V49 dara de baja (DUPLICADO_MIGRACION, sin borrar) correos repetidos de una misma persona: ', @dupMail, N' grupos.');
    END;
    IF @current < 50 AND OBJECT_ID(N'dbo.correos_electronicos',N'U') IS NOT NULL BEGIN
        DECLARE @noMain int = (SELECT COUNT(*) FROM (SELECT id_personas FROM dbo.correos_electronicos GROUP BY id_personas HAVING SUM(CAST(es_principal AS int)) = 0) x);
        IF @noMain > 0 SELECT CONCAT(N'WARNING|V50 promovera un contacto principal en ', @noMain, N' personas con correos pero sin principal.');
    END;
    IF @current < 55 AND OBJECT_ID(N'dbo.rutas_vuelo',N'U') IS NOT NULL AND COL_LENGTH(N'dbo.rutas_vuelo',N'estado_revision') IS NULL BEGIN
        SELECT CONCAT(N'INFO|rutas-existentes|', (SELECT COUNT(*) FROM dbo.rutas_vuelo));
        IF OBJECT_ID(N'dbo.vuelos',N'U') IS NOT NULL AND OBJECT_ID(N'dbo.estados_vuelo',N'U') IS NOT NULL
            SELECT CONCAT(N'INFO|vuelos-planificados-que-requeriran-ruta-aprobada-tras-V55|', (SELECT COUNT(*) FROM dbo.vuelos v JOIN dbo.estados_vuelo e ON e.id_estados_vuelo=v.id_estados_vuelo WHERE e.codigo_estado_vuelo=N'PLANIFICADO'));
    END;
END;
'@

$sqlcmd = Get-Command sqlcmd -ErrorAction SilentlyContinue
if (-not $sqlcmd) { throw 'No se encontro sqlcmd. Instale las herramientas SQL Server y repita la consulta.' }
$arguments = @('-S', $Server, '-d', $Database, '-b', '-C', '-h', '-1', '-W', '-Q', $query)
if ($env:MIGRATION_SQL_USERNAME) { $arguments += @('-U', $env:MIGRATION_SQL_USERNAME) }
else { $arguments += '-E' }

$output = & $sqlcmd.Source @arguments 2>&1
$sqlExit = $LASTEXITCODE
if ($sqlExit -ne 0) {
    $output | ForEach-Object { Write-Output $_ }
    throw "La consulta de prevalidacion fallo (sqlcmd exit $sqlExit). No se aplicaron cambios."
}
$currentLine = @($output | Where-Object { $_ -match '^INFO\|flyway-current\|' } | Select-Object -First 1)
$currentVersion = $null
if ($currentLine -and $currentLine[0] -match '^INFO\|flyway-current\|(-?\d+)$') { $currentVersion = [int]$Matches[1] }
$output | ForEach-Object { Write-Output $_ }

if ($null -ne $currentVersion) {
    $pending = @($versions | Where-Object { $_ -gt $currentVersion })
    if ($pending.Count) { Write-Output ("INFO|pending-migrations|" + (($pending | ForEach-Object { "V$_" }) -join ',')) }
    else { Write-Output 'INFO|pending-migrations|none' }
} else {
    Write-Output ("INFO|migration-files-target|V$targetVersion")
}

if (@($output | Where-Object { $_ -match '^ISSUE\|' }).Count -gt 0) { exit 2 }
exit 0
