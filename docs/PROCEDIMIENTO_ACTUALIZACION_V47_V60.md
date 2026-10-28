# Procedimiento para actualizar la base habitual de Flyway V47 a V60 (candidata de release I-5.7)

**Estado: preparado y ensayado en restauraciones aisladas. NO se ejecutó en la base habitual**, que sigue en V47. Ejecutarlo requiere la autorización humana expresa de una ventana de mantenimiento; este documento no la otorga. Reemplaza, para la candidata V60, al procedimiento V47→V55 (`PROCEDIMIENTO_ACTUALIZACION_V47_V55.md`), cuyo detalle de V48–V55 sigue vigente y no se repite.

**No hay reversibilidad por Flyway.** Flyway Community no tiene «undo» y estas migraciones agregan columnas, tablas, restricciones, triggers y datos derivados. Si algo falla, la recuperación es **restaurar el respaldo FULL tomado dentro de la ventana** (§8) y arrancar las imágenes V47 archivadas. Está prohibido `flyway repair`, editar `flyway_schema_history` o modificar una migración ya aplicada.

## 1. Qué cambia respecto de V55

| Migración | Efecto | Qué verá el negocio |
|---|---|---|
| V56 | Índices sobre claves de aeropuerto (rutas, coordinaciones AA2000, hangar) | Nada. |
| V57 | Índice único de licencia de comandante (`numero_licencia_normalizada`) | Si hubiera dos comandantes con la misma licencia la migración **se detiene** (diagnóstico previo, §3). |
| V58 | Baja lógica de clasificaciones de tripulación | Retirar una clasificación pide motivo y se rechaza si hay vuelos abiertos que dependen de ella. |
| V59 | Política de suficiencia, decisiones, consultas externas, ciclo de vida de habilitaciones, documentos con cuarentena y huella | **Nadie es elegible hasta que se active una política** (no se siembra ninguna). Los documentos de habilitación existentes quedan `LEGADO_SIN_ANALISIS`. |
| V60 | Triggers de inmutabilidad (decisiones, consultas, políticas, documentos), trazabilidad de lotes de políticas y condición permanente de «anterior a V59» | Sin cambio visible. |

La base habitual de hoy (V47) tiene **1 usuario, 0 habilitaciones, 0 documentos y 0 vuelos** (lectura 2026-10-28): V57 y V59/V60 no encontrarán nada que reclasificar, y no habrá documentos heredados que regularizar. El procedimiento cubre igualmente el caso de una copia con datos.

## 2. Garantías de la ventana (cómo se evita operar con una base o configuración incompatible)

1. **El código nuevo nunca migra por su cuenta.** En producción `SPRING_FLYWAY_ENABLED=false` (`docker-compose.prod.yml`): el backend nuevo contra una base V47 **no arranca** (Hibernate `ddl validate` falla por columnas y tablas ausentes) en lugar de migrar sin respaldo. En desarrollo y en el E2E sí migra al arrancar, por diseño de esos entornos.
2. **El código viejo nunca se ejecuta sobre la base migrada.** Los web se mantienen detenidos desde el paso 2 hasta la verificación; el regreso a V47 se hace restaurando el FULL de la ventana y arrancando las imágenes V47 archivadas.
3. **Ningún usuario opera sin configuración obligatoria.** Con la aplicación publicada recién migrada, no existen políticas: la elegibilidad responde `POLITICA_HABILITACION_NO_CONFIGURADA` y no se pueden asignar tripulantes ni iniciar vuelos con comandante hasta activar la política (cerrado por omisión). Aun así, **el frontend no se publica a los usuarios** hasta que la lista de preparación (`GET /api/admin/readiness`) muestre **sin pendientes obligatorios** o hasta que el responsable acepte por escrito abrir con funciones restringidas.
4. **Antivirus como precondición de los documentos**, no de la apertura: sin analizador acreditado todo documento queda en cuarentena (seguro). Si se quiere abrir con documentos habilitados, el antivirus completo debe estar acreditado antes (§6).
5. Orden estricto: base migrada → backend nuevo (sin frontend, acceso sólo administrativo) → política activada y verificada → regularización (si hay heredados) → frontend/apertura.

## 3. Requisitos previos (todos, antes de pedir la ventana)

1. Autorización escrita de la ventana (inicio, responsable, criterio de aborto) y aviso a Operaciones y comandantes sobre: vuelos planificados que necesitarán ruta aprobada (V55) y funciones sin elegibilidad hasta la activación de la política (V59).
2. **Decisiones de negocio cerradas o aceptadas como pendientes por escrito**: contenido de la política (`POLITICAS_HABILITACION_PROPUESTA_I57_2026-10-28.md`), plazos de aviso, retención, proveedor de correo y antivirus. Lo pendiente no bloquea migrar (se migra cerrado por omisión) pero sí abrir la operación.
3. El código a desplegar es exactamente el ensayado: registrar commit, digest de las imágenes `backend` y `frontend`, hash del bundle y del `FlywayMigrationRunner` compilado. Repetir el ensayo completo si el árbol cambió.
4. Bundle de migración V60 (`classes` con `db/migration` —60 archivos— y clases Java, `libs` con Flyway, JDBC y Jackson) archivado fuera de Git con su SHA-256. Imágenes `release-v60-<fecha>` con digest `sha256:` para `docker-compose.release.yml`.
5. Imágenes V47 vigentes archivadas (`docker image save`) para volver atrás; volumen de documentos respaldado.
6. Respaldos anteriores y clave portátil accesibles (`C:\ProgramData\VuelosSanitarios`); espacio para un FULL adicional y una restauración de prueba.
7. PowerShell 7.4+ (`C:\Users\joaqu\AppData\Local\Programs\PowerShell-7.4.13-portable\pwsh.exe`) para `protect-sql-backup.ps1` e `invoke-prepared-flyway-v60.ps1`.
8. Docker Desktop con la VM de 3,45 GiB sin carga extra: pausar los web E2E durante la ventana y no iniciar instancias adicionales de SQL Server. **El antivirus completo no cabe en este equipo junto con el resto** (`PREPARACION_PRODUCCION_I57_2026-10-28.md` §2): si la producción es esta máquina, ClamAV va en otro equipo.
9. `.env.production` completado desde `.env.production.example` (sin `BOOTSTRAP_ADMIN_*` salvo primer inicio), `docker compose … config -q` sin errores.

## 4. Condiciones que impiden iniciar (si alguna se cumple, NO se actualiza)

* La base habitual no está exactamente en **V47**, o `flyway_schema_history` tiene filas con `success = 0`.
* `scripts/prevalidate-migrations.ps1` informa cualquier línea `ISSUE` (documentos inactivos sin versiones, claves no confiables, licencias de comandante duplicadas, solapamientos). Las `WARNING` de V49/V50 se registran y aceptan explícitamente.
* El FULL de la ventana no verifica (`RESTORE VERIFYONLY … WITH CHECKSUM`), su SHA-256 difiere, no se descifra con la clave portátil o su restauración de prueba no pasa `DBCC CHECKDB`.
* La validación de checksums del bundle (`invoke-prepared-flyway-v60.ps1`, modo `Validate`) no informa que valida las 60 migraciones.
* Hay escritores activos que no pueden detenerse, o los web habituales siguen levantados.
* Imágenes o bundle distintos de los ensayados, o falta la imagen V47 para volver atrás.
* Memoria o disco insuficientes, o un OOM reciente de Docker/SQL Server.
* No hay una persona responsable de decidir la restauración durante toda la ventana.
* Si se pretende abrir con documentos habilitados: el antivirus no pasa `scripts/verificar-antivirus-produccion.cjs`.

## 5. Secuencia

1. **Registro previo** (sin impacto): versión del motor, collation, modelo de recuperación, tamaño y último respaldo; `prevalidate-migrations.ps1` guardando la salida; lista de preparación del entorno destino si ya existe.
2. **Detener escrituras**: `docker stop --timeout 30 vuelos-sanitarios-frontend-1 vuelos-sanitarios-backend-1`; confirmar que no hay sesiones de usuario.
3. **FULL inmediato dentro de la ventana** con `CHECKSUM`, `RESTORE VERIFYONLY`, copia al directorio protegido, SHA-256 en origen y destino, cifrado con `protect-sql-backup.ps1` (clave portátil aparte, nunca en consola, chat ni Git), restauración de prueba con otro nombre y `DBCC CHECKDB`. Si no pasa, abortar.
4. **Fotografía previa** (`scripts/ensayo-snapshot.cjs`, sólo lectura).
5. **Validar y migrar** con el bundle V60 (los dos web detenidos; el ayudante rechaza una base que no esté exactamente en V47 y exige una autorización distinta para el objetivo 60):

   ```powershell
   & $pwsh -File .\scripts\invoke-prepared-flyway-v60.ps1 -BundlePath $bundleV60 -RuntimeImage $env:BACKEND_RELEASE_IMAGE                     # Validate
   & $pwsh -File .\scripts\invoke-prepared-flyway-v60.ps1 -BundlePath $bundleV60 -RuntimeImage $env:BACKEND_RELEASE_IMAGE -Mode Migrate -HabitualMigrationExplicitlyAuthorized
   ```

   Se aplican V48 a V60 en orden, cada una en su transacción. Si una falla: **detenerse**, capturar el mensaje exacto, y decidir con el responsable entre corregir el dato y repetir sobre la restauración del FULL, o restaurar (§8). Nunca editar la migración fallida ni reparar el historial.
6. **Fotografía posterior y comparación**; verificar los criterios de §7.
7. **Arrancar el backend V60** (imagen fija, `SPRING_FLYWAY_ENABLED=false`, sin frontend) con `docker-compose.prod.yml`; esperar `healthy`. Comprobar `GET /api/admin/readiness`: esquema `V60` sin pendientes, almacenamiento y secreto en verde; las cuatro `POLITICA_*` aparecerán pendientes (esperado).
8. **Activar la política** por el procedimiento aprobado (`POLITICAS_HABILITACION_PROPUESTA_I57_2026-10-28.md` §5): simular, aprobar la huella, activar. Sin decisiones de negocio cerradas se **omite** este paso y la operación no se abre.
9. **Regularizar documentos heredados** si el informe (`/professional-credential-documents/legacy/report`) los lista y el antivirus está acreditado (`DOCUMENTOS_HEREDADOS_REGULARIZACION_I57_2026-10-28.md` §6). En la habitual actual no hay ninguno.
10. **Publicar el frontend** y reabrir; smoke sólo de lectura y registro de versión, digests, salud, memoria y ausencia de OOM. Conservar evidencias y el FULL de la ventana.

## 6. Dependencias del antivirus

* **Sin antivirus acreditado**: se puede migrar, activar políticas y abrir sin documentos de habilitación; todo documento cargado queda en cuarentena (`ERROR_ANALISIS`), no se descarga y no permite verificar. Es el comportamiento seguro, no un error.
* **Con antivirus completo**: `node scripts/verificar-antivirus-produccion.cjs --host <clamd>` debe terminar en `ACREDITADO` (versión de firmas > 0, ≤ 7 días, EICAR detectado). Recién entonces se carga documentación, se regulariza y se verifica.
* Esta prueba **no pudo ejecutarse en este equipo** por memoria; queda como condición de apertura documental.

## 7. Criterios de aceptación

1. `flyway_schema_history` termina en **V60**, 0 filas fallidas, V1–V47 con sus checksums originales.
2. `DBCC CHECKCONSTRAINTS WITH ALL_CONSTRAINTS` sin filas; 0 claves foráneas y 0 CHECK no confiables; triggers `tr_eventos_auditoria_inmutable`, `tr_decisiones_habilitacion_inmutable`, `tr_consultas_externas_inmutable`, `tr_politicas_habilitacion_proteccion` y `tr_documentos_habilitacion_integridad` presentes.
3. **45 tablas de negocio** y las de infraestructura que ya existían: en la habitual, **47 físicas = 45 de negocio + `flyway_schema_history` + `sysdiagrams`** (esta última la crea SSMS, existe hoy en la habitual y se conserva); en una base creada desde cero, 46 (`node scripts/inventario-tablas.cjs --container vuelos-sanitarios-sqlserver-1 --db vuelos_sanitarios --env .env` → `CONCILIADO` contra `MATRIZ_FUNCIONAL_I5`; antes de migrar informa exactamente las 5 tablas que faltan).
4. Ninguna fila perdida: el número de filas de cada tabla previa es igual al previo (excepto `eventos_auditoria`); contenido idéntico salvo lo derivado de V49/V50, V58 y V59 documentado.
5. Rutas: 0 versiones `APROBADA`, `PENDIENTE_REVISION` o `DEVUELTA` (V55).
6. `politicas_habilitacion` vacía hasta el paso 8; `documentos_habilitacion`: todos los previos `LEGADO_SIN_ANALISIS` con `origen_registro = ANTERIOR_V59`.
7. Backend y frontend saludables, sin errores de arranque ni OOM; lista de preparación sin pendientes **obligatorios** antes de abrir.

Si un criterio falla: no reabrir; corrección hacia adelante revisada o restauración (§8).

## 8. Recuperación (por restauración; comprobada)

Mantener los web detenidos y conservar evidencia de la base fallida antes de descartarla. Recuperar el FULL de la ventana (descifrar con la clave portátil), `VERIFYONLY` y SHA-256, y con el responsable elegir restauración completa (`RESTORE … WITH REPLACE, CHECKSUM, RECOVERY` previa `SINGLE_USER WITH ROLLBACK IMMEDIATE`; destructivo y reservado a la recuperación decidida). Verificar V47, `DBCC CHECKDB` y los conteos de la fotografía previa; arrancar las **imágenes V47 archivadas** y restaurar el volumen de documentos del mismo punto. La restauración se **comprobó** en cada ensayo (paso 3 y `scripts/ensayo-release-v47-v55.ps1` para V55; para V60 ver el informe de ensayo). Recomendación: tras la reapertura, tomar un FULL posterior para tener un punto de retorno que ya incluya V60.

## 9. Ensayos y límites

Ensayo reproducible: `ENSAYO_WORK=<dir C:/…> scripts/ensayo-migracion-v47-v60.sh` (restauración aislada del respaldo V47 pristino, siembra con el contrato V47, 60 checksums, V48…V60 una por una, fotografías, backend V60 actual con ClamAV real y `ensayo-funcional-v60.cjs`: simulación y activación de la política sobre los datos migrados, regularización de los 8 documentos heredados y el resto de las comprobaciones funcionales). **No comprobado:** ejecución sobre datos reales complejos (la habitual sólo tiene un usuario), antivirus con base completa, SMTP real, recuperación desde una copia fuera del equipo y rendimiento con volúmenes grandes.
