# Auditoría de UX del detalle de vuelos

## Base y alcance

La revisión partió de `c6abc93` y `6d2fa45`. El detalle ya tenía rutas por pestaña, componentes por etapa, un resumen con próximo paso y carga diferida por módulo. Se mantuvieron Resumen, Planificación, Tripulación y contactos, Documentos, Ejecución y cierre e Historial, así como la pestaña contextual de Negociación y la navegación propia de DTS.

## Diagnóstico y prioridad

| Gravedad | Hallazgo | Resolución |
|---|---|---|
| Alta | Hangar, coordinaciones, ruta, planificación aeroportuaria del comandante y clima abrían formularios de inmediato. Un registro vigente podía quedar detrás de los controles de escritura. | Consulta primero, acción explícita de alta, modificación o revisión, confirmación y regreso a consulta. |
| Alta | El comandante perdía la vista de aeropuertos sanitarios al salir de Planificado y no tenía el apartado de recursos. CO también perdía el apartado de recursos tras iniciar. | Ambos consultan la misma ficha en Planificación. Las acciones siguen la etapa, el área activa y las capacidades informadas por el servidor. |
| Alta | Un enlace directo a una pestaña ajena al área podía montar su componente aunque el menú no la ofreciera. Cambiar de URL podía descartar silenciosamente los cambios. | La URL se valida contra las pestañas del área activa y se redirige al detalle. El enrutador protege formularios abiertos al cambiar de URL, incluso al retroceder. |
| Alta | Un comandante con informe final vencido podía ver acciones que el backend iba a rechazar. | Se informa la restricción en el detalle a partir de los informes del comandante y se conserva la consulta. El backend mantiene su propia validación. |
| Media | Documentos, bitácora y personal sanitario mostraban formularios sin una decisión explícita. Tripulación repetía la lectura y el retiro del copiloto en la misma pantalla. | Se separaron las acciones de alta, sustitución y nueva versión. Tripulación comparte la consulta del copiloto y presenta un solo retiro para esa función. |
| Media | Resumen repetía el cierre y el historial horario del comandante. La paginación de auditoría podía mostrar temporalmente el contenido de la página anterior. | El cierre se consulta en Ejecución y cierre. El historial horario del comandante se consulta en Historial, separado de la actividad auditada. La página nueva se muestra cuando termina de cargar. |

La revisión de las rutas y servicios no encontró un defecto crítico de autorización del backend en este alcance. Se priorizaron la presentación del dato vigente, la reducción de formularios y las diferencias de lectura reproducibles antes de los ajustes de jerarquía visual.

## Planificación implementada

- Paneles contraídos con un resumen basado en la API. Se puede abrir uno a la vez. Las validaciones de ruta pendientes y el estado de hangar se ven desde el encabezado de su panel.
- Aeropuertos sanitarios con origen y destino registrados, etapa de cada propuesta y datos de confirmación. La edición se abre con una acción distinta para CO y Comandante. En operativos se conserva la consulta del trayecto en la ruta y el resumen del vuelo.
- Recursos sanitarios compartidos y aeronave operativa visible para ambos perfiles. El cambio de aeronave planificada se integra en su tarjeta dentro de recursos, conservando la operación existente.
- Hangar muestra el registro vigente, valores, fecha y autor de la última versión. La existencia se comprueba por la versión actual. Editar envía su versión al servidor y conserva el versionado intencional. La observación del comandante tiene su propia acción y conserva el resto de los datos.
- Coordinaciones lista una entrada por grupo y distingue vigencia, revisión y versiones anteriores. El alta envía un POST. La modificación hace PUT al grupo original con la versión consultada. Los estados disponibles reflejan las transiciones del servicio y el catálogo de aeropuertos se consulta al abrir el editor.
- Ruta muestra primero la versión actual y separa versiones anteriores, edición, presentación y revisión. El catálogo de alternativas se difiere hasta abrir el editor.
- Clima muestra su historial y ofrece alta explícita al comandante mientras el vuelo está planificado. Cada observación meteorológica es un registro histórico.
- Al cerrar un panel o salir con un formulario abierto se solicita confirmación, aunque el formulario todavía esté intacto. Cancelar dentro del editor descarta su borrador. La advertencia de recarga o cierre del navegador usa el aviso nativo.

## Matriz CO y Comandante

La lectura presupone acceso al vuelo. Para Comandante, los servicios reconocen al comandante principal asignado. La función de copiloto por sí sola carece de ese permiso. La matriz describe el área activa y las operaciones expuestas por el detalle. Un informe final vencido restringe la escritura del comandante según el backend.

| Funcionalidad | Lectura CO | Lectura Comandante | Escritura CO | Escritura Comandante | Observaciones |
|---|---|---|---|---|---|
| Aeropuertos sanitarios y confirmación | Sí | Sí | Proponer o cambiar en Aprobado y Planificado | Confirmar o ajustar en Planificado, incluida la llegada prevista | Misma ficha `GET /flights/{id}`. `PUT /airports` y `POST /operational-planning` tienen roles y validaciones geográficas diferentes. |
| Asignación sanitaria de recursos | Sí | Sí | Asignar o cambiar comandante con horario acordado en Aprobado o Planificado. Asignación inicial de aeronave en Aprobado | Sin escritura | Mismos recursos en la ficha. Disponibilidad, reservas y excepciones se validan en el servidor. Los catálogos de candidatos son de CO. |
| Copiloto sanitario | Sí | Sí | Seleccionar, sustituir o retirar cuando el vuelo y el servicio de tripulación lo permiten | Sin escritura | Consulta compartida `GET /crew`. El copiloto operativo se gestiona en Tripulación. |
| Aeronave asignada y cambio | Sí | Sí | Cambio en Planificado y, para operativos, Pendiente de confirmación | Sin escritura | La asignación vigente permanece visible en consulta. El servicio verifica ubicación, capacidad y disponibilidad. |
| Ruta operativa | Sí, con versiones | Sí, con versiones | Aprobar o devolver una ruta presentada y revisable | Registrar, modificar y presentar en Planificado, según capacidades de la API | Mismo `GET /route`. La revisión propia y las transiciones inválidas se rechazan en backend. |
| Hangar y preparación terrestre | Sí, con versiones | Sí, con versiones | Registrar o versionar con el horario acordado y en estado mutable | Registrar o actualizar su observación sobre una versión actual válida | Mismo `GET /hangar`. La preparación completa requiere el contexto y la ubicación de aeronave que verifica el servicio. |
| Coordinaciones aeroportuarias | Sí, con versiones | Sí, con versiones | Alta y seguimiento con horario acordado y en estado mutable | Sin escritura | Mismo `GET /airport-coordinations`. Las canceladas quedan en consulta. El estado de vigencia se calcula en el servidor. |
| Condiciones meteorológicas | Sí | Sí | Sin escritura | Registrar en Planificado | Mismo `GET /weather`. Cada alta agrega un registro, sin modificar los anteriores. |
| Acontecimientos, en Ejecución y cierre | Sí | Sí | Registrar o vincular una corrección cuando `puedeRegistrar` está habilitado | Registrar o vincular una corrección con la misma condición y acceso operativo vigente | Mismo `GET /log`. El acontecimiento original permanece en la bitácora. No es el historial de auditoría. |

Fuentes del repositorio: `FlightController`, `AirportPlanningController`, `FlightRouteController`, `HangarInfoController`, `Aa2000CoordinationController`, `FlightLogController` y sus servicios. Los controles de acceso al vuelo se contrastaron con `FlightAuthorizationService` y las restricciones del comandante con `CommanderReportAccessService`.

## Archivos y componentes

- `frontend-react/src/features/flights/tabs` y `detail`. Composición de pestañas, guía del próximo paso, protección de formularios y validación de rutas.
- `PlanningPanel.jsx`. Panel compartido y resumen, con agrupación de secciones. Se reutilizan tarjetas, estilos de datos y `useResource` para las lecturas.
- `HangarInfo.jsx`, `AirportCoordinations.jsx`, `WeatherLog.jsx`, `FlightLog.jsx`, `airportPlanning.jsx`, `flightRoute.jsx`, `resourceAssignment.jsx` y `aircraft.jsx`. Separación de ficha, listados y editores. La consulta meteorológica se integra en `WeatherLog`.
- `FlightCrew.jsx`, `healthStaff.jsx`, `documents.jsx` y `audit.jsx`. Mejoras de consulta y acciones en otras pestañas.
- `App.jsx` y `test-utils.jsx`. Se usa el enrutador de datos de React Router con la misma tabla de rutas para poder interceptar la navegación. Las pruebas de interfaz cubren las aperturas explícitas y preservan las comprobaciones de los contratos API.

## Actualización local

1. Cambiar a la rama `codex/auditoria-ux-vuelos`.
2. Con el stack local iniciado, reconstruir el frontend con `docker compose up -d --no-deps --build frontend`.
3. Abrir un vuelo sanitario planificado en CO y en el Comandante asignado. Comparar los resúmenes de Planificación y consultar aeropuertos y recursos. Repetir con un vuelo finalizado para verificar que se conserva la consulta.
4. En un vuelo de prueba, abrir Hangar, registrar o modificar información y volver a cargar. Abrir un editor, escribir y cambiar de pestaña para comprobar ambas opciones de la confirmación. Probar también Nuevo documento y Nuevo acontecimiento.

No hay cambios de backend ni migraciones. La actualización no requiere reconstruir el backend ni intervenir SQL Server.

## Validación y pendientes

- Java 21 y Maven. `mvn test` ejecutó 646 pruebas, sin fallos, errores ni omisiones. Incluye autorización de ruta y recursos, estados documentales, hangar, coordinaciones, bitácora y cierre.
- Chrome a 360 px, con API simulada para CO y Comandante. Se comprobó apertura con Enter, ausencia de desborde horizontal, lectura compartida, acciones diferenciadas, protección al cambiar de pestaña, guardado y consulta tras recargar. También se comprobó la redirección desde una pestaña inexistente.
- La validación de navegador usó respuestas controladas. Queda pendiente repetir la sesión completa con credenciales reales de ambos roles y SQL Server en un entorno de prueba. Los scripts de navegador anteriores que apuntan al tablero de una sola página requieren actualizar sus selectores para poder reutilizarlos con el detalle por pestañas.
- Frontend. `npm test -- --maxWorkers=5` ejecutó 357 pruebas en 34 archivos, todas aprobadas. La regresión de hangar se volvió a ejecutar por separado después del ajuste de validación en vuelo. `npm run build` y `git diff --cached --check` finalizaron correctamente.
