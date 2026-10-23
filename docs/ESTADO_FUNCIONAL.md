# Estado funcional y guía de continuidad

Actualizado el 2026-10-13 tras validar las migraciones V1--V31 en el entorno aislado E2E. Este documento describe el estado objetivo del código actual; no sustituye a las migraciones ni al diccionario físico.

## Convenciones de SQL Server y Flyway

- SQL Server es la única base soportada. Flyway es la fuente de verdad: Hibernate usa `ddl-auto=validate` y nunca crea ni modifica tablas.
- Desde V27 cada tabla de aplicación usa una identidad `BIGINT` llamada `id_<tabla>`; cada FK se llama `id_<tabla_referida>` o una variante semántica `id_usuario_*`, `id_aeropuerto_*`.
- V28 contextualiza columnas de negocio con `snake_case` en español. No se deben introducir nombres anteriores (`flight_id`, `user_id`, `codigo`, `activo`, etc.) en mappings nuevos.
- `DATETIME2(3)` contiene hora civil del negocio; la zona se configura con `BUSINESS_TIME_ZONE`. Las obligaciones de informes conservan instantes en `DATETIMEOFFSET` cuando corresponde.
- Las migraciones V24 y V27 son cortes históricos de desarrollo: V24 elimina datos transaccionales UUID para reconstruir identificadores BIGINT. No son una receta de recreación para una base con datos que se deban conservar. Las migraciones posteriores son incrementales.

En una instalación nueva, Flyway aplica V1--V31 al iniciar el backend. Antes de actualizar una base existente se debe revisar `flyway_schema_history`, tomar respaldo según la política del entorno y ejecutar el backend con credenciales DDL; no se debe ejecutar `down -v`, V24 manualmente ni un script de limpieza contra una base de desarrollo compartida.

## Arquitectura y ciclo de vuelos

`vuelos` es la entidad operativa común. `vuelos_sanitarios` es una extensión 0..1 con paciente, solicitud, prioridad y datos clínicos; los vuelos operativos no crean esa extensión. Los catálogos `tipos_vuelo`, `estados_vuelo` y `estados_solicitud_sanitaria` mantienen el significado de cada flujo.

El ciclo operativo normal es `SOLICITADO -> APROBADO -> PLANIFICADO -> EN_CURSO -> FINALIZADO -> COMPLETADO`. Los rechazos sanitarios ocurren antes de la operación; las cancelaciones operativas son previas a la ejecución y SQL Server las valida mediante trigger. Operaciones/Centro de Operaciones evalúan, asignan recursos, inician y finalizan; el comandante confirma, planifica lo que le corresponde y registra el informe final. Los bloqueos de informe vencido se verifican en la operación protegida, no en el navegador.

## Informes finales

> Actualizado en V42 (2026-10-20): ver la sección de cierre al final de este apartado; lo anterior se conserva como contexto y fue corregido donde cambió.

Al finalizar un vuelo se crea una obligación para el comandante. La primera presentación pasa a `PRESENTADO`; Operaciones/Centro de Operaciones puede aprobarla (el vuelo llega a `COMPLETADO`) o devolverla. Una devolución crea un vencimiento de corrección de 48 horas desde el evento y reinicia la prórroga de esa obligación. El acceso del comandante queda bloqueado por obligaciones vencidas, pero el envío del informe pendiente sigue permitido para resolver el bloqueo. Las pruebas de servicio usan un `Clock` fijo para mantener las reglas temporales deterministas.

### Cierre de vuelos (V42)

**Estados.** EN_CURSO → FINALIZADO (sólo CO/OPERACIONES, registra hora real en la zona de negocio, mueve aeronave/comandante y crea la obligación) → COMPLETADO (sólo al aprobar el informe). FINALIZADO es el cierre operativo; COMPLETADO es el cierre administrativo. Un vuelo CANCELADO, RECHAZADO (solicitud sanitaria) o sin ejecutar no se inicia ni finaliza; una solicitud rechazada tampoco puede cancelarse. El trigger `trg_vuelos_validar_cierre` impide por SQL transiciones fuera de orden.

**Plazo.** 48 h desde FINALIZADO (`DATETIMEOFFSET`, reloj del servidor, una obligación por vuelo). La devolución reinicia 48 h y rehabilita la prórroga única de 24 h. El bloqueo es `vencimiento <= ahora` con obligación PENDIENTE o DEVUELTO: se evalúa en cada operación, no depende de ningún proceso ni de sesión. Un comandante bloqueado no puede (403 `COMANDANTE_BLOQUEADO`): responder asignaciones, planificar, registrar clima, cancelar, guardar ruta, observar hangar, registrar bitácora ni documentos como comandante, ni se le puede iniciar un vuelo o asignar nuevos vuelos (409). Sí puede autenticarse, consultar vuelos, notificaciones e informes y presentar/corregir sus informes. Se desbloquea al no quedar ninguna obligación vencida; con varias, sólo la última lo levanta.

**Informe (formatos).** Cada versión es TEXTO, PDF o TEXTO_Y_PDF (al menos uno; horas, combustible e incidentes opcionales). No se admiten DOC/DOCX: ningún requisito documentado los exige y los documentos del vuelo son sólo PDF desde V22. El PDF de una versión no es un documento general del vuelo (no usa el bloqueo documental ni la restricción de vuelos finalizados): se guarda en el almacenamiento privado del backend con clave aleatoria, y la fila de la versión conserva nombre saneado para mostrar, tamaño, SHA-256 y ubicación (columnas `adjunto_*`, V43; nunca se expone la ubicación). Validación al presentar: extensión .pdf, tipo application/pdf, tamaño máximo (`MAX_PDF_BYTES`), cabecera `%PDF-1.x`, marcador `%%EOF` en el final y rechazo de contenido activo visible (/JavaScript, /JS, /Launch, /EmbeddedFile, /RichMedia). Es una comprobación estructural, no un antivirus. Si la transacción falla o se revierte el archivo se elimina; un rechazo no deja archivos. Descarga: `GET /api/final-reports/{id}/versions/{version}/file` (comandante responsable, CO/OPERACIONES, ADMINISTRADOR) con `attachment`, `nosniff` y sin caché; nombre generado por el servidor. Presentación multipart: `POST /api/final-reports/{id}/submit` con `texto`, `horasVuelo`, `combustibleConsumidoLitros`, `incidentes` y `file`. La revisión, devolución, reentrega y aprobación son idénticas para cualquier formato; una versión devuelta conserva su archivo.

**Informe (reglas).** Sólo el comandante responsable presenta; sólo con el vuelo FINALIZADO y la obligación PENDIENTE o DEVUELTO (una versión PRESENTADA o APROBADA no admite otra). Cada versión conserva su decisión (PRESENTADO, DEVUELTO con motivo obligatorio, APROBADO), revisor y fecha; las versiones nunca se eliminan.

**Procedencia de decisiones históricas (V43).** `origen_decision` distingue FLUJO_ACTUAL de datos anteriores a V42: HISTORICA_OBLIGACION y HISTORICA_OBLIGACION_AUDITADA sólo si la obligación (y, en el segundo caso, la auditoría) respaldan la decisión; HISTORICA_SIN_EVIDENCIA para lo no comprobable, con estado HISTORICO_SIN_DECISION (informe sin obligación o aprobación sin vuelo completado) o REEMPLAZADO (versión sustituida). Nunca se fabrican aprobaciones ni devoluciones y un informe histórico sin decisión no puede revisarse como si lo fuera.

**Endpoints** (`/api/final-reports`): `GET /mine` (COMANDANTE), `GET /pending-review` y `GET /awaiting-commander` (OPERACIONES, CENTRO_OPERACIONES), `GET /{id}` y `GET /flight/{flightId}` con historial (comandante responsable, CO/OPERACIONES, ADMINISTRADOR), `POST /{id}/submit`, `POST /{id}/extension` (COMANDANTE), `POST /{id}/review` (CO/OPERACIONES). `GET /api/flights/{id}` incorpora `cierre` (estado administrativo: INFORME_PENDIENTE, INFORME_VENCIDO, INFORME_DEVUELTO, EN_REVISION o CERRADO).

**Destinatarios.** Comandante: sus obligaciones, devoluciones, aprobaciones, vencimientos y bloqueos. DTS solicitante: sólo finalización y cierre de su vuelo sanitario (código de vuelo, sin datos clínicos). Operaciones: los avisos de gestión (presentación, nueva presentación, vencida) van al responsable concreto del cierre (`id_usuario_finalizador` de la obligación) y, en reentregas, a quien devolvió el informe; si ninguno es elegible (histórico sin responsable, baja o sin rol) se envían a todos los usuarios activos de OPERACIONES y CENTRO_OPERACIONES porque la cola de revisión es compartida. Cada aviso conserva `id_vuelos` y una clave de evento única por usuario.

**Notificaciones** (clave de evento única por usuario): FLIGHT_FINISHED, FINAL_REPORT_PENDING, FINAL_REPORT_DUE_SOON (12 h antes; `FINAL_REPORT_DUE_SOON_HOURS`), FINAL_REPORT_OVERDUE, COMMANDER_BLOCKED, FINAL_REPORT_SUBMITTED, FINAL_REPORT_RESUBMITTED, FINAL_REPORT_RETURNED, FINAL_REPORT_APPROVED, FLIGHT_COMPLETED, COMMANDER_UNBLOCKED, FINAL_REPORT_EXTENSION. El barrido (`FinalReportDeadlineService`, `FINAL_REPORT_SWEEP_MS` 60 s, desactivable con `FINAL_REPORT_SWEEP_ENABLED=false`) sólo avisa y audita `OVERDUE`; no es necesario para bloquear. No hay correo ni integraciones externas.

**Auditoría** (`eventos_auditoria`): START, FINISH, FINAL_REPORT_OBLIGATION CREATE/EXTEND/OVERDUE/UNBLOCK_COMMANDER, FINAL_REPORT SUBMIT/RESUBMIT/RETURN/APPROVE y FLIGHT COMPLETE, con actor y valores anterior/nuevo.

**Reloj controlado.** `Clock` es inyectable; con `APP_E2E_CONTROLS_ENABLED=true` **y** el perfil Spring `e2e` (sólo en el overlay E2E aislado; desactivado por defecto; el flag sin el perfil impide el arranque y el controlador `/api/e2e` exige el perfil) el reloj es ajustable y `/api/e2e` (ADMINISTRADOR) permite fijar la hora y ejecutar el barrido a demanda. `ClosureTimelineTest` y el E2E de API recorren el plazo (48 h exactas incluso con cambio de horario o de día, aviso a 12 h, vencimiento y bloqueo sin barrido previo, reinicio por devolución, varias obligaciones) sin modificar columnas SQL.

**Bloqueo.** `CommanderWriteEndpointsGuardTest` inventaría los endpoints de escritura alcanzables por un COMANDANTE; los operativos (asignación, rechazo y contrapropuesta, planificación, clima, cancelación, ruta, hangar, bitácora, documentos, lease documental) exigen `CommanderReportAccessService` antes de validar el estado; las acciones de regularización (presentar, prórroga, notificaciones) no.

**Trigger de COMPLETADO.** `trg_vuelos_validar_cierre` (V43) sólo permite COMPLETADO desde FINALIZADO con la obligación vigente APROBADO sobre una versión vigente APROBADA; `trg_obligaciones_informe_validar_aprobacion` exige vuelo FINALIZADO/COMPLETADO y versión aprobada para aprobar una obligación. El backend persiste versión y obligación antes de cambiar el vuelo. Sólo se evalúan cambios de estado.

**Trayecto.** `FlightView` conserva `origen`/`destino` (nombre del aeropuerto) y agrega `origenDetalle`/`destinoDetalle` ({nombre, provincia}); la interfaz usaba el nombre como si fuera un objeto y mostraba `undefined`.

**Pruebas.** Backend: `FinalReportWorkflowServiceTest`, `FlightClosureServiceTest`, `FinalReportDeadlineServiceTest`, `ClosureTimelineTest`, `ReportAttachmentServiceTest`, `AdjustableClockTest`, `CommanderWriteEndpointsGuardTest`; frontend: `closure.test.jsx` y `main.test.jsx`. E2E contra el stack aislado (nunca contra la base habitual): `scripts/e2e-cierre.cjs` (API, SQL, reloj controlado y reinicio), `scripts/e2e-cierre-ui.cjs` (Chrome, requiere el paquete `playwright` en `NODE_PATH`) y `scripts/e2e-migracion-historica.cjs` (base descartable V41 con datos históricos → V43). El tiempo se controla con el reloj ajustable del backend E2E; ya no se adelantan vencimientos por SQL.

## Ciclo previo a la planificación (V44)

**Estados.** La solicitud sanitaria (`estados_solicitud_sanitaria`) es independiente del estado operativo del vuelo (`estados_vuelo`): SOLICITADO → APROBADO | RECHAZADO | PENDIENTE_RESPUESTA_DTS | CANCELADO; PENDIENTE_RESPUESTA_DTS → APROBADO | CANCELADO; APROBADO → CANCELADO; RECHAZADO y CANCELADO son terminales. El vuelo sanitario no tiene estado operativo hasta que Operaciones asigna recursos (PLANIFICADO, sólo con la solicitud APROBADO); CANCELADO exige la solicitud CANCELADA. RECHAZADO es la decisión de Operaciones sobre la solicitud; CANCELADO es una cancelación (del DTS al rechazar una propuesta, o autorizada). Los triggers `trg_vuelos_sanitarios_validar_estado` y `trg_vuelos_coherencia_sanitaria` (V44) lo impiden aun por SQL directo; el backend persiste primero la solicitud y luego el vuelo.

**Urgencia.** Normal: desde pasado mañana (días calendario de la zona de negocio, calculados por el servidor con el reloj de negocio). Hoy o mañana: extrema urgencia, con justificación y horario límite obligatorios (límite no anterior al horario solicitado ni al momento actual). Las solicitudes de extrema urgencia abiertas se listan primero (por horario límite), se destacan en la interfaz y el aviso al comandante empieza con "EXTREMA URGENCIA"; la urgencia no omite ningún control de disponibilidad. Los avisos nunca llevan diagnóstico ni la justificación.

**Evaluación (Operaciones: CENTRO_OPERACIONES u OPERACIONES).** `POST /api/flights/{id}/schedule/accept` (el horario solicitado debe seguir en el futuro), `/schedule/reject` (RECHAZADO con motivo del catálogo; OTRO exige descripción), `/schedule/counterproposal` (motivo obligatorio, horario futuro distinto del solicitado y dentro del límite de urgencia; una nueva propuesta reemplaza a la vigente y la anterior queda obsoleta).

**Negociación con el DTS.** `POST /api/flights/{id}/schedule/response` (sólo el DTS solicitante) con `aceptar` y `propuestaId` obligatorio: si la propuesta fue reemplazada o respondida → 409; si su horario ya pasó no puede aceptarse → 400. Aceptar fija la planificación (la fecha solicitada original se conserva); rechazar exige motivo del catálogo y cancela la solicitud y el vuelo conservando todo el historial. Cada respuesta enlaza la propuesta que contesta (`id_negociacion_respondida`, índice único: una respuesta por propuesta).

**Vuelos operativos.** Crea Operaciones (o ADMINISTRADOR) con motivo obligatorio. El comandante asignado confirma, rechaza con motivo (el vuelo pasa a PENDIENTE_REPLANIFICACION, no se cancela) o propone horario futuro con motivo; **la autoridad que responde la contrapropuesta es Operaciones** (`POST /api/flights/{id}/commander-proposal/response` con `propuestaId`): al aceptar se revalidan aeronave y comandante (con bloqueo de filas: dos confirmaciones concurrentes sobre los mismos recursos → 1 éxito y 1 conflicto 409); al rechazar vuelve al comandante. El DTS no interviene.

**Cancelación** (`POST /api/flights/{id}/cancel`). Operaciones cancela cualquier vuelo previo a la ejecución; el DTS sólo su propia solicitud (SOLICITADO, PENDIENTE_RESPUESTA_DTS o APROBADO sin ejecutar); el comandante no cancela. No se cancela un vuelo EN_CURSO, FINALIZADO, COMPLETADO, CANCELADO ni una solicitud RECHAZADA. Motivo del catálogo obligatorio (activo); OTRO exige descripción y los demás la prohíben. Se registran fecha, actor y motivo, bitácora automática y auditoría con los recursos liberados (aeronave y comandante); los recursos quedan disponibles porque CANCELADO no cuenta en las validaciones de superposición. Avisos a los afectados (solicitante, comandante, responsable de Operaciones), sin autoaviso. Un vuelo iniciado no admite cambios de recursos.

**Información operativa.** Ruta, hangar y coordinaciones usan la instantánea de contexto del vuelo: si cambian horarios, recursos o aeropuertos pasan a REQUIERE_REVISION sin borrar versiones.

**Notificaciones** (clave única por usuario y hecho): NEW_SANITARY_REQUEST, EXTREME_URGENCY_REQUEST, SCHEDULE_ACCEPTED, REQUEST_REJECTED, SCHEDULE_COUNTERPROPOSAL, SCHEDULE_PROPOSAL_ACCEPTED, SCHEDULE_PROPOSAL_REJECTED, FLIGHT_CANCELLED, COMMANDER_ASSIGNED, COMMANDER_ASSIGNMENT_ACCEPTED/REJECTED, COMMANDER_SCHEDULE_PROPOSED/ACCEPTED/REJECTED. Los avisos de gestión van al evaluador de la solicitud o al creador del vuelo operativo y, si no hay responsable elegible (solicitud nueva), a la cola compartida de Operaciones. **Auditoría**: APPROVE, REJECT, COUNTERPROPOSE, REPLACE_COUNTERPROPOSAL, ACCEPT_COUNTERPROPOSAL, CANCEL y las respuestas del comandante.

**Interfaz.** DTS: crea solicitudes, ve la propuesta vigente, la acepta o rechaza (motivo del catálogo; el campo OTRO ahora aparece), cancela su solicitud y ve los motivos de rechazo o cancelación. Operaciones: lista con urgentes primero y destacadas, aprueba, propone o reemplaza, rechaza con motivo, responde las propuestas del comandante y cancela. Comandante: urgencia, historial y cancelación visibles, y confirma, rechaza o propone horario. Tras cada operación se vuelve a leer el estado del backend.

**Pruebas.** `RequestNegotiationServiceTest`, `requests.test.jsx`, `scripts/e2e-solicitudes.cjs` (API/SQL/reloj/reinicio/concurrencia/rollback) y `scripts/e2e-solicitudes-ui.cjs` (Chrome). Cambio de contrato: `schedule/response` y `commander-proposal/response` exigen `propuestaId` (los E2E Python históricos que no lo envían ya no son compatibles).

## Documentos PDF, versiones y lease

Un documento de vuelo es una identidad lógica en `documentos_vuelo`; cada PDF se guarda como una fila inmutable de `versiones_documento_vuelo` y como un archivo bajo `DOCUMENTS_DIRECTORY`. Hay una sola versión vigente, respaldada por un índice filtrado. La descarga sigue autorizada por vuelo y nunca expone una ruta de almacenamiento.

Crear un documento lógico no requiere lease porque aún no existe un recurso compartido. Para crear una versión de un documento existente se exige un lease vigente del servidor:

- `POST /api/documents/{id}/lock` adquiere o renueva el lease. La fila de `documentos_vuelo` se bloquea pesimistamente durante esa operación y la tabla `bloqueos_documento_vuelo` impone unicidad por documento.
- Un lease vigente de otro propietario devuelve `409`; uno vencido puede recuperarse y queda auditado. Sólo el propietario actual puede liberarlo mediante `DELETE`.
- `POST /api/documents/{id}/versions/pdf` toma el mismo bloqueo pesimista y revalida propietario y vencimiento antes y después de guardar el PDF, dentro de la transacción que crea la versión. Esto rechaza escrituras tardías y evita que dos versionados simultáneos generen números o versiones actuales contradictorios.
- La interfaz consulta el estado al servidor y sólo presenta las acciones que corresponden, pero el servidor es la autoridad: un estado local no habilita ninguna escritura. El mismo componente React se muestra en Comandante y en Centro de Operaciones/Operaciones; DTS sólo puede leer historial y descargar.

Los roles que pueden crear documentos, adquirir/liberar lease o versionar son `COMANDANTE`, `OPERACIONES` y `CENTRO_OPERACIONES`; la autorización concreta sobre el vuelo se comprueba además en el servicio. `DTS` comparte solamente lectura de historial, estado y descarga.

## Auditoría

`eventos_auditoria` registra actor, entidad, operación, vuelo y snapshots acotados. No registra PDFs ni contenido clínico. La planificación operativa, inicio y finalización de vuelo se auditan como `OPERATIONAL_PLANNING`, `START` y `FINISH`. Las acciones de lease se auditan como `DOCUMENT_LOCK` con `ACQUIRE`, `RECOVER` o `RELEASE`. La consulta está paginada y reservada a los roles autorizados.

## Docker, inicialización y pruebas

El compose habitual crea SQL Server, `db-init`, backend, frontend y un inicializador de permisos para `documents_data`; el backend corre como usuario no privilegiado y Flyway se ejecuta al iniciar. Las credenciales provienen exclusivamente de `.env` (ignorado) o variables de entorno; `.env.example` no contiene secretos. `docker-compose.e2e.yml` es un overlay explícito, usa el proyecto `vuelos-sanitarios-e2e`, la base `vuelos_sanitarios_e2e`, puertos alternativos y leases de un segundo sólo para E2E. No forma parte de `docker compose up` habitual.

Ejecutar la verificación local:

```powershell
cd backend-java
mvn test
cd ..\frontend-react
npm test -- --run
npm run build
```

La validación E2E contra SQL Server se ejecuta de forma aislada con:

```powershell
docker compose --env-file .env --env-file .env.e2e -p vuelos-sanitarios-e2e -f docker-compose.yml -f docker-compose.e2e.yml up --build
```

No se deben usar esas pruebas para borrar, reseedear ni modificar una base habitual. Para inspeccionar una base de desarrollo sin alterarla, primero confirmar conexión y consultar `flyway_schema_history`; sólo el arranque normal del backend aplica migraciones pendientes.

## Estado consolidado

| Área | Estado |
| --- | --- |
| Migraciones | V1--V31 validadas en SQL Server E2E; V30 corrige el trigger tras V28 y V31 agrega leases. |
| Backend | Pruebas unitarias e integración del proyecto en verde. |
| Frontend | Pruebas y compilación en verde; no sustituye los controles de autorización del backend. |
| Pendientes funcionales | Gestión visual integral de documentos (alta, historial y carga desde lista), mantenimiento administrativo más detallado y las mejoras de negocio que se prioricen después. |

## Administración de aeronaves y tripulación adicional (V45, 2026-10-21)

**Modelo.** V45 agrega a `vuelos_tripulantes` las columnas `fecha_baja`, `id_usuario_baja` (FK a `usuarios`) y `motivo_baja` (RETIRO, REEMPLAZO, CAMBIO_COMANDANTE) con un CHECK de coherencia (las tres nulas = asignación vigente), reemplaza las restricciones únicas históricas por el índice único filtrado `ux_vuelos_tripulantes_asignacion_vigente (id_vuelos, id_usuarios) WHERE fecha_baja IS NULL` y crea un índice de compromisos vigentes por usuario. No agrega tablas; las filas existentes quedan vigentes. `aeronaves` no cambia: el actor y la fecha de alta constan en `eventos_auditoria`.

**Reglas.** `FlightStates` es la fuente única de estados comprometidos (PENDIENTE_CONFIRMACION_COMANDANTE, PENDIENTE_RESPUESTA_OPERACIONES, PLANIFICADO, EN_CURSO). La disponibilidad de una aeronave para un intervalo usa `FlightRepository.aircraftBusyIn` (la superposición de `overlappingAircraft` más los vuelos con salida y sin llegada, que ocupan al menos su instante de salida) tanto en las asignaciones como en los listados; no existe otro mecanismo. Toda operación sobre una aeronave toma el bloqueo de su fila (el mismo de `FlightService`). Todas las consultas de tripulación consideran sólo asignaciones vigentes; el historial se obtiene con `?history=true`.

**Endpoints** (todos con autorización en servidor):

| Método y ruta | Roles | Resultado |
|---|---|---|
| GET `/api/catalogs/aircraft` | todos los autorizados al catálogo | aeronaves activas (vista operativa) |
| GET `/api/catalogs/aircraft/admin` | ADMINISTRADOR | todas, con `estadoOperativo`, `vuelosComprometidos`, `proximoVuelo` |
| GET `/api/catalogs/aircraft/{id}`, `/{id}/flights` | ADMINISTRADOR, OPERACIONES, CENTRO_OPERACIONES | detalle y vuelos de la aeronave (sin datos de pacientes) |
| GET `/api/catalogs/aircraft/{id}/history` | ADMINISTRADOR | eventos de auditoría con actor, fecha y valores |
| GET `/api/catalogs/aircraft/availability?from&to` | ADMINISTRADOR, OPERACIONES, CENTRO_OPERACIONES | aeronaves activas con `disponible`, motivo y vuelos en conflicto |
| POST `/api/catalogs/aircraft` | ADMINISTRADOR | alta; 400 validación / aeropuerto inválido; 409 `DUPLICATE_PLATE` |
| PUT `/api/catalogs/aircraft/{id}` | ADMINISTRADOR | edición administrativa; `activo`/`aeropuertoActualId` distintos del vigente → 400; 409 `AIRCRAFT_IN_FLIGHT`, `AIRCRAFT_CAPACITY_CONFLICT`, `AIRCRAFT_EQUIPMENT_CONFLICT`, `DUPLICATE_PLATE` |
| POST `/api/catalogs/aircraft/{id}/active` `{activo, motivo?}` | ADMINISTRADOR | baja lógica o reactivación; 409 `AIRCRAFT_IN_FLIGHT`, `AIRCRAFT_HAS_ASSIGNMENTS` (con `vuelos`), `AIRCRAFT_WITHOUT_LOCATION`, `AIRCRAFT_ALREADY_*` |
| POST `/api/catalogs/aircraft/{id}/location` `{locationId, motivo?}` | ADMINISTRADOR, OPERACIONES, CENTRO_OPERACIONES | cambio manual de ubicación; 409 `AIRCRAFT_IN_FLIGHT`, `AIRCRAFT_LOCATION_CONFLICT` |
| GET `/api/catalogs/crew-roles` | ADMINISTRADOR, OPERACIONES, CENTRO_OPERACIONES, COMANDANTE | funciones de tripulación |
| GET `/api/flights/{id}/aircraft-candidates` | OPERACIONES, CENTRO_OPERACIONES | aeronaves compatibles con `disponible`, `motivoNoDisponible` y `conflictos` (`/available-aircraft` devuelve sólo las disponibles) |
| POST `/api/flights/{id}/aircraft` `{aircraftId, motivo?}` | OPERACIONES, CENTRO_OPERACIONES | cambio de aeronave antes del inicio; en un vuelo operativo el origen pasa a la ubicación de la nueva aeronave y, si cambia, el vuelo vuelve a PENDIENTE_CONFIRMACION_COMANDANTE |
| GET `/api/flights/{id}/crew?history=` | OPERACIONES, CENTRO_OPERACIONES, COMANDANTE (sólo el asignado) | tripulación vigente o con historial (`vigente`, `asignadoPor`, `fechaBaja`, `bajaPor`, `motivoBaja`) |
| GET `/api/flights/{id}/crew/candidates?role=` | OPERACIONES, CENTRO_OPERACIONES | elegibles con `disponible` y motivo (`/crew/available` devuelve sólo los disponibles) |
| POST / PUT `/{crewId}` / DELETE `/{crewId}` `/api/flights/{id}/crew` | OPERACIONES, CENTRO_OPERACIONES | asignar, reemplazar y retirar; 409 duplicado, conflicto de horario, capacidad o asignación ya cerrada; 400 estado del vuelo, persona o función no habilitada |

**Decisiones.** (a) La baja de una aeronave con vuelos comprometidos se rechaza en lugar de liberar recursos de forma implícita: Operaciones debe cambiar la aeronave o cancelar el vuelo. (b) El cambio manual de ubicación se mantiene para Operaciones (compatibilidad con los E2E históricos) además del Administrador. (c) `ADMINISTRADOR` no gestiona ni consulta tripulaciones (mínimo privilegio). (d) La desactivación de usuarios ahora también considera vuelos pendientes de confirmación. (e) `ApiExceptionHandler` informa las víctimas de bloqueo mutuo o fallos de serialización como 409 `CONCURRENT_MODIFICATION` en lugar de 500. (f) Los modales de administración ahora tienen desplazamiento propio (el botón Cerrar quedaba fuera de pantalla con listados largos).

**Frontend.** `aircraft.jsx` (`AdminAircraft`: pestañas activas/desactivadas, buscador, estado operativo, alta/edición, ubicación con búsqueda de aeropuertos, baja y reactivación con confirmación, detalle con vuelos e historial; `FlightAircraft`: aeronave del vuelo y cambio con candidatas y conflictos) y `FlightCrew` en `main.jsx` (funciones del catálogo, personal disponible y no disponible con el vuelo en conflicto, retiro con confirmación, historial). El dashboard del Administrador conserva sólo los accesos rápidos. El comandante ve la aeronave (matrícula, modelo, tipo, ubicación) y la tripulación sin acciones de modificación.

## Consulta de auditoría por roles (V46)

`eventos_auditoria` es un registro de **sólo inserción**: la entidad es `@Immutable`, V46 agrega `tr_eventos_auditoria_inmutable` (rechaza UPDATE y DELETE en SQL Server) y la API no expone operaciones de escritura. `AuditService.record` exige la transacción de la operación auditada (`MANDATORY`) y toma la hora del reloj de negocio, guardada en UTC; la API entrega el instante en UTC (`...Z`) junto con la zona de presentación (`America/Argentina/Tucuman`) y la interfaz formatea con esa zona, nunca con la del navegador. Los eventos anteriores a V46 se interpretan como UTC.

**Endpoints** (`/api/audit`, sólo lectura; los de filtros y listado global requieren `ADMINISTRADOR`):

| Método y ruta | Perfiles | Detalle |
|---|---|---|
| GET `/api/audit` | ADMINISTRADOR | Filtros `from`, `to` (días civiles de la zona de negocio, inclusivos), `actorId`, `entityType`, `operation`, `flightId`, `entityId`; `order` (`desc` por omisión o `asc`), `page` (≥ 0), `size` (1–100, por omisión 20); desplazamiento máximo 10 000 filas; 400 ante parámetros inválidos. Orden estable por fecha e id. |
| GET `/api/audit/filters` | ADMINISTRADOR | Tipos, acciones y usuarios (incluidos desactivados, hasta 500) para los selectores; `maxPageSize`. |
| GET `/api/audit/flights/{id}` | ADMINISTRADOR, OPERACIONES, CENTRO_OPERACIONES, COMANDANTE (actual), DTS (solicitante) | Historial del vuelo según el perfil; mismos parámetros de paginación y filtros por tipo y acción. 404 vuelo inexistente, 403 sin vínculo. |
| GET `/api/audit/events/{id}` | los mismos | Detalle con cambios etiquetados, notas sobre datos faltantes u ocultos y detalle técnico ya saneado. 404 si no existe o no es visible para el perfil. |

**Protección de datos.** La respuesta nunca es la entidad JPA. `AuditAccessPolicy` define, por perfil, qué tipos de entidad, acciones y campos se ven (lista blanca; un tipo nuevo no se expone por omisión) y se traduce a condiciones SQL, de modo que el total y las páginas sólo cuentan lo visible. `AuditSanitizer` oculta (`[oculto]`) cualquier clave de contraseña, hash, token, secreto, clave de almacenamiento, diagnóstico o dato clínico, enmascara el número de habilitación (últimos 4 caracteres), acota textos (400) y cantidad de campos (60) y explica los datos faltantes sin inventarlos. Ante un DTS el personal se identifica por función. Nada depende de ocultar campos en React.

**Frontend.** `audit.jsx`: `AdminAudit` (sección Auditoría del menú del Administrador: filtros, tabla paginada, detalle, acceso contextual a Aeronaves y Usuarios y "Ver su historial" por vuelo), `AuditTimeline` (historial contextual reutilizable en los detalles de Operaciones, Comandante y DTS —"Evolución de mi solicitud"—) y `AuditEventDetail`/`AuditChanges` (valor anterior y posterior, campos sin cambios bajo demanda, detalle técnico). Estados de carga, error con reintento, historial vacío y consulta sin resultados.

**Falta de credenciales.** Desde V46 el backend responde 401 (antes 403) a una petición sin credenciales válidas; 403 se reserva para acceso denegado a un usuario autenticado.

## Ciclo administrativo de usuarios (V47)

**Identidad.** Una persona tiene una única fila en `personas`: `uq_personas_dni` (filtrado) lo garantiza en SQL Server y el DNI se guarda canónico (sólo dígitos) para cuentas y pacientes. Una cuenta se asocia a una persona ya registrada (p. ej. con antecedentes como paciente) únicamente con `personaExistenteId` y nombre/apellido coincidentes; si no, 409 `PERSON_EXISTS_WITHOUT_ACCOUNT` o `PERSON_IDENTITY_MISMATCH`, sin revelar nombres ni datos sanitarios. El DNI no se edita desde la administración. `uq_usuarios_nombre_usuario` garantiza el nombre de usuario; una carrera perdida responde 409.

**Roles y sesiones.** Los roles se guardan en `usuarios_roles` (varios por cuenta; autoridades `ROLE_<codigo>` con `ADMINISTRADOR`, `CENTRO_OPERACIONES`, `OPERACIONES`, `COMANDANTE`, `DTS`). Cada petición vuelve a leer roles y estado de la base y compara `version_credenciales` con el JWT: cambiar roles, dar de baja, reactivar, restablecer o cambiar la contraseña incrementa la versión y deja inválidas todas las sesiones anteriores (401). Editar sólo datos personales no cierra sesiones. El administrador no cambia sus propios roles, no se desactiva ni se restablece, y el último administrador activo está protegido con bloqueo pesimista.

**Responsabilidades (`UserResponsibilityService`).** Bloquean la baja: comandante de un vuelo en APROBADO, PENDIENTE_CONFIRMACION_COMANDANTE, PENDIENTE_RESPUESTA_OPERACIONES, PLANIFICADO o EN_CURSO; tripulante vigente de esos vuelos; comandante con informe final PENDIENTE o DEVUELTO; DTS con una contrapropuesta pendiente de su respuesta. Bloquean retirar el rol COMANDANTE (vuelos e informes) o DTS (respuesta pendiente). Los vuelos finalizados, completados o cancelados no bloquean. La respuesta 409 `USER_HAS_OPERATIONAL_ASSIGNMENTS` / `USER_ROLE_HAS_OPERATIONAL_ASSIGNMENTS` lista `impedimentos` (tipo, vuelo y detalle) y no cambia nada. La asignación de comandante bloquea la cuenta (`users.lockById`) antes de evaluarla: serializa con la baja y el cambio de rol. Al desactivar vencen los bloqueos de edición documental de la cuenta.

**Credenciales.** Alta → código de activación de un solo uso (24 h, sólo su hash BCrypt) → activación pública con DNI+código. Baja y reactivación conservan la cuenta; la reactivación y el restablecimiento (`credential-reset`, contraseña generada) devuelven la contraseña temporal una sola vez en la respuesta; nunca se guarda en claro, ni se audita, ni vuelve a consultarse. Con contraseña temporal sólo se accede a `GET /api/auth/me` y `POST /api/auth/me/password` (403 `PASSWORD_CHANGE_REQUIRED` en el resto, escrito directamente en la respuesta; no debe usarse `sendError`, que pasaría por el punto de entrada 401). El cambio exige contraseña distinta (mínimo 12 caracteres) y cierra las sesiones. El cliente trata un 200 con cuerpo vacío como éxito.

**Auditoría.** Ver la matriz: eventos `USER`/`USER_ROLE` sin secretos, con responsable y hora de negocio, confirmados o revertidos con la operación. El historial administrativo de cada cuenta se consulta en su detalle (auditoría V46, sólo administrador).

**Frontend.** `users.jsx`: `UserDirectory` (listado paginado por el servidor con búsqueda, filtro por rol y estado, activos/desactivados), detalle con edición, roles, baja con motivo y confirmación, reactivación, restablecimiento, regeneración de código, impedimentos e historial. `AdminUsers` conserva el alta (con asociación a persona existente) y la reactivación desde un conflicto de DNI. El panel principal sólo tiene los accesos rápidos y los totales (`/api/auth/users/summary`). `Mi cuenta` cierra la sesión tras cambiar la contraseña.
