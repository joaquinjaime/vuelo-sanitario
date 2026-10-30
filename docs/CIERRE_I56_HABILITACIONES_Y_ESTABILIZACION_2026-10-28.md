# I-5.6 — Cierre funcional de habilitaciones y estabilización (2026-10-28)

Rama `feature/completitud-funcional-post-v55` (commits locales, sin push). Base aislada en Flyway V59; **la base habitual sigue en V47 y no se tocó**.

> Separación pedida: §A–F describen **completitud funcional** (lo implementado y probado); §G describe la **preparación para producción** (lo que falta decidir, contratar o autorizar).

## A. Estado general

| Fase | Resultado |
|---|---|
| 0 Diagnóstico y trazabilidad | Hecho: datos del informe anterior verificados (rama, árbol limpio, V58 aislada/V47 habitual, siete contenedores). Matriz en [TRAZABILIDAD_HABILITACIONES_I56](TRAZABILIDAD_HABILITACIONES_I56_2026-10-28.md). |
| I Habilitaciones profesionales | Hecho. Política de suficiencia configurable y explícita; ciclo de vida completo; integración con todas las rutas de asignación; sin autorización silenciosa. |
| II Documentos | Hecho. PDFBox + cuarentena + ClamAV real (clamd INSTREAM) + huella + versiones + retiro/bloqueo + sin purga. Consulta externa manual separada de la revisión interna. |
| III Avisos de vencimiento | Hecho (60/30/7/0, idempotente, reloj de negocio, concurrencia y reinicio probados). |
| IV Interfaz | Hecho: ciclo completo en el navegador; el éxito sólo se anuncia tras la respuesta del servidor. **Defecto de tripulación: causa raíz hallada y corregida** (§D). |
| V Requisitos previos | Teléfonos internacionales: ya implementado y probado (I-2b). Correo: verificación implementada; **SMTP real no probado** (no hay proveedor). Sin TODO relevantes. |
| VI Estabilización | Suite E2E reproducible con ejecutor nuevo (ver §D). Rendimiento de auditoría: objetivo cumplido; la medición de 27 s **no se reproduce** (incidencia abierta como no reproducible). |
| VII Release candidata | Migraciones V1–V55 intactas (sin modificaciones retroactivas; sólo se agregan V56–V59). Ensayo V47→V59 en copia aislada: ver §F. |

**Tablas funcionales: 42 de 42 en el ámbito interno** (`habilitaciones_profesionales` y `documentos_habilitacion` pasan de parciales a funcionales). Criterio aplicado: persistencia real, flujo, reglas, seguridad, integración operativa, interfaz, auditoría, pruebas y concurrencia (con evidencia en SQL Server real). La autenticidad de la credencial sigue dependiendo de una comprobación externa **manual** que el sistema registra y rotula como tal; **no hay ni se presenta validación oficial automática**.

Funcionalidades bloqueadas o sin completar (no simuladas): validación automática con ANAC/REFEPS-SISA (no hay API acreditada), envío real de correo (sin proveedor SMTP), cobertura antimalware completa en E2E (ver §C), política de retención aprobada (decisión de negocio).

## B. Implementación

* **Migración V59** (`V59__politica_habilitaciones_ciclo_y_documentos.sql`): `politicas_habilitacion`, `decisiones_habilitacion`, `consultas_externas_habilitacion`; nuevas columnas en `habilitaciones_profesionales` (categoría de aeronave, jurisdicción, restricciones, enlace de renovación, estado `CORRECCION_SOLICITADA`) y en `documentos_habilitacion` (propósito, SHA-256, versión, reemplazo, estado de análisis, baja lógica, bloqueo de conservación). Los documentos previos quedan `LEGADO_SIN_ANALISIS`. No siembra políticas.
* **Reglas**: `CredentialSufficiency` (única regla de suficiencia), `ProfessionalCredentialService` (ciclo de vida, consulta externa, evaluación), `CredentialPolicyService`, `CredentialDocumentService`, `PdfInspector`, `ClamdMalwareScanner`, `CredentialExpiryNoticeService`; el contexto de vuelo (tipo y categoría de aeronave) llega a toda evaluación (`CrewManagementService`, `FlightService`).
* **Endpoints** (todos ADMINISTRADOR): `/credential-policies` (+`/{id}/deactivate`), `/professional-credentials/{id}` (`/renew`, `/decision/{VERIFICADA|RECHAZADA|CORRECCION_SOLICITADA|REVOCADA}`, `/external-checks`, `/decisions`, `/history`, `/data-requests`, `/documents`), `/professional-credential-documents/{id}` (descarga, `/rescan`, `/retire`, `/retention-hold`, `antimalware-status`), `/professional-credential-retention/report`.
* **Pantallas**: `credentials.jsx` (panel por usuario) y página *Habilitaciones* (política, estado del analizador, retención).
* **Decisiones de negocio provisionales documentadas**: ver [HABILITACIONES_Y_DOCUMENTOS_I56](HABILITACIONES_Y_DOCUMENTOS_I56_2026-10-28.md) §3–§6 (sin política = no elegible; jurisdicción sólo exigida como dato; restricciones aceptadas explícitamente; sin purga).

## C. Seguridad

* Autorización: todo en ADMINISTRADOR (backend); la separación de funciones (titular ≠ revisor) cubre revisión, consulta externa, retiro y bloqueo (`403 AUTO_VERIFICACION_HABILITACION_NO_PERMITIDA`, probada también con un administrador titular).
* Documentos: PDF únicamente, 10 MiB configurable, estructura íntegra (cierre `startxref/%%EOF` válido), sin cifrado ni contenido activo (JavaScript, lanzamiento, envío de formularios, archivos embebidos, RichMedia, XFA), almacenamiento privado con nombre aleatorio, descarga autenticada y auditada con verificación de huella (una manipulación en disco se detecta y se audita), cuarentena hasta el análisis.
* Antimalware: integración real con clamd. **Falla segura probada**: con el analizador caído (`docker pause`) el documento queda en `ERROR_ANALISIS`, no se aprueba ni descarga; el reintento (manual y periódico) lo normaliza. **Limitación honesta de la evidencia**: el E2E usa el motor ClamAV 1.4.6 real pero con una base de firmas mínima (sólo EICAR) para no agotar la RAM de Docker (18 MiB frente a ~1–2 GB); prueba la integración y el rechazo, **no** la cobertura. En producción se requiere ClamAV con base completa (servicio `clamav`, perfil `antimalware`).
* Errores sin datos sensibles; el aviso al titular no incluye número de matrícula; auditoría con nuevos tipos/operaciones.

## D. Pruebas

* **Backend**: 562 pruebas, 0 fallos (base: 519; +43: política, ciclo de vida, documentos, escáner, PDF, avisos, revisión asíncrona).
* **Frontend**: 21 archivos, 243 pruebas, 0 fallos (base: 227).
* **E2E contra SQL Server real y Chrome** (nuevos): `e2e-habilitaciones` (32 comprobaciones, ClamAV real, EICAR), `e2e-habilitaciones-vuelos` (contexto, baja de política, revocación en curso y **18 carreras reales**: baja de política × asignación, verificación de renovación × asignación, revocación × inicio; ambos desenlaces observados en cada familia, sin estados incoherentes), `e2e-habilitaciones-ui` (10), `e2e-tripulacion-actualizacion-ui` (5).
* **Defecto de tripulación (comandante)**: causa raíz = `FlightCrew` y `WeatherHistory` eran hermanos con la misma clave (`key={id}`): React duplicaba/omitía paneles y el comandante veía un «Cargando tripulación…» congelado junto al vigente. Además no existía refresco alguno (ni polling ni websocket) para cambios hechos por otras personas y las respuestas no estaban ordenadas. Corregido: claves distintas + prueba de guarda (`siblingKeys.test.js`, que detecta el código anterior), orden de respuestas, refresco cada 15 s/al volver a la pestaña. Regresión en navegador: aceptación, reemplazo, retiro, rechazo y replanificación se reflejan sin recargar.
* **Suite E2E continua**: ejecutor nuevo `scripts/e2e-suite-completa.cjs` (orden fijo, tiempo máximo por script con terminación del árbol de procesos, log por script y `resumen.json` en `scripts/e2e-logs/<corrida>/`, memoria libre/contenedores por script, bloqueo de ejecución única, `--resume`, código de salida ≠ 0 ante fallo, timeout, script ausente o pendiente). Corrida de descubrimiento (48 scripts, 1 h 52 min): 45 aprobados, 3 fallos explicados (dos expectativas obsoletas demostradas —`e2e-contactos-tripulacion` fijaba V58 como última migración; `e2e-auditoria` tomaba el evento más reciente de habilitaciones, que ahora puede ser un aviso— y un defecto real de rendimiento: el listado de comandantes tardaba más que el tiempo del proxy; corregido leyendo las políticas una vez por transacción). **Corrida continua limpia: ver §D.1.**

### D.1 Corrida continua limpia
**Corrida `20261028T081458`: una sola invocación de `node scripts/e2e-suite-completa.cjs` (sin `--resume`, `--from` ni filtro), de 08:14:58 a 10:41:47 UTC (2 h 27 min), con el stack aislado en V59 y ClamAV real. Resultado: **48/48 scripts aprobados**, 0 fallos, 0 timeouts, 0 scripts ausentes o sin ejecutar, código de salida 0.** Evidencia: `scripts/e2e-logs/20261028T081458/resumen.json` (resultado, duración y memoria libre/contenedores por script) y un log por script (la carpeta `e2e-logs` no se versiona). Memoria libre del anfitrión durante la corrida: 0,6–1,3 GB; sin cuelgues de Docker. La corrida de descubrimiento previa (45/48) no se cuenta como evidencia: sus tres fallos se corrigieron y la suite se repitió completa. Se conserva el hecho de que una colección de ejecuciones individuales no es equivalente a esta corrida continua.

## E. Rendimiento de auditoría
Ver [RENDIMIENTO_AUDITORIA_I56](RENDIMIENTO_AUDITORIA_I56_2026-10-28.md): 53.239 eventos (5× la incidencia); consulta global de 100: SQL 5 ms, conteo 11 ms, HTTP total 63–92 ms en caliente (334–1.149 ms en frío); variantes ≤ 419 ms. La medición original de 26.972 ms no se reproduce; sin cambios de código ni de índices (sin causa comprobada). Incidencia abierta como **no reproducible**.

Hallazgo de rendimiento adicional (corregido): la evaluación de hasta cientos de candidatos repetía la consulta de políticas; ahora se lee una vez por transacción. Un barrido global de elegibilidad sobre la base E2E (≈ 1.900 vuelos abiertos acumulados) tarda minutos, por eso la revisión tras un cambio de política corre asíncrona y coalescida (y se desactiva en el overlay E2E).

## F. Git y entornos

* Commits locales de esta fase: `3bec7af`, `a87957b`, `211866c`, `0d9ff04`, `6448983`. Sin push.
* Flyway: base aislada V59; base habitual V47 (sin tocar); candidatas V48–V59 sin modificaciones retroactivas (V1–V55 idénticas a `release/v55-integracion`).
* Contenedores: stack aislado reconstruido (backend y frontend) + `clamav` (E2E, 384 MiB máx.); stack habitual sin cambios (backend/frontend/SQL con imágenes anteriores).
* Sin desplegar: todo lo de V56–V59 y de esta fase permanece en la copia aislada.
* Ensayo V47→V59 sobre copia aislada: **aprobado** (`scripts/ensayo-migracion-v47-v59.sh`). Entrada: copia pristina del respaldo V47 de la base habitual (archivo preexistente; la habitual no se tocó y sigue en V47, verificado de sólo lectura) restaurada como `vuelos_sanitarios_ensayo_v47` en la instancia E2E; siembra con el contrato V47; validación de 59 checksums; migración V48…V59 una por una (cada una OK, V59 en 0,37 s); fotografía previa/posterior: 41→46 tablas (las 5 nuevas: contactos de coordinación, verificación de correos, políticas, decisiones y consultas externas), 84→109 claves foráneas, 10 vuelos y 9 versiones de ruta intactos, **0 violaciones de restricciones y 0 claves foráneas deshabilitadas o no confiables**; el backend V59 actual (Hibernate `validate`, ClamAV real) arranca sobre la restauración migrada y 10 bloques funcionales aprobados. Resultados específicos de V59: 0 políticas sembradas (nadie es elegible hasta cargarlas), los 8 documentos previos quedan `LEGADO_SIN_ANALISIS` (conservados, sin hash) y las 8 habilitaciones se conservan. Artefactos del ensayo eliminados (base, contenedor, volumen, copia del respaldo). **Pendiente: ensayo con un respaldo reciente y real de la habitual el día de la migración (ventana autorizada).**

## G. Preparación para producción (distinto de la completitud funcional)

**Realmente listo (con evidencia):** política de suficiencia, ciclo de vida, documentos con cuarentena y huella, avisos de vencimiento, interfaz administrativa, integración con asignación/replanificación/aceptación/inicio, concurrencia en SQL Server.

**Requiere decisión de negocio:**
1. Cargar la **política de suficiencia** real (qué habilitación basta para cada función, tipo de operación y categoría) —tras V59 nadie es elegible hasta entonces—. No se inventaron requisitos regulatorios.
2. **Política de retención** (plazos, obligaciones de conservación, procedimiento de supresión/rectificación; Ley 25.326) antes de operar con datos reales. Hasta entonces no hay purgas.
3. Destinatarios y umbrales de avisos (por defecto 60/30/7/0; titular, administradores y Operaciones si hay asignaciones abiertas).

**Requiere infraestructura o servicios externos:**
1. **ClamAV con base completa** y salida a Internet para freshclam (~2 GB de RAM libres; el host Docker actual tiene 3,4 GB y ya incurrió en cuelgues por memoria). Sin él, ninguna documentación puede aprobarse (diseño seguro).
2. **Proveedor SMTP** y secretos por entorno para la verificación de correos (nunca probado con un proveedor real).
3. Copia de respaldos cifrados y claves fuera del equipo (pendiente de iteraciones previas).
4. Integración oficial con ANAC / REFEPS-SISA: no existe API acreditada; la consulta sigue siendo manual y registrada.

**Pruebas que faltan:** ejecución real contra un ClamAV con base completa y un proveedor SMTP; ensayo de carga con volumen real; CI remoto (requiere push).

**Autorizaciones que se necesitan de su parte:** (a) migración real V47→V59 de la base habitual (el ensayo en copia es previo y no la sustituye); (b) push de la rama; (c) cualquier despliegue o cambio de infraestructura (ClamAV productivo, SMTP).

## H. Próximo paso
**El proyecto está listo para solicitar la autorización de una migración controlada V47→V59 y de la release candidata, sin bloqueos técnicos conocidos en el ámbito funcional.** Lo que impide declararlo *listo para producción* son dependencias externas, no código: (1) política de suficiencia y de retención definidas por el negocio, (2) ClamAV con base completa operativo, (3) proveedor SMTP, (4) respaldo cifrado fuera del equipo. Secuencia sugerida tras su autorización: respaldo cifrado de la habitual → migración con el ayudante probado (`invoke-prepared-flyway.ps1`, adaptado a V59) → cargar la política desde *Habilitaciones* → desplegar imágenes construidas desde un clon limpio → `medir-auditoria.cjs` sobre datos reales.

Nota de recursos: durante esta fase el motor de Docker dejó de responder una vez (compilación Maven dentro de una VM de 3,4 GB) y se recuperó solo, sin intervención y sin tocar contenedores ajenos; el contenedor SQL habitual se reinició con él (su base sigue en V47). Se evitaron cuelgues posteriores deteniendo el backend aislado durante cada compilación.
