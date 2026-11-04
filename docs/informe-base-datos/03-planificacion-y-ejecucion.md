# Capítulo 3 — Planificación y ejecución del vuelo

[← Informe principal](../INFORME_COMPLETO_BASE_DATOS.md) · [Índice de capítulos](../INFORME_COMPLETO_BASE_DATOS.md#3-índice-y-navegación)

Tablas de este capítulo: [`vuelos_tripulantes`](#16-tabla-vuelos_tripulantes), [`instantaneas_clima`](#17-tabla-instantaneas_clima), [`rutas_vuelo`](#18-tabla-rutas_vuelo), [`informacion_hangar`](#19-tabla-informacion_hangar), [`coordinaciones_aa2000`](#20-tabla-coordinaciones_aa2000), [`bitacora_vuelos`](#21-tabla-bitacora_vuelos).

Cada tabla sigue la estructura A–I del encargo: **A** identificación · **B** funcionalidad · **C** campo por campo · **D** creación de registros · **E** ejemplo funcional · **F** ciclo de vida · **G** relaciones · **H** restricciones y diseño · **I** evidencia. Convenciones y fuentes en [00-metodologia-y-convenciones.md](00-metodologia-y-convenciones.md).

---

## 16. Tabla `vuelos_tripulantes`

### A. Identificación de la tabla

| Atributo | Detalle |
|---|---|
| Nombre exacto y esquema | `dbo.vuelos_tripulantes` (esquema `dbo`) |
| Módulo funcional | 3. Planificación y ejecución del vuelo |
| Tipo de tabla | Relación con historial — asignación de tripulantes a vuelos |
| Migración que la creó | V1 (como `flight_crew`) |
| Migraciones posteriores que modificaron su estructura | V4 (unicidad por usuario), V8/V24/V27 (renombre, BIGINT), V45 (baja lógica: `fecha_baja`, `id_usuario_baja`, `motivo_baja` e índice único de asignación vigente) |
| Estado actual en el esquema | Vigente — 9 columnas, PK `id_vuelos_tripulantes`, 5 FK salientes, 0 FK entrantes, 1 índice(s) único(s), 1 CHECK, 0 trigger(s) (verificado contra `sys.*` de la base E2E en Flyway V62) |
| Tablas relacionadas | vuelos, usuarios, roles_tripulacion |

### B. Funcionalidad y justificación

Dice **quién integra la tripulación de cada vuelo y con qué función** (COMANDANTE, COPILOTO, MEDICO, ENFERMERO). El comandante entra automáticamente al asignarse recursos; el resto lo agrega Operaciones. Es la base del control de disponibilidad: una persona con una asignación vigente en otro vuelo que se solapa no puede ser asignada.

**Por qué es una tabla independiente.** Un vuelo tiene N tripulantes y una persona participa en N vuelos: relación N:M que además necesita atributos propios (función, quién asignó, cuándo, baja). V45 convirtió el borrado en baja lógica para conservar quién voló cada vuelo.

**Qué dejaría de funcionar sin ella.** No se sabría quién viaja, no habría control de solapamientos de tripulación, ni habría destinatarios de notificaciones de tripulación ni verificación de elegibilidad al iniciar.

### C. Descripción campo por campo

#### `fecha_creacion`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_creacion` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Registra el instante en que la asignación se incorporó al sistema. |
| Justificación | Permite ordenar cronológicamente, reconstruir el historial y aportar trazabilidad sin depender de la auditoría. |
| Contenido | Fecha y hora (DATETIME2) de la inserción. |
| Origen | Automático: DEFAULT `SYSDATETIME()` de SQL Server o `@CreationTimestamp` de Hibernate (según la entidad); el usuario nunca ingresa esta fecha. |
| Momento inicial | En el INSERT. |
| Modificación | Inmutable: ningún flujo la actualiza (`updatable=false` en la entidad). |
| Validaciones | DEFAULT sysdatetime() |

#### `id_vuelos_tripulantes`

| Atributo | Detalle |
|---|---|
| Nombre | `id_vuelos_tripulantes` |
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
| Función | Vuelo al que se asigna. |
| Justificación | Define el compromiso de la persona. |
| Contenido | Identificador de `vuelos`. |
| Origen | Backend. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `vuelos.id_vuelos` (borrado: **CASCADE**); Índice único `ux_vuelos_tripulantes_asignacion_vigente` sobre (id_vuelos, id_usuarios) filtrado `fecha_baja IS NULL`; NOT NULL, FK con CASCADE. |

#### `id_usuarios`

| Atributo | Detalle |
|---|---|
| Nombre | `id_usuarios` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Persona asignada (cuenta). |
| Justificación | Es el tripulante; se usa para disponibilidad y notificaciones. |
| Contenido | Identificador de `usuarios`. |
| Origen | Operaciones (elige entre candidatos) o el comandante del vuelo. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia (para cambiar persona se hace baja + nueva). |
| Validaciones | FOREIGN KEY → `usuarios.id_usuarios` (borrado: NO ACTION); Índice único `ux_vuelos_tripulantes_asignacion_vigente` sobre (id_vuelos, id_usuarios) filtrado `fecha_baja IS NULL`; NOT NULL, FK; única vigente por vuelo. |

#### `id_roles_tripulacion`

| Atributo | Detalle |
|---|---|
| Nombre | `id_roles_tripulacion` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Función que cumple en el vuelo. |
| Justificación | Determina la política de habilitación aplicable y la capacidad. |
| Contenido | Identificador de `roles_tripulacion`. |
| Origen | Selector de función. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `roles_tripulacion.id_roles_tripulacion` (borrado: NO ACTION); NOT NULL, FK; la función COMANDANTE sólo se asigna por recursos. |

#### `id_usuario_asignador`

| Atributo | Detalle |
|---|---|
| Nombre | `id_usuario_asignador` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** Opcional en el esquema (V1); el código actual siempre lo informa. |
| Función | Quién hizo la asignación. |
| Justificación | Responsabilidad. |
| Contenido | Identificador de `usuarios`. |
| Origen | Usuario autenticado. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `usuarios.id_usuarios` (borrado: NO ACTION); FK. |

#### `fecha_baja`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_baja` |
| Tipo de dato | `datetime2(7)` |
| Nulabilidad | **Permite NULL.** NULL mientras la asignación está vigente. |
| Función | Momento de la baja de la asignación. |
| Justificación | Libera a la persona y conserva el historial. |
| Contenido | Fecha y hora. |
| Origen | Backend (`darDeBaja`). |
| Momento inicial | NULL. |
| Modificación | En reemplazo, retiro o cambio de comandante. |
| Validaciones | CHECK `ck_vuelos_tripulantes_baja`; CHECK de baja. |

#### `id_usuario_baja`

| Atributo | Detalle |
|---|---|
| Nombre | `id_usuario_baja` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** NULL si vigente. |
| Función | Quién dio de baja. |
| Justificación | Responsabilidad. |
| Contenido | Identificador de `usuarios`. |
| Origen | Usuario autenticado. |
| Momento inicial | NULL. |
| Modificación | Con la baja. |
| Validaciones | FOREIGN KEY → `usuarios.id_usuarios` (borrado: NO ACTION); CHECK `ck_vuelos_tripulantes_baja`; CHECK de baja. |

#### `motivo_baja`

| Atributo | Detalle |
|---|---|
| Nombre | `motivo_baja` |
| Tipo de dato | `nvarchar(30)` |
| Nulabilidad | **Permite NULL.** NULL si vigente. |
| Función | Causa de la baja. |
| Justificación | Distinguir retiro, reemplazo y cambio de comandante. |
| Contenido | RETIRO, REEMPLAZO o CAMBIO_COMANDANTE. |
| Origen | Backend. |
| Momento inicial | NULL. |
| Modificación | Con la baja. |
| Validaciones | CHECK `ck_vuelos_tripulantes_baja`; CHECK de conjunto cerrado. |

### D. Momento en que se crea un registro

**Escenario 1: Entra el comandante (asignación de recursos o alta operativa)**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | Operaciones / Centro de Operaciones |
| Pantalla / componente y acción | Asignación de recursos (`Ops`, `main.jsx`) o «Crear vuelo operativo». |
| Datos que aporta el usuario | Aeronave y comandante. |
| Endpoint | `POST /api/flights/{id}/resources` o `POST /api/flights/operational` |
| Servicio | `FlightService.ensureCommanderCrew` (dentro de `assign`/`createOperational`/`replanOperational`) |
| Validaciones y condiciones | Las de la asignación (comandante elegible, aeronave disponible…). |
| Mecanismo que crea el registro | `crews.saveAndFlush(current)`. |
| Columnas completadas y de dónde sale cada valor | `id_vuelos`, `id_usuarios` (comandante), `id_roles_tripulacion` = COMANDANTE, `id_usuario_asignador` = operador, `fecha_creacion` ← @CreationTimestamp. |
| Columnas que quedan NULL o con valor predeterminado | `fecha_baja`, `id_usuario_baja`, `motivo_baja`. |
| Otros registros creados en la misma operación | Si había otro comandante vigente se lo da de baja (`CAMBIO_COMANDANTE`); auditoría `FLIGHT_CREW/CREATE`. |
| Si la operación falla / atomicidad | Dentro de la transacción de la asignación. |

**Escenario 2: Operaciones agrega o reemplaza a un tripulante**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | Operaciones / Centro de Operaciones |
| Pantalla / componente y acción | `FlightCrew` ([`main.jsx`](../../frontend-react/src/main.jsx), líneas 460–481): selector de función y persona → agregar; «Reemplazar»; «Retirar»; «Actualizar elegibilidad». |
| Datos que aporta el usuario | Función y persona candidata (sólo aparecen personas con la clasificación y habilitación vigentes). |
| Endpoint | `POST /api/flights/{id}/crew` y `PUT /api/flights/{id}/crew/{crewId}` |
| Servicio | `CrewManagementService.assign` / `replace` |
| Validaciones y condiciones | Vuelo aún no iniciado; la persona clasificada para esa función, con habilitación suficiente según las políticas y sin otro compromiso solapado; no duplicada en el vuelo; la aeronave admite esa cantidad de tripulantes. |
| Mecanismo que crea el registro | `crews.saveAndFlush(c)` (en reemplazo: UPDATE de baja del anterior + INSERT del nuevo). |
| Columnas completadas y de dónde sale cada valor | Idem, con `id_roles_tripulacion` elegido. |
| Columnas que quedan NULL o con valor predeterminado | Baja. |
| Otros registros creados en la misma operación | Notificación `CREW_ASSIGNED` (y `CREW_REMOVED` al reemplazado), auditoría `CREATE`/`REPLACE`. |
| Si la operación falla / atomicidad | Atómico por operación; bloqueos de vuelo y de las personas implicadas. |

### E. Ejemplo funcional completo

**Situación:** vuelo 900 con comandante Luis (usuario 55). Operaciones agrega a la médica «Sofía» (usuario 60).

| id | id_vuelos | id_usuarios | id_roles_tripulacion | id_usuario_asignador | fecha_creacion | fecha_baja | id_usuario_baja | motivo_baja |
|---|---|---|---|---|---|---|---|---|
| 1000 | 900 | 55 | COMANDANTE | 20 (Ops) | 11:00 | NULL | NULL | NULL |
| 1001 | 900 | 60 | MEDICO | 20 | 11:05 | NULL | NULL | NULL |

Si Sofía no puede, Operaciones usa **Reemplazar** por «Pablo»: la fila 1001 se completa con `fecha_baja`, `id_usuario_baja`=20, `motivo_baja`='REEMPLAZO' y se inserta la 1002. Ambas permanecen. **Retirar** deja `motivo_baja`='RETIRO'. Si cambia el comandante, el anterior queda con 'CAMBIO_COMANDANTE'.

### F. Ciclo de vida del registro

| Transición | Acción | Actor | Campos | Efecto |
|---|---|---|---|---|
| Alta | Agregar / asignar comandante | Operaciones | INSERT | disponibilidad ocupada |
| Reemplazo | «Reemplazar» | Operaciones | baja del anterior (`REEMPLAZO`) + INSERT | historial conservado |
| Retiro | «Retirar» | Operaciones | baja (`RETIRO`) | persona libre |
| Cambio de comandante | nueva asignación de recursos | Operaciones | baja (`CAMBIO_COMANDANTE`) | — |
| Vuelo cancelado | cancelación | — | **ninguna**: las asignaciones se conservan; el estado CANCELADO libera la disponibilidad | — |
| Borrado | no existe (sólo CASCADE si se borrara el vuelo) | — | — | — |

### G. Relaciones con otras tablas

**Clave primaria:** `id_vuelos_tripulantes`.

**Claves foráneas salientes (tabla hija → padre):**

| Columna | Referencia | Borrado | Obligatoria |
|---|---|---|---|
| `id_roles_tripulacion` | `roles_tripulacion.id_roles_tripulacion` (`fk_vuelos_tripulantes_id_roles_tripulacion`) | NO ACTION | Obligatoria |
| `id_usuario_asignador` | `usuarios.id_usuarios` (`fk_vuelos_tripulantes_id_usuario_asignador`) | NO ACTION | Opcional (NULL) |
| `id_usuarios` | `usuarios.id_usuarios` (`fk_vuelos_tripulantes_id_usuarios`) | NO ACTION | Obligatoria |
| `id_vuelos` | `vuelos.id_vuelos` (`fk_vuelos_tripulantes_id_vuelos`) | **CASCADE** | Obligatoria |
| `id_usuario_baja` | `usuarios.id_usuarios` (`fk_vuelos_tripulantes_usuario_baja`) | NO ACTION | Opcional (NULL) |

**Claves foráneas entrantes:** ninguna.

FK `id_vuelos` → `vuelos` (CASCADE), `id_usuarios` (el tripulante), `id_roles_tripulacion`, `id_usuario_asignador` y `id_usuario_baja` → `usuarios`. La disponibilidad de una persona se calcula con las asignaciones vigentes (`fecha_baja IS NULL`) de vuelos no terminales.

### H. Restricciones y decisiones de diseño

**Índices (no PK):**

| Índice | Único | Columnas | Filtro | Incluye |
|---|---|---|---|---|
| `idx_vuelos_tripulantes_asignado_por_usuario_id` | no | id_usuario_asignador | — | — |
| `idx_vuelos_tripulantes_id_roles_tripulacion` | no | id_roles_tripulacion | — | — |
| `idx_vuelos_tripulantes_id_usuario_asignador` | no | id_usuario_asignador | — | — |
| `idx_vuelos_tripulantes_id_usuarios` | no | id_usuarios | — | — |
| `idx_vuelos_tripulantes_id_vuelos` | no | id_vuelos | — | — |
| `idx_vuelos_tripulantes_rol_tripulacion_id` | no | id_roles_tripulacion | — | — |
| `idx_vuelos_tripulantes_usuario_id` | no | id_usuarios | — | — |
| `idx_vuelos_tripulantes_vuelo_id` | no | id_vuelos | — | — |
| `ix_vuelos_tripulantes_usuario_vigente` | no | id_usuarios | `fecha_baja IS NULL` | id_vuelos |
| `ux_vuelos_tripulantes_asignacion_vigente` | sí | id_vuelos, id_usuarios | `fecha_baja IS NULL` | — |

**Restricciones CHECK:** 

- `ck_vuelos_tripulantes_baja`: `(fecha_baja IS NULL AND id_usuario_baja IS NULL AND motivo_baja IS NULL OR fecha_baja IS NOT NULL AND id_usuario_baja IS NOT NULL AND (motivo_baja=N'CAMBIO_COMANDANTE' OR motivo_baja=N'REEMPLAZO' OR motivo_baja=N'RETIRO'))`

**Triggers:** ninguno.

**DEFAULT / IDENTITY / nulabilidad:** ver la ficha de cada columna en la sección C (los DEFAULT figuran en «Validaciones»).

- **`ux_vuelos_tripulantes_asignacion_vigente` (V45):** una persona sólo puede tener UNA asignación vigente por vuelo; reemplazó las restricciones únicas históricas que impedían volver a asignar a quien había sido retirado.
- **`ix_vuelos_tripulantes_usuario_vigente`:** acelera la consulta de compromisos de una persona.
- **`ck_vuelos_tripulantes_baja`:** una baja tiene fecha, actor y motivo del conjunto {RETIRO, REEMPLAZO, CAMBIO_COMANDANTE}.
- **Concurrencia:** las operaciones bloquean el vuelo y luego las personas (en orden de id) para evitar interbloqueos.

### I. Evidencia de implementación

- [`V1 (flight_crew)`](../../backend-java/src/main/resources/db/migration/V1__init_sanitary_flights_schema.sql#L168)
- [`V45 (baja lógica)`](../../backend-java/src/main/resources/db/migration/V45__tripulacion_baja_logica_historial.sql#L30)
- [`Entidad FlightCrew`](../../backend-java/src/main/java/com/vuelossanitarios/backend/domain/flight/FlightCrew.java#L21)
- [`CrewManagementService.assign`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/CrewManagementService.java#L104)
- [`CrewManagementService.replace`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/CrewManagementService.java#L113)
- [`CrewManagementService.remove`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/CrewManagementService.java#L134)
- [`FlightService.ensureCommanderCrew`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/FlightService.java#L241)
- [`Controlador`](../../backend-java/src/main/java/com/vuelossanitarios/backend/api/FlightController.java#L42)
- [`Pantalla de tripulación`](../../frontend-react/src/main.jsx#L460)
- [`Prueba: CrewManagementServiceTest`](../../backend-java/src/test/java/com/vuelossanitarios/backend/service/CrewManagementServiceTest.java#L30)
- [`Prueba: AircraftCrewConcurrencyIntegrationTest`](../../backend-java/src/test/java/com/vuelossanitarios/backend/service/AircraftCrewConcurrencyIntegrationTest.java#L38)

---

## 17. Tabla `instantaneas_clima`

### A. Identificación de la tabla

| Atributo | Detalle |
|---|---|
| Nombre exacto y esquema | `dbo.instantaneas_clima` (esquema `dbo`) |
| Módulo funcional | 3. Planificación y ejecución del vuelo |
| Tipo de tabla | Historial — registros manuales de condiciones meteorológicas |
| Migración que la creó | V1 (como `weather_snapshots`) |
| Migraciones posteriores que modificaron su estructura | V8 (renombre), V21 (clima manual: `condiciones`, `favorable`; se retiran fuente, proveedor_api, datos_clima y apto_para_volar), V24/V27/V28 |
| Estado actual en el esquema | Vigente — 7 columnas, PK `id_instantaneas_clima`, 2 FK salientes, 0 FK entrantes, 0 índice(s) único(s), 0 CHECK, 0 trigger(s) (verificado contra `sys.*` de la base E2E en Flyway V62) |
| Tablas relacionadas | vuelos, usuarios |

### B. Funcionalidad y justificación

Cada fila es **una constancia del comandante** sobre el clima antes de volar: qué condiciones observó, si las considera favorables y observaciones. No consulta ningún servicio externo: es una declaración manual (V21 retiró la integración prevista con una API).

**Por qué es una tabla independiente.** El clima se registra varias veces por vuelo (reevaluaciones) y es un hecho con autor y fecha, por lo que se conserva el historial en lugar de un único campo del vuelo.

**Qué dejaría de funcionar sin ella.** No quedaría constancia de la evaluación meteorológica del comandante en el vuelo.

### C. Descripción campo por campo

#### `fecha_registro`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_registro` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Instante en que el comandante registró el clima. |
| Justificación | Orden cronológico. |
| Contenido | Fecha y hora. |
| Origen | @CreationTimestamp / DEFAULT SYSDATETIME(). |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | DEFAULT sysdatetime() |

#### `observaciones_clima`

| Atributo | Detalle |
|---|---|
| Nombre | `observaciones_clima` |
| Tipo de dato | `nvarchar(max)` |
| Nulabilidad | **Permite NULL.** Opcional; NULL si el comandante no agrega notas. |
| Función | Notas adicionales. |
| Justificación | Contexto de la decisión. |
| Contenido | Texto. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | — |

#### `condiciones`

| Atributo | Detalle |
|---|---|
| Nombre | `condiciones` |
| Tipo de dato | `nvarchar(max)` |
| Nulabilidad | **Permite NULL.** Nullable en el esquema (V21 lo agregó como NULL para migrar datos); el servicio lo exige no vacío. |
| Función | Descripción del clima observado. |
| Justificación | Es el dato central de la constancia. |
| Contenido | Texto libre. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | Obligatorio en el servicio. |

#### `favorable`

| Atributo | Detalle |
|---|---|
| Nombre | `favorable` |
| Tipo de dato | `bit` |
| Nulabilidad | **Permite NULL.** Nullable en el esquema; la API siempre lo informa. |
| Función | Juicio del comandante: apto o no apto. |
| Justificación | Resumen binario para Operaciones. |
| Contenido | 0/1. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | Obligatorio en la API. |

#### `id_instantaneas_clima`

| Atributo | Detalle |
|---|---|
| Nombre | `id_instantaneas_clima` |
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
| Función | Vuelo evaluado. |
| Justificación | Agrupa por vuelo. |
| Contenido | Identificador de `vuelos`. |
| Origen | Backend. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `vuelos.id_vuelos` (borrado: **CASCADE**); NOT NULL, FK CASCADE. |

#### `id_usuario_registrador`

| Atributo | Detalle |
|---|---|
| Nombre | `id_usuario_registrador` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Comandante que registró. |
| Justificación | Atribución. |
| Contenido | Identificador de `usuarios`. |
| Origen | Usuario autenticado. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `usuarios.id_usuarios` (borrado: NO ACTION); NOT NULL, FK. |

### D. Momento en que se crea un registro

**Escenario 1: El comandante registra el clima**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | COMANDANTE asignado |
| Pantalla / componente y acción | Pantalla del comandante (`Cmd`, `main.jsx`) → **Registrar clima**. |
| Datos que aporta el usuario | Condiciones, favorable sí/no, observaciones. |
| Endpoint | `POST /api/flights/{id}/weather` |
| Servicio | `FlightService.registerWeather` |
| Validaciones y condiciones | El usuario debe ser el comandante asignado y activo (no bloqueado por informes vencidos); el vuelo debe estar PLANIFICADO; condiciones no vacías (`@NotBlank`); favorable obligatorio (`@NotNull`). |
| Mecanismo que crea el registro | `weather.saveAndFlush(w)`. |
| Columnas completadas y de dónde sale cada valor | `id_vuelos`; `id_usuario_registrador` ← comandante; `condiciones`, `favorable`, `observaciones_clima` ← formulario; `fecha_registro` ← @CreationTimestamp. |
| Columnas que quedan NULL o con valor predeterminado | `observaciones_clima` si no se escribieron. |
| Otros registros creados en la misma operación | Evento `WEATHER/CREATE` en auditoría. |
| Si la operación falla / atomicidad | Atómico. |

### E. Ejemplo funcional completo

**Situación:** el comandante evalúa el clima la víspera del vuelo 900.

| id | id_vuelos | id_usuario_registrador | condiciones | favorable | observaciones_clima | fecha_registro |
|---|---|---|---|---|---|---|
| 5 | 900 | 55 | Visibilidad 10 km, viento 8 kt | 1 | Sin tormentas en ruta | 2026-11-03 18:00 |

Si por la mañana empeora, registra otra fila con `favorable`=0; la lista (`GET …/weather`) muestra la más reciente primero. Ninguna fila se edita.

### F. Ciclo de vida del registro

Cada fila se inserta una vez y **no se actualiza ni se borra** (no hay endpoint). La consulta devuelve el historial ordenado por fecha. No condiciona el inicio del vuelo (hoy no hay regla que exija «favorable»: observación).

### G. Relaciones con otras tablas

**Clave primaria:** `id_instantaneas_clima`.

**Claves foráneas salientes (tabla hija → padre):**

| Columna | Referencia | Borrado | Obligatoria |
|---|---|---|---|
| `id_usuario_registrador` | `usuarios.id_usuarios` (`fk_instantaneas_clima_id_usuario_registrador`) | NO ACTION | Obligatoria |
| `id_vuelos` | `vuelos.id_vuelos` (`fk_instantaneas_clima_id_vuelos`) | **CASCADE** | Obligatoria |

**Claves foráneas entrantes:** ninguna.

FK `id_vuelos` → `vuelos` (CASCADE) y `id_usuario_registrador` → `usuarios`.

### H. Restricciones y decisiones de diseño

**Índices (no PK):**

| Índice | Único | Columnas | Filtro | Incluye |
|---|---|---|---|---|
| `idx_instantaneas_clima_id_usuario_registrador` | no | id_usuario_registrador | — | — |
| `idx_instantaneas_clima_id_vuelos` | no | id_vuelos | — | — |
| `idx_instantaneas_clima_registrado_por_usuario_id` | no | id_usuario_registrador | — | — |
| `idx_instantaneas_clima_vuelo_id` | no | id_vuelos | — | — |

**Restricciones CHECK:** ninguna.

**Triggers:** ninguno.

**DEFAULT / IDENTITY / nulabilidad:** ver la ficha de cada columna en la sección C (los DEFAULT figuran en «Validaciones»).

- Sin CHECK (V21 eliminó el de JSON porque ya no hay JSON).
- **Observación:** el esquema admite `condiciones` y `favorable` NULL (resto de la migración desde datos antiguos), aunque el servicio exige ambos.

### I. Evidencia de implementación

- [`V1 (weather_snapshots)`](../../backend-java/src/main/resources/db/migration/V1__init_sanitary_flights_schema.sql#L180)
- [`V21 (clima manual)`](../../backend-java/src/main/resources/db/migration/V21__motivos_cancelacion_clima_manual_y_hangar.sql#L93)
- [`Entidad WeatherSnapshot`](../../backend-java/src/main/java/com/vuelossanitarios/backend/domain/flight/WeatherSnapshot.java#L19)
- [`FlightService.registerWeather`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/FlightService.java#L221)
- [`Controlador`](../../backend-java/src/main/java/com/vuelossanitarios/backend/api/FlightController.java#L40)
- [`Pantalla`](../../frontend-react/src/main.jsx#L533)

---

## 18. Tabla `rutas_vuelo`

### A. Identificación de la tabla

| Atributo | Detalle |
|---|---|
| Nombre exacto y esquema | `dbo.rutas_vuelo` (esquema `dbo`) |
| Módulo funcional | 3. Planificación y ejecución del vuelo |
| Tipo de tabla | Versionada con flujo de revisión — plan de ruta del comandante |
| Migración que la creó | V2 (como `flight_routes`) |
| Migraciones posteriores que modificaron su estructura | V4 (unicidad de versión), V8/V24/V27/V28, V37 (recorrido, alternativo, contexto operativo), V55 (estado de revisión y trazabilidad), V56 (índice por aeropuerto alternativo) |
| Estado actual en el esquema | Vigente — 22 columnas, PK `id_rutas_vuelo`, 5 FK salientes, 0 FK entrantes, 2 índice(s) único(s), 7 CHECK, 0 trigger(s) (verificado contra `sys.*` de la base E2E en Flyway V62) |
| Tablas relacionadas | vuelos, aeropuertos, usuarios |

### B. Funcionalidad y justificación

Guarda **la ruta que planificó el comandante** (recorrido, altitud, distancia, tiempo estimado, aeropuerto alternativo) y **el resultado de su revisión por Operaciones**. Cada guardado crea una **versión nueva**; la versión vigente debe estar APROBADA para poder iniciar el vuelo. Además registra el *contexto* con que se planificó (origen, destino, horarios, aeronave, comandante): si cambia alguno, la aprobación pierde validez (REQUIERE_REVISION) sin perder la versión.

**Por qué es una tabla independiente.** Una aprobación pertenece a una versión concreta (V55: «no crea tablas: una aprobación pertenece a una versión concreta y esa versión es una fila de rutas_vuelo»). El versionado permite devolver, corregir y volver a presentar sin perder el historial de lo que se presentó y decidió.

**Qué dejaría de funcionar sin ella.** No habría plan de ruta ni requisito de aprobación antes del inicio (`requireApprovedForStart`).

### C. Descripción campo por campo

#### `version`

| Atributo | Detalle |
|---|---|
| Nombre | `version` |
| Tipo de dato | `int` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Número de versión de la ruta del vuelo. |
| Justificación | Permite conservar todo lo presentado y decidido. |
| Contenido | Entero ≥ 1. |
| Origen | Backend (anterior + 1). |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | Índice único `uq_rutas_vuelo_4` sobre (id_vuelos, version); CHECK `ck_rutas_vuelo_1426104121`; DEFAULT 1; CHECK > 0; única con el vuelo (`uq_rutas_vuelo_4`). |

#### `es_version_actual`

| Atributo | Detalle |
|---|---|
| Nombre | `es_version_actual` |
| Tipo de dato | `bit` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Marca la versión vigente. |
| Justificación | Una sola ruta vigente por vuelo. |
| Contenido | 0/1. |
| Origen | Backend. |
| Momento inicial | 1 en el INSERT. |
| Modificación | Pasa a 0 cuando se crea una versión nueva. |
| Validaciones | DEFAULT 1; Índice único filtrado `uq_rutas_vuelo_actual`. |

#### `altitud_pies`

| Atributo | Detalle |
|---|---|
| Nombre | `altitud_pies` |
| Tipo de dato | `decimal(8,2)` |
| Nulabilidad | **Permite NULL.** Opcional: el comandante puede no informarla. |
| Función | Altitud de crucero planificada. |
| Justificación | Dato operativo de la ruta. |
| Contenido | Decimal (8,2) en pies. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | Sólo mediante nueva versión. |
| Validaciones | — |

#### `distancia_nm`

| Atributo | Detalle |
|---|---|
| Nombre | `distancia_nm` |
| Tipo de dato | `decimal(8,2)` |
| Nulabilidad | **Permite NULL.** Opcional. |
| Función | Distancia total en millas náuticas. |
| Justificación | Dato operativo. |
| Contenido | Decimal (8,2). |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | Nueva versión. |
| Validaciones | — |

#### `tiempo_estimado_minutos`

| Atributo | Detalle |
|---|---|
| Nombre | `tiempo_estimado_minutos` |
| Tipo de dato | `int` |
| Nulabilidad | **Permite NULL.** Opcional. |
| Función | Duración estimada en minutos. |
| Justificación | Compara con la ventana horaria. |
| Contenido | Entero. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | Nueva versión. |
| Validaciones | — |

#### `observaciones_ruta`

| Atributo | Detalle |
|---|---|
| Nombre | `observaciones_ruta` |
| Tipo de dato | `nvarchar(max)` |
| Nulabilidad | **Permite NULL.** Opcional. |
| Función | Notas del comandante. |
| Justificación | Contexto de la planificación. |
| Contenido | Texto. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | Nueva versión. |
| Validaciones | — |

#### `fecha_creacion`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_creacion` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Registra el instante en que la versión de la ruta se incorporó al sistema. |
| Justificación | Permite ordenar cronológicamente, reconstruir el historial y aportar trazabilidad sin depender de la auditoría. |
| Contenido | Fecha y hora (DATETIME2) de la inserción. |
| Origen | Automático: DEFAULT `SYSDATETIME()` de SQL Server o `@CreationTimestamp` de Hibernate (según la entidad); el usuario nunca ingresa esta fecha. |
| Momento inicial | En el INSERT. |
| Modificación | Inmutable: ningún flujo la actualiza (`updatable=false` en la entidad). |
| Validaciones | DEFAULT sysdatetime() |

#### `id_rutas_vuelo`

| Atributo | Detalle |
|---|---|
| Nombre | `id_rutas_vuelo` |
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
| Función | Vuelo al que pertenece. |
| Justificación | Una ruta por vuelo (con historial). |
| Contenido | Identificador de `vuelos`. |
| Origen | Backend. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `vuelos.id_vuelos` (borrado: **CASCADE**); Índice único `uq_rutas_vuelo_4` sobre (id_vuelos, version); Índice único `uq_rutas_vuelo_actual` filtrado `es_version_actual=(1)`; NOT NULL, FK CASCADE. |

#### `id_usuario_creador`

| Atributo | Detalle |
|---|---|
| Nombre | `id_usuario_creador` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Comandante autor de la versión. |
| Justificación | Responsabilidad. |
| Contenido | Identificador de `usuarios`. |
| Origen | Usuario autenticado. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `usuarios.id_usuarios` (borrado: NO ACTION); NOT NULL, FK. |

#### `recorrido_planificado`

| Atributo | Detalle |
|---|---|
| Nombre | `recorrido_planificado` |
| Tipo de dato | `nvarchar(max)` |
| Nulabilidad | **Permite NULL.** La columna admite NULL (V37 la agregó sobre filas de V2) aunque el servicio lo exige. |
| Función | Descripción del recorrido (puntos, aerovías). |
| Justificación | Núcleo de la ruta. |
| Contenido | Texto de hasta 4000 caracteres. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | Nueva versión. |
| Validaciones | Obligatorio en la API (`@NotBlank`). |

#### `id_aeropuerto_alternativo`

| Atributo | Detalle |
|---|---|
| Nombre | `id_aeropuerto_alternativo` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** Opcional. |
| Función | Aeropuerto alternativo previsto. |
| Justificación | Seguridad operacional ante imposibilidad de aterrizar. |
| Contenido | Identificador de `aeropuertos`. |
| Origen | Selector de aeropuerto. |
| Momento inicial | En el INSERT. |
| Modificación | Nueva versión. |
| Validaciones | FOREIGN KEY → `aeropuertos.id_aeropuertos` (borrado: NO ACTION); FK; activo y ≠ destino (servicio). |

#### `contexto_operativo`

| Atributo | Detalle |
|---|---|
| Nombre | `contexto_operativo` |
| Tipo de dato | `nvarchar(300)` |
| Nulabilidad | **Permite NULL.** NULL en rutas anteriores a V37: se evalúan como «no registró las condiciones» y requieren revisión. |
| Función | Huella de las condiciones del vuelo al planificar. |
| Justificación | Detecta si cambió algo material y la aprobación dejó de valer. |
| Contenido | Cadena «idAeronave\|idOrigen\|idDestino\|salida\|llegada\|idComandante». |
| Origen | Backend (`context(f)`). |
| Momento inicial | En el INSERT. |
| Modificación | No cambia (se compara con el vuelo actual). |
| Validaciones | — |

#### `estado_revision`

| Atributo | Detalle |
|---|---|
| Nombre | `estado_revision` |
| Tipo de dato | `varchar(25)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Estado de revisión de esta versión. |
| Justificación | Controla qué puede hacerse (presentar, aprobar, iniciar). |
| Contenido | BORRADOR, PENDIENTE_REVISION, APROBADA, DEVUELTA, REQUIERE_REVISION, SIN_REVISION. |
| Origen | Backend. |
| Momento inicial | BORRADOR. |
| Modificación | Presentación, decisión, invalidación. |
| Validaciones | CHECK `ck_rutas_vuelo_decision`; CHECK `ck_rutas_vuelo_devolucion`; CHECK `ck_rutas_vuelo_estado_revision`; CHECK `ck_rutas_vuelo_invalidacion`; CHECK `ck_rutas_vuelo_presentacion`; CHECK de conjunto y de coherencia. |

#### `motivo_modificacion`

| Atributo | Detalle |
|---|---|
| Nombre | `motivo_modificacion` |
| Tipo de dato | `nvarchar(500)` |
| Nulabilidad | **Permite NULL.** NULL en la primera versión o si la anterior no había sido presentada. |
| Función | Por qué se modificó una ruta ya presentada. |
| Justificación | Explica el cambio a Operaciones. |
| Contenido | Hasta 500 caracteres. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | Nueva versión. |
| Validaciones | Obligatorio (≥ 8 caracteres) si la anterior fue presentada. |

#### `id_usuario_presenta`

| Atributo | Detalle |
|---|---|
| Nombre | `id_usuario_presenta` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** NULL en BORRADOR; lo completa el comandante al presentar. |
| Función | Comandante que presentó la versión. |
| Justificación | Impide la autorrevisión. |
| Contenido | Identificador de `usuarios`. |
| Origen | Usuario autenticado. |
| Momento inicial | NULL. |
| Modificación | Al presentar. |
| Validaciones | FOREIGN KEY → `usuarios.id_usuarios` (borrado: NO ACTION); CHECK `ck_rutas_vuelo_presentacion`; CHECK `ck_rutas_vuelo_revisor_distinto`; CHECK de presentación y de revisor distinto. |

#### `fecha_presentacion`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_presentacion` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **Permite NULL.** NULL en BORRADOR/SIN_REVISION. |
| Función | Cuándo se presentó. |
| Justificación | Orden de la cola de revisión. |
| Contenido | Fecha y hora. |
| Origen | Backend. |
| Momento inicial | NULL. |
| Modificación | Al presentar. |
| Validaciones | CHECK `ck_rutas_vuelo_presentacion`; CHECK de presentación. |

#### `id_usuario_revisor`

| Atributo | Detalle |
|---|---|
| Nombre | `id_usuario_revisor` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** NULL mientras no hay decisión; se conserva al invalidar. |
| Función | Operador que decidió. |
| Justificación | Responsabilidad de la aprobación/devolución. |
| Contenido | Identificador de `usuarios`. |
| Origen | Usuario de Operaciones. |
| Momento inicial | NULL. |
| Modificación | Al aprobar o devolver. |
| Validaciones | FOREIGN KEY → `usuarios.id_usuarios` (borrado: NO ACTION); CHECK `ck_rutas_vuelo_decision`; CHECK `ck_rutas_vuelo_revisor_distinto`; CHECK de decisión; distinto del que presentó. |

#### `fecha_revision`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_revision` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **Permite NULL.** Idem. |
| Función | Cuándo se decidió. |
| Justificación | Trazabilidad. |
| Contenido | Fecha y hora. |
| Origen | Backend. |
| Momento inicial | NULL. |
| Modificación | Al decidir. |
| Validaciones | CHECK `ck_rutas_vuelo_decision`; CHECK de decisión. |

#### `observaciones_revision`

| Atributo | Detalle |
|---|---|
| Nombre | `observaciones_revision` |
| Tipo de dato | `nvarchar(1000)` |
| Nulabilidad | **Permite NULL.** Opcional en aprobaciones. |
| Función | Comentario del revisor. |
| Justificación | En una devolución explica qué corregir. |
| Contenido | Hasta 1000 caracteres. |
| Origen | Formulario. |
| Momento inicial | NULL. |
| Modificación | Al decidir. |
| Validaciones | CHECK `ck_rutas_vuelo_devolucion`; CHECK: obligatoria en DEVUELTA. |

#### `fecha_invalidacion`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_invalidacion` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **Permite NULL.** NULL salvo REQUIERE_REVISION. |
| Función | Cuándo la versión perdió validez. |
| Justificación | Auditar el motivo de re-presentación. |
| Contenido | Fecha y hora. |
| Origen | `reassess`. |
| Momento inicial | NULL. |
| Modificación | Al invalidar. |
| Validaciones | CHECK `ck_rutas_vuelo_invalidacion`; CHECK: obligatoria en REQUIERE_REVISION. |

#### `causa_invalidacion`

| Atributo | Detalle |
|---|---|
| Nombre | `causa_invalidacion` |
| Tipo de dato | `nvarchar(500)` |
| Nulabilidad | **Permite NULL.** NULL salvo REQUIERE_REVISION. |
| Función | Qué cambió en el vuelo. |
| Justificación | Informa al comandante qué rehacer. |
| Contenido | Hasta 500 caracteres. |
| Origen | `causes(...)`. |
| Momento inicial | NULL. |
| Modificación | Al invalidar. |
| Validaciones | CHECK `ck_rutas_vuelo_invalidacion`; CHECK: obligatoria en REQUIERE_REVISION. |

### D. Momento en que se crea un registro

**Escenario 1: El comandante guarda la ruta (primer guardado o nueva versión)**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | COMANDANTE asignado |
| Pantalla / componente y acción | `FlightRoute` ([`flightRoute.jsx`](../../frontend-react/src/flightRoute.jsx)): «Guardar ruta» o «Guardar y presentar a Operaciones». |
| Datos que aporta el usuario | Recorrido (≤ 4000 caracteres), altitud, distancia (NM), tiempo estimado, observaciones, aeropuerto alternativo, motivo de modificación (obligatorio si la versión anterior ya fue presentada) y la versión que está viendo. |
| Endpoint | `PUT /api/flights/{id}/route` ([`FlightRouteController.java`](../../backend-java/src/main/java/com/vuelossanitarios/backend/api/FlightRouteController.java)) |
| Servicio | `FlightRouteService.save` (`@Transactional`) |
| Validaciones y condiciones | Comandante asignado y sin bloqueo por informes vencidos; vuelo PLANIFICADO con aeropuertos y horarios completos; versión enviada = versión vigente (si no, 409); alternativo activo y distinto del destino; no se acepta una ruta idéntica a la vigente; motivo ≥ 8 caracteres si cambia una ruta presentada. |
| Mecanismo que crea el registro | `routes.saveAndFlush(old)` (marca la anterior como no vigente; si estaba en BORRADOR/PENDIENTE pasa a SIN_REVISION) seguido de `routes.saveAndFlush(r)` (INSERT). |
| Columnas completadas y de dónde sale cada valor | `version` = anterior + 1; `es_version_actual`=1; `recorrido_planificado`, `altitud_pies`, `distancia_nm`, `tiempo_estimado_minutos`, `observaciones_ruta`, `id_aeropuerto_alternativo`, `motivo_modificacion` ← formulario; `contexto_operativo` ← cadena «aeronave\|origen\|destino\|salida\|llegada» calculada; `id_usuario_creador` ← comandante; `estado_revision` = BORRADOR; `fecha_creacion` ← @CreationTimestamp. |
| Columnas que quedan NULL o con valor predeterminado | Presentación, revisión e invalidación. |
| Otros registros creados en la misma operación | Auditoría `FLIGHT_ROUTE/CREATE\|UPDATE`; si se presenta, UPDATE a PENDIENTE_REVISION y notificación a Operaciones. |
| Si la operación falla / atomicidad | Atómico (UPDATE de la anterior + INSERT + posible presentación). |

### E. Ejemplo funcional completo

**Situación:** vuelo 900 planificado Tucumán → Salta.

1. El comandante guarda y presenta: fila v1 con `estado_revision`=BORRADOR → inmediatamente PENDIENTE_REVISION (`id_usuario_presenta`=55, `fecha_presentacion`).
2. Operaciones **devuelve con observaciones**: v1 → DEVUELTA (`id_usuario_revisor`=20, `fecha_revision`, `observaciones_revision`).
3. El comandante corrige: **no edita v1**; se crea v2 (BORRADOR) y v1 queda `es_version_actual`=0 conservando DEVUELTA. Presenta v2 con motivo de modificación.
4. Operaciones **aprueba** v2 → APROBADA (revisor ≠ quien presentó, CHECK).
5. Si luego se cambia la aeronave del vuelo, `reassess` pasa v2 a REQUIERE_REVISION con `fecha_invalidacion` y `causa_invalidacion` («cambió la aeronave»); el comandante debe guardar de nuevo.

| version | es_version_actual | estado_revision | presenta | revisor | observaciones_revision |
|---|---|---|---|---|---|
| 1 | 0 | DEVUELTA | 55 | 20 | Falta el alternativo |
| 2 | 1 | APROBADA | 55 | 21 | NULL |

### F. Ciclo de vida del registro

| Estado | Cómo se llega | Actor | Campos |
|---|---|---|---|
| BORRADOR | Guardar | Comandante | INSERT |
| PENDIENTE_REVISION | «Presentar a Operaciones» | Comandante | `id_usuario_presenta`, `fecha_presentacion` |
| APROBADA | «Aprobar ruta» | Operaciones (≠ quien presentó) | `id_usuario_revisor`, `fecha_revision`, `observaciones_revision` (opcional) |
| DEVUELTA | «Devolver con observaciones» | Operaciones | idem, observaciones obligatorias (≥ 10 caracteres con sentido) |
| REQUIERE_REVISION | Cambio de aeronave/comandante/aeropuertos/horarios del vuelo | Sistema (`reassess`) | `fecha_invalidacion`, `causa_invalidacion` (conserva revisor y fecha) |
| SIN_REVISION | Versión reemplazada sin decisión o anterior a V55 | Sistema | `es_version_actual`=0 |

Transición de borrado: no existe. Una versión histórica nunca se reabre.

### G. Relaciones con otras tablas

**Clave primaria:** `id_rutas_vuelo`.

**Claves foráneas salientes (tabla hija → padre):**

| Columna | Referencia | Borrado | Obligatoria |
|---|---|---|---|
| `id_aeropuerto_alternativo` | `aeropuertos.id_aeropuertos` (`FK_rutas_vuelo_aeropuerto_alternativo`) | NO ACTION | Opcional (NULL) |
| `id_usuario_creador` | `usuarios.id_usuarios` (`fk_rutas_vuelo_id_usuario_creador`) | NO ACTION | Obligatoria |
| `id_vuelos` | `vuelos.id_vuelos` (`fk_rutas_vuelo_id_vuelos`) | **CASCADE** | Obligatoria |
| `id_usuario_presenta` | `usuarios.id_usuarios` (`fk_rutas_vuelo_usuario_presenta`) | NO ACTION | Opcional (NULL) |
| `id_usuario_revisor` | `usuarios.id_usuarios` (`fk_rutas_vuelo_usuario_revisor`) | NO ACTION | Opcional (NULL) |

**Claves foráneas entrantes:** ninguna.

FK `id_vuelos` → `vuelos` (CASCADE), `id_aeropuerto_alternativo` → `aeropuertos` (opcional), `id_usuario_creador`, `id_usuario_presenta`, `id_usuario_revisor` → `usuarios`. Consumida por `FlightService.start` (exige ruta aprobada) y por la cola de revisión de Operaciones (`RouteReviewQueue`).

### H. Restricciones y decisiones de diseño

**Índices (no PK):**

| Índice | Único | Columnas | Filtro | Incluye |
|---|---|---|---|---|
| `idx_rutas_vuelo_aeropuerto_alternativo` | no | id_aeropuerto_alternativo | — | — |
| `idx_rutas_vuelo_creado_por_usuario_id` | no | id_usuario_creador | — | — |
| `idx_rutas_vuelo_estado_revision_actual` | no | estado_revision, id_vuelos | `es_version_actual=(1)` | — |
| `idx_rutas_vuelo_id_usuario_creador` | no | id_usuario_creador | — | — |
| `idx_rutas_vuelo_id_vuelos` | no | id_vuelos | — | — |
| `idx_rutas_vuelo_vuelo_id` | no | id_vuelos | — | — |
| `uq_rutas_vuelo_4` | sí | id_vuelos, version | — | — |
| `uq_rutas_vuelo_actual` | sí | id_vuelos | `es_version_actual=(1)` | — |

**Restricciones CHECK:** 

- `ck_rutas_vuelo_1426104121`: `(version>(0))`
- `ck_rutas_vuelo_decision`: `(NOT (estado_revision='DEVUELTA' OR estado_revision='APROBADA') OR id_usuario_revisor IS NOT NULL AND fecha_revision IS NOT NULL)`
- `ck_rutas_vuelo_devolucion`: `(estado_revision<>'DEVUELTA' OR observaciones_revision IS NOT NULL AND len(ltrim(rtrim(observaciones_revision)))>(0))`
- `ck_rutas_vuelo_estado_revision`: `(estado_revision='SIN_REVISION' OR estado_revision='REQUIERE_REVISION' OR estado_revision='DEVUELTA' OR estado_revision='APROBADA' OR estado_revision='PENDIENTE_REVISION' OR estado_revision='BORRADOR')`
- `ck_rutas_vuelo_invalidacion`: `(estado_revision<>'REQUIERE_REVISION' OR fecha_invalidacion IS NOT NULL AND causa_invalidacion IS NOT NULL)`
- `ck_rutas_vuelo_presentacion`: `(NOT (estado_revision='DEVUELTA' OR estado_revision='APROBADA' OR estado_revision='PENDIENTE_REVISION') OR id_usuario_presenta IS NOT NULL AND fecha_presentacion IS NOT NULL)`
- `ck_rutas_vuelo_revisor_distinto`: `(id_usuario_revisor IS NULL OR id_usuario_presenta IS NULL OR id_usuario_revisor<>id_usuario_presenta)`

**Triggers:** ninguno.

**DEFAULT / IDENTITY / nulabilidad:** ver la ficha de cada columna en la sección C (los DEFAULT figuran en «Validaciones»).

- **Versionado de filas:** cada modificación inserta una fila nueva con `version` + 1 y marca la anterior `es_version_actual` = 0 (nunca se sobrescribe). Un índice único filtrado (`WHERE es_version_actual = 1`) garantiza una sola versión vigente por clave lógica y otro (vuelo, versión) impide repetir números. 
- **CHECK de revisión (V55):** estados válidos; una versión PENDIENTE/APROBADA/DEVUELTA conserva quién presentó y cuándo; APROBADA/DEVUELTA conservan revisor y fecha; DEVUELTA exige observaciones; REQUIERE_REVISION exige fecha y causa de invalidación; **nadie revisa lo que presentó**.
- **`idx_rutas_vuelo_estado_revision_actual`:** cola de revisión de Operaciones.
- **`idx_rutas_vuelo_aeropuerto_alternativo` (V56):** evita escaneos al contar referencias en la baja de un aeropuerto.
- **Observación:** el trabajo de invalidación es en Java (`reassess`); la base no recalcula el contexto.

### I. Evidencia de implementación

- [`V2 (creación)`](../../backend-java/src/main/resources/db/migration/V2__planning_phase_tables.sql#L43)
- [`V37 (planificación de rutas)`](../../backend-java/src/main/resources/db/migration/V37__planificacion_rutas.sql#L1)
- [`V55 (revisión)`](../../backend-java/src/main/resources/db/migration/V55__revision_operativa_rutas.sql#L42)
- [`Entidad FlightRoute`](../../backend-java/src/main/java/com/vuelossanitarios/backend/domain/flight/FlightRoute.java#L22)
- [`FlightRouteService.save`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/FlightRouteService.java#L74)
- [`FlightRouteService.approve`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/FlightRouteService.java#L106)
- [`FlightRouteService.reassess`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/FlightRouteService.java#L132)
- [`Controlador`](../../backend-java/src/main/java/com/vuelossanitarios/backend/api/FlightRouteController.java#L19)
- [`Pantalla del comandante / cola`](../../frontend-react/src/flightRoute.jsx#L42)
- [`Prueba: FlightRouteReviewIntegrationTest`](../../backend-java/src/test/java/com/vuelossanitarios/backend/service/FlightRouteReviewIntegrationTest.java#L38)
- [`Prueba: FlightRouteServiceTest`](../../backend-java/src/test/java/com/vuelossanitarios/backend/service/FlightRouteServiceTest.java#L17)

---

## 19. Tabla `informacion_hangar`

### A. Identificación de la tabla

| Atributo | Detalle |
|---|---|
| Nombre exacto y esquema | `dbo.informacion_hangar` (esquema `dbo`) |
| Módulo funcional | 3. Planificación y ejecución del vuelo |
| Tipo de tabla | Versionada — preparación en hangar |
| Migración que la creó | V2 (como `hangar_info`) |
| Migraciones posteriores que modificaron su estructura | V4 (unicidad), V8/V24/V27/V28, V21 (retira el checklist JSON), V39 (requiere_hangar, observaciones del comandante, contexto), V40 (restablece la versión vigente única), V56 (índice por origen de contexto) |
| Estado actual en el esquema | Vigente — 14 columnas, PK `id_informacion_hangar`, 5 FK salientes, 0 FK entrantes, 2 índice(s) único(s), 0 CHECK, 0 trigger(s) (verificado contra `sys.*` de la base E2E en Flyway V62) |
| Tablas relacionadas | vuelos, aeronaves, aeropuertos, usuarios |

### B. Funcionalidad y justificación

Registra **si el vuelo requiere hangar y si la preparación de salida está completa**, con observaciones de Operaciones y, aparte, del comandante. Cada cambio es una versión nueva. Guarda la aeronave, el origen y el comandante vigentes en ese momento (*contexto*): si cambian, el registro pasa a «requiere revisión».

**Por qué es una tabla independiente.** Una preparación depende del contexto (aeronave, origen) y se revisa en cada cambio; el versionado y el contexto no caben en el vuelo.

**Qué dejaría de funcionar sin ella.** Operaciones no podría documentar la preparación en hangar ni el comandante dejar observaciones sobre ella.

### C. Descripción campo por campo

#### `version`

| Atributo | Detalle |
|---|---|
| Nombre | `version` |
| Tipo de dato | `int` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Número de versión. |
| Justificación | Historial de preparación. |
| Contenido | Entero ≥ 1. |
| Origen | Backend. |
| Momento inicial | 1 en el primer registro. |
| Modificación | No cambia. |
| Validaciones | Índice único `uq_informacion_hangar_4` sobre (id_vuelos, version); DEFAULT 1; Único con el vuelo (`uq_informacion_hangar_4`). |

#### `es_version_actual`

| Atributo | Detalle |
|---|---|
| Nombre | `es_version_actual` |
| Tipo de dato | `bit` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Marca la versión vigente. |
| Justificación | Una sola vigente por vuelo. |
| Contenido | 0/1. |
| Origen | Backend. |
| Momento inicial | 1. |
| Modificación | Pasa a 0 con la versión siguiente. |
| Validaciones | DEFAULT 1; Índice único filtrado `uq_informacion_hangar_version_actual` (V40). |

#### `combustible_litros`

| Atributo | Detalle |
|---|---|
| Nombre | `combustible_litros` |
| Tipo de dato | `decimal(10,2)` |
| Nulabilidad | **Permite NULL.** Columna sin escritura: nunca recibe valores desde la aplicación (hallazgo). |
| Función | Combustible cargado en litros. |
| Justificación | Previsto para registrar la carga previa al vuelo. |
| Contenido | Decimal (10,2). |
| Origen | Ningún flujo actual lo informa. |
| Momento inicial | NULL. |
| Modificación | Sólo se copia entre versiones (siempre NULL). |
| Validaciones | — |

#### `preparacion_completa`

| Atributo | Detalle |
|---|---|
| Nombre | `preparacion_completa` |
| Tipo de dato | `bit` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Marca que la preparación de salida está lista. |
| Justificación | Habilita el avance a la salida. |
| Contenido | 0/1. |
| Origen | Formulario de Operaciones. |
| Momento inicial | 0 (DEFAULT) o el valor informado. |
| Modificación | Nueva versión. |
| Validaciones | DEFAULT 0; No si no se requiere hangar; exige aeronave en el origen. |

#### `observaciones_hangar`

| Atributo | Detalle |
|---|---|
| Nombre | `observaciones_hangar` |
| Tipo de dato | `nvarchar(max)` |
| Nulabilidad | **Permite NULL.** Opcional. |
| Función | Observaciones de Operaciones. |
| Justificación | Detalle de la preparación. |
| Contenido | Texto. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | Nueva versión. |
| Validaciones | — |

#### `fecha_creacion`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_creacion` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Registra el instante en que la versión del hangar se incorporó al sistema. |
| Justificación | Permite ordenar cronológicamente, reconstruir el historial y aportar trazabilidad sin depender de la auditoría. |
| Contenido | Fecha y hora (DATETIME2) de la inserción. |
| Origen | Automático: DEFAULT `SYSDATETIME()` de SQL Server o `@CreationTimestamp` de Hibernate (según la entidad); el usuario nunca ingresa esta fecha. |
| Momento inicial | En el INSERT. |
| Modificación | Inmutable: ningún flujo la actualiza (`updatable=false` en la entidad). |
| Validaciones | DEFAULT sysdatetime() |

#### `id_informacion_hangar`

| Atributo | Detalle |
|---|---|
| Nombre | `id_informacion_hangar` |
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
| Función | Vuelo. |
| Justificación | Un hangar por vuelo (con historial). |
| Contenido | Identificador de `vuelos`. |
| Origen | Backend. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `vuelos.id_vuelos` (borrado: **CASCADE**); Índice único `uq_informacion_hangar_4` sobre (id_vuelos, version); Índice único `uq_informacion_hangar_version_actual` filtrado `es_version_actual=(1)`; NOT NULL, FK CASCADE. |

#### `id_usuario_registrador`

| Atributo | Detalle |
|---|---|
| Nombre | `id_usuario_registrador` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Quién registró la versión. |
| Justificación | Atribución. |
| Contenido | Identificador de `usuarios`. |
| Origen | Usuario autenticado. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `usuarios.id_usuarios` (borrado: NO ACTION); NOT NULL, FK. |

#### `requiere_hangar`

| Atributo | Detalle |
|---|---|
| Nombre | `requiere_hangar` |
| Tipo de dato | `bit` |
| Nulabilidad | **Permite NULL.** NULL en versiones anteriores a V39: se interpretan «a revisar» (estado REQUIERE_REVISION). |
| Función | Si el vuelo requiere hangar. |
| Justificación | Si no se requiere, no hay preparación que completar. |
| Contenido | 0/1. |
| Origen | Formulario. |
| Momento inicial | En el INSERT (V39 lo permite NULL). |
| Modificación | Nueva versión. |
| Validaciones | — |

#### `observaciones_comandante`

| Atributo | Detalle |
|---|---|
| Nombre | `observaciones_comandante` |
| Tipo de dato | `nvarchar(max)` |
| Nulabilidad | **Permite NULL.** NULL hasta que el comandante observe. |
| Función | Observación del comandante. |
| Justificación | El comandante deja constancia sobre lo informado por Operaciones. |
| Contenido | Texto. |
| Origen | Formulario del comandante. |
| Momento inicial | NULL. |
| Modificación | Con cada observación (nueva versión); se limpia si cambia el contexto. |
| Validaciones | — |

#### `id_aeronave_contexto`

| Atributo | Detalle |
|---|---|
| Nombre | `id_aeronave_contexto` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** NULL si el vuelo aún no tenía aeronave. |
| Función | Aeronave del vuelo al registrar. |
| Justificación | Detectar cambios que invalidan la preparación. |
| Contenido | Identificador de `aeronaves`. |
| Origen | Backend. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `aeronaves.id_aeronaves` (borrado: NO ACTION); FK. |

#### `id_origen_contexto`

| Atributo | Detalle |
|---|---|
| Nombre | `id_origen_contexto` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** NULL si no había origen planificado. |
| Función | Origen del vuelo al registrar. |
| Justificación | Idem. |
| Contenido | Identificador de `aeropuertos`. |
| Origen | Backend. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `aeropuertos.id_aeropuertos` (borrado: NO ACTION); FK. |

#### `id_comandante_contexto`

| Atributo | Detalle |
|---|---|
| Nombre | `id_comandante_contexto` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** NULL si no había comandante. |
| Función | Comandante del vuelo al registrar. |
| Justificación | Idem. |
| Contenido | Identificador de `usuarios`. |
| Origen | Backend. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `usuarios.id_usuarios` (borrado: NO ACTION); FK. |

### D. Momento en que se crea un registro

**Escenario 1: Operaciones registra la información de hangar**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | Operaciones / Centro de Operaciones |
| Pantalla / componente y acción | `HangarInfo` ([`main.jsx`](../../frontend-react/src/main.jsx), línea 437): **Guardar información de hangar**. |
| Datos que aporta el usuario | Versión vista, requiere hangar, preparación completa, observaciones. |
| Endpoint | `PUT /api/flights/{id}/hangar` ([`HangarInfoController.java`](../../backend-java/src/main/java/com/vuelossanitarios/backend/api/HangarInfoController.java)) |
| Servicio | `HangarInfoService.save` |
| Validaciones y condiciones | Rol de Operaciones; vuelo editable; versión = vigente; no se marca «preparación completa» si no se requiere hangar; la preparación completa exige aeronave y origen y que la aeronave esté confirmada en el origen planificado; no puede completarse con el vuelo en curso. |
| Mecanismo que crea el registro | `records.saveAndFlush(old)` (versión anterior a no vigente) + `records.saveAndFlush(n)`. |
| Columnas completadas y de dónde sale cada valor | `version`, `es_version_actual`=1, `requiere_hangar`, `preparacion_completa`, `observaciones_hangar` ← formulario/anterior; `observaciones_comandante` ← copia de la anterior (se limpia si el contexto cambió); `id_aeronave_contexto`, `id_origen_contexto`, `id_comandante_contexto` ← vuelo actual; `id_usuario_registrador` ← usuario. |
| Columnas que quedan NULL o con valor predeterminado | `combustible_litros` (nunca se informa). |
| Otros registros creados en la misma operación | Auditoría `HANGAR_INFO/CREATE\|UPDATE`. |
| Si la operación falla / atomicidad | Atómico. |

**Escenario 2: El comandante agrega su observación**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | COMANDANTE asignado |
| Pantalla / componente y acción | `HangarInfo`: **Guardar observación del comandante**. |
| Datos que aporta el usuario | Texto de la observación. |
| Endpoint | `PUT /api/flights/{id}/hangar/commander-observation` |
| Servicio | `HangarInfoService.observe` |
| Validaciones y condiciones | Operaciones debe haber registrado antes y el contexto debe coincidir; observación no vacía. |
| Mecanismo que crea el registro | Idem (nueva versión copiando lo anterior). |
| Columnas completadas y de dónde sale cada valor | Idem, con `observaciones_comandante` ← texto. |
| Columnas que quedan NULL o con valor predeterminado | Idem. |
| Otros registros creados en la misma operación | Auditoría `COMMANDER_OBSERVATION`. |
| Si la operación falla / atomicidad | Atómico. |

### E. Ejemplo funcional completo

**Situación:** vuelo 900.

| version | es_version_actual | requiere_hangar | preparacion_completa | observaciones_hangar | observaciones_comandante | id_aeronave_contexto | id_origen_contexto |
|---|---|---|---|---|---|---|---|
| 1 | 0 | 1 | 0 | Falta cargar oxígeno | NULL | 7 | 31 |
| 2 | 0 | 1 | 1 | Listo | NULL | 7 | 31 |
| 3 | 1 | 1 | 1 | Listo | Revisé el oxígeno | 7 | 31 |

Si luego se cambia la aeronave del vuelo, la vista calcula el estado «REQUIERE_REVISION» (el contexto guardado ya no coincide) y la próxima versión de Operaciones limpia la observación del comandante.

### F. Ciclo de vida del registro

Sin estado propio: el «estado» (SIN_REGISTRO, NO_REQUERIDO, PREPARACION_PENDIENTE, PREPARACION_COMPLETA, REQUIERE_REVISION) **se calcula al consultar** con la última versión y el contexto del vuelo (`HangarInfoService.view`). Cada actualización agrega una versión; las anteriores no se modifican salvo `es_version_actual`. Tras la cancelación o finalización del vuelo el registro se conserva sin cambios.

### G. Relaciones con otras tablas

**Clave primaria:** `id_informacion_hangar`.

**Claves foráneas salientes (tabla hija → padre):**

| Columna | Referencia | Borrado | Obligatoria |
|---|---|---|---|
| `id_aeronave_contexto` | `aeronaves.id_aeronaves` (`FK_hangar_aeronave_contexto`) | NO ACTION | Opcional (NULL) |
| `id_comandante_contexto` | `usuarios.id_usuarios` (`FK_hangar_comandante_contexto`) | NO ACTION | Opcional (NULL) |
| `id_origen_contexto` | `aeropuertos.id_aeropuertos` (`FK_hangar_origen_contexto`) | NO ACTION | Opcional (NULL) |
| `id_usuario_registrador` | `usuarios.id_usuarios` (`fk_informacion_hangar_id_usuario_registrador`) | NO ACTION | Obligatoria |
| `id_vuelos` | `vuelos.id_vuelos` (`fk_informacion_hangar_id_vuelos`) | **CASCADE** | Obligatoria |

**Claves foráneas entrantes:** ninguna.

FK `id_vuelos` → `vuelos` (CASCADE); `id_usuario_registrador` y `id_comandante_contexto` → `usuarios`; `id_aeronave_contexto` → `aeronaves`; `id_origen_contexto` → `aeropuertos`. Los tres «contexto» son referencias de comparación, no la ubicación oficial de la aeronave.

### H. Restricciones y decisiones de diseño

**Índices (no PK):**

| Índice | Único | Columnas | Filtro | Incluye |
|---|---|---|---|---|
| `idx_informacion_hangar_id_usuario_registrador` | no | id_usuario_registrador | — | — |
| `idx_informacion_hangar_id_vuelos` | no | id_vuelos | — | — |
| `idx_informacion_hangar_origen_contexto` | no | id_origen_contexto | — | — |
| `idx_informacion_hangar_registrado_por_usuario_id` | no | id_usuario_registrador | — | — |
| `idx_informacion_hangar_vuelo_id` | no | id_vuelos | — | — |
| `uq_informacion_hangar_4` | sí | id_vuelos, version | — | — |
| `uq_informacion_hangar_version_actual` | sí | id_vuelos | `es_version_actual=(1)` | — |

**Restricciones CHECK:** ninguna.

**Triggers:** ninguno.

**DEFAULT / IDENTITY / nulabilidad:** ver la ficha de cada columna en la sección C (los DEFAULT figuran en «Validaciones»).

- **Versionado de filas:** cada modificación inserta una fila nueva con `version` + 1 y marca la anterior `es_version_actual` = 0 (nunca se sobrescribe). Un índice único filtrado (`WHERE es_version_actual = 1`) garantiza una sola versión vigente por clave lógica y otro (vuelo, versión) impide repetir números. 
- **Observación:** `combustible_litros` existe desde V2 pero ninguna pantalla ni servicio lo informa (sólo se copia entre versiones).
- **`idx_informacion_hangar_origen_contexto` (V56):** acelera el recuento de referencias al desactivar un aeropuerto.

### I. Evidencia de implementación

- [`V2 (creación)`](../../backend-java/src/main/resources/db/migration/V2__planning_phase_tables.sql#L67)
- [`V39 (hangar operativo)`](../../backend-java/src/main/resources/db/migration/V39__informacion_hangar_operativa.sql#L2)
- [`V40 (versión vigente única)`](../../backend-java/src/main/resources/db/migration/V40__una_version_hangar_vigente.sql#L3)
- [`Entidad HangarInfo`](../../backend-java/src/main/java/com/vuelossanitarios/backend/domain/flight/HangarInfo.java#L19)
- [`HangarInfoService.save`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/HangarInfoService.java#L56)
- [`HangarInfoService.observe`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/HangarInfoService.java#L79)
- [`Controlador`](../../backend-java/src/main/java/com/vuelossanitarios/backend/api/HangarInfoController.java#L25)
- [`Pantalla`](../../frontend-react/src/main.jsx#L437)
- [`Prueba: HangarInfoServiceTest`](../../backend-java/src/test/java/com/vuelossanitarios/backend/service/HangarInfoServiceTest.java#L15)

---

## 20. Tabla `coordinaciones_aa2000`

### A. Identificación de la tabla

| Atributo | Detalle |
|---|---|
| Nombre exacto y esquema | `dbo.coordinaciones_aa2000` (esquema `dbo`) |
| Módulo funcional | 3. Planificación y ejecución del vuelo |
| Tipo de tabla | Versionada por gestión — coordinaciones con el operador aeroportuario |
| Migración que la creó | V2 (como `aa2000_coordination`) |
| Migraciones posteriores que modificaron su estructura | V4 (unicidad), V8/V24/V27/V28, V41 (gestiones independientes: aeropuerto, finalidad, comunicación, respuesta; estados de seguimiento), V56 (índice por aeropuerto) |
| Estado actual en el esquema | Vigente — 21 columnas, PK `id_coordinaciones_aa2000`, 3 FK salientes, 0 FK entrantes, 2 índice(s) único(s), 2 CHECK, 0 trigger(s) (verificado contra `sys.*` de la base E2E en Flyway V62) |
| Tablas relacionadas | vuelos, aeropuertos, usuarios |

### B. Funcionalidad y justificación

Registra las **gestiones de Operaciones con el operador aeroportuario (AA2000)**: pedido de slot, autorización de aterrizaje u otras. Cada gestión tiene su propio identificador y sus propias versiones; cada versión documenta aeropuerto, finalidad, descripción, canal y fecha de la comunicación, respuesta, fuente y referencia externa.

La respuesta es lo que Operaciones **declara** haber obtenido: el sistema no consulta a AA2000.

**Por qué es una tabla independiente.** Un vuelo puede requerir varias gestiones independientes (una por aeropuerto y finalidad); V41 reemplazó la «secuencia única por vuelo» por una secuencia de versiones *por gestión* (`identificador_gestion`).

**Qué dejaría de funcionar sin ella.** Operaciones no podría documentar autorizaciones aeroportuarias ni su seguimiento.

### C. Descripción campo por campo

#### `version`

| Atributo | Detalle |
|---|---|
| Nombre | `version` |
| Tipo de dato | `int` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Versión de la gestión. |
| Justificación | Historial de seguimiento. |
| Contenido | Entero ≥ 1. |
| Origen | Backend. |
| Momento inicial | 1. |
| Modificación | No cambia. |
| Validaciones | Índice único `uq_coordinacion_gestion_version` sobre (identificador_gestion, version); CHECK `ck_coordinaciones_aa2000_1458104235`; DEFAULT 1; CHECK > 0; única con la gestión. |

#### `es_version_actual`

| Atributo | Detalle |
|---|---|
| Nombre | `es_version_actual` |
| Tipo de dato | `bit` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Versión vigente de la gestión. |
| Justificación | Una por gestión. |
| Contenido | 0/1. |
| Origen | Backend. |
| Momento inicial | 1. |
| Modificación | Pasa a 0 con la siguiente versión. |
| Validaciones | DEFAULT 1; Índice único filtrado. |

#### `fecha_slot`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_slot` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **Permite NULL.** Opcional. |
| Función | Horario de slot acordado o solicitado. |
| Justificación | Dato operativo de la gestión. |
| Contenido | Fecha y hora. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | Nueva versión. |
| Validaciones | — |

#### `contacto_aa2000`

| Atributo | Detalle |
|---|---|
| Nombre | `contacto_aa2000` |
| Tipo de dato | `nvarchar(150)` |
| Nulabilidad | **Permite NULL.** NULL mientras no hubo comunicación. |
| Función | Contacto del operador aeroportuario. |
| Justificación | A quién se contactó. |
| Contenido | Hasta 150 caracteres. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | Nueva versión. |
| Validaciones | Obligatorio si hay comunicación (servicio). |

#### `estado_autorizacion`

| Atributo | Detalle |
|---|---|
| Nombre | `estado_autorizacion` |
| Tipo de dato | `nvarchar(30)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Estado de la gestión. |
| Justificación | Seguimiento del trámite. |
| Contenido | PENDIENTE, EN_SEGUIMIENTO, CONFIRMADO, RECHAZADO o CANCELADO. |
| Origen | Formulario (transición validada). |
| Momento inicial | PENDIENTE. |
| Modificación | Nueva versión. |
| Validaciones | CHECK `ck_coordinacion_estado_seguimiento`; DEFAULT N'PENDIENTE'; CHECK de estados; transiciones en el servicio. |

#### `observaciones_coordinacion`

| Atributo | Detalle |
|---|---|
| Nombre | `observaciones_coordinacion` |
| Tipo de dato | `nvarchar(max)` |
| Nulabilidad | **Permite NULL.** Opcional. |
| Función | Observaciones libres. |
| Justificación | Contexto adicional. |
| Contenido | Texto. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | Nueva versión. |
| Validaciones | — |

#### `fecha_creacion`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_creacion` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Registra el instante en que la versión de la gestión se incorporó al sistema. |
| Justificación | Permite ordenar cronológicamente, reconstruir el historial y aportar trazabilidad sin depender de la auditoría. |
| Contenido | Fecha y hora (DATETIME2) de la inserción. |
| Origen | Automático: DEFAULT `SYSDATETIME()` de SQL Server o `@CreationTimestamp` de Hibernate (según la entidad); el usuario nunca ingresa esta fecha. |
| Momento inicial | En el INSERT. |
| Modificación | Inmutable: ningún flujo la actualiza (`updatable=false` en la entidad). |
| Validaciones | DEFAULT sysdatetime() |

#### `id_coordinaciones_aa2000`

| Atributo | Detalle |
|---|---|
| Nombre | `id_coordinaciones_aa2000` |
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
| Función | Vuelo. |
| Justificación | Las gestiones son por vuelo. |
| Contenido | Identificador de `vuelos`. |
| Origen | Backend. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `vuelos.id_vuelos` (borrado: **CASCADE**); NOT NULL, FK CASCADE. |

#### `id_usuario_registrador`

| Atributo | Detalle |
|---|---|
| Nombre | `id_usuario_registrador` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Quién registró la versión. |
| Justificación | Atribución. |
| Contenido | Identificador de `usuarios`. |
| Origen | Usuario autenticado. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `usuarios.id_usuarios` (borrado: NO ACTION); NOT NULL, FK. |

#### `identificador_gestion`

| Atributo | Detalle |
|---|---|
| Nombre | `identificador_gestion` |
| Tipo de dato | `uniqueidentifier` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Identificador (UUID) de la gestión. |
| Justificación | Agrupa las versiones de una misma gestión; un vuelo puede tener varias. |
| Contenido | UUID. |
| Origen | Backend (`UUID.randomUUID()`). |
| Momento inicial | En el INSERT de la primera versión. |
| Modificación | No cambia. |
| Validaciones | Índice único `uq_coordinacion_gestion_actual` filtrado `es_version_actual=(1)`; Índice único `uq_coordinacion_gestion_version` sobre (identificador_gestion, version); NOT NULL desde V41; parte de dos índices únicos. |

#### `id_aeropuerto_gestion`

| Atributo | Detalle |
|---|---|
| Nombre | `id_aeropuerto_gestion` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** NULL en gestiones anteriores a V41 (históricos que no se asignan a un aeropuerto ficticio). |
| Función | Aeropuerto de la gestión. |
| Justificación | Identifica dónde se gestiona. |
| Contenido | Identificador de `aeropuertos`. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia (identifica la gestión). |
| Validaciones | FOREIGN KEY → `aeropuertos.id_aeropuertos` (borrado: NO ACTION); FK; aeropuerto activo. |

#### `finalidad_gestion`

| Atributo | Detalle |
|---|---|
| Nombre | `finalidad_gestion` |
| Tipo de dato | `nvarchar(200)` |
| Nulabilidad | **Permite NULL.** NULL en gestiones anteriores a V41. |
| Función | Para qué es la gestión. |
| Justificación | Junto al aeropuerto identifica la gestión. |
| Contenido | Hasta 200 caracteres. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | Obligatoria en el servicio. |

#### `descripcion_gestion`

| Atributo | Detalle |
|---|---|
| Nombre | `descripcion_gestion` |
| Tipo de dato | `nvarchar(max)` |
| Nulabilidad | **Permite NULL.** NULL en gestiones anteriores a V41. |
| Función | Detalle de lo gestionado. |
| Justificación | Documenta el trámite. |
| Contenido | Texto. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | Nueva versión. |
| Validaciones | Obligatoria en el servicio. |

#### `canal_comunicacion`

| Atributo | Detalle |
|---|---|
| Nombre | `canal_comunicacion` |
| Tipo de dato | `nvarchar(100)` |
| Nulabilidad | **Permite NULL.** NULL hasta documentar la comunicación. |
| Función | Medio usado (correo, teléfono…). |
| Justificación | Trazabilidad de la comunicación. |
| Contenido | Hasta 100 caracteres. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | Nueva versión. |
| Validaciones | Obligatorio si hay comunicación. |

#### `fecha_comunicacion`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_comunicacion` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **Permite NULL.** NULL mientras no se comunicó. |
| Función | Cuándo se comunicó el pedido. |
| Justificación | Evidencia temporal. |
| Contenido | Fecha y hora. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | Nueva versión. |
| Validaciones | No futura (servicio). |

#### `fecha_respuesta`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_respuesta` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **Permite NULL.** NULL hasta que haya respuesta declarada. |
| Función | Cuándo respondió el operador. |
| Justificación | Evidencia de la respuesta. |
| Contenido | Fecha y hora. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | Nueva versión. |
| Validaciones | Sólo para CONFIRMADO/RECHAZADO; ≥ comunicación. |

#### `fuente_respuesta`

| Atributo | Detalle |
|---|---|
| Nombre | `fuente_respuesta` |
| Tipo de dato | `nvarchar(250)` |
| Nulabilidad | **Permite NULL.** NULL hasta que haya respuesta. |
| Función | Evidencia verificable de la respuesta. |
| Justificación | Evita confirmaciones sin sustento. |
| Contenido | Hasta 250 caracteres. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | Nueva versión. |
| Validaciones | Obligatoria para CONFIRMADO/RECHAZADO. |

#### `referencia_externa`

| Atributo | Detalle |
|---|---|
| Nombre | `referencia_externa` |
| Tipo de dato | `nvarchar(250)` |
| Nulabilidad | **Permite NULL.** Opcional. |
| Función | Número de trámite externo. |
| Justificación | Cruce con el operador. |
| Contenido | Hasta 250 caracteres. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | Nueva versión. |
| Validaciones | — |

#### `contexto_planificacion`

| Atributo | Detalle |
|---|---|
| Nombre | `contexto_planificacion` |
| Tipo de dato | `nvarchar(500)` |
| Nulabilidad | **Permite NULL.** NULL en versiones anteriores a V41 (se tratan como «requiere revisión»). |
| Función | Huella de la planificación al registrar. |
| Justificación | Detectar que la gestión quedó desactualizada. |
| Contenido | Cadena «aeronave\|origen\|destino\|salida\|llegada». |
| Origen | Backend. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | — |

#### `motivo_cambio`

| Atributo | Detalle |
|---|---|
| Nombre | `motivo_cambio` |
| Tipo de dato | `nvarchar(1000)` |
| Nulabilidad | **Permite NULL.** NULL en la primera versión. |
| Función | Por qué se creó la nueva versión. |
| Justificación | Auditoría del seguimiento. |
| Contenido | Hasta 1000 caracteres. |
| Origen | Formulario. |
| Momento inicial | En la actualización. |
| Modificación | Nueva versión. |
| Validaciones | Obligatorio en actualizaciones. |

### D. Momento en que se crea un registro

**Escenario 1: Nueva gestión**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | Operaciones / Centro de Operaciones |
| Pantalla / componente y acción | `AirportCoordinations` ([`main.jsx`](../../frontend-react/src/main.jsx), línea 425): alta de gestión. |
| Datos que aporta el usuario | Aeropuerto, finalidad, descripción, estado (PENDIENTE), datos de comunicación opcionales, slot, observaciones. |
| Endpoint | `POST /api/flights/{id}/airport-coordinations` |
| Servicio | `Aa2000CoordinationService.create` |
| Validaciones y condiciones | Operaciones; vuelo editable; aeropuerto activo (bloqueo con `AirportLocks`); versión 0 y estado PENDIENTE; sin duplicado activo (mismo aeropuerto+finalidad, ignorando CANCELADO/RECHAZADO); fechas no futuras; reglas de comunicación/respuesta por estado. |
| Mecanismo que crea el registro | `records.saveAndFlush(r)`. |
| Columnas completadas y de dónde sale cada valor | `identificador_gestion` ← UUID nuevo; `version`=1; `es_version_actual`=1; `id_aeropuerto_gestion`, `finalidad_gestion`, `descripcion_gestion`, `estado_autorizacion`, `fecha_slot`, `contacto_aa2000`, `canal_comunicacion`, `fecha_comunicacion`, `fecha_respuesta`, `fuente_respuesta`, `referencia_externa`, `observaciones_coordinacion`, `motivo_cambio` ← formulario; `contexto_planificacion` ← huella del vuelo; `id_usuario_registrador` ← usuario. |
| Columnas que quedan NULL o con valor predeterminado | Los opcionales no informados. |
| Otros registros creados en la misma operación | Auditoría `AA2000_COORDINATION/CREATE`. |
| Si la operación falla / atomicidad | Atómico. |

**Escenario 2: Actualización de una gestión (nueva versión)**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | Operaciones / Centro de Operaciones |
| Pantalla / componente y acción | `AirportCoordinations`: **Actualizar gestión**. |
| Datos que aporta el usuario | Nuevo estado y datos; motivo del cambio obligatorio. |
| Endpoint | `PUT /api/flights/{id}/airport-coordinations/{group}` |
| Servicio | `Aa2000CoordinationService.update` |
| Validaciones y condiciones | Versión enviada = vigente; el aeropuerto y la finalidad no cambian; transición permitida (PENDIENTE→EN_SEGUIMIENTO/CONFIRMADO/RECHAZADO/CANCELADO; EN_SEGUIMIENTO→CONFIRMADO/RECHAZADO/CANCELADO; CONFIRMADO→EN_SEGUIMIENTO/CANCELADO; RECHAZADO→CANCELADO; CANCELADO final); CONFIRMADO/RECHAZADO exigen respuesta con fecha y fuente. |
| Mecanismo que crea el registro | UPDATE de la anterior (`es_version_actual`=0) + INSERT de la nueva. |
| Columnas completadas y de dónde sale cada valor | Idem con `version` + 1 y el mismo `identificador_gestion`. |
| Columnas que quedan NULL o con valor predeterminado | Idem. |
| Otros registros creados en la misma operación | Auditoría `UPDATE`. |
| Si la operación falla / atomicidad | Atómico, con bloqueo pesimista de la gestión. |

### E. Ejemplo funcional completo

**Situación:** Operaciones gestiona el slot en el aeropuerto de destino.

| identificador_gestion | version | es_version_actual | estado_autorizacion | canal | fecha_comunicacion | fecha_respuesta | fuente_respuesta | motivo_cambio |
|---|---|---|---|---|---|---|---|---|
| a1b2… | 1 | 0 | PENDIENTE | NULL | NULL | NULL | NULL | NULL |
| a1b2… | 2 | 0 | EN_SEGUIMIENTO | Correo | 2026-11-03 10:00 | NULL | NULL | Se envió el pedido |
| a1b2… | 3 | 1 | CONFIRMADO | Correo | 2026-11-03 10:00 | 2026-11-03 12:00 | Mail de AA2000 | Confirmación recibida |

Si cambia la aeronave del vuelo, la vigencia de la versión 3 se calcula como «REQUIERE_REVISION» (el contexto guardado no coincide).

### F. Ciclo de vida del registro

Cada gestión recorre PENDIENTE → EN_SEGUIMIENTO/CONFIRMADO/RECHAZADO → CANCELADO con una fila por cambio. No hay eliminación. Mientras el vuelo es editable se puede crear/actualizar; tras finalizar/cancelar queda de consulta.

### G. Relaciones con otras tablas

**Clave primaria:** `id_coordinaciones_aa2000`.

**Claves foráneas salientes (tabla hija → padre):**

| Columna | Referencia | Borrado | Obligatoria |
|---|---|---|---|
| `id_aeropuerto_gestion` | `aeropuertos.id_aeropuertos` (`FK_coordinacion_aeropuerto`) | NO ACTION | Opcional (NULL) |
| `id_usuario_registrador` | `usuarios.id_usuarios` (`fk_coordinaciones_aa2000_id_usuario_registrador`) | NO ACTION | Obligatoria |
| `id_vuelos` | `vuelos.id_vuelos` (`fk_coordinaciones_aa2000_id_vuelos`) | **CASCADE** | Obligatoria |

**Claves foráneas entrantes:** ninguna.

FK `id_vuelos` → `vuelos` (CASCADE), `id_aeropuerto_gestion` → `aeropuertos` (opcional; NULL en gestiones anteriores a V41), `id_usuario_registrador` → `usuarios`.

### H. Restricciones y decisiones de diseño

**Índices (no PK):**

| Índice | Único | Columnas | Filtro | Incluye |
|---|---|---|---|---|
| `idx_coordinaciones_aa2000_aeropuerto_gestion` | no | id_aeropuerto_gestion | — | — |
| `idx_coordinaciones_aa2000_id_usuario_registrador` | no | id_usuario_registrador | — | — |
| `idx_coordinaciones_aa2000_id_vuelos` | no | id_vuelos | — | — |
| `idx_coordinaciones_aa2000_registrado_por_usuario_id` | no | id_usuario_registrador | — | — |
| `idx_coordinaciones_aa2000_vuelo_id` | no | id_vuelos | — | — |
| `uq_coordinacion_gestion_actual` | sí | identificador_gestion | `es_version_actual=(1)` | — |
| `uq_coordinacion_gestion_version` | sí | identificador_gestion, version | — | — |

**Restricciones CHECK:** 

- `ck_coordinacion_estado_seguimiento`: `(estado_autorizacion=N'CANCELADO' OR estado_autorizacion=N'RECHAZADO' OR estado_autorizacion=N'CONFIRMADO' OR estado_autorizacion=N'EN_SEGUIMIENTO' OR estado_autorizacion=N'PENDIENTE')`
- `ck_coordinaciones_aa2000_1458104235`: `(version>(0))`

**Triggers:** ninguno.

**DEFAULT / IDENTITY / nulabilidad:** ver la ficha de cada columna en la sección C (los DEFAULT figuran en «Validaciones»).

- **`uq_coordinacion_gestion_version`** (gestión, versión) y **`uq_coordinacion_gestion_actual`** (una vigente por gestión).
- **`ck_coordinacion_estado_seguimiento`:** cinco estados.
- **`idx_coordinaciones_aa2000_aeropuerto_gestion` (V56).**
- **Observación:** el contacto se guarda en `contacto_aa2000` (nombre heredado) aunque V41 lo generalizó a cualquier contacto.

### I. Evidencia de implementación

- [`V2 (creación)`](../../backend-java/src/main/resources/db/migration/V2__planning_phase_tables.sql#L92)
- [`V41 (gestiones)`](../../backend-java/src/main/resources/db/migration/V41__coordinaciones_aeroportuarias.sql#L4)
- [`Entidad Aa2000Coordination`](../../backend-java/src/main/java/com/vuelossanitarios/backend/domain/flight/Aa2000Coordination.java#L23)
- [`Aa2000CoordinationService.create`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/Aa2000CoordinationService.java#L41)
- [`Aa2000CoordinationService.update`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/Aa2000CoordinationService.java#L51)
- [`Controlador`](../../backend-java/src/main/java/com/vuelossanitarios/backend/api/Aa2000CoordinationController.java#L11)
- [`Pantalla`](../../frontend-react/src/main.jsx#L425)
- [`Prueba: Aa2000CoordinationServiceTest`](../../backend-java/src/test/java/com/vuelossanitarios/backend/service/Aa2000CoordinationServiceTest.java#L16)

---

## 21. Tabla `bitacora_vuelos`

### A. Identificación de la tabla

| Atributo | Detalle |
|---|---|
| Nombre exacto y esquema | `dbo.bitacora_vuelos` (esquema `dbo`) |
| Módulo funcional | 3. Planificación y ejecución del vuelo |
| Tipo de tabla | Historial — bitácora operativa del vuelo (con columnas históricas) |
| Migración que la creó | V1 (como `flight_audit_log`, auditoría por campo) |
| Migraciones posteriores que modificaron su estructura | V8 (renombre), V24/V27, V38 (bitácora operativa: acontecimientos manuales y automáticos, correcciones, inmutabilidad) |
| Estado actual en el esquema | Vigente — 15 columnas, PK `id_bitacora_vuelos`, 3 FK salientes, 1 FK entrantes, 1 índice(s) único(s), 1 CHECK, 1 trigger(s) (verificado contra `sys.*` de la base E2E en Flyway V62) |
| Tablas relacionadas | vuelos, usuarios |

### B. Funcionalidad y justificación

Es el **libro de novedades del vuelo**: lo que ocurre durante el vuelo registrado por el comandante u Operaciones (preparación, demoras, incidencias, meteorología, aeronave, ejecución, cierre) y los hitos automáticos (INICIO, FINALIZACION, CANCELACION). Las entradas no se corrigen editándolas: se **corrige agregando una nueva entrada que referencia la anterior**.

Conserva además las filas del diseño original V1 (auditoría de cambios por campo); no es el mismo concepto que `eventos_auditoria` (auditoría técnica del sistema).

**Por qué es una tabla independiente.** La bitácora es un documento operativo con autor, hora del suceso y hora de registro, distinto de la auditoría general: la leen y escriben los operadores y el comandante.

**Qué dejaría de funcionar sin ella.** No habría registro narrativo de lo ocurrido durante la operación ni hitos de inicio, fin o cancelación.

### C. Descripción campo por campo

#### `id_bitacora_vuelos`

| Atributo | Detalle |
|---|---|
| Nombre | `id_bitacora_vuelos` |
| Tipo de dato | `bigint` — IDENTITY(1,1) |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Clave primaria de la tabla: identifica de forma única cada fila y es el valor que otras tablas, la API y la auditoría usan para referirse a ella. |
| Justificación | Un identificador técnico numérico, estable y sin significado de negocio evita depender de datos que pueden cambiar (nombres, códigos) y hace eficientes los JOIN y las claves foráneas (decisión V24/V27: «toda tabla de aplicación tiene su propio id_<tabla> BIGINT IDENTITY»). |
| Contenido | Número entero positivo correlativo (1, 2, 3…). No lo ingresa el usuario. |
| Origen | SQL Server, columna IDENTITY(1,1): se asigna en el propio INSERT. Hibernate lo declara `@GeneratedValue(strategy = IDENTITY)` y lo lee de vuelta tras insertar. |
| Momento inicial | En el INSERT; no existe fila sin identificador. |
| Modificación | Nunca cambia (inmutable; JPA lo declara `updatable=false`). |
| Validaciones | PRIMARY KEY; PRIMARY KEY (unicidad y NOT NULL); no se reutiliza al borrar filas. |

#### `campo`

| Atributo | Detalle |
|---|---|
| Nombre | `campo` |
| Tipo de dato | `nvarchar(100)` |
| Nulabilidad | **NOT NULL.** Campo heredado con valor constante: sin utilidad actual. |
| Función | Etiqueta del campo (diseño V1) o 'ACONTECIMIENTO_OPERATIVO' en las filas nuevas. |
| Justificación | Heredado del diseño de auditoría por campo; se conserva para no reinterpretar filas antiguas. |
| Contenido | Texto (siempre 'ACONTECIMIENTO_OPERATIVO' hoy). |
| Origen | Backend (constante). |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | NOT NULL. |

#### `valor_anterior`

| Atributo | Detalle |
|---|---|
| Nombre | `valor_anterior` |
| Tipo de dato | `nvarchar(max)` |
| Nulabilidad | **Permite NULL.** Columna heredada sin escritura (hallazgo). |
| Función | Valor previo del campo auditado (diseño V1). |
| Justificación | Parte del modelo original de auditoría de cambios. |
| Contenido | Texto. |
| Origen | Nadie lo escribe hoy. |
| Momento inicial | NULL. |
| Modificación | No cambia. |
| Validaciones | — |

#### `valor_nuevo`

| Atributo | Detalle |
|---|---|
| Nombre | `valor_nuevo` |
| Tipo de dato | `nvarchar(max)` |
| Nulabilidad | **Permite NULL.** Columna heredada sin escritura. |
| Función | Valor nuevo del campo auditado (diseño V1). |
| Justificación | Idem. |
| Contenido | Texto. |
| Origen | Nadie lo escribe hoy. |
| Momento inicial | NULL. |
| Modificación | No cambia. |
| Validaciones | — |

#### `fecha_cambio`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_cambio` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Instante de inserción de la fila. |
| Justificación | Orden cronológico técnico. |
| Contenido | Fecha y hora. |
| Origen | @CreationTimestamp / DEFAULT. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | DEFAULT sysdatetime() |

#### `id_vuelos`

| Atributo | Detalle |
|---|---|
| Nombre | `id_vuelos` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Vuelo de la bitácora. |
| Justificación | Agrupa por vuelo. |
| Contenido | Identificador de `vuelos`. |
| Origen | Backend. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `vuelos.id_vuelos` (borrado: **CASCADE**); Índice único `UX_bitacora_transicion` sobre (id_vuelos, tipo_acontecimiento) filtrado `origen_acontecimiento=N'AUTOMATICO'`; NOT NULL, FK CASCADE. |

#### `id_usuarios`

| Atributo | Detalle |
|---|---|
| Nombre | `id_usuarios` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** NULL sólo en filas históricas V1 (acciones del sistema). |
| Función | Autor de la entrada. |
| Justificación | Responsabilidad de lo registrado. |
| Contenido | Identificador de `usuarios`. |
| Origen | Usuario autenticado. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `usuarios.id_usuarios` (borrado: NO ACTION); CHECK `CK_bitacora_operativa`; FK; obligatorio en entradas operativas (CHECK). |

#### `tipo_acontecimiento`

| Atributo | Detalle |
|---|---|
| Nombre | `tipo_acontecimiento` |
| Tipo de dato | `nvarchar(40)` |
| Nulabilidad | **Permite NULL.** NULL en filas históricas V1. |
| Función | Clase de novedad. |
| Justificación | Permite filtrar y evitar duplicar hitos automáticos. |
| Contenido | Manual: PREPARACION, DEMORA, INCIDENCIA, METEOROLOGIA, AERONAVE, EJECUCION, CIERRE, OTRO; automático: INICIO, FINALIZACION, CANCELACION. |
| Origen | Formulario o sistema. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | Índice único `UX_bitacora_transicion` sobre (id_vuelos, tipo_acontecimiento) filtrado `origen_acontecimiento=N'AUTOMATICO'`; CHECK `CK_bitacora_operativa`; CHECK de la bitácora operativa. |

#### `descripcion_operativa`

| Atributo | Detalle |
|---|---|
| Nombre | `descripcion_operativa` |
| Tipo de dato | `nvarchar(4000)` |
| Nulabilidad | **Permite NULL.** NULL en filas históricas V1. |
| Función | Texto de la novedad. |
| Justificación | Cuerpo del libro. |
| Contenido | Hasta 4000 caracteres. |
| Origen | Formulario o texto fijo. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | CHECK `CK_bitacora_operativa`; CHECK: obligatorio si hay origen. |

#### `fecha_acontecimiento`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_acontecimiento` |
| Tipo de dato | `datetimeoffset(3)` |
| Nulabilidad | **Permite NULL.** NULL en filas históricas V1. |
| Función | Cuándo ocurrió el suceso. |
| Justificación | Orden cronológico del relato (puede ser anterior al registro). |
| Contenido | Fecha y hora con desplazamiento (UTC). |
| Origen | Formulario o reloj. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | CHECK `CK_bitacora_operativa`; No futura (servicio). |

#### `fecha_registro_operativo`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_registro_operativo` |
| Tipo de dato | `datetimeoffset(3)` |
| Nulabilidad | **Permite NULL.** NULL en filas históricas. |
| Función | Cuándo se registró. |
| Justificación | Distingue ocurrencia de registro (demoras en cargar). |
| Contenido | Fecha y hora con desplazamiento. |
| Origen | Backend. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | CHECK `CK_bitacora_operativa`; CHECK. |

#### `origen_acontecimiento`

| Atributo | Detalle |
|---|---|
| Nombre | `origen_acontecimiento` |
| Tipo de dato | `nvarchar(12)` |
| Nulabilidad | **Permite NULL.** NULL en filas históricas V1 (las únicas mutables). |
| Función | MANUAL o AUTOMATICO. |
| Justificación | Diferencia lo narrado por una persona de los hitos del sistema. |
| Contenido | MANUAL / AUTOMATICO. |
| Origen | Backend. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | CHECK `CK_bitacora_operativa`; CHECK; filtra la inmutabilidad. |

#### `importancia`

| Atributo | Detalle |
|---|---|
| Nombre | `importancia` |
| Tipo de dato | `nvarchar(12)` |
| Nulabilidad | **Permite NULL.** NULL en filas históricas. |
| Función | NORMAL o IMPORTANTE. |
| Justificación | Resalta novedades relevantes. |
| Contenido | NORMAL / IMPORTANTE. |
| Origen | Formulario o sistema. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | CHECK `CK_bitacora_operativa`; CHECK. |

#### `id_entrada_corregida`

| Atributo | Detalle |
|---|---|
| Nombre | `id_entrada_corregida` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** NULL salvo en correcciones. |
| Función | Entrada que esta nueva fila corrige. |
| Justificación | Corregir sin editar mantiene la historia. |
| Contenido | Identificador de la propia tabla. |
| Origen | Formulario (elige la entrada a corregir). |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `bitacora_vuelos.id_bitacora_vuelos` (borrado: NO ACTION); CHECK `CK_bitacora_operativa`; FK; sólo entre entradas MANUAL (CHECK). |

#### `motivo_correccion`

| Atributo | Detalle |
|---|---|
| Nombre | `motivo_correccion` |
| Tipo de dato | `nvarchar(1000)` |
| Nulabilidad | **Permite NULL.** NULL salvo en correcciones. |
| Función | Motivo de la corrección. |
| Justificación | Justifica la corrección. |
| Contenido | Hasta 1000 caracteres. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | CHECK `CK_bitacora_operativa`; CHECK: va junto con la entrada corregida. |

### D. Momento en que se crea un registro

**Escenario 1: Novedad manual**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | COMANDANTE asignado u Operaciones |
| Pantalla / componente y acción | `FlightLog` ([`main.jsx`](../../frontend-react/src/main.jsx), línea 447): **Registrar novedad** (o «corrección»). |
| Datos que aporta el usuario | Tipo, descripción (≤ 4000), cuándo ocurrió, importancia (NORMAL/IMPORTANTE) y, si corrige, la entrada y el motivo. |
| Endpoint | `POST /api/flights/{id}/log` ([`FlightLogController.java`](../../backend-java/src/main/java/com/vuelossanitarios/backend/api/FlightLogController.java)) |
| Servicio | `FlightLogService.create` |
| Validaciones y condiciones | Operaciones o comandante asignado (sin bloqueo por informes vencidos); vuelo en estado escribible; tipo ∈ {PREPARACION, DEMORA, INCIDENCIA, METEOROLOGIA, AERONAVE, EJECUCION, CIERRE, OTRO}; el suceso no puede estar en el futuro; la corrección apunta a una entrada operativa del mismo vuelo y exige motivo. |
| Mecanismo que crea el registro | `entries.saveAndFlush(e)`. |
| Columnas completadas y de dónde sale cada valor | `campo` = 'ACONTECIMIENTO_OPERATIVO'; `tipo_acontecimiento`, `descripcion_operativa`, `fecha_acontecimiento` (UTC), `importancia` ← formulario; `origen_acontecimiento`='MANUAL'; `fecha_registro_operativo` ← reloj; `id_usuarios`; `id_entrada_corregida`/`motivo_correccion` si corrige; `fecha_cambio` ← @CreationTimestamp. |
| Columnas que quedan NULL o con valor predeterminado | `valor_anterior`, `valor_nuevo` (columnas históricas). |
| Otros registros creados en la misma operación | Auditoría `FLIGHT_LOG/CREATE\|CORRECT`. |
| Si la operación falla / atomicidad | Atómico. |

**Escenario 2: Hito automático**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | Sistema (acciones de Operaciones) |
| Pantalla / componente y acción | «Iniciar vuelo», «Finalizar vuelo», «Cancelar vuelo». |
| Datos que aporta el usuario | — |
| Endpoint | `POST /api/flights/{id}/start\|finish\|cancel` |
| Servicio | `FlightLogService.automatic` (`Propagation.MANDATORY`) |
| Validaciones y condiciones | Tipo ∈ {INICIO, FINALIZACION, CANCELACION}; idempotente (índice único). |
| Mecanismo que crea el registro | `entries.saveAndFlush(e)`. |
| Columnas completadas y de dónde sale cada valor | Igual, con `origen_acontecimiento`='AUTOMATICO' e `importancia`='IMPORTANTE'; descripción fija. |
| Columnas que quedan NULL o con valor predeterminado | Idem. |
| Otros registros creados en la misma operación | Auditoría `CREATE_AUTO`. |
| Si la operación falla / atomicidad | Misma transacción que la transición del vuelo. |

### E. Ejemplo funcional completo

**Situación:** vuelo 900.

| id | tipo_acontecimiento | origen | importancia | fecha_acontecimiento | descripcion_operativa | id_entrada_corregida | motivo_correccion |
|---|---|---|---|---|---|---|---|
| 1 | INICIO | AUTOMATICO | IMPORTANTE | 10:00 | Inicio efectivo del vuelo | NULL | NULL |
| 2 | DEMORA | MANUAL | NORMAL | 09:55 | Demora de 5 min por carga | NULL | NULL |
| 3 | DEMORA | MANUAL | NORMAL | 09:50 | Demora de 10 min por carga | 2 | Error de tipeo en la hora |

La entrada 2 no se modifica (el trigger lo impide); la 3 la corrige y queda enlazada. Al finalizar, se agrega FINALIZACION (automática).

### F. Ciclo de vida del registro

Las entradas operativas son **inmutables**: el trigger `tr_bitacora_operativa_inmutable` rechaza UPDATE y DELETE sobre filas con `origen_acontecimiento` no nulo. Una corrección es otra fila. Los hitos automáticos son únicos por vuelo y tipo.

### G. Relaciones con otras tablas

**Clave primaria:** `id_bitacora_vuelos`.

**Claves foráneas salientes (tabla hija → padre):**

| Columna | Referencia | Borrado | Obligatoria |
|---|---|---|---|
| `id_entrada_corregida` | `bitacora_vuelos.id_bitacora_vuelos` (`FK_bitacora_correccion`) | NO ACTION | Opcional (NULL) |
| `id_usuarios` | `usuarios.id_usuarios` (`fk_bitacora_vuelos_id_usuarios`) | NO ACTION | Opcional (NULL) |
| `id_vuelos` | `vuelos.id_vuelos` (`fk_bitacora_vuelos_id_vuelos`) | **CASCADE** | Obligatoria |

**Claves foráneas entrantes (tablas hijas):** `bitacora_vuelos`(id_entrada_corregida).

FK `id_vuelos` → `vuelos` (CASCADE), `id_usuarios` → `usuarios`, `id_entrada_corregida` → la propia tabla (corrección).

### H. Restricciones y decisiones de diseño

**Índices (no PK):**

| Índice | Único | Columnas | Filtro | Incluye |
|---|---|---|---|---|
| `idx_bitacora_vuelos_id_usuarios` | no | id_usuarios | — | — |
| `idx_bitacora_vuelos_id_vuelos` | no | id_vuelos | — | — |
| `idx_bitacora_vuelos_usuario_id` | no | id_usuarios | — | — |
| `idx_bitacora_vuelos_vuelo_id` | no | id_vuelos | — | — |
| `IX_bitacora_operativa_cronologia` | no | id_vuelos, fecha_acontecimiento DESC, id_bitacora_vuelos DESC | `origen_acontecimiento IS NOT NULL` | — |
| `UX_bitacora_transicion` | sí | id_vuelos, tipo_acontecimiento | `origen_acontecimiento=N'AUTOMATICO'` | — |

**Restricciones CHECK:** 

- `CK_bitacora_operativa`: `(origen_acontecimiento IS NULL OR (origen_acontecimiento=N'AUTOMATICO' OR origen_acontecimiento=N'MANUAL') AND tipo_acontecimiento IS NOT NULL AND descripcion_operativa IS NOT NULL AND fecha_acontecimiento IS NOT NULL AND fecha_registro_operativo IS NOT NULL AND id_usuarios IS NOT NULL AND importancia IS NOT NULL AND (importancia=N'IMPORTANTE' OR importancia=N'NORMAL') AND (id_entrada_corregida IS NULL AND motivo_correccion IS NULL OR id_entrada_corregida IS NOT NULL AND motivo_correccion IS NOT NULL AND origen_acontecimiento=N'MANUAL'))`

**Triggers:** `tr_bitacora_operativa_inmutable`

**DEFAULT / IDENTITY / nulabilidad:** ver la ficha de cada columna en la sección C (los DEFAULT figuran en «Validaciones»).

- **Trigger de inmutabilidad (V38):** UPDATE/DELETE de acontecimientos operativos → error 51001.
- **CHECK `CK_bitacora_operativa`:** si hay origen, exige tipo, descripción, fechas, usuario e importancia válidos y que sólo una entrada MANUAL pueda corregir.
- **`UX_bitacora_transicion`:** un hito automático por vuelo y tipo.
- **Columnas históricas:** `campo`, `valor_anterior`, `valor_nuevo` y `fecha_cambio` provienen del diseño V1; hoy `valor_anterior` y `valor_nuevo` no se escriben.

### I. Evidencia de implementación

- [`V1 (flight_audit_log)`](../../backend-java/src/main/resources/db/migration/V1__init_sanitary_flights_schema.sql#L215)
- [`V38 (bitácora operativa)`](../../backend-java/src/main/resources/db/migration/V38__bitacora_operativa.sql#L5)
- [`Entidad FlightAuditLog`](../../backend-java/src/main/java/com/vuelossanitarios/backend/domain/flight/FlightAuditLog.java#L7)
- [`FlightLogService.create`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/FlightLogService.java#L26)
- [`FlightLogService.automatic`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/FlightLogService.java#L31)
- [`Controlador`](../../backend-java/src/main/java/com/vuelossanitarios/backend/api/FlightLogController.java#L3)
- [`Pantalla`](../../frontend-react/src/main.jsx#L447)
- [`Prueba: FlightLogServiceTest`](../../backend-java/src/test/java/com/vuelossanitarios/backend/service/FlightLogServiceTest.java#L19)
