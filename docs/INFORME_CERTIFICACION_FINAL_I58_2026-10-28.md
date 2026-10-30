# Informe de certificación final — I-5.8 (candidata V60)

Fecha: 2026-10-28/29 · Rama: `feature/completitud-funcional-post-v55` (commits locales; sin push) · Base habitual: **V47, no modificada** · Base E2E certificada: **V60**.

Documentos de apoyo: `DECISION_POLITICAS_PROFESIONALES_I58_2026-10-28.md`, `SEPARACION_CUENTAS_Y_ANTIMALWARE_I58_2026-10-28.md`, `REVISION_REQUISITOS_Y_DEPENDENCIAS_I58_2026-10-28.md`, `PROCEDIMIENTO_PUESTA_EN_PRODUCCION_I58_2026-10-28.md`, `evidencia-i58/`.

## A. Resultado general: las 45 tablas de negocio

**Las 45 tablas de negocio están funcionales, con evidencia verificable y sin reclasificaciones artificiales.**

* Inventario real: SQL Server tiene **46 tablas físicas = 45 de negocio + `flyway_schema_history`** (la habitual migrada tendrá además `sysdiagrams` de SSMS: 47). La diferencia con la «42» de la matriz de I-5.6 estaba explicada y conciliada en I-5.7 (`CONCILIACION_TABLAS_I57_2026-10-28.md`); `inventario-tablas.cjs` da CONCILIADO.
* **Criterio nuevo e independiente de las filas de prueba** (`scripts/auditoria-funcional-tablas-i58.cjs`, salida en `evidencia-i58/auditoria-tablas.md|json`): una tabla se marca *integrada* sólo si tiene (1) mapeo JPA, (2) al menos un servicio/controlador de producción que la **escribe**, (3) al menos uno que la **lee**, (4) pruebas JUnit o E2E que la ejercen y (5) relaciones FK. Resultado: **45/45 integradas**, ninguna a revisar. (El primer pase marcó `documentos_vuelo` por un fallo del propio auditor —su repositorio no sigue la convención de nombres—; se corrigió el auditor, no la clasificación.)
* Tablas V59 (`politicas_habilitacion`, `decisiones_habilitacion`, `consultas_externas_habilitacion`) y cambios de V60 (5 triggers de inmutabilidad/protección; columnas `origen_registro`, `hash_momento`, `fecha_regularizacion`, `id_usuario_regularizacion` en `documentos_habilitacion`; `referencia_aprobacion`, `lote_activacion` en políticas) evaluados una por una en `CONCILIACION_TABLAS_I57` §3 y probados contra SQL Server real por `e2e-politicas-documentos-v60` (UPDATE/DELETE reales rechazados por el motor).
* **Calificaciones honestas (no reclasificaciones):** `politicas_habilitacion` es funcional pero **está vacía por diseño** hasta que el negocio apruebe D1–D8; `consultas_externas_habilitacion` es una constancia **manual** (no validación oficial); `documentos_habilitacion` está probada con ClamAV real y base **mínima** (el análisis completo no pudo probarse en este equipo).
* La evidencia dinámica es la **corrida continua E2E** (§E): una tabla no se acepta por tener filas de prueba.

## B. Implementaciones finales

| Tema | Cambio | Archivos principales |
|---|---|---|
| Mínimo privilegio SQL Server | Cuenta de migraciones (`db_owner`, Flyway) distinta de la de la aplicación (`db_datareader`+`db_datawriter`, `DENY` sobre `flyway_schema_history`); script idempotente único; servicio `db-grants` posterior a la migración; el backend de producción no recibe credenciales de migración y se niega a migrar sin cuenta propia. | `docker/sqlserver/apply-db-permissions.sql`, `docker/sqlserver/init-db.sh`, `docker-compose*.yml`, `MigrationAccountConfig.java`, `application.yml`, `.env*.example`, `invoke-prepared-flyway-v60.ps1` |
| Lista de preparación | Nuevo elemento obligatorio en producción `PRIVILEGIOS_BD` (la cuenta de la aplicación no puede alterar el esquema ni el historial). | `ReadinessService.java` |
| Defecto de interfaz (respuestas tardías) | En Solicitudes del DTS, Centro de Operaciones y Comandante, el refresco posterior a una acción usaba el `id` capturado al hacer clic: si el usuario ya había elegido otra solicitud, ese refresco pisaba el detalle (el selector mostraba una y el panel otra; el botón «Proponer otro horario» se «desprendía» del DOM). Ahora el refresco usa siempre la selección actual (`idRef`). Hallado por `e2e-solicitudes-ui`; regresión en `staleResponses.test.jsx`. | `frontend-react/src/main.jsx`, `staleResponses.test.jsx` |
| Defecto HTTP | `Content-Type` equivocado en endpoints multipart daba **500** y un ERROR con traza; ahora **415/406**. Hallado por el barrido de seguridad. | `ApiExceptionHandler.java` (+ `ApiExceptionHandlerTest`) |
| Antimalware | Healthcheck de producción exige base de firmas con versión; despliegue de ClamAV separado preparado; pruebas de tiempo de espera y corte de conexión. | `docker-compose.yml`, `docker-compose.clamav-standalone.yml`, `ClamdMalwareScannerTest` |
| Pruebas nuevas | `e2e-privilegios-bd` (SQL Server real, instalación desde cero, reinicio, sin credenciales expuestas), `e2e-seguridad-i58` (183 endpoints, 13 operaciones administrativas × 3 roles, 542 sondeos de errores), `auditoria-funcional-tablas-i58`, `medir-auditoria-frio`. Suite = **53 scripts**; ahora registra commit, árbol e imágenes sometidas a prueba. | `scripts/` |
| Ensayo de migración | V47→V60 con las cuentas separadas (la cuenta de aplicación pierde `db_owner` antes de migrar; el backend V60 opera sin credenciales de migración y con Flyway desactivado), restauración del respaldo y comparación de conteos. | `ensayo-migracion-v47-v60.sh`, `ensayo-flyway.sh`, `evidencia-i58/` |
| Procedimiento | Runbook ejecutable con condiciones de interrupción, compuertas **M** (base migrada) y **O** (operación autorizada) y habilitación gradual. | `PROCEDIMIENTO_PUESTA_EN_PRODUCCION_I58` |

**Migraciones:** ninguna nueva (**no se necesitó V61**) y ninguna existente se modificó (V1–V60 intactas; 60 checksums validados en el ensayo). **Riesgo de incompatibilidad entre versiones:** el código I-5.8 exige esquema V60 (Hibernate `validate`); contra V47 no arranca (seguro). Las variables nuevas `MIGRATION_DB_*` son **obligatorias** en `docker-compose.yml`: la pila habitual actual, con su `.env`, no podrá reiniciarse con `docker compose up` del repositorio nuevo hasta definirlas (a propósito, para no degradar permisos por accidente); el contenedor habitual en ejecución no se tocó.

## C. Políticas profesionales

Las **ocho decisiones pendientes** (D1–D8) están convertidas en un documento de decisión para aprobar o rechazar: `DECISION_POLITICAS_PROFESIONALES_I58_2026-10-28.md` (qué regla, efecto en la elegibilidad, datos, alternativas del modelo, fuente a revisar, quién debería aprobar y qué ocurre hasta entonces). Resumen: D1 habilitación aeronáutica y categoría del comandante · D2 igualdad o no entre vuelo sanitario y no sanitarios · D3 consulta externa obligatoria del comandante · D4 copiloto (tipos, categoría y obligatoriedad) · D5 matrícula/jurisdicción/consulta del médico · D6 acreditación adicional del médico y vuelos no sanitarios · D7 lo mismo para enfermería · D8 normalizar la categoría de aeronaves. **No se inventó ningún requisito ni equivalencia y no se activó ninguna política real**: hoy hay 0 políticas y nadie es elegible (cerrado por omisión).

Validación de punta a punta con **políticas sintéticas rotuladas como prueba** (`e2e-politicas-documentos-v60`, `-ui`, y la prueba funcional del ensayo): simulación sin escritura y determinista; lotes inválidos/incompletos, con campos desconocidos, sin referencia de aprobación o **alterados tras la aprobación (huella distinta)** → rechazados sin cambios; sin permiso → 403; activación atómica por función con baja con motivo y auditoría; la activación **nunca crea autorizaciones fuera de lo propuesto** (una función sin filas sigue `POLITICA_HABILITACION_NO_CONFIGURADA`); pantallas administrativas muestran políticas activas con lote y referencia, pendientes, y personas/vuelos afectados.

## D. Seguridad

* **Separación de cuentas:** probada en SQL Server real (19 operaciones DDL/administrativas rechazadas a la cuenta de la aplicación, triggers de inmutabilidad vigentes para ella, instalación desde vacío con 60/60 migraciones instaladas por la cuenta de migraciones, reinicio recuperable). Sin credenciales en logs, imágenes ni 561 archivos versionados. **Nota de higiene:** durante esta sesión una consulta de diagnóstico imprimió en el terminal la contraseña SA del SQL Server **E2E aislado** (no la de la habitual); es una credencial de pruebas local, pero conviene rotarla con `scripts/rotate-e2e-sql-admin.ps1`. Los scripts afectados ya no la pasan por argumentos.
* **Antimalware:** integración real probada con base mínima; falla segura (nunca «limpio» ante error); producción exige base acreditada y reciente; **análisis completo no probado** (recursos).
* **Autorizaciones:** barrido automático: ningún endpoint accesible sin credenciales salvo login y activación; DTS/OPERACIONES/COMANDANTE reciben 403 en políticas, auditoría global, preparación, regularización y usuarios; el titular no verifica ni regulariza sus propios documentos (`AUTO_VERIFICACION_HABILITACION_NO_PERMITIDA`); un usuario no accede a documentos ni habilitaciones ajenas; cuerpos de error sin fuga de información.
* **Protección documental:** documentos heredados restringidos hasta regularizarlos con un antivirus acreditado; descarga sólo de `LIMPIO`; integridad con SHA-256 rotulado según su momento; originales, autoría e historial intactos (ver `REVISION_REQUISITOS_Y_DEPENDENCIAS` §3).

## E. Pruebas

**Código sometido a prueba:** commit de código `aa83279` (todo lo posterior a él en `backend-java`, `frontend-react`, `docker/` y los compose **no cambió**: solo pruebas, scripts y documentos). Imágenes release construidas desde un **clon limpio** (`C:\Users\joaqu\Builds\vuelos-i58`) en ese commit: backend `sha256:d5fd551567db971367386c03210564109026c4d1954d8b4c668ed27e3b7c770d`, frontend `sha256:8d1c7b1673fd2766167044d3c3644ba4088d2223ac3364bb0230c5e31538eb7e` (tags `release-v60-aa83279`). Fuera de Git no se archivó esta vez un tar de imágenes ni un bundle de Flyway (ver §H); deben regenerarse desde ese commit al autorizar la ventana.

| Suite | Resultado exacto |
|---|---|
| **Backend (JUnit, H2 + SQL Server vía E2E)** | `mvn -o test`: **588 pruebas, 0 fallos, 0 errores, 0 omitidas** (BUILD SUCCESS, 8 min 11 s). +9 respecto de I-5.7 (579): `MigrationAccountConfigTest` ×5, `ApiExceptionHandlerTest` ×2, `ClamdMalwareScannerTest` +2. |
| **Frontend (Vitest)** | **23 archivos, 255 pruebas, 0 fallos** (254 + la regresión de carrera `staleResponses`: «operations center…»; falla contra el código anterior —2 recargas del vuelo viejo en lugar de 1— y pasa con la corrección). |
| **SQL Server real** | Toda la suite E2E corre contra SQL Server 2022 real con la aplicación operando con la cuenta restringida; además: restauración del respaldo de la base migrada (DBCC CHECKDB sin errores, 0 FK/CHECK no confiables, conteos idénticos, V60) en `evidencia-i58/restauracion-y-validacion-v60.txt`; ensayo V47→V60 con cuentas separadas y 60 checksums (`ensayo-migracion-v47-v60-cuentas-minimo-privilegio.log`: 12 bloques funcionales aprobados); instalación desde base vacía con 60/60 migraciones por la cuenta de migraciones. |
| **E2E – última corrida continua** | Corrida **`20261029T073329`**: **54/54 scripts aprobados en una única corrida continua** (51 de I-5.7 + `e2e-privilegios-bd`, `e2e-seguridad-i58`, `e2e-migracion-historica` incorporado), 0 fallos, 0 contenedores residuales, inicio 07:33 UTC, fin 08:47 UTC (69 min de scripts). Commit registrado por la propia suite: `a9f0799` (árbol de trabajo limpio), imágenes `d5fd5515…` / `8d1c7b16…`. Salida y código de retorno de cada script: `scripts/e2e-logs/20261029T073329/` (no versionado); resumen versionado: `docs/evidencia-i58/suite-e2e-20261029T073329-resumen.json`. La suite termina con código distinto de cero ante cualquier fallo, tiempo agotado o script ausente. |

**Historia honesta de las corridas anteriores de este incremento (todas conservadas como evidencia, ninguna se maquilló):**
1. `20261028T224116`: inválida (faltaba `NODE_PATH` de Playwright; se cortó al reiniciarse Docker).
2. `20261029T001812` (base E2E acumulada de corridas previas, 2.787 comandantes): 2 fallos de interfaz. Causa raíz del primero: **defecto real** de carrera en la UI (refresco tardío con el `id` capturado) → **corregido en producción** con regresión. Del segundo: `/available-commanders` > 60 s (504 de nginx) por el volumen de datos acumulados (§F).
3. `20261029T022513` (base nueva): 50/54 → 3 fallos: la misma carrera de UI (corregida después), `e2e-cierre` (daba por supuestas filas históricas que sólo existen en una base actualizada; ahora se verifican donde corresponde: en una base actualizada desde esquemas anteriores dentro de `e2e-cierre`, y la procedencia histórica de una migración real V41→V60 en `e2e-migracion-historica`, incorporado a la suite) y `e2e-politicas-documentos-v60` (elegía una política dada de baja que tenía gemela activa; el índice único respondía antes que el trigger: **mejora del fixture**, la aserción del trigger se mantiene).
4. `20261029T043301` (base acumulada con 2.717 comandantes desactivados de forma reversible): se detuvo manualmente: `/flights` tardaba 44 s con 4.878 vuelos.
5. `20261029T062625` (base nueva): 52/54 → `e2e-migracion-historica` (expectativa obsoleta «43» → ahora deriva de las migraciones del repositorio) y un **fallo aislado no reproducido** de `e2e-habilitaciones-ui` («Política creada» no apareció en 60 s; en 3 ejecuciones limpias posteriores pasó y el POST respondió 200 en < 0,5 s). Se agregó diagnóstico al script por si reaparece. **Riesgo residual: intermitencia de interfaz no explicada.**
6. `20261029T073329`: **54/54**.

Pruebas de regresión de «respuestas tardías en React»: `staleResponses.test.jsx` (comandante, hangar, bitácora, tripulación, centro de operaciones) y `crewRefresh.test.jsx`; no reaparecen. Concurrencia sobre asignaciones, habilitaciones y cambios de estado: `e2e-geografia-integridad`, `e2e-habilitaciones(-vuelos)`, `e2e-roles-clasificaciones`, `e2e-documentos`, `e2e-cierre` (carreras reales contra SQL Server) — aprobadas. Recorridos: DTS (`e2e-solicitudes(-ui)`, `e2e-paciente-solicitud(-ui)`, urgencia extrema y negociación), Centro de Operaciones (`e2e-sanitario-replanificacion-ui`, `e2e-i53-operativo-ui`, `e2e-rutas-*`, `e2e-coordinaciones` dentro de `e2e-aeronaves-tripulacion`), Comandante (`e2e-cierre(-ui)`, `e2e-rutas-revision-ui`, bitácora y clima), Administrador (`e2e-usuarios(-ui)`, `e2e-geografia-*`, `e2e-roles-clasificaciones(-ui)`, `e2e-habilitaciones(-ui)`, `e2e-politicas-documentos-*`, `e2e-auditoria(-ui)`) y vuelos no sanitarios (`e2e-cierre`, `e2e-i53-operativo-ui`, `e2e-habilitaciones-vuelos`).

## F. Rendimiento de auditoría

**Abierta como «no reproducible»; no se declara cerrada.** Con 69.415 eventos (6,7× la incidencia) y cachés vaciadas: SQL ≤ 148 ms; peor HTTP 3.688 ms (primera petición tras vaciar cachés), el resto 0,1–0,6 s; el objetivo de 5 s se cumple en todo lo reproducido. No se reprodujo el valor de 27 s ni se identificó su causa; no se cambió código ni índices. Detalle y condición de cierre en producción: `REVISION_REQUISITOS_Y_DEPENDENCIAS` §2.

**Hallazgo relacionado de escala (nuevo):** en la base E2E *acumulada* de corridas anteriores (2.787 comandantes, 4.371 aeronaves, 4.746 vuelos) `GET /flights/{id}/available-commanders` superó los 60 s de nginx (504) y dos pruebas de interfaz fallaron por ello. Es una consecuencia de la acumulación de datos de prueba, no del código nuevo (frontend y esas rutas del backend no cambiaron desde I-5.7), pero indica que ese listado crece linealmente con la cantidad de comandantes. La habitual tiene 1 usuario. La certificación final se hizo sobre una base E2E **nueva** (instalada desde cero); la acumulada se conservó como `vuelos_sanitarios_e2e_historico_i57`. Además se midió `GET /flights` con 4.878 vuelos: 44 s y 3,3 MB (sin paginación). **Riesgo técnico a vigilar:** si la flota/tripulación real superara cientos de comandantes, medir ese endpoint y optimizarlo antes de crecer.

## G. Git y entornos

* **Rama:** `feature/completitud-funcional-post-v55`. **Árbol de trabajo:** limpio. **Sin push** (47 commits locales sobre `origin/main`; no autorizado).
* **Commits locales nuevos de I-5.8 (7):** `6b09f43` cuentas de mínimo privilegio, preparación y ClamAV; `9a9c42b` 415/406, barrido de seguridad, auditoría, ensayos; `4e1f44e` runbook y evidencia del ensayo; `aa83279` **corrección de la carrera de UI** + fixture de políticas (último cambio de código); `87c5528` evidencia de la limpieza reversible; `0245288` e2e-cierre histórico condicionado; `a9f0799` expectativa derivada y diagnóstico. (La documentación final se agrega en un commit posterior solo de documentos.)
* **Flyway por entorno:** habitual `vuelos_sanitarios` = **V47 (sin tocar; 42 tablas físicas; `joaquin` sigue siendo `db_owner`)**; E2E `vuelos_sanitarios_e2e` = **V60** (46 tablas = 45 de negocio + Flyway; instalada desde cero, 60 filas, todas por `e2e_migrator`). Bases E2E conservadas: `vuelos_sanitarios_e2e_historico_i57`, `…_limpia_i58`, `…_limpia_i58b` (3 de ellas con evidencia de corridas anteriores) — ocupan espacio en el SQL E2E y pueden eliminarse cuando se decida.
* **Docker:** habitual (backend, frontend, SQL) en ejecución y sano, sin reinicios por mi parte (uno general de Docker Desktop ocurrió por el cuelgue del motor y lo hizo el usuario); E2E (backend/frontend con las imágenes release, SQL, ClamAV mínimo, Mailpit) sano. El motor de Docker se colgó en dos ocasiones al solaparse cargas (VM de 3,45 GB): precondición ya documentada en el runbook (§2.5).
* **Evidencia fuera de Git:** artefactos de esta sesión (logs de la suite en `scripts/e2e-logs/`, no versionados). **No** se generaron en esta sesión el tar de imágenes ni el bundle de migración V60 archivados con SHA-256 que exige el runbook §1: se generan al fijar la ventana.

## H. Dependencias restantes

**1) Problemas técnicos realmente pendientes**
* Intermitencia aislada e inexplicada de `e2e-habilitaciones-ui` (1 en ≈6 ejecuciones; con diagnóstico agregado).
* Auditoría de 27 s: no reproducible (abierta).
* Escala: `GET /flights` (sin paginación: 3,3 MB y 44 s con 4.878 vuelos) y `/flights/{id}/available-commanders` (>60 s con 2.787 comandantes) crecen linealmente. Irrelevante hoy (la habitual tiene 0 vuelos); revisar antes de crecer a miles de vuelos abiertos.
* Análisis antimalware completo sin probar (recurso físico, abajo).
* Bundle/imágenes de migración sin archivar fuera de Git (se generan al fijar la ventana).
* La pila habitual requerirá definir `MIGRATION_DB_USERNAME/PASSWORD` en su `.env` antes de reiniciarla con el compose nuevo.

**2) Decisiones de negocio**
* Aprobar o rechazar **D1–D8** de política profesional (`DECISION_POLITICAS_PROFESIONALES_I58`). Mientras no se aprueben: nadie es elegible (estado seguro, no un defecto).
* Plazos de **retención documental** (sin purga hoy; no se inventan plazos).
* Plazos de **aviso de vencimiento** (60/30/7/0 es solo una propuesta).
* Operar o no sin verificación de correos hasta tener proveedor SMTP.
* Normalizar las categorías de aeronave (D8) y, si se desea, composición mínima de tripulación (no modelada).
* Destino de la copia externa de respaldos y claves; fecha y responsables de la ventana.

**3) Aprobaciones regulatorias / normativas**
* Qué habilitaciones aeronáuticas y matrículas sanitarias acreditan cada función (autoridad aeronáutica; registros y ministerios de salud/colegios): revisión normativa y legal previa a aprobar D1–D7. El sistema **no valida automáticamente** ANAC ni REFEPS/SISA ni se presenta como que lo hiciera.
* Asesoría legal sobre retención de documentación personal y de salud.

**4) Servicios externos que requieren configuración**
* Proveedor SMTP real (host, credenciales por entorno, TLS) y prueba de entrega.
* ClamAV con base completa y `freshclam` (salida a Internet), en equipo propio o dedicado.
* Gestor de secretos / custodia de `.env.production` y de las dos cuentas SQL.

**5) Recursos físicos que faltan**
* Equipo de producción confirmado y dimensionado: este equipo (7,2 GB, VM de Docker de 3,45 GB) se cuelga al solapar cargas y no sostiene ClamAV completo; ClamAV necesita ≥ 4 GB dedicados (orientativo, no medido aquí).
* Almacenamiento externo para copias.

## I. Decisión definitiva

### MIGRACIÓN TÉCNICA V47 → V60: **GO CON CONDICIONES**

Fundamento: candidata reproducible (commit `aa83279`, imágenes por digest, 0 migraciones modificadas); ensayo V47→V60 sobre restauración del respaldo pristino con cuentas separadas; recuperación por restauración comprobada (CHECKDB, conteos, versión); instalación desde base vacía comprobada; suite 54/54 continua, backend 588, frontend 255; runbook con interrupciones y compuertas.

**Qué falta para autorizarla (acciones suyas o de quien opere):**
1. Autorizar por escrito la ventana (fecha, responsables, criterio de aborto) — la migración **no** se ejecutó ni se autoriza con este informe.
2. Definir y custodiar las contraseñas de las dos cuentas SQL (`DB_PASSWORD` ≠ `MIGRATION_DB_PASSWORD`) en `.env.production` y confirmar que el servidor tiene RAM/disco libres (§2 del runbook).
3. Decidir el destino de la copia externa de respaldos y claves (hoy no hay copia fuera del equipo).
4. Con la ventana fijada, regenerar y archivar con SHA-256 las imágenes y el bundle de migración desde el commit `aa83279` (o repetir el ensayo completo si el código cambia).
5. Que el equipo no tenga otras cargas pesadas durante la ventana (Docker se cuelga con cargas solapadas).

### OPERACIÓN EN PRODUCCIÓN: **NO-GO**

Fundamento: base migrada no es aplicación autorizada. Hoy nadie sería elegible para ninguna función (0 políticas), el antivirus completo no está probado, no hay proveedor de correo ni política de retención. Esto es el estado seguro, no un defecto.

**Qué falta para permitir operaciones reales (compuerta O del runbook):**
1. **Aprobar D1–D8** (política profesional) tras revisión normativa, y activarlas por el procedimiento simular → aprobar huella → activar.
2. **Antivirus**: disponer del equipo, ejecutar `verificar-antivirus-produccion.cjs` hasta `ACREDITADO` (o decidir por escrito no habilitar documentación real hasta tenerlo).
3. **Retención documental y plazos de aviso**: aprobar y registrar (`APP_CREDENTIAL_EXPIRY_APPROVED=true` solo tras aprobar).
4. **Correo**: contratar proveedor y probar entrega, o aceptar por escrito operar con correos «sin verificar».
5. **Servidor de producción** dimensionado y respaldo programado con copia externa.
6. **Piloto supervisado** (etapa B del runbook) sin incidentes antes de abrir a todos.

Las dependencias externas (SMTP, ClamAV completo, organismos oficiales) **no se presentan como funcionalidades completadas**: están implementadas hasta donde el sistema controla y declaradas como pendientes en lo demás.
