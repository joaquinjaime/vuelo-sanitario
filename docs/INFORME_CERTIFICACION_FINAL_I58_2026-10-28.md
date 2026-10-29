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

[[PRUEBAS]]

## F. Rendimiento de auditoría

**Abierta como «no reproducible»; no se declara cerrada.** Con 69.415 eventos (6,7× la incidencia) y cachés vaciadas: SQL ≤ 148 ms; peor HTTP 3.688 ms (primera petición tras vaciar cachés), el resto 0,1–0,6 s; el objetivo de 5 s se cumple en todo lo reproducido. No se reprodujo el valor de 27 s ni se identificó su causa; no se cambió código ni índices. Detalle y condición de cierre en producción: `REVISION_REQUISITOS_Y_DEPENDENCIAS` §2.

**Hallazgo relacionado de escala (nuevo):** en la base E2E *acumulada* de corridas anteriores (2.787 comandantes, 4.371 aeronaves, 4.746 vuelos) `GET /flights/{id}/available-commanders` superó los 60 s de nginx (504) y dos pruebas de interfaz fallaron por ello. Es una consecuencia de la acumulación de datos de prueba, no del código nuevo (frontend y esas rutas del backend no cambiaron desde I-5.7), pero indica que ese listado crece linealmente con la cantidad de comandantes. La habitual tiene 1 usuario. Se certificó sobre una base E2E nueva (la anterior se conservó como `vuelos_sanitarios_e2e_historico_i57`). **Riesgo técnico a vigilar:** si la flota/tripulación real superara cientos de comandantes, medir ese endpoint y optimizarlo antes de crecer.

## G. Git y entornos

[[GIT]]

## H. Dependencias restantes

[[DEPENDENCIAS]]

## I. Decisión definitiva

[[DECISION]]
