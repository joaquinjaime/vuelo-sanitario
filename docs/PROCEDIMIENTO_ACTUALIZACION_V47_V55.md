# Procedimiento para actualizar la base habitual de Flyway V47 a V55

**Estado: preparado y ensayado en una restauración aislada (2026-10-25). NO se ejecutó en la base habitual**, que sigue en V47. Ejecutarlo requiere la autorización humana expresa de una ventana de mantenimiento; este documento no la otorga. El ensayo (`scripts/ensayo-migracion-v47-v55.sh`, `scripts/ensayo-migracion-negativa.sh`) demostró que el procedimiento es viable, pero no sustituye las verificaciones de la ventana real.

**Actualización I-4.2 (2026-10-25):** las herramientas de este procedimiento se ejecutaron de verdad y se corrigieron tres defectos de `invoke-prepared-flyway-v55.ps1`; el estado, las precondiciones verificadas, el orden de la ventana y los bloqueos vigentes están en `PREPARACION_FINAL_DESPLIEGUE_V47_V55_I42_2026-10-25.md`, que prevalece sobre lo que siga siendo contradictorio aquí.

**No hay reversibilidad por Flyway.** Flyway Community no tiene "undo" y estas migraciones agregan columnas, tablas, restricciones y datos derivados. Si algo falla o se rechaza el resultado, la recuperación es **restaurar el respaldo FULL tomado dentro de la ventana** (§7). `flyway repair`, editar `flyway_schema_history` o modificar una migración ya aplicada están prohibidos.

## 1. Qué cambia (V48 a V55) y qué verá el negocio

| Migración | Efecto |
|---|---|
| V48 | `personas.version_identidad` (control de edición simultánea). |
| V49 / V50 | Contactos con baja lógica y unicidad por persona. Un correo o teléfono repetido de una misma persona se da de baja como `DUPLICADO_MIGRACION` (no se borra) y V50 lo audita y promueve un contacto principal en las personas que tenían contactos pero ninguno principal. |
| V51 | Tabla `contactos_coordinacion_traslado`. |
| V52 | Baja lógica de documentos de vuelo. **Se detiene con `THROW 51052` si hay documentos inactivos sin versiones.** |
| V53 | `tipos_documento.solo_vuelo_sanitario` (el parte médico sólo en vuelos sanitarios). |
| V54 | Verificación de correos (`verificaciones_correo`, `fecha_verificacion`) y país de los teléfonos: **todos los correos existentes quedan "sin verificar"** y los teléfonos anteriores sin país, hasta que sus titulares los confirmen. |
| V55 | Revisión operativa de rutas: estado de revisión por versión. **Ninguna ruta existente se marca aprobada.** |

Consecuencia operativa que debe comunicarse antes de la ventana: **todo vuelo `PLANIFICADO` que aún no inició necesitará que el comandante presente su ruta y Operaciones la apruebe antes del inicio** (409 `RUTA_*` en caso contrario). Un vuelo ya iniciado no se afecta. Las versiones de ruta de vuelos iniciados, finalizados o cancelados quedan `SIN_REVISION` y las de vuelos pendientes de iniciar `BORRADOR`.

## 2. Requisitos previos (todos, antes de pedir la ventana)

1. Autorización escrita de la ventana (hora de inicio, responsable, criterio de aborto) y aviso a Operaciones y comandantes sobre el §1.
2. El código a desplegar es exactamente el ensayado: registrar el hash del commit/árbol de trabajo, el digest de las imágenes `backend` y `frontend` V55 y el hash del bundle de migración; el ensayo debe haberse ejecutado con esas mismas imágenes (`vuelos-sanitarios-e2e-backend`/`-frontend` construidas del mismo árbol). Repetir el ensayo completo si el árbol cambió.
3. Bundle de migración V55 (`classes` con `db/migration` y las clases Java, `libs` con Flyway, JDBC y Jackson) construido con el mismo procedimiento del bundle V47 (`backend-java\target\ops-flyway-release`) y archivado fuera de Git con su SHA-256. Etiquetar y archivar las imágenes V55 como `release-v55-<fecha>` (`BACKEND_RELEASE_IMAGE` y `FRONTEND_RELEASE_IMAGE` con su digest `sha256:` para `docker-compose.release.yml`). Compilar `scripts/FlywayMigrationRunner.java` de este árbol: contiene la autorización por versión (`V47_TO_V55_AUTHORIZED` para el objetivo 55).
4. Imágenes V47 vigentes archivadas (`vuelos-sanitarios-backend|frontend:release-v47-20261023`, `docker image save`) para volver atrás; el volumen de documentos respaldado (hoy sin documentos en la habitual: repetir la comprobación en la ventana).
5. Respaldos de V32/V47 anteriores y su clave portátil accesibles (`C:\ProgramData\VuelosSanitarios\Backups` y `\RecoveryKeys`); espacio libre para un FULL adicional (la base pesa unos 340 MB de archivos; el FULL del ensayo ocupó unos 16 MB) y para la restauración de prueba.
6. PowerShell 7.4+ con AES-GCM (`protect-sql-backup.ps1`, `invoke-prepared-flyway-v55.ps1`). **Resuelto en I-4.2:** `pwsh` 7.4.13 portable en `C:\Users\joaqu\AppData\Local\Programs\PowerShell-7.4.13-portable\pwsh.exe` (hash verificado contra el release oficial); ambos ayudantes se ejecutaron (23/23 pruebas de cifrado y `Validate` 10/10 contra la habitual) y se corrigieron tres defectos. Ejecutar siempre con ese `pwsh`, no con `powershell` 5.1.
7. Docker Desktop con la VM de 3,45 GiB sin carga extra: pausar los web E2E durante la ventana y **no iniciar instancias adicionales de SQL Server**.

## 3. Condiciones que impiden iniciar (si alguna se cumple, NO se actualiza)

* La base habitual no está exactamente en Flyway **V47**, o `flyway_schema_history` tiene filas con `success = 0`.
* `scripts/prevalidate-migrations.ps1` (versión de este árbol) informa cualquier línea **`ISSUE`**. En particular: `hay documentos inactivos sin versiones` (V52 se detendría), claves o restricciones no confiables, solapamientos de recursos. Las líneas `WARNING` de V49/V50 (duplicados y personas sin contacto principal) son esperables, se registran y se aceptan explícitamente.
* El FULL de la ventana no verifica (`RESTORE VERIFYONLY ... WITH CHECKSUM` falla), su SHA-256 difiere de la copia, no se puede descifrar con la clave portátil o su restauración de prueba no pasa `DBCC CHECKDB`.
* La validación de checksums del bundle (`invoke-prepared-flyway-v55.ps1` en modo `Validate`, o `FlywayMigrationRunner 55 validate`) no informa `Successfully validated 55 migrations`.
* Hay escritores activos que no pueden detenerse (sesiones abiertas en `sys.dm_exec_sessions` distintas de la propia, tareas programadas, integraciones) o el backend/frontend habituales siguen levantados.
* Las imágenes o el bundle no coinciden con los ensayados, o falta la imagen V47 para volver atrás.
* Memoria o disco insuficientes, o un OOM reciente de Docker/SQL Server.
* No hay una persona responsable de decidir la restauración durante toda la ventana.

## 4. Secuencia (con los servicios habituales detenidos)

1. **Registro previo (sin impacto).** Versión del motor, collation (`SQL_Latin1_General_CP1_CI_AS`), modelo de recuperación (FULL), tamaño y último respaldo. Ejecutar el diagnóstico de lectura y guardar la salida:

   ```powershell
   ./scripts/prevalidate-migrations.ps1 -Server 'tcp:127.0.0.1,14330' -Database 'vuelos_sanitarios'
   ```

2. **Detener escrituras.** `docker stop --timeout 30 vuelos-sanitarios-frontend-1 vuelos-sanitarios-backend-1`; confirmar que ambos están detenidos y que no hay sesiones de usuario en `sys.dm_exec_sessions`. Pausar los web E2E.
3. **FULL inmediato dentro de la ventana** (no reutilizar uno anterior):

   ```sql
   BACKUP DATABASE [vuelos_sanitarios] TO DISK = N'/var/opt/mssql/backup/vuelos_sanitarios_v47_full_pre_v55_<AAAAMMDD_HHMMSS>.bak'
     WITH CHECKSUM, COMPRESSION, INIT, STATS = 10;
   RESTORE VERIFYONLY FROM DISK = N'/var/opt/mssql/backup/vuelos_sanitarios_v47_full_pre_v55_<AAAAMMDD_HHMMSS>.bak' WITH CHECKSUM;
   ```

   (El ensayo usó `COPY_ONLY` para no alterar la cadena de respaldos; en la ventana real aplica el criterio de la política vigente.) Copiarlo al directorio protegido, registrar su SHA-256 en origen y destino, protegerlo y verificarlo:

   ```powershell
   ./scripts/protect-sql-backup.ps1 -Mode Protect -KeyProtection PortableKeyFile -InputPath "$store\Backups\$name.bak" -KeyPath "$store\RecoveryKeys\$name.key"
   ./scripts/protect-sql-backup.ps1 -Mode Verify  -KeyProtection PortableKeyFile -InputPath "$store\Backups\$name.bak.aesgcm" -KeyPath "$store\RecoveryKeys\$name.key"
   ```

   La clave (32 bytes aleatorios) se guarda aparte del cifrado, con permisos restringidos, y **no se muestra ni se pega** en consola, chat, argumentos o Git. Restaurar el FULL con otro nombre en el SQL E2E existente (ver `scripts/ensayo-migracion-v47-v55.sh`, paso 1) y ejecutar `DBCC CHECKDB`: si no pasa, abortar.
4. **Fotografía previa** (sólo lectura; sin datos personales ni secretos):

   ```powershell
   $env:SNAPSHOT_ALLOW_DB='vuelos_sanitarios'; $env:E2E_DB_NAME='vuelos_sanitarios'; $env:E2E_SQL_CONTAINER='vuelos-sanitarios-sqlserver-1'
   node scripts/ensayo-snapshot.cjs "$evidencia\snap-pre.json"
   ```

5. **Validar y migrar con el bundle V55** (los dos web detenidos; el ayudante lo exige y además rechaza una base que no esté exactamente en V47):

   ```powershell
   ./scripts/invoke-prepared-flyway-v55.ps1 -BundlePath $bundleV55 -RuntimeImage $env:BACKEND_RELEASE_IMAGE            # Validate
   ./scripts/invoke-prepared-flyway-v55.ps1 -BundlePath $bundleV55 -RuntimeImage $env:BACKEND_RELEASE_IMAGE -Mode Migrate -HabitualMigrationExplicitlyAuthorized
   ```

   Se aplican V48 a V55 en orden, cada una en su transacción. Si una falla, **detenerse**: SQL Server revierte esa migración completa (comprobado con V52), `flyway_schema_history` conserva la última exitosa, se captura el mensaje exacto y se decide con el responsable entre corregir el dato y reanudar, o restaurar (§7). Nunca editar la migración fallida ni reparar el historial.
6. **Fotografía posterior y comparación** (`snap-post.json` contra `snap-pre.json`): filas y contenido por tabla, claves, restricciones, vuelos, rutas y auditoría. Las diferencias aceptables son exclusivamente las del §6.
7. **Arrancar primero el backend V55** con la imagen fija y sin `db-init`, esperar `healthy`, y recién después el frontend:

   ```powershell
   docker compose --env-file .env -p vuelos-sanitarios -f docker-compose.yml -f docker-compose.release.yml up -d --no-build --pull never --no-deps backend
   docker exec vuelos-sanitarios-backend-1 curl --fail --silent http://127.0.0.1:8080/actuator/health
   docker compose --env-file .env -p vuelos-sanitarios -f docker-compose.yml -f docker-compose.release.yml up -d --no-build --pull never --no-deps frontend
   ```

8. **Smoke sólo de lectura** y reapertura (§5 y §6). Registrar versión V55, digests, salud, memoria y ausencia de OOM; conservar evidencias y el FULL de la ventana.

## 5. Verificación de backend y frontend

* Backend: arranca sin errores (`ddl validate` y Flyway sin migraciones pendientes), `actuator/health` UP, login del administrador existente y de un usuario de cada rol, `GET /api/flights` y el detalle de vuelos existentes, `GET /api/flights/{id}/route` de los vuelos planificados, `GET /api/audit/flights/{id}`.
* Frontend: la página carga, el proxy `/api` responde (401 ante credenciales inválidas), el selector de Operaciones muestra el estado de ruta, y el comandante ve la pantalla de ruta con las versiones anteriores.
* No ejecutar los E2E ni inyectar datos de prueba en la habitual. Si se necesitan escrituras de comprobación, se hacen sólo en la restauración de ensayo.

## 6. Validaciones posteriores y criterios de aceptación

Se acepta la actualización si, y sólo si, se cumple todo:

1. `flyway_schema_history` termina en **V55** con 0 filas fallidas y V1 a V47 con sus checksums originales.
2. `DBCC CHECKCONSTRAINTS WITH ALL_CONSTRAINTS` sin filas; 0 claves foráneas y 0 restricciones CHECK no confiables; el trigger `tr_eventos_auditoria_inmutable` presente.
3. Conteos esperados: **43 tablas de aplicación** (sin contar `flyway_schema_history`; se agregan `contactos_coordinacion_traslado` y `verificaciones_correo`), 44 claves primarias y 94 foráneas, 48 restricciones CHECK (en el ensayo, partiendo de 41/42/84/30).
4. Ninguna fila perdida: el número de filas de cada tabla existente es igual al previo (excepto `eventos_auditoria`, que sólo crece por los eventos de V50) y el contenido de las columnas previas es idéntico salvo `correos_electronicos` y `telefonos` (únicamente `es_principal` de los duplicados y de las personas sin principal, por V49/V50).
5. Rutas: 0 versiones en `APROBADA`, `PENDIENTE_REVISION` o `DEVUELTA`; las versiones vigentes de vuelos `PLANIFICADO` en `BORRADOR`; las demás en `SIN_REVISION`; `approvedWithoutRealReview = 0`.
6. Usuarios, roles, cuentas, habilitaciones (verificadas) y vuelos por tipo y estado iguales a la fotografía previa; la autenticación existente funciona.
7. Documentos: mismas filas y versiones; los PDF se descargan idénticos (hash).
8. Correos existentes `SIN_VERIFICAR` (ninguno `VERIFICADO` sin evidencia).
9. Backend y frontend saludables, sin errores de arranque ni OOM.

Si cualquier criterio no se cumple: no reabrir el servicio; decidir con el responsable entre corrección hacia adelante revisada o restauración (§7).

## 7. Recuperación (por restauración; Flyway no revierte)

Mantener los web detenidos y conservar evidencia de la base fallida (respaldo y diagnóstico) antes de descartarla. Recuperar el FULL de la ventana (descifrar con la clave portátil si corresponde), verificar `VERIFYONLY` y SHA-256, y con el responsable elegir restauración completa. Con escritores detenidos y el destino comprobado:

```sql
USE master;
ALTER DATABASE [vuelos_sanitarios] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
RESTORE DATABASE [vuelos_sanitarios] FROM DISK = N'/var/opt/mssql/backup/<FULL_DE_LA_VENTANA>.bak'
  WITH REPLACE, CHECKSUM, RECOVERY,
  MOVE N'vuelos_sanitarios' TO N'/var/opt/mssql/data/vuelos_sanitarios.mdf',
  MOVE N'vuelos_sanitarios_log' TO N'/var/opt/mssql/data/vuelos_sanitarios_log.ldf';
ALTER DATABASE [vuelos_sanitarios] SET MULTI_USER;
```

`WITH REPLACE` es destructivo y se reserva a la recuperación decidida. Verificar V47, `DBCC CHECKDB` y los conteos de la fotografía previa; arrancar las **imágenes V47 archivadas** (no las V55) y restaurar el volumen de documentos del mismo punto si corresponde. Si la restauración falla, mantener el mantenimiento y resolver el estado de la base antes de arrancar servicios. No restaurar `master`.

## 8. Vuelos planificados pendientes de revisión (después de aceptar)

Listar para Operaciones los vuelos que necesitarán ruta aprobada antes de iniciar (sólo lectura):

```sql
SELECT v.codigo_vuelo, v.fecha_planificada_salida, r.version, r.estado_revision
FROM vuelos v JOIN estados_vuelo e ON e.id_estados_vuelo = v.id_estados_vuelo
LEFT JOIN rutas_vuelo r ON r.id_vuelos = v.id_vuelos AND r.es_version_actual = 1
WHERE e.codigo_estado_vuelo = N'PLANIFICADO' ORDER BY v.fecha_planificada_salida;
```

`estado_revision` `NULL` (sin ruta) o `BORRADOR` indica que el comandante debe planificar o presentar la ruta; la cola "Rutas pendientes de revisión" de Operaciones muestra las que ya se presentaron. Nada se aprueba automáticamente.

## 9. Lo que el ensayo comprobó y lo que no

Comprobado (restauración aislada de un FULL `COPY_ONLY` de la habitual, verificado con checksum y `DBCC CHECKDB`): validación de los checksums V1 a V47; V48 a V55 aplicadas una por una sin errores; comparación de datos antes y después; arranque del backend V55 con `ddl validate`; prueba funcional (vuelos, rutas, inicio, finalización, documentos idénticos, habilitaciones, verificación de correo, tripulación); y la falla controlada de V52 con reanudación. **No comprobado:** (la ejecución de `protect-sql-backup.ps1` e `invoke-prepared-flyway-v55.ps1` quedó comprobada en I-4.2, salvo la rama `Migrate` sobre la habitual); datos reales de producción complejos (la base habitual sólo tenía 1 usuario y ningún vuelo, por lo que la restauración se pobló con datos con el contrato V47); rendimiento con volúmenes grandes; recuperación desde una copia fuera del equipo.
