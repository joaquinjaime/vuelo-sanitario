# Bandeja de solicitudes sanitarias y bloqueo documental hasta acordar el horario (2026-11-01)

Este documento describe dos cambios relacionados: la bandeja de solicitudes del Centro de Operaciones (CO) y la regla que mantiene bloqueada
la documentación de un vuelo sanitario mientras no exista un horario acordado. No hay migraciones de base de datos ni cambios de seguridad JWT.

## 1. Diagnóstico

**Solicitudes difíciles de encontrar.** Una solicitud nueva notificaba al CO (`NEW_SANITARY_REQUEST`), pero en la pantalla principal sólo aparecía en una
lista de «atención» limitada a cinco filas, sin fecha de recepción, sin horario solicitado y sin acción: «Ver gestión» llevaba a una pantalla genérica donde
había que elegir la solicitud en un `<select>` con todos los vuelos. Los contadores mezclaban vuelos sanitarios y operativos y no distinguían etapas.

**Documentos accesibles antes del acuerdo.** `DocumentService` sólo rechazaba los vuelos cerrados (FINALIZADO, COMPLETADO, CANCELADO, RECHAZADO). Una solicitud
recién creada (`SOLICITADO`, sin estado de vuelo) o con una contrapropuesta pendiente (`PENDIENTE_RESPUESTA_DTS`) admitía altas, versiones, bloqueos y bajas.

## 2. Qué es «horario acordado»

El estado de la solicitud sanitaria (`vuelos_sanitarios.id_estados_solicitud_sanitaria`) pasa a **`APROBADO` únicamente** en `FlightService.fixSanitarySchedule`, que
sólo se invoca en dos eventos:

| Evento | Quién | Registro de negociación |
|---|---|---|
| `acceptRequestedSchedule` (`POST /flights/{id}/schedule/accept`) | Operaciones acepta el horario pedido por el DTS | `CO_ACEPTA_PROPUESTA` |
| `respondToCounterproposal` con `aceptar=true` (`POST /flights/{id}/schedule/response`) | El DTS solicitante acepta la contrapropuesta de Operaciones | `DTS_ACEPTA_CONTRAPROPUESTA` |

Una fecha planificada, una contrapropuesta pendiente o la aprobación de la ruta del comandante **no** son un acuerdo. El modelo ya distinguía propuesta de
aceptación (estado de la solicitud), por eso no se agregó ningún estado, columna ni migración. El disparador SQL `trg_vuelos_sanitarios_validar_estado` (V44) sólo
permite salir de `APROBADO` hacia `CANCELADO`: un horario acordado no puede renegociarse en el modelo actual.

## 3. Regla definitiva de habilitación documental

Se evalúa en cada operación (nunca se copia a una columna) en `DocumentScheduleGate`:

| Vuelo | Estado de la solicitud | Documentos |
|---|---|---|
| No sanitario | — | Sin cambios (la regla no aplica) |
| Sanitario | `SOLICITADO` (nueva, sin evaluar) | **Bloqueados**: lectura y escritura, 409 |
| Sanitario | `PENDIENTE_RESPUESTA_DTS` (contrapropuesta pendiente) | **Bloqueados**: lectura y escritura, 409 |
| Sanitario | `APROBADO` (horario acordado) | Habilitados, con los permisos y validaciones de siempre (los cierres posteriores siguen siendo de sólo consulta) |
| Sanitario | `RECHAZADO` / `CANCELADO` | Sólo consulta del historial; las escrituras las rechaza la regla existente de «sólo consulta» (400) |
| Sanitario | sin estado de solicitud | Bloqueados (falla cerrada) |

**Reapertura.** Si en el futuro una negociación se reabriera (estado `SOLICITADO` o `PENDIENTE_RESPUESTA_DTS`), la documentación se bloquea sola en la
siguiente operación y vuelve a habilitarse al recuperar el acuerdo. Nada se borra ni se modifica: documentos, versiones y archivos se conservan.

**Excepciones documentadas.**

1. *Liberar un bloqueo propio* (`DELETE /documents/{id}/lock`) sigue permitido sin acuerdo porque sólo reduce el acceso (igual que en vuelos cerrados).
2. *Solicitudes cerradas* (rechazadas/canceladas) conservan la consulta de sus documentos previos, para no perder acceso al historial. Si un documento fue cargado
   antes de existir esta regla y su solicitud aún no tiene acuerdo, queda **intacto** pero inaccesible hasta que se acuerde el horario.

**Orden de respuestas.** 401 sin sesión → 403 sin permiso de rol o sin acceso al vuelo (no revela el estado) → **409** `DOCUMENTS_LOCKED_SCHEDULE_NOT_AGREED`
(estado del vuelo) → 400 vuelo cerrado (sólo consulta) → validaciones documentales habituales.

## 4. Backend

* `service/DocumentScheduleGate` (nuevo): regla única, pura y reutilizable (`of(flight)` y `require(flight)`).
* `DocumentService`: la regla se aplica en `list`, `listRetired`, `allowedTypes`, `history`, `lockView`, `download` (todas vía `requireVisible`/aprobación de lectura),
  `createPdf`, `replacePdf`, `acquireLock` y `deactivate` (vía `mayChange`). `replacePdf`, `acquireLock` y `deactivate` bloquean además la fila del vuelo
  (`flights.lockById`) después de la del documento: la comprobación se hace con el vuelo bloqueado, de modo que un cambio de estado concurrente espera a la
  transacción documental (o ésta a aquél). Sólo se serializa por vuelo; no hay bloqueos globales y no existe un camino que bloquee vuelo → documento existente,
  por lo que no hay ciclos.
* `GET /api/flights/{flightId}/documents/access` (nuevo; DTS, OPERACIONES, CENTRO_OPERACIONES, COMANDANTE con acceso al vuelo): `{disponible, codigo, mensaje, estadoSolicitud, pendientePor}`.
  Es lo único consultable antes del acuerdo; permite mostrar la sección bloqueada sin exponer documentos.
* Respuesta de bloqueo: HTTP 409 `{"error": "...primero debe acordarse el horario de salida.", "code": "DOCUMENTS_LOCKED_SCHEDULE_NOT_AGREED", "estadoSolicitud": "...", "pendientePor": "OPERACIONES|DTS"}`.
* `FlightDtos.SanitaryDataView.fechaRecepcion` (nuevo, derivado de `vuelos.fecha_creacion`, hora civil de negocio): fecha en que se recibió la solicitud.

## 5. Frontend

* `requestInbox.jsx` (nuevo) y `main.jsx` (dashboard del CO, sin interfaz paralela):
  * **Solicitudes sanitarias pendientes**: tarjetas con código, etapa, extrema urgencia, origen → destino, recibida, salida solicitada, prioridad y la acción
    «Abrir solicitud». No se muestra el paciente ni datos médicos.
  * **Etapas desde estados reales**: `SOLICITADO` → *Nueva*; `PENDIENTE_RESPUESTA_DTS` → *En negociación*; `APROBADO` → *Horario acordado*; posteriores → *Etapa posterior*;
    `RECHAZADO`/`CANCELADO` → *Cerrada*. No existe un estado «bajo revisión» distinto de `SOLICITADO` (la evaluación de Operaciones se resuelve de inmediato), por lo que no se simula.
  * **Contadores reales** (Nuevas, Horario acordado sin recursos, En negociación, Extrema urgencia) calculados de los vuelos cargados; el total real se informa aunque la lista
    muestre 8 y se pueda desplegar completa. Indicador numérico en «Inicio» del menú lateral.
  * **Orden**: extrema urgencia primero por horario límite (la misma regla con que ordena el servidor); luego mayor prioridad declarada (CRITICA > ALTA > MEDIA > BAJA);
    luego la que espera hace más tiempo (por fecha de recepción). Se agrupan aparte las solicitudes que esperan al DTS.
  * **Acceso directo**: «Abrir solicitud» abre el detalle (`#/vuelos/<id>`, también por URL directa), con «← Volver a la bandeja».
  * **Actualización**: refresco automático cada 30 s (sólo `GET /flights` y `GET /notifications`, con la pestaña visible) y al volver a la pestaña. No hay WebSockets
    ni notificaciones nuevas (se reutiliza la existente `NEW_SANITARY_REQUEST`).
* Detalle del CO: panel **Negociación del horario** (horario solicitado, propuesto por Operaciones, acordado, contrapropuestas, próximo paso y responsable).
* `documents.jsx`: consulta `/documents/access`; si el horario no está acordado muestra «Documentación no disponible» con la explicación y quién debe responder, sin
  botones ni peticiones documentales; reconsulta cada 15 s (y al volver a la pestaña) y se habilita sola al acordarse el horario. Un 409 con el código de bloqueo
  (pantalla desactualizada) cambia a la vista bloqueada sin mostrar un error confuso. `api.js` conserva `code` y datos en errores de carga/descarga.

## 6. API: cambios

| Cambio | Tipo |
|---|---|
| `GET /api/flights/{flightId}/documents/access` | Nuevo |
| 409 `DOCUMENTS_LOCKED_SCHEDULE_NOT_AGREED` en `GET/POST /flights/{id}/documents*`, `/documents/{id}/lock` (GET/POST), `/documents/{id}/versions` (GET), `/documents/{id}/versions/pdf`, `/flights/{id}/documents/{item}/deactivate`, `/document-versions/{id}/download` | Nuevo comportamiento |
| `datosSanitarios.fechaRecepcion` en `FlightView` | Campo agregado (compatible) |

## 7. Base de datos

Sin migraciones: el modelo ya distinguía propuesta y aceptación. No se tocaron migraciones Flyway ni datos.

## 8. Pruebas

Ver el informe final de la entrega para los resultados ejecutados. Cobertura nueva:

* `DocumentScheduleGateTest` (11): todas las operaciones bloqueadas con `SOLICITADO` y `PENDIENTE_RESPUESTA_DTS`, sin escritura; habilitación con `APROBADO` y validaciones
  existentes; reapertura sin pérdida; 403 frente a 409; solicitudes cerradas; liberación de bloqueo propio; vuelos no sanitarios; falla cerrada.
* `SanitaryDocumentGateIntegrationTest` (4, HTTP + JWT + H2): solicitud del DTS → bandeja del CO → bloqueo → contrapropuesta → aceptación → carga; permisos; reapertura simulada; solicitudes cerradas; vuelo operativo.
* `DocumentAuthorizationTest` (matriz del nuevo endpoint y forma del 409), `DocumentServiceTest` (adaptado: los vuelos sanitarios de prueba tienen horario acordado).
* Frontend: `requestInbox.test.jsx` (12), ampliaciones en `documents.test.jsx` y `api.test.js`.
* E2E (SQL Server aislado): `scripts/e2e-documentos-horario.cjs` (nuevo, incluido en la suite) y `e2e-documentos.cjs` (escenario de solicitud rechazada actualizado: ya no puede tener documentos nuevos).

## 9. Limitaciones y decisiones a revisar

* Los documentos cargados antes de esta regla en solicitudes sin acuerdo (si existieran) quedan inaccesibles hasta el acuerdo (no se borran). Consulta de sólo lectura para revisarlo:
  `SELECT v.id_vuelos, v.codigo_vuelo, e.codigo_estado_solicitud, COUNT(*) AS documentos FROM documentos_vuelo d JOIN vuelos v ON v.id_vuelos=d.id_vuelos JOIN vuelos_sanitarios s ON s.id_vuelos=v.id_vuelos JOIN estados_solicitud_sanitaria e ON e.id_estados_solicitud_sanitaria=s.id_estados_solicitud_sanitaria WHERE e.codigo_estado_solicitud IN (N'SOLICITADO', N'PENDIENTE_RESPUESTA_DTS') GROUP BY v.id_vuelos, v.codigo_vuelo, e.codigo_estado_solicitud;`
* El modelo no permite reabrir un horario acordado, por lo que la política de re-bloqueo está implementada y probada a nivel servicio/integración pero no es alcanzable por la API hoy.
* El informe final del comandante (`/final-reports/.../file`) y los adjuntos de habilitaciones usan otro almacenamiento y no están afectados.
* La bandeja se actualiza por sondeo (30 s): una solicitud puede tardar hasta ese tiempo en aparecer si la pestaña ya estaba abierta y visible; «Actualizar» en «Vuelos visibles» la fuerza.
