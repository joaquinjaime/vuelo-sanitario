# Consolidación V32–V47

**Fecha:** 22-10-2026
**Alcance:** migraciones, integridad relacional, regresión, seguridad, concurrencia, tiempos y empaquetado.

## Resultado ejecutivo

La cadena Flyway se reconstruyó hasta V32 y se migró a V47 con SQL Server 2022 en dos bases nuevas con fixtures sintéticos. Ambas ejecuciones aplicaron V33–V47 sin errores y pasaron las verificaciones de datos, restricciones, claves foráneas e invariantes seleccionadas. La base habitual `vuelos_sanitarios` permaneció en V32: solo se consultó en modo de lectura; no se copiaron datos reales ni se ejecutaron migraciones allí.

La validación respalda la migración sobre el esquema reconstruido y los casos cubiertos. No equivale a migrar una copia de datos reales ni certifica compatibilidad con personalizaciones locales desconocidas. Antes de actualizar la base habitual, se necesita backup restaurable, ensayo de restauración y revisión de la evidencia de prevalidación. El procedimiento está en [ACTUALIZACION_BD_Y_RECUPERACION.md](./ACTUALIZACION_BD_Y_RECUPERACION.md).

## Migraciones e integridad

| Tramo | Ejecución | Verificaciones |
|---|---|---|
| Historial hasta V32 | Flyway aplicó 29 migraciones en una base vacía | Esquema de referencia V32 |
| V32→V47 | 15 migraciones aplicadas, dos veces, en bases nuevas distintas | Sin fallos Flyway; V47 vigente |
| Datos enlazados | Fixtures de persona, usuario/roles, paciente, aeronave, aeropuertos, vuelos sanitarios/operativos, tripulación, negociación, documentos/versiones, informes/obligaciones y auditoría | Conteos previstos y relaciones preservados; restricciones confiables y habilitadas |
| Integridad | `DBCC CHECKCONSTRAINTS WITH ALL_CONSTRAINTS` | Sin violaciones; claves foráneas y CHECK activos/confiables |
| Reglas críticas | Pruebas transaccionales reversibles en la base sintética | Auditoría rechaza UPDATE/DELETE; V44 bloquea reversiones terminales; V45 permite historial y una asignación vigente; V47 rechaza DNI y usuario duplicados |

Las brechas V16, V17 y V26 son parte del historial existente: Flyway reconoce 29 migraciones hasta V32 y 44 archivos en el conjunto actual. V44–V47 no requieren renumerar identidades. V44 canceló la solicitud sanitaria sintética enlazada a un vuelo cancelado. V43 preservó un informe incierto como histórico sin evidencia, sin inventar una decisión. V47 completó la responsabilidad de una baja solo cuando había evidencia de auditoría.

## Prevalidación de la base habitual

`scripts/prevalidate-migrations.ps1` se ejecutó con un usuario de solo lectura sobre `vuelos_sanitarios`. Reportó versión 32, 15 migraciones pendientes y ningún `ISSUE` en las consultas implementadas: duplicados y colisiones de DNI normalizado, nombres de usuario duplicados bajo collation, múltiples informes vigentes, duplicados/superposiciones de tripulación, solapamientos de recursos, requisitos de migración ausentes, restricciones no confiables/deshabilitadas, triggers apagados y estados de coordinación inválidos.

La consulta no devolvió filas individuales, no creó una copia y no modificó la base. “Sin ISSUE” se limita a esos diagnósticos; no reemplaza un ensayo sobre una restauración de los datos reales.

## Pruebas de aplicación y despliegue

- Backend: `mvn -q test` terminó correctamente; informes Surefire: 300 pruebas, cero fallas, errores o skips.
- Frontend: Vitest, 9 archivos y 100 pruebas aprobadas; `npm run build` aprobó.
- Docker: imágenes de backend/frontend construidas con Compose y configuración validada. El proxy Nginx respondió por la ruta API; credenciales sintéticas inválidas recibieron HTTP 401 esperado.
- Persistencia: un E2E reinició solo el backend del stack `vuelos-sanitarios-e2e`; se comprobó que los estados, negociaciones, cancelaciones, auditoría y notificaciones se recuperaron sin duplicados.
- La API E2E usa SQL Server real aislado. Los tests JUnit de integración usan H2; no se consideran evidencia equivalente a SQL Server.
- E2E de solicitudes: 11 bloques aprobados, incluidos concurrencia, rollback, reinicio y medianoche en Tucumán.
- E2E de aeronaves/tripulación: 13 bloques aprobados, incluidos cinco escenarios de carreras SQL Server, baja lógica, auditoría y atomicidad. Se afinó una comprobación de fixture para medir disponibilidad de los candidatos sintéticos del caso; el listado de la base persistente puede incluir otros usuarios de pruebas ya asignados.
- E2E de cierre: 13 bloques aprobados, incluidos finalización concurrente, informes PDF/versiones, vencimiento exacto de 48 horas, bloqueos y reinicio.
- E2E de auditoría: los bloques de fechas, paginación/filtros, permisos por perfil, sanitización, inmutabilidad y atomicidad pasaron. El chequeo final midió 26.972 ms para una consulta filtrada de 100 eventos cuando la tabla tenía 10.358 filas; el umbral del test es 5.000 ms, así que la suite **no pasó completa**. Se conserva como hallazgo de rendimiento; no se aumentó el umbral.
- E2E de usuarios: el primer intento se detuvo en su precondición de concurrencia. La base E2E persistente tenía 25 administradores activos antes del fixture secundario y la aserción esperaba dos. Para repetir el escenario sin debilitar la regla, se preparó un stack E2E limpio con proyecto, volumen y puertos independientes; su repetición queda pendiente de que Docker Desktop vuelva a estar disponible.

Los E2E de interfaz con Playwright no se ejecutaron: no hay dependencia Playwright instalada en el proyecto. Los scripts Python históricos tampoco se ejecutaron porque el intérprete Python no está disponible en este entorno.

### Scripts históricos y contratos

- Los E2E API que ejercitan negociación envían `propuestaId` numérico.
- No se encontró el identificador `UUID` en los scripts bajo `scripts/`.
- Los scripts históricos `scripts/e2e_*.py` se conservaron; no se ejecutaron porque no hay intérprete Python disponible.
- Los E2E de UI (`scripts/e2e-*-ui.cjs`) no se ejecutaron porque `playwright` no está instalado en `frontend-react` ni figura en sus dependencias. No se clasificaron como obsoletos solo por esa limitación. Los contratos históricos que no pudieron ejecutarse siguen pendientes de revisión dinámica.

## Controles evaluados y límites

| Área | Evidencia disponible | Límite/observación |
|---|---|---|
| V44 solicitudes y negociación | Migración sintética, integridad y E2E de solicitudes | La prueba sobre datos reales requeriría una restauración aislada |
| V45 tripulación | Índice filtrado e historial sintético; E2E de asignaciones | V32 no registra bajas históricas; filas previas se interpretan como vigentes |
| V46 auditoría | Trigger probado contra UPDATE/DELETE; cobertura unitaria/E2E | Eventos históricos conservan fechas y formatos; consumidores deben admitir valores anteriores/posteriores nulos |
| V47 identidades y bajas administrativas | Índices únicos y backfill sintético con evento de auditoría | No se fusionan duplicados; colisiones requieren decisión de responsable de datos |
| Concurrencia | Casos JUnit y API E2E para asignaciones, respuestas, bajas y permisos | Resultado cubre escenarios escritos, no carga de producción |
| Tiempo | Zona civil `America/Argentina/Tucuman`; auditoría en UTC | `DATETIME2` de vuelos/solicitudes es hora civil por contrato |
| Docker | Build y stack E2E existente; configuración de un overlay para proyecto/puertos limpios | El SQL Server del stack limpio quedó en `health: starting`; Docker Desktop devolvió HTTP 500 al consultar contenedores. No se completó ese arranque ni la repetición de usuarios |

## Archivos agregados para la consolidación

- `scripts/FlywayMigrationRunner.java`: ejecutor de migraciones de ensayo.
- `scripts/validate-migration-upgrade.ps1`: crea/usa solo una base nueva indicada y nunca la elimina.
- `scripts/seed-migration-v32-fixture.sql` y `scripts/verify-migration-v47-fixture.sql`: fixture sintético V32 y verificaciones V47.
- `scripts/prevalidate-migrations.ps1`: prevalidación estrictamente de lectura.
- `docs/ACTUALIZACION_BD_Y_RECUPERACION.md`: runbook, backup, restauración, actualización y limitaciones.
- `docs/CONSOLIDACION_V32_V47.md`: resultados y riesgos de esta consolidación.
- `docker-compose.e2e.validation.yml` y la selección de proyecto/base/API por variables en `scripts/e2e-cierre-support.cjs`: permiten dirigir E2E a un stack limpio sin cambiar los destinos por defecto.

Los cambios de aplicación, documentación funcional y E2E preexistían como cambios locales al comenzar este trabajo; se conservaron. No se hizo commit ni push y no se prepararon cambios en el índice de Git. El inventario completo está disponible con `git status --short`.

## Recomendación operativa

Conservar la base habitual en V32 hasta contar con backup `FULL` verificado, restauración de ensayo y una ventana controlada. Aplicar la migración solo sobre esa restauración primero; comparar conteos/relaciones acordados y repetir verificaciones de restricciones, seguridad y E2E antes de autorizar cualquier actualización de la base habitual. La última lectura de la base habitual observó V32 y ningún hallazgo en los diagnósticos implementados. No se intentaron escrituras ni se reinició su stack. La reconfirmación final no estuvo disponible: Docker Desktop dejó de responder con error HTTP 500 y una conexión SQL de solo lectura al puerto 14330 agotó el tiempo.

### Seguimiento de estabilización (22-10-2026)

- Se verificó nuevamente que la rama sigue siendo `feature/integracion-funcional-v41` y que permanecen los cambios previos sin preparar en el índice. No se hicieron commits ni push.
- El proyecto y el overlay limpios quedaron configurados con un proyecto Compose distinto, volumen de SQL propio y puertos 14333/18082; `docker compose config` había validado el modelo. El overlay no completó su arranque.
- El daemon dejó de responder a `docker ps`: Docker Desktop devolvió HTTP 500 y el CLI quedó bloqueado hasta cancelar solo el cliente. Los logs locales de Docker registran `global_oom`, muerte del proceso `sqlservr` (aprox. 350 MB RSS) dentro de un contenedor, timeout del healthcheck y errores del proxy al conectar con `192.168.65.7:2376` (`context deadline exceeded`, 20 s). `wsl --list --running` solo muestra `docker-desktop`. En la comprobación local quedaron ~854 MB de memoria física libres y el proceso `com.docker.backend` había acumulado alto uso de CPU. La evidencia confirma presión de memoria/OOM en la VM y falta de respuesta del daemon; el healthcheck no fue un falso negativo aislado, porque el motor SQL fue terminado por el OOM killer. Sin respuesta de Docker no se pudo identificar de forma segura el estado final de cada contenedor ni detener solamente los recursos temporales.
- No se ejecutó reinicio ni restablecimiento de Docker, ni se eliminaron contenedores, imágenes o volúmenes. La base habitual no recibió operaciones de escritura.
- Playwright 1.57.0 se instaló temporalmente bajo `%TEMP%\vuelos-sanitarios-playwright-1.57`, sin modificar `package.json` ni lockfiles. `require('playwright')` resolvió mediante `NODE_PATH` y Chrome abrió `about:blank`; esto valida la herramienta y el navegador, pero no equivale a ejecutar los cinco E2E UI. Estos siguen pendientes porque el backend aislado no publicó el puerto 18082 y el frontend del proyecto de validación no pudo arrancar.
- La medición previa de auditoría permanece: 10.358 eventos, 100 resultados, 26.972 ms HTTP frente al máximo fijo de 5.000 ms. No se obtuvieron tiempos separados de SQL, backend y serialización ni estadísticas/plan real de SQL Server: el daemon y el motor terminaron bajo presión de memoria antes de habilitar instrumentación. El código inspeccionado ejecuta consulta de conteo y consulta paginada con proyección, orden estable y joins; los filtros de visibilidad por perfil forman parte de ambas consultas y el armado de valores sanitizados usa resolución por lote. No hay evidencia para atribuir esos 26.972 ms a una consulta concreta, por lo que no se aplicó una optimización especulativa ni se alteraron V1–V47.
- La repetición de usuarios sobre un fixture limpio, carreras administrativas SQL Server, la matriz E2E de Chrome y la liberación real de bloqueo documental siguen sin ejecutar. El E2E de usuarios sobre la base persistente continúa siendo inválido para ese caso porque contiene administradores históricos; no se adaptó la aserción para aceptarlos.
- Por lo anterior, esta etapa permanece abierta. No se declara resuelta la regresión de auditoría ni completados los criterios de aceptación dependientes de SQL Server.

### Cierre de recuperación E2E posterior a V47 — 22-10-2026

#### Recursos e incidente

- La memoria visible de Windows se midió en 7,24 GiB; el espacio libre varió entre 0,54 y 0,81 GiB en las muestras de trabajo. La memoria comprometida llegó a 16,76/22,09 GiB; había 8 procesadores lógicos y más de 282 GiB libres en C:.
- WSL 2.7.12.0 / kernel 6.18.33.2-2; `docker-desktop` era la única distribución WSL activa, Ubuntu estaba detenida. No existe `%USERPROFILE%\.wslconfig`; Docker Desktop informó 8 CPU, 3.45 GiB de memoria de VM y 1 GiB de swap, que llegó a estar completamente usada.
- Docker Desktop 4.87.0 (236836), Engine 29.7.2. SQL Server 2022 Linux CU27, imagen `2022-latest`, build 16.0.4295.3. La guía de Microsoft separa cgroups, `MSSQL_MEMORY_LIMIT_MB` y `max server memory`; el mínimo publicado de memoria para SQL Server Linux es 2 GiB ([requisitos](https://learn.microsoft.com/sql/linux/sql-server-linux-setup?preserve-view=true&view=sql-server-linux), [controles de memoria](https://learn.microsoft.com/mt-mt/sql/linux/configure/performance-best-practices-sql-server-memory?view=fabric-sqldb), [builds](https://learn.microsoft.com/troubleshoot/sql/releases/sqlserver-2022/build-versions)).
- La evidencia del kernel identifica un `global_oom` que terminó `sqlservr` en el contenedor SQL E2E preexistente; los logs también registraron fallos de healthcheck y errores de proxy HTTP 500 hacia el motor Linux. El SQL E2E nuevo tuvo 7 reinicios/salida 137, configuración cgroup sin límite (`HostConfig.Memory=0`) y no alcanzó `healthy`. El log de arranque mostraba errores de archivos de bases del sistema en su volumen recién creado. No se intentó inicializarlo de nuevo ni borrar su volumen.
- No se añadió una tercera instancia SQL. El límite de VM de 3,45 GiB, el uso observado del SQL habitual y del SQL E2E y el requisito de arranque de SQL Server no dejan margen demostrado para sostener otro motor. No se cambió `.wslconfig`, memoria global, límites SQL ni stack habitual; no hubo prune, reset ni reinicio de Docker/WSL.

#### Reutilización segura del SQL E2E

Se creó la red Docker dedicada `vuelos-sanitarios-e2e-validation-shared` y se conectó allí el SQL E2E existente. El backend/frontend E2E preexistentes se detuvieron mientras corría la validación; su SQL, datos y volúmenes permanecieron activos. Se crearon bases separadas `vuelos_sanitarios_e2e_run_20261022_a` a `_d` en ese motor, sin sobrescribirlas ni eliminarlas. `_a` falló por la contraseña inicial de menos de 12 caracteres, `_b` por el sufijo de licencia no alfanumérico, `_c` por falta de filas para completar una página de 100. En `_d` se añadieron usuarios sintéticos DTS hasta disponer de página completa; la aserción de 100 resultados se mantuvo.

El overlay `docker-compose.e2e.shared-sql.yml` configura el nombre de base de forma explícita, evita iniciar otro `sqlserver`, y asigna CORS únicamente al origen UI E2E `http://127.0.0.1:18083`. Se detectó y corrigió el primer rechazo de Chrome (`Invalid CORS request`) mediante ese override. La base habitual nunca se usó para escrituras.

#### Suites y regresiones

- Backend: la suite de 300 pruebas y frontend: 100 pruebas constaban aprobadas antes de este turno; no se tocó código de negocio durante la recuperación. El build de producción de React/Vite se ejecutó ahora y pasó (`vite build`, 21 módulos, 1,41 s).
- E2E API en SQL Server real: usuarios 12 bloques aprobados en `_d`, con dos carreras simultáneas de baja del último administrador y orden de lanzamiento alternado; cada ronda dio exactamente un 200 y un 409, quedó un administrador y la auditoría reflejó sólo la acción confirmada. También se verificó la carrera de asignación/recurso, persistencia, permisos y página completa de 100 usuarios (205 ms).
- Solicitudes: 11 bloques; aeronaves/tripulación: 13 bloques; auditoría: 16 bloques (consulta filtrada 642 ms sobre 1.148 eventos del fixture limpio, límite sin cambios de 5.000 ms).
- Cierre API: 13 bloques aprobados sobre la base E2E persistente porque la suite exige cuatro aprobaciones históricas auditadas que están en esa base y no en `_d`. Verificó la liberación anticipada de bloqueo documental en SQL Server real: bloqueo vigente de 30 minutos, baja del propietario, liberación inmediata, adquisición por otro usuario, historial preservado, auditoría/atomicidad y persistencia después del reinicio del backend.
- E2E Chrome/Playwright 1.57.0 + Chrome 155, ejecutados en serie: solicitudes 5 bloques; aeronaves/tripulación 6; auditoría 10; usuarios 9; cierre 6. Auditoría pasó en `_d`; al probar primero la base persistente, el responsable sintético no estaba entre los primeros 500 actores que ofrece el endpoint de filtros, por lo que se trasladó esa suite al fixture de menor volumen sin relajar sus aserciones.
- Migraciones: no se creó V48; V1–V47 permanecen intactas. La base habitual sólo se consultó; su última lectura reportada fue V32 y no se aplicaron migraciones.

#### Auditoría: rendimiento y límites de atribución

La base E2E persistente tenía 11.017 eventos totales (2.184 `FLIGHT`), rango de fechas 13-10 a 02-11-2026. El endpoint `GET /audit?size=100&from=2026-10-13&to=2026-11-02&entityType=FLIGHT&order=asc` retornó 100 elementos y total 2.184. Desde el backend E2E ya restaurado: calentamiento 2.001,6 ms; 7 rondas calientes entre 136,8 y 237,7 ms, mediana 186,4 ms (HTTP 200). Otra corrida con backend de validación dio mediana 94,6 ms, máximo 162 ms. Ambos máximos cumplen el umbral de 5.000 ms bajo el volumen comparable de más de 10.000 eventos.

Query Store está habilitado. En la ventana de las dos corridas registró el plan de página con 16 ejecuciones, media 57,19 ms, máximo 284,65 ms, CPU media 57,07 ms y 962 lecturas lógicas; se observaron consultas clasificadas como conteo con medias de 106–345 ms en otras ejecuciones de la misma ventana. Query Store agrega por consulta/intervalo y no tiene correlación por ID de request con las muestras HTTP; por eso esos valores no deben sumarse ni presentarse como la descomposición exacta de un request. En dos días aparecen outliers históricos de 119,6 s en consulta paginada y 168,0 s en conteo con CPU mucho menor; el Query Store no basta para atribuirlos a una capa ni a la llamada HTTP original de 26.972 ms.

La respuesta HTTP se midió de forma repetible, pero no se instrumentaron por separado adquisición/espera de conexión, conteo, paginado, autorización, DTO/saneado y serialización. Tampoco se capturó un plan real correlacionado con la llamada lenta original. La reducción desde 26.972 ms coincidió con menor concurrencia, ausencia de OOM y backend/SQL estables; esto respalda presión de recursos como contribuyente, pero no demuestra que fuera la única causa. No se modificaron consultas, índices, umbrales ni permisos por conjetura.

Para repetir la medición sin escribir en la base:

```powershell
$env:E2E_DB_NAME='vuelos_sanitarios_e2e'
$env:E2E_BASE='http://127.0.0.1:18080/api'
$env:E2E_AUDIT_FROM='2026-10-13'
$env:E2E_AUDIT_TO='2026-11-02'
$env:E2E_AUDIT_ACTOR_ID='ID_DE_ACTOR_CON_EVENTOS'
node scripts/measure-e2e-audit.cjs
```

El script exige una base con prefijo `vuelos_sanitarios_e2e`, autentica mediante `.env` sin imprimir credenciales y sólo hace GET después del login.

#### Estado final y criterio de cierre

Se restauraron los contenedores E2E previos: backend `vuelos-sanitarios-e2e-backend-1` saludable, 0 reinicios; frontend saludable; SQL E2E saludable. Los contenedores del proyecto de validación quedaron detenidos, no eliminados; SQL de validación continúa detenido con su volumen retenido. El backend SQL E2E persistente terminó con 11.017 eventos por los fixtures autorizados de pruebas. Durante las suites el backend de validación tuvo 0 reinicios, `OOMKilled=false`, consumió ~0,52 GiB; SQL E2E ~0,98–1,00 GiB. En la última muestra quedaban 0,81 GiB de RAM física libre en Windows.

La base y contenedores habituales estuvieron saludables y no se reiniciaron ni recibieron escrituras de esta tarea. No hubo cambios de `.env`, dependencias, paquetes o lockfiles, commits ni push. Los criterios de usuarios, carreras, Chrome, bloqueo, estabilidad y HTTP bajo 5 s se verificaron. Queda pendiente cerrar la atribución por capa de la demora antigua (tiempos SQL/backend/serialización correlacionados), por lo que esta estabilización se reporta con esa limitación y no como explicación causal completa.

## Auditoría final y selector remoto (23-10-2026)

El selector administrativo utiliza ahora `GET /api/audit/actors?q=&page=0&size=30`, con búsqueda parcial sobre usuario, nombre y apellido, orden apellido/nombre/id, paginación SQL y autorización ADMINISTRADOR. Se parte de actores distintos que siguen referenciados por eventos; la baja lógica conserva la fila de usuario y su vínculo, por lo que se incluyen actores desactivados con eventos históricos. El endpoint antiguo `/api/audit/filters` mantiene el campo `actors` limitado a 500 por compatibilidad; la interfaz nueva no lo utiliza para enumerarlos. La búsqueda remota incorpora debounce, ignora respuestas obsoletas, conserva el ID seleccionado entre consultas y permite cargar más.

Las solicitudes `/api/audit/**` reciben `X-Diagnostic-Id` aleatorio (UUID) y MDC `diagnosticId`; queda en el log DEBUG si se deshabilitan los tiempos. Para activarlos, establezca `APP_AUDIT_DIAGNOSTICS_ENABLED=true`; el valor predeterminado es `false`. Cuando se habilita, el log incluye duración HTTP y segmentos `authorization_and_filtering`, `count_repository_total`, `page_repository_total` y `transform_sanitize_and_enrich`. El tiempo HTTP abarca el filtro servlet y el retorno del chain, incluyendo el trabajo de MVC y el envío de la respuesta síncrona, pero no separa serialización Jackson ni escritura de socket. Las mediciones del repositorio incluyen adquisición de conexión si ocurre, ejecución SQL, conversión ORM y materialización; no son tiempo SQL puro. No se implementó aún medición por solicitud confiable que separe espera Hikari, consultas complementarias ni transformación/saneado. No inferirlos de esos segmentos. El registro no incluye usuario, parámetros, SQL, tokens ni cuerpos.

La última medición HTTP comparable registrada en la corrida previa fue warmup 2.001,6 ms; siete solicitudes calientes con mediana 186,4 ms y máximo 237,7 ms; otra corrida caliente tuvo mediana 94,6 ms y máximo 162 ms. Son valores del código anterior, no evidencian la nueva instrumentación. Query Store dio promedio paginado 57,19 ms en 16 ejecuciones, sin correlación exacta por request. En esta etapa no se volvió a desplegar el código en E2E debido al antecedente de presión de memoria; las mediciones nuevas por etapa y escenarios no se recopilaron.

No se encontró archivo `.bak` o `.trn` dentro del workspace. No se verificó un respaldo válido ni se hizo restauración de datos reales. La simulación V32→V47 anotada en el historial del proyecto es sobre fixture sintético SQL Server; no representa los datos habituales. La base habitual no se modificó.

### Análisis de migraciones V33–V47

| Migración | Objetivo y superficie | Riesgo principal | Validación necesaria antes del cambio habitual |
|---|---|---|---|
| V33 | Crea `clasificaciones_tripulacion` con FKs y unicidad usuario/función | Catálogos ausentes o duplicados si hubo precarga manual | Confirmar roles/catálogos y revisar las FKs |
| V34 | Añade `PENDIENTE_REPLANIFICACION` al catálogo de estados | Estado preexistente con metadatos divergentes | Confirmar una sola fila y orden esperado; script es idempotente |
| V35 | Crea habilitaciones profesionales/documentos con FKs, checks e índice | DDL y validez de referencias nuevas | Verificar FKs/catálogos y probar operaciones en copia |
| V36 | Añade `vencimiento_no_aplica` con default 0 y `WITH VALUES` | Backfill sobre todas las filas; log y locks según volumen | Comparar filas y confirmar valor de legado 0 |
| V37 | Amplía rutas, FK a aeropuerto alternativo e índice filtrado de ruta vigente | Duplicados de actual impiden el índice; DDL/log | Buscar duplicados por vuelo antes y revisar FK/índice después |
| V38 | Amplía bitácora operativa con datos/checks/FK/índices y trigger inmutable | Datos parciales no cumplen checks; duplicados impiden índice único; cambia permiso de UPDATE/DELETE | Auditar combinaciones históricas; validar checks e inmutabilidad en copia |
| V39 | Añade requisito/observaciones y contexto de aeronave, origen y comandante a hangar | FKs inválidas si se precargan referencias | Esperar NULL heredado, comprobar restricciones y lecturas |
| V40 | Unicidad filtrada de versión actual de hangar | Duplicados existentes abortan | Contar `es_version_actual=1` por vuelo antes y comprobar índice |
| V41 | Agrupa coordinaciones por vuelo con UUID, hace obligatorio el grupo y cambia unicidad/check de estado | UPDATE completo, DDL con locks y estado previo inesperado | Comparar conteos, estados y versiones; verificar unicidad por gestión |
| V42 | Revisión de informes, reconstrucción desde obligaciones, checks/índices y trigger de ciclo terminal | Backfill y checks pueden chocar con obligaciones incoherentes; cambia interpretación de informes | Comparar informe/obligación/vuelo y conteos por estado antes/después |
| V43 | Procedencia, metadatos PDF, responsable finalizador, backfill basado en auditoría y checks | Reclasifica informes históricos y limpia decisión sin evidencia comprobable | Revisar distribución estado/origen, enlaces y ficheros externos/versiones |
| V44 | CANCELADO, relación respuesta negociación, índice único, backfill y triggers sanitarios | Respuestas duplicadas y discrepancias entre estado de solicitud y vuelo | Revisar duplicados, cancelaciones y coherencia de estados |
| V45 | Baja lógica de tripulación; reemplaza UQ por índices filtrados | Elimina dinámicamente todos los UQ de la tabla; nombres/definiciones inesperados requieren atención | Inventariar constraints exactos; comprobar filas vigentes y unicidad posterior |
| V46 | Índices de auditoría e inmutabilidad UPDATE/DELETE | Construcción en tabla grande causa log/locks; puede bloquear procesos antiguos | Medir tabla/log en copia, revisar índices y probar el trigger |
| V47 | Detecta duplicados DNI/usuario, índices únicos y backfill de responsable/motivo de baja | Duplicados abortan; backfill parcial depende de evidencia de auditoría | Consultar duplicados, revisar bajas/FKs y comparar conteos |

Los riesgos de bloqueo dependen del volumen y edición de SQL Server; antes de autorizar, medir duración y espacio de log sobre restauración representativa. No se alteraron archivos históricos de migración.

## Cierre final de aplicación (23-10-2026)

Esta sección reemplaza la decisión histórica anterior sobre mantener abierta la estabilización de aplicación. La base habitual quedó en V32 y no recibió escrituras, migraciones ni reinicios. La preparación de V32→V47 sigue condicionada por no disponer de un backup real comprobable.

### Verificación reproducible con SQL Server y navegador

Se reconstruyeron en secuencia el backend y frontend E2E desde el código actual, conservando la instancia SQL E2E. El backend validó 47 migraciones y se habilitó `APP_AUDIT_DIAGNOSTICS_ENABLED=true` solo en el servicio E2E persistente. El E2E específico `scripts/e2e-audit-actor-search.cjs` es de solo lectura: comparó el endpoint remoto con las primeras 500 opciones legadas, buscó desde Chrome el actor número 501, lo seleccionó y aplicó su filtro, y contrastó dos eventos con SQL Server. También encontró un usuario desactivado con historial, verificó autenticación, respuesta remota fuera de orden, selección persistente y limpieza.

La medición se hizo con 11.019 eventos en SQL Server. Cada escenario tuvo una primera solicitud y siete solicitudes calientes. Valores en milisegundos:

| Escenario | Primera HTTP | Mín. caliente | Máx. caliente | Media | Mediana | p95 |
|---|---:|---:|---:|---:|---:|---:|
| Sin filtros | 644,0 | 64,6 | 114,7 | 93,7 | 104,6 | 114,7 |
| Tipo FLIGHT | 300,3 | 72,9 | 109,2 | 92,1 | 87,5 | 109,2 |
| Actor | 62,8 | 33,7 | 63,5 | 47,1 | 43,9 | 63,5 |
| FLIGHT, página siguiente | 84,0 | 63,4 | 96,2 | 79,6 | 78,9 | 96,2 |

Cada escenario tuvo siete muestras calientes; el percentil 95 usa el elemento `ceil(0,95*n)` de la muestra ordenada. Todos los HTTP quedaron por debajo de 5.000 ms. IDs de diagnóstico para primeras solicitudes: sin filtros `d508ac62-1092-4f1f-9562-2e426ebae2de`; entidad `861c4b73-9137-4a27-9922-67ed4dc398e4`; actor `1eb56884-07a7-4ac6-a7c7-4271efbae019`; página posterior `47796abb-5d7f-45b4-aa6e-7f4de52f3911`. El escenario sin filtros reportó 11.019 filas, FLIGHT 2.184 y el actor de prueba dos eventos al finalizar las suites.

Para la primera solicitud sin filtros, el log correlacionado registró HTTP total 654,397 ms, autorización/filtro 9,980 ms, conteo de repositorio 8,472 ms, página de repositorio 348,906 ms y transformación/saneado/enriquecimiento 194,896 ms. No se midieron por separado adquisición de conexión Hikari, SQL puro ni serialización Jackson. El tiempo de repositorio incluye JDBC/materialización y no debe presentarse como tiempo SQL exclusivo; el HTTP total incluye el resto de la cadena y serialización. Query Store no se usó para correlacionar estos IDs. No hubo demora reproducible que justificara más instrumentación u optimizaciones.

### Resultado de regresiones de esta ejecución

| Suite | Entorno | Resultado |
|---|---|---:|
| Backend Maven | pruebas unitarias e integración del proyecto | 301/301; 0 fallos, 0 errores, 0 omitidas |
| Frontend Vitest | ejecución completa | 102/102 en 9 archivos |
| Build frontend | Vite producción | aprobado |
| Usuarios API | SQL Server, base sintética limpia V47 | 12 bloques aprobados |
| Auditoría API | SQL Server persistente V47, más de 11.000 eventos | 16 bloques aprobados |
| Solicitudes API | SQL Server persistente V47 | 11 bloques aprobados |
| Aeronaves y tripulación API | SQL Server persistente V47 | 13 bloques aprobados |
| Cierre API | SQL Server persistente V47 | 13 bloques aprobados |
| Usuarios Playwright | Chrome real, SQL Server persistente V47 | 9 bloques aprobados |
| Auditoría Playwright | Chrome real, SQL Server persistente V47 | 10 bloques aprobados |
| Solicitudes Playwright | Chrome real, SQL Server persistente V47 | 5 bloques aprobados |
| Aeronaves y tripulación Playwright | Chrome real, SQL Server persistente V47 | 6 bloques aprobados |
| Cierre Playwright | Chrome real, SQL Server persistente V47 | 6 bloques aprobados |
| Actor 501 Playwright | Chrome real, SQL Server persistente V47 | aprobado; 2 eventos coinciden con SQL |

Dos intentos iniciales dieron errores de fixture, no defectos reproducibles del producto: usuarios sobre la base persistente encontró 29 administradores donde la prueba exige una base limpia y abortó antes de escribir; auditoría sobre una base recién migrada llegó a 66 eventos, menos de los 100 exigidos por su aserción de paginación global. Usuarios pasó luego sobre una base sintética limpia; auditoría pasó sobre la base persistente de 11.085 eventos. No se redujeron aserciones funcionales.

### Migraciones y preparación habitual

El análisis V33–V47 y sus riesgos está en la tabla anterior. En esta ejecución, la base sintética alcanzó V47 mediante Flyway y las suites funcionales usaron esa versión; esto no representa datos habituales ni equivale a restaurar V32. El ensayo V32 sintético documentado anteriormente sigue siendo sintético. No se encontró `.bak`/`.trn` en el workspace ni en el directorio de backup predeterminado SQL Server (`/var/opt/mssql/data`); no se hizo `RESTORE VERIFYONLY` ni restauración al no existir un archivo candidato. La preparación de la actualización habitual permanece condicionada a conseguir y ensayar un backup restaurable.

### Estado final de aplicación e infraestructura

Los servicios SQL habitual y E2E permanecieron activos; se reutilizó el motor SQL E2E. Los backend/frontend E2E quedaron saludables al final; SQL E2E registró 0 reinicios y sin OOM en esta ejecución. Las suites con escrituras corrieron sobre SQL E2E, nunca sobre el habitual. Se dejaron detenidos los dos contenedores web del proyecto temporal `vuelos-sanitarios-e2e-final`; no se eliminó ningún volumen. Compose creó volúmenes nuevos del proyecto temporal, incluido `sqlserver_data` sin instancia SQL asociada; se conservaron. La base E2E persistente recibió los registros marcados de las suites autorizadas.

Estado de decisión histórico al cierre del registro anterior: **estabilización de aplicación cerrada; nuevas implementaciones funcionales habilitadas. Actualización habitual V32→V47 condicionada a un backup real restaurable y un ensayo sobre su copia.** No se ejecutaron commits ni push.

### Respaldo y ensayo sobre el snapshot habitual — 23-10-2026

Esta sección actualiza la evidencia previa: el snapshot V32 real fue respaldado, verificado, restaurado y migrado en una base temporal. La base habitual permaneció sin escrituras ni cambios de esquema.

- `vuelos_sanitarios_v32_full_20261023_023018.bak`: backup SQL Server `FULL`, `COPY_ONLY`, `CHECKSUM`, comprimido, creado a las 02:30:20 (UTC−03), 3.649.536 bytes. `RESTORE VERIFYONLY WITH CHECKSUM` pasó en origen y en la copia transferida. El backup restauró correctamente y conservó el mismo SHA-256 en el host y en SQL E2E. Se conserva fuera del repositorio en la carpeta local protegida `Backups/VuelosSanitarios`.
- SQL habitual: `ONLINE`, recuperación `FULL`, Flyway V32 y 39 tablas antes de la operación; siguió en V32 al finalizar. SQL E2E persistente: siguió `ONLINE`, Flyway V47 y sin migraciones fallidas. No se reinició ningún servicio como parte del trabajo.
- La restauración temporal V32 tuvo 1 usuario activo, 1 persona y 0 usuarios inactivos, pacientes, aeronaves, vuelos, tripulantes, documentos, versiones, informes o eventos de auditoría. V33–V47 terminó en V47 con esos conteos conservados. Las diferencias esperadas fueron 39→42 tablas, 65→84 claves foráneas y 23→30 restricciones `CHECK`, todas habilitadas y confiables; el catálogo de estados sanitarios pasó de 4→5 y el de vuelos de 7→8.
- `DBCC CHECKDB` pasó antes y después. `DBCC CHECKCONSTRAINTS WITH ALL_CONSTRAINTS` no informó violaciones; las relaciones revisadas no tuvieron huérfanos. El trigger V46 bloqueó `UPDATE` y `DELETE` en pruebas de transacción revertidas y la tabla terminó con 0 eventos. La copia se eliminó al completar las comprobaciones; también se retiraron las transferencias temporales del `.bak` dentro de ambos volúmenes SQL.
- El snapshot no incluía filas de vuelos, pacientes, aeronaves, documentos, versiones, informes ni auditoría. Este resultado valida migración de la restauración real observada, pero esos dominios siguen cubiertos por los fixtures sintéticos documentados arriba y no por datos reales. La aplicación no se conectó a la copia y no hubo integraciones externas.
- El directorio de backup tiene ACL restringida al usuario operador, SYSTEM y Administradores. No había certificado SQL Server para cifrar backups; Windows 11 Home no tenía EFS y la consulta de BitLocker requirió elevación que no estaba disponible. El cifrado del volumen queda sin confirmar y debe verificarse con un administrador antes de ampliar la distribución del archivo.

### Verificación técnica y decisión

En esta ejecución `mvn -q test` aprobó 301 pruebas (0 fallos, 0 errores, 0 omitidas), Vitest aprobó 102 pruebas en 9 archivos y `npm run build` aprobó. No se repitieron las suites E2E completas: la validación SQL real de V32→V47 y las regresiones previas documentadas aportaron evidencia suficiente sin volver a iniciar una estabilización general.

La futura actualización habitual queda **LISTA PARA SER AUTORIZADA** dentro de una ventana operativa, con un nuevo backup FULL verificado inmediatamente antes del cambio, escrituras detenidas, confirmación de V32 y prevalidación sin conflictos. El backup de este ensayo no sustituye ese respaldo. Mantener el procedimiento de recuperación completo y detener el cambio ante cualquier migración fallida, conflicto de datos, falta de espacio, OOM o estado de salud inestable.

### Consolidación Git

Los cambios funcionales validados quedaron en `0f4c7cd` (`feat: complete operational administration workflows`) y la exclusión de archivos de backup en `6a5485d` (`chore: ignore local SQL Server backups`). Se conservaron los commits locales previos `a1c79bf` y `d02db7f`. La rama de trabajo es `feature/integracion-funcional-v41`, basada en el `origin/main` verificado; no se modificó `main`. El push de la rama de integración queda pendiente de su comprobación final.
