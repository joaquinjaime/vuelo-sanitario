# Informe técnico y académico — Base de datos del Sistema de Gestión de Vuelos Sanitarios

**Corte de inspección:** 22/09/2026. **Motor verificado:** Microsoft SQL Server 2025 Express, base `vuelos_sanitarios`. **Alcance:** estructura, metadatos y código; no se consultaron datos personales o clínicos.

## 1. Método, alcance y arquitectura

La base sostiene el ciclo de un traslado sanitario: identifica a las personas, distingue su cuenta de acceso de su condición de paciente, registra la solicitud y su contexto clínico puntual, asigna recursos, planifica, conserva evidencias y documenta el cierre. Es un modelo relacional porque sus hechos tienen identidades estables y relaciones referenciales: un vuelo pertenece a un paciente, una persona puede asumir varios roles y cada versión pertenece a un único documento lógico. Las claves y restricciones permiten que esas relaciones no dependan de convenciones de la aplicación.

SQL Server es el custodio físico de tablas, tipos, claves, índices, `CHECK`, defaults y trigger. Flyway versiona y aplica DDL; `spring.jpa.hibernate.ddl-auto=validate` confirma el mapeo sin permitir que Hibernate modifique el esquema. Spring Data JPA implementa entidades, repositorios, autorizaciones, transacciones y reglas que no están declaradas en SQL. Fuentes: `backend-java/src/main/resources/application.yml:13-27`, `backend-java/README.md:1-38` y migraciones V1–V5.

### Verificación contra la instancia real

Se ejecutaron consultas de sólo lectura sobre `sys.tables`, `sys.columns`, `sys.indexes`, `sys.check_constraints`, `sys.foreign_keys`, `sys.triggers` y `flyway_schema_history`. La instancia tiene las cinco migraciones exitosas V1–V5. Se verificaron **24 tablas de negocio, 195 columnas de negocio**, `flyway_schema_history` (10 columnas) y `sysdiagrams` (5 columnas). `sysdiagrams` no procede de Flyway ni tiene entidad JPA: es una tabla auxiliar de diagramas de SQL Server y no forma parte del modelo de la aplicación. No se detectaron divergencias estructurales entre V1–V5 y las 24 tablas de negocio. Sí hay dos observaciones de mapeo: `flight_document_items.row_version` existe en SQL pero no está mapeada con `@Version`, y `flight_audit_log` permanece como entidad física/JPA aunque el servicio vigente escribe en `audit_events`.

Las cantidades esperables no son cuotas del esquema: catálogos (roles, estados, tipos, prioridades y roles de tripulación) son pequeños y casi estáticos; personas, usuarios, pacientes, vuelos y documentos crecen con la operación; snapshots, versiones, notificaciones y auditoría son históricos y de crecimiento alto. No se contaron filas para respetar la restricción de no consultar contenido operativo.

## 2. Inventario por módulo

| Módulo | Tablas | Origen | Uso principal |
|---|---|---|---|
| Identidad y acceso | `persons`, `users`, `patients`, `roles`, `user_roles` | V1/V4 | identidad, autenticación, subtipos y permisos |
| Catálogos | `airports`, `aircraft`, `crew_roles`, `flight_statuses`, `document_types`, `flight_priorities` | V1/V5 | referencias estables configurables |
| Solicitud, recursos y ejecución | `flights`, `flight_medical_info`, `flight_crew`, `weather_snapshots` | V1/V4 | ciclo del traslado, clínica puntual, tripulación y clima |
| Planificación/versionado | `flight_routes`, `hangar_info`, `aa2000_coordination`, `flight_final_reports` | V2/V4 | versiones de datos operativos y cierre |
| Documentación | `flight_document_items`, `flight_documents` | V1, reemplazadas en V4 | identidad documental y versiones PDF/texto |
| Auditoría y avisos | `audit_events`, `flight_audit_log`, `notifications` | V1/V4 | trazabilidad, legado y bandeja persistente |
| Técnica | `flyway_schema_history`; `sysdiagrams` externo | Flyway/SQL Server | historial DDL y diagramas del motor |

## 3. Convenciones del diccionario y lectura de normalización

`NN` significa NOT NULL; `N` significa que permite NULL. `PK`, `FK`, `UQ` e `IX` designan clave primaria, foránea, unicidad e índice. `→` identifica la tabla/columna referenciada. Los defaults son físicos de SQL Server; los valores iniciales Java no sustituyen el default cuando se inserta fuera de JPA. En cada tabla, la columna «descripción y razón de ubicación» explica tanto el significado como por qué no debe trasladarse a otra entidad.

Una relación está en 1FN si cada columna almacena un valor por fila; los JSON son excepciones deliberadas de *snapshot* validadas sintácticamente y no se usan como fuente relacional por atributo. 2FN se analiza sólo donde existe una clave compuesta (`user_roles`); las PK UUID de una sola columna la satisfacen de forma vacua. 3FN/FNBC se concluyen respecto de dependencias que el esquema o el dominio demuestran, no por la mera presencia de una PK. Las conclusiones limitadas se indican expresamente.

## 4. Análisis individual de tablas

### Tabla: `persons`

**A. Propósito y B. justificación.** Identidad civil reutilizable. V4 eliminó nombre, apellido, DNI, teléfono y nacimiento duplicados de `users`/`patients`; una misma persona puede ser ambos subtipos sin dos fichas. Se creó en V4; entidad `Person`. Usada por altas de usuarios y pacientes (`AuthService`, `PatientService`).

| Campo | Tipo SQL Server | NULL | PK/FK/UQ | Descripción y razón de ubicación | Restricciones y observaciones |
|---|---|---|---|---|---|
| id | UNIQUEIDENTIFIER | NN | PK | Identidad técnica de la persona, independiente de que tenga cuenta o sea paciente; permite la identidad compartida. | Sin default físico; Hibernate UUID la genera. |
| nombre | NVARCHAR(100) | NN | — | Nombre civil, común a todos los subtipos; evita copiarlo en cuenta y paciente. | Obligatorio para identificar a una persona. |
| apellido | NVARCHAR(100) | NN | — | Apellido civil por la misma dependencia de `id`. | NN. |
| dni | NVARCHAR(20) | N | UQ filtrado `ux_persons_dni` | Documento de identidad, si existe; pertenece a la identidad, no a la condición clínica ni a credenciales. | Único sólo cuando no es NULL. |
| fecha_nacimiento | DATE | N | — | Fecha personal, no un dato del vuelo. | Opcional si no se dispone. |
| telefono | NVARCHAR(30) | N | — | Contacto de la persona, reutilizable por ambos subtipos. | Opcional. |
| created_at | DATETIME2(3) | NN | — | Momento de crear la identidad, no del subtipo. | DEFAULT `SYSDATETIME()`. |
| updated_at | DATETIME2(3) | NN | — | Última actualización de la identidad. | DEFAULT `SYSDATETIME()`; JPA `@UpdateTimestamp`. |

**D–E.** `id` es PK y `dni` (si se informa) es clave candidata práctica. `users.person_id` y `patients.person_id` son FK únicas: cada subtipo apunta a una persona y una persona puede aparecer, a lo sumo, una vez por subtipo. No hay `ON DELETE CASCADE`, por lo que SQL impide eliminar una identidad referenciada. **F.** Al alta de una persona ficticia «Ana Pérez», se crea una fila y luego pueden crearse sus filas `users` y/o `patients`. **G.** `id → {nombre, apellido, dni, fecha_nacimiento, telefono,...}`; 1FN, 2FN, 3FN y FNBC respecto de las dependencias demostrables. No se deduce que DNI determine los otros datos cuando es NULL.

### Tabla: `users`

**A–B.** Representa una cuenta autenticable, no a la persona en sí. Es necesaria para credenciales, activación y licencia; incorporarlos en `persons` obligaría a que toda persona tuviera cuenta. V1 la creó y V4 la convirtió en subtipo de `persons`; entidad `User`; la usan autenticación, autorizaciones, solicitudes, asignaciones y autores.

| Campo | Tipo SQL Server | NULL | PK/FK/UQ | Descripción y razón de ubicación | Restricciones y observaciones |
|---|---|---|---|---|---|
| id | UNIQUEIDENTIFIER | NN | PK | Identificador de cuenta, distinto del de persona para referencias de actor. | DEFAULT `NEWID()`; JPA UUID. |
| username | NVARCHAR(50) | NN | UQ | Identificador de inicio de sesión, propio de la cuenta. | Impide dos logins iguales. |
| email | NVARCHAR(150) | NN | UQ | Correo de la cuenta para contacto/autenticación. | Único físico. |
| password_hash | NVARCHAR(255) | NN | — | Hash BCrypt; nunca contraseña en claro. Pertenece exclusivamente a seguridad. | NN; el backend lo genera. |
| licencia_aeronautica | NVARCHAR(50) | N | — | Licencia aplicable a personal aeronáutico. | Backend exige valor para rol COMANDANTE, no SQL. |
| activo | BIT | NN | — | Habilitación de acceso sin borrar historial del actor. | DEFAULT 1. |
| created_at | DATETIME2(3) | NN | — | Alta de la cuenta. | DEFAULT `SYSDATETIME()`. |
| updated_at | DATETIME2(3) | NN | — | Cambio de cuenta, no de identidad. | DEFAULT y `@UpdateTimestamp`. |
| person_id | UNIQUEIDENTIFIER | NN | FK, UQ → `persons.id` | Enlace 1:1 a la identidad civil; evita repetirla. | `fk_users_person`; no cascade. |

**D–E.** PK `id`; candidatas `username`, `email`, `person_id`. Un usuario tiene 0..N `user_roles` y puede aparecer como actor en numerosos hechos; cada uno tiene exactamente una persona. **F.** El administrador crea una cuenta ficticia, almacena hash y vincula la persona; `user_roles` agrega sus permisos. **G.** `id`, y separadamente username/email/person_id, determinan atributos de cuenta; 1FN–FNBC respecto de esas dependencias. La regla «licencia si es comandante» es transrelacional y sólo backend.

### Tabla: `patients`

**A–B.** Subtipo que declara que una persona participa como paciente. No contiene diagnóstico: V4 lo trasladó a `flight_medical_info`, porque varía por traslado. Creada en V1 y normalizada V4; entidad `Patient`; usada al solicitar vuelos.

| Campo | Tipo SQL Server | NULL | PK/FK/UQ | Descripción y razón de ubicación | Restricciones y observaciones |
|---|---|---|---|---|---|
| id | UNIQUEIDENTIFIER | NN | PK | Identificador del rol paciente usado por `flights.patient_id`; no reemplaza la persona. | DEFAULT `NEWID()`. |
| created_at | DATETIME2(3) | NN | — | Alta como paciente, distinguible de alta civil. | DEFAULT `SYSDATETIME()`. |
| updated_at | DATETIME2(3) | NN | — | Modificación del subtipo paciente. | DEFAULT/`@UpdateTimestamp`. |
| person_id | UNIQUEIDENTIFIER | NN | FK, UQ → `persons.id` | Identidad compartida de ese paciente. | `uq_patients_person`, `fk_patients_person`. |

**D–E.** PK `id` y candidata `person_id`; cada paciente tiene una persona, una persona como máximo un paciente y un paciente 0..N vuelos. **F.** Se registra a «Ana Pérez» como paciente y luego varios traslados apuntan a ese `patient_id`. **G.** Es una tabla de especialización: `id → timestamps, person_id`; 1FN–FNBC. La unicidad evita duplicar el mismo paciente.

### Tabla: `roles`

**A–B.** Catálogo de roles de autorización (`DTS`, `OPERACIONES`, `COMANDANTE`, `ADMINISTRADOR`). Una tabla evita codificar permisos como columnas o texto repetido por usuario. V1; V5 inserta administrador; entidad `Role`.

| Campo | Tipo SQL Server | NULL | PK/FK/UQ | Descripción y razón de ubicación | Restricciones y observaciones |
|---|---|---|---|---|---|
| id | UNIQUEIDENTIFIER | NN | PK | Identidad estable del rol para `user_roles`. | DEFAULT `NEWID()`. |
| codigo | NVARCHAR(30) | NN | UQ | Clave legible consumida por servicios de autorización. | Catálogo único. |
| nombre | NVARCHAR(100) | NN | — | Rótulo de presentación del rol. | NN. |
| descripcion | NVARCHAR(MAX) | N | — | Alcance documentable del rol. | Opcional. |
| activo | BIT | NN | — | Desactiva el rol sin borrar asignaciones históricas. | DEFAULT 1. |
| created_at | DATETIME2(3) | NN | — | Alta del catálogo. | DEFAULT `SYSDATETIME()`. |

**D–G.** `id` y `codigo` son candidatas; relación N:M con usuarios mediante `user_roles`. Ejemplo: se asigna COMANDANTE a una cuenta. `codigo → nombre, descripción, activo`; 1FN–FNBC. El catálogo no garantiza por sí mismo qué endpoint puede ejecutar cada código: esa política está en Java.

### Tabla: `user_roles`

**A–B.** Tabla asociativa de la relación N:M usuario–rol; conserva además cuándo se asignó. Sin ella, columnas por rol no escalarían y una lista de texto violaría atomicidad/referencias. V1; entidad `UserRole` con `UserRoleId` embebido.

| Campo | Tipo SQL Server | NULL | PK/FK/UQ | Descripción y razón de ubicación | Restricciones y observaciones |
|---|---|---|---|---|---|
| user_id | UNIQUEIDENTIFIER | NN | PK, FK → `users.id` | Cuenta que recibe el rol; es mitad de la relación. | `ON DELETE CASCADE`. |
| role_id | UNIQUEIDENTIFIER | NN | PK, FK → `roles.id` | Rol asignado; segunda mitad de la relación. | `ON DELETE CASCADE`. |
| assigned_at | DATETIME2(3) | NN | — | Instante de la asignación, atributo de la relación y no de usuario ni rol. | DEFAULT `SYSDATETIME()`. |

**D–E.** PK compuesta `(user_id, role_id)` es la única candidata e impide repetir una asignación. Cada lado es 1:N hacia esta tabla; globalmente N:M. **F.** Al crear una cuenta se insertan una fila por código solicitado. **G.** `(user_id, role_id) → assigned_at`; no hay atributo que dependa de sólo una parte: 1FN, 2FN, 3FN y FNBC.

### Tabla: `airports`

**A–B.** Catálogo de aeropuertos, reusable como origen y destino. Centralizar sus códigos y ubicación evita escribir datos inconsistentes por vuelo. V1; entidad `Airport`; planificación lo consulta.

| Campo | Tipo SQL Server | NULL | PK/FK/UQ | Descripción y razón de ubicación | Restricciones y observaciones |
|---|---|---|---|---|---|
| id | UNIQUEIDENTIFIER | NN | PK | Identidad interna para FKs de vuelos. | DEFAULT `NEWID()`. |
| codigo_oaci | NVARCHAR(4) | N | UQ | Código ICAO/OACI, identificador aeronáutico alternativo. | Único cuando no NULL por UNIQUE SQL Server. |
| codigo_iata | NVARCHAR(3) | N | UQ | Código IATA alternativo. | Único cuando no NULL. |
| nombre | NVARCHAR(150) | NN | — | Nombre del aeropuerto, dependiente del catálogo. | NN. |
| ciudad | NVARCHAR(100) | N | — | Ciudad del aeropuerto real, no la ciudad solicitada aún no resuelta. | Opcional. |
| provincia | NVARCHAR(100) | N | — | División territorial del aeropuerto. | Opcional. |
| pais | NVARCHAR(100) | NN | — | País de ubicación. | DEFAULT `Argentina`. |
| latitud | DECIMAL(9,6) | N | — | Coordenada geográfica para planificación. | Precisión explícita. |
| longitud | DECIMAL(9,6) | N | — | Coordenada geográfica complementaria. | Precisión explícita. |
| activo | BIT | NN | — | Disponibilidad administrativa sin borrar referencias históricas. | DEFAULT 1. |

**D–G.** PK `id`; OACI/IATA son candidatas cuando están informados. Un aeropuerto es origen y/o destino de 0..N vuelos; ambos FKs son opcionales en el vuelo. Ejemplo: planificar una ruta asigna dos `id`. `id` y cada código no nulo determinan los datos de catálogo; 1FN–FNBC bajo esa premisa.

### Tabla: `aircraft`

**A–B.** Catálogo de aeronaves asignables. Capacidad y equipamiento pertenecen al recurso, no se repiten en cada vuelo. V1 y CHECK V4; entidad `Aircraft`; Operaciones la asigna.

| Campo | Tipo SQL Server | NULL | PK/FK/UQ | Descripción y razón de ubicación | Restricciones y observaciones |
|---|---|---|---|---|---|
| id | UNIQUEIDENTIFIER | NN | PK | Identidad del recurso para `flights.aircraft_id`. | DEFAULT `NEWID()`. |
| matricula | NVARCHAR(20) | NN | UQ | Matrícula operacional única de aeronave. | Clave candidata. |
| modelo | NVARCHAR(100) | NN | — | Modelo del recurso. | NN. |
| tipo | NVARCHAR(50) | NN | — | Clase (ala fija/helicóptero), propia de aeronave. | NN. |
| capacidad_pacientes | SMALLINT | NN | — | Máximo de pacientes del recurso. | DEFAULT 1; CHECK `>0`. |
| capacidad_tripulacion | SMALLINT | NN | — | Máximo de tripulantes. | DEFAULT 2; CHECK `>0`. |
| equipamiento_medico | NVARCHAR(MAX) | N | — | Descripción de equipamiento disponible en esa aeronave. | Opcional; no se consulta como campos separados. |
| activo | BIT | NN | — | Baja lógica del recurso. | DEFAULT 1. |
| created_at | DATETIME2(3) | NN | — | Alta de catálogo. | DEFAULT `SYSDATETIME()`. |

**D–G.** PK `id`, candidata `matricula`; una aeronave participa en 0..N vuelos. Ejemplo: Operaciones la asigna antes de planificar. `matricula →` atributos del recurso; 1FN–FNBC, con texto de equipamiento como descripción no normalizada semánticamente. SQL no comprueba que el número real de pacientes/tripulantes no exceda las capacidades.

### Tabla: `crew_roles`

**A–B.** Catálogo de función dentro de la tripulación, distinto de `roles` de seguridad: médico puede integrar una tripulación sin que el diseño afirme su autorización de API. V1; entidad `CrewRole`.

| Campo | Tipo SQL Server | NULL | PK/FK/UQ | Descripción y razón de ubicación | Restricciones y observaciones |
|---|---|---|---|---|---|
| id | UNIQUEIDENTIFIER | NN | PK | Identidad para `flight_crew`. | DEFAULT `NEWID()`. |
| codigo | NVARCHAR(30) | NN | UQ | Código funcional, p. ej. COMANDANTE. | Único. |
| nombre | NVARCHAR(100) | NN | — | Etiqueta del puesto. | NN. |

**D–G.** `id`/`codigo` candidatas; 1 rol figura en 0..N filas de `flight_crew`. Ejemplo: asignar COPILOTO. `codigo → nombre`; 1FN–FNBC. La coherencia entre el rol COMANDANTE y el comandante responsable se aplica en `FlightService.addCrew`, no por FK.

### Tabla: `flight_statuses`

**A–B.** Catálogo de estados del ciclo. Sustituye texto repetido en vuelos y permite nombres/orden de UI sin modificar cada hecho. V1; entidad `FlightStatus`; usado por todas las transiciones y trigger.

| Campo | Tipo SQL Server | NULL | PK/FK/UQ | Descripción y razón de ubicación | Restricciones y observaciones |
|---|---|---|---|---|---|
| id | UNIQUEIDENTIFIER | NN | PK | Identidad referenciada por `flights.status_id`. | DEFAULT `NEWID()`. |
| codigo | NVARCHAR(30) | NN | UQ | Estado semántico consumido por Java/trigger (`SOLICITADO`, etc.). | Único. |
| nombre | NVARCHAR(100) | NN | — | Etiqueta de interfaz. | NN. |
| orden | SMALLINT | NN | — | Orden de presentación/flujo. | No es una restricción de transición. |

**D–G.** `id`/`codigo` candidatas; un estado tiene 0..N vuelos. Ejemplo: crear vuelo con SOLICITADO. `codigo → nombre, orden`; 1FN–FNBC. El orden no autoriza cambios de estado: la secuencia está codificada en `FlightService`.

### Tabla: `flight_priorities`

**A–B.** Catálogo V5 de prioridad operativa, expresamente no clínica. Evita repetir etiquetas en solicitudes y permite desactivar una opción. Entidad `FlightPriority`; la creación/evaluación busca solamente prioridades activas.

| Campo | Tipo SQL Server | NULL | PK/FK/UQ | Descripción y razón de ubicación | Restricciones y observaciones |
|---|---|---|---|---|---|
| id | UNIQUEIDENTIFIER | NN | PK | Identidad para `flights.priority_id`. | DEFAULT `NEWID()`. |
| codigo | NVARCHAR(30) | NN | UQ | Clave BAJA/MEDIA/ALTA usada por servicios. | Única. |
| nombre | NVARCHAR(100) | NN | — | Denominación visible. | NN. |
| activo | BIT | NN | — | Vigencia administrativa del nivel. | DEFAULT 1. |
| orden | SMALLINT | NN | — | Orden de listado, no severidad clínica. | NN. |

**D–G.** `id`/`codigo` candidatas; prioridad es opcional físicamente para 0..N vuelos, aunque `create` la requiere por API. Ejemplo: DTS asigna ALTA a una solicitud ficticia. `codigo →` demás atributos; 1FN–FNBC.

### Tabla: `document_types`

**A–B.** Catálogo de clase documental (autorización, parte médico, ruta, hangar, AA2000, informe final, texto libre). Describe la clasificación, no un documento concreto; separarlo permite múltiples documentos de un tipo por vuelo tras V4. V1, ampliado V2/V4; entidad `DocumentType`.

| Campo | Tipo SQL Server | NULL | PK/FK/UQ | Descripción y razón de ubicación | Restricciones y observaciones |
|---|---|---|---|---|---|
| id | UNIQUEIDENTIFIER | NN | PK | Identidad referenciada por el ítem documental. | DEFAULT `NEWID()`. |
| codigo | NVARCHAR(30) | NN | UQ | Código de clasificación usado por DocumentService. | Único. |
| nombre | NVARCHAR(100) | NN | — | Nombre mostrado del tipo. | NN. |

**D–G.** `id`/`codigo` candidatas; tipo 1:N `flight_document_items`. Ejemplo: crear un ítem de tipo RUTA_VUELO. `codigo → nombre`; 1FN–FNBC. No existe UQ `(flight_id, document_type_id)`: es intencional para admitir varios documentos lógicos de igual tipo.

### Tabla: `flights`

**A–B.** Es la entidad central y conserva el estado actual de solicitud, evaluación, asignación, planificación, ejecución o cancelación. Es una tabla propia porque esos atributos describen un traslado específico, mientras paciente, aeronave, persona y aeropuerto se reutilizan. V1; V2 agrega cancelación; V4 agrega checks/índices; V5 prioridad y ciudades solicitadas; entidad `Flight`; `FlightService` implementa el ciclo.

| Campo | Tipo SQL Server | NULL | PK/FK/UQ | Descripción y razón de ubicación | Restricciones y observaciones |
|---|---|---|---|---|---|
| id | UNIQUEIDENTIFIER | NN | PK | Identidad del traslado, eje de datos dependientes. | DEFAULT `NEWID()`. |
| codigo | NVARCHAR(30) | NN | UQ | Código legible del vuelo, generado por backend. | Impide duplicarlo. |
| patient_id | UNIQUEIDENTIFIER | NN | FK → `patients.id`, IX | Paciente trasladado; permite múltiples vuelos del mismo paciente sin duplicar identidad. | Referencia obligatoria, sin cascade. |
| solicitado_por_id | UNIQUEIDENTIFIER | NN | FK → `users.id` | Cuenta DTS/autorizada que solicita. | NN; preserva actor. |
| fecha_solicitada | DATETIME2(3) | NN | IX | Momento de creación de la solicitud, no el horario de vuelo. | NN; índice de consulta. |
| motivo_solicitud | NVARCHAR(MAX) | N | — | Fundamento administrativo del traslado. | Opcional físicamente. |
| status_id | UNIQUEIDENTIFIER | NN | FK → `flight_statuses.id`, IX | Estado actual del ciclo. | NN; índice. |
| priority_id | UNIQUEIDENTIFIER | N | FK → `flight_priorities.id`, IX | Prioridad operativa solicitada/evaluada. | V5; API exige prioridad al crear. |
| ciudad_origen_solicitada | NVARCHAR(100) | N | — | Ciudad declarada antes de escoger aeropuerto concreto; no es redundancia de `origen_id`. | V5. |
| ciudad_destino_solicitada | NVARCHAR(100) | N | — | Equivalente de destino solicitado, previo a planificación. | V5. |
| evaluado_por_id | UNIQUEIDENTIFIER | N | FK → `users.id` | Evaluador de Operaciones; inexistente antes de evaluar. | Opcional por fase. |
| fecha_evaluacion | DATETIME2(3) | N | — | Instante de evaluación. | Opcional por fase. |
| motivo_rechazo | NVARCHAR(MAX) | N | — | Razón del rechazo de la solicitud. | API la exige sólo al rechazar; SQL no. |
| aircraft_id | UNIQUEIDENTIFIER | N | FK → `aircraft.id`, IX compuesto | Aeronave asignada al traslado. | Opcional hasta asignación. |
| comandante_id | UNIQUEIDENTIFIER | N | FK → `users.id`, IX/IX compuesto | Responsable del vuelo, distinto de la lista de tripulación. | Opcional hasta asignación. |
| origen_id | UNIQUEIDENTIFIER | N | FK → `airports.id` | Aeropuerto de salida planificado. | CHECK evita que sea igual a destino si ambos existen. |
| destino_id | UNIQUEIDENTIFIER | N | FK → `airports.id` | Aeropuerto de llegada planificado. | Igual CHECK. |
| fecha_planificada_salida | DATETIME2(3) | N | IX compuestos | Hora prevista de inicio, base de detección de solapamiento. | CHECK con llegada planificada. |
| fecha_planificada_llegada | DATETIME2(3) | N | IX compuestos | Hora prevista de arribo. | Debe ser mayor que salida si ambas no NULL. |
| fecha_salida_real | DATETIME2(3) | N | — | Inicio real de ejecución. | CHECK con llegada real. |
| fecha_llegada_real | DATETIME2(3) | N | — | Fin real. | Debe ser mayor que salida real si ambas no NULL. |
| motivo_cancelacion | NVARCHAR(MAX) | N | — | Justificación de cancelación; pertenece al hecho vuelo. | Trigger la exige cuando estado CANCELADO. |
| fecha_cancelacion | DATETIME2(3) | N | — | Momento de cancelación. | Trigger impide existencia fuera de CANCELADO. |
| cancelado_por_id | UNIQUEIDENTIFIER | N | FK → `users.id` | Actor que canceló; auditable sin texto duplicado. | Trigger la exige al cancelar. |
| created_at | DATETIME2(3) | NN | — | Alta técnica del vuelo, distinguible de `fecha_solicitada` aunque hoy se cargan juntas. | DEFAULT. |
| updated_at | DATETIME2(3) | NN | — | Última modificación de la fila operativa. | DEFAULT/`@UpdateTimestamp`; no es auditoría. |

**D.** Además de PK y UQ `codigo`, tiene `chk_origen_destino_distintos`, `chk_flights_planned_time_order` y `chk_flights_real_time_order`. Los índices no únicos son `idx_flights_status`, `idx_flights_patient`, `idx_flights_fecha_solicitada`, `idx_flights_comandante`, `idx_flights_priority`, y los compuestos por aeronave/comandante más intervalo previsto. No existe constraint que fuerce evaluador, motivo de rechazo, aeronave o comandante según estado.

**E.** Paciente, solicitante y estado son N:1 obligatorios; prioridad, evaluador, aeronave, comandante, aeropuertos y cancelador son N:1 opcionales. Un vuelo es padre 1:N de tripulación, clima, ítems/documentos, auditoría/avisos y de historiales operativos, y 1:0..1 de clínica. **F.** DTS crea VS-AB12CD34 para una paciente ficticia; se insertan `flights`, `flight_medical_info` y `audit_events`. Operaciones evalúa/asigna; comandante planifica; Operaciones inicia/finaliza. **G.** `id` y `codigo` son candidatas. La fila satisface 1FN; 2FN por PK simple. En 3FN/FNBC respecto de dependencias declaradas, las FK almacenan identificadores y no atributos derivados de catálogos. Las dependencias condicionales por estado no están expresadas como `CHECK`; son regla de servicio/trigger parcial, no una prueba de FNBC de toda semántica.

### Tabla: `flight_medical_info`

**A–B.** Contexto clínico relevante para un traslado, no historia clínica permanente. Separarla evita copiar o sobrescribir el diagnóstico de un paciente al realizar otro vuelo. V4; entidad `FlightMedicalInfo`; se crea dentro de la transacción de solicitud.

| Campo | Tipo SQL Server | NULL | PK/FK/UQ | Descripción y razón de ubicación | Restricciones y observaciones |
|---|---|---|---|---|---|
| id | UNIQUEIDENTIFIER | NN | PK | Identidad técnica de la ficha puntual. | DEFAULT `NEWID()`. |
| flight_id | UNIQUEIDENTIFIER | NN | FK, UQ → `flights.id` | Traslado al que aplica la condición, no paciente genérico. | `ON DELETE CASCADE`; garantiza máximo una ficha. |
| diagnostico | NVARCHAR(MAX) | N | — | Diagnóstico relevante para esta operación. | Opcional físicamente. |
| condicion_medica | NVARCHAR(100) | N | — | Estado/categoría puntual que apoya la operación. | No es catálogo ni CHECK. |
| requiere_equipamiento_especial | BIT | NN | — | Indicador de necesidad para este traslado. | DEFAULT 0. |
| observaciones | NVARCHAR(MAX) | N | — | Aclaraciones clínicas de la misión. | Opcional. |
| created_at | DATETIME2(3) | NN | — | Creación de la ficha de traslado. | DEFAULT. |
| updated_at | DATETIME2(3) | NN | — | Cambio de la ficha, no de una versión histórica. | DEFAULT/`@UpdateTimestamp`. |

**D–E.** `id` y `flight_id` son candidatas; FK y UQ forman 1:0..1 (físicamente) con vuelo. **F.** La solicitud ficticia crea diagnóstico/condición propios de ese vuelo. **G.** `flight_id →` atributos clínicos; 1FN–FNBC en lo demostrado. No hay historial de ediciones ni constraint que obligue a que exista una ficha, aunque el servicio la crea.

### Tabla: `flight_crew`

**A–B.** Asignación de integrantes y funciones al vuelo: resuelve N:M entre `flights` y `users` con un atributo adicional (rol y asignador). V1, reforzada V4; entidad `FlightCrew`; `FlightService.addCrew` la utiliza.

| Campo | Tipo SQL Server | NULL | PK/FK/UQ | Descripción y razón de ubicación | Restricciones y observaciones |
|---|---|---|---|---|---|
| id | UNIQUEIDENTIFIER | NN | PK | Identidad de la asignación para auditoría. | DEFAULT `NEWID()`. |
| flight_id | UNIQUEIDENTIFIER | NN | FK, UQ comp. → `flights.id` | Vuelo al que se asigna la persona. | `ON DELETE CASCADE`; parte de ambas UQ. |
| user_id | UNIQUEIDENTIFIER | NN | FK, UQ comp. → `users.id` | Integrante asignado. | `uq_flight_crew_member` evita dos filas del mismo miembro en un vuelo. |
| crew_role_id | UNIQUEIDENTIFIER | NN | FK → `crew_roles.id` | Función concreta en esa misión. | En la UQ original ternaria. |
| asignado_por_id | UNIQUEIDENTIFIER | N | FK → `users.id` | Autor de la asignación. | Nullable para compatibilidad/carga externa. |
| created_at | DATETIME2(3) | NN | — | Alta de asignación. | DEFAULT. |

**D–E.** PK `id`; candidatas `(flight_id,user_id)` y, redundantemente, `(flight_id,user_id,crew_role_id)` por las dos UQ. Un vuelo y usuario tienen 0..N asignaciones globales; cada fila tiene un rol. **F.** Comandante registra a un enfermero ficticio como miembro. **G.** La UQ binaria hace que `flight_id,user_id → crew_role_id`, por lo que el rol no puede ser multivaluado para un miembro en el mismo vuelo. 1FN–FNBC respecto de esas claves. SQL no exige una tripulación mínima ni asocia el comandante de `flights` con el rol; Java lo controla al agregar COMANDANTE.

### Tabla: `weather_snapshots`

**A–B.** Conserva cada consulta climática, incluyendo fuente y payload, como evidencia temporal: el clima no es atributo estable del vuelo ni del aeropuerto. V1; entidad `WeatherSnapshot`; la entidad existe, pero `ESTADO_FUNCIONAL.md` informa servicio/UI pendientes.

| Campo | Tipo SQL Server | NULL | PK/FK/UQ | Descripción y razón de ubicación | Restricciones y observaciones |
|---|---|---|---|---|---|
| id | UNIQUEIDENTIFIER | NN | PK | Identidad de la instantánea. | DEFAULT `NEWID()`. |
| flight_id | UNIQUEIDENTIFIER | NN | FK, IX → `flights.id` | Vuelo cuya decisión meteorológica respalda. | `ON DELETE CASCADE`. |
| consultado_por_id | UNIQUEIDENTIFIER | NN | FK → `users.id` | Usuario que obtuvo/cargó el dato. | NN. |
| fecha_consulta | DATETIME2(3) | NN | — | Instante de observación, no fecha de vuelo. | DEFAULT; JPA timestamp. |
| fuente | NVARCHAR(50) | NN | — | Origen MANUAL o API_EXTERNA esperado. | DEFAULT MANUAL; no CHECK de dominio. |
| proveedor_api | NVARCHAR(100) | N | — | Proveedor cuando la fuente lo justifica. | No se exige condicionalmente. |
| datos_clima | NVARCHAR(MAX) | N | CHECK JSON | Snapshot JSON crudo; se conserva íntegro sin modelar campos no consultados relacionalmente. | `chk_weather_json` valida sintaxis, no esquema JSON. |
| apto_para_volar | BIT | N | — | Resultado de aptitud registrado, puede ser indeterminado. | Opcional. |
| observaciones | NVARCHAR(MAX) | N | — | Interpretación/contexto de esa consulta. | Opcional. |

**D–G.** Sólo `id` es candidata demostrada; un vuelo tiene 0..N snapshots. Ejemplo: comandante registra un JSON ficticio y aptitud. 1FN excepto la decisión deliberada de JSON atómico por snapshot; 2FN–FNBC por PK simple, sin dependencias adicionales demostrables. No hay mecanismo SQL que impida borrar/editar un snapshot mientras exista el vuelo.

### Tabla: `flight_routes`

**A–B.** Historial versionado de parámetros estructurados de ruta; no es el PDF de navegación, que se documenta separadamente. Tener filas por versión conserva lo que se planificó en distintos momentos. V2, fortalecida V4; entidad `FlightRoute`; no se observó servicio de persistencia actual en el estado funcional.

| Campo | Tipo SQL Server | NULL | PK/FK/UQ | Descripción y razón de ubicación | Restricciones y observaciones |
|---|---|---|---|---|---|
| id | UNIQUEIDENTIFIER | NN | PK | Identidad de versión. | DEFAULT `NEWID()`. |
| flight_id | UNIQUEIDENTIFIER | NN | FK, UQ comp./IX → `flights.id` | Entidad lógica «ruta de este vuelo». | `ON DELETE CASCADE`. |
| version | INT | NN | UQ comp. | Número de revisión dentro del vuelo. | DEFAULT 1; CHECK `>0`; no impone continuidad. |
| es_version_actual | BIT | NN | UQ filtrada | Marca la versión vigente. | DEFAULT 1; máximo una actual por vuelo, cero también posible. |
| altitud_pies | DECIMAL(8,2) | N | — | Altitud prevista de esta ruta/version. | Opcional. |
| distancia_nm | DECIMAL(8,2) | N | — | Distancia náutica de la versión. | Opcional. |
| tiempo_estimado_minutos | INT | N | — | Duración prevista de la versión. | Opcional; no CHECK positivo. |
| observaciones | NVARCHAR(MAX) | N | — | Notas de ruta de esa revisión. | Opcional. |
| creado_por_id | UNIQUEIDENTIFIER | NN | FK → `users.id` | Autor de la versión. | NN. |
| created_at | DATETIME2(3) | NN | — | Creación de esa versión, no de la ruta lógica. | DEFAULT. |

**D–E.** Candidatas `id` y `(flight_id,version)`; índice filtrado `uq_flight_routes_actual` garantiza 0..1 vigente, no exactamente una. Vuelo 1:N versiones. **F.** Se guarda ruta v1 ficticia; al revisarla se debería desmarcar v1 e insertar v2 en una transacción de aplicación. **G.** `(flight_id,version) →` datos de revisión; 1FN–FNBC. No se puede afirmar inmutabilidad: no hay trigger que prohíba UPDATE/DELETE de una versión.

### Tabla: `hangar_info`

**A–B.** Historial de preparación de aeronave por vuelo: combustible y checklist pertenecen a una misión y una revisión, no a la ficha estática de la aeronave. V2/V4; entidad `HangarInfo`; servicio/UI pendientes según estado funcional.

| Campo | Tipo SQL Server | NULL | PK/FK/UQ | Descripción y razón de ubicación | Restricciones y observaciones |
|---|---|---|---|---|---|
| id | UNIQUEIDENTIFIER | NN | PK | Identidad de versión de preparación. | DEFAULT `NEWID()`. |
| flight_id | UNIQUEIDENTIFIER | NN | FK, UQ comp./IX → `flights.id` | Vuelo preparado. | `ON DELETE CASCADE`. |
| version | INT | NN | UQ comp. | Secuencia de revisión del registro de hangar. | DEFAULT 1; CHECK `>0`. |
| es_version_actual | BIT | NN | UQ filtrada | Versión vigente de preparación. | Máximo una, no exactamente una. |
| combustible_litros | DECIMAL(10,2) | N | — | Combustible registrado para la operación. | Sin CHECK no negativo. |
| checklist_preparacion | NVARCHAR(MAX) | N | CHECK JSON | Lista de ítems de esa revisión; se guarda JSON porque no se requiere consulta por cada ítem. | Valida JSON sólo sintácticamente. |
| preparacion_completa | BIT | NN | — | Resultado operacional de la revisión. | DEFAULT 0. |
| observaciones | NVARCHAR(MAX) | N | — | Notas de hangar de la versión. | Opcional. |
| registrado_por_id | UNIQUEIDENTIFIER | NN | FK → `users.id` | Responsable de registrar la preparación. | NN. |
| created_at | DATETIME2(3) | NN | — | Alta de versión. | DEFAULT. |

**D–G.** Candidatas `id`, `(flight_id,version)`; vuelo 1:N versiones y 0..1 vigente. Ejemplo: hangar registra v1 con combustible ficticio y checklist. Las dependencias son por `(flight_id,version)`; 1FN con excepción consciente del JSON, 2FN–FNBC. SQL no vincula la preparación a la aeronave efectivamente asignada ni exige completar checklist antes de iniciar.

### Tabla: `aa2000_coordination`

**A–B.** Historial de coordinaciones con AA2000 (slot, contacto y autorización), separado del documento de respaldo para no confundir datos operativos con archivo. V2/V4; entidad `Aa2000Coordination`; aún sin servicio/UI operativo.

| Campo | Tipo SQL Server | NULL | PK/FK/UQ | Descripción y razón de ubicación | Restricciones y observaciones |
|---|---|---|---|---|---|
| id | UNIQUEIDENTIFIER | NN | PK | Identidad de versión de coordinación. | DEFAULT `NEWID()`. |
| flight_id | UNIQUEIDENTIFIER | NN | FK, UQ comp./IX → `flights.id` | Vuelo coordinado. | `ON DELETE CASCADE`. |
| version | INT | NN | UQ comp. | Revisión de coordinación por vuelo. | DEFAULT 1; CHECK `>0`. |
| es_version_actual | BIT | NN | UQ filtrada | Revisión vigente. | Máximo una. |
| fecha_slot | DATETIME2(3) | N | — | Slot asignado/solicitado de esta versión. | Opcional. |
| contacto_aa2000 | NVARCHAR(150) | N | — | Contacto de coordinación. | Opcional. |
| estado_autorizacion | NVARCHAR(30) | NN | CHECK | Estado operativo del permiso. | DEFAULT PENDIENTE; CHECK PENDIENTE/CONFIRMADO/RECHAZADO. |
| observaciones | NVARCHAR(MAX) | N | — | Aclaraciones de esta gestión. | Opcional. |
| registrado_por_id | UNIQUEIDENTIFIER | NN | FK → `users.id` | Autor de la versión. | NN. |
| created_at | DATETIME2(3) | NN | — | Creación de revisión. | DEFAULT. |

**D–G.** Candidatas `id`, `(flight_id,version)` y vigente 0..1 por índice filtrado. Ejemplo: se registra un slot ficticio PENDIENTE y luego v2 CONFIRMADO. 1FN–FNBC respecto de `(flight_id,version)`. El CHECK protege valores de estado, pero no exige slot/contacto al confirmar.

### Tabla: `flight_final_reports`

**A–B.** Datos estructurados de informe final por versión; el PDF asociado es otro documento. Separarlo de `flights` permite conservar correcciones después de cargar el informe. V2/V4; entidad `FlightFinalReport`; `FlightService.saveFinalReport` lo versiona y `finish` exige uno vigente.

| Campo | Tipo SQL Server | NULL | PK/FK/UQ | Descripción y razón de ubicación | Restricciones y observaciones |
|---|---|---|---|---|---|
| id | UNIQUEIDENTIFIER | NN | PK | Identidad de versión de informe. | DEFAULT `NEWID()`. |
| flight_id | UNIQUEIDENTIFIER | NN | FK, UQ comp./IX → `flights.id` | Vuelo cerrado/documentado. | `ON DELETE CASCADE`. |
| version | INT | NN | UQ comp. | Revisión secuencial por vuelo. | DEFAULT 1; CHECK `>0`. |
| es_version_actual | BIT | NN | UQ filtrada | Informe actualmente vigente. | Máximo uno, no exactamente uno. |
| horas_vuelo | DECIMAL(5,2) | N | — | Horas reales informadas. | No CHECK de no negatividad. |
| combustible_consumido_litros | DECIMAL(10,2) | N | — | Consumo del traslado. | No CHECK de no negatividad. |
| incidentes | NVARCHAR(MAX) | N | — | Relato de incidentes de la ejecución. | Opcional. |
| resumen | NVARCHAR(MAX) | N | — | Síntesis del cierre. | Opcional. |
| creado_por_id | UNIQUEIDENTIFIER | NN | FK → `users.id` | Comandante/actor autor de la versión. | NN. |
| created_at | DATETIME2(3) | NN | — | Momento de crear la revisión. | DEFAULT. |

**D–E.** Candidatas `id`, `(flight_id,version)` y sólo una vigente como máximo. Vuelo 1:N informes. **F.** Durante EN_CURSO, comandante crea v1 ficticia; el backend desmarca la anterior e inserta v2 si corrige. **G.** `(flight_id,version) →` contenido; 1FN–FNBC. El conteo `count+1` está protegido contra la mayoría de carreras por lock del vuelo, pero no hay `@Version` y una escritura SQL externa puede violar la intención secuencial.

### Tabla: `flight_document_items`

**A–B.** Identidad lógica de un documento del vuelo: clasifica, titula y define si será PDF o texto. V4 reemplazó el modelo V1/V2, que trataba cada archivo como documento y limitaba uno vigente por tipo/vuelo. Esta separación habilita varios ítems del mismo tipo y un historial por ítem. Entidad `FlightDocumentItem`; `DocumentService` la crea y bloquea pesimistamente al versionar.

| Campo | Tipo SQL Server | NULL | PK/FK/UQ | Descripción y razón de ubicación | Restricciones y observaciones |
|---|---|---|---|---|---|
| id | UNIQUEIDENTIFIER | NN | PK | Identidad estable del documento lógico, referenciada por versiones. | DEFAULT `NEWID()`. |
| flight_id | UNIQUEIDENTIFIER | NN | FK, IX → `flights.id` | Vuelo al que pertenece la pieza documental. | `ON DELETE CASCADE`; índice con `activo`. |
| document_type_id | UNIQUEIDENTIFIER | NN | FK → `document_types.id` | Clasificación del documento lógico. | NN; no impide varios ítems del mismo tipo. |
| modalidad | NVARCHAR(10) | NN | CHECK | Forma inalterablemente esperada del ítem, PDF o TEXT. | CHECK `PDF`/`TEXT`; enum Java. |
| titulo | NVARCHAR(255) | NN | — | Título estable del documento lógico, no del archivo de una versión. | NN. |
| activo | BIT | NN | IX | Baja lógica del ítem sin borrar sus versiones. | DEFAULT 1. |
| row_version | ROWVERSION | NN | — | Token físico que SQL Server modifica al cambiar la fila; permitiría concurrencia optimista. | Existe en SQL pero `FlightDocumentItem` no lo mapea con `@Version`; hoy JPA no lo usa para detectar conflictos. |
| created_at | DATETIME2(3) | NN | — | Creación de la identidad lógica. | DEFAULT. |

**D–E.** PK `id`; un vuelo/document type tienen 0..N ítems y cada ítem 0..N versiones `flight_documents`. El `row_version` no es una clave ni fecha. **F.** Para un vuelo ficticio se crea «Parte médico de traslado» en modalidad TEXT y luego sus revisiones. **G.** `id →` metadatos lógicos; 1FN–FNBC. La modalidad, no un nullable arbitrario, determina qué payload será válido en las filas hijas.

### Tabla: `flight_documents`

**A–B.** Almacena una versión concreta de un ítem documental. Para PDF guarda metadatos y clave de almacenamiento externo; para texto guarda el contenido. No mezcla ambas modalidades y no borra la versión anterior al reemplazar. Creada V1, eliminada/recreada V4; entidad `FlightDocument`; `DocumentService` es el servicio vigente.

| Campo | Tipo SQL Server | NULL | PK/FK/UQ | Descripción y razón de ubicación | Restricciones y observaciones |
|---|---|---|---|---|---|
| id | UNIQUEIDENTIFIER | NN | PK | Identidad de la revisión, usada para descarga/auditoría. | DEFAULT `NEWID()`. |
| document_item_id | UNIQUEIDENTIFIER | NN | FK, UQ comp./UQ filtrada → `flight_document_items.id` | Documento lógico al que corresponde la revisión. | `ON DELETE CASCADE`. |
| version | INT | NN | UQ comp. | Número de versión por ítem, no por tipo ni por vuelo. | CHECK `>0`; `uq_flight_documents_item_version`. |
| es_version_actual | BIT | NN | UQ filtrada | Señala la única revisión vigente del ítem. | DEFAULT 1; máximo una, no exactamente una. |
| nombre_archivo | NVARCHAR(255) | N | CHECK payload | Nombre original/saneado de PDF; no aplica a texto. | Debe coexistir con storage/tamaño para PDF. |
| storage_key | NVARCHAR(255) | N | CHECK payload | Clave opaca del PDF en filesystem configurado, no binario en SQL. | Exclusiva de PDF. |
| mime_type | NVARCHAR(100) | N | — | MIME de PDF; el backend usa `application/pdf`. | El CHECK no la obliga. |
| tamanio_bytes | BIGINT | N | CHECK payload | Tamaño de PDF, útil para descarga/control. | Obligatorio para PDF por CHECK. |
| contenido_texto | NVARCHAR(MAX) | N | CHECK payload | Texto de la versión; no aplica a PDF. | Exclusivo de TEXT por CHECK. |
| creado_por_id | UNIQUEIDENTIFIER | NN | FK → `users.id` | Autor de la revisión. | NN. |
| created_at | DATETIME2(3) | NN | — | Creación de esta versión, no del ítem lógico. | DEFAULT. |

**D.** `chk_flight_documents_payload` exige exactamente el conjunto PDF `(storage_key, nombre_archivo, tamanio_bytes)` o el conjunto texto `contenido_texto`; MIME puede ser NULL incluso en PDF. PK `id`, candidata `(document_item_id,version)` e índice filtrado `ux_flight_documents_current`. **E.** Ítem 1:N versiones; usuario 1:N como creador. **F.** Al reemplazar PDF, la transacción bloquea el ítem, desmarca la actual y crea v2; el archivo v1 queda referenciable. **G.** `(document_item_id,version) →` payload/metadatos; 1FN–FNBC. La garantía de sucesión sin huecos y de que la antigua se desmarque depende del servicio; la UQ sólo impide duplicados.

### Tabla: `audit_events`

**A–B.** Auditoría genérica vigente de eventos de aplicación. Se separa de las tablas operativas para no contaminar su estado presente con un log de alto crecimiento y para registrar entidades distintas del vuelo. V4; entidad `AuditEvent`; `AuditService.record` la usa en solicitudes, evaluación, recursos, planificación, inicio, cierre, tripulación y documentos.

| Campo | Tipo SQL Server | NULL | PK/FK/UQ | Descripción y razón de ubicación | Restricciones y observaciones |
|---|---|---|---|---|---|
| id | BIGINT IDENTITY(1,1) | NN | PK | Secuencia eficiente de evento, apropiada para tabla histórica de volumen. | Generada por SQL Server. |
| flight_id | UNIQUEIDENTIFIER | N | FK, IX → `flights.id` | Vuelo contextual cuando existe; permite consultas por caso. | Nullable para evento global; no cascade especificado. |
| actor_user_id | UNIQUEIDENTIFIER | N | FK → `users.id` | Actor autenticado o NULL si sistema. | No cascade. |
| entity_type | NVARCHAR(80) | NN | — | Tipo lógico (`FLIGHT`, `DOCUMENT`, etc.) de la entidad auditada. | Texto controlado por backend, sin catálogo/CHECK. |
| entity_id | UNIQUEIDENTIFIER | N | — | Identidad de la entidad afectada; polimórfica, por eso no puede tener una FK única. | Limitación de integridad referencial. |
| operation | NVARCHAR(40) | NN | — | Operación de negocio (`CREATE`, `PLAN`, `CREATE_VERSION`, etc.). | Sin CHECK. |
| old_values | NVARCHAR(MAX) | N | CHECK JSON | Estado anterior serializado, cuando se captura. | `chk_audit_json` valida JSON. |
| new_values | NVARCHAR(MAX) | N | CHECK JSON | Estado nuevo/delta serializado. | Igual CHECK; servicio actual suele registrar resumen, no fila completa. |
| occurred_at | DATETIME2(3) | NN | IX | Momento del evento. | DEFAULT; índice `(flight_id, occurred_at DESC)`. |

**D–E.** Sólo `id` es candidata demostrable. `flight_id` y actor son N:1 opcionales. **F.** Al aprobar una solicitud ficticia, el servicio escribe `EVALUATE` con estado nuevo y crea aviso. **G.** `id →` resto; 1FN con JSON atómico, 2FN–FNBC por PK simple. No es inmutable por constraint: un usuario SQL con permisos puede actualizar/borrar; tampoco hay trigger que audite cambios directos a tablas.

### Tabla: `flight_audit_log`

**A–B.** Log V1, granular por campo, mantenido físicamente y con entidad `FlightAuditLog`, pero sin repositorio ni llamadas de servicio vigentes. Fue reemplazado funcionalmente por `audit_events` en V4. Debe documentarse como **implementado pero en desuso**, no como fuente actual de auditoría.

| Campo | Tipo SQL Server | NULL | PK/FK/UQ | Descripción y razón de ubicación | Restricciones y observaciones |
|---|---|---|---|---|---|
| id | BIGINT IDENTITY(1,1) | NN | PK | Secuencia del evento legado. | Generada por SQL Server. |
| flight_id | UNIQUEIDENTIFIER | NN | FK, IX → `flights.id` | Vuelo cuyo campo cambió. | `ON DELETE CASCADE`, por lo que tampoco es retención independiente. |
| usuario_id | UNIQUEIDENTIFIER | N | FK → `users.id` | Actor de cambio o NULL por sistema. | Nullable. |
| campo | NVARCHAR(100) | NN | — | Nombre textual de atributo modificado. | No se valida contra metadatos. |
| valor_anterior | NVARCHAR(MAX) | N | — | Representación anterior del campo. | Sin JSON/CHECK. |
| valor_nuevo | NVARCHAR(MAX) | N | — | Representación posterior. | Sin JSON/CHECK. |
| fecha_cambio | DATETIME2(3) | NN | IX | Instante del cambio. | DEFAULT; índice por vuelo y fecha. |

**D–G.** PK `id`; vuelo 1:N y usuario 0..N. Ejemplo histórico: una fila habría registrado cambio de `status_id`. Por PK simple satisface 1FN–FNBC formalmente, pero `campo` y valores texto reducen capacidad de consulta y no hay garantía de correspondencia semántica. No debe usarse como evidencia de que la aplicación hoy registra cada cambio de columna.

### Tabla: `notifications`

**A–B.** Bandeja persistente por usuario para que un aviso sobreviva a la desconexión WebSocket. Se separa del vuelo porque un vuelo produce avisos a distintos destinatarios y un usuario recibe avisos de varios vuelos. V1; entidad `Notification`; `NotificationService` crea, lista y marca leída.

| Campo | Tipo SQL Server | NULL | PK/FK/UQ | Descripción y razón de ubicación | Restricciones y observaciones |
|---|---|---|---|---|---|
| id | UNIQUEIDENTIFIER | NN | PK | Identidad del aviso, apta para marcar uno como leído. | DEFAULT `NEWID()`. |
| user_id | UNIQUEIDENTIFIER | NN | FK, IX → `users.id` | Destinatario propietario de la notificación. | `ON DELETE CASCADE`. |
| flight_id | UNIQUEIDENTIFIER | N | FK → `flights.id` | Vuelo contextual si el aviso procede de uno. | `ON DELETE CASCADE`; admite avisos no ligados. |
| tipo | NVARCHAR(50) | NN | — | Código de clase de aviso, p. ej. `FLIGHT_APROBADO`. | No CHECK/catálogo. |
| mensaje | NVARCHAR(MAX) | NN | — | Texto mostrado al destinatario. | NN. |
| leido | BIT | NN | IX compuesto | Estado individual de lectura, no estado global del vuelo. | DEFAULT 0; índice `(user_id,leido)`. |
| created_at | DATETIME2(3) | NN | — | Momento de emisión/persistencia del aviso. | DEFAULT. |

**D–G.** PK `id`; usuario 1:N obligatorio y vuelo 0..N opcional. Ejemplo: evaluación aprobada crea una notificación al solicitante; la lectura cambia sólo `leido`. `id →` atributos; 1FN–FNBC. No hay unicidad de tipo/mensaje, por lo que el backend puede generar avisos repetidos y no existe entrega garantizada a WebSocket por SQL.

## 5. Relaciones globales y cardinalidades

La identidad compartida tiene tres niveles: `persons` representa datos civiles; `users` representa el acceso y `patients` la condición asistencial. Las dos FK únicas permiten que una persona sea simultáneamente usuario y paciente, pero no duplican nombre/DNI. Una persona no está obligada físicamente a ser ninguno de los dos subtipos; cada subtipo exige una persona.

Un paciente puede tener muchos vuelos porque las circunstancias médicas y logísticas cambian por traslado. Diagnóstico, condición, equipamiento y observaciones se sitúan en `flight_medical_info`: si residieran permanentemente en `patients`, un traslado nuevo sobrescribiría el contexto del anterior y produciría anomalías de modificación e interpretación clínica.

`user_roles` resuelve la N:M. Un mismo usuario puede ser DTS y COMANDANTE; una lista de texto no permitiría FK, UQ por asignación ni fecha `assigned_at`, y columnas como `es_comandante` escalarían mal ante nuevos roles.

`flight_crew` representa integrantes; `flights.comandante_id` designa el responsable principal. El servicio comprueba que, cuando se agrega una fila con `crew_role.codigo=COMANDANTE`, sea el mismo usuario, pero la BD no lo puede expresar con una FK convencional entre esas filas. Un usuario no puede estar dos veces en el mismo vuelo por `uq_flight_crew_member`.

Los documentos se dividen en ítem lógico (`flight_document_items`) y revisión (`flight_documents`): el primero tiene título, tipo y modalidad estables; el segundo conserva contenido/archivo de una versión. La vigente es la fila `es_version_actual=1`, con índice único filtrado. Las previas persisten salvo una eliminación explícita, y el almacenamiento PDF se ubica fuera de SQL mediante `storage_key`.

La auditoría actual es independiente para poder registrar eventos sin modificar el diseño de cada entidad. Permite saber actor, operación, momento, entidad y un JSON resumido, pero no reconstruye necesariamente todos los valores ni impide que un administrador SQL altere el log. `flight_audit_log` es precedente y no el canal actual.

## 6. Versionado, concurrencia y conservación

| Entidad lógica | Tabla de versiones | Identificador lógico | Unicidad de revisión | Vigente | Cómo se crea actualmente |
|---|---|---|---|---|---|
| Documento | `flight_documents` | `document_item_id` | `(document_item_id,version)` | `ux_flight_documents_current` | `DocumentService`: lock pesimista del ítem, máximo + 1 y desmarcado de anterior |
| Ruta | `flight_routes` | `flight_id` | `(flight_id,version)` | índice filtrado por vuelo | Esquema preparado; no se verificó servicio de escritura vigente |
| Hangar | `hangar_info` | `flight_id` | `(flight_id,version)` | índice filtrado por vuelo | Esquema preparado; servicio pendiente |
| AA2000 | `aa2000_coordination` | `flight_id` | `(flight_id,version)` | índice filtrado por vuelo | Esquema preparado; servicio pendiente |
| Informe final | `flight_final_reports` | `flight_id` | `(flight_id,version)` | índice filtrado por vuelo | `FlightService`: lock del vuelo, `count + 1`, desmarca vigente |

En todos los historiales, `version > 0` y la UQ bloquean duplicados. El índice filtrado garantiza **a lo sumo una** actual; no exige ninguna, ni asegura que la versión 1 exista o que la serie sea contigua. Los registros anteriores no se sobrescriben según los servicios de documento/informe, pero la base por sí sola no declara inmutabilidad. La concurrencia es explícita en asignación/planificación (`SERIALIZABLE` y locks pesimistas) y en documento (lock del ítem). `row_version` se creó para el ítem documental pero su ausencia de `@Version` limita la detección optimista desde JPA.

## 7. Integridad, índices y reglas de negocio

### Integridad declarativa verificada

- PK: UUID en casi todas las tablas; `BIGINT IDENTITY` en ambos logs. Impiden filas sin identidad y soportan FKs.
- FK: impiden referencias a personas, catálogos, vuelos o usuarios inexistentes. Los hijos operativos que usan `ON DELETE CASCADE` (`flight_medical_info`, tripulación, clima, documentos, versiones, notificaciones y log V1) se eliminan si se borra el vuelo. Esto es coherente con limpieza de desarrollo, pero es un riesgo de retención histórica si se habilitan borrados operativos.
- UQ: `users` protege username/email/persona; `persons` protege DNI no nulo; los catálogos protegen códigos; `flights.codigo` y `aircraft.matricula` son alternas; pacientes evita duplicar el subtipo; tripulación evita duplicar miembro; versiones evitan una numeración repetida.
- CHECK: capacidad positiva, origen/destino distintos, orden temporal planificado y real, JSON de clima/checklist/auditoría, estados AA2000, modalidad y payload documental, versiones positivas. `ISJSON` valida la sintaxis, no los campos requeridos dentro del JSON.
- Índices funcionales: índices de estado/paciente/fecha y de agenda por aeronave/comandante aceleran listados y detección de solapamiento; `(user_id,leido)` soporta bandeja; los filtrados garantizan una versión vigente como máximo.

### Trigger vigente

`trg_flights_validate_lifecycle`, creado en V4 (`V4__normalize_identity_clinical_data_and_versioning.sql:184-204`), es un `AFTER INSERT, UPDATE` sobre `flights`, verificado en `sys.triggers`.

| Aspecto | Comportamiento verificado |
|---|---|
| Evento | INSERT o UPDATE de una o más filas; trabaja contra `inserted`/`deleted`, por conjuntos. |
| Condición | Si el nuevo estado es CANCELADO, exige fecha, actor y motivo no blanco. Si no es CANCELADO, exige que los tres datos de cancelación sean NULL. Impide pasar a CANCELADO si el estado anterior era EN_CURSO o FINALIZADO. |
| Efecto | Ejecuta `THROW 51000`; el statement/transacción falla. |
| Qué protege | Cancelaciones incompletas, datos de cancelación fuera de estado y cancelación posterior a ejecución/finalización. |
| Limitación | No autoriza al actor ni verifica la totalidad del flujo; en un INSERT con CANCELADO, `previous_status` es NULL y no hay prohibición adicional. No impide modificar datos de una cancelación ya existente ni garantiza auditoría. |

V3 creó `trg_flights_validate_cancellation`, pero V4 la elimina y sustituye: no es trigger actual. Eliminar el trigger dejaría a la BD aceptar incoherencias si una escritura evita `FlightService.cancel`.

### Reglas garantizadas solamente por backend

`FlightService` (`backend-java/src/main/java/com/vuelossanitarios/backend/service/FlightService.java:17-29`) exige transiciones `SOLICITADO → APROBADO/RECHAZADO`, `APROBADO → PLANIFICADO`, `PLANIFICADO → EN_CURSO`, `EN_CURSO → FINALIZADO`; motivo de rechazo; rol COMANDANTE para asignación; Operaciones para inicio/fin; informe vigente antes de finalizar; y no solapamiento de aeronave/comandante. `assign` y `plan` usan `SERIALIZABLE`; se bloquea el vuelo con lock pesimista. Ninguna de esas reglas, salvo la parte de cancelación y checks de horarios, es constraint SQL.

`DocumentService` impide cambios cuando el vuelo está FINALIZADO, restringe modalidad, comprueba PDF/tamaño y serializa el avance de revisión con lock sobre ítem. `AuthService` exige licencia para COMANDANTE y `PatientService` impide duplicar DNI/paciente mediante consultas; son garantías de API, no prohibiciones completas para SQL directo. Las transacciones hacen atómicos los cambios de cada servicio, pero una sesión SQL con permisos DML puede evitarlos.

## 8. Normalización global

1FN exige valores atómicos por atributo. El modelo cumple para sus entidades y catálogos; `datos_clima`, `checklist_preparacion`, `old_values` y `new_values` son JSON de snapshot/auditoría. Son desnormalizaciones acotadas: preservan una carga externa o delta sin requisito actual de filtrar/agrupar sus propiedades. Su forma interna no está garantizada más allá de JSON válido.

2FN evita dependencias parciales sobre una clave compuesta. La única PK compuesta es `user_roles(user_id,role_id)`, y `assigned_at` depende de la asignación completa, no de sólo usuario ni sólo rol. Las UQ compuestas de versionado también identifican una revisión completa. Las demás PK simples cumplen 2FN por estructura.

3FN elimina dependencias transitivas: `persons` evita que datos civiles dependan de `users` o `patients`; catálogos evitan repetir nombre de estado/rol/aeropuerto/aeronave dentro de `flights`; `flight_medical_info` impide que clínica puntual dependa del paciente. La tabla de vuelo conserva FKs, no nombres derivados de esos catálogos. `ciudad_*_solicitada` no es una transitoria de aeropuerto: representa una declaración antes de seleccionar infraestructura concreta.

FNBC exige que todo determinante sea superclave. Las tablas de catálogo la cumplen respecto de códigos únicos; `users` respecto de username/email/persona; `persons` respecto de DNI no nulo; historias respecto de `(flight_id,version)`. No se prueba FNBC para valores en texto libre o reglas condicionales no modeladas (por ejemplo, cuál rol puede completar un informe) porque no hay dependencia funcional declarada que permita demostrarla.

Las decisiones reducen anomalías: una corrección de DNI se hace una vez; una matrícula se actualiza en `aircraft`; un diagnóstico nuevo de traslado no reescribe vuelos anteriores; un nuevo rol no obliga a alterar `users`; una revisión documental no destruye el archivo previo. Las redundancias restantes son controladas: `flights.comandante_id` y una posible fila COMANDANTE en `flight_crew` modelan responsabilidad y composición, y son coherentes sólo por servicio; `flight_audit_log` y `audit_events` son duplicación histórica de mecanismo, no normalización de un mismo hecho.

## 9. Diagrama entidad–relación

El diagrama editable completo está en [`docs/DIAGRAMA_ER_BASE_DE_DATOS.mmd`](DIAGRAMA_ER_BASE_DE_DATOS.mmd). Resume las 24 tablas de negocio, PK/FK y cardinalidades físicas. En Mermaid, `||` es uno obligatorio, `o|` cero o uno, `o{` cero o muchos y `}|` uno o muchos. La cardinalidad «al menos uno» que dependa de un flujo del backend no se dibuja como garantía SQL.

## 10. Ejemplo integral con datos ficticios

1. Un administrador crea la persona ficticia «Lucía Ríos», su `users` y una fila `user_roles`; otra persona ficticia «María Sol» se da de alta como `patients`. La FK a `persons` y las UQ preservan los subtipos.
2. DTS inserta un `flights` con código generado, estado SOLICITADO, prioridad ALTA, ciudades solicitadas y `patient_id`; en la misma transacción crea `flight_medical_info` y `audit_events(CREATE)`. Es comportamiento del backend, no una obligación SQL de crear clínica.
3. Operaciones actualiza evaluador, fecha, prioridad y estado APROBADO. El servicio exige que antes fuese SOLICITADO, registra `audit_events(EVALUATE)` y crea `notifications` al solicitante.
4. Operaciones asigna una fila existente de `aircraft` y una cuenta con rol COMANDANTE a `flights`; la asignación está serializada y el rol se verifica en Java. El FK sólo acredita que ambos existen.
5. El comandante elige dos filas de `airports`, fechas válidas y pone PLANIFICADO. Los CHECK SQL validan orden de fechas y aeropuertos diferentes; `assertNoOverlap` consulta el índice de agenda para impedir cruces de recurso/comandante.
6. En el diseño previsto, se inserta `weather_snapshots` de consulta ficticia, `flight_routes` v1, `hangar_info` v1 y `aa2000_coordination` v1. Las FK los atan al vuelo; las UQ de versión y filtradas protegen su identificación/vigencia, pero el servicio de estas tres áreas está pendiente.
7. Se crea un `flight_document_items` de tipo RUTA_VUELO y un `flight_documents` v1 PDF, o un tipo TEXTO_LIBRE con contenido. El CHECK de payload impide mezclar archivo y texto; el archivo físico queda bajo `storage_key`.
8. Una corrección inserta v2 y deja v1 no vigente; no se sobrescribe el contenido anterior. El lock de `DocumentService` y UQ compuesta limitan carreras.
9. Operaciones marca EN_CURSO con hora real, y el sistema audita el cambio. Al finalizar, el comandante inserta `flight_final_reports` v1; Operaciones sólo puede marcar FINALIZADO cuando detecta un informe vigente.
10. Los cambios de negocio generan `audit_events`; los destinatarios reciben filas `notifications`. Un intento posterior de cancelación con estado EN_CURSO falla por servicio y por trigger SQL si se intentara DML directo.

## 11. Evaluación crítica basada en evidencia

**Decisiones sólidas.** La identidad compartida y clínica por traslado de V4 corrigen duplicación y contexto temporal; las UQ filtradas modelan correctamente «una vigente como máximo»; `CHECK` de payload separa PDF/texto; el trigger es set-based; los índices compuestos respaldan la consulta real de solapamiento. Flyway es fuente controlada de DDL y Hibernate valida en vez de generar el esquema.

**Riesgos o límites comprobados.** (1) `flight_document_items.row_version` no está anotado `@Version`, por lo que no aporta concurrencia optimista desde JPA. (2) `flight_audit_log` quedó sin uso de servicio mientras `audit_events` es actual; debe decidirse una estrategia de deprecación conservando datos. (3) La auditoría no es inmutable y cascadas desde `flights` pueden borrar evidencia y documentos al eliminar vuelo. (4) Los CHECK no impiden combustible/horas/distancia negativas ni condiciones de completitud como slot al confirmar AA2000. (5) El esquema no expresa por sí mismo las transiciones, roles, mínimos de tripulación, disponibilidad real, requisito de informe, obligatoriedad clínica ni sincronía comandante–tripulación. Esas reglas existen en servicios o están pendientes. (6) El índice de versión permite cero vigentes, huecos y cambios directos de versiones previas. (7) El estado funcional declara clima, hangar y AA2000 como entidades sin servicio/UI; por ello el esquema está implementado pero su operación de aplicación no se puede afirmar.

Estas son propuestas condicionadas, no defectos inventados: antes de agregar constraints o triggers debe definirse si las reglas se aplican también a cargas administrativas/integraciones. Por ejemplo, una restricción de no solapamiento requeriría estrategia transaccional que soporte concurrencia y cambios de intervalo; una regla de inmutabilidad requeriría política de correcciones y permisos.

## 12. Tablas técnicas y limitaciones

### Tabla técnica: `flyway_schema_history`

La gestiona Flyway, no tiene entidad JPA ni operación de negocio. Su propósito es determinar qué scripts DDL se aplicaron; la instancia confirmó V1–V5 exitosas. No se modifica manualmente.

| Campo | Tipo SQL Server | NULL | PK/FK/UQ | Descripción y razón de ubicación | Observaciones |
|---|---|---|---|---|---|
| installed_rank | INT | NN | PK | Orden total de instalación de la migración. | Generado/gestionado por Flyway. |
| version | NVARCHAR(50) | N | — | Versión semántica de migración versionada. | Puede ser NULL en migración repetible. |
| description | NVARCHAR(200) | NN | — | Descripción legible del cambio aplicado. | Metadato Flyway. |
| type | NVARCHAR(20) | NN | — | Clase de migración (SQL, BASELINE, etc.). | Metadato Flyway. |
| script | NVARCHAR(1000) | NN | — | Archivo/script que produjo el cambio. | Permite trazabilidad al DDL. |
| checksum | INT | N | — | Huella del script para detectar modificación posterior. | N para tipos que no aplican. |
| installed_by | NVARCHAR(100) | NN | — | Principal SQL que ejecutó la instalación. | No es usuario funcional. |
| installed_on | DATETIME2 | NN | — | Momento de instalación. | Metadato técnico. |
| execution_time | INT | NN | — | Duración de ejecución en milisegundos. | Diagnóstico Flyway. |
| success | BIT | NN | — | Resultado de aplicación. | En la instancia, V1–V5 son 1. |

### Tabla técnica externa: `sysdiagrams`

No la crea Flyway ni la usa código de la aplicación; SQL Server la deja para diagramas de base creados con herramientas de diseño. Se registró para completitud física, pero no es parte del DER de negocio.

| Campo | Tipo SQL Server | NULL | PK/FK/UQ | Descripción y razón de ubicación | Observaciones |
|---|---|---|---|---|---|
| name | NVARCHAR(128) | NN | UQ compuesta | Nombre del diagrama de SQL Server. | Artefacto de herramienta. |
| principal_id | INT | NN | UQ compuesta | Propietario del diagrama dentro de SQL Server. | No es una persona/usuario de la aplicación. |
| diagram_id | INT IDENTITY | NN | PK | Identidad del diagrama. | Técnica. |
| version | INT | N | — | Versión interna de formato de diagrama. | Técnica. |
| definition | VARBINARY(MAX) | N | — | Contenido serializado del diagrama. | No es documento de vuelo. |

La inspección física se realizó con metadatos y con `flyway_schema_history`; no se inspeccionaron datos. No se ejecutaron mutaciones ni pruebas destructivas. Las afirmaciones sobre operaciones pendientes provienen de `docs/ESTADO_FUNCIONAL.md` y deben distinguirse del esquema, que sí fue contrastado contra SQL Server. Las líneas Java compactadas reducen granularidad de cita; las fuentes de reglas se identifican por clase/método y las fuentes físicas por migración.

## 13. Conclusiones técnicas

El esquema vigente es el resultado acumulado de V1–V5 y contiene 24 tablas de negocio y 195 columnas documentadas. Su núcleo está normalizado alrededor de identidad, vuelo y catálogos; V4 es la migración decisiva que separa identidad, clínica y documento lógico/versionado. SQL Server protege identidad referencial, unicidad, coherencia local de fechas, formato de JSON/payload y cancelación; Spring Boot complementa con autorización, transición de estados, solapamientos, transacciones y generación de auditoría/notificaciones.

La defensa académica debe enfatizar esta frontera: una regla aparece como garantía de base únicamente cuando existe PK/FK/UQ/CHECK/índice único/trigger en V1–V5; el resto es comportamiento del backend y puede requerir refuerzo futuro si habrá integraciones SQL directas. El modelo conserva la evidencia por versiones, pero no declara inmutabilidad absoluta ni retención independiente ante borrado del vuelo.

### Fuentes principales

- `backend-java/src/main/resources/db/migration/V1__init_sanitary_flights_schema.sql`
- `backend-java/src/main/resources/db/migration/V2__planning_phase_tables.sql`
- `backend-java/src/main/resources/db/migration/V3__flight_cancellation_trigger.sql`
- `backend-java/src/main/resources/db/migration/V4__normalize_identity_clinical_data_and_versioning.sql`
- `backend-java/src/main/resources/db/migration/V5__administrator_priorities_and_requested_cities.sql`
- `backend-java/src/main/java/com/vuelossanitarios/backend/domain/` y `service/`
- `backend-java/README.md`, `docs/ESTADO_FUNCIONAL.md`, y metadatos SQL Server consultados el 22/09/2026.
