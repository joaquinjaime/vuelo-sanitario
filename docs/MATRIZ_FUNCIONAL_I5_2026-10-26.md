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
| `habilitaciones_profesionales` | Credencial por persona y función; `ProfessionalCredentialService`, UI Administración. | Estados, vencimiento, revocación, documentos, auditoría, reevaluación de vuelos y prohibición de autoverificación incluso para un administrador titular. | P — suficiencia por tipo de operación/autoridad requiere regla de negocio. |
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

## I-5.2 — habilitaciones y perfiles

La revisión de I-5.2 confirmó que el ciclo existente ya cubre alta, adjunto, verificación, rechazo, revocación, renovación mediante una nueva credencial o edición que reinicia la revisión, evaluación al asignar y reevaluación antes del inicio para comandante, copiloto, médico y enfermero. También confirma que una revocación o vencimiento posterior a la asignación no autoriza el inicio: deja la asignación visible con su incidencia, notifica a Operaciones y el inicio responde 409 con auditoría de rechazo.

Se corrigió una brecha de separación de funciones: la decisión de una habilitación ahora rechaza `403 AUTO_VERIFICACION_HABILITACION_NO_PERMITIDA` cuando el actor es su titular, aun si posee el rol `ADMINISTRADOR`. Otro administrador conserva la revisión autorizada. No se reclasifica todavía `habilitaciones_profesionales`, `documentos_habilitacion` ni `perfiles_comandante`: no está definida una autoridad externa, equivalencias por aeronave/tipo de operación ni una política de validación documental externa, y no se inventaron esas reglas.

## I-5.3 — geografía administrativa (incremento en curso)

Se implementó el mantenimiento vertical de `provincias`, `localidades` y `aeropuertos` en `/api/admin/geography`, exclusivo de `ADMINISTRADOR`, y la sección **Geografía** del panel React. Incluye listados administrativos, alta, edición, búsqueda local, asociación provincia--localidad--aeropuerto, normalización de códigos, validaciones de formato y coordenadas, prevención de duplicados, baja/reactivación lógica y eventos de auditoría (`GEOGRAPHIC_PROVINCE`, `GEOGRAPHIC_LOCALITY`, `GEOGRAPHIC_AIRPORT`).

Las bajas no eliminan filas ni permiten destruir referencias: no puede desactivarse una provincia con dependencias activas, una localidad con aeropuertos activos ni un aeropuerto con aeronaves activas o vuelos históricos. Los selectores operativos siguen exponiendo solamente catálogos activos, por lo que las altas se consumen en los flujos de vuelo sin exponer registros retirados.

La clasificación de las tres tablas permanece **P** hasta completar la ejecución E2E con la imagen reconstruida y registrar la evidencia SQL de alta, edición, conflicto, denegación por rol, auditoría y conservación de referencias. No se añadió migración: el esquema y sus FKs ya existían desde V15/V28; el incremento usa las columnas y relaciones ya versionadas.

## I-5.3 — tipos de vuelo controlados (incremento en curso)

No se incorporó CRUD libre para `tipos_vuelo`: crear valores que los servicios no procesan sería inseguro. Se agregó `GET /api/catalogs/flight-types?operationalOnly=true`, que devuelve únicamente tipos activos y, para la creación operativa, excluye `SANITARIO`. El formulario de nuevo vuelo operativo ya no mantiene una lista React independiente: consulta ese catálogo autorizado. El backend continúa exigiendo `findByCodigoAndActivoTrue` y rechaza tipos inexistentes/inactivos; el flujo sanitario sigue siendo el único canal para `SANITARIO`.

Su reclasificación queda pendiente de E2E sobre la imagen renovada (consulta, exclusión de sanitario, tipo inactivo e intento de código inexistente), no de una nueva política aeronáutica.

## Evidencia de ejecución I-5.3

- El E2E `scripts/e2e-elegibilidad-tripulacion.cjs` se volvió a ejecutar después de recrear el backend E2E desde las fuentes actuales, contra `vuelos_sanitarios_e2e` en SQL Server y Flyway V55. Confirmó la denegación `403 AUTO_VERIFICACION_HABILITACION_NO_PERMITIDA`, revisión por otro administrador, asignación elegible, bloqueo y auditoría de inicio tras revocación, reemplazo histórico, vencimiento controlado con aviso y la carrera revocación/inicio sin estado incoherente. La auditoría SQL final contiene `START_REJECTED_ELIGIBILITY`, `ELIGIBILITY_REVIEW_REQUIRED` y la revocación correspondiente.
- La comprobación API/SQL de geografía creó Provincia X44216681 (id 25), Localidad X44216681 (id 4038) y Aeropuerto X44216681 (id 567) relacionados. La baja de la localidad obtuvo `409 GEOGRAPHIC_HAS_ACTIVE_DEPENDENCIES`. SQL Server conserva los tres `CREATE` auditados, con `GEOGRAPHIC_PROVINCE`, `GEOGRAPHIC_LOCALITY` y `GEOGRAPHIC_AIRPORT`.
- `mvn test` finalizó con **488 pruebas, 0 fallos, 0 errores**. `npm run build` finalizó correctamente. La UI administrativa nueva quedó compilada; su recorrido de navegador y los escenarios E2E adicionales de tipos de vuelo son la siguiente validación antes de reclasificar tablas.

## I-5.3 — recorrido de navegador y paginación administrativa

El recorrido con la interfaz real del stack E2E detectó que cargar las más de cuatro mil localidades sin paginación bloqueaba el navegador. Se corrigió en el mismo incremento: `GET /api/admin/geography/{provinces,localities,airports}` ahora admite `q`, `page` y `size`, devuelve `items`, total y páginas, y la UI sólo renderiza 25 filas por página. La búsqueda es de servidor por nombre/código; las provincias activas y las localidades dependientes se consultan sólo al editar el formulario correspondiente.

En navegador real, como `ADMINISTRADOR`, se validaron: listado de provincias (26 registros, 2 páginas), creación y modificación de una provincia de ensayo, listado de localidades (4.038 registros, 162 páginas) sin bloqueo y alta de localidad ligada a la provincia de ensayo. Las altas y modificaciones confirmaron el aviso de éxito de la UI y la recarga desde API. La prueba SQL/API anterior mantiene evidencia de FKs, auditoría y denegación de baja con dependencia activa. La edición de provincia también refresca el selector activo para que no se reutilice una etiqueta obsoleta.

Las tablas se conservan como **P**: resta completar en navegador el alta/edición/baja protegida de aeropuerto, los filtros de formularios de vuelo y las denegaciones por rol, además de los tipos de vuelo controlados. No se modifica su clasificación sólo por pruebas parciales.

## I-5.3 — cierre técnico posterior al recorrido inicial

El recorrido adicional con navegador real del stack aislado completó el alta de un aeropuerto de ensayo asociado a `Provincia X44216681` y `Localidad X44216681`, su edición y su baja lógica. La tabla volvió a mostrarlo como **Inactivo** y ofreció sólo reactivación. La prueba detectó y corrigió dos defectos que habrían impedido el uso real del formulario: `ADMINISTRADOR` no podía cargar el catálogo dependiente de localidades y la búsqueda de aeropuertos no contemplaba `codigoOficial` aunque la UI lo anunciaba. No se usaron identificadores fijos en la implementación; las filas de ensayo están marcadas y permanecen exclusivamente en `vuelos_sanitarios_e2e`.

Se versionó `scripts/e2e-geografia-catalogos.cjs`, ejecutado con éxito contra backend y SQL Server E2E: alta de provincia/localidad/aeropuerto, duplicado rechazado, asociación de FKs, búsqueda paginada por código oficial, edición, `409 GEOGRAPHIC_HAS_ACTIVE_DEPENDENCIES` al intentar retirar una localidad con aeropuerto activo, baja lógica, exclusión del catálogo operativo, persistencia de la fila `esta_activo=0` y tres eventos de auditoría `CREATE`/`UPDATE`/`SET_ACTIVE`. Un usuario `CENTRO_OPERACIONES` recibió `403` al intentar mantenimiento administrativo. El mismo ensayo verificó que `/catalogs/flight-types?operationalOnly=true` entrega tipos activos y excluye `SANITARIO`.

La suite WebMVC `AdministratorAuthorizationTest` finalizó con 12 pruebas, 0 fallos y 0 errores; se corrigió su contexto para incluir el repositorio de tipos de vuelo y se agregó la autorización administrativa explícita para la búsqueda de localidades. Las regresiones React de documentos y operaciones finalizaron con 54 pruebas, 0 fallos; el formulario de vuelo operativo tolera ahora una respuesta de catálogo vacía o no-array mientras carga. `npm run build` finalizó correctamente. Las cuatro tablas de geografía y tipos de vuelo se mantienen **P** únicamente porque aún falta el recorrido de navegador como `CENTRO_OPERACIONES` que cree/planifique un vuelo contra esos selectores y la denegación de baja de un aeropuerto ya referenciado; la capa administrativa, API, SQL y auditoría sí están comprobadas de punta a punta.
