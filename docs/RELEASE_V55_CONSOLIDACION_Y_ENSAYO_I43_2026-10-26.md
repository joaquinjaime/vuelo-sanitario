# I-4.3 Consolidación Git, construcción reproducible y validación integral de la release V55 — 2026-10-26

**La base habitual no se migró, no se modificó y no se restauró: sigue en Flyway V47** (47 filas de historial, 0 fallidas, 41 tablas; backend, frontend y SQL habituales siguen con las imágenes V47 `7b910152…` / `9b2b0b6a…` y sin reinicios). No se hizo push. No se borró ni sobrescribió ningún respaldo.

**Decisión: RELEASE LISTA PARA SOLICITAR AUTORIZACIÓN** (condiciones en §E). La autorización de la migración real de V47 a V55 es una decisión nueva y separada.

## A. Git

* **Rama:** `release/v55-integracion`, creada desde `main` (`e8fce25`, igual a `origin/main`). Árbol de trabajo limpio al terminar; `main` no se tocó.
* **Estado inicial comprobado de nuevo:** 212 archivos pendientes (89 modificados + 123 sin seguimiento), sin conflictos; el snapshot de I-4.2 se extrajo a una carpeta nueva y sus 213 entradas coincidieron con el manifiesto y con el árbol de trabajo (huella igual). Sin secretos (valores literales de `.env`/`.env.e2e`, claves, JWT, tokens): 0 coincidencias; ningún `.env`, respaldo, clave ni registro entre los 464 archivos versionados.
* **Saltos de línea:** el índice ya guardaba LF; el árbol de trabajo tenía 243 archivos en CRLF por `core.autocrlf=true`. `.gitattributes` fija `* text=auto eol=lf` (y LF explícito para `.sh`, `.cjs`, `.sql`, `.csv`): `git diff --numstat` da lo mismo con y sin `--ignore-cr-at-eol` (88 archivos, 2335/329), es decir **ningún cambio sólo de CRLF**; los scripts de Linux y las fuentes del contexto Docker son idénticos en cualquier equipo. Se verificó con un clon limpio (`core.autocrlf=true` global): sin CR.
* **Commits** (explícitos por ruta; nunca `git add .`):

| Hash | Contenido |
|---|---|
| `bb74aa1` | `.gitattributes` |
| `9c18221` | Implementaciones I-1 a I-4.1: backend, migraciones V48–V55, frontend, pruebas, compose y `.env.example` (137 archivos) |
| `a94d52e` | Scripts: suite E2E, ensayo V47→V55, ayudante de Flyway, diagnóstico previo (53 archivos) |
| `71327e8` | Documentación (21 archivos) |
| `976443a` | `project.build.outputTimestamp` fijo: el mismo código produce el mismo JAR |
| `7c4019a`, `89326fe`, `e12ce58` | Pruebas de frontend: tope de espera, dos trabajadores de Vitest y la corrección de una carrera real de las pruebas (§C) |
| `d58d9de` | Script del ensayo con las imágenes release — **commit fuente de las imágenes** |
| (último) | Documentación de esta etapa |

  Contenido verificado: los 212 archivos del snapshot son idénticos (normalizados a LF) a los del commit `71327e8`; la única diferencia es `.gitattributes`, reescrito a propósito.

## B. Release

* **SHA fuente de las imágenes:** `d58d9de55ec9c12009361d7b9fdf56d2cef5b80e`, construidas desde un clon limpio (`git clone --no-hardlinks`) en `C:\Users\joaqu\Builds\vuelos-v55`. Los commits posteriores sólo tocan pruebas de frontend, configuración de Vitest y documentación: el árbol `backend-java` es el mismo objeto Git (`2228c8ba…`) y los tres archivos publicados del frontend (`index.html`, `index-sLU9Zm0G.js`, `index-CybeZWt-.css`) son idénticos, byte a byte, a los de una construcción del `HEAD` final. No se reutilizó ninguna imagen E2E.

| Imagen | Etiqueta | ID (inmutable) | Usuario / etiquetas OCI |
|---|---|---|---|
| Backend | `vuelos-sanitarios-backend:release-v55-d58d9de55ec9` | `sha256:d51cfce2ab17fae23f88c004c7705602f9e4912c12732970aba61f0f40ddae3d` | `spring`; `org.opencontainers.image.revision` = SHA fuente, `version=v55` |
| Frontend | `vuelos-sanitarios-frontend:release-v55-d58d9de55ec9` | `sha256:50926d09a266eff3a1702d9be8a833a3ce339731e83eeea7060058ff14c3161a` | nginx; mismas etiquetas |

  Los despliegues se referencian por ID, como en V47 (`BACKEND_RELEASE_IMAGE`, `FRONTEND_RELEASE_IMAGE`); las etiquetas llevan el SHA, no `latest`. Las imágenes V47 para volver atrás siguen presentes (`7b9101528503…` / `9b2b0b6a661a…`). Una primera construcción (`71327e86f56d`) quedó reemplazada por el cambio de la marca de tiempo del JAR: se eliminó y sus pruebas (ensayo, E2E) se repitieron con las imágenes finales.
* **Sin secretos en las imágenes:** variables de entorno sólo de plataforma (PATH, JAVA_*, NGINX_*); 526 archivos de la aplicación y los 4 del frontend escaneados contra los valores literales de `.env`/`.env.e2e` y patrones (clave privada, JWT, correos personales): 0 coincidencias; el historial de capas no menciona `.env` (la única coincidencia textual es el script `15-local-resolvers.envsh` de nginx).
* **JAR reproducible:** dos compilaciones separadas por más de un minuto producen el mismo SHA-256 (`536125F3…B54DB`). El JAR de la imagen difiere del compilado en Windows únicamente en `pom.properties` (fin de línea) y en la zona horaria de las marcas de los índices del ZIP; todas las clases y recursos tienen el mismo tamaño. No se comprobó que dos `docker build` consecutivos den el mismo ID de imagen (los ID de Docker incluyen la fecha de construcción).
* **Reproducir la construcción:**

```powershell
git clone --no-hardlinks --branch release/v55-integracion <repositorio> C:\Users\joaqu\Builds\vuelos-v55
git -C C:\Users\joaqu\Builds\vuelos-v55 checkout d58d9de55ec9c12009361d7b9fdf56d2cef5b80e
$sha = 'd58d9de55ec9c12009361d7b9fdf56d2cef5b80e'; $short = $sha.Substring(0,12)
docker build -t vuelos-sanitarios-backend:release-v55-$short --label org.opencontainers.image.revision=$sha --label org.opencontainers.image.title=vuelos-sanitarios-backend --label org.opencontainers.image.version=v55 C:\Users\joaqu\Builds\vuelos-v55\backend-java
docker build -t vuelos-sanitarios-frontend:release-v55-$short --label org.opencontainers.image.revision=$sha --label org.opencontainers.image.title=vuelos-sanitarios-frontend --label org.opencontainers.image.version=v55 C:\Users\joaqu\Builds\vuelos-v55\frontend-react
```

  Requiere red (Maven Central, npm) y ~10 min para el backend con el contexto nuevo. **No arrancar estas imágenes contra la habitual V47** (`spring.flyway.enabled=true` migraría sola); sólo se ejecutaron contra la base de ensayo.
* **Artefactos archivados fuera de Git** (`C:\Users\joaqu\Backups\VuelosSanitarios`, sin sobrescribir nada): TAR de las dos imágenes, ZIP del bundle de migración (construido *desde la imagen release*: sus migraciones, sus 8 librerías y `FlywayMigrationRunner` compilado), `git bundle` de la rama y `release_v55_manifest_<fecha>.json` con SHA-256, IDs, digests y árbol de contexto.

## C. Pruebas realmente ejecutadas

| Prueba | Dónde | Resultado |
|---|---|---|
| Compilación Java 21 / Spring Boot + **487** pruebas de backend (unitarias e integración) | clon limpio en `71327e8` y de nuevo en `d58d9de` (`mvn -o test`) | 487 / 0 fallos / 0 errores / 0 omitidas, las dos veces. `backend-java` es idéntico en el `HEAD` final |
| Compilación y **211** pruebas de frontend + `vite build` | clon limpio con `npm ci` | 211/211: 5 de 5 corridas con la configuración final; build correcto |
| `node --check` de los scripts Node, `bash -n` de los `.sh`, análisis sintáctico de los `.ps1` | árbol de trabajo | 0 errores; los **37** scripts de la suite existen |
| **Suite E2E: 37 scripts** (API y Chrome) contra el stack aislado **con las imágenes release** (recreado con `docker-compose.release.yml`, `--no-build --pull never`) | stack E2E, `vuelos_sanitarios_e2e` en V55 | **37/37 aprobados** (≈ 1 h 10 min) |
| Migraciones V48–V55 (Flyway real, SQL Server) | ensayo (§D), dos veces: imágenes intermedias y finales | 8 aplicadas, 0 fallidas |
| Respaldo/recuperación (§D, §7 del documento de correo) | habitual (sólo lectura), SQL E2E aislado | Ver §D |

**Defectos corregidos en esta etapa:**

1. `invoke-prepared-flyway-v55.ps1` (I-4.2) ya corregido y ahora probado también en `Migrate` contra la base de ensayo.
2. **Carrera real en las pruebas de `crewContacts`** (fallaban 1 de cada ~3 corridas completas, otra prueba cada vez, nunca solas): el panel registra sus efectos de montaje después del commit que muestra la tripulación; si el clic llegaba antes, el efecto invalidaba la consulta recién iniciada. No es un defecto del producto (requeriría hacer clic en el mismo cuadro de montaje); se corrigió en las pruebas vaciando los efectos (`await act(async () => {})`) y, además, se limitó Vitest a dos trabajadores y se subió el tope de `findBy`/`waitFor` a 10 s. Con 8 trabajadores simultáneos todavía aparece, 1 de 8 veces, un fallo de carga de módulos (`Cannot find module …`) del sistema de archivos de Windows: es presión de recursos del equipo, no de las pruebas.
3. **JAR no reproducible** (marcas de tiempo): `project.build.outputTimestamp` fijo.
4. El script del ensayo recibía `-Stage 1,2` como el número 12 con `pwsh -File`: ahora es una cadena separada por comas.

**Evidencia pendiente (no marcada como aprobada):** el CI remoto (no hay push autorizado); la igualdad bit a bit de dos `docker build` consecutivos; la recuperación desde una copia fuera del equipo; la rama `Migrate` ejecutada *sobre la habitual real* (se ejecutó íntegra sobre una copia del ayudante apuntada a la restauración aislada).

## D. Ensayo V47 → V55 con las imágenes definitivas (`scripts/ensayo-release-v47-v55.ps1`)

Independiente de la base habitual salvo el respaldo `COPY_ONLY` de partida (sólo lectura). Ejecutado completo con las imágenes intermedias y repetido con las **imágenes finales** (`d51cfce2…` / `50926d09…`, por ID).

1. **Estado inicial:** habitual V47 (47/47, 0 fallidas) → respaldo `COPY_ONLY` con `CHECKSUM` → `VERIFYONLY` válido → SHA-256 igual en contenedor y equipo → AES-256-GCM con clave portable → `Verify` → `Restore` idéntico → restaurado en `vuelos_sanitarios_ensayo_v47` del SQL E2E: V47, `DBCC CHECKDB` y `CHECKCONSTRAINTS` sin errores. Sembrado con el contrato V47 usando la **imagen release V47** (10 vuelos, 9 versiones de ruta, 138 eventos de auditoría, cuentas de todos los roles).
2. **Fotografía previa y diagnóstico previo:** 41 tablas, 42 PK, 84 FK; `prevalidate-migrations.ps1` (mismo T-SQL): sin `ISSUE`; avisos esperados de V49/V50 (1 correo duplicado, 1 persona sin principal) y 5 vuelos planificados que requerirán ruta aprobada.
3. **FULL de la ventana** de la restauración sembrada: `COPY_ONLY`, `VERIFYONLY`, AES + `Verify` + recuperación idéntica.
4. **Aplicación controlada:** el **ayudante de producción** (copia con las 7 constantes de destino sustituidas, cada una exactamente una vez) con el bundle construido desde la imagen release: `Validate` → «Successfully validated 55 migrations»; `Migrate -HabitualMigrationExplicitlyAuthorized` → «Successfully applied 8 migrations … now at version v55» en 11 s. La guardia de V47 exacto, la creación/copia/inicio del contenedor y la autorización por versión funcionaron.
5. **Historial y esquema:** Flyway 55, 0 fallidas, V48–V55 con éxito; **43 tablas, 44 PK, 94 FK, 48 CHECK, 214 índices únicos**, 0 FK/CHECK/triggers deshabilitados o no confiables, trigger `tr_eventos_auditoria_inmutable` habilitado; `DBCC CHECKDB` y `CHECKCONSTRAINTS` sin errores. La comparación con la fotografía previa muestra sólo lo previsto: tablas nuevas `contactos_coordinacion_traslado` y `verificaciones_correo`, columnas nuevas, `es_principal` de los duplicados y de la persona sin principal (V49/V50), 2 eventos de auditoría nuevos de V50; **0 filas perdidas**; correos: 13, ninguno verificado; rutas: 4 `BORRADOR` (vuelos sin iniciar) y 5 `SIN_REVISION` (vuelos iniciados o terminados), ninguna aprobada.
6. **Arranque con las imágenes release** (perfil `docker`, `MAIL_ENABLED=false`, como la habitual): backend `UP`; frontend 200; credencial inválida por el proxy 401; administrador existente entra (200); `/api/flights` 200; `/api/e2e/*` 404; solicitar verificación de correo → **503 `MAIL_NOT_CONFIGURED`**; el correo del administrador figura `SIN_VERIFICAR`.
7. **Login y roles / funcionalidades incorporadas (10 bloques `ensayo-funcional-v55.cjs`, perfil de ensayo con Mailpit):** los usuarios, roles y la contraseña administrativa originales autentican; los 10 vuelos históricos y sus rutas se leen; ninguna ruta histórica quedó aprobada; los 5 vuelos planificados rechazan el inicio sin ruta aprobada con un evento de auditoría por intento; presentación, aprobación, devolución, invalidación por cambio de aeronave y nuevo inicio; vuelos sanitarios y operativos; finalización de vuelos iniciados antes y después de V55; documento PDF idéntico byte a byte; tripulación con elegibilidad (I-3); duplicados V49/V50 dados de baja sin borrar; verificación de correo (I-2b) completa; teléfonos anteriores legibles.
8. **Auditoría y consistencia transaccional:** 199 eventos, ninguno sin fecha; eventos de ruta `CREATE`/`UPDATE`/`SUBMIT`/`APPROVE`/`RETURN`/`INVALIDATE`/`START_REJECTED`; 0 rutas huérfanas, 0 verificaciones huérfanas, 0 versiones vigentes duplicadas; el trigger rechazó un `UPDATE` de auditoría (error 51046); `DBCC` limpio después de la prueba.
9. **Recuperación con las versiones correspondientes:** con la base ya en V55 y usada, se restauró el FULL de la ventana (`VERIFYONLY`, `RESTORE … REPLACE`): Flyway **55 → 47**, `DBCC` limpio, **sin diferencias de filas ni de contenido** respecto de la fotografía previa; se arrancaron las **imágenes V47** (backend y frontend release V47) sobre la base restaurada: `UP`, HTML 200, el administrador entra y `/api/flights` 200.
10. **Ensayo negativo con el ayudante:** un documento inactivo sin versiones → el diagnóstico previo lo señala como `ISSUE`; `Migrate` aplica V48–V51 y **se detiene en V52** (`Error Code: 51052 — Hay documentos inactivos sin versiones…`, «Changes successfully rolled back»); Flyway queda en V51 con 0 filas fallidas y `documentos_vuelo` con sus 7 columnas; **el ayudante se niega a continuar** sobre una base en V51 («not exactly at Flyway V47»); la salida prevista es restaurar el FULL anterior, resolver el dato y repetir: V55 en limpio con `DBCC` sin errores.

Todo el material del ensayo (base temporal, contenedores, volumen, archivos con secretos) se eliminó al terminar; los respaldos del ensayo se conservan en `C:\ProgramData\VuelosSanitarios\Backups` (cifrados con claves en `RecoveryKeys`).

## E. Riesgos y condiciones para el despliegue

* **Correo/SMTP:** limitación aceptable, no bloqueo (detalle, funcionalidades afectadas y alternativas en `CORREO_Y_CUSTODIA_DE_RESPALDOS_V55_I43_2026-10-26.md`). No se inventaron credenciales ni se habilitó ningún mecanismo de verificación alternativo. Decisión pendiente: desplegar sin SMTP, o aportar los datos del proveedor.
* **Custodia de respaldos:** todo sigue en el mismo equipo y disco. Qué copiar fuera (cifrados y claves por canales separados, `.env`, imágenes, bundle, herramientas) y cómo comprobar la recuperación externa están en el mismo documento; **nada se copió fuera** sin autorización.
* **Recursos:** Docker Desktop (VM de 3,45 GiB) sostiene dos SQL Server; con el equipo anfitrión entre 80 MB y 1,2 GB libres durante la etapa. Pausar el backend y el frontend E2E durante la ventana; no ejecutar Maven/Vitest/E2E a la vez; cerrar SSMS (2 sesiones abiertas sobre la habitual).
* **Pendientes:** CI remoto (requiere push autorizado); rama `Migrate` ejercitada sólo sobre la restauración (la habitual se migraría por primera vez con la ventana); la recuperación desde una copia externa; un nuevo respaldo `FULL` dentro de la ventana (los del ensayo no lo sustituyen); aviso a Operaciones de que los vuelos `PLANIFICADO` necesitarán ruta aprobada (hoy la habitual tiene 0 vuelos).
* **Condiciones necesarias para pedir la ventana:** (1) tu autorización expresa y por separado de la migración V47 → V55; (2) decisión sobre SMTP; (3) copia externa de los respaldos y claves (o aceptación explícita del riesgo); (4) responsable presente durante toda la ventana; (5) SSMS cerrado y el E2E pausado; (6) ejecutar el procedimiento de `PROCEDIMIENTO_ACTUALIZACION_V47_V55.md` y `PREPARACION_FINAL_DESPLIEGUE_V47_V55_I42_2026-10-25.md` §6 con los IDs de imagen de §B y `pwsh` 7.4; (7) `Validate` inmediatamente antes de `Migrate`.

## F. Decisión final

**RELEASE LISTA PARA SOLICITAR AUTORIZACIÓN.** Evidencia: rama consolidada con árbol limpio y contenido idéntico al protegido; imágenes construidas desde un clon limpio del commit identificado, sin secretos y con JAR reproducible; 487 pruebas de backend, 211 de frontend y 37 scripts E2E aprobados con las imágenes release; ensayo completo V47 → V55 con esas imágenes (migración, funcionalidad, auditoría, DBCC) más recuperación con las imágenes V47 y caso negativo; habitual intacta en V47. Lo que queda abierto está en §E y no impide pedir la ventana; ninguna migración real se ejecutó ni se ejecutará sin la autorización nueva.
