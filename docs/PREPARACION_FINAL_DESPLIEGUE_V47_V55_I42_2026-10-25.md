# I-4.2 Preparación final del despliegue V47 → V55 — 2026-10-25

**La base habitual no se migró ni se modificó: sigue en Flyway V47** (47 filas de historial, 0 fallidas, 41 tablas de aplicación, 84 FK y 30 CHECK confiables; comprobado de nuevo al terminar). No se hizo commit ni push. No se borró ni sobrescribió ningún respaldo.

**Estado posterior (I-4.3, 2026-10-26):** los dos bloqueos de §8 se cerraron (código consolidado en `release/v55-integracion`, imágenes release V55 y reensayo completo); ver `RELEASE_V55_CONSOLIDACION_Y_ENSAYO_I43_2026-10-26.md`. Lo que sigue describe la conclusión de I-4.2.

**Conclusión: DESPLIEGUE BLOQUEADO** hasta cerrar los dos puntos de §8 (código sin consolidar e imágenes release V55 inexistentes). Las herramientas, los respaldos, la recuperación y las precondiciones de la base están verificados; lo que falta es producir y reensayar el artefacto exacto que se desplegaría. Con esos dos puntos cerrados el estado pasa a *listo para autorización definitiva* (la autorización de la ventana sigue siendo una decisión humana separada).

## 1. Herramientas de despliegue

| Herramienta | Resultado |
|---|---|
| PowerShell 7.4 | **No estaba instalado** (sólo Windows PowerShell 5.1, que no sirve: `#requires -Version 7.4`). Se instaló la versión portable **7.4.13** descargada del release oficial de Microsoft (`PowerShell/PowerShell` v7.4.13, `PowerShell-7.4.13-win-x64.zip`, 112 034 330 bytes, SHA-256 `8FB52D21…B33B65`, igual al de `hashes.sha256` del release) y descomprimida en `C:\Users\joaqu\AppData\Local\Programs\PowerShell-7.4.13-portable\pwsh.exe`. No toca el sistema, el PATH ni el registro. Alternativa instalable (requiere administrador): `winget install --id Microsoft.PowerShell --version 7.4.13`. AES-GCM disponible. **Toda orden `*.ps1` del procedimiento se ejecuta con ese `pwsh.exe`, no con `powershell`.** |
| `protect-sql-backup.ps1` | 23/23 pruebas sintéticas (§3). Sin cambios. |
| `prevalidate-migrations.ps1` | Ejecutado contra la habitual con `sqlcmd` del equipo y el login de la aplicación: sin `ISSUE` ni `WARNING`; `flyway-current 47`; pendientes `V48…V55`; 0 rutas; 0 vuelos planificados. Código de salida 0. |
| `invoke-prepared-flyway-v55.ps1` | Modo **Validate** contra la habitual: `Successfully validated 55 migrations` / `validation-only=success` (V1–V47 con sus checksums originales; V48–V55 pendientes permitidas). Bundle: `backend-java\target\ops-flyway-release-v55` (55 migraciones: 52 SQL + 3 clases Java, `FlywayMigrationRunner.class` compilado de este árbol, mismas librerías que el bundle V47). Imagen de ejecución: backend V47 `sha256:7b910152…45993f` (Java 21). El mismo bundle también valida contra la base E2E aislada en V55: los checksums de V48–V55 del árbol coinciden con los que se ensayaron. |

### Defectos de `invoke-prepared-flyway-v55.ps1` hallados al ejecutarlo de verdad (corregidos)

1. **La guardia "exactamente V47" rechazaba siempre.** `(… | Select-Object -First 1).Trim()` deja `$LASTEXITCODE` en `$null`; `$null -ne 0` es verdadero, de modo que `-Mode Migrate` habría abortado con "no está en V47" incluso en V47 (falla segura, pero habría frustrado la ventana). Ahora se captura toda la salida, se lee el código y luego se toma la primera línea. Las líneas corregidas se ejecutaron textualmente en modo lectura: `exit=0 current='47'`, no rechaza.
2. **Diagnóstico suprimido.** Ante un fallo sólo decía "diagnostics suppressed", pero el procedimiento exige capturar el mensaje exacto (por ejemplo `THROW 51052` de V52). Ahora imprime, como advertencias, las últimas 20 líneas de error de Flyway/SQL Server con la contraseña de la aplicación sustituida por `***`. Probado con una copia alterada del bundle (checksum de V10 modificado): mensaje `Migration checksum mismatch for migration version 10`, la contraseña no aparece en la salida y el código de salida es 1.
3. **Montaje del bundle poco fiable.** Con `--mount type=bind` de una ruta Windows, 2 de ~10 ejecuciones de Validate fallaron al azar (`No migration with a target version 55`, `NoClassDefFoundError: org/flywaydb/core/Flyway`): el contenedor vio un bundle incompleto. Fallan antes de aplicar nada, pero abortarían una ventana. Ahora el ayudante verifica en el equipo que el bundle tiene exactamente 55 migraciones (incluida V55), crea el contenedor, copia el bundle con `docker cp` y lo inicia; lo elimina siempre al terminar. **10/10 ejecuciones de Validate correctas** con la versión corregida; un bundle de 54 archivos se rechaza sin crear contenedor y no queda ningún contenedor residual.

Límite honesto: la rama `-Mode Migrate -HabitualMigrationExplicitlyAuthorized` **no se ejecutó** (no se puede sin migrar la habitual, y el ayudante apunta fijo a ella). Se probaron por separado la guardia de versión, la creación/copia/inicio del contenedor (idéntica en ambos modos), el rechazo de imagen mal formada y de bundle incompleto, la rama de fallo, y el mismo `FlywayMigrationRunner` ya migró cuatro restauraciones aisladas (I-4.1). Queda sin ejercitar sólo la línea que fija `MIGRATION_HABITUAL_AUTHORIZATION=V47_TO_V55_AUTHORIZED` y la verificación de que los dos web estén detenidos; ambas son lectura simple y se revisaron. El primer intento de probar la negativa "Migrate sin interruptor" fue bloqueado por el clasificador de seguridad del entorno y no se repitió: la comprobación (líneas 19–21) es una condición de dos términos revisada por lectura.

## 2. Protección del código (212 archivos, sin commit ni push)

* **Estado:** rama `main` en `e8fce25`, igual a `origin/main` (0 commits por delante). 89 archivos modificados (88 con diferencias de contenido; `docker/sqlserver/init-db.sh` figura modificado sin diferencia real, efecto de `core.autocrlf=true`) y 123 archivos sin seguimiento (122 entradas, una es el directorio `mail/`) = **212 archivos**. Sin conflictos de merge, sin marcadores de conflicto, 0 stashes.
* **Distribución:** backend principal 63 + 8 migraciones V48–V55, `pom.xml` 1, pruebas backend 35; frontend: fuentes 12, pruebas 12, configuración 3; `scripts/` 53; `docs/` 19 (sin contar este documento); raíz y compose 6.
* **Presencia de I-1 a I-4.1:** V48–V55; `PersonIdentityService`, `PersonContactService`, `EmailVerificationService`, `CrewContactService`, `CrewEligibilityMonitoringService`, `TransferContactService`, `PatientDirectoryService`, `FlightRouteService` (revisión V55); `WholeNumber`/`StrictJson`; paquete `mail/`; paneles React (`dniRectification`, `crewContacts`, `account`, `phoneField`, `flightRoute`, `documents`, `patients`, `transferContacts`); los 37 scripts de la suite Node (todos existen, `node --check` sin errores; el listado de `e2e-suite-completa.cjs` tiene 37 entradas únicas); los scripts de ensayo (`ensayo-*`), `invoke-prepared-flyway-v55.ps1` y 14 documentos de integración. No faltan archivos referenciados por la documentación.
* **Secretos:** se buscaron los valores literales de los 5 secretos de `.env`/`.env.e2e` (contraseñas SA, de aplicación, `JWT_SECRET`, `E2E_MSSQL_SA_PASSWORD`, correo del administrador), claves privadas, JWT, tokens de proveedores y correos personales en los 212 archivos: **0 coincidencias de secretos** (única mención: la URL pública del repositorio en un documento ya versionado). `.env` y `.env.e2e` están ignorados; no hay respaldos, claves, bases ni registros entre los archivos a incluir (el mayor, `package-lock.json`, pesa 64 KB).
* **Pruebas:** el informe de Surefire (18:32–18:37) cubre 53 suites, **487 pruebas, 0 fallos, 0 errores, 0 omitidas**, y ningún fuente del backend es posterior. No se volvieron a ejecutar la suite de frontend (211) ni los 37 scripts Node: el equipo tenía 330 MB de RAM libre y una ejecución habría puesto en riesgo la VM de Docker que aloja la base habitual. Esas cifras son las informadas por la etapa anterior.
* **Copia de seguridad del trabajo (fuera de Git, sin tocar el índice):** `C:\Users\joaqu\Backups\VuelosSanitarios\code_changes_snapshot_*.zip` con los 212 archivos y `code_changes_manifest_*.txt` (SHA-256 de cada archivo con saltos de línea normalizados y una huella global del contenido). No incluye secretos.
* **Estrategia propuesta para consolidar (requiere autorización):**
  1. Crear la rama `release/v55-integracion` desde `main` y hacer **3 commits**: (a) backend + migraciones + frontend + pruebas; (b) scripts de E2E y de ensayo/despliegue; (c) documentación y configuración. La integración sólo se probó completa, así que no se pretende que cada commit compile por separado: la rama es la unidad.
  2. Antes de confirmar, decidir la normalización de saltos de línea (`core.autocrlf=true` con archivos en LF produce los avisos "LF will be replaced by CRLF"; `.gitattributes` actual sólo fija `*.sh` en LF). Sin esa decisión, la huella de contenido difiere entre máquinas.
  3. Verificar que el árbol confirmado coincide con el manifiesto (misma huella), subir la rama, abrir un PR y esperar el CI (el PR #1 anterior lo tenía).
  4. Construir las imágenes release desde un checkout limpio de esa rama (§8) y registrar commit, digests y huella en un manifiesto como el `release_v47_manifest_20261023.json`.

## 3. Respaldo y recuperación

Pruebas sintéticas de `protect-sql-backup.ps1` (archivo aleatorio de 6 MiB, modo `PortableKeyFile`, sin datos personales; **23/23**): cifra y verifica; el original no cambia; la clave mide 32 bytes; el cifrado no contiene el texto plano; `Verify` no modifica nada; `Restore` reproduce un archivo idéntico bit a bit; se niega a sobrescribir salida, a reutilizar una clave y a trabajar sin el directorio de claves; **detecta** un bit alterado del texto cifrado, de la etiqueta GCM, del nonce, de los metadatos autenticados, un formato desconocido, un archivo truncado, otra clave de 32 bytes, una clave de otra longitud y un modo de clave equivocado; el modo DPAPI heredado sigue funcionando para el mismo perfil.

**Independencia del perfil de Windows / otra plataforma:** el modo portable no usa DPAPI. Un cifrado producido por PowerShell se descifró con la herramienta Java de recuperación (`RecoverPortableSqlBackup`) dentro de un contenedor Linux sin red, con el mismo SHA-256; la variante alterada fue rechazada y no creó salida. **Atención:** esa herramienta debe alimentarse desde `pwsh` 7 o `bash`; Windows PowerShell 5.1 antepone un BOM UTF-8 (bytes `EF BB BF`) a la clave por la entrada estándar y la recuperación falla en silencio.

**Respaldos existentes (sin modificar):** `Verify` correcto, con SHA-256 igual al del `.bak` en claro, para el FULL previo a V47 (`1EDF8375…2B`, clave portable), el FULL V32 original (clave portable) y el TAR de documentos. Los dos FULL V32 en modo DPAPI (`…023018`, `…pre_sa_rotation…`) también verifican, pero su clave `.dpapi` está en el perfil virtualizado del paquete `OpenAI.Codex_2p2nqsd0c76g0` (`…\Packages\…\LocalCache\Local\VuelosSanitarios\RecoveryKeys`), no en `%LOCALAPPDATA%` normal: dependen de ese perfil, a diferencia de los portables. `C:\ProgramData\VuelosSanitarios\{Backups,RecoveryKeys}` y `%USERPROFILE%\Backups\VuelosSanitarios` tienen ACL explícita (SYSTEM, Administradores, operador).

**Cadena completa de la ventana ensayada con la base habitual real V47** (origen sólo de lectura; respaldo `COPY_ONLY`, que no altera la cadena):

1. `BACKUP … WITH COPY_ONLY, CHECKSUM, COMPRESSION` → 3 887 104 bytes; `RESTORE VERIFYONLY … WITH CHECKSUM`: válido.
2. SHA-256 idéntico en el contenedor y en el equipo (`BBCAECE1…4338`).
3. Cifrado AES-256-GCM con clave portable → `Verify` correcto → `Restore` a un archivo nuevo, idéntico al original.
4. El archivo recuperado, copiado al SQL E2E aislado: `VERIFYONLY` válido; restaurado con nombre temporal; `DBCC CHECKDB` y `DBCC CHECKCONSTRAINTS WITH ALL_CONSTRAINTS` sin errores; V47, 0 fallidas, 41 tablas, 84 FK, 30 CHECK y conteo de filas por tabla **iguales a la habitual**; base temporal eliminada.
5. Una copia del respaldo con un byte alterado fue rechazada por SQL Server (`Msg 3203 … The data is invalid`); la copia temporal se eliminó.

Artefactos conservados de este ensayo (aditivos): `vuelos_sanitarios_v47_rehearsal_pre_v55_20261025_221456.{bak,bak.aesgcm,recovered.bak}` en `C:\ProgramData\VuelosSanitarios\Backups`, su clave en `…\RecoveryKeys\…221456.key` y una copia `.bak` en el contenedor habitual (`/var/opt/mssql/backup`). **No sustituyen el FULL de la ventana.**

**Custodia:** todo está en el mismo equipo y el mismo disco; no hay copia fuera del equipo (ver riesgos).

## 4. Precondiciones de la migración (consultas de sólo lectura sobre la habitual)

| Comprobación | Resultado |
|---|---|
| Motor / base | SQL Server 2022 CU27 16.0.4295.3; `vuelos_sanitarios` ONLINE, MULTI_USER, no de sólo lectura, recuperación FULL, collation `SQL_Latin1_General_CP1_CI_AS`, compatibilidad 160 |
| Flyway | V47, 47 filas, 0 fallidas, sin huecos; V45 a V47 instaladas el 23-10-2026 |
| Restricciones | 0 FK y 0 CHECK deshabilitadas o no confiables; 0 triggers deshabilitados; `tr_eventos_auditoria_inmutable` habilitado; 41 tablas, 42 PK, 84 FK, 30 CHECK |
| Objetos de V48–V55 | Ninguno presente (`estado_revision`, `verificaciones_correo`, `contactos_coordinacion_traslado`, etc.) |
| V52 | 0 documentos, 0 versiones, 0 inactivos sin versiones (no se detendrá con `THROW 51052`) |
| Usuarios y contactos | 1 persona, 1 usuario (con rol y persona), 1 correo, 0 teléfonos; 0 DNI duplicados, 0 huérfanos, 0 duplicados de correo por persona, 0 personas sin contacto principal (V49/V50 no tienen nada que corregir) |
| V55 | 0 vuelos, 0 rutas, 0 vuelos planificados que requieran ruta aprobada |
| Espacio | Datos 72 MB (13 usados), log 264 MB (4 usados); disco del volumen SQL 925 GB libres; disco C: 278 GB libres; volúmenes Docker 5,8 GB; sin OOM ni reinicios en SQL, backend ni frontend |
| Operaciones incompatibles | Sin transacciones abiertas ni solicitudes de usuario; 13 sesiones además de la propia: 10 del backend (JDBC, inactivas), la telemetría CEIP de SQL Server y **2 de SQL Server Management Studio abiertas en el equipo**; sin tareas programadas del proyecto; volumen de documentos vacío (0 archivos) |
| Permisos | El login de la aplicación es `db_owner` (necesario para el DDL de V48–V55, igual que en V47) |
| Estados del backend | `/actuator/health` UP; las rutas `/api/e2e/*` sólo existen con el perfil `e2e` y `app.e2e-controls.enabled=true`, ausentes del entorno habitual |

## 5. Coordinación de backend, frontend y esquema

* El backend tiene `spring.flyway.enabled=true`: **arrancar la imagen V55 contra una base en V47 la migraría sola**, fuera del ayudante y sin el FULL de la ventana. Por eso el orden obligatorio es: detener web → FULL → ayudante (V48–V55) → recién entonces la imagen V55. Nunca `docker compose up` sin `--no-build --pull never --no-deps` y el solapamiento `docker-compose.release.yml` (sin él, Compose reconstruye desde el árbol).
* Al revés, la imagen V47 contra una base en V55 no es un estado soportado (columnas, restricciones y reglas de rutas nuevas): la reversión es siempre **restaurar el FULL y arrancar las imágenes V47**, nunca arrancar V47 sobre V55.
* El contenedor habitual ya recibe las variables `MAIL_*` (valor por defecto) desde el `docker-compose.yml` modificado; V55 no exige variables nuevas en `.env`. La base `.env` sólo necesita cambiar `BACKEND_RELEASE_IMAGE` y `FRONTEND_RELEASE_IMAGE` (anotar los valores V47 actuales para volver atrás).
* El frontend V55 y el backend V55 se construyen del mismo árbol y se despliegan juntos; con la ventana abierta el frontend V47 permanece detenido.
* **Decisión pendiente (correo):** sin `MAIL_ENABLED=true` y un SMTP, V54 deja el único correo existente "sin verificar" y nadie podrá verificar ni cambiar su correo principal (el servicio responde `MAIL_NOT_CONFIGURED`; no bloquea el inicio de sesión ni los vuelos). Decidir antes de la ventana si se configura SMTP o se acepta ese estado.

## 6. Procedimiento definitivo (no ejecutado)

Variables: `$pwsh='C:\Users\joaqu\AppData\Local\Programs\PowerShell-7.4.13-portable\pwsh.exe'`, `$store='C:\ProgramData\VuelosSanitarios'`, `$ts=Get-Date -Format yyyyMMdd_HHmmss`. El detalle SQL y las condiciones de aborto están en `PROCEDIMIENTO_ACTUALIZACION_V47_V55.md`; esta lista es el orden de la ventana.

1. **Comprobaciones previas (el día anterior y de nuevo al abrir):** código consolidado e imágenes release (§8) listos; `docker ps` con los 7 contenedores saludables; `& $pwsh -File scripts\prevalidate-migrations.ps1 -Server 'tcp:127.0.0.1,14330' -Database vuelos_sanitarios` sin `ISSUE` (el login de aplicación va en `MIGRATION_SQL_USERNAME`/`SQLCMDPASSWORD` sólo del proceso); `& $pwsh -File scripts\invoke-prepared-flyway-v55.ps1 -BundlePath <bundle> -RuntimeImage <digest> -Mode Validate` → `validation-only=success`; consulta de sesiones y transacciones (§4); memoria de Docker sin OOM; **cerrar SSMS y cualquier cliente SQL**; avisar a Operaciones y comandantes de que los vuelos `PLANIFICADO` necesitarán ruta aprobada antes de iniciar.
2. **Condiciones de autorización:** persona responsable presente toda la ventana; hora de inicio y criterio de aborto escritos; respuesta explícita a "autorizo ejecutar V47 → V55 sobre la base habitual en esta ventana"; decisión sobre SMTP (§5); imágenes V47 archivadas (`docker image save` verificado) para volver atrás. Ninguna autorización anterior (V32→V47) ni esta preparación sirve como tal.
3. **Respaldo inmediato (con los web detenidos, paso 5):** `BACKUP DATABASE [vuelos_sanitarios] TO DISK=N'/var/opt/mssql/backup/vuelos_sanitarios_v47_full_pre_v55_<ts>.bak' WITH COPY_ONLY, CHECKSUM, COMPRESSION, INIT` seguido de `RESTORE VERIFYONLY … WITH CHECKSUM` (así se ensayó; no reutilizar el FULL del ensayo ni uno anterior).
4. **Verificación del respaldo:** SHA-256 en el contenedor y en `$store\Backups`; `& $pwsh -File scripts\protect-sql-backup.ps1 -Mode Protect -KeyProtection PortableKeyFile …` y `-Mode Verify`; `-Mode Restore` a un archivo nuevo; restaurarlo con nombre temporal en el SQL E2E, `DBCC CHECKDB` y `CHECKCONSTRAINTS`, comparar versión y conteos con la habitual y eliminar la base temporal. Si algo falla: **abortar** (la base sigue en V47). No imprimir la clave. Registrar fotografía previa con `ensayo-snapshot.cjs`.
5. **Detención controlada:** pausar el backend y el frontend E2E (memoria); `docker stop --timeout 30 vuelos-sanitarios-frontend-1 vuelos-sanitarios-backend-1`; confirmar ambos detenidos, 0 sesiones de usuario y 0 transacciones. SQL Server permanece encendido.
6. **Aplicar V48–V55:** `& $pwsh -File scripts\invoke-prepared-flyway-v55.ps1 -BundlePath <bundle> -RuntimeImage <digest> -Mode Validate` y, con la autorización escrita, el mismo comando con `-Mode Migrate -HabitualMigrationExplicitlyAuthorized`. El ayudante rechaza si algún web sigue encendido o si la base no está exactamente en V47. Ante un fallo: detenerse, guardar las advertencias, **no ejecutar `repair`** (Flyway lo sugiere en sus mensajes) ni reintentar a ciegas; decidir con el responsable entre corrección revisada o restauración (paso 11).
7. **Desplegar backend y frontend V55:** en `.env`, anotar y reemplazar `BACKEND_RELEASE_IMAGE`/`FRONTEND_RELEASE_IMAGE` por los digests V55; `docker compose --env-file .env -p vuelos-sanitarios -f docker-compose.yml -f docker-compose.release.yml up -d --no-build --pull never --no-deps backend`; esperar `healthy`; luego el mismo comando con `frontend`.
8. **Salud:** `flyway_schema_history` en V55 con 0 fallidas; `docker exec vuelos-sanitarios-backend-1 curl --fail --silent http://127.0.0.1:8080/actuator/health` (UP); arranque sin errores de `ddl validate`; sin OOM; HTML 200 del frontend y 401 ante credenciales inválidas por el proxy.
9. **Pruebas funcionales posteriores (sólo lectura):** criterios 1–9 del §6 del procedimiento detallado (conteos, restricciones, fotografía previa/posterior, rutas, correos "sin verificar", documentos); inicio de sesión del administrador existente; `GET /api/flights`; `/api/e2e/clock` debe responder 404 o 401 sin datos; no ejecutar E2E ni inyectar datos en la habitual. Reanudar los web E2E.
10. **Criterios de recuperación (cualquiera dispara el paso 11 o la corrección revisada):** FULL que no verifica o no restaura; V48–V55 incompleta o con fallo; `CHECKDB`/`CHECKCONSTRAINTS` con error; conteos distintos de la fotografía; backend o frontend que no llegan a `healthy`; OOM; falla de inicio de sesión de usuarios existentes; cualquier discrepancia del §6 del procedimiento no explicada.
11. **Restaurar el entorno anterior:** mantener los web detenidos; conservar evidencia de la base fallida; descifrar si hace falta (`-Mode Restore`), `VERIFYONLY` y SHA-256 del FULL de la ventana; `SET SINGLE_USER WITH ROLLBACK IMMEDIATE` → `RESTORE DATABASE … WITH REPLACE, CHECKSUM, RECOVERY` con los `MOVE` documentados → `MULTI_USER`; verificar V47, `DBCC CHECKDB` y conteos; devolver `.env` a los digests V47 y arrancar `docker-compose.release.yml` con las imágenes V47 (backend primero). No restaurar `master`. Documentos: el volumen está vacío; repetir el conteo en la ventana.

## 7. Riesgos pendientes

| # | Riesgo | Estado / mitigación |
|---|---|---|
| 1 | Código sin consolidar: no hay versión reproducible ni huella estable entre equipos | **Bloqueante.** Estrategia en §2; necesita autorización de commit |
| 2 | No existen imágenes release V55 (la habitual corre las V47) ni bundle archivado con SHA-256; las imágenes E2E probadas no están etiquetadas de forma inequívoca (el frontend E2E en ejecución no coincide con la etiqueta `latest`) | **Bloqueante.** Construir desde el commit, etiquetar `release-v55-<fecha>`, archivar y reensayar (§8) |
| 3 | La rama `Migrate` del ayudante no se ejecutó en vivo (§1) | Aceptado con las pruebas parciales descritas; Validate inmediatamente antes; no reintentar Migrate automáticamente |
| 4 | Custodia únicamente local (mismo equipo y disco) | Copiar `.aesgcm` y clave por canales separados fuera del equipo antes de la ventana |
| 5 | SMTP sin configurar: los correos existentes quedarán sin verificar | Decisión de negocio (§5) |
| 6 | Datos reales mínimos (1 usuario, 0 vuelos): ni el ensayo ni las precondiciones ejercitan volumen ni vuelos reales | Los backfills de V49/V50/V52/V55 están cubiertos por la siembra del ensayo y por pruebas con SQL Server; repetir las consultas de §4 al abrir la ventana |
| 7 | SSMS abierto con 2 sesiones | Cerrarlo antes de la ventana |
| 8 | Docker Desktop (VM 3,45 GiB) y 330 MB de RAM libre en el equipo | Pausar los web E2E; no iniciar SQL adicionales; no ejecutar tareas pesadas durante la ventana |
| 9 | Montajes Windows de Docker poco fiables | Corregido en el ayudante (`docker cp`); aplicar el mismo criterio a cualquier herramienta nueva |
| 10 | Recuperación desde Windows PowerShell 5.1 con la herramienta Java falla (BOM) | Usar `pwsh` 7 o `bash` |
| 11 | Frontend (211) y Node (37) no reejecutados en esta etapa | Reejecutar sobre las imágenes release en el reensayo |

## 8. Para pasar a "listo para autorización definitiva"

1. Autorizar el commit local (y, si se desea, el push y el PR) según §2.
2. Construir las imágenes release desde un checkout limpio de ese commit; registrar digests; `docker image save`; empaquetar el bundle V55 (`classes` + `libs`) en un ZIP con SHA-256, fuera de Git.
3. Reensayar con esas imágenes exactas: `ensayo-migracion-v47-v55.sh` y `ensayo-migracion-negativa.sh`, Validate real del ayudante con el digest de release, arranque del backend V55 sobre la restauración migrada y humo del frontend; reejecutar Vitest y la suite Node sobre el stack E2E reconstruido.
4. Cerrar la decisión de SMTP, la copia externa de respaldos y la comunicación a Operaciones.
