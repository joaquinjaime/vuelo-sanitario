# Matriz funcional I-5 — corte inicial

Fecha: 2026-10-26. Fuente: migraciones V1--V55, entidades/repositorios/servicios/controladores React, pruebas versionadas y el ensayo V55 documentado. La base habitual sigue fuera del alcance (V47): este documento no afirma haberla consultado ni modificado. El esquema V55 tiene **42 tablas de aplicación** y `flyway_schema_history` (**43 tablas** contando la técnica). No hay tablas obsoletas confirmadas.

`F` significa funcional; `P` parcial. La evidencia SQL indicada como **V55** es el ensayo aislado documentado en `RELEASE_V55_CONSOLIDACION_Y_ENSAYO_I43_2026-10-26.md`; las referencias de prueba son las automatizadas que cubren el flujo. Los catálogos controlados son funcionales sin CRUD libre: sus valores intervienen en validaciones y máquinas de estado.

| Tabla | Propósito, relaciones y código/flujo | Controles, auditoría y evidencia | Estado / brecha concreta |
|---|---|---|---|
| `personas` | Identidad compartida de `usuarios`/`pacientes`; `Person`, repositorio y `PersonIdentityService`; alta, búsqueda y rectificación administrativa. | DNI canónico, versión optimista, permisos, auditoría; E2E identidad/pacientes y V55. | F |
| `usuarios` | Cuenta ligada a persona, roles y hechos operativos; `AuthService`/`UserResponsibilityService`, UI Usuarios/Mi cuenta. | JWT, BCrypt, baja/reactivación, último admin, invalidación JWT, auditoría; E2E usuarios/V55. | F |
| `roles` | Catálogo de autorización N:M por `usuarios_roles`; seguridad Spring y UI de usuarios. | No editable libremente; cambios de rol controlados/auditados. | F |
| `usuarios_roles` | Asignación usuario--rol; `UserRole`, repositorio y administración. | PK compuesta, responsabilidades y cierre de sesiones. | F |
| `activaciones_cuenta` | Código de activación/temporal de cuenta; `AccountActivation`, `AuthService`. | Hash, un uso y vencimiento; sin enumeración; pruebas de credenciales. | F |
| `correos_electronicos` | Contactos de persona usados por verificación y Operaciones. | Unicidad vigente, verificación real, auditoría; E2E correo/V55. | F |
| `telefonos` | Teléfonos personales por persona. | País/E.164/libphonenumber, unicidad y baja lógica; E2E internacional/V55. | F |
| `verificaciones_correo` | Desafíos de correo; `EmailVerificationService`. | HMAC, vencimiento, intentos, límites e idempotencia; E2E correo/V55. | F |
| `pacientes` | Subtipo de persona para solicitudes; `PatientService`/directorio React. | Sin duplicados automáticos, identidad cotejada, acceso mínimo; E2E paciente/V55. | F |
| `provincias` | Catálogo geográfico referencial para localidades, aeropuertos y perfiles. | Seed controlado y sólo lectura operativa. | P — falta una política/UI completa de mantenimiento administrativo del catálogo externo. |
| `localidades` | Catálogo por provincia, origen/destino sanitario. | FK/provincia, activas en selectores. | P — misma brecha de gobernanza y mantenimiento del catálogo. |
| `aeropuertos` | Origen/destino y ubicación de aeronave; `AirportRepository`, catálogos, vuelos y rutas. | Activo, FK geográfica y rutas; E2E rutas/aeronaves/V55. | P — alta/edición masiva y curaduría geográfica no están completas. |
| `aeronaves` | Recurso asignable, ubicación y capacidad; `AircraftAdminService`, UI Aeronaves. | Bloqueos, no solapamiento, baja lógica, auditoría; E2E aeronaves/V55. | F |
| `tipos_vuelo` | Catálogo de sanitario/operativo y reglas documentales. | Consultado y validado al crear; FK en vuelos. | P — falta administración explícita de tipos no críticos. |
| `prioridades_vuelo` | Prioridad sanitaria, incluida urgencia. | Catálogo controlado y validación en solicitud. | F |
| `motivos_cancelacion` | Motivos controlados de cancelación/rechazo. | FK, campo OTRO validado y auditoría; E2E solicitudes. | F |
| `roles_tripulacion` | Función en vuelo/credencial/clasificación. | No equivale a rol de acceso; validación de asignación. | P — falta mantenimiento/recorrido UI integral de catálogo. |
| `clasificaciones_tripulacion` | Habilita funcionalmente persona--rol; `CrewQualificationController`. | Sólo administración, retiro bloqueado con asignaciones; auditoría. | P — faltan casos navegador de todas las funciones. |
| `perfiles_comandante` | Licencia y provincia del comandante. | Requerido para asignar y replanificar; elegibilidad continua. | P — falta E2E de licencia duplicada/disponibilidad completa. |
| `habilitaciones_profesionales` | Credencial por persona y función; `ProfessionalCredentialService`, UI Administración. | Estados, vencimiento, revocación, documentos, auditoría y reevaluación de vuelos. | P — suficiencia por tipo de operación/autoridad requiere regla de negocio. |
| `documentos_habilitacion` | Evidencia PDF de una habilitación. | Sólo PDF estructural, storage privado, resetea revisión y se audita. | P — falta definición de validación documental externa/antimalware. |
| `vuelos` | Núcleo operativo sanitario/operativo. | Transiciones, bloqueo, recursos, rutas, auditoría; E2E solicitudes/cierre/rutas/V55. | F |
| `vuelos_sanitarios` | Extensión de vuelo con paciente y estado de solicitud. | Triggers/servicio separan solicitud de operación; E2E solicitudes/V55. | F |
| `estados_vuelo` | Máquina de estados del vuelo. | Controlado por servicios y triggers; no CRUD libre. | F |
| `estados_solicitud_sanitaria` | Máquina de solicitud sanitaria. | Transiciones y trigger SQL. | F |
| `negociaciones_horario_vuelo` | Propuestas y respuestas de horario. | Una vigente, autorización e idempotencia; E2E solicitudes. | F |
| `vuelos_tripulantes` | Asignación/historial de tripulante. | Disponibilidad, capacidad, baja lógica y elegibilidad; E2E tripulación/V55. | F |
| `rutas_vuelo` | Versiones de ruta y revisión. | Bloqueo de inicio, revisión, invalidación, auditoría; E2E rutas/V55. | F |
| `instantaneas_clima` | Registro manual de clima por vuelo. | Permisos, historial y auditoría; E2E clima. | F |
| `informacion_hangar` | Preparación y revisión de hangar. | Versionado, control contextual y auditoría; E2E hangar. | F |
| `coordinaciones_aa2000` | Coordinación aeroportuaria por vuelo. | Versiones, permisos y auditoría; E2E coordinaciones. | F |
| `bitacora_vuelos` | Hechos operativos del vuelo. | Insert-only de negocio, permisos y auditoría; E2E bitácora. | F |
| `informacion_medica_vuelo` | Datos clínicos acotados al traslado. | Acceso DTS/Operaciones mínimo y nunca en avisos; E2E solicitudes. | F |
| `documentos_vuelo` | Identidad lógica de documento PDF. | Tipos compatibles, baja lógica, permisos y auditoría; E2E documentos/V55. | F |
| `versiones_documento_vuelo` | Versiones inmutables de PDF. | Una vigente, locks y descarga autorizada; E2E documentos/V55. | F |
| `bloqueos_documento_vuelo` | Lease de edición de documento. | Unicidad, expiración, propietario y auditoría; E2E documentos. | F |
| `tipos_documento` | Catálogo de finalidad documental. | Compatibilidad con tipo de vuelo, FK y selector. | F |
| `informes_finales_vuelo` | Versiones de informe final. | Revisión, adjuntos, plazos y cierre; E2E cierre/V55. | F |
| `obligaciones_informe_final` | Plazo y estado de presentación del comandante. | 48 h, bloqueo, extensión y avisos deduplicados; E2E cierre. | F |
| `contactos_coordinacion_traslado` | Contactos específicos del traslado sanitario. | Baja lógica, teléfono/correo validados y permisos; E2E contactos/V55. | F |
| `notificaciones` | Bandeja interna persistente para destinatario y vuelo; `NotificationService`/panel React. | Lectura individual/global, índice único por clave/usuario, sin SMTP necesario; E2E cierre/solicitudes. I-5 agrega eventos de ruta. | F |
| `eventos_auditoria` | Historial transversal. | Insert-only (trigger), consulta paginada con saneamiento; E2E auditoría/V55. | F |
| `flyway_schema_history` | Historial técnico Flyway. | Gestionado por Flyway, no expuesto como CRUD. | F (técnica) |

## Resultado y orden de trabajo

Total: **43** (42 aplicación + Flyway); **33 funcionales**, **9 parciales**, **0 sin implementación funcional**, **0 obsoletas confirmadas**. Las nueve parciales son: `provincias`, `localidades`, `aeropuertos`, `tipos_vuelo`, `roles_tripulacion`, `clasificaciones_tripulacion`, `perfiles_comandante`, `habilitaciones_profesionales` y `documentos_habilitacion`.

El primer incremento I-5C cubre la brecha comprobada de comunicaciones de ruta: `ROUTE_PENDING_REVIEW`, `ROUTE_APPROVED`, `ROUTE_RETURNED` y `ROUTE_REVIEW_REQUIRED`. No añade correo ni modifica la migración: reutiliza la bandeja interna con la restricción única de V42, de modo que la funcionalidad permanece disponible sin SMTP.
