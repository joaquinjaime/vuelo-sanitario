# Actualización y recuperación de SQL Server

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

1. Confirme que la prevalidación se hizo contra la base correcta y que cualquier `ISSUE` fue resuelto y revisado.
2. Confirme que el backup se puede restaurar y que existe una restauración de ensayo satisfactoria.
3. Detenga o pause las escrituras de la aplicación con el procedimiento operativo aprobado. No aplique la migración mientras cambian los datos que se validaron.
4. Aplique la versión de backend que contiene las migraciones requeridas. Flyway ejecuta en orden las migraciones pendientes al iniciar la aplicación; no altere archivos históricos ya aplicados.
5. Observe la salida de Flyway y del backend. Ante error, detenga la actualización, conserve logs/esquema y no ejecute `repair` ni repita scripts manualmente sin diagnóstico.
6. Confirme la versión Flyway esperada, las migraciones exitosas, el estado saludable de backend y una verificación SQL de claves foráneas y restricciones.
7. Compare conteos, identidades y relaciones acordados, compruebe restricciones/índices/triggers, recorra pruebas E2E seleccionadas y revise autenticación/autorización.
8. Reanude las escrituras solo después de aceptar las verificaciones y conservar evidencia de la ventana.

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
3. Decida entre reparar hacia adelante con una migración correctiva revisada o recuperar la copia completa verificada.
4. Para restaurar, use el procedimiento de SQL Server aprobado: ponga la base objetivo en mantenimiento, restaure el backup `FULL` y los logs requeridos hasta el punto decidido, verifique el estado restaurado y vuelva a validar aplicación y permisos.
5. No sobrescriba una base sin confirmar nombre/instancia/backup, ni restaure una copia sintética sobre un entorno real. La restauración debe mantener consistentes la base y los documentos externos almacenados por la aplicación.
6. Registre el resultado y mantenga bloqueadas las escrituras hasta la aceptación operativa.

## Limitaciones conocidas

- Registro de esta consolidación (22-10-2026): la consulta de prevalidación estrictamente de lectura sobre la base habitual `vuelos_sanitarios` informó V32, 15 migraciones pendientes y ningún `ISSUE` en los diagnósticos implementados. No devolvió ni copió filas individuales, no creó una copia y no ejecutó migraciones allí.
- Registro del ensayo sintético: la reconstrucción desde migraciones llegó a V32; con filas sintéticas, Flyway aplicó V33–V47 y `DBCC CHECKCONSTRAINTS` no informó violaciones. La verificación cubrió reglas seleccionadas, no reemplaza una copia de ensayo de datos reales.
- Una base reconstruida desde migraciones no refleja extensiones manuales, collation, triggers externos, historial de datos ni desviaciones de una base instalada hace tiempo.
- El ensayo sintético no demuestra que los datos reales sean compatibles. La prevalidación de la base habitual en V32 solo encontró cero conflictos dentro de las consultas implementadas; no se hizo una copia ni se aplicaron migraciones allí.
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

### Reconfirmación de evidencia (23-10-2026)

La consulta de solo lectura confirmó Flyway V32 en `vuelos_sanitarios`; el SQL E2E persistente confirmó V47 y cero migraciones fallidas. Se inspeccionó el workspace y el directorio de backup configurado por SQL Server (`/var/opt/mssql/data`): no se encontró `.bak` ni `.trn`. No se ejecutó `RESTORE VERIFYONLY` ni se intentó una restauración sin archivo candidato. El SQL E2E se reutilizó para ejecutar código y suites funcionales; no se presentó esa instancia ni sus fixtures como copia representativa de la base habitual. La aplicación quedó validada y habilitada para nuevas implementaciones, mientras que la preparación de la actualización habitual permanece condicionada a un backup real, checksum/encabezado válidos, restauración aislada y `DBCC CHECKDB`.
