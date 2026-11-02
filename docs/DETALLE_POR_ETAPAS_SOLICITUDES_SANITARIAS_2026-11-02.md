# Detalle del vuelo sanitario guiado por etapas (2026-11-02)

Corrige la pantalla de detalle de un vuelo sanitario: antes mostraba todas las herramientas operativas desde que se creaba la solicitud; ahora presenta
solamente la etapa real del vuelo. Complementa `SOLICITUDES_Y_BLOQUEO_DOCUMENTAL_HORARIO_2026-11-01.md`. Sin migraciones ni cambios de seguridad JWT.

## 1. Causa raíz

* La entrega anterior sólo condicionó la sección de **documentos** (la bloqueó y la explicó). El resto de los componentes de `Ops` (`HangarInfo`,
  `AirportCoordinations`, `FlightLog`, `WeatherHistory`, `TransferContacts`, `FlightRoute`, `FlightCrew`, `AuditTimeline`…) se renderizaban de forma incondicional.
* No existía una capa que dijera *qué corresponde mostrar en cada etapa*: cada componente decidía por sí mismo si podía escribir.
* La evaluación de la solicitud (`RequestEvaluation`) era el último elemento de la página, con sus tres formularios siempre visibles.
* El backend permitía guardar hangar, coordinaciones y bitácora manual con la solicitud en `SOLICITADO`/`PENDIENTE_RESPUESTA_DTS`: su regla `mutable` sólo
  excluía solicitudes rechazadas y vuelos cerrados (con `estadoVuelo` nulo se aceptaba cualquier estado de solicitud salvo `RECHAZADO`).

## 2. Matriz de visibilidad (vuelos sanitarios)

Derivada de los estados reales (`adaptFlight().estado` = estado del vuelo, o el de la solicitud mientras el vuelo no tiene estado). Una fecha planificada nunca
equivale a un acuerdo; la aprobación de la ruta del comandante tampoco. Fuente única: `frontend-react/src/flightStages.js` (`flightStage`, `visibleSections`).

| Sección | Negociación (`SOLICITADO`, `PENDIENTE_RESPUESTA_DTS`) | Horario acordado (`APROBADO`, sin recursos) | Preparación (`PLANIFICADO`) | Ejecución (`EN_CURSO`) | Cierre (`FINALIZADO`, `COMPLETADO`) | Cerrada acordada (`CANCELADO` tras acuerdo) | Rechazada / cancelada sin acuerdo |
|---|---|---|---|---|---|---|---|
| Resumen de la solicitud | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Negociación del horario | ✔ principal, con acciones | resumen + historial | ✔ | ✔ | ✔ | ✔ | ✔ historial |
| Asignación de recursos | — | ✔ | — | — | — | — | — |
| Cambio de aeronave / tripulación adicional / ruta | — | — | ✔ | tripulación y ruta | consulta | consulta | — |
| Hangar, coordinaciones, documentos | — | ✔ | ✔ | ✔ | consulta | consulta | — |
| Contactos del traslado | — | ✔ | ✔ | ✔ | — | — | — |
| Bitácora y clima | — | — | ✔ | ✔ | consulta | consulta | — |
| Iniciar / finalizar | — | — | ✔ iniciar | ✔ finalizar | — | — | — |
| Informe final | — | — | ✔ | ✔ | ✔ | — | — |
| Cancelar vuelo | — (se usa «Rechazar solicitud») | ✔ | ✔ | — | — | — | — |
| Historial de actividad (auditoría) | — (lo cubre el historial de negociación) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |

Quién usa cada acción (sin cambios en los permisos del backend): evaluar/proponer/rechazar = Operaciones; responder contrapropuesta y cancelar la propia solicitud = DTS;
asignar recursos, hangar, coordinaciones, bitácora = Operaciones (y comandante donde ya correspondía); documentos = reglas de `DocumentService`. El DTS nunca ve
herramientas de gestión operativa (`visibleSections(..., "DTS")`). Los vuelos no sanitarios conservan todas sus secciones (etapa `OPERATIVO`).

«Cerrada acordada» se reconoce por los eventos `CO_ACEPTA_PROPUESTA` / `DTS_ACEPTA_CONTRAPROPUESTA` de la negociación (o una salida acordada en vuelos históricos): sólo sirve para no
perder el acceso de consulta a lo cargado antes de la cancelación.

## 3. Frontend

* `flightStages.js` (nuevo): etapa y secciones por etapa/rol (probado en `flightStages.test.js`).
* `negotiation.jsx` (nuevo): `RequestSummary` (datos de la solicitud, sin paciente ni datos médicos), `NegotiationPanel` (tarea principal de Operaciones), `NegotiationHistory`
  (etiquetas legibles), `CancellationFields` y `openProposal` (movidos desde `main.jsx`).
* `NegotiationPanel`: muestra horario solicitado, última propuesta vigente, quién debe responder y el siguiente paso. Las acciones se despliegan de a una:
  **Aceptar horario solicitado** (con confirmación), **Proponer otro horario** (fecha + motivo; «Reemplazar propuesta» si ya hay una pendiente) y **Rechazar solicitud**
  (motivo del catálogo). «Cancelar» vuelve al resumen sin tocar nada; si la operación falla el formulario queda abierto y la ficha se relee. Tras el acuerdo se reduce a
  «Horario acordado» + historial.
* `main.jsx`: `Ops` renderiza sólo las secciones de la etapa; al abrir una solicitud desde la bandeja se muestra únicamente su detalle (sin formulario de vuelo operativo, informes
  ni lista general) con «← Volver a la bandeja». La ficha se vuelve a leer cuando el refresco periódico detecta que otra sesión cambió el estado. `DtsResponses` pone la respuesta
  pendiente primero y oculta documentos/contactos/historial que no corresponden a la etapa. `RequestEvaluation` fue reemplazado por `NegotiationPanel`.
* `index.html`: se agregó `<meta name="viewport">`; sin ella los teléfonos renderizaban a 980 px y nunca se aplicaban las reglas responsive. En pantallas angostas la negociación se
  ubica antes del resumen.

## 4. Backend

Se encontró que hangar, coordinaciones y bitácora manual aceptaban escrituras sin horario acordado. Nuevo `PreparationStageGate` (comparte con `DocumentScheduleGate` la definición
única de acuerdo):

| Operación | Antes del acuerdo |
|---|---|
| `PUT /flights/{id}/hangar` y `/hangar/commander-observation` | 409 `SCHEDULE_NOT_AGREED` |
| `POST/PUT /flights/{id}/airport-coordinations` | 409 `SCHEDULE_NOT_AGREED` |
| `POST /flights/{id}/log` (bitácora manual y correcciones) | 409 `SCHEDULE_NOT_AGREED` (403 si falta el permiso) |
| Documentos (entrega anterior) | 409 `DOCUMENTS_LOCKED_SCHEDULE_NOT_AGREED` |
| Lecturas de hangar / coordinaciones / bitácora | permitidas; `puedeGestionar` / `puedeRegistrar` = false con el motivo «Disponible cuando el horario de salida esté acordado» |

Respuesta: `{"error": "No se puede … hasta que el horario de salida esté acordado: la solicitud todavía está en negociación.", "code": "SCHEDULE_NOT_AGREED", "estadoSolicitud": "…", "pendientePor": "OPERACIONES|DTS"}`.

Ya estaban correctamente restringidos (verificado): asignación de recursos y cambio de aeronave (exigen `APROBADO`), tripulación (exige estado de vuelo), clima y planificación
del comandante y ruta (exigen `PLANIFICADO`), inicio/finalización (exigen `PLANIFICADO`/`EN_CURSO`). **No se bloquea** la auditoría ni el historial automático: la creación de la solicitud,
las propuestas, aceptaciones y rechazos, y los eventos `INICIO/FINALIZACION/CANCELACION` siguen registrándose. Los contactos del traslado los edita el DTS (datos de su solicitud) y
no se restringieron en el backend; sólo se ocultan al CO durante la negociación.
La bitácora manual se habilita en el backend con el acuerdo (`APROBADO`), mientras que la interfaz la muestra desde `PLANIFICADO` (es una herramienta de seguimiento, no de negociación).

## 5. Datos existentes y renegociación

No se borra ni modifica nada: las escrituras de etapas posteriores sólo se rechazan, las lecturas siguen disponibles y los registros previos al acuerdo (si existieran en datos
históricos) quedan intactos y se vuelven a mostrar cuando el vuelo llega a la etapa correspondiente. Como el modelo no permite reabrir un horario acordado (el disparador SQL V44
sólo admite `APROBADO` → `CANCELADO`), el re-bloqueo está implementado (la regla se evalúa en cada operación) y cubierto por pruebas de servicio e integración, pero no es alcanzable por la API.

## 6. Pruebas

Ver el informe final de la entrega para los resultados. Cobertura agregada: `flightStages.test.js` (matriz), `negotiation` en `requests.test.jsx`, escenario completo de interfaz en
`requestInbox.test.jsx` (solicitud nueva → contrapropuesta → acuerdo desde otra sesión → preparación; rechazo; confirmación), `dts-stage.test.jsx`, `FlightLogServiceTest` (bitácora y puerta),
`SanitaryDocumentGateIntegrationTest` (hangar, coordinaciones y bitácora por HTTP), `scripts/e2e-documentos-horario.cjs` (SQL Server real) y los E2E de interfaz actualizados
(`e2e-solicitudes-ui.cjs`, `e2e-sanitario-replanificacion-ui.cjs`). `scripts/e2e-sembrar-validacion-visual.cjs` siembra datos marcados en la base E2E para revisar las pantallas.
