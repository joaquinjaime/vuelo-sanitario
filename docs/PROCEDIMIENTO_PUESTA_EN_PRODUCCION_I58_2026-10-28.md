# Procedimiento de puesta en producción V47 → V60 (candidata I-5.8)

**Estado: preparado, NO ejecutado.** Este documento no autoriza nada. Cada paso con efecto sobre la base habitual exige la autorización humana expresa de la ventana. Sustituye, para la candidata I-5.8, a la secuencia resumida de `PROCEDIMIENTO_ACTUALIZACION_V47_V60.md` (cuyo detalle técnico de migraciones y recuperación sigue vigente) y agrega: separación de cuentas de SQL Server, compuertas explícitas y habilitación gradual.

## 0. Dos estados que no deben confundirse

| Estado | Significado | Compuerta | Quién la firma |
|---|---|---|---|
| **BASE MIGRADA** | El esquema está en V60, íntegro y verificado; el backend nuevo arranca. **Nadie opera todavía.** | **M** (§6) | Responsable técnico |
| **APLICACIÓN AUTORIZADA PARA OPERAR** | Políticas activadas, antivirus acreditado, decisiones de negocio cerradas y usuarios habilitados de forma gradual. | **O** (§8) | Responsable del sistema + dirección operativa |

Pasar la compuerta M no implica pasar la O. Si M se cumple y O no, la aplicación permanece publicada **sólo para administración** (§7), con elegibilidad cerrada por omisión.

## 1. Roles y artefactos

* **Responsable de la ventana** (decide abortar/restaurar durante toda la ventana), **operador técnico**, **observador** (anota evidencia).
* Artefactos fijados antes de la ventana (registrar en el acta con su SHA-256/digest): commit de código, imagen `backend` y `frontend` (`sha256:`), bundle de migración V60 + `FlywayMigrationRunner`, `docker/sqlserver/apply-db-permissions.sql`, FULL anterior y clave portátil.
* Credenciales (nunca en Git, consola compartida ni chat): `.env.production` con permisos restringidos; **dos cuentas SQL distintas**: `DB_USERNAME` (aplicación, sólo datos) y `MIGRATION_DB_USERNAME` (migraciones, `db_owner`). El backend de producción **no recibe** las credenciales de migración (`docker-compose.prod.yml`); el ayudante las toma de variables de entorno de la sesión del operador.

## 2. Requisitos previos (todos, antes de pedir la ventana)

1. Autorización escrita (inicio, responsable, criterio de aborto) y aviso a Operaciones y comandantes: vuelos planificados necesitarán ruta aprobada (V55) y no habrá elegibilidad hasta activar políticas (V59).
2. Código y artefactos **idénticos a los ensayados** (mismo commit/digest). Si el árbol cambió, repetir el ensayo completo (`scripts/ensayo-migracion-v47-v60.sh`).
3. `.env.production` completo, sin `BOOTSTRAP_ADMIN_*` salvo primer inicio; `docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml --profile antimalware config -q` sin errores (si ClamAV va en otro equipo: ver `docker-compose.clamav-standalone.yml`).
4. Cuentas SQL: las contraseñas de `DB_PASSWORD` y `MIGRATION_DB_PASSWORD` son distintas, cumplen la política de SQL Server y no contienen comilla simple.
5. Recursos: ≥ 25 % de RAM libre del equipo, espacio para un FULL adicional y una restauración de prueba, Docker sin reinicios ni OOM recientes. **No iniciar instancias adicionales de SQL Server ni compilar durante la ventana.**
6. Respaldos anteriores y volumen de documentos respaldados; imágenes V47 vigentes archivadas (`docker image save`).
7. PowerShell 7.4+ para `protect-sql-backup.ps1` e `invoke-prepared-flyway-v60.ps1`.

## 3. Condiciones de interrupción (si ocurre una, NO se continúa)

| Id | Condición | Acción |
|---|---|---|
| X1 | La base no está exactamente en V47 o `flyway_schema_history` tiene `success = 0`. | No migrar; informar. |
| X2 | `prevalidate-migrations.ps1` informa cualquier `ISSUE` (las `WARNING` de V49/V50 se registran y aceptan por escrito). | No migrar; corregir datos sobre una copia y repetir el ensayo. |
| X3 | FULL de la ventana: `VERIFYONLY … WITH CHECKSUM` falla, SHA-256 distinto, no descifra o su restauración de prueba no pasa `DBCC CHECKDB`. | Abortar antes de tocar la base. |
| X4 | El validador del bundle no informa 60 migraciones validadas. | Abortar. |
| X5 | Hay escritores que no pueden detenerse o algún web sigue activo. | Abortar. |
| X6 | Imágenes/bundle distintos de los ensayados o falta imagen V47 para volver atrás. | Abortar. |
| X7 | Memoria/disco insuficientes u OOM reciente. | Abortar. |
| X8 | Falla cualquier migración, o falla cualquier criterio de §6. | **No reabrir.** Evidencia + decisión del responsable: corrección hacia adelante revisada o restauración (§9). |
| X9 | `GET /api/admin/readiness` informa `PRIVILEGIOS_BD` distinto de OK. | No publicar; reaplicar permisos (§5 P9) o investigar. |

## 4. Impedir operaciones incompatibles durante el cambio de versión

1. P4 detiene frontend y luego backend y **los marca `restart=no`** (`docker update --restart=no`) para que ningún reinicio automático de Docker los levante contra una base a medio migrar.
2. La base se migra sólo con los web detenidos; el ayudante además se niega a migrar si el backend/frontend habituales están en ejecución, si la base no está exactamente en V47 y sin la autorización explícita del objetivo 60.
3. El backend nuevo corre con `SPRING_FLYWAY_ENABLED=false`: contra un esquema incompleto **no arranca** (Hibernate `validate`) en vez de migrar sin respaldo. El código viejo no vuelve a ejecutarse sobre la base migrada: el regreso es restaurar el FULL.
4. La lista de preparación expone la versión aplicada y el privilegio real de la cuenta de la aplicación (`PRIVILEGIOS_BD`).

## 5. Secuencia (cada paso: comando → resultado esperado → evidencia → interrupción)

| Paso | Qué se hace | Resultado esperado / evidencia | Si falla |
|---|---|---|---|
| **P0** | Acta de inicio: fecha, responsables, digests, versión y estado de recursos; avisar el inicio. | Acta firmada. | — |
| **P1** | Registro previo (sin impacto): `SELECT @@VERSION`, modelo de recuperación, tamaño; `prevalidate-migrations.ps1` guardando la salida; `docker stats --no-stream`. | Salida sin `ISSUE`; recursos suficientes (X2, X7). | Abortar. |
| **P2** | **Detener escrituras y bloquear reinicios**: `docker stop --timeout 30 vuelos-sanitarios-frontend-1 vuelos-sanitarios-backend-1` y `docker update --restart=no` sobre ambos. Confirmar 0 sesiones activas. | Ambos `Exited`. (X5) | Abortar. |
| **P3** | **FULL de la ventana** con `CHECKSUM`; `RESTORE VERIFYONLY`; copia al directorio protegido; SHA-256 en origen y destino; cifrado con `protect-sql-backup.ps1` (clave portátil aparte); restauración de prueba con otro nombre + `DBCC CHECKDB` + comparación de conteos. | Todo en verde. (X3) | Abortar. |
| **P4** | Fotografía previa de sólo lectura (`node scripts/ensayo-snapshot.cjs`). | Archivo con conteos por tabla. | Abortar si no se genera. |
| **P5** | **Cuentas de SQL Server** (el operador dispone de `sa`): si `MIGRATION_DB_USERNAME` no existe como login, crearlo; luego `sqlcmd … -i docker/sqlserver/apply-db-permissions.sql` con `APP_LOGIN`/`MIGRATION_LOGIN`: la cuenta de la aplicación **pierde `db_owner`** y la de migraciones lo recibe. (En el ensayo la cuenta de la aplicación era `db_owner` en V47, como en la habitual.) | Mensaje «Permisos aplicados». Verificar `IS_ROLEMEMBER('db_owner', app)=0`. | Restaurar FULL si hubiera quedado inconsistente. |
| **P6** | **Validar** el bundle (los web siguen detenidos): `pwsh -File scripts\invoke-prepared-flyway-v60.ps1 -BundlePath <bundle> -RuntimeImage <digest>` con `MIGRATION_DB_USERNAME`/`MIGRATION_DB_PASSWORD` en el entorno de la sesión. | «Successfully validated 60 migrations». (X4) | Abortar. |
| **P7** | **Migrar** (sólo con la autorización de la ventana): mismo comando con `-Mode Migrate -HabitualMigrationExplicitlyAuthorized`. Se aplican V48…V60 con la **cuenta de migraciones**, cada una en su transacción. | Fin en V60. Si una falla: detenerse, capturar el mensaje, **no** editar migraciones ni `flyway repair` (X8). | §9 |
| **P8** | Fotografía posterior y comparación (`ensayo-snapshot.cjs <post> <pre>`). | Ninguna fila perdida (salvo auditoría que crece). | X8 |
| **P9** | **Permisos posteriores**: reaplicar `apply-db-permissions.sql` (ahora existe `flyway_schema_history` con V60: se deniega su escritura a la cuenta de la aplicación). | Mensaje «Permisos aplicados». | X9 |
| **P10** | **Validaciones SQL** (compuerta M, §6). | Todos los criterios cumplidos. | X8 |
| **P11** | **Arrancar sólo el backend** con `docker-compose.prod.yml` (imagen fija, sin frontend, sin credenciales de migración, `SPRING_FLYWAY_ENABLED=false`). Comprobar dentro del contenedor: `curl http://127.0.0.1:8080/actuator/health` y, autenticado como administrador, `GET /api/admin/readiness`. | `healthy`; `flywayVersion=60`; `PRIVILEGIOS_BD=OK`; `POLITICA_*` pendientes (esperado: cerrado por omisión). | X9 / §9 |
| **P12** | Retirar `BOOTSTRAP_ADMIN_*` del entorno y recrear el backend si se usaron. | `ADMIN_INICIAL=OK`. | — |
| **— Aquí termina «BASE MIGRADA» (compuerta M). —** | | | |
| **P13** | **Políticas profesionales** (sólo con la aprobación de `DECISION_POLITICAS_PROFESIONALES_I58_2026-10-28.md`): `validate` → `simulate` (guardar informe y huella) → aprobación de ESA huella → `activate` con `POLICY_ACTIVATION_TARGET_CONFIRMED`. Sin aprobación, **se omite** y la operación no se abre. | `POLITICA_*` en OK; lote y referencia visibles. | Reversión: activar el lote anterior o vaciar la función (estado seguro). |
| **P14** | **Antivirus**: `node scripts/verificar-antivirus-produccion.cjs --host <clamd>` → `ACREDITADO`; luego, si hay heredados, regularizar (`DOCUMENTOS_HEREDADOS_REGULARIZACION_I57_2026-10-28.md` §6). Sin antivirus acreditado la documentación queda en cuarentena (seguro) y no se habilita documentación real. | `ANTIMALWARE=OK`. | No abrir documentación. |
| **P15** | **Habilitación gradual** (§7). | Etapas A→B→C con criterio de avance. | Detener la etapa. |

## 6. Compuerta M: «base migrada» (validaciones SQL y de aplicación)

Todas deben cumplirse; se guardan las salidas.

1. `SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE success=1` = **60**; `SELECT COUNT(*) … WHERE success=0` = 0; checksums de V1–V47 sin cambio.
2. `DBCC CHECKDB` sin errores y `DBCC CHECKCONSTRAINTS WITH ALL_CONSTRAINTS` sin filas; 0 claves foráneas o CHECK no confiables.
3. Triggers presentes y habilitados: `tr_eventos_auditoria_inmutable`, `tr_decisiones_habilitacion_inmutable`, `tr_consultas_externas_inmutable`, `tr_politicas_habilitacion_proteccion`, `tr_documentos_habilitacion_integridad` (+ los previos).
4. Tablas: **47 físicas = 45 de negocio + `flyway_schema_history` + `sysdiagrams`** (esta última la crea SSMS y existe en la habitual); `node scripts/inventario-tablas.cjs` → CONCILIADO.
5. Conteos: ninguna tabla previa pierde filas (excepto lo derivado de V49/V50, V58 y V59, documentado); rutas V55: 0 versiones aprobadas/pendientes/devueltas.
6. **Cuentas**: `IS_ROLEMEMBER('db_owner', <cuenta app>) = 0`; la cuenta de la aplicación sólo en `db_datareader` y `db_datawriter`; `HAS_PERMS_BY_NAME('dbo.flyway_schema_history','OBJECT','UPDATE') = 0`; intento de `CREATE TABLE` con la cuenta de la aplicación → *permission denied*.
7. `politicas_habilitacion` vacía; `documentos_habilitacion` previos en `LEGADO_SIN_ANALISIS` con `origen_registro = ANTERIOR_V59` (la habitual hoy no tiene ninguno).
8. Backend `healthy`, sin errores de arranque ni OOM; `readiness`: esquema V60 sin pendientes, almacenamiento y secreto en verde, `PRIVILEGIOS_BD=OK`.
9. Sin credenciales en los logs del backend ni en la configuración de las imágenes.

## 7. Habilitación gradual de usuarios (tras M y los pasos P13–P14 que apliquen)

Se usa el puerto del frontend como control de acceso (`FRONTEND_PORT`), sin tocar cuentas:

| Etapa | Alcance | Cómo | Criterio de avance |
|---|---|---|---|
| **A — Administración** | Sólo administradores en el propio servidor. | Publicar el frontend ligado a loopback (`FRONTEND_PORT=127.0.0.1:8081`). Smoke de **sólo lectura** + lista de preparación. | Compuerta O (§8) cumplida o aceptada por escrito para la etapa B; sin errores. |
| **B — Piloto** | Un grupo reducido (Operaciones, DTS y 1–2 comandantes) con supervisión. | Publicar en la red interna con acceso restringido por firewall a las IP del piloto. Flujo completo sobre un vuelo de prueba/real supervisado (solicitud → asignación → aceptación → inicio → cierre). | Una jornada sin incidentes ni mensajes de elegibilidad inesperados. |
| **C — General** | Todos los usuarios. | Abrir el puerto a la red de la organización. | Monitoreo reforzado las primeras 24 h; responsable de guardia con autoridad de cierre. |

Interrupción en cualquier etapa: detener el frontend (`docker stop`) — los datos quedan intactos; no se restaura salvo corrupción.

## 8. Compuerta O: «aplicación autorizada para operar»

Se cumple cuando **todos** los elementos obligatorios de `GET /api/admin/readiness` están en OK y, además, constan por escrito:

1. Política aprobada y activa para **las cuatro funciones** (D1–D8 resueltas).
2. Antivirus acreditado (base de firmas completa, ≤ 7 días) **o** decisión escrita de no habilitar documentación real hasta tenerlo.
3. Retención documental aprobada (hoy sin purga: no hay plazos inventados) y plazos de aviso de vencimiento aprobados (`APP_CREDENTIAL_EXPIRY_APPROVED=true` sólo después).
4. Correo: proveedor SMTP contratado, probado con una entrega real y credenciales en el entorno protegido **o** decisión escrita de operar sin verificación de correos (los correos quedan «sin verificar» y no pueden ser principales).
5. Recursos del servidor suficientes y respaldo programado con copia fuera del equipo.
6. Piloto (etapa B) sin incidentes.

## 9. Recuperación (por restauración; las migraciones no son reversibles)

Mantener los web detenidos y conservar evidencia de la base fallida. Recuperar el FULL de la ventana (descifrar con la clave portátil), `VERIFYONLY` + SHA-256, y con el responsable ejecutar la restauración completa (`SINGLE_USER WITH ROLLBACK IMMEDIATE` → `RESTORE … WITH REPLACE, CHECKSUM, RECOVERY`; destructivo y reservado a la recuperación decidida). Verificar V47, `DBCC CHECKDB`, conteos contra la fotografía previa; arrancar las **imágenes V47 archivadas** y restablecer `restart=unless-stopped`. Los logins de servidor creados en P5 pueden permanecer (inofensivos); los **roles dentro de la base** vuelven al estado del FULL (la cuenta de la aplicación vuelve a ser `db_owner`, como en V47). Nunca `flyway repair` ni edición del historial.

Comprobación de la recuperación: ver el informe I-5.8 (restauración del respaldo de la base migrada del ensayo, `DBCC CHECKDB` y comparación de conteos).

## 10. Registro de la ejecución (para auditoría)

Completar y archivar: fecha/hora de cada paso, quién lo ejecutó, salida (sin secretos), digests de imágenes, SHA-256 del bundle y de los respaldos, resultado de cada criterio de §6, decisión de compuertas M y O con nombre y fecha.
