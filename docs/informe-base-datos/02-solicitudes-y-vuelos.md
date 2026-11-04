# Capítulo 2 — Solicitudes y vuelos

[← Informe principal](../INFORME_COMPLETO_BASE_DATOS.md) · [Índice de capítulos](../INFORME_COMPLETO_BASE_DATOS.md#3-índice-y-navegación)

Tablas de este capítulo: [`vuelos`](#11-tabla-vuelos), [`vuelos_sanitarios`](#12-tabla-vuelos_sanitarios), [`informacion_medica_vuelo`](#13-tabla-informacion_medica_vuelo), [`negociaciones_horario_vuelo`](#14-tabla-negociaciones_horario_vuelo), [`contactos_coordinacion_traslado`](#15-tabla-contactos_coordinacion_traslado).

Cada tabla sigue la estructura A–I del encargo: **A** identificación · **B** funcionalidad · **C** campo por campo · **D** creación de registros · **E** ejemplo funcional · **F** ciclo de vida · **G** relaciones · **H** restricciones y diseño · **I** evidencia. Convenciones y fuentes en [00-metodologia-y-convenciones.md](00-metodologia-y-convenciones.md).

---

## 11. Tabla `vuelos`

### A. Identificación de la tabla

| Atributo | Detalle |
|---|---|
| Nombre exacto y esquema | `dbo.vuelos` (esquema `dbo`) |
| Módulo funcional | 2. Solicitudes y vuelos |
| Tipo de tabla | Principal — entidad operativa central (todo vuelo, sanitario o no) |
| Migración que la creó | V1 (como `flights`, UNIQUEIDENTIFIER) |
| Migraciones posteriores que modificaron su estructura | V2 (cancelación), V3/V4/V7/V21/V27/V30/V42/V43/V44 (triggers del ciclo de vida), V5/V6/V15/V23 (los datos de la solicitud pasan a `vuelos_sanitarios`), V8 (renombre), V18 (índice aeronave-estado), V21 (catálogo de motivos de cancelación), V23 (tipo de vuelo, estado de vuelo, creador; separación sanitario/operativo), V24/V27/V28/V29 (BIGINT y nombres) |
| Estado actual en el esquema | Vigente — 20 columnas, PK `id_vuelos`, 9 FK salientes, 14 FK entrantes, 1 índice(s) único(s), 3 CHECK, 3 trigger(s) (verificado contra `sys.*` de la base E2E en Flyway V62) |
| Tablas relacionadas | vuelos_sanitarios, tipos_vuelo, estados_vuelo, aeronaves, aeropuertos, usuarios, motivos_cancelacion, vuelos_tripulantes, rutas_vuelo, informacion_hangar, coordinaciones_aa2000, informes_finales_vuelo, obligaciones_informe_final, documentos_vuelo, instantaneas_clima, bitacora_vuelos, notificaciones, eventos_auditoria, negociaciones_horario_vuelo, informacion_medica_vuelo |

### B. Funcionalidad y justificación

`vuelos` es **el eje del sistema**: un vuelo es el hecho operativo (qué aeronave, qué comandante, de qué aeropuerto a cuál, cuándo despegó y aterrizó, si se canceló y por qué). Es *común* a todos los tipos de vuelo; lo propio de un vuelo **sanitario** (paciente, urgencia, solicitud del DTS) vive en la extensión 1:0..1 `vuelos_sanitarios` y los datos clínicos en `informacion_medica_vuelo`.

Catorce tablas cuelgan de él por clave foránea; casi todas con borrado en cascada (rutas, hangar, coordinaciones, informes, documentos, clima, bitácora, tripulación, notificaciones). Su columna `id_estados_vuelo` es la máquina de estados operativa: PENDIENTE_CONFIRMACION_COMANDANTE → PENDIENTE_RESPUESTA_OPERACIONES / PENDIENTE_REPLANIFICACION / PLANIFICADO → EN_CURSO → FINALIZADO → COMPLETADO, o CANCELADO.

**Por qué es una tabla independiente.** V23 («vuelos es la entidad operativa común; la solicitud sanitaria es una extensión 0..1») separó lo que es de *todo* vuelo de lo que sólo es de los traslados de pacientes, para admitir vuelos de regreso a base, reposicionamiento, traslado operativo o entrenamiento sin campos de paciente vacíos.

**Qué dejaría de funcionar sin ella.** Todo el módulo operativo: asignación de aeronaves y comandantes, rutas, hangar, coordinaciones, informes finales, bitácora y la mayoría de las notificaciones.

### C. Descripción campo por campo

#### `codigo_vuelo`

| Atributo | Detalle |
|---|---|
| Nombre | `codigo_vuelo` |
| Tipo de dato | `nvarchar(30)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Código legible del vuelo. |
| Justificación | Es el identificador que ven y citan los usuarios (notificaciones, listados) sin exponer el id técnico. |
| Contenido | «V-» seguido de 8 caracteres hexadecimales en mayúsculas (p. ej. V-7F3A21BC). |
| Origen | Backend (`FlightService.code()` a partir de un UUID aleatorio). |
| Momento inicial | En el INSERT. |
| Modificación | Nunca cambia. |
| Validaciones | Índice único `uq_vuelos_2`; NOT NULL y único (`uq_vuelos_2`). *Nota:* el código no está bajo reintento si colisionara (probabilidad ínfima), se resolvería con un error de unicidad. |

#### `motivo_vuelo`

| Atributo | Detalle |
|---|---|
| Nombre | `motivo_vuelo` |
| Tipo de dato | `nvarchar(max)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Razón del vuelo. |
| Justificación | Contextualiza la operación para Operaciones y auditoría; en un sanitario es el motivo del traslado. |
| Contenido | Texto libre de hasta 10 000 caracteres. |
| Origen | Formulario (DTS u Operaciones). |
| Momento inicial | En el INSERT. |
| Modificación | No hay endpoint que lo modifique. |
| Validaciones | NOT NULL; obligatorio no vacío en servicio. |

#### `fecha_planificada_salida`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_planificada_salida` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **Permite NULL.** NULL en un sanitario hasta que Operaciones aprueba el horario (o el DTS acepta la contrapropuesta). Un sanitario rechazado o cancelado antes de aprobar puede permanecer sin fecha. |
| Función | Fecha y hora previstas de despegue. |
| Justificación | Base de la disponibilidad de aeronaves y tripulación y del plazo de la ruta. |
| Contenido | Fecha y hora civil de la zona de negocio. |
| Origen | En sanitarios: la aprobación de Operaciones o la aceptación del DTS; en operativos: el alta o la propuesta aceptada del comandante. |
| Momento inicial | NULL en un sanitario hasta que se fija el horario; en operativos, en el INSERT. |
| Modificación | Replanificación operativa; aceptación de propuesta del comandante. |
| Validaciones | CHECK `ck_vuelos_1378103950`; CHECK: la llegada planificada es posterior. |

#### `fecha_planificada_llegada`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_planificada_llegada` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **Permite NULL.** El comandante asignado la completa al guardar la planificación operativa; antes no puede iniciarse el vuelo. |
| Función | Fecha y hora previstas de aterrizaje. |
| Justificación | Define el intervalo que ocupa la aeronave y la tripulación. |
| Contenido | Fecha y hora civil. |
| Origen | El comandante al planificar (sanitario) o el alta/replanificación (operativo). |
| Momento inicial | NULL en un sanitario hasta que el comandante planifica. |
| Modificación | «Guardar planificación»; propuesta de horario del comandante aceptada. |
| Validaciones | CHECK `ck_vuelos_1378103950`; CHECK de orden con la salida. |

#### `fecha_salida_real`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_salida_real` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **Permite NULL.** NULL hasta el inicio; los vuelos cancelados o rechazados nunca la reciben. |
| Función | Instante real de despegue. |
| Justificación | Registra el inicio efectivo y habilita el control de cierre. |
| Contenido | Fecha y hora (reloj de negocio). |
| Origen | `FlightService.start`. |
| Momento inicial | NULL. |
| Modificación | Sólo al iniciar; no se edita. |
| Validaciones | CHECK `ck_vuelos_1394104007`; El trigger de cierre exige que exista al pasar a EN_CURSO. |

#### `fecha_llegada_real`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_llegada_real` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **Permite NULL.** NULL hasta que Operaciones finaliza el vuelo. |
| Función | Instante real de aterrizaje. |
| Justificación | Cierra la ejecución y fija el plazo del informe final (48 h). |
| Contenido | Fecha y hora. |
| Origen | `FlightService.finish`. |
| Momento inicial | NULL. |
| Modificación | Sólo al finalizar. |
| Validaciones | CHECK `ck_vuelos_1394104007`; Trigger: obligatoria para FINALIZADO; CHECK de orden con la salida real. |

#### `fecha_creacion`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_creacion` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Registra el instante en que el vuelo se incorporó al sistema. |
| Justificación | Permite ordenar cronológicamente, reconstruir el historial y aportar trazabilidad sin depender de la auditoría. |
| Contenido | Fecha y hora (DATETIME2) de la inserción. |
| Origen | Automático: DEFAULT `SYSDATETIME()` de SQL Server o `@CreationTimestamp` de Hibernate (según la entidad); el usuario nunca ingresa esta fecha. |
| Momento inicial | En el INSERT. |
| Modificación | Inmutable: ningún flujo la actualiza (`updatable=false` en la entidad). |
| Validaciones | DEFAULT sysdatetime() |

#### `fecha_actualizacion`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_actualizacion` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Último cambio de la fila. |
| Justificación | Permite ver actividad reciente sobre el vuelo. |
| Contenido | Fecha y hora. |
| Origen | `@UpdateTimestamp`. |
| Momento inicial | En el INSERT. |
| Modificación | En cada UPDATE (asignación, estado, planificación…). |
| Validaciones | DEFAULT sysdatetime() |

#### `fecha_cancelacion`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_cancelacion` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **Permite NULL.** NULL en todo vuelo no cancelado (la mayoría). La completa Operaciones (o el DTS sobre su solicitud o al rechazar una contrapropuesta). |
| Función | Instante en que se canceló el vuelo. |
| Justificación | Evidencia temporal de la cancelación. |
| Contenido | Fecha y hora. |
| Origen | `FlightService.cancelFlight`. |
| Momento inicial | NULL. |
| Modificación | Sólo al cancelar. |
| Validaciones | Trigger: obligatoria si está CANCELADO y NULL en los demás estados. |

#### `motivo_cancelacion_personalizado`

| Atributo | Detalle |
|---|---|
| Nombre | `motivo_cancelacion_personalizado` |
| Tipo de dato | `nvarchar(max)` |
| Nulabilidad | **Permite NULL.** NULL salvo cancelaciones con motivo «OTRO». |
| Función | Texto libre del motivo cuando el catálogo no alcanza (OTRO). |
| Justificación | Permite explicar casos no previstos sin ensanchar el catálogo. |
| Contenido | Texto. |
| Origen | Formulario de cancelación. |
| Momento inicial | NULL. |
| Modificación | Sólo al cancelar con motivo OTRO. |
| Validaciones | Trigger: obligatorio si el motivo es OTRO y prohibido en los demás. |

#### `id_vuelos`

| Atributo | Detalle |
|---|---|
| Nombre | `id_vuelos` |
| Tipo de dato | `bigint` — IDENTITY(1,1) |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Clave primaria de la tabla: identifica de forma única cada fila y es el valor que otras tablas, la API y la auditoría usan para referirse a ella. |
| Justificación | Un identificador técnico numérico, estable y sin significado de negocio evita depender de datos que pueden cambiar (nombres, códigos) y hace eficientes los JOIN y las claves foráneas (decisión V24/V27: «toda tabla de aplicación tiene su propio id_<tabla> BIGINT IDENTITY»). |
| Contenido | Número entero positivo correlativo (1, 2, 3…). Los usuarios ven `codigo_vuelo`, no este número; los endpoints sí lo usan (`/api/flights/{id}`). |
| Origen | SQL Server, columna IDENTITY(1,1): se asigna en el propio INSERT. Hibernate lo declara `@GeneratedValue(strategy = IDENTITY)` y lo lee de vuelta tras insertar. |
| Momento inicial | En el INSERT; no existe fila sin identificador. |
| Modificación | Nunca cambia (inmutable; JPA lo declara `updatable=false`). |
| Validaciones | PRIMARY KEY; PRIMARY KEY (unicidad y NOT NULL); no se reutiliza al borrar filas. |

#### `id_aeronaves`

| Atributo | Detalle |
|---|---|
| Nombre | `id_aeronaves` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** NULL hasta que Operaciones asigna recursos; un sanitario rechazado o cancelado sin asignar nunca la tiene. |
| Función | Aeronave asignada. |
| Justificación | Determina capacidad, ubicación y disponibilidad. |
| Contenido | Identificador de `aeronaves`. |
| Origen | Operaciones al asignar recursos (sanitario) o al crear/replanificar (operativo). |
| Momento inicial | NULL en un sanitario hasta asignar. |
| Modificación | «Asignar recursos», «Cambiar aeronave», replanificación. |
| Validaciones | FOREIGN KEY → `aeronaves.id_aeronaves` (borrado: NO ACTION); FK; en el servicio: aeronave activa, libre, con capacidad y en la provincia de origen. |

#### `id_usuario_comandante`

| Atributo | Detalle |
|---|---|
| Nombre | `id_usuario_comandante` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** Se completa al asignar recursos. |
| Función | Comandante responsable del vuelo. |
| Justificación | Define quién acepta, planifica, presenta rutas e informes. |
| Contenido | Identificador de `usuarios` con perfil de comandante. |
| Origen | Operaciones. |
| Momento inicial | NULL en un sanitario hasta asignar. |
| Modificación | Asignación o reemplazo de recursos. |
| Validaciones | FOREIGN KEY → `usuarios.id_usuarios` (borrado: NO ACTION); FK; comandante elegible y en la provincia de origen. |

#### `id_aeropuerto_origen`

| Atributo | Detalle |
|---|---|
| Nombre | `id_aeropuerto_origen` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** El comandante lo completa al guardar la planificación. |
| Función | Aeropuerto de salida. |
| Justificación | Punto desde el que se evalúa la ubicación de la aeronave y se arma la ruta. |
| Contenido | Identificador de `aeropuertos`. |
| Origen | Comandante al planificar (sanitario) o ubicación de la aeronave (operativo). |
| Momento inicial | NULL en un sanitario. |
| Modificación | Planificación; cambio de aeronave en operativos. |
| Validaciones | FOREIGN KEY → `aeropuertos.id_aeropuertos` (borrado: NO ACTION); CHECK `ck_vuelos_2021582240`; FK; CHECK origen ≠ destino. |

#### `id_aeropuerto_destino`

| Atributo | Detalle |
|---|---|
| Nombre | `id_aeropuerto_destino` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** Lo completa el comandante o Operaciones al planificar. |
| Función | Aeropuerto de llegada. |
| Justificación | Define adónde se mueve la aeronave al finalizar. |
| Contenido | Identificador de `aeropuertos`. |
| Origen | Comandante o Operaciones. |
| Momento inicial | NULL en un sanitario. |
| Modificación | Planificación. |
| Validaciones | FOREIGN KEY → `aeropuertos.id_aeropuertos` (borrado: NO ACTION); CHECK `ck_vuelos_2021582240`; FK; CHECK origen ≠ destino. |

#### `id_usuario_cancelador`

| Atributo | Detalle |
|---|---|
| Nombre | `id_usuario_cancelador` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** NULL si el vuelo no fue cancelado. |
| Función | Quién canceló el vuelo. |
| Justificación | Responsabilidad de la cancelación. |
| Contenido | Identificador de `usuarios`. |
| Origen | Usuario autenticado. |
| Momento inicial | NULL. |
| Modificación | Sólo al cancelar. |
| Validaciones | FOREIGN KEY → `usuarios.id_usuarios` (borrado: NO ACTION); FK; obligatorio por trigger si CANCELADO. |

#### `id_motivos_cancelacion`

| Atributo | Detalle |
|---|---|
| Nombre | `id_motivos_cancelacion` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** NULL en vuelos no cancelados. |
| Función | Motivo normalizado de la cancelación. |
| Justificación | Permite estadísticas y evita textos libres inconsistentes. |
| Contenido | Identificador de `motivos_cancelacion`. |
| Origen | Formulario (lista cerrada de 23 motivos). |
| Momento inicial | NULL. |
| Modificación | Sólo al cancelar. |
| Validaciones | FOREIGN KEY → `motivos_cancelacion.id_motivos_cancelacion` (borrado: NO ACTION); FK; trigger si CANCELADO. |

#### `id_tipos_vuelo`

| Atributo | Detalle |
|---|---|
| Nombre | `id_tipos_vuelo` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Clase de vuelo (SANITARIO, REGRESO_BASE, REPOSICIONAMIENTO, TRASLADO_OPERATIVO, ENTRENAMIENTO, OTRO). |
| Justificación | Decide si existe extensión sanitaria, qué documentos son compatibles y qué política de habilitaciones aplica. |
| Contenido | Identificador de `tipos_vuelo`. |
| Origen | El servicio (SANITARIO) o el formulario de vuelo operativo. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `tipos_vuelo.id_tipos_vuelo` (borrado: NO ACTION); NOT NULL, FK. |

#### `id_estados_vuelo`

| Atributo | Detalle |
|---|---|
| Nombre | `id_estados_vuelo` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** NULL mientras la solicitud sanitaria todavía no tiene recursos asignados (o fue rechazada). Lo completa «Asignar recursos» (PLANIFICADO) o la cancelación. |
| Función | Estado operativo del vuelo. |
| Justificación | Máquina de estados que gobierna qué acciones están permitidas. |
| Contenido | Identificador de `estados_vuelo`. |
| Origen | Servicios de vuelo. |
| Momento inicial | NULL en un sanitario recién solicitado; el estado inicial de un operativo es PENDIENTE_CONFIRMACION_COMANDANTE. |
| Modificación | Cada transición del ciclo de vida. |
| Validaciones | FOREIGN KEY → `estados_vuelo.id_estados_vuelo` (borrado: NO ACTION); FK; triggers de ciclo de vida. |

#### `id_usuario_creador`

| Atributo | Detalle |
|---|---|
| Nombre | `id_usuario_creador` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Quién creó el vuelo. |
| Justificación | Trazabilidad del origen (el DTS solicitante o el operador). |
| Contenido | Identificador de `usuarios`. |
| Origen | Usuario autenticado. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `usuarios.id_usuarios` (borrado: NO ACTION); NOT NULL, FK. |

### D. Momento en que se crea un registro

**Escenario 1: Solicitud sanitaria del DTS (vuelo sanitario)**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | DTS |
| Pantalla / componente y acción | Pantalla DTS → «Nueva solicitud» → **Crear solicitud** ([`DTS`](../../frontend-react/src/main.jsx), botón en la línea 381). |
| Datos que aporta el usuario | Paciente (existente o nuevo), localidad de origen y destino, prioridad, motivo del vuelo, fecha y hora solicitadas, extrema urgencia (+ justificación y límite), datos médicos y contactos de coordinación. |
| Endpoint | `POST /api/flights` (paciente ya registrado) o `POST /api/flights/with-patient` ([`FlightController.java`](../../backend-java/src/main/java/com/vuelossanitarios/backend/api/FlightController.java)) |
| Servicio | `SanitaryRequestRegistrationService` → `FlightService.create` (`@Transactional`) |
| Validaciones y condiciones | Rol DTS; política de urgencia (`FlightUrgencyPolicy`: no pasado; un vuelo normal sólo para pasado mañana o después; la extrema urgencia exige justificación y límite ≥ fecha solicitada); diagnóstico y condición médica obligatorios; localidades activas y distintas; paciente existente. |
| Mecanismo que crea el registro | `flights.save(f)` (Hibernate INSERT). |
| Columnas completadas y de dónde sale cada valor | `codigo_vuelo` ← «V-» + 8 caracteres hexadecimales aleatorios; `id_tipos_vuelo` ← tipo SANITARIO; `motivo_vuelo` ← formulario; `id_usuario_creador` ← DTS autenticado; `fecha_creacion`/`fecha_actualizacion` ← Hibernate. |
| Columnas que quedan NULL o con valor predeterminado | Todo lo operativo: `id_estados_vuelo` (NULL: aún no hay recursos), `id_aeronaves`, `id_usuario_comandante`, aeropuertos, fechas planificadas y reales, datos de cancelación. |
| Otros registros creados en la misma operación | `vuelos_sanitarios`, `informacion_medica_vuelo`, una `negociaciones_horario_vuelo` (DTS_PROPUESTA), contactos de coordinación, evento `CREATE_SANITARY` en `eventos_auditoria` y notificaciones a Operaciones (`NEW_SANITARY_REQUEST`, y `EXTREME_URGENCY_REQUEST` si corresponde). |
| Si la operación falla / atomicidad | **Atómico**: una única transacción; si algo falla no queda vuelo, solicitud, paciente ni contacto. |

**Escenario 2: Vuelo operativo (no sanitario) creado por Operaciones**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | Operaciones / Centro de Operaciones / Administrador |
| Pantalla / componente y acción | «Crear vuelo operativo» ([`OperationalFlightForm`](../../frontend-react/src/main.jsx), botón en la línea 514). |
| Datos que aporta el usuario | Tipo de vuelo (≠ SANITARIO), aeronave, destino, comandante, salida, llegada, motivo. |
| Endpoint | `POST /api/flights/operational` |
| Servicio | `FlightService.createOperational` (`Isolation.SERIALIZABLE`) |
| Validaciones y condiciones | Llegada posterior a la salida; aeronave activa con ubicación; destino activo y ≠ origen (el origen es la ubicación actual de la aeronave); comandante elegible (habilitado y vigente); el comandante debe estar en la provincia de origen; sin solapamientos de aeronave ni de tripulación; bloqueo de aeropuertos (`AirportLocks`). |
| Mecanismo que crea el registro | `flights.save(f)` y luego `ensureCommanderCrew`. |
| Columnas completadas y de dónde sale cada valor | Todas las anteriores más `id_aeronaves`, `id_usuario_comandante`, `id_aeropuerto_origen`, `id_aeropuerto_destino`, `fecha_planificada_salida`, `fecha_planificada_llegada` y `id_estados_vuelo` = PENDIENTE_CONFIRMACION_COMANDANTE. |
| Columnas que quedan NULL o con valor predeterminado | Fechas reales y cancelación. |
| Otros registros creados en la misma operación | `vuelos_tripulantes` (comandante), auditoría `CREATE_OPERATIONAL`, notificación `COMMANDER_ASSIGNMENT_PENDING` al comandante. |
| Si la operación falla / atomicidad | Atómico (SERIALIZABLE). |

**Escenario 3: Migración histórica**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | Flyway (V1, V23) |
| Pantalla / componente y acción | — |
| Datos que aporta el usuario | — |
| Endpoint | — |
| Servicio | V23 trasladó los vuelos existentes como SANITARIO |
| Validaciones y condiciones | — |
| Mecanismo que crea el registro | SQL. |
| Columnas completadas y de dónde sale cada valor | — |
| Columnas que quedan NULL o con valor predeterminado | — |
| Otros registros creados en la misma operación | — |
| Si la operación falla / atomicidad | Todo o nada. |

### E. Ejemplo funcional completo

**Situación (ficticia):** traslado de «Juan Díaz» de Tucumán a Salta.

1. **Alta (DTS, 2026-11-01).** Se inserta:

| id_vuelos | codigo_vuelo | id_tipos_vuelo | id_estados_vuelo | motivo_vuelo | id_aeronaves | id_usuario_comandante | origen/destino | planificada salida/llegada | id_usuario_creador |
|---|---|---|---|---|---|---|---|---|---|
| 900 | V-7F3A21BC | SANITARIO | NULL | Traslado programado | NULL | NULL | NULL / NULL | NULL / NULL | 12 (DTS) |

2. **Operaciones aprueba el horario** (`acceptRequestedSchedule`): se fija `fecha_planificada_salida` = la solicitada; la solicitud pasa a APROBADO; el vuelo sigue con estado NULL.
3. **Operaciones asigna recursos** (`assign`): se completan `id_aeronaves`, `id_usuario_comandante` y `id_estados_vuelo`=PLANIFICADO.
4. **El comandante planifica** (`configureOperationalPlanning`): `id_aeropuerto_origen`, `id_aeropuerto_destino` y `fecha_planificada_llegada`.
5. **Inicio** (`start`): `fecha_salida_real` = ahora, estado EN_CURSO (exige ruta aprobada, tripulación elegible y aeronave en el origen).
6. **Fin** (`finish`): `fecha_llegada_real` = ahora, FINALIZADO; la aeronave pasa al aeropuerto de destino y se abre la obligación de informe final.
7. **Cierre**: al aprobarse el informe, estado COMPLETADO. Si en lugar de ello se cancelara antes del inicio: `fecha_cancelacion`, `id_usuario_cancelador`, `id_motivos_cancelacion` (+ texto si es «OTRO») y estado CANCELADO.

### F. Ciclo de vida del registro

| Transición | Acción | Actor | Campos modificados | Validaciones / efectos |
|---|---|---|---|---|
| (sanitario) solicitud → horario fijado | «Aprobar horario» / aceptación de contrapropuesta | Operaciones / DTS | `fecha_planificada_salida` | no cambia el estado del vuelo; revalida la ruta (`reassess`) |
| NULL → PLANIFICADO | «Asignar recursos» | Operaciones | `id_aeronaves`, `id_usuario_comandante`, `id_estados_vuelo` | aeronave en la provincia de origen, capacidad, sin solapamientos, comandante elegible |
| PLANIFICADO → PLANIFICADO | «Cambiar aeronave» | Operaciones | `id_aeronaves` (y origen en vuelos operativos) | en operativos puede volver a PENDIENTE_CONFIRMACION_COMANDANTE |
| PENDIENTE_CONFIRMACION_COMANDANTE → PLANIFICADO / PENDIENTE_RESPUESTA_OPERACIONES / PENDIENTE_REPLANIFICACION | Respuesta del comandante (aceptar, proponer horario, rechazar) | Comandante | `id_estados_vuelo` | cada respuesta crea una `negociaciones_horario_vuelo` |
| PENDIENTE_RESPUESTA_OPERACIONES → PLANIFICADO / PENDIENTE_CONFIRMACION_COMANDANTE | Operaciones acepta o rechaza la propuesta del comandante | Operaciones | fechas planificadas, estado | — |
| PENDIENTE_REPLANIFICACION → PENDIENTE_CONFIRMACION_COMANDANTE | «Enviar nueva asignación» | Operaciones | aeronave, comandante, origen, destino, fechas, estado | solo vuelos operativos |
| PLANIFICADO | Planificación del comandante | Comandante | `id_aeropuerto_origen`, `id_aeropuerto_destino`, `fecha_planificada_llegada` | origen ≠ destino, llegada > salida |
| PLANIFICADO → EN_CURSO | «Iniciar vuelo» | Operaciones | `fecha_salida_real`, estado | datos completos, tripulación elegible hoy y el día del vuelo, ruta aprobada, aeronave en el origen |
| EN_CURSO → FINALIZADO | «Finalizar vuelo» | Operaciones | `fecha_llegada_real`, estado | actualiza ubicación de aeronave y provincia del comandante; crea la obligación de informe |
| FINALIZADO → COMPLETADO | Aprobar el informe final | Operaciones | estado | el trigger exige la obligación y el informe aprobados |
| * → CANCELADO | «Cancelar vuelo» | Operaciones (cualquier vuelo) / DTS (su propia solicitud) | `fecha_cancelacion`, `id_usuario_cancelador`, `id_motivos_cancelacion`, `motivo_cancelacion_personalizado`, estado | sólo antes de EN_CURSO; el trigger lo impone también en SQL |
| Estados terminales | COMPLETADO y CANCELADO | — | — | irreversibles (trigger `trg_vuelos_validar_cierre`) |
| Borrado físico | no existe en la aplicación | — | — | un DELETE arrastraría por CASCADE rutas, hangar, informes, etc. |

### G. Relaciones con otras tablas

**Clave primaria:** `id_vuelos`.

**Claves foráneas salientes (tabla hija → padre):**

| Columna | Referencia | Borrado | Obligatoria |
|---|---|---|---|
| `id_aeronaves` | `aeronaves.id_aeronaves` (`fk_vuelos_id_aeronaves`) | NO ACTION | Opcional (NULL) |
| `id_aeropuerto_destino` | `aeropuertos.id_aeropuertos` (`fk_vuelos_id_aeropuerto_destino`) | NO ACTION | Opcional (NULL) |
| `id_aeropuerto_origen` | `aeropuertos.id_aeropuertos` (`fk_vuelos_id_aeropuerto_origen`) | NO ACTION | Opcional (NULL) |
| `id_estados_vuelo` | `estados_vuelo.id_estados_vuelo` (`fk_vuelos_id_estados_vuelo`) | NO ACTION | Opcional (NULL) |
| `id_motivos_cancelacion` | `motivos_cancelacion.id_motivos_cancelacion` (`fk_vuelos_id_motivos_cancelacion`) | NO ACTION | Opcional (NULL) |
| `id_tipos_vuelo` | `tipos_vuelo.id_tipos_vuelo` (`fk_vuelos_id_tipos_vuelo`) | NO ACTION | Obligatoria |
| `id_usuario_cancelador` | `usuarios.id_usuarios` (`fk_vuelos_id_usuario_cancelador`) | NO ACTION | Opcional (NULL) |
| `id_usuario_comandante` | `usuarios.id_usuarios` (`fk_vuelos_id_usuario_comandante`) | NO ACTION | Opcional (NULL) |
| `id_usuario_creador` | `usuarios.id_usuarios` (`fk_vuelos_id_usuario_creador`) | NO ACTION | Obligatoria |

**Claves foráneas entrantes (tablas hijas):** `bitacora_vuelos`(id_vuelos), `coordinaciones_aa2000`(id_vuelos), `documentos_vuelo`(id_vuelos), `eventos_auditoria`(id_vuelos), `informacion_hangar`(id_vuelos), `informacion_medica_vuelo`(id_vuelos), `informes_finales_vuelo`(id_vuelos), `instantaneas_clima`(id_vuelos), `negociaciones_horario_vuelo`(id_vuelos), `notificaciones`(id_vuelos), `obligaciones_informe_final`(id_vuelos), `rutas_vuelo`(id_vuelos), `vuelos_sanitarios`(id_vuelos), `vuelos_tripulantes`(id_vuelos).

`vuelos` es **padre** de: `vuelos_sanitarios` (1:0..1, CASCADE), `vuelos_tripulantes`, `rutas_vuelo`, `informacion_hangar`, `coordinaciones_aa2000`, `informes_finales_vuelo`, `instantaneas_clima`, `documentos_vuelo`, `bitacora_vuelos`, `informacion_medica_vuelo`, `notificaciones` (todas CASCADE) y de `obligaciones_informe_final`, `negociaciones_horario_vuelo`, `eventos_auditoria` (NO ACTION). Es **hijo** de: tipo (obligatorio), estado (opcional: NULL en un sanitario aún sin recursos), aeronave, aeropuertos de origen y destino, comandante, creador (obligatorio), cancelador y motivo de cancelación (opcionales).

*Importante:* las FK con CASCADE hacia el vuelo implican que un DELETE de un vuelo borraría sus rutas, informes, documentos y bitácora. La aplicación nunca borra vuelos (no hay endpoint), de modo que el CASCADE es una red de seguridad de integridad y no un flujo de uso; pero un borrado manual en SQL destruiría la trazabilidad.

### H. Restricciones y decisiones de diseño

**Índices (no PK):**

| Índice | Único | Columnas | Filtro | Incluye |
|---|---|---|---|---|
| `idx_vuelos_aeronave_id` | no | id_aeronaves | — | — |
| `idx_vuelos_cancelado_por_usuario_id` | no | id_usuario_cancelador | — | — |
| `idx_vuelos_comandante_usuario_id` | no | id_usuario_comandante | — | — |
| `idx_vuelos_creado_por_usuario_id` | no | id_usuario_creador | — | — |
| `idx_vuelos_destino_id` | no | id_aeropuerto_destino | — | — |
| `idx_vuelos_estado_vuelo_id` | no | id_estados_vuelo | — | — |
| `idx_vuelos_id_aeronaves` | no | id_aeronaves | — | — |
| `idx_vuelos_id_aeropuerto_destino` | no | id_aeropuerto_destino | — | — |
| `idx_vuelos_id_aeropuerto_origen` | no | id_aeropuerto_origen | — | — |
| `idx_vuelos_id_estados_vuelo` | no | id_estados_vuelo | — | — |
| `idx_vuelos_id_motivos_cancelacion` | no | id_motivos_cancelacion | — | — |
| `idx_vuelos_id_tipos_vuelo` | no | id_tipos_vuelo | — | — |
| `idx_vuelos_id_usuario_cancelador` | no | id_usuario_cancelador | — | — |
| `idx_vuelos_id_usuario_comandante` | no | id_usuario_comandante | — | — |
| `idx_vuelos_id_usuario_creador` | no | id_usuario_creador | — | — |
| `idx_vuelos_motivo_cancelacion_id` | no | id_motivos_cancelacion | — | — |
| `idx_vuelos_origen_id` | no | id_aeropuerto_origen | — | — |
| `idx_vuelos_tipo_vuelo_id` | no | id_tipos_vuelo | — | — |
| `uq_vuelos_2` | sí | codigo_vuelo | — | — |

**Restricciones CHECK:** 

- `ck_vuelos_1378103950`: `(fecha_planificada_salida IS NULL OR fecha_planificada_llegada IS NULL OR fecha_planificada_llegada>fecha_planificada_salida)`
- `ck_vuelos_1394104007`: `(fecha_salida_real IS NULL OR fecha_llegada_real IS NULL OR fecha_llegada_real>fecha_salida_real)`
- `ck_vuelos_2021582240`: `(id_aeropuerto_origen IS NULL OR id_aeropuerto_destino IS NULL OR id_aeropuerto_origen<>id_aeropuerto_destino)`

**Triggers:** `trg_vuelos_validar_cierre`, `trg_vuelos_validar_ciclo_vida`, `trg_vuelos_coherencia_sanitaria`

**DEFAULT / IDENTITY / nulabilidad:** ver la ficha de cada columna en la sección C (los DEFAULT figuran en «Validaciones»).

- **Triggers (tres):** `trg_vuelos_validar_ciclo_vida` (coherencia de la cancelación: si el estado es CANCELADO exige fecha, actor y motivo válido —con texto sólo si el motivo es OTRO—; si no, esos campos deben ser NULL; y prohíbe cancelar desde EN_CURSO/FINALIZADO/COMPLETADO); `trg_vuelos_validar_cierre` (transiciones terminales: COMPLETADO y CANCELADO no cambian; EN_CURSO exige venir de PLANIFICADO con salida real; FINALIZADO desde EN_CURSO con llegada real; COMPLETADO desde FINALIZADO con obligación e informe aprobados); `trg_vuelos_coherencia_sanitaria` (un vuelo sanitario sólo avanza con la solicitud APROBADA y sólo está CANCELADO con la solicitud CANCELADA). Evitan que un UPDATE directo o un error de código deje un ciclo de vida imposible.
- **CHECK de horarios:** la llegada planificada es posterior a la salida; la llegada real posterior a la salida real; origen ≠ destino.
- **`uq_vuelos_2` sobre `codigo_vuelo`:** el código legible no se repite.
- **Aislamiento:** crear/replanificar vuelos operativos y asignar recursos usan SERIALIZABLE y bloqueo de la fila (`flights.lockById`) para que dos operadores no comprometan la misma aeronave o tripulación.
- **Observación:** hay índices duplicados sobre las mismas columnas (p. ej. `idx_vuelos_aeronave_id` e `idx_vuelos_id_aeronaves`); son restos de los renombres V8/V27 (ver hallazgos).

### I. Evidencia de implementación

- [`V1 (creación de flights)`](../../backend-java/src/main/resources/db/migration/V1__init_sanitary_flights_schema.sql#L124)
- [`V23 (separación sanitario/operativo)`](../../backend-java/src/main/resources/db/migration/V23__separar_vuelos_sanitarios_y_operativos.sql#L64)
- [`V43 (trigger de cierre vigente)`](../../backend-java/src/main/resources/db/migration/V43__informes_historicos_adjuntos_y_responsable_cierre.sql#L112)
- [`V44 (coherencia sanitaria)`](../../backend-java/src/main/resources/db/migration/V44__solicitudes_negociacion_y_cancelacion.sql#L55)
- [`Entidad Flight`](../../backend-java/src/main/java/com/vuelossanitarios/backend/domain/flight/Flight.java#L12)
- [`FlightService.create`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/FlightService.java#L24)
- [`FlightService.createOperational`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/FlightService.java#L32)
- [`FlightService.assign`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/FlightService.java#L154)
- [`FlightService.start`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/FlightService.java#L185)
- [`FlightService.finish`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/FlightService.java#L205)
- [`FlightService.cancel`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/FlightService.java#L207)
- [`Controlador`](../../backend-java/src/main/java/com/vuelossanitarios/backend/api/FlightController.java#L18)
- [`Pantalla DTS`](../../frontend-react/src/main.jsx#L175)
- [`Acciones de ciclo de vida (UI)`](../../frontend-react/src/closure.jsx#L254)
- [`Prueba: OperationalFlightServiceTest`](../../backend-java/src/test/java/com/vuelossanitarios/backend/service/OperationalFlightServiceTest.java#L19)
- [`Prueba: RequestNegotiationServiceTest`](../../backend-java/src/test/java/com/vuelossanitarios/backend/service/RequestNegotiationServiceTest.java#L21)
- [`Prueba: FlightClosureServiceTest`](../../backend-java/src/test/java/com/vuelossanitarios/backend/service/FlightClosureServiceTest.java#L20)

---

## 12. Tabla `vuelos_sanitarios`

### A. Identificación de la tabla

| Atributo | Detalle |
|---|---|
| Nombre exacto y esquema | `dbo.vuelos_sanitarios` (esquema `dbo`) |
| Módulo funcional | 2. Solicitudes y vuelos |
| Tipo de tabla | Extensión 1:0..1 de vuelos — solicitud sanitaria del DTS |
| Migración que la creó | V23 |
| Migraciones posteriores que modificaron su estructura | V24/V27/V28 (BIGINT y nombres), V44 (estado CANCELADO y máquina de estados en SQL) |
| Estado actual en el esquema | Vigente — 17 columnas, PK `id_vuelos_sanitarios`, 8 FK salientes, 1 FK entrantes, 1 índice(s) único(s), 1 CHECK, 1 trigger(s) (verificado contra `sys.*` de la base E2E en Flyway V62) |
| Tablas relacionadas | vuelos, pacientes, usuarios, prioridades_vuelo, localidades, estados_solicitud_sanitaria, contactos_coordinacion_traslado |

### B. Funcionalidad y justificación

Contiene todo lo que **sólo existe en un traslado de paciente**: quién es el paciente, qué DTS lo solicitó, para cuándo, con qué prioridad y urgencia, entre qué localidades, y cómo avanza **la solicitud** (SOLICITADO → PENDIENTE_RESPUESTA_DTS → APROBADO / RECHAZADO / CANCELADO). La solicitud tiene su propio ciclo, distinto del estado operativo del vuelo.

Por ejemplo, un rechazo de Operaciones es un estado de la *solicitud* (nunca hubo vuelo); una cancelación posterior a la aprobación afecta a ambos.

**Por qué es una tabla independiente.** V23: la solicitud sanitaria es una extensión, no una columna más del vuelo, para que los vuelos no sanitarios no arrastren campos de paciente. Sus identificadores: PK propia `id_vuelos_sanitarios` y FK única `id_vuelos` (relación 1:0..1 con `vuelos`).

**Qué dejaría de funcionar sin ella.** No habría solicitudes de DTS, ni negociación de horario sobre un pedido, ni extrema urgencia, ni vinculación vuelo-paciente.

### C. Descripción campo por campo

#### `fecha_solicitada`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_solicitada` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Fecha y hora para la que el DTS pide el traslado. |
| Justificación | Es el horario propuesto inicial de la negociación; no se reutiliza como horario final (V20: «no se reutiliza fecha_solicitada ni se sobrescribe el historial»). |
| Contenido | Fecha y hora civil de la zona de negocio. |
| Origen | Formulario del DTS. |
| Momento inicial | En el INSERT. |
| Modificación | Nunca cambia. |
| Validaciones | NOT NULL; no en el pasado; si no es extrema urgencia, desde pasado mañana. |

#### `extrema_urgencia`

| Atributo | Detalle |
|---|---|
| Nombre | `extrema_urgencia` |
| Tipo de dato | `bit` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Indica que el traslado debe ocurrir hoy/mañana con un plazo límite. |
| Justificación | Habilita solicitar vuelos con menos de 48 h y prioriza la atención de Operaciones. |
| Contenido | 0/1. |
| Origen | Formulario (casilla de extrema urgencia). |
| Momento inicial | En el INSERT (DEFAULT 0). |
| Modificación | No cambia. |
| Validaciones | CHECK `ck_vuelos_sanitarios_urgencia`; DEFAULT 0; CHECK de coherencia con justificación y límite. |

#### `justificacion_extrema_urgencia`

| Atributo | Detalle |
|---|---|
| Nombre | `justificacion_extrema_urgencia` |
| Tipo de dato | `nvarchar(max)` |
| Nulabilidad | **Permite NULL.** NULL en toda solicitud que no es de extrema urgencia (lo habitual). |
| Función | Motivo por el cual el traslado es de extrema urgencia. |
| Justificación | Control del uso excepcional de la urgencia. |
| Contenido | Texto de hasta 10 000 caracteres. |
| Origen | Formulario. |
| Momento inicial | En el INSERT, sólo si hay extrema urgencia. |
| Modificación | No cambia. |
| Validaciones | CHECK `ck_vuelos_sanitarios_urgencia`; CHECK: obligatorio si hay extrema urgencia; NULL si no. |

#### `fecha_limite_traslado`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_limite_traslado` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **Permite NULL.** NULL si no es extrema urgencia. |
| Función | Horario máximo aceptable para el traslado urgente. |
| Justificación | Operaciones no puede proponer un horario posterior a este límite. |
| Contenido | Fecha y hora. |
| Origen | Formulario. |
| Momento inicial | En el INSERT, sólo con urgencia. |
| Modificación | No cambia. |
| Validaciones | CHECK `ck_vuelos_sanitarios_urgencia`; CHECK de coherencia; ≥ fecha solicitada (servicio). |

#### `origen_solicitado_legacy`

| Atributo | Detalle |
|---|---|
| Nombre | `origen_solicitado_legacy` |
| Tipo de dato | `nvarchar(100)` |
| Nulabilidad | **Permite NULL.** Columna heredada sin escritura por la aplicación; permanece NULL en solicitudes nuevas. Candidata a retirarse cuando se descarte el histórico. |
| Función | Texto libre de la ciudad de origen del esquema anterior. |
| Justificación | Conservar lo ingresado antes de existir el catálogo de localidades. |
| Contenido | Texto de hasta 100 caracteres (sólo datos migrados). |
| Origen | Migración V23 desde V5. |
| Momento inicial | En la migración. |
| Modificación | Nadie lo escribe ya. |
| Validaciones | — |

#### `destino_solicitado_legacy`

| Atributo | Detalle |
|---|---|
| Nombre | `destino_solicitado_legacy` |
| Tipo de dato | `nvarchar(100)` |
| Nulabilidad | **Permite NULL.** Columna heredada sin escritura por la aplicación. |
| Función | Texto libre de la ciudad de destino del esquema anterior. |
| Justificación | Idem origen. |
| Contenido | Texto (sólo migrados). |
| Origen | Migración V23. |
| Momento inicial | En la migración. |
| Modificación | Nadie lo escribe ya. |
| Validaciones | — |

#### `fecha_evaluacion`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_evaluacion` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **Permite NULL.** NULL mientras Operaciones no respondió. Lo completa el operador que aprueba, contrapropone o rechaza. No se completa si el DTS cancela antes. |
| Función | Momento en que Operaciones evaluó la solicitud. |
| Justificación | Registra cuándo respondió Operaciones (aprobación, contrapropuesta o rechazo). |
| Contenido | Fecha y hora. |
| Origen | `FlightService` al evaluar. |
| Momento inicial | NULL. |
| Modificación | Se completa y se actualiza en cada respuesta de Operaciones. |
| Validaciones | — |

#### `motivo_rechazo`

| Atributo | Detalle |
|---|---|
| Nombre | `motivo_rechazo` |
| Tipo de dato | `nvarchar(max)` |
| Nulabilidad | **Permite NULL.** NULL en toda solicitud no rechazada. |
| Función | Texto del motivo del rechazo (nombre del motivo de catálogo o texto si OTRO). |
| Justificación | Informa al DTS y deja constancia del rechazo definitivo. |
| Contenido | Texto. |
| Origen | Operaciones (motivo de la lista de 23). |
| Momento inicial | NULL. |
| Modificación | Sólo al rechazar directamente. |
| Validaciones | Trigger: obligatorio no vacío si pasa a RECHAZADO. |

#### `id_vuelos`

| Atributo | Detalle |
|---|---|
| Nombre | `id_vuelos` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Vuelo al que extiende. |
| Justificación | Une la solicitud con el hecho operativo. |
| Contenido | Identificador de `vuelos`. |
| Origen | Backend (vuelo recién creado). |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `vuelos.id_vuelos` (borrado: **CASCADE**); Índice único `uq_vuelos_sanitarios_id_vuelos`; NOT NULL, FK con CASCADE, único. |

#### `id_pacientes`

| Atributo | Detalle |
|---|---|
| Nombre | `id_pacientes` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Paciente trasladado. |
| Justificación | Identifica a quién se traslada (a través de `personas`). |
| Contenido | Identificador de `pacientes`. |
| Origen | Formulario (búsqueda o alta). |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `pacientes.id_pacientes` (borrado: NO ACTION); NOT NULL, FK. |

#### `id_usuario_solicitante`

| Atributo | Detalle |
|---|---|
| Nombre | `id_usuario_solicitante` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | DTS que hizo la solicitud. |
| Justificación | Sólo ese DTS puede responder la contrapropuesta y cancelar su pedido. |
| Contenido | Identificador de `usuarios`. |
| Origen | Usuario autenticado. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `usuarios.id_usuarios` (borrado: NO ACTION); NOT NULL, FK. |

#### `id_prioridades_vuelo`

| Atributo | Detalle |
|---|---|
| Nombre | `id_prioridades_vuelo` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** Admite NULL por la historia (V5 la agregó como opcional), aunque el formulario actual siempre la informa. |
| Función | Prioridad operativa declarada. |
| Justificación | Ordena la atención de Operaciones (no es una clasificación clínica). |
| Contenido | Identificador de `prioridades_vuelo`. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `prioridades_vuelo.id_prioridades_vuelo` (borrado: NO ACTION); FK; la API exige un código válido. |

#### `id_localidad_origen`

| Atributo | Detalle |
|---|---|
| Nombre | `id_localidad_origen` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** Admite NULL por los datos migrados sin equivalencia oficial; el alta actual siempre la informa. |
| Función | Localidad de origen del paciente. |
| Justificación | Define la provincia que se usa para exigir que aeronave y comandante estén allí. |
| Contenido | Identificador de `localidades`. |
| Origen | Formulario (selector de localidad). |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `localidades.id_localidades` (borrado: NO ACTION); FK; localidad activa y ≠ destino (servicio). |

#### `id_localidad_destino`

| Atributo | Detalle |
|---|---|
| Nombre | `id_localidad_destino` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** Idem origen. |
| Función | Localidad de destino del traslado. |
| Justificación | Define la provincia de destino de los aeropuertos permitidos. |
| Contenido | Identificador de `localidades`. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `localidades.id_localidades` (borrado: NO ACTION); FK; ≠ origen. |

#### `id_estados_solicitud_sanitaria`

| Atributo | Detalle |
|---|---|
| Nombre | `id_estados_solicitud_sanitaria` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Estado de la solicitud. |
| Justificación | Gobierna las acciones de DTS y Operaciones. |
| Contenido | SOLICITADO, PENDIENTE_RESPUESTA_DTS, APROBADO, RECHAZADO o CANCELADO. |
| Origen | Backend. |
| Momento inicial | SOLICITADO. |
| Modificación | Ver ciclo de vida. |
| Validaciones | FOREIGN KEY → `estados_solicitud_sanitaria.id_estados_solicitud_sanitaria` (borrado: NO ACTION); NOT NULL, FK; trigger de transiciones. |

#### `id_usuario_evaluador`

| Atributo | Detalle |
|---|---|
| Nombre | `id_usuario_evaluador` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** NULL hasta la primera respuesta de Operaciones. |
| Función | Operador de Operaciones que evaluó la solicitud. |
| Justificación | Responsabilidad de la decisión. |
| Contenido | Identificador de `usuarios`. |
| Origen | Usuario autenticado de Operaciones. |
| Momento inicial | NULL. |
| Modificación | En cada evaluación (aprobar, contraproponer, rechazar). |
| Validaciones | FOREIGN KEY → `usuarios.id_usuarios` (borrado: NO ACTION); FK. |

#### `id_vuelos_sanitarios`

| Atributo | Detalle |
|---|---|
| Nombre | `id_vuelos_sanitarios` |
| Tipo de dato | `bigint` — IDENTITY(1,1) |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Clave primaria de la tabla: identifica de forma única cada fila y es el valor que otras tablas, la API y la auditoría usan para referirse a ella. |
| Justificación | Un identificador técnico numérico, estable y sin significado de negocio evita depender de datos que pueden cambiar (nombres, códigos) y hace eficientes los JOIN y las claves foráneas (decisión V24/V27: «toda tabla de aplicación tiene su propio id_<tabla> BIGINT IDENTITY»). |
| Contenido | Número entero positivo correlativo (1, 2, 3…). No se muestra; la API de solicitudes se identifica por el id del vuelo. |
| Origen | SQL Server, columna IDENTITY(1,1): se asigna en el propio INSERT. Hibernate lo declara `@GeneratedValue(strategy = IDENTITY)` y lo lee de vuelta tras insertar. |
| Momento inicial | En el INSERT; no existe fila sin identificador. |
| Modificación | Nunca cambia (inmutable; JPA lo declara `updatable=false`). |
| Validaciones | PRIMARY KEY; PRIMARY KEY (unicidad y NOT NULL); no se reutiliza al borrar filas. |

### D. Momento en que se crea un registro

**Escenario 1: El DTS crea la solicitud**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | DTS |
| Pantalla / componente y acción | «Nueva solicitud» → **Crear solicitud** (`main.jsx:381`). |
| Datos que aporta el usuario | Paciente, localidades de origen/destino, prioridad (BAJA/MEDIA/ALTA/CRITICA), fecha y hora solicitadas, extrema urgencia con justificación y límite. |
| Endpoint | `POST /api/flights` o `/with-patient` |
| Servicio | `FlightService.create` |
| Validaciones y condiciones | Ver «vuelos»; además localidades distintas, prioridad válida. |
| Mecanismo que crea el registro | `sanitaryFlights.save(s)` justo después de `flights.save(f)`. |
| Columnas completadas y de dónde sale cada valor | `id_vuelos` ← vuelo recién insertado; `id_pacientes` ← paciente; `id_usuario_solicitante` ← DTS; `fecha_solicitada` ← formulario; `id_prioridades_vuelo` ← prioridad; `extrema_urgencia` ← formulario; `justificacion_extrema_urgencia`/`fecha_limite_traslado` ← formulario sólo si hay extrema urgencia (si no, NULL); `id_localidad_origen`/`id_localidad_destino` ← localidades; `id_estados_solicitud_sanitaria` ← SOLICITADO; `id_vuelos_sanitarios` ← IDENTITY. |
| Columnas que quedan NULL o con valor predeterminado | `origen_solicitado_legacy`, `destino_solicitado_legacy`, `fecha_evaluacion`, `id_usuario_evaluador`, `motivo_rechazo`; justificación y límite si no hay urgencia. |
| Otros registros creados en la misma operación | Vuelo, datos médicos, negociación, contactos, auditoría, notificaciones. |
| Si la operación falla / atomicidad | Atómico con el alta del vuelo. |

**Escenario 2: Migración**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | Flyway V23 |
| Pantalla / componente y acción | — |
| Datos que aporta el usuario | — |
| Endpoint | — |
| Servicio | V23 copió los datos de solicitud de los vuelos existentes |
| Validaciones y condiciones | — |
| Mecanismo que crea el registro | INSERT…SELECT. |
| Columnas completadas y de dónde sale cada valor | — |
| Columnas que quedan NULL o con valor predeterminado | — |
| Otros registros creados en la misma operación | — |
| Si la operación falla / atomicidad | — |

### E. Ejemplo funcional completo

**Situación:** la solicitud de Juan Díaz (vuelo 900).

| id_vuelos_sanitarios | id_vuelos | id_pacientes | id_usuario_solicitante | fecha_solicitada | id_prioridades_vuelo | extrema_urgencia | origen→destino (localidades) | estado_solicitud | evaluador | fecha_evaluacion | motivo_rechazo |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 700 | 900 | 40 | 12 | 2026-11-04 09:00 | ALTA | 0 | San Miguel de Tucumán → Salta | SOLICITADO | NULL | NULL | NULL |

- **Caso A — aprobación:** Operaciones pulsa *Aprobar horario*: estado → APROBADO, `id_usuario_evaluador` y `fecha_evaluacion` se completan.
- **Caso B — contrapropuesta:** Operaciones propone otro horario: estado → PENDIENTE_RESPUESTA_DTS (y evaluador/fecha). El DTS **acepta** (→ APROBADO) o **rechaza** y la solicitud queda CANCELADA.
- **Caso C — rechazo directo:** estado → RECHAZADO y `motivo_rechazo` = nombre del motivo (o texto si «OTRO»). El rechazo es definitivo.
- **Caso D — cancelación** posterior a la aprobación: estado → CANCELADO.

### F. Ciclo de vida del registro

| Transición | Acción | Actor | Campos | Validaciones |
|---|---|---|---|---|
| (nueva) → SOLICITADO | Crear solicitud | DTS | INSERT | ver D |
| SOLICITADO → APROBADO | «Aprobar» | Operaciones | estado, `id_usuario_evaluador`, `fecha_evaluacion` | horario solicitado aún en el futuro |
| SOLICITADO / PENDIENTE_RESPUESTA_DTS → PENDIENTE_RESPUESTA_DTS | «Proponer otro horario» | Operaciones | estado, evaluador, fecha | propuesta distinta de la solicitada y ≤ límite de urgencia; una nueva reemplaza a la anterior |
| PENDIENTE_RESPUESTA_DTS → APROBADO | Aceptar contrapropuesta | DTS solicitante | estado | propuesta vigente y aún futura |
| PENDIENTE_RESPUESTA_DTS → CANCELADO | Rechazar contrapropuesta | DTS solicitante | estado | con motivo de cancelación |
| SOLICITADO → RECHAZADO | «Rechazar solicitud» | Operaciones | estado, evaluador, fecha, `motivo_rechazo` | motivo obligatorio |
| SOLICITADO / PENDIENTE_RESPUESTA_DTS / APROBADO → CANCELADO | «Cancelar vuelo» | Operaciones / DTS dueño | estado | no si ya está EN_CURSO o terminal; el vuelo pasa a CANCELADO |
| RECHAZADO, CANCELADO | terminales | — | — | trigger `trg_vuelos_sanitarios_validar_estado` |

### G. Relaciones con otras tablas

**Clave primaria:** `id_vuelos_sanitarios`.

**Claves foráneas salientes (tabla hija → padre):**

| Columna | Referencia | Borrado | Obligatoria |
|---|---|---|---|
| `id_estados_solicitud_sanitaria` | `estados_solicitud_sanitaria.id_estados_solicitud_sanitaria` (`fk_vuelos_sanitarios_id_estados_solicitud_sanitaria`) | NO ACTION | Obligatoria |
| `id_localidad_destino` | `localidades.id_localidades` (`fk_vuelos_sanitarios_id_localidad_destino`) | NO ACTION | Opcional (NULL) |
| `id_localidad_origen` | `localidades.id_localidades` (`fk_vuelos_sanitarios_id_localidad_origen`) | NO ACTION | Opcional (NULL) |
| `id_pacientes` | `pacientes.id_pacientes` (`fk_vuelos_sanitarios_id_pacientes`) | NO ACTION | Obligatoria |
| `id_prioridades_vuelo` | `prioridades_vuelo.id_prioridades_vuelo` (`fk_vuelos_sanitarios_id_prioridades_vuelo`) | NO ACTION | Opcional (NULL) |
| `id_usuario_evaluador` | `usuarios.id_usuarios` (`fk_vuelos_sanitarios_id_usuario_evaluador`) | NO ACTION | Opcional (NULL) |
| `id_usuario_solicitante` | `usuarios.id_usuarios` (`fk_vuelos_sanitarios_id_usuario_solicitante`) | NO ACTION | Obligatoria |
| `id_vuelos` | `vuelos.id_vuelos` (`fk_vuelos_sanitarios_id_vuelos`) | **CASCADE** | Obligatoria |

**Claves foráneas entrantes (tablas hijas):** `contactos_coordinacion_traslado`(id_vuelos).

`vuelos_sanitarios` N—1 `pacientes` (un paciente, varias solicitudes), N—1 `usuarios` (solicitante, evaluador), N—1 `prioridades_vuelo` (opcional), N—1 `localidades` ×2 (origen, destino), N—1 `estados_solicitud_sanitaria` y 1—1 `vuelos` (CASCADE: si desaparece el vuelo desaparece la extensión). Es **padre** de `contactos_coordinacion_traslado` (la FK apunta a `id_vuelos`, por lo que la solicitud sanitaria es la dueña de los contactos de ese traslado).

### H. Restricciones y decisiones de diseño

**Índices (no PK):**

| Índice | Único | Columnas | Filtro | Incluye |
|---|---|---|---|---|
| `idx_vuelos_sanitarios_estado_solicitud_id` | no | id_estados_solicitud_sanitaria | — | — |
| `idx_vuelos_sanitarios_evaluado_por_usuario_id` | no | id_usuario_evaluador | — | — |
| `idx_vuelos_sanitarios_id_estados_solicitud_sanitaria` | no | id_estados_solicitud_sanitaria | — | — |
| `idx_vuelos_sanitarios_id_localidad_destino` | no | id_localidad_destino | — | — |
| `idx_vuelos_sanitarios_id_localidad_origen` | no | id_localidad_origen | — | — |
| `idx_vuelos_sanitarios_id_pacientes` | no | id_pacientes | — | — |
| `idx_vuelos_sanitarios_id_prioridades_vuelo` | no | id_prioridades_vuelo | — | — |
| `idx_vuelos_sanitarios_id_usuario_evaluador` | no | id_usuario_evaluador | — | — |
| `idx_vuelos_sanitarios_id_usuario_solicitante` | no | id_usuario_solicitante | — | — |
| `idx_vuelos_sanitarios_id_vuelos` | no | id_vuelos | — | — |
| `idx_vuelos_sanitarios_localidad_destino_id` | no | id_localidad_destino | — | — |
| `idx_vuelos_sanitarios_localidad_origen_id` | no | id_localidad_origen | — | — |
| `idx_vuelos_sanitarios_paciente_id` | no | id_pacientes | — | — |
| `idx_vuelos_sanitarios_prioridad_id` | no | id_prioridades_vuelo | — | — |
| `idx_vuelos_sanitarios_solicitado_por_usuario_id` | no | id_usuario_solicitante | — | — |
| `idx_vuelos_sanitarios_vuelo_id` | no | id_vuelos | — | — |
| `uq_vuelos_sanitarios_id_vuelos` | sí | id_vuelos | — | — |

**Restricciones CHECK:** 

- `ck_vuelos_sanitarios_urgencia`: `(extrema_urgencia=(0) AND justificacion_extrema_urgencia IS NULL AND fecha_limite_traslado IS NULL OR extrema_urgencia=(1) AND nullif(ltrim(rtrim(justificacion_extrema_urgencia)),N'') IS NOT NULL AND fecha_limite_traslado IS NOT NULL)`

**Triggers:** `trg_vuelos_sanitarios_validar_estado`

**DEFAULT / IDENTITY / nulabilidad:** ver la ficha de cada columna en la sección C (los DEFAULT figuran en «Validaciones»).

- **`uq_vuelos_sanitarios_id_vuelos`:** garantiza que un vuelo tiene como máximo una solicitud.
- **`ck_vuelos_sanitarios_urgencia`:** si no es extrema urgencia, justificación y límite son NULL; si lo es, ambos son obligatorios. Evita datos de urgencia sin sentido.
- **Trigger `trg_vuelos_sanitarios_validar_estado` (V44):** máquina de estados en SQL: desde RECHAZADO y CANCELADO no se sale; SOLICITADO puede ir a APROBADO/RECHAZADO/PENDIENTE_RESPUESTA_DTS/CANCELADO; PENDIENTE_RESPUESTA_DTS a APROBADO/CANCELADO/SOLICITADO; APROBADO sólo a CANCELADO; no se cancela con el vuelo EN_CURSO o posterior; RECHAZADO exige motivo.
- **Orden de escritura:** el backend persiste primero el estado de la solicitud y luego el del vuelo, porque el trigger de `vuelos` lo exige.
- **Columnas legado:** `origen_solicitado_legacy` y `destino_solicitado_legacy` conservan el texto libre de V5; ningún código actual las escribe.

### I. Evidencia de implementación

- [`V23 (creación)`](../../backend-java/src/main/resources/db/migration/V23__separar_vuelos_sanitarios_y_operativos.sql#L64)
- [`V44 (máquina de estados)`](../../backend-java/src/main/resources/db/migration/V44__solicitudes_negociacion_y_cancelacion.sql#L31)
- [`Entidad SanitaryFlight`](../../backend-java/src/main/java/com/vuelossanitarios/backend/domain/flight/SanitaryFlight.java#L10)
- [`FlightService.create`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/FlightService.java#L24)
- [`FlightService.acceptRequestedSchedule`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/FlightService.java#L42)
- [`FlightService.counterproposal`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/FlightService.java#L50)
- [`FlightService.rejectDirectly`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/FlightService.java#L80)
- [`Política de urgencia`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/FlightUrgencyPolicy.java#L27)
- [`Evaluación (UI Operaciones)`](../../frontend-react/src/main.jsx#L413)
- [`Respuestas del DTS (UI)`](../../frontend-react/src/main.jsx#L402)
- [`Prueba: RequestNegotiationServiceTest`](../../backend-java/src/test/java/com/vuelossanitarios/backend/service/RequestNegotiationServiceTest.java#L21)
- [`Prueba: FlightUrgencyPolicyTest`](../../backend-java/src/test/java/com/vuelossanitarios/backend/service/FlightUrgencyPolicyTest.java#L13)

---

## 13. Tabla `informacion_medica_vuelo`

### A. Identificación de la tabla

| Atributo | Detalle |
|---|---|
| Nombre exacto y esquema | `dbo.informacion_medica_vuelo` (esquema `dbo`) |
| Módulo funcional | 2. Solicitudes y vuelos |
| Tipo de tabla | Dependiente de vuelos — datos clínicos por traslado |
| Migración que la creó | V4 (como `flight_medical_info`) |
| Migraciones posteriores que modificaron su estructura | V8 (renombre), V24/V27 (BIGINT), V28 (`observaciones_medicas`) |
| Estado actual en el esquema | Vigente — 8 columnas, PK `id_informacion_medica_vuelo`, 1 FK salientes, 0 FK entrantes, 1 índice(s) único(s), 0 CHECK, 0 trigger(s) (verificado contra `sys.*` de la base E2E en Flyway V62) |
| Tablas relacionadas | vuelos |

### B. Funcionalidad y justificación

Guarda el **estado clínico del paciente para ese traslado**: diagnóstico, condición médica, si requiere equipamiento especial y observaciones. Es el dato que Operaciones usa para elegir una aeronave equipada (el servicio de aeronaves impide quitar el equipamiento médico a una aeronave asignada a un vuelo que lo requiere).

**Por qué es una tabla independiente.** El estado clínico cambia entre traslados del mismo paciente; V4 lo movió desde el paciente al vuelo («copia el último estado clínico conocido a cada vuelo»). También restringe el alcance de datos sensibles al vuelo concreto.

**Qué dejaría de funcionar sin ella.** Operaciones no tendría el diagnóstico ni la necesidad de equipamiento al evaluar el traslado; la validación de equipamiento de aeronaves fallaría.

### C. Descripción campo por campo

#### `diagnostico`

| Atributo | Detalle |
|---|---|
| Nombre | `diagnostico` |
| Tipo de dato | `nvarchar(max)` |
| Nulabilidad | **Permite NULL.** La columna admite NULL pero el servicio lo exige: una carga manual en SQL podría dejarlo vacío. |
| Función | Diagnóstico o cuadro clínico relevante para el vuelo. |
| Justificación | Permite evaluar la factibilidad y el equipo médico necesario. |
| Contenido | Texto de hasta 10 000 caracteres. |
| Origen | Formulario del DTS. |
| Momento inicial | En el INSERT. |
| Modificación | No se modifica. |
| Validaciones | Obligatorio no vacío en el servicio; la columna admite NULL. |

#### `condicion_medica`

| Atributo | Detalle |
|---|---|
| Nombre | `condicion_medica` |
| Tipo de dato | `nvarchar(100)` |
| Nulabilidad | **Permite NULL.** Idem diagnóstico. |
| Función | Categoría rápida del estado (crítico, estable…). |
| Justificación | Resumen para priorizar sin leer el diagnóstico completo. |
| Contenido | Texto de hasta 100 caracteres. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | No se modifica. |
| Validaciones | Obligatorio en el servicio. |

#### `requiere_equipamiento_especial`

| Atributo | Detalle |
|---|---|
| Nombre | `requiere_equipamiento_especial` |
| Tipo de dato | `bit` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Indica si el paciente necesita equipamiento especial a bordo. |
| Justificación | Impide asignar aeronaves sin equipamiento y proteger el que ya está comprometido. |
| Contenido | 0/1. |
| Origen | Formulario. |
| Momento inicial | En el INSERT (DEFAULT 0). |
| Modificación | No se modifica. |
| Validaciones | DEFAULT 0; DEFAULT 0. |

#### `observaciones_medicas`

| Atributo | Detalle |
|---|---|
| Nombre | `observaciones_medicas` |
| Tipo de dato | `nvarchar(max)` |
| Nulabilidad | **Permite NULL.** Opcional por diseño; permanece NULL si el DTS no agrega observaciones. |
| Función | Notas clínicas adicionales. |
| Justificación | Información complementaria para tripulación y Operaciones. |
| Contenido | Texto. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | No se modifica. |
| Validaciones | — |

#### `fecha_creacion`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_creacion` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Registra el instante en que el registro clínico se incorporó al sistema. |
| Justificación | Permite ordenar cronológicamente, reconstruir el historial y aportar trazabilidad sin depender de la auditoría. |
| Contenido | Fecha y hora (DATETIME2) de la inserción. |
| Origen | Automático: DEFAULT `SYSDATETIME()` de SQL Server o `@CreationTimestamp` de Hibernate (según la entidad); el usuario nunca ingresa esta fecha. |
| Momento inicial | En el INSERT. |
| Modificación | Inmutable: ningún flujo la actualiza (`updatable=false` en la entidad). |
| Validaciones | DEFAULT sysdatetime() |

#### `fecha_actualizacion`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_actualizacion` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Último cambio del registro. |
| Justificación | Previsto para detectar correcciones. |
| Contenido | Igual a la fecha de creación. |
| Origen | `@UpdateTimestamp`. |
| Momento inicial | En el INSERT. |
| Modificación | Sin flujo que la modifique. |
| Validaciones | DEFAULT sysdatetime(); — |

#### `id_informacion_medica_vuelo`

| Atributo | Detalle |
|---|---|
| Nombre | `id_informacion_medica_vuelo` |
| Tipo de dato | `bigint` — IDENTITY(1,1) |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Clave primaria de la tabla: identifica de forma única cada fila y es el valor que otras tablas, la API y la auditoría usan para referirse a ella. |
| Justificación | Un identificador técnico numérico, estable y sin significado de negocio evita depender de datos que pueden cambiar (nombres, códigos) y hace eficientes los JOIN y las claves foráneas (decisión V24/V27: «toda tabla de aplicación tiene su propio id_<tabla> BIGINT IDENTITY»). |
| Contenido | Número entero positivo correlativo (1, 2, 3…). No lo ingresa el usuario. |
| Origen | SQL Server, columna IDENTITY(1,1): se asigna en el propio INSERT. Hibernate lo declara `@GeneratedValue(strategy = IDENTITY)` y lo lee de vuelta tras insertar. |
| Momento inicial | En el INSERT; no existe fila sin identificador. |
| Modificación | Nunca cambia (inmutable; JPA lo declara `updatable=false`). |
| Validaciones | PRIMARY KEY; PRIMARY KEY (unicidad y NOT NULL); no se reutiliza al borrar filas. |

#### `id_vuelos`

| Atributo | Detalle |
|---|---|
| Nombre | `id_vuelos` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Vuelo al que pertenece el registro. |
| Justificación | El estado clínico es por traslado. |
| Contenido | Identificador de `vuelos`. |
| Origen | Backend. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `vuelos.id_vuelos` (borrado: **CASCADE**); Índice único `uq_informacion_medica_vuelo_2`; NOT NULL, FK CASCADE, único. |

### D. Momento en que se crea un registro

**Escenario 1: Alta de la solicitud sanitaria**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | DTS |
| Pantalla / componente y acción | «Nueva solicitud» → sección de datos médicos. |
| Datos que aporta el usuario | Diagnóstico, condición médica, requiere equipamiento especial, observaciones. |
| Endpoint | `POST /api/flights` / `/with-patient` |
| Servicio | `FlightService.create` |
| Validaciones y condiciones | Diagnóstico y condición médica obligatorios (`validateMedical`, 400 si faltan). |
| Mecanismo que crea el registro | `medical.save(info)`. |
| Columnas completadas y de dónde sale cada valor | `id_vuelos` ← vuelo; `diagnostico`, `condicion_medica`, `requiere_equipamiento_especial`, `observaciones_medicas` ← formulario; fechas ← Hibernate. |
| Columnas que quedan NULL o con valor predeterminado | `observaciones_medicas` si no se escribió. |
| Otros registros creados en la misma operación | Toda la solicitud. |
| Si la operación falla / atomicidad | Atómico con la solicitud. |

**Escenario 2: Migración**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | Flyway V4 |
| Pantalla / componente y acción | — |
| Datos que aporta el usuario | — |
| Endpoint | — |
| Servicio | V4 copió los datos clínicos del paciente a cada vuelo |
| Validaciones y condiciones | — |
| Mecanismo que crea el registro | INSERT…SELECT. |
| Columnas completadas y de dónde sale cada valor | — |
| Columnas que quedan NULL o con valor predeterminado | — |
| Otros registros creados en la misma operación | — |
| Si la operación falla / atomicidad | — |

### E. Ejemplo funcional completo

**Situación:** solicitud de Juan Díaz.

| id_informacion_medica_vuelo | id_vuelos | diagnostico | condicion_medica | requiere_equipamiento_especial | observaciones_medicas |
|---|---|---|---|---|---|
| 650 | 900 | (texto clínico ficticio) | Estable | 1 | Requiere oxígeno durante el vuelo |

Con `requiere_equipamiento_especial`=1, Operaciones ve que debe asignar una aeronave con `equipamiento_medico` informado. La fila no se vuelve a modificar.

### F. Ciclo de vida del registro

Se inserta una sola vez al crear la solicitud. **No existe endpoint que la actualice** (ni el DTS ni Operaciones pueden corregir el diagnóstico después) y nunca se elimina individualmente; desaparece sólo si el vuelo se borrara (CASCADE). `fecha_actualizacion` (con @UpdateTimestamp) permanece igual a la fecha de creación.

### G. Relaciones con otras tablas

**Clave primaria:** `id_informacion_medica_vuelo`.

**Claves foráneas salientes (tabla hija → padre):**

| Columna | Referencia | Borrado | Obligatoria |
|---|---|---|---|
| `id_vuelos` | `vuelos.id_vuelos` (`fk_informacion_medica_vuelo_id_vuelos`) | **CASCADE** | Obligatoria |

**Claves foráneas entrantes:** ninguna.

FK `id_vuelos` → `vuelos` (CASCADE, obligatoria, única: un registro médico por vuelo). Lo consulta `AircraftAdminService` al validar cambios de equipamiento y la vista del detalle del vuelo.

### H. Restricciones y decisiones de diseño

**Índices (no PK):**

| Índice | Único | Columnas | Filtro | Incluye |
|---|---|---|---|---|
| `idx_informacion_medica_vuelo_id_vuelos` | no | id_vuelos | — | — |
| `idx_informacion_medica_vuelo_vuelo_id` | no | id_vuelos | — | — |
| `uq_informacion_medica_vuelo_2` | sí | id_vuelos | — | — |

**Restricciones CHECK:** ninguna.

**Triggers:** ninguno.

**DEFAULT / IDENTITY / nulabilidad:** ver la ficha de cada columna en la sección C (los DEFAULT figuran en «Validaciones»).

- **Unicidad por vuelo (`uq_informacion_medica_vuelo_2`).**
- **Sin CHECK ni trigger:** la obligatoriedad del diagnóstico se valida sólo en el servicio, por lo que un INSERT directo podría dejar diagnóstico NULL (el esquema lo permite). Observación.
- **Datos sensibles:** el diagnóstico se muestra sólo en el detalle del vuelo a los roles autorizados (`FlightAuthorizationService`).

### I. Evidencia de implementación

- [`V4 (creación)`](../../backend-java/src/main/resources/db/migration/V4__normalize_identity_clinical_data_and_versioning.sql#L46)
- [`Entidad FlightMedicalInfo`](../../backend-java/src/main/java/com/vuelossanitarios/backend/domain/flight/FlightMedicalInfo.java#L9)
- [`Alta en FlightService.create`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/FlightService.java#L28)
- [`Validación`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/FlightService.java#L270)
- [`Uso en aeronaves`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/AircraftAdminService.java#L110)
- [`Prueba: AircraftAdministrationIntegrationTest`](../../backend-java/src/test/java/com/vuelossanitarios/backend/api/AircraftAdministrationIntegrationTest.java#L38)

---

## 14. Tabla `negociaciones_horario_vuelo`

### A. Identificación de la tabla

| Atributo | Detalle |
|---|---|
| Nombre exacto y esquema | `dbo.negociaciones_horario_vuelo` (esquema `dbo`) |
| Módulo funcional | 2. Solicitudes y vuelos |
| Tipo de tabla | Historial inmutable — acuerdos y desacuerdos de horario |
| Migración que la creó | V20 |
| Migraciones posteriores que modificaron su estructura | V23 (llegada propuesta, tipos del comandante), V24/V27/V29 (BIGINT, `tipo_negociacion`, `motivo_negociacion`), V44 (`id_negociacion_respondida`) |
| Estado actual en el esquema | Vigente — 9 columnas, PK `id_negociaciones_horario_vuelo`, 3 FK salientes, 1 FK entrantes, 1 índice(s) único(s), 1 CHECK, 0 trigger(s) (verificado contra `sys.*` de la base E2E en Flyway V62) |
| Tablas relacionadas | vuelos, usuarios |

### B. Funcionalidad y justificación

Registra, como una **cadena de hechos inmutables**, cada paso de la negociación del horario: la propuesta inicial del DTS, la aceptación o contrapropuesta de Operaciones, la respuesta del DTS y —en vuelos operativos— la aceptación, propuesta o rechazo del comandante y la respuesta de Operaciones.

Cada respuesta apunta a la propuesta que responde (`id_negociacion_respondida`); el índice único impide dos respuestas distintas a una misma propuesta, aun con operaciones concurrentes.

**Por qué es una tabla independiente.** V20: «La propuesta DTS y sus respuestas son hechos inmutables: no se reutiliza fecha_solicitada ni se sobrescribe el historial». Un historial append-only permite reconstruir quién propuso qué y cuándo, algo imposible con una sola columna de fecha.

**Qué dejaría de funcionar sin ella.** No se podría saber si una contrapropuesta sigue vigente ni se evitarían respuestas obsoletas o contradictorias; se perdería el historial de acuerdos.

### C. Descripción campo por campo

#### `tipo_negociacion`

| Atributo | Detalle |
|---|---|
| Nombre | `tipo_negociacion` |
| Tipo de dato | `nvarchar(40)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Clase del hecho registrado. |
| Justificación | Cada tipo tiene reglas y destinatarios propios; el tipo es el «verbo» del historial. |
| Contenido | Uno de los 11 valores del CHECK. |
| Origen | Backend, según la acción. |
| Momento inicial | En el INSERT. |
| Modificación | Nunca cambia. |
| Validaciones | CHECK `ck_negociaciones_horario_tipo`; CHECK `ck_negociaciones_horario_tipo`. |

#### `fecha_hora_propuesta`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_hora_propuesta` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **Permite NULL.** NULL en tipos que no proponen horario (rechazos y aceptaciones de asignación). |
| Función | Salida propuesta en ese paso. |
| Justificación | Es el dato negociado. |
| Contenido | Fecha y hora. |
| Origen | Formulario o fecha solicitada. |
| Momento inicial | En el INSERT. |
| Modificación | Nunca cambia. |
| Validaciones | — |

#### `motivo_negociacion`

| Atributo | Detalle |
|---|---|
| Nombre | `motivo_negociacion` |
| Tipo de dato | `nvarchar(max)` |
| Nulabilidad | **Permite NULL.** NULL en propuestas iniciales y aceptaciones. |
| Función | Explicación de una contrapropuesta, rechazo o propuesta del comandante. |
| Justificación | Evita decisiones sin explicación. |
| Contenido | Texto (a veces el nombre del motivo de cancelación). |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | Nunca cambia. |
| Validaciones | El servicio exige motivo en contrapropuesta/rechazo/propuesta (el CHECK de V20 ya no existe). |

#### `fecha_ocurrencia`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_ocurrencia` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Instante del hecho. |
| Justificación | Orden cronológico del historial. |
| Contenido | Fecha y hora (reloj de negocio). |
| Origen | Backend. |
| Momento inicial | En el INSERT. |
| Modificación | Nunca cambia. |
| Validaciones | DEFAULT sysdatetime(); — |

#### `fecha_hora_llegada_propuesta`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_hora_llegada_propuesta` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **Permite NULL.** NULL salvo COMANDANTE_PROPONE_HORARIO y CO_ACEPTA_PROPUESTA_COMANDANTE. |
| Función | Llegada propuesta por el comandante. |
| Justificación | El comandante propone un intervalo salida-llegada completo. |
| Contenido | Fecha y hora. |
| Origen | Formulario del comandante. |
| Momento inicial | En el INSERT. |
| Modificación | Nunca cambia. |
| Validaciones | El servicio exige llegada > salida. |

#### `id_negociaciones_horario_vuelo`

| Atributo | Detalle |
|---|---|
| Nombre | `id_negociaciones_horario_vuelo` |
| Tipo de dato | `bigint` — IDENTITY(1,1) |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Clave primaria de la tabla: identifica de forma única cada fila y es el valor que otras tablas, la API y la auditoría usan para referirse a ella. |
| Justificación | Un identificador técnico numérico, estable y sin significado de negocio evita depender de datos que pueden cambiar (nombres, códigos) y hace eficientes los JOIN y las claves foráneas (decisión V24/V27: «toda tabla de aplicación tiene su propio id_<tabla> BIGINT IDENTITY»). |
| Contenido | Número entero positivo correlativo (1, 2, 3…). No lo ingresa el usuario. |
| Origen | SQL Server, columna IDENTITY(1,1): se asigna en el propio INSERT. Hibernate lo declara `@GeneratedValue(strategy = IDENTITY)` y lo lee de vuelta tras insertar. |
| Momento inicial | En el INSERT; no existe fila sin identificador. |
| Modificación | Nunca cambia (inmutable; JPA lo declara `updatable=false`). |
| Validaciones | PRIMARY KEY; PRIMARY KEY (unicidad y NOT NULL); no se reutiliza al borrar filas. |

#### `id_vuelos`

| Atributo | Detalle |
|---|---|
| Nombre | `id_vuelos` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Vuelo negociado. |
| Justificación | Agrupa el historial por vuelo. |
| Contenido | Identificador de `vuelos`. |
| Origen | Backend. |
| Momento inicial | En el INSERT. |
| Modificación | Nunca cambia. |
| Validaciones | FOREIGN KEY → `vuelos.id_vuelos` (borrado: NO ACTION); NOT NULL, FK. |

#### `id_usuario_actor`

| Atributo | Detalle |
|---|---|
| Nombre | `id_usuario_actor` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** Opcional en el esquema (V20 lo permitía por datos migrados); el código actual siempre lo informa. |
| Función | Quién realizó el paso. |
| Justificación | Atribución del hecho. |
| Contenido | Identificador de `usuarios`. |
| Origen | Usuario autenticado. |
| Momento inicial | En el INSERT. |
| Modificación | Nunca cambia. |
| Validaciones | FOREIGN KEY → `usuarios.id_usuarios` (borrado: NO ACTION); FK. |

#### `id_negociacion_respondida`

| Atributo | Detalle |
|---|---|
| Nombre | `id_negociacion_respondida` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** NULL en propuestas iniciales (DTS_PROPUESTA, COMANDANTE_PROPONE_HORARIO sin previa) y en aceptaciones de asignación. |
| Función | Propuesta que esta fila responde o reemplaza. |
| Justificación | Permite deducir cuál propuesta sigue vigente y evitar respuestas obsoletas o dobles. |
| Contenido | Identificador de la propia tabla. |
| Origen | Backend. |
| Momento inicial | En el INSERT. |
| Modificación | Nunca cambia. |
| Validaciones | FOREIGN KEY → `negociaciones_horario_vuelo.id_negociaciones_horario_vuelo` (borrado: NO ACTION); Índice único `ux_negociaciones_horario_vuelo_respondida` filtrado `id_negociacion_respondida IS NOT NULL`; FK autorreferencia; índice único filtrado. |

### D. Momento en que se crea un registro

**Escenario 1: Propuesta inicial del DTS**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | DTS |
| Pantalla / componente y acción | «Crear solicitud». |
| Datos que aporta el usuario | Fecha y hora solicitada. |
| Endpoint | `POST /api/flights` |
| Servicio | `FlightService.create` → `negotiation(f,"DTS_PROPUESTA",…)` |
| Validaciones y condiciones | Las de la solicitud. |
| Mecanismo que crea el registro | `negotiations.saveAndFlush(n)`. |
| Columnas completadas y de dónde sale cada valor | `id_vuelos`; `tipo_negociacion`='DTS_PROPUESTA'; `fecha_hora_propuesta` ← fecha solicitada; `id_usuario_actor` ← DTS; `fecha_ocurrencia` ← reloj de negocio. |
| Columnas que quedan NULL o con valor predeterminado | `motivo_negociacion`, `fecha_hora_llegada_propuesta`, `id_negociacion_respondida`. |
| Otros registros creados en la misma operación | Toda la solicitud. |
| Si la operación falla / atomicidad | Atómico con la solicitud. |

**Escenario 2: Operaciones aprueba, contrapropone o rechaza**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | Operaciones / Centro de Operaciones |
| Pantalla / componente y acción | «Aprobar», «Proponer otro horario», «Rechazar solicitud» ([`RequestEvaluation`](../../frontend-react/src/main.jsx)). |
| Datos que aporta el usuario | Horario propuesto y motivo (en contrapropuesta y rechazo). |
| Endpoint | `POST /api/flights/{id}/schedule/accept`, `…/counterproposal`, `…/schedule/reject` (y `…/evaluation`) |
| Servicio | `FlightService.acceptRequestedSchedule`, `counterproposal`, `rejectDirectly` |
| Validaciones y condiciones | Estados de la solicitud; horario futuro; límite de urgencia; motivo obligatorio (CHECK). |
| Mecanismo que crea el registro | `negotiation(...)` con `saveAndFlush`. |
| Columnas completadas y de dónde sale cada valor | Tipos CO_ACEPTA_PROPUESTA, CO_CONTRAPROPUESTA o CO_RECHAZO_DIRECTO; `id_negociacion_respondida` ← la propuesta que responde. |
| Columnas que quedan NULL o con valor predeterminado | Llegada propuesta. |
| Otros registros creados en la misma operación | Cambios en `vuelos_sanitarios`, auditoría, notificaciones. |
| Si la operación falla / atomicidad | Atómico. |

**Escenario 3: El DTS responde la contrapropuesta**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | DTS solicitante |
| Pantalla / componente y acción | «Aceptar contrapropuesta» / «Rechazar contrapropuesta y cancelar» ([`DtsResponses`](../../frontend-react/src/main.jsx)). |
| Datos que aporta el usuario | Aceptar o rechazar (con motivo de cancelación). |
| Endpoint | `POST /api/flights/{id}/schedule/response` |
| Servicio | `FlightService.respondToCounterproposal` |
| Validaciones y condiciones | Sólo el DTS solicitante; la propuesta debe ser la vigente (la respuesta a una propuesta reemplazada es obsoleta). |
| Mecanismo que crea el registro | Idem. |
| Columnas completadas y de dónde sale cada valor | Tipos DTS_ACEPTA_CONTRAPROPUESTA / DTS_RECHAZA_CONTRAPROPUESTA. |
| Columnas que quedan NULL o con valor predeterminado | — |
| Otros registros creados en la misma operación | Solicitud y vuelo (cancelación). |
| Si la operación falla / atomicidad | Atómico. |

**Escenario 4: El comandante y Operaciones en vuelos operativos**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | Comandante / Operaciones |
| Pantalla / componente y acción | `CommanderAssignment` («Aceptar asignación», «Proponer horario», rechazo) y `CommanderProposalResponse` («Aceptar horario propuesto», «Rechazar propuesta») en `main.jsx`. |
| Datos que aporta el usuario | Aceptar, rechazar con motivo o proponer salida y llegada. |
| Endpoint | `POST /api/flights/{id}/commander-assignment/response` y `…/commander-proposal/response` |
| Servicio | `FlightService.respondToOperationalAssignment` y `respondToCommanderProposal` |
| Validaciones y condiciones | Estado del vuelo operativo; horario futuro; elegibilidad del comandante. |
| Mecanismo que crea el registro | Idem. |
| Columnas completadas y de dónde sale cada valor | COMANDANTE_ACEPTA_ASIGNACION, COMANDANTE_PROPONE_HORARIO (con llegada), COMANDANTE_RECHAZA_ASIGNACION, CO_ACEPTA_PROPUESTA_COMANDANTE, CO_RECHAZA_PROPUESTA_COMANDANTE. |
| Columnas que quedan NULL o con valor predeterminado | — |
| Otros registros creados en la misma operación | Estado del vuelo, notificaciones. |
| Si la operación falla / atomicidad | Atómico. |

**Escenario 5: Migración**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | Flyway V20 |
| Pantalla / componente y acción | — |
| Datos que aporta el usuario | — |
| Endpoint | — |
| Servicio | V20 |
| Validaciones y condiciones | — |
| Mecanismo que crea el registro | INSERT…SELECT de DTS_PROPUESTA y CO_ACEPTA_PROPUESTA desde los vuelos existentes. |
| Columnas completadas y de dónde sale cada valor | — |
| Columnas que quedan NULL o con valor predeterminado | — |
| Otros registros creados en la misma operación | — |
| Si la operación falla / atomicidad | — |

### E. Ejemplo funcional completo

**Situación:** el DTS pide el 4/11 09:00; Operaciones contrapropone 11:00; el DTS acepta.

| id | id_vuelos | tipo_negociacion | fecha_hora_propuesta | motivo | id_usuario_actor | id_negociacion_respondida |
|---|---|---|---|---|---|---|
| 1 | 900 | DTS_PROPUESTA | 2026-11-04 09:00 | NULL | DTS | NULL |
| 2 | 900 | CO_CONTRAPROPUESTA | 2026-11-04 11:00 | Aeronave disponible recién a las 11 | Operaciones | 1 |
| 3 | 900 | DTS_ACEPTA_CONTRAPROPUESTA | 2026-11-04 11:00 | NULL | DTS | 2 |

Tras la fila 3 la solicitud pasa a APROBADO y `vuelos.fecha_planificada_salida` = 11:00. Si Operaciones hubiera enviado otra contrapropuesta antes de la respuesta del DTS, la fila 2 quedaría **obsoleta** (no se modifica: se reemplaza por una nueva fila que apunta a la propuesta anterior).

### F. Ciclo de vida del registro

Las filas son **inmutables**: nada las actualiza ni borra. El historial sólo crece. Una fila nunca cambia de significado; su estado de «vigente/obsoleta» se deduce de si otra fila la responde (`id_negociacion_respondida`).

### G. Relaciones con otras tablas

**Clave primaria:** `id_negociaciones_horario_vuelo`.

**Claves foráneas salientes (tabla hija → padre):**

| Columna | Referencia | Borrado | Obligatoria |
|---|---|---|---|
| `id_usuario_actor` | `usuarios.id_usuarios` (`fk_negociaciones_horario_vuelo_id_usuario_actor`) | NO ACTION | Opcional (NULL) |
| `id_vuelos` | `vuelos.id_vuelos` (`fk_negociaciones_horario_vuelo_id_vuelos`) | NO ACTION | Obligatoria |
| `id_negociacion_respondida` | `negociaciones_horario_vuelo.id_negociaciones_horario_vuelo` (`fk_negociaciones_horario_vuelo_respondida`) | NO ACTION | Opcional (NULL) |

**Claves foráneas entrantes (tablas hijas):** `negociaciones_horario_vuelo`(id_negociacion_respondida).

FK `id_vuelos` → `vuelos` (obligatoria, NO ACTION), `id_usuario_actor` → `usuarios` (opcional), `id_negociacion_respondida` → la propia tabla (opcional, única). Es una relación en forma de árbol/lista por vuelo.

### H. Restricciones y decisiones de diseño

**Índices (no PK):**

| Índice | Único | Columnas | Filtro | Incluye |
|---|---|---|---|---|
| `idx_negociaciones_horario_vuelo_actor_usuario_id` | no | id_usuario_actor | — | — |
| `idx_negociaciones_horario_vuelo_id_usuario_actor` | no | id_usuario_actor | — | — |
| `idx_negociaciones_horario_vuelo_id_vuelos` | no | id_vuelos | — | — |
| `idx_negociaciones_horario_vuelo_vuelo_id` | no | id_vuelos | — | — |
| `ux_negociaciones_horario_vuelo_respondida` | sí | id_negociacion_respondida | `id_negociacion_respondida IS NOT NULL` | — |

**Restricciones CHECK:** 

- `ck_negociaciones_horario_tipo`: `(tipo_negociacion=N'CO_RECHAZA_PROPUESTA_COMANDANTE' OR tipo_negociacion=N'CO_ACEPTA_PROPUESTA_COMANDANTE' OR tipo_negociacion=N'COMANDANTE_PROPONE_HORARIO' OR tipo_negociacion=N'COMANDANTE_RECHAZA_ASIGNACION' OR tipo_negociacion=N'COMANDANTE_ACEPTA_ASIGNACION' OR tipo_negociacion=N'CO_RECHAZO_DIRECTO' OR tipo_negociacion=N'DTS_RECHAZA_CONTRAPROPUESTA' OR tipo_negociacion=N'DTS_ACEPTA_CONTRAPROPUESTA' OR tipo_negociacion=N'CO_CONTRAPROPUESTA' OR tipo_negociacion=N'CO_ACEPTA_PROPUESTA' OR tipo_negociacion=N'DTS_PROPUESTA')`

**Triggers:** ninguno.

**DEFAULT / IDENTITY / nulabilidad:** ver la ficha de cada columna en la sección C (los DEFAULT figuran en «Validaciones»).

- **`ck_negociaciones_horario_tipo`:** los 11 tipos admitidos (DTS_PROPUESTA, CO_ACEPTA_PROPUESTA, CO_CONTRAPROPUESTA, DTS_ACEPTA_CONTRAPROPUESTA, DTS_RECHAZA_CONTRAPROPUESTA, CO_RECHAZO_DIRECTO, COMANDANTE_ACEPTA_ASIGNACION, COMANDANTE_RECHAZA_ASIGNACION, COMANDANTE_PROPONE_HORARIO, CO_ACEPTA_PROPUESTA_COMANDANTE, CO_RECHAZA_PROPUESTA_COMANDANTE). El texto de V20 admitía 6; V23 los amplió.
- **Observación:** V20 definió también `ck_negociaciones_horario_motivo` (motivo obligatorio en contrapropuestas/rechazos) que ya no figura en el esquema vigente: su exigencia queda en el servicio. Ver hallazgos.
- **`ux_negociaciones_horario_vuelo_respondida` (V44):** una propuesta tiene a lo sumo una respuesta.
- **Sin trigger de inmutabilidad:** a diferencia de la auditoría, nada en la base impide UPDATE/DELETE; la inmutabilidad es una convención del código.

### I. Evidencia de implementación

- [`V20 (creación)`](../../backend-java/src/main/resources/db/migration/V20__negociacion_horaria_ubicaciones_y_normalizacion_aeropuertos.sql#L3)
- [`V44 (respuesta enlazada)`](../../backend-java/src/main/resources/db/migration/V44__solicitudes_negociacion_y_cancelacion.sql#L14)
- [`Entidad FlightScheduleNegotiation`](../../backend-java/src/main/java/com/vuelossanitarios/backend/domain/flight/FlightScheduleNegotiation.java#L8)
- [`Alta de negociaciones`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/FlightService.java#L265)
- [`Respuesta del DTS`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/FlightService.java#L63)
- [`Respuesta del comandante`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/FlightService.java#L87)
- [`Prueba: RequestNegotiationServiceTest`](../../backend-java/src/test/java/com/vuelossanitarios/backend/service/RequestNegotiationServiceTest.java#L21)

---

## 15. Tabla `contactos_coordinacion_traslado`

### A. Identificación de la tabla

| Atributo | Detalle |
|---|---|
| Nombre exacto y esquema | `dbo.contactos_coordinacion_traslado` (esquema `dbo`) |
| Módulo funcional | 2. Solicitudes y vuelos |
| Tipo de tabla | Dependiente de vuelos_sanitarios — contactos del traslado con baja lógica |
| Migración que la creó | V51 |
| Migraciones posteriores que modificaron su estructura | V54 (`codigo_pais` y E.164) |
| Estado actual en el esquema | Vigente — 16 columnas, PK `id_contactos_coordinacion_traslado`, 3 FK salientes, 0 FK entrantes, 2 índice(s) único(s), 5 CHECK, 0 trigger(s) (verificado contra `sys.*` de la base E2E en Flyway V62) |
| Tablas relacionadas | vuelos_sanitarios, usuarios |

### B. Funcionalidad y justificación

Guarda los **teléfonos con los que Operaciones coordina un traslado concreto**: puede ser el propio paciente, un familiar responsable, el establecimiento de origen o de destino u otra persona. A diferencia de `telefonos`, **no** pertenecen a una persona del sistema (un familiar o una clínica no son usuarios ni pacientes), sino a la solicitud.

**Por qué es una tabla independiente.** V51: un teléfono informado en una solicitud no es el contacto personal del paciente ni de una cuenta; pertenece a la solicitud, tiene su relación con el paciente, baja lógica y versión, y no modifica ni reutiliza los contactos compartidos de ninguna persona. Hasta 5 activos por solicitud (`MAX_ACTIVE`).

**Qué dejaría de funcionar sin ella.** Operaciones no tendría con quién coordinar el traslado; la pantalla «Ver contactos de coordinación» quedaría vacía.

### C. Descripción campo por campo

#### `id_contactos_coordinacion_traslado`

| Atributo | Detalle |
|---|---|
| Nombre | `id_contactos_coordinacion_traslado` |
| Tipo de dato | `bigint` — IDENTITY(1,1) |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Clave primaria de la tabla: identifica de forma única cada fila y es el valor que otras tablas, la API y la auditoría usan para referirse a ella. |
| Justificación | Un identificador técnico numérico, estable y sin significado de negocio evita depender de datos que pueden cambiar (nombres, códigos) y hace eficientes los JOIN y las claves foráneas (decisión V24/V27: «toda tabla de aplicación tiene su propio id_<tabla> BIGINT IDENTITY»). |
| Contenido | Número entero positivo correlativo (1, 2, 3…). No lo ingresa el usuario. |
| Origen | SQL Server, columna IDENTITY(1,1): se asigna en el propio INSERT. Hibernate lo declara `@GeneratedValue(strategy = IDENTITY)` y lo lee de vuelta tras insertar. |
| Momento inicial | En el INSERT; no existe fila sin identificador. |
| Modificación | Nunca cambia (inmutable; JPA lo declara `updatable=false`). |
| Validaciones | PRIMARY KEY; PRIMARY KEY (unicidad y NOT NULL); no se reutiliza al borrar filas. |

#### `id_vuelos`

| Atributo | Detalle |
|---|---|
| Nombre | `id_vuelos` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Solicitud/traslado al que pertenece el contacto. |
| Justificación | Los contactos pertenecen al traslado, no a una persona. |
| Contenido | Identificador de `vuelos_sanitarios.id_vuelos` (mismo id que `vuelos`). |
| Origen | Backend. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `vuelos_sanitarios.id_vuelos` (borrado: NO ACTION); Índice único `uq_contactos_coordinacion_traslado_principal_vigente` filtrado `es_principal=(1) AND fecha_baja IS NULL`; Índice único `uq_contactos_coordinacion_traslado_telefono_vigente` sobre (id_vuelos, telefono_normalizado) filtrado `fecha_baja IS NULL`; NOT NULL, FK; parte de dos índices únicos filtrados. |

#### `relacion_contacto`

| Atributo | Detalle |
|---|---|
| Nombre | `relacion_contacto` |
| Tipo de dato | `nvarchar(30)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Quién es el contacto respecto del paciente. |
| Justificación | Operaciones sabe a quién llama y con qué autoridad. |
| Contenido | PACIENTE, FAMILIAR_RESPONSABLE, ESTABLECIMIENTO_ORIGEN, ESTABLECIMIENTO_DESTINO u OTRO. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | «Guardar» en edición. |
| Validaciones | CHECK `ck_contactos_coordinacion_traslado_nombre`; CHECK `ck_contactos_coordinacion_traslado_relacion`; CHECK de conjunto cerrado. |

#### `nombre_contacto`

| Atributo | Detalle |
|---|---|
| Nombre | `nombre_contacto` |
| Tipo de dato | `nvarchar(150)` |
| Nulabilidad | **Permite NULL.** NULL sólo si la relación es PACIENTE (se sabe quién es). |
| Función | Nombre de la persona o establecimiento. |
| Justificación | Identifica a quién se llama (obligatorio, salvo el propio paciente). |
| Contenido | Texto de hasta 150 caracteres. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | Edición. |
| Validaciones | CHECK `ck_contactos_coordinacion_traslado_nombre`; CHECK: obligatorio salvo PACIENTE. |

#### `telefono_contacto`

| Atributo | Detalle |
|---|---|
| Nombre | `telefono_contacto` |
| Tipo de dato | `nvarchar(30)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Teléfono en formato internacional legible. |
| Justificación | Lo que ve el usuario. |
| Contenido | p. ej. +54 381 555-0000. |
| Origen | `PhoneNumbers.parse`. |
| Momento inicial | En el INSERT. |
| Modificación | Edición. |
| Validaciones | Validación por país. |

#### `telefono_normalizado`

| Atributo | Detalle |
|---|---|
| Nombre | `telefono_normalizado` |
| Tipo de dato | `nvarchar(30)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Teléfono E.164. |
| Justificación | Comparaciones y unicidad por solicitud. |
| Contenido | p. ej. +543815550000. |
| Origen | `PhoneNumbers.parse`. |
| Momento inicial | En el INSERT. |
| Modificación | Edición. |
| Validaciones | Índice único `uq_contactos_coordinacion_traslado_telefono_vigente` sobre (id_vuelos, telefono_normalizado) filtrado `fecha_baja IS NULL`; CHECK `ck_contactos_coordinacion_traslado_telefono`; CHECK `ck_contactos_coordinacion_traslado_validacion_internacional`; CHECK de longitud (6–16) y formato E.164; índice único vigente. |

#### `observaciones_contacto`

| Atributo | Detalle |
|---|---|
| Nombre | `observaciones_contacto` |
| Tipo de dato | `nvarchar(200)` |
| Nulabilidad | **Permite NULL.** Opcional. |
| Función | Indicaciones sobre el contacto (horarios, interno). |
| Justificación | Ayuda práctica para Operaciones. |
| Contenido | Hasta 200 caracteres. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | Edición. |
| Validaciones | Máx. 200 (servicio). |

#### `es_principal`

| Atributo | Detalle |
|---|---|
| Nombre | `es_principal` |
| Tipo de dato | `bit` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Contacto principal del traslado. |
| Justificación | Define a quién se llama primero. |
| Contenido | 0/1. |
| Origen | Backend (el primero cargado). |
| Momento inicial | En el INSERT. |
| Modificación | «Hacer principal»; promoción al retirar. |
| Validaciones | CHECK `ck_contactos_coordinacion_traslado_baja`; Índice único filtrado. |

#### `version_contacto`

| Atributo | Detalle |
|---|---|
| Nombre | `version_contacto` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Contador de edición. |
| Justificación | Concurrencia optimista. |
| Contenido | Entero. |
| Origen | Hibernate `@Version`. |
| Momento inicial | 0. |
| Modificación | +1 por UPDATE. |
| Validaciones | DEFAULT 0; La API exige la versión vigente. |

#### `id_usuario_alta`

| Atributo | Detalle |
|---|---|
| Nombre | `id_usuario_alta` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | DTS que cargó el contacto. |
| Justificación | Responsabilidad. |
| Contenido | Identificador de `usuarios`. |
| Origen | Usuario autenticado. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `usuarios.id_usuarios` (borrado: NO ACTION); NOT NULL, FK. |

#### `fecha_alta`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_alta` |
| Tipo de dato | `datetime2(7)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Momento de carga. |
| Justificación | Orden y trazabilidad. |
| Contenido | Fecha y hora (reloj de negocio). |
| Origen | Backend. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | NOT NULL (sin DEFAULT: la aplicación debe enviarla). |

#### `fecha_actualizacion`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_actualizacion` |
| Tipo de dato | `datetime2(7)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Último cambio. |
| Justificación | Trazabilidad. |
| Contenido | Fecha y hora. |
| Origen | Backend (`setFechaActualizacion`). |
| Momento inicial | En el INSERT. |
| Modificación | En cada edición, cambio de principal o baja. |
| Validaciones | NOT NULL (sin DEFAULT). |

#### `fecha_baja`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_baja` |
| Tipo de dato | `datetime2(7)` |
| Nulabilidad | **Permite NULL.** NULL mientras el contacto está vigente. |
| Función | Momento del retiro. |
| Justificación | Baja lógica. |
| Contenido | Fecha y hora. |
| Origen | `TransferContact.darDeBaja`. |
| Momento inicial | NULL. |
| Modificación | Al retirar. |
| Validaciones | CHECK `ck_contactos_coordinacion_traslado_baja`; CHECK de baja. |

#### `id_usuario_baja`

| Atributo | Detalle |
|---|---|
| Nombre | `id_usuario_baja` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** NULL si vigente. |
| Función | DTS que lo retiró. |
| Justificación | Responsabilidad. |
| Contenido | Identificador de `usuarios`. |
| Origen | Usuario autenticado. |
| Momento inicial | NULL. |
| Modificación | Al retirar. |
| Validaciones | FOREIGN KEY → `usuarios.id_usuarios` (borrado: NO ACTION); CHECK `ck_contactos_coordinacion_traslado_baja`; CHECK: obligatorio si hay baja. |

#### `motivo_baja`

| Atributo | Detalle |
|---|---|
| Nombre | `motivo_baja` |
| Tipo de dato | `nvarchar(30)` |
| Nulabilidad | **Permite NULL.** NULL si vigente. |
| Función | Causa de la baja. |
| Justificación | Por ahora sólo RETIRO. |
| Contenido | RETIRO. |
| Origen | Backend. |
| Momento inicial | NULL. |
| Modificación | Al retirar. |
| Validaciones | CHECK `ck_contactos_coordinacion_traslado_baja`; CHECK: = RETIRO. |

#### `codigo_pais`

| Atributo | Detalle |
|---|---|
| Nombre | `codigo_pais` |
| Tipo de dato | `varchar(2)` |
| Nulabilidad | **Permite NULL.** NULL en contactos anteriores a V54 (conservados sin validar). |
| Función | País con cuyas reglas se validó el teléfono. |
| Justificación | Validación internacional (V54). |
| Contenido | Dos letras (AR). |
| Origen | Formulario (selector de país). |
| Momento inicial | En el INSERT. |
| Modificación | Edición. |
| Validaciones | CHECK `ck_contactos_coordinacion_traslado_validacion_internacional`; CHECK de formato. |

### D. Momento en que se crea un registro

**Escenario 1: Contactos cargados con la solicitud**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | DTS |
| Pantalla / componente y acción | «Nueva solicitud» → sección de contactos de coordinación ([`TransferContactFields`](../../frontend-react/src/transferContacts.jsx)). |
| Datos que aporta el usuario | Relación, nombre, teléfono, país, indicaciones por contacto. |
| Endpoint | `POST /api/flights` / `/with-patient` |
| Servicio | `TransferContactService.validate` (antes de escribir) y `registerAtRequest` (`Propagation.MANDATORY`) |
| Validaciones y condiciones | Relación en {PACIENTE, FAMILIAR_RESPONSABLE, ESTABLECIMIENTO_ORIGEN, ESTABLECIMIENTO_DESTINO, OTRO}; nombre obligatorio salvo PACIENTE; teléfono válido para el país; sin repetidos ni más de un PACIENTE; máx. 5. |
| Mecanismo que crea el registro | `contacts.saveAndFlush(t)` por contacto. |
| Columnas completadas y de dónde sale cada valor | `id_vuelos` ← vuelo/solicitud; `relacion_contacto`, `nombre_contacto`, `observaciones_contacto` ← formulario; `telefono_contacto` (internacional), `telefono_normalizado` (E.164) y `codigo_pais` ← validación; `es_principal` = verdadero sólo para el primero; `id_usuario_alta` ← DTS; `fecha_alta`/`fecha_actualizacion` ← reloj de negocio; `version_contacto`=0. |
| Columnas que quedan NULL o con valor predeterminado | `nombre_contacto` (PACIENTE), `observaciones_contacto`, baja. |
| Otros registros creados en la misma operación | Evento `TRANSFER_CONTACT/CREATE`. |
| Si la operación falla / atomicidad | Parte de la transacción de la solicitud: si falla algo no queda ni el contacto ni el vuelo. |

**Escenario 2: El DTS agrega un contacto después**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | DTS solicitante |
| Pantalla / componente y acción | `TransferContacts`: «Ver contactos de coordinación» → **Agregar**. |
| Datos que aporta el usuario | Idem. |
| Endpoint | `POST /api/flights/{flightId}/transfer-contacts` |
| Servicio | `TransferContactService.add` |
| Validaciones y condiciones | Idem + el vuelo debe seguir editable (no cerrado) y el usuario debe ser el DTS de esa solicitud. |
| Mecanismo que crea el registro | `contacts.saveAndFlush`. |
| Columnas completadas y de dónde sale cada valor | Idem; `es_principal` sólo si no hay otros vigentes. |
| Columnas que quedan NULL o con valor predeterminado | Idem. |
| Otros registros creados en la misma operación | Auditoría. |
| Si la operación falla / atomicidad | Propia. |

**Escenario 3: Migración**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | Flyway |
| Pantalla / componente y acción | — |
| Datos que aporta el usuario | — |
| Endpoint | — |
| Servicio | V51 sólo crea la estructura |
| Validaciones y condiciones | — |
| Mecanismo que crea el registro | — |
| Columnas completadas y de dónde sale cada valor | — |
| Columnas que quedan NULL o con valor predeterminado | — |
| Otros registros creados en la misma operación | — |
| Si la operación falla / atomicidad | — |

### E. Ejemplo funcional completo

**Situación:** el DTS informa dos contactos.

| id | id_vuelos | relacion_contacto | nombre_contacto | telefono_normalizado | codigo_pais | es_principal | version_contacto | fecha_baja |
|---|---|---|---|---|---|---|---|---|
| 31 | 900 | FAMILIAR_RESPONSABLE | María Díaz | +543815550000 | AR | 1 | 0 | NULL |
| 32 | 900 | ESTABLECIMIENTO_DESTINO | Hospital destino | +543875551111 | AR | 0 | 0 | NULL |

Operaciones y comandante consultan los contactos con `GET …/transfer-contacts` (sólo mientras el traslado no esté cerrado; la consulta por un tercero se audita como `VIEW`). Si el DTS retira el 31 (**Retirar**), se completan `fecha_baja`, `id_usuario_baja` y `motivo_baja`='RETIRO', `es_principal`=0 y se promueve el 32 como principal.

### F. Ciclo de vida del registro

| Transición | Acción | Actor | Campos | Efecto |
|---|---|---|---|---|
| Alta | Agregar o con la solicitud | DTS | INSERT | — |
| Edición | «Guardar» | DTS | relación, nombre, teléfono(s), observaciones, `fecha_actualizacion`, `version_contacto` | control de versión (409 si cambió) |
| Principal | «Hacer principal» | DTS | `es_principal` (dos filas) | atómico |
| Baja lógica | «Retirar» | DTS | `fecha_baja`, `id_usuario_baja`, `motivo_baja`, `es_principal` | se promueve otro principal |
| Cierre del traslado | vuelo cerrado | — | — | la lista deja de mostrarse (y no se edita) |

### G. Relaciones con otras tablas

**Clave primaria:** `id_contactos_coordinacion_traslado`.

**Claves foráneas salientes (tabla hija → padre):**

| Columna | Referencia | Borrado | Obligatoria |
|---|---|---|---|
| `id_usuario_alta` | `usuarios.id_usuarios` (`fk_contactos_coordinacion_traslado_alta`) | NO ACTION | Obligatoria |
| `id_usuario_baja` | `usuarios.id_usuarios` (`fk_contactos_coordinacion_traslado_baja`) | NO ACTION | Opcional (NULL) |
| `id_vuelos` | `vuelos_sanitarios.id_vuelos` (`fk_contactos_coordinacion_traslado_vuelo`) | NO ACTION | Obligatoria |

**Claves foráneas entrantes:** ninguna.

FK `id_vuelos` → `vuelos_sanitarios.id_vuelos` (obligatoria), `id_usuario_alta` y `id_usuario_baja` → `usuarios`. La FK apunta a la extensión sanitaria, de modo que sólo puede haber contactos de coordinación en vuelos sanitarios.

### H. Restricciones y decisiones de diseño

**Índices (no PK):**

| Índice | Único | Columnas | Filtro | Incluye |
|---|---|---|---|---|
| `idx_contactos_coordinacion_traslado_id_usuario_alta` | no | id_usuario_alta | — | — |
| `idx_contactos_coordinacion_traslado_id_usuario_baja` | no | id_usuario_baja | `id_usuario_baja IS NOT NULL` | — |
| `uq_contactos_coordinacion_traslado_principal_vigente` | sí | id_vuelos | `es_principal=(1) AND fecha_baja IS NULL` | — |
| `uq_contactos_coordinacion_traslado_telefono_vigente` | sí | id_vuelos, telefono_normalizado | `fecha_baja IS NULL` | — |

**Restricciones CHECK:** 

- `ck_contactos_coordinacion_traslado_baja`: `(fecha_baja IS NULL AND id_usuario_baja IS NULL AND motivo_baja IS NULL OR fecha_baja IS NOT NULL AND id_usuario_baja IS NOT NULL AND es_principal=(0) AND motivo_baja=N'RETIRO')`
- `ck_contactos_coordinacion_traslado_nombre`: `(relacion_contacto=N'PACIENTE' OR len(ltrim(rtrim(isnull(nombre_contacto,N''))))>(0))`
- `ck_contactos_coordinacion_traslado_relacion`: `(relacion_contacto=N'OTRO' OR relacion_contacto=N'ESTABLECIMIENTO_DESTINO' OR relacion_contacto=N'ESTABLECIMIENTO_ORIGEN' OR relacion_contacto=N'FAMILIAR_RESPONSABLE' OR relacion_contacto=N'PACIENTE')`
- `ck_contactos_coordinacion_traslado_telefono`: `(len(telefono_normalizado)>=(6) AND len(telefono_normalizado)<=(16))`
- `ck_contactos_coordinacion_traslado_validacion_internacional`: `(codigo_pais IS NULL OR len(codigo_pais)=(2) AND NOT (codigo_pais) collate Latin1_General_BIN2 like N'%^A-Z%' AND telefono_normalizado like N'+1-9%' AND NOT substring(telefono_normalizado,(2),(30)) like N'%^0-9%' AND (len(telefono_normalizado)>=(8) AND len(telefono_normalizado)<=(16)))`

**Triggers:** ninguno.

**DEFAULT / IDENTITY / nulabilidad:** ver la ficha de cada columna en la sección C (los DEFAULT figuran en «Validaciones»).

- **`uq_contactos_coordinacion_traslado_telefono_vigente`:** el mismo teléfono vigente una sola vez por solicitud.
- **`uq_contactos_coordinacion_traslado_principal_vigente`:** a lo sumo un principal vigente por solicitud.
- **CHECK:** relación en el conjunto cerrado; nombre obligatorio salvo el paciente; longitud del teléfono normalizado 6–16; baja coherente (con actor, motivo RETIRO y no principal); validación internacional.
- **Auditoría sin datos sensibles:** se audita la relación y el teléfono enmascarado, nunca el nombre ni las indicaciones.

### I. Evidencia de implementación

- [`V51 (creación)`](../../backend-java/src/main/resources/db/migration/V51__contactos_coordinacion_traslado_sanitario.sql#L7)
- [`V54 (teléfono internacional)`](../../backend-java/src/main/resources/db/migration/V54__verificacion_correos_y_telefonos_internacionales.sql#L24)
- [`Entidad TransferContact`](../../backend-java/src/main/java/com/vuelossanitarios/backend/domain/flight/TransferContact.java#L13)
- [`TransferContactService.registerAtRequest`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/TransferContactService.java#L88)
- [`TransferContactService.add`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/TransferContactService.java#L104)
- [`Controlador`](../../backend-java/src/main/java/com/vuelossanitarios/backend/api/TransferContactController.java#L12)
- [`Pantalla`](../../frontend-react/src/transferContacts.jsx#L73)
- [`Prueba: TransferContactIntegrationTest`](../../backend-java/src/test/java/com/vuelossanitarios/backend/api/TransferContactIntegrationTest.java#L47)
