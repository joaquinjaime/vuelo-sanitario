# Actualización y recuperación de SQL Server

## Estado vigente — actualización completada el 23-10-2026

**Habitual y E2E están en Flyway V47. La actualización habitual y el despliegue
fueron autorizados expresamente y terminaron con integridad y smoke aprobados.**
No hubo migraciones fallidas ni se necesitó restaurar V32. Los seis servicios
están saludables; frontend habitual accesible por su puerto normal 80.

### Respaldo recuperable sin el perfil Windows

FULL inmediato a la actualización:
`vuelos_sanitarios_v32_full_pre_v47_20261023_040011.bak`, SHA-256
`1EDF8375DC26227F1BDF2B3B03E8F3F1E7DF58D3F2FEE94C22858722258222B3`.
Se conserva en `C:\ProgramData\VuelosSanitarios\Backups`, junto a su copia cifrada
`.bak.aesgcm`; las claves portátiles permanecen separadas en
`C:\ProgramData\VuelosSanitarios\RecoveryKeys`, con permisos explícitos únicamente
para operador, SYSTEM y Administradores. La clave de ese FULL se llama
`vuelos_sanitarios_v32_full_pre_v47_20261023_040011.key` y contiene 32 bytes
aleatorios. No depende de DPAPI ni del usuario/perfil para descifrar. El control
de acceso al archivo sí exige autorización del sistema; un administrador puede
habilitar el acceso de otro operador sin necesitar secretos del perfil anterior.

Este formato AES-256-GCM autentica contenido y metadatos. Se comprobó la recuperación
desde Linux, la igualdad del SHA-256 y una restauración real en el SQL E2E existente,
con DBCC y comparación de datos/roles/historial. Una etiqueta alterada se rechazó.
No se eliminó ningún respaldo anterior. También hay TAR verificado y copia cifrada
del volumen de documentos del mismo punto sin escritores. La custodia actual es
local en el mismo equipo; no equivale a una copia fuera de ese equipo.

Para verificar o recuperar en otro usuario/equipo con PowerShell 7.4+ y .NET con
AES-GCM, trasladar por canales protegidos el archivo cifrado y la clave, manteniendo
su custodia separada y permisos restringidos. No mostrar ni pegar el contenido de
la clave en una consola, chat, argumento, Git o registro:

```powershell
$store = 'C:\ProgramData\VuelosSanitarios'
$name = 'vuelos_sanitarios_v32_full_pre_v47_20261023_040011'
./scripts/protect-sql-backup.ps1 -Mode Verify -KeyProtection PortableKeyFile `
  -InputPath "$store\Backups\$name.bak.aesgcm" `
  -KeyPath "$store\RecoveryKeys\$name.key"
./scripts/protect-sql-backup.ps1 -Mode Restore -KeyProtection PortableKeyFile `
  -InputPath "$store\Backups\$name.bak.aesgcm" `
  -KeyPath "$store\RecoveryKeys\$name.key" `
  -OutputPath "$store\Backups\recovered_v32_unique.bak"
```

`Restore` rechaza sobrescribir archivos. Verificar el hash anterior, después
`RESTORE VERIFYONLY WITH CHECKSUM` y restaurar con nombre nuevo antes de usarlo
en recuperación. El modo DPAPI sigue disponible y compatible para los respaldos
anteriores, que conservan su dependencia del perfil.

La recuperación alternativa en Linux usa `RecoverPortableSqlBackup.java`, Java 21
y Jackson del bundle validado. Las clases y dependencias ya compiladas están en
`C:\ProgramData\VuelosSanitarios\RecoveryTools`. En la comprobación realizada,
se montaron únicamente ciphertext y herramientas, con red deshabilitada, y la
clave se envió como una línea base64 por stdin en memoria. No se guardó una clave
temporal ni se incluyó en el entorno o argumentos del contenedor. El helper valida
GCM, tamaño y SHA-256 antes de crear el FULL recuperado.

### Release habitual activo y comprobaciones

Se utilizaron los IDs V47 de la tabla de artefactos que sigue; no hubo rebuild.
`.env` local contiene `BACKEND_RELEASE_IMAGE` y `FRONTEND_RELEASE_IMAGE` con esos
IDs, y las etiquetas normales locales se alinearon con esas mismas imágenes.
Para operar el release activo desde la raíz del repo:

```powershell
docker compose --env-file .env -p vuelos-sanitarios -f docker-compose.yml `
  -f docker-compose.release.yml config --quiet
docker compose --env-file .env -p vuelos-sanitarios -f docker-compose.yml `
  -f docker-compose.release.yml up -d --no-build --pull never --no-deps backend frontend
```

No imprimir la configuración expandida. No iniciar las imágenes V32 contra V47.
Se mantienen las imágenes V32 originales con sus IDs, TAR y etiquetas explícitas
`preserved-v32-20261023` para una recuperación de base y aplicación conjunta.

Resultados: V33–V47 aplicadas, 47 entradas exitosas y ninguna fallida; las 32
entradas previas intactas. DBCC CHECKDB/CHECKCONSTRAINTS aprobados, 42 tablas,
84 FK/30 CHECK confiables y habilitados. Conteos y hashes de columnas originales,
identidades y membresías SQL coincidieron con el FULL. Se preservaron 1 persona,
1 usuario, 5 roles y 1 asignación; vuelos, documentos, versiones, informes y
auditoría siguieron en 0. Las dos inserciones nuevas de catálogos y las tres tablas
nuevas vacías son los cambios de población previstos.

El smoke usó un puerto de loopback temporal y verificó HTML 200, login válido
con credenciales existentes 200, autenticación/permisos de lectura 200, anónimo
y login inválido 401 y rol insuficiente 403. Después se restableció puerto 80.
Los web E2E se reanudaron; todos los servicios saludables, diez volúmenes intactos,
sin nuevos motores SQL ni OOM. No se repitieron suites destructivas sobre habitual.

### Recuperación de esta ventana si fuera necesaria

Usar el FULL inmediato y las imágenes V32 registradas, con todos los escritores
detenidos y transacciones ajenas resueltas. Preservar antes la base fallida para
diagnóstico. El procedimiento SQL `WITH REPLACE` de la referencia siguiente
requiere el archivo exacto de esta ventana. **Este FULL se tomó con la base
READ_ONLY**: después de restaurar y validar V32, DBCC y datos, ejecutar
`ALTER DATABASE [vuelos_sanitarios] SET READ_WRITE WITH NO_WAIT;` antes de reabrir
la aplicación compatible. No revertir la contraseña SA rotada ni restaurar master.
Restaurar documentos del mismo punto si cambiasen; en esta ventana permanecieron
vacíos y no se escribieron durante el smoke.

Seleccionar los IDs V32 tanto en las variables del proceso como en las referencias
de `.env` antes de redeplegar, y alinear las etiquetas locales si se usan. Arrancar
backend V32, esperar salud y luego frontend V32. No arrancar servicios si falla
la restauración/verificación. El rollback preparado no se ejecutó porque la
actualización y aceptación V47 aprobaron. Una recuperación futura después de
reabrir escrituras exige acordar el punto y reconciliar datos posteriores al FULL.

## Referencia de preparación y autorización previa

El procedimiento siguiente documenta el estado antes de actualizar. Sus mensajes
de V32 y autorización pendiente son históricos; el estado vigente es V47.

## Procedimiento preparado el 23-10-2026

**Habitual: V32. E2E: V47. La autorización recibida para rotar SA ya se ejecutó;
no autoriza migrar el esquema habitual. Hace falta otra autorización explícita
posterior al preflight para ejecutar los pasos de actualización siguientes.**

Seguridad y preflight completados. La integración está publicada en `main`
mediante [PR #1](https://github.com/joaquinjaime/vuelo-sanitario/pull/1), merge
`d8e596a20ce596adcdb696f256550d3cded0f2ba`, con CI de rama y PR aprobado.
**CASO 1: preparado para actualizar; la actualización real no se ejecutó.**

### Artefactos verificados y destinos

Los archivos se conservan en `%USERPROFILE%\Backups\VuelosSanitarios`, fuera de
Git y con ACL restringida al operador, SYSTEM y Administradores. No se incorporan
datos reales, imágenes Docker ni claves al repositorio.

| Artefacto | SHA-256 |
|---|---|
| FULL original `vuelos_sanitarios_v32_full_20261023_023018.bak` | `6DF632E1AAF85B26A95E301A763B2EB45C0713C2C76AF0B6227ED976F8E1B32F` |
| FULL previo a rotar SA `vuelos_sanitarios_v32_full_pre_sa_rotation_20261023_032300.bak` | `7F389AD837BC06B2D7AEB5DA693F5FDB12870447EDA5F46809502670F4299AA5` |
| Imágenes V32 `habitual_v32_application_images_20261023.tar` | `5D75DA0DA238D7E32F1D4EBBD4839FABBEABAC3D245F52F23FED3F30B2E46DD4` |
| Imágenes V47 `v47_application_images_20261023.tar` | `6938A03D0CF0A499815A3E85F226DC725BAA8E51BD58F40FE1D320E46BA3F333` |
| Bundle `v47_flyway_bundle_20261023.zip` | `4AC10E255EB668C55BBCA97FFC47F50311B1E93876113122671C7181A914EBC1` |

IDs inmutables, para no depender de etiquetas movibles:

| Release | Backend | Frontend |
|---|---|---|
| V32 conservado | `sha256:baf1b7e054966d7b5f5be5323aa6f1ffba2c0a2436ffc4adf23d276d717a992a` | `sha256:91b0e79b2773d1681af5437de29a23a29571dcf153a43ccd32ce6f75c53d206d` |
| V47 preparado | `sha256:7b9101528503b9997d6fc7639668ac27aba41bf29442f575d110d585d345993f` | `sha256:9b2b0b6a661a4f464172587d4f1d10fcc1230264bc19348b0e60c7dfcd61b0ba` |

SQL habitual: proyecto `vuelos-sanitarios`, contenedor
`vuelos-sanitarios-sqlserver-1`, base `vuelos_sanitarios`, volumen
`vuelos-sanitarios_sqlserver_data`, red `vuelos-sanitarios_internal`.
Se preservan el volumen `documents_data`, los datos y la imagen SQL actual.
Los archivos físicos comprobados son `/var/opt/mssql/data/vuelos_sanitarios.mdf`
y `/var/opt/mssql/data/vuelos_sanitarios_log.ldf`; los nombres lógicos respectivos
son `vuelos_sanitarios` y `vuelos_sanitarios_log`.

### Recuperación del respaldo cifrado

Ambos FULL tienen archivo compañero `.bak.aesgcm`. AES-256-GCM autentica contenido
y metadatos. Las claves DPAPI CurrentUser están en
`%LOCALAPPDATA%\VuelosSanitarios\RecoveryKeys`. Para el FULL original, la clave
se llama `vuelos_sanitarios_v32_full_20261023_023018.dpapi`; para el segundo,
`vuelos_sanitarios_v32_full_pre_sa_rotation_20261023_032300.bak.dpapi`.
Las contraseñas SA no son claves de estos respaldos.

```powershell
$backupDir = Join-Path $env:USERPROFILE 'Backups\VuelosSanitarios'
$keyDir = Join-Path $env:LOCALAPPDATA 'VuelosSanitarios\RecoveryKeys'
$original = 'vuelos_sanitarios_v32_full_20261023_023018'
./scripts/protect-sql-backup.ps1 -Mode Verify `
  -InputPath (Join-Path $backupDir "$original.bak.aesgcm") `
  -KeyPath (Join-Path $keyDir "$original.dpapi")
./scripts/protect-sql-backup.ps1 -Mode Restore `
  -InputPath (Join-Path $backupDir "$original.bak.aesgcm") `
  -KeyPath (Join-Path $keyDir "$original.dpapi") `
  -OutputPath (Join-Path $backupDir 'recovered_v32_unique.bak')
```

`Restore` rechaza sobrescribir archivos. Compruebe SHA-256 y `RESTORE VERIFYONLY
WITH CHECKSUM`, después restaure con nombre nuevo y ejecute `DBCC CHECKDB`.
Ese circuito ya se ejecutó con el FULL original. El original válido se retiene.
DPAPI exige el mismo usuario/perfil Windows; conserve ese perfil y no anuncie
recuperación independiente de otro equipo sin preparar una custodia adicional.

### Preflight actual y repetición antes de la ventana

- SQL habitual ONLINE/V32, sin historial fallido y sin `ISSUE` en el diagnóstico
  de `scripts/prevalidate-migrations.ps1`; Flyway valida las 47 migraciones.
- Esquema habitual y restauración del FULL original: huella canónica idéntica
  de 652 líneas. La copia real migró V32→V47, sin fallos, con DBCC aprobado y
  conteos preservados. El fixture completo adicional aprobó las reglas V43–V47.
- Build V47 y smoke sobre la copia real V47: salud backend UP, HTML 200 y login
  inválido por el proxy 401. El manifest local `release_v47_manifest_20261023.json`
  identifica hashes, imágenes y commit de aplicación de origen `6d051a8`.
- La versión activa V32 contiene migraciones hasta V32 solamente. **No arranque
  la imagen V47 contra habitual para probarla antes de la autorización.**
- VM Docker: 3,45 GiB. Pausar los web E2E durante la ventana reduce competencia;
  no iniciar SQL adicionales. Confirmar salud, espacio, memoria y ausencia de OOM
  antes de seguir; no cambiar límites globales ni borrar volúmenes.

Para recuperar el bundle, compruebe el hash del ZIP y use `Expand-Archive` en una
carpeta nueva protegida. Debe contener `classes` y `libs`. No depende de Maven ni
de descargas durante la ventana; usa el JRE de la imagen V47 archivada.

```powershell
$bundle = Join-Path $backupDir 'recovered_v47_flyway_20261023'
Expand-Archive -LiteralPath (Join-Path $backupDir 'v47_flyway_bundle_20261023.zip') `
  -DestinationPath $bundle
$env:BACKEND_RELEASE_IMAGE = 'sha256:7b9101528503b9997d6fc7639668ac27aba41bf29442f575d110d585d345993f'
$env:FRONTEND_RELEASE_IMAGE = 'sha256:9b2b0b6a661a4f464172587d4f1d10fcc1230264bc19348b0e60c7dfcd61b0ba'
./scripts/invoke-prepared-flyway.ps1 -BundlePath $bundle `
  -RuntimeImage $env:BACKEND_RELEASE_IMAGE
docker compose --env-file .env -p vuelos-sanitarios -f docker-compose.yml `
  -f docker-compose.release.yml config --quiet
```

El helper valida por defecto, con migraciones pendientes permitidas. Lee el
login de aplicación desde el backend existente y lo pasa por entorno, nunca por
argumentos ni archivos temporales. El runner resuelve las 44 SQL y 3 Java.

### Actualización exacta — ejecutar solo después de la autorización pendiente

1. Registrar aprobación y comienzo de mantenimiento. Repetir el diagnóstico de
   lectura, versión V32, huella de esquema, salud, hashes y disponibilidad de los
   releases V32/V47. Si cambió el esquema o hay conflictos, detenerse y revisar.
2. Pausar backend/frontend E2E; detener frontend y backend habituales con
   `docker stop --timeout 30 vuelos-sanitarios-frontend-1 vuelos-sanitarios-backend-1`.
   Confirmar procesos detenidos, sin transacciones de usuario abiertas ni escritores
   externos. Mantener ambos web habituales detenidos hasta terminar verificaciones;
   el frontend V32 no queda accesible mientras cambia el backend/esquema.
3. Tomar **otro** FULL inmediato `COPY_ONLY,CHECKSUM,COMPRESSION` de habitual con
   nombre único, `RESTORE VERIFYONLY WITH CHECKSUM`, copia al directorio protegido,
   SHA-256 y `protect-sql-backup.ps1 -Mode Protect` seguido de `-Mode Verify`.
   Recuperar y restaurar con nombre temporal en el SQL E2E existente; ejecutar
   DBCC. Nunca sustituir este FULL de ventana por un snapshot anterior. Registrar
   conteos exactos por tabla y snapshot de documentos con escritores detenidos.
4. Aplicar las 15 migraciones con los web habituales detenidos:

   ```powershell
   ./scripts/invoke-prepared-flyway.ps1 -BundlePath $bundle `
     -RuntimeImage $env:BACKEND_RELEASE_IMAGE -Mode Migrate `
     -HabitualMigrationExplicitlyAuthorized
   ```

   El switch representa la autorización humana recibida para esa ventana; no la
   otorga. El helper también exige ambos web detenidos. No ejecutar `repair`, no
   editar historial ni modificar migraciones ya aplicadas si algo falla.
5. Comprobar Flyway V47 y cero fallidas, DBCC CHECKDB/CHECKCONSTRAINTS, conteos
   antes/después y cambios esperados de catálogos, relaciones sin huérfanos, FK y
   CHECK confiables/habilitados, índices V47 y trigger V46. No inyectar fixtures
   ni ejecutar E2E destructivos sobre habitual.
6. Arrancar primero el backend V47, con imagen fija y sin ejecutar db-init:

   ```powershell
   docker compose --env-file .env -p vuelos-sanitarios -f docker-compose.yml `
     -f docker-compose.release.yml up -d --no-build --pull never --no-deps backend
   docker exec vuelos-sanitarios-backend-1 curl --fail --silent http://127.0.0.1:8080/actuator/health
   ```

   Esperar salud UP/healthy, revisar arranque y lecturas acordadas. Arrancar
   frontend solo después:

   ```powershell
   docker compose --env-file .env -p vuelos-sanitarios -f docker-compose.yml `
     -f docker-compose.release.yml up -d --no-build --pull never --no-deps frontend
   ```

7. Verificar HTML/API/proxy, permisos y sesiones existentes mediante smoke de
   lectura; mantener la ventana hasta aceptar integridad y salud. Reabrir accesos
   y restaurar web E2E. Registrar versión V47, imágenes, hashes, salud, memoria y
   ausencia de OOM. Conservar evidencias y el FULL anterior a la migración.

### Recuperación exacta si falla la ventana

Mantener web detenidos. Guardar evidencia de la base fallida; no descartarla sin
capturar backup/diagnóstico. Recuperar el FULL inmediato verificado (descifrar si
corresponde), copiarlo al directorio de backup del SQL habitual y volver a
verificarlo. Elegir con el responsable restauración completa o corrección hacia
adelante revisada. Para restauración aprobada, con escritores detenidos y destino
comprobado, la secuencia SQL es:

```sql
USE master;
ALTER DATABASE [vuelos_sanitarios] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
-- Sustituir por el FULL exacto y comprobado de esa ventana.
RESTORE DATABASE [vuelos_sanitarios]
FROM DISK=N'/var/opt/mssql/backup/FULL_INMEDIATO_VERIFICADO.bak'
WITH REPLACE, CHECKSUM, RECOVERY,
 MOVE N'vuelos_sanitarios' TO N'/var/opt/mssql/data/vuelos_sanitarios.mdf',
 MOVE N'vuelos_sanitarios_log' TO N'/var/opt/mssql/data/vuelos_sanitarios_log.ldf';
ALTER DATABASE [vuelos_sanitarios] SET MULTI_USER;
```

`WITH REPLACE` es destructivo y se reserva a la recuperación decidida, nunca al
preflight. Si falla el restore, conservar mantenimiento y resolver el estado de
la base antes de arrancar servicios. Restaurar documentos del mismo punto si
corresponde. La base actual tenía 0 documentos y el volumen estaba vacío al
preflight; repetir la comprobación en la ventana. Preservar todos los volúmenes.

Verificar V32/DBCC/conteos y permisos; no restaurar `master` ni revertir la nueva
contraseña SA. Para recuperar imágenes ausentes, usar `docker image load --input`
con el TAR V32 cuyo hash se comprobó. Seleccionar los IDs V32 de la tabla anterior
en `BACKEND_RELEASE_IMAGE` y `FRONTEND_RELEASE_IMAGE`, y ejecutar los comandos
Compose anteriores (backend primero, frontend después de salud). Usar la `.env`
actual, con SA ya rotada. Si se permitieron escrituras después del FULL, acordar
su reconciliación antes de restaurar; no descartarlas silenciosamente.

### Credenciales y cierre

SA E2E usa `.env.e2e` ignorado y protegido; invocar su Compose con
`--env-file .env --env-file .env.e2e` y ambos YAML. SA habitual usa `.env` actual.
Los healthchecks/helpers usan SQLCMDPASSWORD, sin `-P` ni valores secretos en
argumentos. No imprimir `docker inspect` completo, Compose expandido ni entorno.
Los dos SA activos rechazaron la credencial anterior y aceptaron las nuevas;
SQL/backend/frontend volvieron saludables. La rotación conservó V32 habitual,
V47 E2E, imágenes y volúmenes. Los stacks antiguos detenidos requieren revisar
su configuración/rotar sus propios motores antes de reutilizarlos.

## Referencia histórica anterior al cierre operativo

Los apartados siguientes conservan el procedimiento y evidencia anteriores. El
procedimiento vigente de arriba prevalece: ahora hay cifrado de archivo verificado,
credenciales rotadas, restauración real y releases preparados.

## Alcance

El esquema se versiona con Flyway. La validación V32→V47 se ejecutó en SQL Server 2022 Developer, en una base sintética nueva con filas enlazadas de personas, usuarios, roles, pacientes, aeronaves, vuelos, tripulación, negociaciones, documentos/versiones, informes, obligaciones y auditoría. Esto no valida el contenido de una copia real de producción. La base habitual sigue en V32; antes de actualizarla se requiere una copia de seguridad verificada y una prevalidación sobre sus propios datos.

Las migraciones SQL Server no tienen necesariamente una operación inversa segura. No use `flyway undo`, restauraciones parciales ni cambios manuales para simular un rollback.

## Requisitos previos

- SQL Server 2022 y permisos para leer el esquema y aplicar las migraciones pendientes.
- Java 21, Maven, Node.js/npm para las suites locales; Docker Desktop para el entorno aislado.
- Una ventana de mantenimiento adecuada y un plan para pausar escrituras durante la copia, migración y verificación.
- Espacio para una copia `FULL`, los logs de transacciones y una restauración aislada de verificación.
- Identificación del nombre de base, versión Flyway, collation, zona horaria de negocio (`America/Argentina/Tucuman`) y versión de la aplicación desplegada.

No almacene contraseñas en el repositorio ni incluya `.env`, copias de bases o datos personales en el paquete de cambios.

## Prevalidación no destructiva

`scripts/prevalidate-migrations.ps1` solo ejecuta consultas. Informa la versión y migraciones pendientes, el historial fallido, duplicados de DNI y usuario, colisiones al normalizar DNI, varios informes vigentes por vuelo, asignaciones de tripulación repetidas, solapamientos temporales, objetos requeridos ausentes y restricciones deshabilitadas o no confiables.

En PowerShell, use credenciales disponibles solo para el proceso:

```powershell
$env:MIGRATION_SQL_USERNAME = 'usuario_lectura'
$env:SQLCMDPASSWORD = $env:MIGRATION_SQL_PASSWORD
.\scripts\prevalidate-migrations.ps1 -Server 'servidor,1433' -Database 'nombre_base'
Remove-Item Env:MIGRATION_SQL_USERNAME, Env:SQLCMDPASSWORD
```

El script devuelve código 2 si encuentra `ISSUE|...`; las advertencias requieren revisión. Su ausencia de hallazgos significa únicamente que pasaron los diagnósticos implementados: no certifica compatibilidad de cada dato ni sustituye la migración de ensayo, las pruebas de aplicación o la inspección del dominio. Corrija colisiones de identidad mediante una decisión humana; no fusione ni elimine filas automáticamente.

## Copia de seguridad verificada

1. Registre la hora, versión del motor, collation, recovery model, tamaño de base y log, último backup y versión Flyway.
2. Tome un backup `FULL` con checksum en almacenamiento protegido y con espacio suficiente. Mantenga la política de backups/logs necesaria para recuperación a un punto en el tiempo.
3. Compruebe el archivo con `RESTORE VERIFYONLY` y checksum.
4. Restaure ese backup con otro nombre en un SQL Server aislado. Compruebe conectividad, esquema, datos y una recuperación de ensayo.
5. Conserve la copia hasta completar la ventana de observación posterior al despliegue.

No conecte servicios ni integraciones externas a una restauración con datos reales. Si una autorización explícita permite usar el SQL E2E para un ensayo real, restaure en una base nueva y aislada, no inicie el backend contra ella, limite el acceso a operadores autorizados y elimine la copia temporal al terminar. La validación sintética del repositorio sigue siendo complementaria y no sustituye este ensayo.

## Ensayo reproducible V32→V47

Para una repetición local se necesitan Docker, Java/Maven, `sqlcmd` y credenciales de administrador de un SQL Server **aislado**. Cree primero una instancia/volumen nuevos; no reutilice los volúmenes de `vuelos-sanitarios` o `vuelos-sanitarios-e2e`. Exponga un puerto libre de loopback y seleccione un nombre de base único con prefijo `vuelos_validacion_migracion_v32_v47_`.

```powershell
$env:MIGRATION_SQL_USERNAME = 'sa'
$env:SQLCMDPASSWORD = $env:MIGRATION_SQL_PASSWORD
$env:MIGRATION_JDBC_PASSWORD = $env:SQLCMDPASSWORD
.\scripts\validate-migration-upgrade.ps1 `
  -Server 'tcp:127.0.0.1,14332' `
  -JdbcServer 'localhost:14332' `
  -Database 'vuelos_validacion_migracion_v32_v47_20261022_repeat'
Remove-Item Env:MIGRATION_SQL_USERNAME, Env:SQLCMDPASSWORD, Env:MIGRATION_JDBC_PASSWORD
```

El script se niega a reutilizar una base existente y nunca la elimina. Ejecuta Flyway hasta V32, carga `scripts/seed-migration-v32-fixture.sql`, migra a V47 y corre `scripts/verify-migration-v47-fixture.sql`. Mantiene la base para inspección si ocurre un error. Use otro nombre único en cada repetición y gestione por separado la retención de las bases sintéticas.

## Procedimiento de actualización

1. Confirme que la base objetivo está `ONLINE` en V32 y que el diagnóstico de solo lectura se ejecutó contra esa instancia y nombre exactos. Cualquier `ISSUE` debe resolverse mediante una decisión revisada; no borre ni fusione registros automáticamente.
2. Fije el release de backend y frontend que se desplegará. Compruebe que el backend contiene V33–V47, que `mvn -q test`, las pruebas relevantes de SQL Server, Vitest y el build de producción pasan, y que el frontend es compatible con esos contratos. Registre los commits y artefactos de los releases actual y propuesto para poder redeplegar el anterior.
3. Confirme espacio para backup, log, datos y restauración; acceso a almacenamiento cifrado; autorización operativa; y disponibilidad del backup restaurable y del ensayo V32→V47. Detenga el cambio si algún requisito falla.
4. Abra una ventana de mantenimiento. Bloquee escrituras de usuarios, APIs, tareas programadas e integraciones externas con el procedimiento operativo aprobado. Mantenga las escrituras pausadas mientras se toma el backup, migra y verifica; coordine los documentos externos asociados para preservar consistencia.
5. Tome en ese momento un backup SQL Server `FULL` con `CHECKSUM` en almacenamiento cifrado y protegido. No use el backup de este ensayo como sustituto. Registre hora, tamaño, SHA-256, versión SQL y Flyway; ejecute `RESTORE VERIFYONLY WITH CHECKSUM`, revise el encabezado y no continúe si falla.
6. Con escrituras detenidas y una sola instancia de backend autorizada para arrancar, aplique el release que contiene las migraciones. Flyway ejecuta V33–V47 en orden al iniciar; no altere archivos históricos ya aplicados ni modifique manualmente `flyway_schema_history`.
7. Siga la salida de Flyway y del backend. Si falla una migración, detenga la actualización, preserve logs y base para diagnóstico y no ejecute `repair` ni repita scripts manualmente.
8. Confirme V47 sin migraciones fallidas; ejecute `DBCC CHECKDB` y `DBCC CHECKCONSTRAINTS WITH ALL_CONSTRAINTS`; valide claves foráneas, índices, triggers, conteos, identidades, relaciones, permisos, auditoría y salud del backend. Ejecute smoke/E2E seleccionados sin notificaciones ni efectos externos.
9. Reanude APIs, usuarios e integraciones únicamente después de aceptar las comprobaciones. Observe errores y salud durante la ventana posterior y conserve backup, hashes y resultados como evidencia.
10. Si una migración o comprobación falla, mantenga el bloqueo de escrituras y aplique el procedimiento de recuperación siguiente. No reanude hasta que la base y los releases de aplicación vuelvan a ser compatibles y la persona responsable acepte la recuperación.

## Verificación posterior específica para V32→V47

- Flyway en V47 y sin fila de migración fallida.
- Claves foráneas y `CHECK` habilitados y confiables; `DBCC CHECKCONSTRAINTS WITH ALL_CONSTRAINTS` sin violaciones.
- Sin pérdida de filas/identidades y sin referencias huérfanas.
- Un único informe vigente por vuelo y una única asignación vigente por vuelo/tripulante.
- Índices únicos filtrados de DNI y nombre de usuario habilitados.
- Trigger de auditoría habilitado y rechaza `UPDATE`/`DELETE`.
- Transición de estado sanitaria coherente y baja administrativa histórica solo completada con evidencia de auditoría.
- Fechas históricas de auditoría conservadas; V46 no las reescribe.

## Recuperación ante errores

Flyway no garantiza que el esquema se pueda revertir con SQL inverso. Si falla una migración o la verificación posterior:

1. Mantenga la aplicación en mantenimiento y evite escrituras nuevas.
2. Capture logs, versión Flyway y estado de esquema; preserve la base fallida para análisis.
3. Con la persona responsable, decida entre una corrección hacia adelante revisada o recuperar la copia completa verificada. Flyway no proporciona rollback automático fiable.
4. Para recuperar, confirme instancia, base, backup y cadena de logs; mantenga escrituras bloqueadas y restaure el backup `FULL` más los logs aprobados al punto acordado. No sobrescriba otra base ni restaure una copia sintética sobre el entorno habitual.
5. Redepliegue el backend y frontend registrados antes del cambio, compatibles con V32. Si hubo escrituras posteriores al backup, no las descarte: acuerde reconciliarlas antes de reabrir el servicio. Coordine también los documentos almacenados fuera de SQL Server.
6. Verifique V32, `DBCC CHECKDB`, permisos, API y frontend con ese release; documente el resultado y mantenga bloqueadas las escrituras hasta la aceptación operativa.

### Condiciones para detener la ventana

Detenga el cambio si la versión no es V32, aparece cualquier conflicto de prevalidación, no puede restaurarse el backup inmediato, no se confirma almacenamiento cifrado y protegido, faltan los artefactos de código compatibles, no es posible bloquear todas las escrituras/integraciones, hay falta de espacio o memoria, un servicio está inestable, Flyway falla o una verificación posterior detecta pérdida, huérfanos o cambios no explicados.

## Limitaciones conocidas

- Registro de esta consolidación (22-10-2026): la consulta de prevalidación estrictamente de lectura sobre la base habitual `vuelos_sanitarios` informó V32, 15 migraciones pendientes y ningún `ISSUE` en los diagnósticos implementados. No devolvió ni copió filas individuales, no creó una copia y no ejecutó migraciones allí.
- Registro del ensayo sintético: la reconstrucción desde migraciones llegó a V32; con filas sintéticas, Flyway aplicó V33–V47 y `DBCC CHECKCONSTRAINTS` no informó violaciones. La verificación cubrió reglas seleccionadas, no reemplaza una copia de ensayo de datos reales.
- Una base reconstruida desde migraciones no refleja extensiones manuales, collation, triggers externos, historial de datos ni desviaciones de una base instalada hace tiempo.
- El registro del 22-10-2026 no demostraba compatibilidad de los datos reales. El ensayo real del 23-10-2026, documentado abajo, sí migró la copia V32; el snapshot no tenía filas de vuelos, pacientes, aeronaves, documentos, informes ni auditoría, por lo que esos backfills siguen cubiertos por fixtures sintéticos.
- V45 considera vigentes las filas de tripulación preexistentes porque V32 no tenía campos que demostraran una baja histórica. No se inventa historia de retiros.
- V47 conserva identidades; si hay duplicados los índices fallan y la intervención debe decidirla un responsable de datos.
- V46 conserva la interpretación/almacenamiento de eventos históricos y los hace inmutables en SQL Server; los consumidores deben tolerar JSON histórico sin valores anteriores/posteriores.
- La zona civil de las operaciones es `America/Argentina/Tucuman`; `DATETIME2` de vuelos/solicitudes representa hora civil donde así se define, mientras que `fecha_ocurrencia` de auditoría se almacena en UTC.

### Incidente de entorno E2E del 22-10-2026

La consulta de contenedores devolvió HTTP 500 desde Docker Desktop y el CLI agotó más de 30 segundos. Los logs locales de Docker registraron un `global_oom` que terminó `sqlservr`, seguido por el timeout del healthcheck y fallos de comunicación con el daemon Linux (`192.168.65.7:2376`). Esto indica que el SQL Server no quedó vivo para responder: no es evidencia de que `sqlcmd` haya rechazado un servidor sano. La presión de memoria en la VM coincide con varios SQL Server concurrentes y aproximadamente 854 MB libres en Windows al tomar la muestra, aunque el estado final individual de los contenedores no pudo recuperarse cuando el daemon dejó de responder.

No reinicie el motor global ni ejecute prune/reset como respuesta automática. Primero recupere Docker Desktop mediante el procedimiento operativo que proteja el stack habitual; luego liste e identifique explícitamente los recursos con prefijos `vuelos-sanitarios-e2e-validation` y `vuelos-validacion-migracion` antes de intervenir. No borre sus volúmenes. Después de recuperar el daemon, verifique SQL con `sqlcmd` y health status antes de iniciar backend/frontend. Los logs de OOM hacen necesario reducir la competencia por memoria o asignar recursos suficientes a Docker antes de repetir los E2E; ampliar únicamente el timeout del healthcheck no corrige una terminación por OOM.

## Seguimiento de recuperación E2E — 22-10-2026

Se identificó el `global_oom` en el SQL E2E preexistente durante una sesión con varios SQL Server en la VM de Docker Desktop. Windows reportó 7,24 GiB visibles y entre 0,54–0,81 GiB libres durante la validación. La VM WSL/Docker tenía 3,45 GiB y swap de 1 GiB usada; el motor SQL nuevo, sin cgroup cap, reinició siete veces y terminó en salida 137. La versión de SQL E2E es SQL Server 2022 CU27, build 16.0.4295.3. No se aplicaron límites de memoria especulativos: el mínimo publicado de arranque de SQL Server Linux es 2 GiB y no se demostró margen para un tercer motor. Se mantuvieron intactos `.wslconfig`, Docker Desktop, SQL habitual y sus volúmenes.

Se reutilizó la instancia E2E estable con una red dedicada y bases nuevas con sufijo `_a` a `_d`. Se detuvo sólo el backend/frontend E2E original mientras se validaba y luego se restauraron; al cierre el backend E2E original y frontend estaban saludables, el SQL E2E saludable y sin reinicios durante la validación. El backend/frontend de validación están detenidos y no se borraron; el SQL de validación quedó detenido, con volumen retenido. La instancia SQL habitual no recibió escrituras ni reinicios.

Las cinco suites Chrome pasaron en serie: solicitudes 5/5, aeronaves y tripulación 6/6, auditoría 10/10, usuarios 9/9, cierre 6/6. La suite de cierre API pasó 13 bloques en la base E2E persistente porque usa cuatro informes históricos auditados de fixture; el bloqueo documental de 30 minutos se liberó inmediatamente al desactivar a su propietario y pudo adquirirlo otro operador. La suite API de usuarios pasó 12 bloques en `_d`, incluyendo dos carreras reales de baja del último administrador con resultado único 200/409. No se redujeron afirmaciones de las pruebas. Build frontend pasó; las 300 pruebas backend y 100 frontend estaban aprobadas en el registro anterior. No se creó V48.

Auditoría: la base E2E persistente terminó con 11.017 eventos, 2.184 `FLIGHT`. La consulta filtrada de 100 filas tuvo calentamiento HTTP 2.001,6 ms y siete consultas calientes de 136,8–237,7 ms (mediana 186,4 ms); segunda ejecución, mediana 94,6 ms. El umbral fijo de 5.000 ms se cumple en la medición comparable. Query Store mostró el plan paginado con media 57,19 ms / máximo 284,65 ms en 16 ejecuciones y CPU media 57,07 ms. No existe correlación exacta por request entre esos agregados y HTTP; faltan tiempos separados de conexión, conteo, paginado, autorización, DTO y serialización. Outliers Query Store de 119,6 s/168,0 s en una ventana anterior confirman que existieron ejecuciones lentas, pero no identifican por sí solos la causa única de los 26.972 ms anteriores. La menor carga de SQL y ausencia de OOM coincidieron con las respuestas actuales rápidas, sin demostrar causalidad exclusiva.

Script repetible de medición HTTP (solo lectura) añadido en `scripts/measure-e2e-audit.cjs`. Ver detalle de infraestructura, muestras, criterios y limitaciones en `docs/CONSOLIDACION_V32_V47.md`. La estabilización queda abierta únicamente para el diagnóstico por capa de la demora original; no se declara cerrada la atribución completa.

## Procedimiento de recuperación y evidencias pendientes (23-10-2026)

La inspección de esta etapa no localizó `.bak`/`.trn` en los archivos del workspace y no demostró que el backup habitual sea restaurable. Antes de solicitar la ventana, ubique el backup en su repositorio protegido, compruebe checksum y encabezado, restaure con nombre/instancia aislados, ejecute `DBCC CHECKDB`, confirme V32 y pruebe arranque de la versión de aplicación compatible. Conserve la copia original, documentos externos y evidencia de conteos. No use la base habitual como ensayo.

En la ventana autorizada: detener escrituras de aplicación según el plan aprobado, tomar un backup FULL consistente y registrar recuperación/log, versión SQL, Flyway y código; confirmar espacio de datos/log; aplicar Flyway en orden V33–V47 una sola vez; detener si cualquier migración falla, hay conflicto de datos, OOM, falta de espacio o salud inestable. No reparar manualmente `flyway_schema_history`. Tras la migración, validar integridad referencial/checks, comparativas de conteo y distribución de informes/estados, API, frontend, permisos, auditoría y logs. Si falla, mantener escrituras detenidas y restaurar backup FULL más la cadena de logs al punto decidido con la versión compatible del código; acordar explícitamente el tratamiento de datos escritos desde el backup. No revertir parcialmente migraciones mediante SQL improvisado.

La operación sobre la base habitual continúa prohibida en esta etapa. El backup y ensayo real descritos abajo completan la evidencia de recuperación y migración para el snapshot observado; no sustituyen la nueva copia verificada ni la pausa de escrituras de la futura ventana.

### Ensayo sobre una restauración real — 23-10-2026

- Se confirmó `vuelos_sanitarios` `ONLINE`, `FULL` y Flyway V32 mediante consultas de solo lectura. El SQL E2E existente estaba saludable y su base persistente quedó en V47.
- Se creó `vuelos_sanitarios_v32_full_20261023_023018.bak` con `COPY_ONLY`, `CHECKSUM` y `COMPRESSION`, a las 02:30:20 (UTC−03). El backup mide 3.649.536 bytes. `RESTORE VERIFYONLY WITH CHECKSUM` pasó y el encabezado confirmó un backup `FULL` de `vuelos_sanitarios`. El archivo conservado está fuera del repositorio, en la carpeta local protegida `Backups/VuelosSanitarios`; SHA-256: `6DF632E1AAF85B26A95E301A763B2EB45C0713C2C76AF0B6227ED976F8E1B32F`.
- La carpeta tiene ACL explícita para el usuario operador, SYSTEM y Administradores. SQL Server no tenía un certificado de cifrado de backup configurado; Windows 11 Home no ofrece EFS en este equipo y la consulta de BitLocker requirió elevación administrativa no disponible. Por ello, el archivo está protegido por ACL pero no se confirmó cifrado del volumen. No se añadió una clave ni un certificado a la base habitual o al repositorio.
- El archivo copiado fuera del contenedor conservó el mismo SHA-256, volvió a pasar `RESTORE VERIFYONLY` en el SQL E2E y se restauró realmente bajo `vuelos_sanitarios_restore_v32_validacion_20261023`. La restauración quedó `ONLINE`, Flyway V32 y 39 tablas. `DBCC CHECKDB` no encontró errores.
- El login de aplicación se remapeó solo en la copia restaurada para usar el ejecutor de migraciones ya disponible en la red aislada. Ningún backend ni frontend se conectó a esa base; no se enviaron notificaciones ni acciones externas. La base y las copias intermedias del `.bak` dentro de los volúmenes se eliminaron al terminar. El único backup retenido es el archivo local protegido descrito arriba.
- Flyway validó 47 migraciones y aplicó V33–V47 (15 migraciones) sobre la copia. Llegó a V47 sin fallos. Se compararon conteos agregados; usuarios/personas se conservaron (1 usuario activo, 0 inactivos y 1 persona), al igual que los ceros de pacientes, aeronaves, vuelos, tripulantes, documentos, versiones, informes y auditoría. El esquema pasó de 39 a 42 tablas; las claves foráneas de 65 a 84 y los `CHECK` de 23 a 30, todos habilitados y confiables. Los catálogos de estados crecieron de 4 a 5 estados sanitarios y de 7 a 8 estados de vuelo. Las tablas y estados añadidos corresponden a V33–V47.
- Después de migrar, `DBCC CHECKDB` y `DBCC CHECKCONSTRAINTS WITH ALL_CONSTRAINTS` terminaron sin errores ni violaciones; las ocho relaciones críticas revisadas no tuvieron huérfanos. El trigger de auditoría estuvo habilitado y bloqueó `UPDATE` y `DELETE` en pruebas transaccionales revertidas; la tabla quedó con cero eventos.
- La copia era real, pero el snapshot era escaso: no contenía vuelos, pacientes, aeronaves, documentos, versiones, informes ni eventos de auditoría. Por eso el ensayo demuestra restauración y migración del estado real observado, no cubre el backfill de registros de esos dominios. Mantenga las pruebas sintéticas enlazadas de la consolidación como cobertura complementaria.

La base habitual permaneció en V32 durante toda la intervención. El backup de esta fecha no reemplaza el backup FULL que se debe tomar y verificar inmediatamente antes de una futura ventana. Antes de esa ventana también debe revisarse el estado de cifrado del almacenamiento con un operador administrador; detener si no se dispone del backup verificado, si la versión no es V32, si reaparecen conflictos de prevalidación o si el ensayo representativo disponible deja de corresponder a los datos actuales.

La consolidación de código y el estado de publicación en GitHub se registran en [CONSOLIDACION_V32_V47.md](./CONSOLIDACION_V32_V47.md).

### Reconfirmación de evidencia (23-10-2026)

La consulta de solo lectura confirmó Flyway V32 en `vuelos_sanitarios`; el SQL E2E persistente confirmó V47 y cero migraciones fallidas. Se inspeccionó el workspace y el directorio de backup configurado por SQL Server (`/var/opt/mssql/data`): no se encontró `.bak` ni `.trn`. No se ejecutó `RESTORE VERIFYONLY` ni se intentó una restauración sin archivo candidato. El SQL E2E se reutilizó para ejecutar código y suites funcionales; no se presentó esa instancia ni sus fixtures como copia representativa de la base habitual. La aplicación quedó validada y habilitada para nuevas implementaciones, mientras que la preparación de la actualización habitual permanece condicionada a un backup real, checksum/encabezado válidos, restauración aislada y `DBCC CHECKDB`.
