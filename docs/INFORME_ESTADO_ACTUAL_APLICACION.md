# Informe del estado actual de la aplicación Vuelos Sanitarios

| Dato | Valor |
|---|---|
| Fecha del informe | 2026-11-24 |
| Esquema de base de datos | Flyway V68 (68 migraciones: 64 SQL y 4 Java) |
| Commit base | `11f9cdf` (rama `main`); el árbol de trabajo puede contener cambios documentales sin confirmar |
| Alcance | Estado del código en el repositorio: backend, frontend, base de datos, Docker y CI |
| Fuente de verdad | El código. Donde un documento anterior difiere, prevalece lo descrito aquí |

## 1. Resumen ejecutivo

Vuelos Sanitarios gestiona el ciclo de traslados sanitarios y vuelos operativos: solicitud del DTS, evaluación y negociación de horario con el Centro de Operaciones, asignación de comandante, copiloto y aeronave, planificación de ruta, ejecución, informe final y cierre, con documentos PDF, notificaciones y auditoría.

Cambios recientes que definen el estado actual:

| Versión / commit | Cambio |
|---|---|
| V66 | Simplificación de tripulación: el comandante es asignable al crearse (sin habilitaciones, políticas ni verificación documental); el copiloto es otro usuario COMANDANTE; médicos y enfermeros son registros de cada DTS **sin cuenta** (`personal_sanitario`, `vuelos_personal_sanitario`). |
| V67 | Se elimina la tabla `contactos_coordinacion_traslado`: la solicitud ya no registra contactos de coordinación. |
| V68 | Catálogo `condiciones_paciente` (BUENO, REGULAR, GRAVE_ESTABLE, GRAVE_INESTABLE, CRITICO, EXTREMA_GRAVEDAD, ESTABLE) expuesto en `GET /api/catalogs/patient-conditions`. |
| `a6931ce` | Aislamiento de solicitudes por usuario DTS y simplificación del inicio de Administración. |
| `cad8b94` | Auditoría de Administración dividida en paneles: Vuelos, Usuarios, Aeronaves, Personal sanitario y Búsqueda general. |

Límites a tener presentes (detalle en la sección 11): no hay verificación de habilitaciones profesionales ni integración con organismos externos; el backend no ejecuta análisis antimalware (propuesta en la sección 11.2); el envío de correo requiere configurar SMTP.

## 2. Arquitectura y stack

### 2.1 Visión general

```
Navegador (React SPA) -> Nginx -> /api -> Spring Boot (JWT) -> SQL Server 2022
                                              |-> directorio de documentos (volumen)
                                              |-> SMTP (opcional)
```

| Capa | Tecnología | Evidencia |
|---|---|---|
| Backend | Java 21, Spring Boot (Web, Security, Data JPA, Validation, Actuator, Mail), JJWT | `backend-java/pom.xml` |
| Base de datos | SQL Server 2022; Flyway administra el esquema; Hibernate con `ddl-auto: validate` | `application.yml` |
| Frontend | React, React Router 7, Vite, Vitest, libphonenumber-js | `frontend-react/package.json` |
| Infraestructura | Docker Compose (SQL Server, inicialización, backend, Nginx con la SPA) | `docker-compose.yml` |
| Integración continua | GitHub Actions: `mvn clean test`, `npm ci` + `npm run build`, validación de Compose | `.github/workflows/ci.yml` |

### 2.2 Backend (`com.vuelossanitarios.backend`)

| Paquete | Contenido |
|---|---|
| `api` | 19 controladores REST, `ApiException`, `ApiExceptionHandler` y `dto` |
| `service` | Reglas de negocio y transacciones (por ejemplo `FlightService`, `FlightRouteService`, `FinalReportWorkflowService`, `AuthService`, `HealthStaffService`, `CrewManagementService`, `AuditQueryService`) |
| `repository` | Repositorios Spring Data / JDBC |
| `domain` | Entidades JPA por dominio: `flight`, `person`, `user`, `patient`, `catalog`, `audit`, `notification`, `common` |
| `security` | `SecurityConfig`, `JwtAuthenticationFilter`, `JwtService`, `CorsConfig`, `BootstrapAdministrator` |
| `config`, `mail` | Reloj de negocio, planificación de tareas, correo SMTP, cuenta de migración |

Convenciones comprobadas:

- Los controladores aplican `@PreAuthorize` por rol; los servicios aplican además reglas por vínculo con el vuelo (por ejemplo, solicitante, comandante asignado).
- El filtro JWT valida la versión de credencial (`credentialVersion`) del token; una baja o un restablecimiento invalida las sesiones previas. La vigencia del token es de 3 600 000 ms (1 hora).
- La zona horaria de negocio se configura con `BUSINESS_TIME_ZONE` (por defecto `America/Argentina/Tucuman`); las horas de solicitud son hora civil de esa zona.
- Existen tareas programadas: barrido de informes finales (por defecto cada 60 s, sólo emite avisos) y revisión de elegibilidad de tripulaciones (por defecto cada hora, sólo emite avisos).
- Con el perfil `e2e` y `app.e2e-controls.enabled=true` se habilita `/api/e2e` (reloj y barridos controlados); no está activo por defecto.

### 2.3 Frontend (`frontend-react/src`)

SPA con rutas reales bajo `/app`. Carpetas: `app` (rutas, layouts, guards, `navigation.js`, providers), `features` (account, admin, aircraft, audit, auth, catalogs, dashboard, flights, health-staff, notifications, patients, reports, users), `components`, `hooks`, `services` (`api.js`), `utils`.

`navigation.js` es la definición única de áreas y módulos; el menú y los guards de ruta salen de ella. La autorización real es siempre la del servidor.

| Área | Módulos del menú |
|---|---|
| Administración (ADMIN) | Inicio, Usuarios, Aeronaves, Geografía, Ubicación de comandantes, Pacientes, Auditoría |
| DTS | Inicio, Mis solicitudes, Nueva solicitud, Personal sanitario, Notificaciones |
| Operaciones (OPERACIONES / CENTRO_OPERACIONES) | Inicio, Solicitudes, Vuelos, Informes finales, Comandantes, Notificaciones |
| Comandante | Inicio, Mis vuelos, Informes finales, Notificaciones |

Rutas adicionales: `/login`, `/cambiar-contrasena`, `/app/mi-cuenta`, `/app/vuelos/nuevo`, `/app/solicitudes/:id/:tab?` y `/app/vuelos/:id/:tab?`. Pestañas del detalle de vuelo: Resumen, Negociación, Planificación, Equipo, Documentos, Operación e Historial.

### 2.4 Despliegue (resumen)

Ver sección 9.

## 3. Roles, autenticación y permisos

### 3.1 Roles

Roles reales del código: `ADMINISTRADOR`, `DTS`, `OPERACIONES`, `CENTRO_OPERACIONES` y `COMANDANTE`. Una cuenta puede reunir varios roles. `OPERACIONES` y `CENTRO_OPERACIONES` reciben los mismos permisos en los controladores.

### 3.2 Autenticación y cuentas

| Aspecto | Comportamiento (fuente) |
|---|---|
| Rutas públicas | `/api/auth/login`, `/api/auth/activar-cuenta`, `/actuator/health`; todo lo demás exige JWT (`SecurityConfig`) |
| Sesión | JWT sin estado; CSRF deshabilitado; respuesta 401 sin token |
| Alta de usuarios | Sólo ADMINISTRADOR (`POST /api/auth/users`); genera un código de activación de seis dígitos con un máximo de 5 intentos (`AuthService`) |
| Activación | `POST /api/auth/activar-cuenta` (público) con el código |
| Gestión de cuentas | Administración: búsqueda, detalle, rectificación de DNI, restablecimiento de credenciales, contraseña temporal, baja y reactivación; no se puede dar de baja la propia cuenta ni el último administrador |
| Mi cuenta | Cambio de contraseña; alta, edición, baja y marcado principal de correos y teléfonos propios |
| Verificación de correo | OTP decimal de seis dígitos, de un solo uso: vigencia 10 min, 5 intentos, reenvío cada 60 s, topes diarios por correo, usuario y origen (`app.verification.*`) |
| Correo saliente | Con `MAIL_ENABLED=false` (valor por defecto) no se envía nada, no se simula entrega y ningún correo queda verificado |
| Administrador inicial | `BootstrapAdministrator` con `BOOTSTRAP_ADMIN_*` |

### 3.3 Matriz resumida de permisos (según `@PreAuthorize`)

| Capacidad | ADMIN | DTS | OPERACIONES / CO | COMANDANTE |
|---|---|---|---|---|
| Crear solicitud sanitaria | | Sí | | |
| Crear vuelo operativo | Sí | | Sí | |
| Evaluar solicitud / negociar horario | | Responde contrapropuesta (sólo el solicitante) | Sí | |
| Asignar comandante, copiloto y aeronave | | | Sí | Responde la asignación (sólo el asignado) |
| Planificar ruta (guardar y presentar) | | | | Sí |
| Aprobar o devolver ruta | | | Sí | |
| Iniciar y finalizar vuelo | | | Sí | |
| Cancelar | | Su propia solicitud | Sí | No |
| Registrar clima | | | | Sí (comandante asignado) |
| Personal sanitario (catálogo y asignación) | | Sí | Lectura | Lectura |
| Documentos PDF (alta, versión, baja, bloqueo) | | Lectura | Sí | Sí |
| Informe final: presentar / prórroga | | | | Sí |
| Informe final: revisar | | | Sí | |
| Usuarios, aeronaves, geografía, pacientes (administración) | Sí | | | |
| Auditoría global | Sí | | | |
| Auditoría por vuelo | Sí | Sí | Sí | Sí (con control de acceso al vuelo) |

Reglas de alcance verificadas:

- **Aislamiento DTS**: `FlightAuthorizationService.readsAllFlights(roles)` concede lectura global sólo a Operaciones o a ADMINISTRADOR que no sea también DTS. `GET /api/flights?scope=mine|all` (por defecto `all`) sólo estrecha el resultado. Un recurso ajeno responde 403 («No tiene acceso a este vuelo»); en eventos de auditoría, 404.
- **Comandante por vuelo**: el rol global no basta; las operaciones del comandante exigen ser el comandante asignado a ese vuelo. El copiloto no ve el vuelo en su lista ni lo opera.
- El detalle exacto de cada endpoint está en las anotaciones de los controladores de `backend-java/src/main/java/com/vuelossanitarios/backend/api`.

## 4. Funcionalidades por módulo

Los controladores suman 162 anotaciones de mapeo HTTP (`@Get/Post/Put/Patch/DeleteMapping`; conteo con `grep` sobre `api/*.java`, incluye los endpoints de `/api/e2e`).

| Módulo | Qué hace | Endpoints principales | Pantallas |
|---|---|---|---|
| Autenticación y cuenta | Login, activación, perfil propio, contactos y verificación | `/api/auth/login`, `/activar-cuenta`, `/me/**` | Login, Mi cuenta, Cambiar contraseña |
| Usuarios (Administración) | Alta, edición de roles, baja/reactivación, DNI, código de activación | `/api/auth/users/**`, `/api/auth/roles` | Usuarios (lista, alta, detalle) |
| Solicitudes sanitarias | Alta con o sin paciente nuevo, evaluación, negociación, cancelación | `POST /api/flights`, `/with-patient`, `/{id}/evaluation`, `/{id}/schedule/*`, `/{id}/cancel` | Nueva solicitud, Mis solicitudes, Solicitudes |
| Vuelos operativos | Alta por Operaciones o Administración con motivo; replanificación | `POST /api/flights/operational`, `/{id}/operational-replanning`, `/{id}/operational-planning` | Vuelos, Nuevo vuelo |
| Asignación de recursos | Candidatos y asignación de comandante, copiloto y aeronave; cambio de aeronave | `/{id}/commander-candidates`, `PUT /{id}/commander`, `PUT /{id}/assigned-aircraft`, `/{id}/aircraft-candidates`, `/{id}/crew` | Pestañas Planificación y Equipo |
| Personal sanitario | Catálogo propio de cada DTS (MEDICO/ENFERMERO) y asignación a sus vuelos | `/api/health-staff/**`, `/api/flights/{id}/health-staff/**` | Personal sanitario; panel dentro de la solicitud |
| Ruta de vuelo | Versiones de ruta, presentación, aprobación o devolución | `/api/flights/{id}/route`, `/submit`, `/approve`, `/return`, `/api/flights/route-statuses` | Pestaña Planificación |
| Aeropuertos del vuelo | Candidatos y selección de aeropuertos; coordinaciones aeroportuarias | `/{id}/airport-candidates`, `PUT /{id}/airports`, `/{id}/airport-coordinations` | Pestaña Planificación |
| Hangar y bitácora | Información de hangar con observación del comandante; bitácora operativa | `/{id}/hangar`, `/{id}/log` | Pestaña Operación |
| Clima | Registro del comandante y consulta del historial | `/{id}/weather` | Pestaña Operación |
| Documentos PDF | Documentos lógicos con versiones, bloqueo (lease), baja lógica y descarga | `/api/flights/{id}/documents/**`, `/api/documents/{id}/**`, `/api/document-versions/{id}/download` | Pestaña Documentos |
| Informe final | Obligación, presentación (JSON o multipart), prórroga, revisión | `/api/final-reports/**` | Informes finales |
| Pacientes | Búsqueda por DNI o nombre y apellido, alta, corrección de identidad y DNI | `/api/patients/**` | Pacientes (Administración), alta en la solicitud |
| Catálogos | Aeronaves, tipos de vuelo, prioridades, motivos de cancelación, condiciones de paciente, tipos de documento, provincias, localidades, aeropuertos | `/api/catalogs/**` | Selectores en formularios |
| Aeronaves (Administración) | Alta, edición, activación, ubicación, historial y vuelos asociados | `/api/catalogs/aircraft/**` | Aeronaves |
| Geografía (Administración) | ABM paginado de provincias, localidades y aeropuertos | `/api/admin/geography/**` | Geografía |
| Ubicación de comandantes | Ubicación operativa y excepciones geográficas | `/api/commanders/**` | Comandantes |
| Notificaciones | Lista, marcar leída y marcar todas | `/api/notifications`, `/{id}/read`, `/read-all` | Notificaciones |
| Auditoría | Consulta global, filtros, actores y eventos por vuelo | `/api/audit/**` | Auditoría |
| Preparación | Comprobación de configuración obligatoria | `GET /api/admin/readiness` | Administración |

### 4.1 Solicitudes sanitarias y urgencia

Regla de `FlightUrgencyPolicy`: las solicitudes normales sólo pueden hacerse para pasado mañana o una fecha posterior (días calendario de la zona de negocio). Para hoy o mañana corresponde extrema urgencia, que exige justificación y un horario límite no anterior al horario solicitado; justificación y límite no se admiten en una solicitud normal. La solicitud no puede estar en el pasado.

### 4.2 Aislamiento DTS

El propietario de una solicitud es `vuelos_sanitarios.id_usuario_solicitante` (NOT NULL), asignado en el servidor desde el JWT. El área DTS pide `/flights?scope=mine`. Las operaciones de asignación de personal sanitario, respuesta a contrapropuesta y cancelación exigen ser el solicitante. No hubo migración asociada.

### 4.3 Tripulación y personal sanitario (V66)

- **Comandante**: cuenta activa, rol COMANDANTE, licencia registrada, informes finales al día (comandante principal) y disponibilidad horaria. Además, su ubicación prevista al despegar debe coincidir con la provincia o CABA del aeropuerto de salida, o bien requiere excepción justificada de Operaciones.
- **Copiloto**: opcional; otro usuario COMANDANTE (nunca el principal) con las mismas condiciones aplicadas a la función COPILOTO.
- **Ubicación prevista**: derivada del itinerario (`CrewItineraryService`); al finalizar un vuelo, comandante y copiloto quedan ubicados en la jurisdicción de llegada.
- **Horario indeterminado**: si falta información para comparar intervalos, la asignación no se confirma (`HORARIO_INDETERMINADO`).
- **Personal sanitario**: pertenece a un único DTS (`personal_sanitario.id_usuario_dts`), sin cuenta ni rol; sólo el DTS solicitante puede asignarlo, mientras el vuelo no haya iniciado. La matrícula es un dato declarado: la aplicación no la verifica ante ningún organismo.
- **Seguimiento**: el barrido periódico revisa elegibilidad e itinerario y sólo emite avisos; nunca modifica asignaciones.

### 4.4 Pacientes y condición clínica

`PatientService` y `PatientDirectoryService` administran la identidad del paciente (compartida entre DTS por diseño; expone identidad, no solicitudes). La condición médica del vuelo se guarda en `informacion_medica_vuelo.condicion_medica`; V68 incorporó el catálogo `condiciones_paciente` con migración de los valores existentes.

### 4.5 Documentos

Sólo PDF. Cada documento lógico tiene versiones inmutables; una sola versión vigente. Crear una versión de un documento existente exige un lease (bloqueo) vigente de 300 s por defecto (`DOCUMENT_LOCK_SECONDS`); un lease vigente de otro usuario devuelve 409. Crear, versionar y bloquear: COMANDANTE, OPERACIONES y CENTRO_OPERACIONES; DTS sólo lee.

### 4.6 Auditoría de Administración

`GET /api/audit` y sus filtros son exclusivos de ADMINISTRADOR; es sólo lectura (la API no permite crear, editar ni borrar eventos). `entityType` acepta varios valores (separados por coma o repetidos) y `actors` acepta filtro por rol. La pantalla ofrece cinco paneles:

| Panel | Eventos |
|---|---|
| Vuelos | Historial completo del vuelo elegido, del más antiguo al más reciente, con cambios de tripulación |
| Usuarios | `USER`, `USER_ROLE` |
| Aeronaves | `AIRCRAFT` (responsables administradores) |
| Personal sanitario | `HEALTH_STAFF` (responsables DTS) |
| Búsqueda general | Búsqueda libre con filtros |

Las fechas de eventos se muestran en la zona de negocio que informa el servidor.

## 5. Flujos operativos extremo a extremo

### 5.1 Catálogos de estado

| Catálogo | Valores (migraciones V25, V34, V44) |
|---|---|
| `estados_vuelo` | PENDIENTE_CONFIRMACION_COMANDANTE, PENDIENTE_RESPUESTA_OPERACIONES, PLANIFICADO, EN_CURSO, FINALIZADO, COMPLETADO, CANCELADO, PENDIENTE_REPLANIFICACION (restaurado en V34) |
| `estados_solicitud_sanitaria` | SOLICITADO, PENDIENTE_RESPUESTA_DTS, APROBADO, RECHAZADO, CANCELADO (agregado en V44) |
| Ruta (`FlightRoute`) | BORRADOR, PENDIENTE_REVISION, APROBADA, DEVUELTA, REQUIERE_REVISION, SIN_REVISION |
| Informe final | PENDIENTE, PRESENTADO, DEVUELTO, APROBADO (versiones: PRESENTADO, DEVUELTO, APROBADO, REEMPLAZADO) |

`FlightStates` define: estados que comprometen recursos (PENDIENTE_CONFIRMACION_COMANDANTE, PENDIENTE_RESPUESTA_OPERACIONES, PLANIFICADO, EN_CURSO); estados en que tripulación y aeronave pueden modificarse (los tres primeros más PENDIENTE_REPLANIFICACION); y estados terminales que liberan recursos (FINALIZADO, COMPLETADO, CANCELADO, RECHAZADO).

### 5.2 Solicitud sanitaria

1. El DTS crea la solicitud (estado de solicitud SOLICITADO), con paciente y datos médicos.
2. Operaciones evalúa: acepta el horario (APROBADO), rechaza con motivo del catálogo (RECHAZADO) o envía una contrapropuesta (PENDIENTE_RESPUESTA_DTS).
3. El DTS acepta o rechaza la contrapropuesta; al rechazarla, la solicitud se cancela (CANCELADO). Cada propuesta admite una sola respuesta (índice único en V44).
4. El DTS puede cancelar su solicitud mientras esté SOLICITADO, PENDIENTE_RESPUESTA_DTS o APROBADO sin ejecutar.

### 5.3 Asignación y planificación

1. Con la solicitud sanitaria APROBADA, Operaciones asigna comandante (según candidatos y regla geográfica) y aeronave y, opcionalmente, copiloto. Al quedar comandante y aeronave fijados, el vuelo sanitario pasa a PLANIFICADO (`completeAssignment` en `FlightService`), con revalidación de toda la tripulación.
2. En un vuelo operativo, el comandante asignado debe responder desde PENDIENTE_CONFIRMACION_COMANDANTE: al aceptar, el vuelo queda PLANIFICADO; al rechazar con motivo, pasa a PENDIENTE_REPLANIFICACION (no se cancela); al proponer otro horario, pasa a PENDIENTE_RESPUESTA_OPERACIONES y Operaciones acepta (PLANIFICADO) o rechaza (vuelve a PENDIENTE_CONFIRMACION_COMANDANTE).
3. Operaciones selecciona aeropuertos y horarios; el comandante guarda y presenta la ruta (`PUT /route`, `/submit`); Operaciones la aprueba o la devuelve con motivo (al menos 10 caracteres). Quien presenta no puede aprobar (autorrevisión rechazada).
4. Un cambio de aeropuertos, horarios, aeronave o comandante puede dejar la ruta en REQUIERE_REVISION; el inicio exige una ruta vigente y aprobada (`requireApprovedForStart`).
5. Los vuelos operativos los crea Operaciones o Administración con motivo (ver paso 2).

### 5.4 Ejecución y cierre

1. Operaciones inicia el vuelo (`POST /{id}/start`): estado EN_CURSO. El servidor reevalúa elegibilidad al inicio (evento `START_REJECTED_ELIGIBILITY` si no cumple).
2. Operaciones finaliza (`POST /{id}/finish`): estado FINALIZADO; se registra la hora real, se actualiza la ubicación de aeronave, comandante y copiloto y se crea la obligación de informe final para el comandante.
3. El comandante presenta el informe (JSON o multipart con archivo) dentro de 48 h; puede solicitar una prórroga única (24 h). Vencido el plazo con la obligación PENDIENTE o DEVUELTO, el comandante queda bloqueado para nuevas asignaciones (se evalúa en cada operación).
4. Operaciones revisa: al aprobar, el vuelo pasa a COMPLETADO; al devolver, se reinicia el plazo y se rehabilita la prórroga.
5. Un trigger SQL (`trg_vuelos_validar_cierre`, V43) sólo admite COMPLETADO desde FINALIZADO con el informe vigente aprobado.

Las cancelaciones requieren fecha, actor y motivo (con descripción si el motivo es `OTRO`), y no se admiten desde EN_CURSO, FINALIZADO ni COMPLETADO (triggers de V3 a V44).

## 6. Modelo de datos

El detalle por tabla y columna está en [INFORME_TABLAS_BASE_DATOS.md](INFORME_TABLAS_BASE_DATOS.md). Las consultas de ejemplo de sólo lectura están en [CONSULTAS_DEMOSTRACION.sql](taller-iii-entrega/CONSULTAS_DEMOSTRACION.sql).

### 6.1 Resumen por dominio

| Dominio | Tablas principales |
|---|---|
| Identidad y acceso | `personas`, `usuarios`, `roles`, `usuarios_roles`, contactos de correo y teléfono, códigos de activación y verificación |
| Vuelos | `vuelos`, `vuelos_sanitarios` (extensión 0..1), `informacion_medica_vuelo`, `negociaciones_horario_vuelo`, `vuelos_tripulantes` |
| Personal sanitario | `personal_sanitario`, `vuelos_personal_sanitario` |
| Recursos | `aeronaves`, `perfiles_comandante`, `excepciones_geograficas_comandante` |
| Planificación | `rutas_vuelo`, hangar, coordinaciones aeroportuarias, bitácora, clima |
| Documentos | `documentos_vuelo`, `versiones_documento_vuelo`, `bloqueos_documento_vuelo` |
| Cierre | `obligaciones_informe_final`, `informes_finales_vuelo` y adjuntos |
| Catálogos | `estados_vuelo`, `estados_solicitud_sanitaria`, `tipos_vuelo`, `prioridades_vuelo`, `tipos_documento`, motivos de cancelación, `condiciones_paciente`, provincias, localidades, aeropuertos |
| Trazabilidad | `eventos_auditoria` (inmutable por triggers), `notificaciones` |

Los nombres exactos deben consultarse en el informe de tablas. Conteos calculados: 46 clases con `@Entity` en `backend-java/src/main/java`; las migraciones SQL contienen 58 sentencias `CREATE TABLE` y 3 `DROP TABLE` (conteo con `grep`, no equivale al número de tablas vigentes porque hubo renombres y reconstrucciones). El número de tablas vigentes: No verificado (requiere una base viva).

### 6.2 Principios de diseño

- Flyway es el único dueño del esquema; las migraciones V16, V17, V26 y V65 son Java (carga de catálogos geográficos y coordenadas).
- Persona (identidad civil) y usuario (cuenta) están separados; el paciente y el personal sanitario reutilizan `personas`.
- Integridad mediante PK, FK, UNIQUE, CHECK e índices filtrados (por ejemplo, una sola versión vigente de documento, una sola participación vigente por profesional y vuelo) y triggers de ciclo de vida.
- Bajas lógicas y versionado conservan historial (usuarios, documentos, tripulación, personal sanitario).

### 6.3 Migraciones recientes (V60 a V68)

| Versión | Contenido |
|---|---|
| V60 | Endurecimiento de políticas y documentos heredados (historial de habilitaciones protegido por triggers) |
| V61, V62 | OTP decimal de seis dígitos para verificación de correo y activación de cuenta |
| V63 | Ubicación operativa del comandante y excepciones geográficas |
| V64 | Ubicación del comandante por provincia y selección de aeropuertos |
| V65 (Java) | Coordenadas de localidades |
| V66 | Simplificación de tripulación y personal sanitario; las tablas de habilitaciones y clasificaciones quedan sólo como historial |
| V67 | Elimina `contactos_coordinacion_traslado` (los eventos de auditoría históricos `TRANSFER_CONTACT` se conservan) |
| V68 | Catálogo `condiciones_paciente` y normalización de valores existentes |

No existe V-file con el número V65 en SQL: es la migración Java `V65__coordenadas_localidades`.

## 7. Seguridad y validaciones

| Tema | Estado verificado |
|---|---|
| Autorización | `@PreAuthorize` por endpoint más reglas de vínculo con el vuelo en los servicios |
| Credenciales | Contraseñas gestionadas por `AuthService`; versión de credencial en el JWT; baja o restablecimiento invalida sesiones |
| Último administrador | No puede darse de baja (bloqueo pesimista de cuentas administrador activas) |
| Adjuntos y documentos | Sólo PDF: tipo de contenido `application/pdf`, extensión `.pdf` y firma `%PDF-` (`DocumentStorage`); tamaño máximo `MAX_PDF_BYTES` (10 485 760 por defecto); almacenamiento en directorio privado `DOCUMENTS_DIRECTORY` |
| Antimalware | **El backend no analiza archivos**: no hay cliente antivirus ni propiedades `app.antimalware.*`. La infraestructura ClamAV heredada (servicio `clamav`, `docker/clamav/`, variables `APP_ANTIMALWARE_*`) se retiró por no tener consumidor; la incorporación de un antivirus queda como implementación a futuro (sección 11.2) |
| Base de datos | Cuenta de aplicación con sólo lectura y escritura de datos; cuenta de migraciones distinta (`MIGRATION_DB_*`); en producción la de migraciones no se entrega al backend. `GET /api/admin/readiness` comprueba privilegios, migración, almacenamiento, secreto JWT y correo |
| Concurrencia | Bloqueos pesimistas, versión optimista en identidades y personal sanitario, índices únicos filtrados |
| Auditoría | `eventos_auditoria` inmutable; consulta sólo para lectura |
| Errores | Códigos de negocio estables en `ApiException` (por ejemplo `AUTOREVISION_RUTA_NO_PERMITIDA`, `RUTA_REQUIERE_REVISION`, `VERSION_RUTA_DESACTUALIZADA`) |

## 8. Pruebas

| Suite | Cómo se ejecuta | Cantidad (método de cómputo) |
|---|---|---|
| Backend (JUnit) | `cd backend-java && mvn -B -ntp clean test` | 66 archivos de prueba; 656 anotaciones `@Test`/`@ParameterizedTest` (conteo con `grep` en `backend-java/src/test`) |
| Frontend (Vitest) | `cd frontend-react && npm ci && npm test` y `npm run build` | 36 archivos `*.test.*`; 356 llamadas `it(`/`test(` contadas con `grep` (los casos parametrizados pueden elevar el total de ejecución) |
| E2E | Scripts `scripts/e2e-*.cjs`, `e2e_*.py` y variantes `-ui` (Chrome) contra el overlay aislado `docker-compose.e2e*.yml` | 66 archivos `scripts/e2e*`; resultado de la última ejecución: No verificado |

Notas:

- El E2E usa un proyecto Compose separado (`-p vuelos-sanitarios-e2e`), la credencial `.env.e2e` y el puerto de SQL Server 14331; no comparte base ni volúmenes con la instalación normal.
- Algunos scripts E2E del modelo de habilitaciones fueron retirados en la simplificación V66; conviene revisar cuáles siguen vigentes antes de ejecutar la suite completa.
- Este informe no ejecutó ninguna suite. Los conteos son estáticos; los resultados de ejecución (aprobadas/fallidas) no se afirman.
- La CI ejecuta sólo `mvn clean test`, la compilación del frontend y la validación de Compose (no ejecuta Vitest ni E2E).

## 9. Despliegue y operación

### 9.1 Archivos Compose

| Archivo | Uso |
|---|---|
| `docker-compose.yml` | Base: `sqlserver`, `db-init`, `db-grants`, `documents-init`, `backend` (perfil Spring `docker`), `frontend` (Nginx); volúmenes `sqlserver_data` y `documents_data` |
| `docker-compose.prod.yml` | Ajustes de producción |
| `docker-compose.release.yml` | Despliegue de imágenes inmutables (`--no-build --pull never`) en una ventana aprobada |
| `docker-compose.e2e*.yml` | Overlays de validación aislada (E2E, UI, validación, SQL compartido) |

### 9.2 Puesta en marcha

```bash
cp .env.example .env        # reemplazar todos los marcadores de posición
docker compose up --build   # SPA en http://localhost:${FRONTEND_PORT:-80}
docker compose down         # conserva datos
docker compose down -v      # borra base y documentos (instalación vacía)
```

Desarrollo sin Docker: ver `README.md` (el proxy de Vite reenvía `/api` a `http://localhost:8080`).

### 9.3 Variables principales

| Variable | Función |
|---|---|
| `MSSQL_SA_PASSWORD` | Administrador de SQL Server |
| `DB_USERNAME`, `DB_PASSWORD` | Cuenta de la aplicación (sin DDL) |
| `MIGRATION_DB_USERNAME`, `MIGRATION_DB_PASSWORD` | Cuenta de migraciones (db_owner) |
| `JWT_SECRET` | Secreto de firma (mínimo 32 bytes) |
| `BOOTSTRAP_ADMIN_*` | Administrador inicial |
| `MAIL_*`, `APP_PUBLIC_URL` | Correo saliente |
| `MAX_PDF_BYTES`, `DOCUMENTS_DIRECTORY`, `DOCUMENT_LOCK_SECONDS` | Documentos |
| `BUSINESS_TIME_ZONE`, `APP_ENVIRONMENT` | Zona y entorno |
| `FINAL_REPORT_*`, `APP_CREW_ELIGIBILITY_*` | Barridos programados |
| `CORS_ALLOWED_ORIGIN` | Origen permitido |

### 9.4 Actualización

Tras cambiar sólo backend o frontend: `docker compose up -d --build backend frontend`. Antes de actualizar una base existente, revisar `flyway_schema_history`, tomar respaldo y aplicar migraciones con la cuenta de migraciones. Ver [DOCKER.md](DOCKER.md).

## 10. Referencias

| Documento | Contenido |
|---|---|
| [INFORME_TABLAS_BASE_DATOS.md](INFORME_TABLAS_BASE_DATOS.md) | Diccionario por tabla |
| [DOCKER.md](DOCKER.md) | Servicios, volúmenes y comandos Docker |
| [taller-iii-entrega/CONSULTAS_DEMOSTRACION.sql](taller-iii-entrega/CONSULTAS_DEMOSTRACION.sql) | Consultas de ejemplo de sólo lectura |

## 11. Limitaciones conocidas y pendientes

| Tema | Detalle |
|---|---|
| Habilitaciones profesionales | Fuera del alcance desde V66: licencia y matrícula son datos declarados, no verificados; no hay integración con ANAC ni registros profesionales |
| Antimalware | Los PDF subidos no se analizan con un antivirus (sección 7); ver la implementación a futuro en la sección 11.2 |
| Correo | Sin SMTP configurado no se envía ni verifica ningún correo |
| Obligatoriedad del copiloto | Opcional: no hay política de negocio que defina cuándo es obligatorio |
| Tiempos de descanso y reposicionamiento | No se modelan; ante datos insuficientes la asignación no se confirma |
| Cuentas DTS + ADMINISTRADOR | Conservan el módulo de Auditoría global; pierden la lectura global de vuelos por API (se recomienda separar las cuentas) |
| Directorio de pacientes | Compartido entre DTS por diseño |
| 403 frente a 404 | Un vuelo ajeno responde 403, lo que permite distinguir un identificador existente de uno inexistente |
| Tablas históricas | Habilitaciones, clasificaciones y políticas permanecen como historial sin uso funcional |
| Pruebas | Resultado de ejecución completa (backend, Vitest, E2E contra SQL Server) y pruebas en navegador: No verificado en este informe |
| Operación real | La preparación para producción depende de decisiones fuera del código (SMTP, respaldos, dimensionamiento, normativa) |

### 11.1 Discrepancias de documentación detectadas

- `docs/DOCKER.md` indica que SQL Server no se publica en el host; `docker-compose.yml` lo publica en `127.0.0.1:14330`.

### 11.2 Implementación a futuro: análisis antivirus de documentos

**Situación actual.** Los documentos que se suben (sólo PDF) se validan por tipo, extensión, firma `%PDF-` y tamaño máximo, pero ningún antivirus los analiza antes de guardarlos. Una versión anterior tenía un servicio ClamAV conectado al flujo de documentación de habilitaciones. Ese flujo se retiró en V66 y la infraestructura quedó sin consumidor, por lo que también se retiró. La configuración anterior puede recuperarse del historial de Git (`docker/clamav/`, `docker-compose.clamav-standalone.yml` y `scripts/verificar-antivirus-produccion.cjs` en el commit `11f9cdf`).

**Propuesta.**

| Aspecto | Propuesta |
|---|---|
| Motor | ClamAV (`clamd`) como servicio de la red interna de Compose, sin puertos publicados; base de firmas actualizada por `freshclam` |
| Integración | Cliente en el backend con el protocolo `INSTREAM` (TCP 3310), invocado por el almacenamiento de documentos antes de persistir el archivo |
| Resultado | Archivo limpio: se guarda. Archivo infectado: se rechaza, con un código de error estable y un evento de auditoría. Analizador no disponible: el archivo se rechaza o queda en cuarentena, según la política de producción |
| Configuración | Variables `APP_ANTIMALWARE_ENABLED`, `APP_ANTIMALWARE_HOST`, `APP_ANTIMALWARE_PORT` y tiempo de espera, más una antigüedad máxima de la base de firmas |
| Operación | Healthcheck de `clamd` (`PING`/`VERSION`) y un ítem en `GET /api/admin/readiness` que informe disponibilidad y antigüedad de las firmas |
| Recursos | La base completa requiere aproximadamente 2–3 GB de RAM y salida a Internet para `freshclam`; puede ejecutarse en un equipo separado dentro de una red privada |
| Pruebas | Firma de prueba EICAR en el entorno E2E (base mínima) para verificar el rechazo sin descargar la base completa |