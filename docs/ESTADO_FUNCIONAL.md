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
docker compose -p vuelos-sanitarios-e2e -f docker-compose.yml -f docker-compose.e2e.yml up --build
```

No se deben usar esas pruebas para borrar, reseedear ni modificar una base habitual. Para inspeccionar una base de desarrollo sin alterarla, primero confirmar conexión y consultar `flyway_schema_history`; sólo el arranque normal del backend aplica migraciones pendientes.

## Estado consolidado

| Área | Estado |
| --- | --- |
| Migraciones | V1--V31 validadas en SQL Server E2E; V30 corrige el trigger tras V28 y V31 agrega leases. |
| Backend | Pruebas unitarias e integración del proyecto en verde. |
| Frontend | Pruebas y compilación en verde; no sustituye los controles de autorización del backend. |
| Pendientes funcionales | Gestión visual integral de documentos (alta, historial y carga desde lista), mantenimiento administrativo más detallado y las mejoras de negocio que se prioricen después. |
