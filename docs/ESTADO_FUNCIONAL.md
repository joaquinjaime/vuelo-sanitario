# Estado funcional

| Módulo | Backend implementado | Frontend implementado | Integrado | Probado | Pendientes |
|---|---|---|---|---|---|
| Autenticación | Sí, JWT, BCrypt y bootstrap explícito | Login | Parcial | Unitario e integración SQL Server | Persistencia de sesión y recuperación de perfil en UI |
| Administración de usuarios | Alta por Administrador y bootstrap | No | No | Integración SQL Server | Listar, editar, activar/desactivar y roles |
| Pacientes | Alta | No | No | Integración SQL Server | Listado y selección en interfaz |
| Solicitudes | Crear/listar/detalle y validación de extrema urgencia | Formulario DTS, alertas y listado ordenado | Parcial | Unitario de política y compilación | Migración V6 y recorrido conectado a SQL Server pendientes de ejecutar en este entorno |
| Evaluación | Aprobar/rechazar | Panel Operaciones | Parcial | Integración SQL Server por API | Rechazo con motivo y filtros visuales |
| Asignación de recursos | Sí | Selector en panel Operaciones | Parcial | Integración SQL Server por API | Disponibilidad visual |
| Planificación | Aeropuertos/horarios | Selector en panel Comandante | Parcial | Integración SQL Server por API | Ruta, tareas y formulario ampliado |
| Meteorología | Entidad solamente | No | No | No | Servicio, API e interfaz |
| Hangar | Entidad solamente | No | No | No | Servicio, API e interfaz |
| AA2000 | Entidad solamente | No | No | No | Servicio, API e interfaz |
| Tripulación | Alta | No | No | No | Consulta y gestión visual |
| Documentos PDF | Crear/versionar/descargar | No | No | Unitario de storage | Lista y pantallas |
| Textos libres | Crear/versionar | No | No | Integración SQL Server | Editor e historial |
| Versionado | Documental y reporte | No | No | Parcial | Concurrencia avanzada |
| Auditoría | Registro y consulta paginada | No | No | Integración SQL Server | Interfaz y prueba de permisos exhaustiva |
| Notificaciones | Persistentes REST, aviso especial de extrema urgencia | Alertas urgentes en el panel | Parcial | Compilación frontend | Verificar entrega contra SQL Server con usuarios reales |
| Inicio/finalización | Sí, Operaciones; informe del comandante | No | No | Integración SQL Server | Flujo UI |

`Probado` sólo incluye pruebas ejecutadas. El 22/09/2026 se validaron V1–V5 en SQL Server local y un ciclo completo hasta `FINALIZADO`, con auditoría, notificación y documento de texto. La interfaz actual es intencionalmente acotada a inicio de sesión y panel/listado; los flujos operativos siguen pendientes de pantallas específicas.

## Extrema urgencia (implementación pendiente de validación conectada)

La migración `V6__extreme_urgency_requests.sql` agrega a `flights` los campos `extrema_urgencia`, `justificacion_extrema_urgencia` y `fecha_limite_traslado`. La restricción SQL sólo protege invariantes estáticas: una solicitud urgente debe tener justificación no vacía y plazo, y dicho plazo no puede preceder la fecha solicitada. Los registros históricos quedan como no urgentes; no se reclasifican por su fecha.

`fecha_solicitada` es desde esta versión la fecha/hora solicitada por DTS; `created_at` conserva el instante de creación. Los valores `DATETIME2` se interpretan como hora civil de `America/Argentina/Tucuman`, configurable mediante `BUSINESS_TIME_ZONE`. La política backend usa un `Clock` inyectable y valida al crear: fecha futura, anticipación de dos días calendario para solicitudes normales, declaración explícita de urgencia, justificación y plazo. No se usa el reloj del navegador ni una función no determinista en un `CHECK` para estas reglas temporales.

Las respuestas de `GET /api/flights` incluyen `extremaUrgencia`, `justificacionExtremaUrgencia` y `fechaLimiteTraslado` además de prioridad y estado. Operaciones recibe una notificación `EXTREME_URGENCY_REQUEST` al crear una solicitud urgente; el comandante asignado recibe `EXTREME_URGENCY_COMMANDER_ASSIGNED`. Los mensajes contienen código y horarios, no datos clínicos. La creación queda auditada con los datos declarados.

El plazo representa el límite declarado por DTS, no una hora real de llegada. La interfaz lo conserva y, si la llegada planificada lo supera, muestra una advertencia de que esa programación no se presenta como cumplimiento. El modelo actual no permite concluir automáticamente que el traslado real cumplió el plazo; esa conclusión no se registra.

Se ejecutaron `mvn test -q` (incluye pruebas de fechas de calendario, urgencia y medianoche con reloj fijo) y `npm run build`. También se intentó arrancar el perfil `windows` para ejecutar Flyway: no llegó a conectarse porque falta el DLL nativo `mssql-jdbc_auth-12.8.1.x64` de autenticación integrada. Por eso V6 no se aplicó ni se validó contra SQL Server, y tampoco se probó el flujo React conectado al backend en este turno; la funcionalidad no debe considerarse verificada de extremo a extremo.

## Informes finales y cierre administrativo (implementación pendiente de SQL Server)

`V7__final_report_obligations_and_completed.sql` incorpora el estado `COMPLETADO` y la tabla `final_report_obligations`. Las obligaciones nuevas almacenan sus vencimientos en `DATETIMEOFFSET` UTC: el plazo inicial y cada devolución vencen exactamente 48 horas después del evento; una única prórroga agrega 24 horas al vencimiento vigente o, si ya venció, 24 horas al instante de concesión. No se crean obligaciones para vuelos FINALIZADOS históricos, por lo que no producen bloqueos retroactivos.

`FINALIZADO` representa fin físico y mantiene abierto sólo el expediente de informe. La finalización ya no exige un informe existente: crea la obligación y notifica al comandante. Una presentación de texto no vacío genera una versión nueva de `flight_final_reports`, pasa a `PRESENTADO` y elimina inmediatamente el bloqueo si no hay otra obligación vencida. Operaciones puede devolver con motivo, creando un nuevo plazo de corrección, o aprobar la versión actual; esta aprobación lleva el vuelo a `COMPLETADO` en la misma transacción. Los vuelos completados no se cancelan ni admiten modificaciones ordinarias.

El bloqueo se consulta en cada operación protegida del comandante y antes de asignar un nuevo comandante; no depende de tareas programadas ni de renovar el JWT. Los endpoints son `GET /api/final-reports/mine`, `GET /api/final-reports/pending-review`, `POST /api/final-reports/{id}/submit`, `POST /api/final-reports/{id}/extension` y `POST /api/final-reports/{id}/review`. La interfaz muestra obligaciones, vencimiento, prórroga, bloqueo, presentación de texto y revisión.

En esta iteración la presentación operativa disponible desde la interfaz es texto ingresado en la aplicación. La vinculación de PDF y texto adjunto al ciclo de obligación aún no está realizada, aunque el proyecto conserva su almacenamiento documental versionado. Tampoco se ejecutó V7 contra SQL Server por la misma falta del DLL de autenticación integrada; no se considera verificado el recorrido conectado.
