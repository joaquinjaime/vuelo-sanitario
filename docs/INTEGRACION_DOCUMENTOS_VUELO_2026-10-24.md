# Integración funcional de los documentos de vuelo — 2026-10-24

Alcance: `documentos_vuelo`, `versiones_documento_vuelo`, `bloqueos_documento_vuelo` y `tipos_documento` dentro del ciclo de vida del vuelo (sanitario y operativo). No se crearon tablas ni migraciones: Flyway queda en **V47** en la base habitual (no se tocó) y en **V51** en la base aislada E2E. Se completó el mecanismo existente (`DocumentService`, `DocumentController`, `FlightDocuments`), sin un segundo sistema de bloqueo ni de versionado.

## 1. Arquitectura que ya existía (y se conservó)

| Pieza | Responsabilidad |
|---|---|
| `documentos_vuelo` | Identidad lógica estable (vuelo + tipo + `nombre_documento` + `esta_activo`). |
| `versiones_documento_vuelo` | Una fila por PDF físico; `numero_version` contiguo, **una sola** `es_version_actual` (índice único filtrado `uq_versiones_documento_vuelo_actual`, único `uq_versiones_documento_vuelo_numero`), `ubicacion_almacenamiento` = clave UUID privada, `id_usuario_creador`. |
| `bloqueos_documento_vuelo` | Lease: una fila por documento (`uq_bloqueos_documento_vuelo_documento`), propietario y vencimiento; el servidor decide la vigencia con el reloj de negocio. Un lease vencido se *recupera* (evento `RECOVER`), no se limpia con un proceso aparte. |
| `tipos_documento` | Catálogo estático sembrado (`AUTORIZACION`, `PARTE_MEDICO`, `PLAN_DE_VUELO`, `OTRO`), leído por `GET /catalogs/document-types`. |
| `DocumentStorage` | Sólo PDF: tamaño máximo, tipo MIME declarado, extensión y cabecera `%PDF-`; clave aleatoria, escritura atómica en un directorio privado. |
| Informes finales | Flujo propio (`obligaciones_informe_final`, adjuntos de informe); **no** usan `documentos_vuelo`. No se tocó. |

Los documentos de texto del modelo anterior se archivaron en V22 y la tabla legacy se retiró en V32: hoy **sólo existen PDF**; no hay diferencia PDF/texto que gestionar.

### Relación con los procesos estructurados (no se duplican)

Ruta, hangar, clima, bitácora, coordinaciones aeroportuarias y datos clínicos tienen sus tablas. El módulo documental guarda archivos *externos* (autorización firmada, parte médico firmado, plan de vuelo presentado, otros) y no es una segunda copia editable de esos registros. No existe ninguna exportación a PDF de una entidad estructurada, de modo que no hay "documento generado" que distinguir de su fuente.

## 2. Documentos en el ciclo de vida

| Etapa | Documentación posible | Quién registra | Quién consulta | Modificación |
|---|---|---|---|---|
| Solicitud (DTS) | Ninguna obligatoria; los datos clínicos y de contacto son estructurados | — | DTS solicitante (si hay documentos) | — |
| Evaluación / aprobación | `AUTORIZACION` si Operaciones lo necesita | Operaciones, Centro de Operaciones | DTS solicitante, Operaciones | Versiones con lease |
| Asignación / planificación / preparación | `PLAN_DE_VUELO`, `PARTE_MEDICO`, `OTRO` | Operaciones; el comandante del vuelo | DTS solicitante (sólo su vuelo sanitario), Operaciones, comandante del vuelo | Versiones con lease |
| Ejecución (`EN_CURSO`) | Idem | Idem | Idem | Siguen admitidas |
| Finalización (`FINALIZADO`), cierre (`COMPLETADO`), `CANCELADO` | Sólo consulta | — | Idem | **Ya no se admiten altas, versiones ni nuevos bloqueos**; el propietario puede liberar el suyo |
| Informe final | Flujo propio | Comandante | Operaciones | Sin relación con `documentos_vuelo` |
| Consulta histórica | Todas las versiones | — | Roles anteriores | Nunca se sobrescribe una versión |

No se introdujo ninguna obligación documental para finalizar un vuelo; se comprobó que finalizar con documentos y con un bloqueo abierto funciona y que el informe final conserva su obligación de 48 h.

### Permisos reales (código)

* Lectura (lista, historial, estado del bloqueo, descarga): `DTS`, `OPERACIONES`, `CENTRO_OPERACIONES`, `COMANDANTE`, y además `FlightAuthorizationService.mayRead`: Operaciones sobre cualquier vuelo; DTS sólo sobre su solicitud sanitaria; comandante sólo sobre el vuelo que comanda. `ADMINISTRADOR` no opera documentos (403).
* Escritura (alta, versión, adquirir/liberar bloqueo): `OPERACIONES`, `CENTRO_OPERACIONES`, `COMANDANTE` (este último sólo en su vuelo y no bloqueado por un informe vencido, `COMANDANTE_BLOQUEADO`). El DTS no escribe.
* Los identificadores de documento, versión o bloqueo nunca bastan: cada operación vuelve a autorizar contra el vuelo del documento.

## 3. Brechas encontradas y resueltas

| # | Prioridad | Brecha | Resolución |
|---|---|---|---|
| 1 | **Alta** | **La descarga desde la interfaz no funcionaba**: la API informa `/api/document-versions/{id}/download` y `downloadFile` antepone otra vez `/api` → `/api/api/...` (404). Nadie lo había visto porque ninguna prueba de navegador descargaba. | `apiRelative` en `documents.jsx`; probado con descargas reales en Chrome y comparación SHA-256. |
| 2 | **Alta** | Un vuelo `CANCELADO` o `COMPLETADO` seguía aceptando documentos, versiones y bloqueos (sólo `FINALIZADO` los rechazaba), en servidor y en la interfaz. | `READ_ONLY_STATES` (`FINALIZADO`, `COMPLETADO`, `CANCELADO`, los mismos de hangar y coordinaciones) en `DocumentService`; `documentsEditable` en la interfaz. |
| 3 | Media | El DTS solicitante estaba autorizado por el backend a consultar y descargar pero **la interfaz no le ofrecía nada**. | `FlightDocuments` de sólo consulta en "Mis solicitudes y contrapropuestas". |
| 4 | Media | Las fechas del bloqueo y de las versiones salían en UTC y la interfaz las mostraba como hora civil (3 h de diferencia en Tucumán). | Conversión a la zona de negocio en `DocumentService` (como `AuditService.toLocal`) y `remainingSeconds` calculado por el servidor para no comparar contra el reloj del navegador. |
| 5 | Media | La descarga de un documento potencialmente sanitario no dejaba rastro. | Evento `DOCUMENT/DOWNLOAD` (`{"numeroVersion":n}`, sin contenido ni nombres) en la misma transacción; no se audita una descarga denegada ni una con archivo ilegible. Operaciones lo ve en la línea de tiempo; comandante y DTS no. |
| 6 | Media | El historial no mostraba el autor (`id_usuario_creador` existía pero no se exponía). | `creadoPor` (usuario) en cada versión; la interfaz lo muestra en la lista y el historial. |
| 7 | Media | Un doble clic o dos altas simultáneas creaban dos documentos con el mismo nombre. | 409 si ya hay un documento activo con ese nombre en el vuelo (sin distinguir mayúsculas), decidido bajo el bloqueo de fila del vuelo; sin migración ni índice nuevo. |
| 8 | Baja | La pantalla seguía mostrando "usted posee el bloqueo" tras vencer o tras un guardado rechazado. | Se vuelve a consultar al servidor al fallar cualquier acción y cuando el servidor informa que el lease vence; liberación "mejor esfuerzo" al abandonar el panel o cambiar de documento (el vencimiento sigue siendo la garantía). |
| 9 | Baja | El nombre original del archivo podía incluir rutas (`..\..\x.pdf`). | Se conserva sólo el nombre base. |
| 10 | Baja | No había forma de liberar el propio bloqueo en un vuelo ya cerrado. | `releaseLock` ya no exige un vuelo editable, pero conserva el acceso al vuelo, la propiedad del bloqueo y el bloqueo del comandante por informe vencido. |
| 11 | Media | Sin prueba automatizada ejecutable del módulo: sólo existía `e2e_documentos.py` (no ejecutable en esta máquina) y un script de navegador de tres pasos. | `e2e-documentos.cjs` y `e2e-documentos-integracion-ui.cjs`, incorporados a la suite. |

Cambio de infraestructura E2E: `docker-compose.e2e.yml` fijaba `DOCUMENT_LOCK_SECONDS: 1` en el backend aislado (solo overlay E2E). Con leases de 1 s no se puede editar con calma; ahora conserva los **300 s reales** y el vencimiento se provoca con el reloj ajustable (`/api/e2e/clock`), nunca con SQL.

## 4. Archivos modificados o agregados

Backend: `DocumentService`, `DocumentDtos` (`creadoPor`, `remainingSeconds`), `DocumentItemRepository`, `AuditCatalog` (etiqueta "Descarga"). Frontend: nuevo `documents.jsx` (extraído de `main.jsx`, que lo reexporta), `main.jsx` (DTS y estados de sólo consulta). Pruebas: `DocumentServiceTest` (+9), `DocumentAuthorizationTest` (nuevo, matriz de roles), `documents.test.jsx` (nuevo). E2E: `scripts/e2e-documentos.cjs`, `scripts/e2e-documentos-integracion-ui.cjs`, `scripts/e2e-suite-completa.cjs`, `docker-compose.e2e.yml`.

## 5. Resultados

| Verificación | Resultado |
|---|---|
| Backend completo (`mvn -o test`) | **339 pruebas aprobadas** (328 + 9 en `DocumentServiceTest` + 2 de `DocumentAuthorizationTest`), 0 fallos |
| Frontend completo (`vitest run`) | **143 pruebas aprobadas** (128 + 15 de `documents.test.jsx`), 13 archivos; `vite build` correcto |
| `e2e-documentos.cjs` (API real, SQL Server real) | 13 bloques aprobados: catálogo, alta y clasificación en vuelo sanitario y operativo, permisos por rol y por vuelo, validación de archivos, versionado y descargas con SHA-256, carreras, vencimiento con reloj, baja del editor, estados cerrados, auditoría e integridad SQL |
| `e2e-documentos-integracion-ui.cjs` (Chrome real) | 7 bloques aprobados: alta con selector del catálogo, bloqueo, nueva versión, descargas reales, conflicto entre dos navegadores, vencimiento, DTS de sólo consulta, comandante en vuelo operativo, persistencia y vuelo finalizado |
| Suite Node completa, **segunda ejecución en una única pasada** | **23/23 scripts aprobados** (21 anteriores + los 2 nuevos), ~27 min |

Historia de la regresión (para no confundir aprobaciones individuales con la suite):

1. Primera pasada completa tras los cambios: **22/23**. Falló `e2e-usuarios-aislado`: el escenario de baja de un comandante cancela su vuelo y luego exigía que otro usuario *adquiriera el bloqueo del documento de ese vuelo cancelado*. Con la regla nueva (`CANCELADO` es de sólo consulta documental) el servidor responde 400 — es el cambio de comportamiento esperado, no una regresión. Se adaptó la aserción de ese script (el lease de la cuenta dada de baja ya no está vigente y la adquisición se rechaza *por estado*); la recuperación de un lease tras la baja de su titular en un vuelo abierto quedó cubierta en `e2e-documentos.cjs` (bloque H). El script se repitió individualmente: aprobado.
2. Segunda pasada completa, sin ninguna intervención entre scripts: **23/23**.

Otras comprobaciones: la base habitual sigue en **V47** (consulta de sólo lectura; 0 documentos, 0 versiones; sus contenedores no se reiniciaron); la base aislada E2E sigue en **V51** con 41 tablas; no hubo migraciones, commit ni push; no quedó ningún contenedor ni base temporal de `e2e-usuarios-aislado`.

Pruebas **no** ejecutadas: recorrido E2E del estado `COMPLETADO` (cubierto por pruebas unitarias y de interfaz); `e2e_documentos.py` y el resto de scripts Python (no hay Python en la máquina); el script `e2e-documentos-ui.cjs` antiguo (auxiliar del script Python, fuera de la suite).

## 6. Límites y decisiones pendientes

* `documentos_vuelo.esta_activo` nunca cambia: no existe un proceso de baja de un documento cargado por error (decisión de negocio pendiente: quién, hasta cuándo, con qué auditoría). Un PDF equivocado se corrige hoy con una nueva versión.
* No existe una regla de compatibilidad tipo documental ↔ tipo de vuelo (por ejemplo, `PARTE_MEDICO` es aceptado en vuelos no sanitarios). No se inventó ninguna ni ningún tipo obligatorio.
* `tipos_documento` no tiene mantenimiento ni columna de activación; es un catálogo estático (como `roles`).
* La validación de contenido es cabecera `%PDF-` + tipo MIME + extensión + tamaño; no se analiza la estructura completa ni se escanea malware.
* El estado `COMPLETADO` está cubierto por prueba unitaria y de interfaz, no por un recorrido E2E completo (aprobación del informe).
* Un lease vencido no se borra: permanece hasta que alguien lo recupera. No bloquea nada.
* Índices redundantes preexistentes en `documentos_vuelo` (`idx_documentos_vuelo_tipo_documento_id` / `idx_documentos_vuelo_id_tipos_documento`, `idx_documentos_vuelo_vuelo_id` / `idx_documentos_vuelo_id_vuelos`) y `versiones_documento_vuelo`: limpiarlos exige una migración, no autorizada en este incremento.
* No se notifica a nadie una nueva versión.
