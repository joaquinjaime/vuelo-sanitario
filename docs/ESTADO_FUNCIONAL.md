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

Al finalizar un vuelo se crea una obligación para el comandante. La primera presentación pasa a `PRESENTADO`; Operaciones/Centro de Operaciones puede aprobarla (el vuelo llega a `COMPLETADO`) o devolverla. Una devolución crea un vencimiento de corrección de 48 horas desde el evento y reinicia la prórroga de esa obligación. El acceso del comandante queda bloqueado por obligaciones vencidas, pero el envío del informe pendiente sigue permitido para resolver el bloqueo. Las pruebas de servicio usan un `Clock` fijo para mantener las reglas temporales deterministas.

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
