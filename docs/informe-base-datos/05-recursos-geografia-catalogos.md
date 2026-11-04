# Capítulo 5 — Recursos, geografía y catálogos

[← Informe principal](../INFORME_COMPLETO_BASE_DATOS.md) · [Índice de capítulos](../INFORME_COMPLETO_BASE_DATOS.md#3-índice-y-navegación)

Tablas de este capítulo: [`aeronaves`](#29-tabla-aeronaves), [`aeropuertos`](#30-tabla-aeropuertos), [`provincias`](#31-tabla-provincias), [`localidades`](#32-tabla-localidades), [`estados_vuelo`](#33-tabla-estados_vuelo), [`estados_solicitud_sanitaria`](#34-tabla-estados_solicitud_sanitaria), [`prioridades_vuelo`](#35-tabla-prioridades_vuelo), [`tipos_vuelo`](#36-tabla-tipos_vuelo), [`tipos_documento`](#37-tabla-tipos_documento), [`roles_tripulacion`](#38-tabla-roles_tripulacion), [`motivos_cancelacion`](#39-tabla-motivos_cancelacion).

Cada tabla sigue la estructura A–I del encargo: **A** identificación · **B** funcionalidad · **C** campo por campo · **D** creación de registros · **E** ejemplo funcional · **F** ciclo de vida · **G** relaciones · **H** restricciones y diseño · **I** evidencia. Convenciones y fuentes en [00-metodologia-y-convenciones.md](00-metodologia-y-convenciones.md).

---

## 29. Tabla `aeronaves`

### A. Identificación de la tabla

| Atributo | Detalle |
|---|---|
| Nombre exacto y esquema | `dbo.aeronaves` (esquema `dbo`) |
| Módulo funcional | 5. Recursos, geografía y catálogos |
| Tipo de tabla | Principal — flota de aeronaves |
| Migración que la creó | V1 (como `aircraft`) |
| Migraciones posteriores que modificaron su estructura | V4 (capacidades positivas), V8/V24/V27/V28 (nombres), V18 (ubicación: `id_aeropuertos` = aeropuerto actual) |
| Estado actual en el esquema | Vigente — 10 columnas, PK `id_aeronaves`, 1 FK salientes, 2 FK entrantes, 1 índice(s) único(s), 1 CHECK, 0 trigger(s) (verificado contra `sys.*` de la base E2E en Flyway V62) |
| Tablas relacionadas | aeropuertos, vuelos, informacion_hangar |

### B. Funcionalidad y justificación

Cada fila es **una aeronave** de la flota: matrícula, modelo, tipo, capacidades de pacientes y de tripulación, equipamiento médico, si está activa y **dónde se encuentra** (aeropuerto actual). La disponibilidad no se guarda: se **deriva** de los vuelos que la reservan o la tienen en curso (V18: «sólo se persiste la ubicación física administrativa»).

La ubicación cambia automáticamente cuando finaliza un vuelo (la aeronave pasa al aeropuerto de destino) y manualmente por decisión administrativa.

**Por qué es una tabla independiente.** La aeronave existe independientemente de los vuelos (se reutiliza); el administrador la gestiona como catálogo.

**Qué dejaría de funcionar sin ella.** No habría recursos para asignar a los vuelos ni control de capacidad, equipamiento ni ubicación.

### C. Descripción campo por campo

#### `matricula`

| Atributo | Detalle |
|---|---|
| Nombre | `matricula` |
| Tipo de dato | `nvarchar(20)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Matrícula de la aeronave. |
| Justificación | Identificador reglamentario que reconocen los usuarios. |
| Contenido | Texto en mayúsculas de hasta 20 caracteres. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | «Editar» (si no está en vuelo). |
| Validaciones | Índice único `uq_aeronaves_2`; Única (`uq_aeronaves_2`); validación en servicio. |

#### `modelo`

| Atributo | Detalle |
|---|---|
| Nombre | `modelo` |
| Tipo de dato | `nvarchar(100)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Modelo. |
| Justificación | Describe la máquina. |
| Contenido | Hasta 100 caracteres. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | «Editar». |
| Validaciones | NOT NULL. |

#### `tipo_aeronave`

| Atributo | Detalle |
|---|---|
| Nombre | `tipo_aeronave` |
| Tipo de dato | `nvarchar(50)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Clase (ala fija, helicóptero…). |
| Justificación | Distingue aeronaves. |
| Contenido | Hasta 50 caracteres. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | «Editar». |
| Validaciones | NOT NULL. |

#### `capacidad_pacientes`

| Atributo | Detalle |
|---|---|
| Nombre | `capacidad_pacientes` |
| Tipo de dato | `smallint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Cantidad de pacientes que admite. |
| Justificación | Verifica la factibilidad. |
| Contenido | Entero positivo. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | «Editar». |
| Validaciones | CHECK `ck_aeronaves_1362103893`; DEFAULT 1; CHECK > 0; DEFAULT 1. |

#### `capacidad_tripulacion`

| Atributo | Detalle |
|---|---|
| Nombre | `capacidad_tripulacion` |
| Tipo de dato | `smallint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Cantidad de tripulantes que admite. |
| Justificación | Limita las asignaciones. |
| Contenido | Entero positivo. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | «Editar» (no menor que la asignada). |
| Validaciones | CHECK `ck_aeronaves_1362103893`; DEFAULT 2; CHECK > 0; DEFAULT 2. |

#### `equipamiento_medico`

| Atributo | Detalle |
|---|---|
| Nombre | `equipamiento_medico` |
| Tipo de dato | `nvarchar(max)` |
| Nulabilidad | **Permite NULL.** Opcional: aeronaves sin equipamiento. |
| Función | Descripción del equipamiento médico. |
| Justificación | Permite asignar vuelos que lo requieren. |
| Contenido | Texto. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | «Editar». |
| Validaciones | — |

#### `esta_activa`

| Atributo | Detalle |
|---|---|
| Nombre | `esta_activa` |
| Tipo de dato | `bit` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Si la aeronave puede operar. |
| Justificación | Baja lógica. |
| Contenido | 0/1. |
| Origen | Admin. |
| Momento inicial | 1 por defecto. |
| Modificación | Operación activar–desactivar. |
| Validaciones | DEFAULT 1; DEFAULT 1. |

#### `fecha_creacion`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_creacion` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Registra el instante en que la aeronave se incorporó al sistema. |
| Justificación | Permite ordenar cronológicamente, reconstruir el historial y aportar trazabilidad sin depender de la auditoría. |
| Contenido | Fecha y hora (DATETIME2) de la inserción. |
| Origen | Automático: DEFAULT `SYSDATETIME()` de SQL Server o `@CreationTimestamp` de Hibernate (según la entidad); el usuario nunca ingresa esta fecha. |
| Momento inicial | En el INSERT. |
| Modificación | Inmutable: ningún flujo la actualiza (`updatable=false` en la entidad). |
| Validaciones | DEFAULT sysdatetime() |

#### `id_aeronaves`

| Atributo | Detalle |
|---|---|
| Nombre | `id_aeronaves` |
| Tipo de dato | `bigint` — IDENTITY(1,1) |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Clave primaria de la tabla: identifica de forma única cada fila y es el valor que otras tablas, la API y la auditoría usan para referirse a ella. |
| Justificación | Un identificador técnico numérico, estable y sin significado de negocio evita depender de datos que pueden cambiar (nombres, códigos) y hace eficientes los JOIN y las claves foráneas (decisión V24/V27: «toda tabla de aplicación tiene su propio id_<tabla> BIGINT IDENTITY»). |
| Contenido | Número entero positivo correlativo (1, 2, 3…). No lo ingresa el usuario. |
| Origen | SQL Server, columna IDENTITY(1,1): se asigna en el propio INSERT. Hibernate lo declara `@GeneratedValue(strategy = IDENTITY)` y lo lee de vuelta tras insertar. |
| Momento inicial | En el INSERT; no existe fila sin identificador. |
| Modificación | Nunca cambia (inmutable; JPA lo declara `updatable=false`). |
| Validaciones | PRIMARY KEY; PRIMARY KEY (unicidad y NOT NULL); no se reutiliza al borrar filas. |

#### `id_aeropuertos`

| Atributo | Detalle |
|---|---|
| Nombre | `id_aeropuertos` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** Admite NULL por historia (V18 agregó la columna), pero el alta actual la exige y la aeronave sin ubicación no se puede reactivar. |
| Función | Aeropuerto donde se encuentra la aeronave. |
| Justificación | Dato necesario para asignaciones; su cambio refleja los movimientos. |
| Contenido | Identificador de `aeropuertos`. |
| Origen | Admin al crear; Admin/Operaciones al mover; sistema al finalizar un vuelo. |
| Momento inicial | En el INSERT. |
| Modificación | Ubicación manual o fin de vuelo. |
| Validaciones | FOREIGN KEY → `aeropuertos.id_aeropuertos` (borrado: NO ACTION); FK. |

### D. Momento en que se crea un registro

**Escenario 1: El Administrador da de alta una aeronave**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | ADMINISTRADOR |
| Pantalla / componente y acción | «Añadir aeronave» / «Nueva aeronave» ([`AdminAircraft`](../../frontend-react/src/aircraft.jsx), botón línea 145). |
| Datos que aporta el usuario | Matrícula, modelo, tipo, capacidad de pacientes, capacidad de tripulación, equipamiento médico (opcional), activa y aeropuerto actual. |
| Endpoint | `POST /api/catalogs/aircraft` ([`CatalogController.java`](../../backend-java/src/main/java/com/vuelossanitarios/backend/api/CatalogController.java)) |
| Servicio | `AircraftAdminService.create` |
| Validaciones y condiciones | Matrícula única (sin distinguir mayúsculas) y normalizada; aeropuerto actual activo; capacidades > 0; duplicado → 409 `DUPLICATE_PLATE` (también ante altas simultáneas). |
| Mecanismo que crea el registro | `aircraft.saveAndFlush(x)`. |
| Columnas completadas y de dónde sale cada valor | `matricula`, `modelo`, `tipo_aeronave`, `capacidad_pacientes`, `capacidad_tripulacion`, `equipamiento_medico`, `esta_activa` ← formulario (activa por defecto); `id_aeropuertos` ← aeropuerto elegido; `fecha_creacion` ← @CreationTimestamp. |
| Columnas que quedan NULL o con valor predeterminado | `equipamiento_medico` si no se informa. |
| Otros registros creados en la misma operación | Auditoría `AIRCRAFT/CREATE`. |
| Si la operación falla / atomicidad | Atómico. |

### E. Ejemplo funcional completo

**Situación:** el administrador registra la aeronave LV-ABC.

| id_aeronaves | matricula | modelo | tipo_aeronave | capacidad_pacientes | capacidad_tripulacion | equipamiento_medico | esta_activa | id_aeropuertos |
|---|---|---|---|---|---|---|---|---|
| 7 | LV-ABC | King Air 350 | Ala fija | 2 | 4 | Respirador, monitor | 1 | 31 (Tucumán) |

- Operaciones la asigna al vuelo 900 (la aeronave debe estar en la provincia de origen, libre en el intervalo, con capacidad para la tripulación y, si el paciente lo requiere, con equipamiento).
- Al **finalizar** el vuelo, `id_aeropuertos` pasa al aeropuerto de destino (Salta) en la misma transacción.
- El administrador puede **desactivar** la aeronave (`esta_activa`=0) sólo si no tiene vuelos asignados; puede **reubicarla** con «Ubicación».

### F. Ciclo de vida del registro

| Transición | Acción | Actor | Campos | Validaciones |
|---|---|---|---|---|
| Alta | «Nueva aeronave» | Admin | INSERT | ver D |
| Edición | «Editar» | Admin | matrícula, modelo, tipo, capacidades, equipamiento | no en vuelo; la capacidad no puede ser menor que la tripulación asignada; no se quita el equipamiento si hay vuelos que lo requieren |
| Baja / reactivación | activar–desactivar | Admin | `esta_activa` | no con vuelos asignados; al reactivar exige ubicación en aeropuerto activo |
| Cambio de ubicación manual | «Ubicación» | Admin / Operaciones | `id_aeropuertos` | aeropuerto activo |
| Cambio de ubicación automático | Finalizar vuelo | Operaciones | `id_aeropuertos` | misma transacción del cierre |
| Borrado | no existe | — | — | — |

### G. Relaciones con otras tablas

**Clave primaria:** `id_aeronaves`.

**Claves foráneas salientes (tabla hija → padre):**

| Columna | Referencia | Borrado | Obligatoria |
|---|---|---|---|
| `id_aeropuertos` | `aeropuertos.id_aeropuertos` (`fk_aeronaves_id_aeropuertos`) | NO ACTION | Opcional (NULL) |

**Claves foráneas entrantes (tablas hijas):** `informacion_hangar`(id_aeronave_contexto), `vuelos`(id_aeronaves).

FK `id_aeropuertos` → `aeropuertos` (opcional, NO ACTION: aeropuerto actual). FK entrantes: `vuelos.id_aeronaves` (aeronave asignada) e `informacion_hangar.id_aeronave_contexto`.

### H. Restricciones y decisiones de diseño

**Índices (no PK):**

| Índice | Único | Columnas | Filtro | Incluye |
|---|---|---|---|---|
| `idx_aeronaves_aeropuerto_actual_id` | no | id_aeropuertos | — | — |
| `idx_aeronaves_id_aeropuertos` | no | id_aeropuertos | — | — |
| `uq_aeronaves_2` | sí | matricula | — | — |

**Restricciones CHECK:** 

- `ck_aeronaves_1362103893`: `(capacidad_pacientes>(0) AND capacidad_tripulacion>(0))`

**Triggers:** ninguno.

**DEFAULT / IDENTITY / nulabilidad:** ver la ficha de cada columna en la sección C (los DEFAULT figuran en «Validaciones»).

- **`uq_aeronaves_2`:** matrícula única.
- **CHECK de capacidades positivas** (V4).
- **Disponibilidad derivada:** evita datos duplicados e inconsistentes.
- **Índice duplicado:** `idx_aeronaves_aeropuerto_actual_id` e `idx_aeronaves_id_aeropuertos` cubren la misma columna (resto de renombres; ver hallazgos).
- **Bloqueos:** la asignación y los cambios toman bloqueo de la aeronave (`aircraft.lockById`) para evitar que dos operadores la comprometan a la vez.

### I. Evidencia de implementación

- [`V1 (creación)`](../../backend-java/src/main/resources/db/migration/V1__init_sanitary_flights_schema.sql#L63)
- [`V18 (ubicación)`](../../backend-java/src/main/resources/db/migration/V18__ubicacion_y_concurrencia_aeronaves.sql#L3)
- [`Entidad Aircraft`](../../backend-java/src/main/java/com/vuelossanitarios/backend/domain/catalog/Aircraft.java#L14)
- [`AircraftAdminService.create`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/AircraftAdminService.java#L73)
- [`AircraftAdminService.setActive`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/AircraftAdminService.java#L115)
- [`Controlador`](../../backend-java/src/main/java/com/vuelossanitarios/backend/api/CatalogController.java#L24)
- [`Pantalla`](../../frontend-react/src/aircraft.jsx#L82)
- [`Prueba: AircraftAdministrationIntegrationTest`](../../backend-java/src/test/java/com/vuelossanitarios/backend/api/AircraftAdministrationIntegrationTest.java#L38)
- [`Prueba: AircraftAdminServiceTest`](../../backend-java/src/test/java/com/vuelossanitarios/backend/service/AircraftAdminServiceTest.java#L26)

---

## 30. Tabla `aeropuertos`

### A. Identificación de la tabla

| Atributo | Detalle |
|---|---|
| Nombre exacto y esquema | `dbo.aeropuertos` (esquema `dbo`) |
| Módulo funcional | 5. Recursos, geografía y catálogos |
| Tipo de tabla | Catálogo geográfico — aeródromos y helipuertos |
| Migración que la creó | V1 (como `airports`) |
| Migraciones posteriores que modificaron su estructura | V8, V15 (código oficial, provincia, localidad, tipo), V16/V17/V26 (siembra desde dataset oficial), V20 (normalización), V24/V27/V28 (nombres), V56 (índices) |
| Estado actual en el esquema | Vigente — 14 columnas, PK `id_aeropuertos`, 2 FK salientes, 6 FK entrantes, 0 índice(s) único(s), 0 CHECK, 0 trigger(s) (verificado contra `sys.*` de la base E2E en Flyway V62) |
| Tablas relacionadas | provincias, localidades, vuelos, aeronaves, rutas_vuelo, coordinaciones_aa2000, informacion_hangar |

### B. Funcionalidad y justificación

Lista los **aeródromos** que pueden ser origen, destino o alternativo de un vuelo: códigos OACI/IATA y oficial, nombre, tipo, coordenadas y su pertenencia a una provincia y localidad oficiales. Se sembró desde el dataset de aeródromos del Ministerio de Transporte (566 filas) y el Administrador puede agregar o editar.

**Por qué es una tabla independiente.** Es un catálogo referencial usado por muchas tablas; centralizarlo evita nombres libres inconsistentes.

**Qué dejaría de funcionar sin ella.** No podrían planificarse vuelos (origen/destino), rutas, coordinaciones ni ubicar aeronaves.

### C. Descripción campo por campo

#### `codigo_oaci`

| Atributo | Detalle |
|---|---|
| Nombre | `codigo_oaci` |
| Tipo de dato | `nvarchar(4)` |
| Nulabilidad | **Permite NULL.** Opcional: muchos aeródromos no tienen código OACI. |
| Función | Código OACI. |
| Justificación | Identificador aeronáutico internacional. |
| Contenido | 4 letras. |
| Origen | Dataset o formulario. |
| Momento inicial | En el INSERT. |
| Modificación | «Editar». |
| Validaciones | Índice único filtrado (si informado). |

#### `codigo_iata`

| Atributo | Detalle |
|---|---|
| Nombre | `codigo_iata` |
| Tipo de dato | `nvarchar(3)` |
| Nulabilidad | **Permite NULL.** Opcional. |
| Función | Código IATA. |
| Justificación | Idem. |
| Contenido | 3 letras. |
| Origen | Dataset o formulario. |
| Momento inicial | En el INSERT. |
| Modificación | «Editar». |
| Validaciones | Índice único filtrado. |

#### `nombre_aeropuerto`

| Atributo | Detalle |
|---|---|
| Nombre | `nombre_aeropuerto` |
| Tipo de dato | `nvarchar(150)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Nombre. |
| Justificación | Lo que ven los usuarios. |
| Contenido | Hasta 150 caracteres. |
| Origen | Dataset o formulario. |
| Momento inicial | En el INSERT. |
| Modificación | «Editar». |
| Validaciones | NOT NULL. |

#### `ciudad`

| Atributo | Detalle |
|---|---|
| Nombre | `ciudad` |
| Tipo de dato | `nvarchar(100)` |
| Nulabilidad | **Permite NULL.** Opcional; coexiste con la localidad oficial. |
| Función | Ciudad en texto libre. |
| Justificación | Dato heredado del esquema original. |
| Contenido | Texto. |
| Origen | Dataset o formulario. |
| Momento inicial | En el INSERT. |
| Modificación | «Editar». |
| Validaciones | — |

#### `provincia`

| Atributo | Detalle |
|---|---|
| Nombre | `provincia` |
| Tipo de dato | `nvarchar(100)` |
| Nulabilidad | **Permite NULL.** Duplica `id_provincias`. |
| Función | Nombre de la provincia en texto. |
| Justificación | Heredado; hoy se completa con el nombre de la provincia oficial elegida. |
| Contenido | Texto. |
| Origen | Dataset o servicio. |
| Momento inicial | En el INSERT. |
| Modificación | Cuando se edita la provincia. |
| Validaciones | — |

#### `pais`

| Atributo | Detalle |
|---|---|
| Nombre | `pais` |
| Tipo de dato | `nvarchar(100)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | País. |
| Justificación | Contexto geográfico. |
| Contenido | Texto (DEFAULT Argentina). |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | «Editar». |
| Validaciones | DEFAULT N'Argentina'; DEFAULT 'Argentina'. |

#### `latitud`

| Atributo | Detalle |
|---|---|
| Nombre | `latitud` |
| Tipo de dato | `decimal(9,6)` |
| Nulabilidad | **Permite NULL.** Opcional. |
| Función | Latitud decimal. |
| Justificación | Mapas y cálculo de distancias. |
| Contenido | Decimal (9,6). |
| Origen | Dataset o formulario. |
| Momento inicial | En el INSERT. |
| Modificación | «Editar». |
| Validaciones | — |

#### `longitud`

| Atributo | Detalle |
|---|---|
| Nombre | `longitud` |
| Tipo de dato | `decimal(9,6)` |
| Nulabilidad | **Permite NULL.** Opcional. |
| Función | Longitud decimal. |
| Justificación | Idem. |
| Contenido | Decimal (9,6). |
| Origen | Dataset o formulario. |
| Momento inicial | En el INSERT. |
| Modificación | «Editar». |
| Validaciones | — |

#### `esta_activo`

| Atributo | Detalle |
|---|---|
| Nombre | `esta_activo` |
| Tipo de dato | `bit` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Si es utilizable. |
| Justificación | Baja lógica. |
| Contenido | 0/1. |
| Origen | Admin. |
| Momento inicial | 1. |
| Modificación | Activar–desactivar (con control de dependencias). |
| Validaciones | DEFAULT 1; DEFAULT 1. |

#### `codigo_oficial`

| Atributo | Detalle |
|---|---|
| Nombre | `codigo_oficial` |
| Tipo de dato | `nvarchar(20)` |
| Nulabilidad | **Permite NULL.** NULL en altas por el endpoint heredado. |
| Función | Código del dataset oficial. |
| Justificación | Clave natural para reimportar y comparar. |
| Contenido | Hasta 20 caracteres. |
| Origen | Dataset o formulario. |
| Momento inicial | En el INSERT. |
| Modificación | «Editar». |
| Validaciones | Índice único filtrado. |

#### `tipo_aeropuerto`

| Atributo | Detalle |
|---|---|
| Nombre | `tipo_aeropuerto` |
| Tipo de dato | `nvarchar(30)` |
| Nulabilidad | **Permite NULL.** Opcional. |
| Función | Clase (aeródromo, helipuerto…). |
| Justificación | Filtro y descripción. |
| Contenido | Hasta 30 caracteres. |
| Origen | Dataset o formulario. |
| Momento inicial | En el INSERT. |
| Modificación | «Editar». |
| Validaciones | — |

#### `id_aeropuertos`

| Atributo | Detalle |
|---|---|
| Nombre | `id_aeropuertos` |
| Tipo de dato | `bigint` — IDENTITY(1,1) |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Clave primaria de la tabla: identifica de forma única cada fila y es el valor que otras tablas, la API y la auditoría usan para referirse a ella. |
| Justificación | Un identificador técnico numérico, estable y sin significado de negocio evita depender de datos que pueden cambiar (nombres, códigos) y hace eficientes los JOIN y las claves foráneas (decisión V24/V27: «toda tabla de aplicación tiene su propio id_<tabla> BIGINT IDENTITY»). |
| Contenido | Número entero positivo correlativo (1, 2, 3…). No lo ingresa el usuario. |
| Origen | SQL Server, columna IDENTITY(1,1): se asigna en el propio INSERT. Hibernate lo declara `@GeneratedValue(strategy = IDENTITY)` y lo lee de vuelta tras insertar. |
| Momento inicial | En el INSERT; no existe fila sin identificador. |
| Modificación | Nunca cambia (inmutable; JPA lo declara `updatable=false`). |
| Validaciones | PRIMARY KEY; PRIMARY KEY (unicidad y NOT NULL); no se reutiliza al borrar filas. |

#### `id_provincias`

| Atributo | Detalle |
|---|---|
| Nombre | `id_provincias` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** NULL en aeródromos sin provincia resoluble o altas heredadas. |
| Función | Provincia oficial. |
| Justificación | Permite exigir coherencia provincia-aeropuerto en asignaciones. |
| Contenido | Identificador de `provincias`. |
| Origen | Dataset o formulario. |
| Momento inicial | En el INSERT. |
| Modificación | «Editar» (bloqueado si hay dependencias vigentes). |
| Validaciones | FOREIGN KEY → `provincias.id_provincias` (borrado: NO ACTION); FK. |

#### `id_localidades`

| Atributo | Detalle |
|---|---|
| Nombre | `id_localidades` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** NULL cuando el nombre de ciudad no identifica una única localidad (se conserva para intervención administrativa, V20). |
| Función | Localidad oficial. |
| Justificación | Referencia precisa de ubicación. |
| Contenido | Identificador de `localidades`. |
| Origen | Dataset o formulario. |
| Momento inicial | En el INSERT. |
| Modificación | «Editar». |
| Validaciones | FOREIGN KEY → `localidades.id_localidades` (borrado: NO ACTION); FK. |

### D. Momento en que se crea un registro

**Escenario 1: Siembra por migración**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | Flyway |
| Pantalla / componente y acción | — |
| Datos que aporta el usuario | — |
| Endpoint | — |
| Servicio | Migraciones Java `V16`, `V17` y `V26` (lectura de `catalogos/aerodromos-mintrans-2026-09-28.csv`) |
| Validaciones y condiciones | — |
| Mecanismo que crea el registro | INSERT…VALUES en la migración. |
| Columnas completadas y de dónde sale cada valor | Datos del CSV oficial: código, nombre, ciudad, provincia, tipo, coordenadas; provincia y localidad resueltas por nombre. |
| Columnas que quedan NULL o con valor predeterminado | — |
| Otros registros creados en la misma operación | — |
| Si la operación falla / atomicidad | Todo o nada por migración. |

**Escenario 2: El Administrador agrega un aeropuerto**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | ADMINISTRADOR |
| Pantalla / componente y acción | `GeographicCatalog` ([`geography.jsx`](../../frontend-react/src/geography.jsx)): alta de aeropuerto. |
| Datos que aporta el usuario | Códigos, nombre, ciudad, provincia, localidad, tipo, país, coordenadas. |
| Endpoint | `POST /api/admin/geography/airports` |
| Servicio | `GeographicCatalogService.createAirport` |
| Validaciones y condiciones | Provincia y localidad activas y coherentes; códigos únicos (409 `DUPLICATE_AIRPORT_CODE`). |
| Mecanismo que crea el registro | `airports.saveAndFlush(a)`. |
| Columnas completadas y de dónde sale cada valor | Todos los campos del formulario; `provincia` (texto) ← nombre de la provincia elegida; `esta_activo`=1. |
| Columnas que quedan NULL o con valor predeterminado | Códigos y coordenadas opcionales. |
| Otros registros creados en la misma operación | Auditoría `GEOGRAPHIC_AIRPORT/CREATE`. |
| Si la operación falla / atomicidad | Atómico. |

**Escenario 3: Alta heredada por el catálogo antiguo**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | ADMINISTRADOR |
| Pantalla / componente y acción | No se pudo determinar con certeza a partir del código y el esquema analizados qué pantalla lo usa: el frontend sólo hace GET sobre `/catalogs/airports`. |
| Datos que aporta el usuario | Códigos, nombre, ciudad, provincia (texto), país. |
| Endpoint | `POST /api/catalogs/airports` (`CatalogController.createAirport`) |
| Servicio | Directamente en el controlador, sin servicio ni auditoría |
| Validaciones y condiciones | Sólo validación de DTO. |
| Mecanismo que crea el registro | `airports.save(x)`. |
| Columnas completadas y de dónde sale cada valor | Sólo los campos de texto del esquema original; **no** informa `id_provincias`, `id_localidades`, `codigo_oficial` ni `tipo_aeropuerto`. |
| Columnas que quedan NULL o con valor predeterminado | Todos los campos nuevos. |
| Otros registros creados en la misma operación | Ninguno (no audita). |
| Si la operación falla / atomicidad | Transacción propia del método. |

### E. Ejemplo funcional completo

**Situación:** el administrador agrega el helipuerto «Hospital Central».

| id_aeropuertos | codigo_oficial | codigo_oaci | nombre_aeropuerto | ciudad | provincia | id_provincias | id_localidades | tipo_aeropuerto | pais | latitud | longitud | esta_activo |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 600 | HP-001 | NULL | Hospital Central | Salta | Salta | 17 | 3201 | HELIPUERTO | Argentina | -24.789 | -65.410 | 1 |

Cuando se desactiva (`POST …/airports/{id}/active`) el sistema cuenta antes sus referencias vigentes (vuelos abiertos, rutas vigentes que lo usan como alternativo, coordinaciones de vuelos abiertos, aeronaves allí ubicadas); si hay alguna, rechaza la baja.

### F. Ciclo de vida del registro

| Transición | Acción | Actor | Efecto |
|---|---|---|---|
| Alta | Siembra o formulario | Flyway / Admin | INSERT |
| Edición | «Editar» | Admin | UPDATE de campos; no cambia de provincia si tiene dependencias vigentes |
| Baja / reactivación | activar–desactivar | Admin | `esta_activo`; bloqueo previo del aeropuerto y de su provincia/localidad |
| Borrado | no existe | — | — |

### G. Relaciones con otras tablas

**Clave primaria:** `id_aeropuertos`.

**Claves foráneas salientes (tabla hija → padre):**

| Columna | Referencia | Borrado | Obligatoria |
|---|---|---|---|
| `id_localidades` | `localidades.id_localidades` (`fk_aeropuertos_id_localidades`) | NO ACTION | Opcional (NULL) |
| `id_provincias` | `provincias.id_provincias` (`fk_aeropuertos_id_provincias`) | NO ACTION | Opcional (NULL) |

**Claves foráneas entrantes (tablas hijas):** `aeronaves`(id_aeropuertos), `coordinaciones_aa2000`(id_aeropuerto_gestion), `informacion_hangar`(id_origen_contexto), `rutas_vuelo`(id_aeropuerto_alternativo), `vuelos`(id_aeropuerto_destino), `vuelos`(id_aeropuerto_origen).

FK `id_provincias` y `id_localidades` (opcionales) a los catálogos oficiales. FK entrantes: vuelos (origen/destino), aeronaves (ubicación), rutas (alternativo), coordinaciones (aeropuerto de la gestión), hangar (origen de contexto). Seis tablas dependen de él.

### H. Restricciones y decisiones de diseño

**Índices (no PK):**

| Índice | Único | Columnas | Filtro | Incluye |
|---|---|---|---|---|
| `idx_aeropuertos_id_localidades` | no | id_localidades | — | — |
| `idx_aeropuertos_id_provincias` | no | id_provincias | — | — |
| `idx_aeropuertos_localidad_id` | no | id_localidades | — | — |
| `idx_aeropuertos_provincia_id` | no | id_provincias | — | — |

**Restricciones CHECK:** ninguna.

**Triggers:** ninguno.

**DEFAULT / IDENTITY / nulabilidad:** ver la ficha de cada columna en la sección C (los DEFAULT figuran en «Validaciones»).

- **Índices únicos filtrados** sobre códigos informados (los NULL no compiten).
- **Texto + referencia:** `ciudad`/`provincia` son redundantes con `id_localidades`/`id_provincias` (herencia del esquema original, mantenidas por compatibilidad). Observación: pueden divergir si se edita una sola.
- **Bloqueos `AirportLocks` (V56):** serializan la baja de un aeropuerto con las operaciones que lo referencian.
- **Duplicidad de índices:** `idx_aeropuertos_id_provincias`/`idx_aeropuertos_provincia_id` (y análogos) cubren las mismas columnas.

### I. Evidencia de implementación

- [`V15 (catálogos referenciales)`](../../backend-java/src/main/resources/db/migration/V15__catalogos_geograficos_referenciales.sql#L13)
- [`V16 (siembra)`](../../backend-java/src/main/java/db/migration/V16__seed_catalogos_geograficos.java#L15)
- [`Entidad Airport`](../../backend-java/src/main/java/com/vuelossanitarios/backend/domain/catalog/Airport.java#L13)
- [`GeographicCatalogService.createAirport`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/GeographicCatalogService.java#L66)
- [`Alta heredada`](../../backend-java/src/main/java/com/vuelossanitarios/backend/api/CatalogController.java#L44)
- [`Bloqueos`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/AirportLocks.java#L25)
- [`Pantalla`](../../frontend-react/src/geography.jsx#L12)
- [`Prueba: GeographicIntegrityIntegrationTest`](../../backend-java/src/test/java/com/vuelossanitarios/backend/service/GeographicIntegrityIntegrationTest.java#L41)
- [`Prueba: GeographicCatalogDatasetTest`](../../backend-java/src/test/java/com/vuelossanitarios/backend/migration/GeographicCatalogDatasetTest.java#L11)

---

## 31. Tabla `provincias`

### A. Identificación de la tabla

| Atributo | Detalle |
|---|---|
| Nombre exacto y esquema | `dbo.provincias` (esquema `dbo`) |
| Módulo funcional | 5. Recursos, geografía y catálogos |
| Tipo de tabla | Catálogo geográfico — provincias |
| Migración que la creó | V15 |
| Migraciones posteriores que modificaron su estructura | V16/V26 (siembra), V24/V27/V28 (nombres) |
| Estado actual en el esquema | Vigente — 4 columnas, PK `id_provincias`, 0 FK salientes, 4 FK entrantes, 2 índice(s) único(s), 0 CHECK, 0 trigger(s) (verificado contra `sys.*` de la base E2E en Flyway V62) |
| Tablas relacionadas | localidades, aeropuertos, perfiles_comandante, habilitaciones_profesionales |

### B. Funcionalidad y justificación

Las **24 provincias** del país (código oficial y nombre). Es la unidad con la que el sistema exige que la aeronave y el comandante estén en la provincia de origen del traslado, y donde se ubica a cada comandante.

**Por qué es una tabla independiente.** Catálogo oficial reusable por muchos módulos (V15).

**Qué dejaría de funcionar sin ella.** No habría criterio geográfico para asignaciones ni para localizar aeropuertos y comandantes.

### C. Descripción campo por campo

#### `codigo_oficial`

| Atributo | Detalle |
|---|---|
| Nombre | `codigo_oficial` |
| Tipo de dato | `nvarchar(10)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Código oficial de la provincia. |
| Justificación | Clave natural estable. |
| Contenido | Hasta 10 caracteres. |
| Origen | Dataset o formulario. |
| Momento inicial | En el INSERT. |
| Modificación | «Editar». |
| Validaciones | Índice único `UQ__provinci__754AA10E9EA02787`; Único. |

#### `nombre_provincia`

| Atributo | Detalle |
|---|---|
| Nombre | `nombre_provincia` |
| Tipo de dato | `nvarchar(100)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Nombre de la provincia. |
| Justificación | Lo que ven los usuarios. |
| Contenido | Hasta 100 caracteres. |
| Origen | Dataset o formulario. |
| Momento inicial | En el INSERT. |
| Modificación | «Editar». |
| Validaciones | Índice único `UQ__provinci__72AFBCC686C17419`; Único. |

#### `esta_activa`

| Atributo | Detalle |
|---|---|
| Nombre | `esta_activa` |
| Tipo de dato | `bit` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Si está disponible. |
| Justificación | Baja lógica. |
| Contenido | 0/1. |
| Origen | Admin. |
| Momento inicial | 1. |
| Modificación | Activar–desactivar. |
| Validaciones | DEFAULT 1; DEFAULT 1. |

#### `id_provincias`

| Atributo | Detalle |
|---|---|
| Nombre | `id_provincias` |
| Tipo de dato | `bigint` — IDENTITY(1,1) |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Clave primaria de la tabla: identifica de forma única cada fila y es el valor que otras tablas, la API y la auditoría usan para referirse a ella. |
| Justificación | Un identificador técnico numérico, estable y sin significado de negocio evita depender de datos que pueden cambiar (nombres, códigos) y hace eficientes los JOIN y las claves foráneas (decisión V24/V27: «toda tabla de aplicación tiene su propio id_<tabla> BIGINT IDENTITY»). |
| Contenido | Número entero positivo correlativo (1, 2, 3…). No lo ingresa el usuario. |
| Origen | SQL Server, columna IDENTITY(1,1): se asigna en el propio INSERT. Hibernate lo declara `@GeneratedValue(strategy = IDENTITY)` y lo lee de vuelta tras insertar. |
| Momento inicial | En el INSERT; no existe fila sin identificador. |
| Modificación | Nunca cambia (inmutable; JPA lo declara `updatable=false`). |
| Validaciones | PRIMARY KEY; PRIMARY KEY (unicidad y NOT NULL); no se reutiliza al borrar filas. |

### D. Momento en que se crea un registro

**Escenario 1: Siembra por migración**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | Flyway |
| Pantalla / componente y acción | — |
| Datos que aporta el usuario | — |
| Endpoint | — |
| Servicio | Migraciones Java `V16` y `V26` |
| Validaciones y condiciones | — |
| Mecanismo que crea el registro | INSERT…VALUES en la migración. |
| Columnas completadas y de dónde sale cada valor | Datos de `catalogos/provincias-georef-2026-09-28.json`. |
| Columnas que quedan NULL o con valor predeterminado | — |
| Otros registros creados en la misma operación | — |
| Si la operación falla / atomicidad | Todo o nada por migración. |

**Escenario 2: El Administrador agrega una provincia**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | ADMINISTRADOR |
| Pantalla / componente y acción | `GeographicCatalog`: alta de provincia. |
| Datos que aporta el usuario | Código oficial y nombre. |
| Endpoint | `POST /api/admin/geography/provinces` |
| Servicio | `GeographicCatalogService.createProvince` |
| Validaciones y condiciones | Código y nombre no repetidos (409 `DUPLICATE_GEOGRAPHIC_CODE`). |
| Mecanismo que crea el registro | `provinces.saveAndFlush(p)`. |
| Columnas completadas y de dónde sale cada valor | `codigo_oficial`, `nombre_provincia` ← formulario; `esta_activa`=1. |
| Columnas que quedan NULL o con valor predeterminado | — |
| Otros registros creados en la misma operación | Auditoría `GEOGRAPHIC_PROVINCE/CREATE`. |
| Si la operación falla / atomicidad | Atómico. |

### E. Ejemplo funcional completo

**Situación:** catálogo actual (24 filas): ej. «06 · Buenos Aires», «90 · Tucumán». El administrador puede cambiar el nombre (`PUT …/provinces/{id}`) o desactivar una provincia; la desactivación se rechaza si tiene localidades, aeropuertos o comandantes vigentes (dependencias contadas por `GeographicDependencyService`).

| id_provincias | codigo_oficial | nombre_provincia | esta_activa |
|---|---|---|---|
| 17 | 66 | Salta | 1 |

### F. Ciclo de vida del registro

Alta (siembra o formulario) → edición de código/nombre → desactivación/reactivación (con control de dependencias). Nunca se borra.

### G. Relaciones con otras tablas

**Clave primaria:** `id_provincias`.

**Claves foráneas salientes:** ninguna (tabla raíz).

**Claves foráneas entrantes (tablas hijas):** `aeropuertos`(id_provincias), `habilitaciones_profesionales`(id_provincias_jurisdiccion), `localidades`(id_provincias), `perfiles_comandante`(id_provincias).

Padre de `localidades`, `aeropuertos`, `perfiles_comandante` (provincia actual) y `habilitaciones_profesionales` (jurisdicción). Sin FK salientes.

### H. Restricciones y decisiones de diseño

**Índices (no PK):**

| Índice | Único | Columnas | Filtro | Incluye |
|---|---|---|---|---|
| `UQ__provinci__72AFBCC686C17419` | sí | nombre_provincia | — | — |
| `UQ__provinci__754AA10E9EA02787` | sí | codigo_oficial | — | — |

**Restricciones CHECK:** ninguna.

**Triggers:** ninguno.

**DEFAULT / IDENTITY / nulabilidad:** ver la ficha de cada columna en la sección C (los DEFAULT figuran en «Validaciones»).

- **Unicidad de código y nombre** (índices únicos con nombre generado por el motor).
- **Baja lógica con control de dependencias** en servicio.

### I. Evidencia de implementación

- [`V15 (creación)`](../../backend-java/src/main/resources/db/migration/V15__catalogos_geograficos_referenciales.sql#L1)
- [`V16 (siembra)`](../../backend-java/src/main/java/db/migration/V16__seed_catalogos_geograficos.java#L15)
- [`Entidad Province`](../../backend-java/src/main/java/com/vuelossanitarios/backend/domain/catalog/Province.java#L8)
- [`GeographicCatalogService.createProvince`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/GeographicCatalogService.java#L42)
- [`Dependencias`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/GeographicDependencyService.java#L16)
- [`Pantalla`](../../frontend-react/src/geography.jsx#L12)
- [`Prueba: GeographicIntegrityIntegrationTest`](../../backend-java/src/test/java/com/vuelossanitarios/backend/service/GeographicIntegrityIntegrationTest.java#L41)

---

## 32. Tabla `localidades`

### A. Identificación de la tabla

| Atributo | Detalle |
|---|---|
| Nombre exacto y esquema | `dbo.localidades` (esquema `dbo`) |
| Módulo funcional | 5. Recursos, geografía y catálogos |
| Tipo de tabla | Catálogo geográfico — localidades |
| Migración que la creó | V15 |
| Migraciones posteriores que modificaron su estructura | V16/V26 (siembra de 4037 localidades), V24/V27/V28 |
| Estado actual en el esquema | Vigente — 5 columnas, PK `id_localidades`, 1 FK salientes, 3 FK entrantes, 1 índice(s) único(s), 0 CHECK, 0 trigger(s) (verificado contra `sys.*` de la base E2E en Flyway V62) |
| Tablas relacionadas | provincias, aeropuertos, vuelos_sanitarios |

### B. Funcionalidad y justificación

Las **localidades oficiales** (código y nombre dentro de una provincia). Son el origen y destino que el DTS elige al solicitar un traslado y la forma de ubicar un aeropuerto.

**Por qué es una tabla independiente.** Catálogo oficial referencial con jerarquía provincia → localidad.

**Qué dejaría de funcionar sin ella.** El DTS no podría indicar origen y destino del traslado.

### C. Descripción campo por campo

#### `codigo_oficial`

| Atributo | Detalle |
|---|---|
| Nombre | `codigo_oficial` |
| Tipo de dato | `nvarchar(20)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Código oficial. |
| Justificación | Clave natural. |
| Contenido | Hasta 20 caracteres. |
| Origen | Dataset o formulario. |
| Momento inicial | En el INSERT. |
| Modificación | «Editar». |
| Validaciones | Índice único `UQ__localida__754AA10E3E2ABF20`; Único. |

#### `nombre_localidad`

| Atributo | Detalle |
|---|---|
| Nombre | `nombre_localidad` |
| Tipo de dato | `nvarchar(200)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Nombre. |
| Justificación | Lo que se elige en la solicitud. |
| Contenido | Hasta 200 caracteres. |
| Origen | Dataset o formulario. |
| Momento inicial | En el INSERT. |
| Modificación | «Editar». |
| Validaciones | Único dentro de la provincia (servicio). |

#### `esta_activa`

| Atributo | Detalle |
|---|---|
| Nombre | `esta_activa` |
| Tipo de dato | `bit` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Si está disponible. |
| Justificación | Baja lógica. |
| Contenido | 0/1. |
| Origen | Admin. |
| Momento inicial | 1. |
| Modificación | Activar–desactivar. |
| Validaciones | DEFAULT 1; DEFAULT 1. |

#### `id_localidades`

| Atributo | Detalle |
|---|---|
| Nombre | `id_localidades` |
| Tipo de dato | `bigint` — IDENTITY(1,1) |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Clave primaria de la tabla: identifica de forma única cada fila y es el valor que otras tablas, la API y la auditoría usan para referirse a ella. |
| Justificación | Un identificador técnico numérico, estable y sin significado de negocio evita depender de datos que pueden cambiar (nombres, códigos) y hace eficientes los JOIN y las claves foráneas (decisión V24/V27: «toda tabla de aplicación tiene su propio id_<tabla> BIGINT IDENTITY»). |
| Contenido | Número entero positivo correlativo (1, 2, 3…). No lo ingresa el usuario. |
| Origen | SQL Server, columna IDENTITY(1,1): se asigna en el propio INSERT. Hibernate lo declara `@GeneratedValue(strategy = IDENTITY)` y lo lee de vuelta tras insertar. |
| Momento inicial | En el INSERT; no existe fila sin identificador. |
| Modificación | Nunca cambia (inmutable; JPA lo declara `updatable=false`). |
| Validaciones | PRIMARY KEY; PRIMARY KEY (unicidad y NOT NULL); no se reutiliza al borrar filas. |

#### `id_provincias`

| Atributo | Detalle |
|---|---|
| Nombre | `id_provincias` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Provincia a la que pertenece. |
| Justificación | Jerarquía. |
| Contenido | Identificador de `provincias`. |
| Origen | Dataset o formulario. |
| Momento inicial | En el INSERT. |
| Modificación | «Editar» (sin dependencias). |
| Validaciones | FOREIGN KEY → `provincias.id_provincias` (borrado: NO ACTION); NOT NULL, FK. |

### D. Momento en que se crea un registro

**Escenario 1: Siembra por migración**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | Flyway |
| Pantalla / componente y acción | — |
| Datos que aporta el usuario | — |
| Endpoint | — |
| Servicio | Migraciones Java `V16` y `V26` |
| Validaciones y condiciones | — |
| Mecanismo que crea el registro | INSERT…VALUES en la migración. |
| Columnas completadas y de dónde sale cada valor | Datos de `catalogos/localidades-georef-2026-09-28.json`. |
| Columnas que quedan NULL o con valor predeterminado | — |
| Otros registros creados en la misma operación | — |
| Si la operación falla / atomicidad | Todo o nada por migración. |

**Escenario 2: El Administrador agrega una localidad**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | ADMINISTRADOR |
| Pantalla / componente y acción | `GeographicCatalog`: alta de localidad. |
| Datos que aporta el usuario | Código, nombre y provincia. |
| Endpoint | `POST /api/admin/geography/localities` |
| Servicio | `GeographicCatalogService.createLocality` |
| Validaciones y condiciones | Provincia activa; código único; nombre único dentro de la provincia. |
| Mecanismo que crea el registro | `localities.saveAndFlush(l)`. |
| Columnas completadas y de dónde sale cada valor | Formulario; `esta_activa`=1. |
| Columnas que quedan NULL o con valor predeterminado | — |
| Otros registros creados en la misma operación | Auditoría `GEOGRAPHIC_LOCALITY/CREATE`. |
| Si la operación falla / atomicidad | Atómico. |

### E. Ejemplo funcional completo

**Situación:** el DTS elige «San Miguel de Tucumán» como origen: se guarda `vuelos_sanitarios.id_localidad_origen` apuntando a la fila.

| id_localidades | codigo_oficial | nombre_localidad | id_provincias | esta_activa |
|---|---|---|---|---|
| 1200 | 90084010 | San Miguel de Tucumán | 24 | 1 |

Para reactivar una localidad su provincia debe estar activa. Para cambiar su provincia no debe tener dependencias vigentes (solicitudes abiertas, aeropuertos).

### F. Ciclo de vida del registro

Siembra → edición → desactivación/reactivación con control de dependencias → nunca se borra.

### G. Relaciones con otras tablas

**Clave primaria:** `id_localidades`.

**Claves foráneas salientes (tabla hija → padre):**

| Columna | Referencia | Borrado | Obligatoria |
|---|---|---|---|
| `id_provincias` | `provincias.id_provincias` (`fk_localidades_id_provincias`) | NO ACTION | Obligatoria |

**Claves foráneas entrantes (tablas hijas):** `aeropuertos`(id_localidades), `vuelos_sanitarios`(id_localidad_destino), `vuelos_sanitarios`(id_localidad_origen).

FK `id_provincias` → `provincias` (obligatoria). Padre de `aeropuertos` (opcional) y de `vuelos_sanitarios` (origen y destino).

### H. Restricciones y decisiones de diseño

**Índices (no PK):**

| Índice | Único | Columnas | Filtro | Incluye |
|---|---|---|---|---|
| `idx_localidades_id_provincias` | no | id_provincias | — | — |
| `idx_localidades_provincia_id` | no | id_provincias | — | — |
| `UQ__localida__754AA10E3E2ABF20` | sí | codigo_oficial | — | — |

**Restricciones CHECK:** ninguna.

**Triggers:** ninguno.

**DEFAULT / IDENTITY / nulabilidad:** ver la ficha de cada columna en la sección C (los DEFAULT figuran en «Validaciones»).

- **Código oficial único**; nombre único por provincia (servicio).
- **Índices `ix_localidades_provincia_nombre` e `ix_localidades_nombre`** para la búsqueda del selector.
- **Bloqueo jerárquico** provincia → localidad al reactivar.

### I. Evidencia de implementación

- [`V15 (creación)`](../../backend-java/src/main/resources/db/migration/V15__catalogos_geograficos_referenciales.sql#L3)
- [`V16 (siembra)`](../../backend-java/src/main/java/db/migration/V16__seed_catalogos_geograficos.java#L15)
- [`Entidad Locality`](../../backend-java/src/main/java/com/vuelossanitarios/backend/domain/catalog/Locality.java#L6)
- [`GeographicCatalogService.createLocality`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/GeographicCatalogService.java#L50)
- [`Selector (UI)`](../../frontend-react/src/main.jsx#L153)
- [`Prueba: GeographicIntegrityIntegrationTest`](../../backend-java/src/test/java/com/vuelossanitarios/backend/service/GeographicIntegrityIntegrationTest.java#L41)

---

## 33. Tabla `estados_vuelo`

### A. Identificación de la tabla

| Atributo | Detalle |
|---|---|
| Nombre exacto y esquema | `dbo.estados_vuelo` (esquema `dbo`) |
| Módulo funcional | 5. Recursos, geografía y catálogos |
| Tipo de tabla | Catálogo — estados operativos del vuelo |
| Migración que la creó | V1 (como `flight_statuses`) |
| Migraciones posteriores que modificaron su estructura | V7 (COMPLETADO), V20/V23 (nuevos estados), V25 (resiembra), V28 (nombres), V34 (PENDIENTE_REPLANIFICACION) |
| Estado actual en el esquema | Vigente — 4 columnas, PK `id_estados_vuelo`, 0 FK salientes, 1 FK entrantes, 1 índice(s) único(s), 0 CHECK, 0 trigger(s) (verificado contra `sys.*` de la base E2E en Flyway V62) |
| Tablas relacionadas | vuelos |

### B. Funcionalidad y justificación

Los **8 estados** posibles del vuelo: PENDIENTE_CONFIRMACION_COMANDANTE, PENDIENTE_RESPUESTA_OPERACIONES, PLANIFICADO, EN_CURSO, FINALIZADO, COMPLETADO, CANCELADO y PENDIENTE_REPLANIFICACION. Las transiciones no están en la tabla sino en el servicio y los triggers de `vuelos`.

**Por qué es una tabla independiente.** «Catálogo en vez de valores fijos → más fácil de escalar» (comentario de V1): evita textos libres y permite ordenar y consultar.

**Qué dejaría de funcionar sin ella.** El vuelo no tendría estado operativo.

### C. Descripción campo por campo

#### `codigo_estado_vuelo`

| Atributo | Detalle |
|---|---|
| Nombre | `codigo_estado_vuelo` |
| Tipo de dato | `nvarchar(50)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Código del estado. |
| Justificación | Referencia estable usada por triggers y servicios. |
| Contenido | Hasta 50 caracteres. |
| Origen | Migración. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | Índice único `uq_estados_vuelo_2`; Único. |

#### `nombre_estado_vuelo`

| Atributo | Detalle |
|---|---|
| Nombre | `nombre_estado_vuelo` |
| Tipo de dato | `nvarchar(100)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Nombre legible. |
| Justificación | Para pantallas. |
| Contenido | Hasta 100 caracteres. |
| Origen | Migración. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | NOT NULL. |

#### `orden`

| Atributo | Detalle |
|---|---|
| Nombre | `orden` |
| Tipo de dato | `smallint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Posición de presentación. |
| Justificación | Ordenar en la interfaz. |
| Contenido | Entero. |
| Origen | Migración. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | NOT NULL. |

#### `id_estados_vuelo`

| Atributo | Detalle |
|---|---|
| Nombre | `id_estados_vuelo` |
| Tipo de dato | `bigint` — IDENTITY(1,1) |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Clave primaria de la tabla: identifica de forma única cada fila y es el valor que otras tablas, la API y la auditoría usan para referirse a ella. |
| Justificación | Un identificador técnico numérico, estable y sin significado de negocio evita depender de datos que pueden cambiar (nombres, códigos) y hace eficientes los JOIN y las claves foráneas (decisión V24/V27: «toda tabla de aplicación tiene su propio id_<tabla> BIGINT IDENTITY»). |
| Contenido | Número entero positivo correlativo (1, 2, 3…). No lo ingresa el usuario. |
| Origen | SQL Server, columna IDENTITY(1,1): se asigna en el propio INSERT. Hibernate lo declara `@GeneratedValue(strategy = IDENTITY)` y lo lee de vuelta tras insertar. |
| Momento inicial | En el INSERT; no existe fila sin identificador. |
| Modificación | Nunca cambia (inmutable; JPA lo declara `updatable=false`). |
| Validaciones | PRIMARY KEY; PRIMARY KEY (unicidad y NOT NULL); no se reutiliza al borrar filas. |

### D. Momento en que se crea un registro

**Escenario 1: Siembra por migración**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | Flyway |
| Pantalla / componente y acción | — |
| Datos que aporta el usuario | — |
| Endpoint | — |
| Servicio | `V1`, `V7`, `V20`, `V23`, `V25` y `V34` |
| Validaciones y condiciones | — |
| Mecanismo que crea el registro | INSERT…VALUES en la migración. |
| Columnas completadas y de dónde sale cada valor | Código, nombre y orden fijos por la migración. |
| Columnas que quedan NULL o con valor predeterminado | — |
| Otros registros creados en la misma operación | — |
| Si la operación falla / atomicidad | Todo o nada por migración. |

### E. Ejemplo funcional completo

Valores vigentes (orden · código): 1 PENDIENTE_CONFIRMACION_COMANDANTE · 2 PENDIENTE_RESPUESTA_OPERACIONES · 3 PLANIFICADO · 4 EN_CURSO · 5 FINALIZADO · 6 COMPLETADO · 7 CANCELADO · 8 PENDIENTE_REPLANIFICACION.

Cuando Operaciones asigna recursos, `vuelos.id_estados_vuelo` pasa a apuntar a la fila de «PLANIFICADO» (se obtiene por código con `statuses.findByCodigo`). El orden 8 de PENDIENTE_REPLANIFICACION no refleja su posición en el flujo (se agregó después, V34).

### F. Ciclo de vida del registro

Las filas no cambian tras sembrarse. Un estado nuevo requiere una migración (V34 es el ejemplo).

### G. Relaciones con otras tablas

**Clave primaria:** `id_estados_vuelo`.

**Claves foráneas salientes:** ninguna (tabla raíz).

**Claves foráneas entrantes (tablas hijas):** `vuelos`(id_estados_vuelo).

Padre de `vuelos` (`id_estados_vuelo`, opcional en el hijo). Los triggers de `vuelos` la consultan por código.

### H. Restricciones y decisiones de diseño

**Índices (no PK):**

| Índice | Único | Columnas | Filtro | Incluye |
|---|---|---|---|---|
| `uq_estados_vuelo_2` | sí | codigo_estado_vuelo | — | — |

**Restricciones CHECK:** ninguna.

**Triggers:** ninguno.

**DEFAULT / IDENTITY / nulabilidad:** ver la ficha de cada columna en la sección C (los DEFAULT figuran en «Validaciones»).

- **Código único (`uq_estados_vuelo_2`)**; el código es la referencia estable (los IDs son técnicos).
- **Los códigos están escritos en triggers y servicios:** agregar o renombrar un estado exige tocar ambos (acoplamiento).
- **Observación:** `orden` no es único y no define el flujo (V34).

### I. Evidencia de implementación

- [`V1 (creación)`](../../backend-java/src/main/resources/db/migration/V1__init_sanitary_flights_schema.sql#L85)
- [`V25 (resiembra)`](../../backend-java/src/main/resources/db/migration/V25__resembrar_catalogos_basicos.sql#L9)
- [`V34 (replanificación)`](../../backend-java/src/main/resources/db/migration/V34__restaurar_estado_replanificacion.sql#L3)
- [`Entidad FlightStatus`](../../backend-java/src/main/java/com/vuelossanitarios/backend/domain/catalog/FlightStatus.java#L8)
- [`Uso en el servicio`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/FlightService.java#L290)

**La aplicación no inserta filas en `estados_vuelo`**: ningún servicio llama a su repositorio con `save`; sólo la lee. Las filas se crean únicamente por migración Flyway.

---

## 34. Tabla `estados_solicitud_sanitaria`

### A. Identificación de la tabla

| Atributo | Detalle |
|---|---|
| Nombre exacto y esquema | `dbo.estados_solicitud_sanitaria` (esquema `dbo`) |
| Módulo funcional | 5. Recursos, geografía y catálogos |
| Tipo de tabla | Catálogo — estados de la solicitud sanitaria |
| Migración que la creó | V23 |
| Migraciones posteriores que modificaron su estructura | V24/V27/V28, V44 (CANCELADO) |
| Estado actual en el esquema | Vigente — 4 columnas, PK `id_estados_solicitud_sanitaria`, 0 FK salientes, 1 FK entrantes, 1 índice(s) único(s), 0 CHECK, 0 trigger(s) (verificado contra `sys.*` de la base E2E en Flyway V62) |
| Tablas relacionadas | vuelos_sanitarios |

### B. Funcionalidad y justificación

Los **5 estados** de la solicitud del DTS: SOLICITADO, PENDIENTE_RESPUESTA_DTS, APROBADO, RECHAZADO, CANCELADO. Son distintos de los estados operativos del vuelo (V23).

**Por qué es una tabla independiente.** La solicitud tiene su propio ciclo, que puede terminar sin que exista un vuelo operativo (un rechazo).

**Qué dejaría de funcionar sin ella.** La solicitud no tendría estado.

### C. Descripción campo por campo

#### `codigo_estado_solicitud`

| Atributo | Detalle |
|---|---|
| Nombre | `codigo_estado_solicitud` |
| Tipo de dato | `nvarchar(40)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Código del estado. |
| Justificación | Referencia estable. |
| Contenido | Hasta 40 caracteres. |
| Origen | Migración. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | Índice único `uq_estados_solicitud_sanitaria_codigo`; Único. |

#### `nombre_estado_solicitud`

| Atributo | Detalle |
|---|---|
| Nombre | `nombre_estado_solicitud` |
| Tipo de dato | `nvarchar(100)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Nombre legible. |
| Justificación | Para pantallas. |
| Contenido | Hasta 100 caracteres. |
| Origen | Migración. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | NOT NULL. |

#### `orden`

| Atributo | Detalle |
|---|---|
| Nombre | `orden` |
| Tipo de dato | `smallint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Posición. |
| Justificación | Ordenar. |
| Contenido | Entero. |
| Origen | Migración. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | NOT NULL. |

#### `id_estados_solicitud_sanitaria`

| Atributo | Detalle |
|---|---|
| Nombre | `id_estados_solicitud_sanitaria` |
| Tipo de dato | `bigint` — IDENTITY(1,1) |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Clave primaria de la tabla: identifica de forma única cada fila y es el valor que otras tablas, la API y la auditoría usan para referirse a ella. |
| Justificación | Un identificador técnico numérico, estable y sin significado de negocio evita depender de datos que pueden cambiar (nombres, códigos) y hace eficientes los JOIN y las claves foráneas (decisión V24/V27: «toda tabla de aplicación tiene su propio id_<tabla> BIGINT IDENTITY»). |
| Contenido | Número entero positivo correlativo (1, 2, 3…). No lo ingresa el usuario. |
| Origen | SQL Server, columna IDENTITY(1,1): se asigna en el propio INSERT. Hibernate lo declara `@GeneratedValue(strategy = IDENTITY)` y lo lee de vuelta tras insertar. |
| Momento inicial | En el INSERT; no existe fila sin identificador. |
| Modificación | Nunca cambia (inmutable; JPA lo declara `updatable=false`). |
| Validaciones | PRIMARY KEY; PRIMARY KEY (unicidad y NOT NULL); no se reutiliza al borrar filas. |

### D. Momento en que se crea un registro

**Escenario 1: Siembra por migración**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | Flyway |
| Pantalla / componente y acción | — |
| Datos que aporta el usuario | — |
| Endpoint | — |
| Servicio | `V23` (los cuatro primeros) y `V44` (CANCELADO) |
| Validaciones y condiciones | — |
| Mecanismo que crea el registro | INSERT…VALUES en la migración. |
| Columnas completadas y de dónde sale cada valor | Código, nombre y orden fijos. |
| Columnas que quedan NULL o con valor predeterminado | — |
| Otros registros creados en la misma operación | — |
| Si la operación falla / atomicidad | Todo o nada por migración. |

### E. Ejemplo funcional completo

Valores: 1 SOLICITADO · 2 PENDIENTE_RESPUESTA_DTS · 3 APROBADO · 4 RECHAZADO · 5 CANCELADO. Cuando el DTS crea una solicitud, `vuelos_sanitarios.id_estados_solicitud_sanitaria` apunta a «SOLICITADO» (`sanitaryStatus("SOLICITADO")`).

### F. Ciclo de vida del registro

Estable; sólo una migración agrega o cambia estados.

### G. Relaciones con otras tablas

**Clave primaria:** `id_estados_solicitud_sanitaria`.

**Claves foráneas salientes:** ninguna (tabla raíz).

**Claves foráneas entrantes (tablas hijas):** `vuelos_sanitarios`(id_estados_solicitud_sanitaria).

Padre de `vuelos_sanitarios` (obligatoria).

### H. Restricciones y decisiones de diseño

**Índices (no PK):**

| Índice | Único | Columnas | Filtro | Incluye |
|---|---|---|---|---|
| `uq_estados_solicitud_sanitaria_codigo` | sí | codigo_estado_solicitud | — | — |

**Restricciones CHECK:** ninguna.

**Triggers:** ninguno.

**DEFAULT / IDENTITY / nulabilidad:** ver la ficha de cada columna en la sección C (los DEFAULT figuran en «Validaciones»).

- **Código único.**
- Las transiciones válidas viven en el trigger `trg_vuelos_sanitarios_validar_estado`, no en esta tabla.

### I. Evidencia de implementación

- [`V23 (creación)`](../../backend-java/src/main/resources/db/migration/V23__separar_vuelos_sanitarios_y_operativos.sql#L18)
- [`V44 (CANCELADO)`](../../backend-java/src/main/resources/db/migration/V44__solicitudes_negociacion_y_cancelacion.sql#L6)
- [`Entidad SanitaryRequestStatus`](../../backend-java/src/main/java/com/vuelossanitarios/backend/domain/catalog/SanitaryRequestStatus.java#L6)
- [`Uso en el servicio`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/FlightService.java#L290)

**La aplicación no inserta filas en `estados_solicitud_sanitaria`**: ningún servicio llama a su repositorio con `save`; sólo la lee. Las filas se crean únicamente por migración Flyway.

---

## 35. Tabla `prioridades_vuelo`

### A. Identificación de la tabla

| Atributo | Detalle |
|---|---|
| Nombre exacto y esquema | `dbo.prioridades_vuelo` (esquema `dbo`) |
| Módulo funcional | 5. Recursos, geografía y catálogos |
| Tipo de tabla | Catálogo — prioridad operativa |
| Migración que la creó | V5 (como `flight_priorities`) |
| Migraciones posteriores que modificaron su estructura | V8/V24/V27/V28, V25 (agrega CRITICA) |
| Estado actual en el esquema | Vigente — 5 columnas, PK `id_prioridades_vuelo`, 0 FK salientes, 1 FK entrantes, 1 índice(s) único(s), 0 CHECK, 0 trigger(s) (verificado contra `sys.*` de la base E2E en Flyway V62) |
| Tablas relacionadas | vuelos_sanitarios |

### B. Funcionalidad y justificación

Etiquetas **operativas** (no clínicas) para ordenar la atención: BAJA, MEDIA, ALTA y CRITICA.

**Por qué es una tabla independiente.** Configurable sin tocar código (V5: «etiquetas operativas configurables»).

**Qué dejaría de funcionar sin ella.** El DTS no podría declarar prioridad.

### C. Descripción campo por campo

#### `codigo_prioridad_vuelo`

| Atributo | Detalle |
|---|---|
| Nombre | `codigo_prioridad_vuelo` |
| Tipo de dato | `nvarchar(30)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Código de prioridad. |
| Justificación | Valor enviado por el formulario. |
| Contenido | Hasta 30 caracteres. |
| Origen | Migración. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | Índice único `uq_prioridades_vuelo_2`; Único. |

#### `nombre_prioridad_vuelo`

| Atributo | Detalle |
|---|---|
| Nombre | `nombre_prioridad_vuelo` |
| Tipo de dato | `nvarchar(100)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Nombre legible. |
| Justificación | Pantallas. |
| Contenido | Hasta 100 caracteres. |
| Origen | Migración. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | NOT NULL. |

#### `esta_activa`

| Atributo | Detalle |
|---|---|
| Nombre | `esta_activa` |
| Tipo de dato | `bit` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Si se ofrece. |
| Justificación | Retirar sin romper histórico. |
| Contenido | 0/1. |
| Origen | Migración. |
| Momento inicial | 1. |
| Modificación | No lo cambia la aplicación. |
| Validaciones | DEFAULT 1; DEFAULT 1. |

#### `orden`

| Atributo | Detalle |
|---|---|
| Nombre | `orden` |
| Tipo de dato | `smallint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Posición. |
| Justificación | Ordenar de menor a mayor. |
| Contenido | Entero. |
| Origen | Migración. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | NOT NULL. |

#### `id_prioridades_vuelo`

| Atributo | Detalle |
|---|---|
| Nombre | `id_prioridades_vuelo` |
| Tipo de dato | `bigint` — IDENTITY(1,1) |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Clave primaria de la tabla: identifica de forma única cada fila y es el valor que otras tablas, la API y la auditoría usan para referirse a ella. |
| Justificación | Un identificador técnico numérico, estable y sin significado de negocio evita depender de datos que pueden cambiar (nombres, códigos) y hace eficientes los JOIN y las claves foráneas (decisión V24/V27: «toda tabla de aplicación tiene su propio id_<tabla> BIGINT IDENTITY»). |
| Contenido | Número entero positivo correlativo (1, 2, 3…). No lo ingresa el usuario. |
| Origen | SQL Server, columna IDENTITY(1,1): se asigna en el propio INSERT. Hibernate lo declara `@GeneratedValue(strategy = IDENTITY)` y lo lee de vuelta tras insertar. |
| Momento inicial | En el INSERT; no existe fila sin identificador. |
| Modificación | Nunca cambia (inmutable; JPA lo declara `updatable=false`). |
| Validaciones | PRIMARY KEY; PRIMARY KEY (unicidad y NOT NULL); no se reutiliza al borrar filas. |

### D. Momento en que se crea un registro

**Escenario 1: Siembra por migración**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | Flyway |
| Pantalla / componente y acción | — |
| Datos que aporta el usuario | — |
| Endpoint | — |
| Servicio | `V5` y `V25` |
| Validaciones y condiciones | — |
| Mecanismo que crea el registro | INSERT…VALUES en la migración. |
| Columnas completadas y de dónde sale cada valor | Código, nombre, orden y activo. |
| Columnas que quedan NULL o con valor predeterminado | — |
| Otros registros creados en la misma operación | — |
| Si la operación falla / atomicidad | Todo o nada por migración. |

### E. Ejemplo funcional completo

Valores: 1 BAJA · 2 MEDIA · 3 ALTA · 4 CRITICA (todas activas). El DTS elige una en «Nueva solicitud»; la API la recibe como código (`priorityCode`) y guarda su id en `vuelos_sanitarios.id_prioridades_vuelo`.

### F. Ciclo de vida del registro

Estable. Sólo una migración (o SQL) cambia filas o las desactiva.

### G. Relaciones con otras tablas

**Clave primaria:** `id_prioridades_vuelo`.

**Claves foráneas salientes:** ninguna (tabla raíz).

**Claves foráneas entrantes (tablas hijas):** `vuelos_sanitarios`(id_prioridades_vuelo).

Padre de `vuelos_sanitarios` (opcional en el hijo).

### H. Restricciones y decisiones de diseño

**Índices (no PK):**

| Índice | Único | Columnas | Filtro | Incluye |
|---|---|---|---|---|
| `uq_prioridades_vuelo_2` | sí | codigo_prioridad_vuelo | — | — |

**Restricciones CHECK:** ninguna.

**Triggers:** ninguno.

**DEFAULT / IDENTITY / nulabilidad:** ver la ficha de cada columna en la sección C (los DEFAULT figuran en «Validaciones»).

- **Código único.** `esta_activa` permitiría retirar una prioridad sin romper el histórico, pero ningún proceso lo hace.

### I. Evidencia de implementación

- [`V5 (creación)`](../../backend-java/src/main/resources/db/migration/V5__administrator_priorities_and_requested_cities.sql#L7)
- [`V25 (resiembra)`](../../backend-java/src/main/resources/db/migration/V25__resembrar_catalogos_basicos.sql#L11)
- [`Entidad FlightPriority`](../../backend-java/src/main/java/com/vuelossanitarios/backend/domain/catalog/FlightPriority.java#L4)
- [`Uso en el servicio`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/FlightService.java#L290)

**La aplicación no inserta filas en `prioridades_vuelo`**: ningún servicio llama a su repositorio con `save`; sólo la lee. Las filas se crean únicamente por migración Flyway.

---

## 36. Tabla `tipos_vuelo`

### A. Identificación de la tabla

| Atributo | Detalle |
|---|---|
| Nombre exacto y esquema | `dbo.tipos_vuelo` (esquema `dbo`) |
| Módulo funcional | 5. Recursos, geografía y catálogos |
| Tipo de tabla | Catálogo — clases de vuelo |
| Migración que la creó | V23 |
| Migraciones posteriores que modificaron su estructura | V24/V27/V28, V25 (resiembra) |
| Estado actual en el esquema | Vigente — 4 columnas, PK `id_tipos_vuelo`, 0 FK salientes, 2 FK entrantes, 1 índice(s) único(s), 0 CHECK, 0 trigger(s) (verificado contra `sys.*` de la base E2E en Flyway V62) |
| Tablas relacionadas | vuelos, politicas_habilitacion |

### B. Funcionalidad y justificación

Las **6 clases** de vuelo: SANITARIO, REGRESO_BASE, REPOSICIONAMIENTO, TRASLADO_OPERATIVO, ENTRENAMIENTO y OTRO. Determina si existe extensión sanitaria, qué documentos y qué políticas de habilitación se aplican.

**Por qué es una tabla independiente.** Introducida en V23 para soportar vuelos no sanitarios sin campos de paciente.

**Qué dejaría de funcionar sin ella.** No se podría distinguir vuelos sanitarios de operativos.

### C. Descripción campo por campo

#### `codigo_tipo_vuelo`

| Atributo | Detalle |
|---|---|
| Nombre | `codigo_tipo_vuelo` |
| Tipo de dato | `nvarchar(40)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Código del tipo. |
| Justificación | Referencia estable. |
| Contenido | Hasta 40 caracteres. |
| Origen | Migración. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | Índice único `uq_tipos_vuelo_codigo`; Único. |

#### `nombre_tipo_vuelo`

| Atributo | Detalle |
|---|---|
| Nombre | `nombre_tipo_vuelo` |
| Tipo de dato | `nvarchar(100)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Nombre legible. |
| Justificación | Pantallas. |
| Contenido | Hasta 100 caracteres. |
| Origen | Migración. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | NOT NULL. |

#### `esta_activo`

| Atributo | Detalle |
|---|---|
| Nombre | `esta_activo` |
| Tipo de dato | `bit` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Si se puede usar. |
| Justificación | Retirar tipos. |
| Contenido | 0/1. |
| Origen | Migración. |
| Momento inicial | 1. |
| Modificación | No lo cambia la aplicación. |
| Validaciones | DEFAULT 1; DEFAULT 1. |

#### `id_tipos_vuelo`

| Atributo | Detalle |
|---|---|
| Nombre | `id_tipos_vuelo` |
| Tipo de dato | `bigint` — IDENTITY(1,1) |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Clave primaria de la tabla: identifica de forma única cada fila y es el valor que otras tablas, la API y la auditoría usan para referirse a ella. |
| Justificación | Un identificador técnico numérico, estable y sin significado de negocio evita depender de datos que pueden cambiar (nombres, códigos) y hace eficientes los JOIN y las claves foráneas (decisión V24/V27: «toda tabla de aplicación tiene su propio id_<tabla> BIGINT IDENTITY»). |
| Contenido | Número entero positivo correlativo (1, 2, 3…). No lo ingresa el usuario. |
| Origen | SQL Server, columna IDENTITY(1,1): se asigna en el propio INSERT. Hibernate lo declara `@GeneratedValue(strategy = IDENTITY)` y lo lee de vuelta tras insertar. |
| Momento inicial | En el INSERT; no existe fila sin identificador. |
| Modificación | Nunca cambia (inmutable; JPA lo declara `updatable=false`). |
| Validaciones | PRIMARY KEY; PRIMARY KEY (unicidad y NOT NULL); no se reutiliza al borrar filas. |

### D. Momento en que se crea un registro

**Escenario 1: Siembra por migración**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | Flyway |
| Pantalla / componente y acción | — |
| Datos que aporta el usuario | — |
| Endpoint | — |
| Servicio | `V23` y `V25` |
| Validaciones y condiciones | — |
| Mecanismo que crea el registro | INSERT…VALUES en la migración. |
| Columnas completadas y de dónde sale cada valor | Código, nombre y activo. |
| Columnas que quedan NULL o con valor predeterminado | — |
| Otros registros creados en la misma operación | — |
| Si la operación falla / atomicidad | Todo o nada por migración. |

### E. Ejemplo funcional completo

SANITARIO es el único tipo que crea el DTS; Operaciones elige entre los demás en «Crear vuelo operativo» (el selector se llena con `GET /api/catalogs/flight-types?operationalOnly=true`). Una política de habilitación puede limitarse a un tipo (`politicas_habilitacion.id_tipos_vuelo`).

### F. Ciclo de vida del registro

Estable; cambios sólo por migración.

### G. Relaciones con otras tablas

**Clave primaria:** `id_tipos_vuelo`.

**Claves foráneas salientes:** ninguna (tabla raíz).

**Claves foráneas entrantes (tablas hijas):** `politicas_habilitacion`(id_tipos_vuelo), `vuelos`(id_tipos_vuelo).

Padre de `vuelos` (obligatoria) y `politicas_habilitacion` (opcional).

### H. Restricciones y decisiones de diseño

**Índices (no PK):**

| Índice | Único | Columnas | Filtro | Incluye |
|---|---|---|---|---|
| `uq_tipos_vuelo_codigo` | sí | codigo_tipo_vuelo | — | — |

**Restricciones CHECK:** ninguna.

**Triggers:** ninguno.

**DEFAULT / IDENTITY / nulabilidad:** ver la ficha de cada columna en la sección C (los DEFAULT figuran en «Validaciones»).

- **Código único.**
- **Regla de negocio acoplada al código SANITARIO** en el servicio (el único canal de creación de sanitarios es el DTS).

### I. Evidencia de implementación

- [`V23 (creación)`](../../backend-java/src/main/resources/db/migration/V23__separar_vuelos_sanitarios_y_operativos.sql#L6)
- [`V25 (resiembra)`](../../backend-java/src/main/resources/db/migration/V25__resembrar_catalogos_basicos.sql#L13)
- [`Entidad FlightType`](../../backend-java/src/main/java/com/vuelossanitarios/backend/domain/catalog/FlightType.java#L6)
- [`Lista (UI)`](../../frontend-react/src/main.jsx#L512)

**La aplicación no inserta filas en `tipos_vuelo`**: ningún servicio llama a su repositorio con `save`; sólo la lee. Las filas se crean únicamente por migración Flyway.

---

## 37. Tabla `tipos_documento`

### A. Identificación de la tabla

| Atributo | Detalle |
|---|---|
| Nombre exacto y esquema | `dbo.tipos_documento` (esquema `dbo`) |
| Módulo funcional | 5. Recursos, geografía y catálogos |
| Tipo de tabla | Catálogo — tipos de documento |
| Migración que la creó | V1 (como `document_types`) |
| Migraciones posteriores que modificaron su estructura | V2/V4 (más tipos, luego retirados), V8/V24/V27/V28, V25 (resiembra de 4), V53 (`solo_vuelo_sanitario`) |
| Estado actual en el esquema | Vigente — 4 columnas, PK `id_tipos_documento`, 0 FK salientes, 1 FK entrantes, 1 índice(s) único(s), 0 CHECK, 0 trigger(s) (verificado contra `sys.*` de la base E2E en Flyway V62) |
| Tablas relacionadas | documentos_vuelo |

### B. Funcionalidad y justificación

Los **4 tipos** de documentos adjuntables: AUTORIZACION, PARTE_MEDICO, PLAN_DE_VUELO y OTRO. Cada tipo declara si sólo es compatible con vuelos sanitarios (PARTE_MEDICO lo es).

**Por qué es una tabla independiente.** El atributo pertenece al tipo, de modo que el catálogo es la única fuente de la regla y un tipo nuevo nace sin restricción (V53).

**Qué dejaría de funcionar sin ella.** No se podrían clasificar ni validar documentos por tipo de vuelo.

### C. Descripción campo por campo

#### `codigo_tipo_documento`

| Atributo | Detalle |
|---|---|
| Nombre | `codigo_tipo_documento` |
| Tipo de dato | `nvarchar(30)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Código del tipo. |
| Justificación | Referencia estable. |
| Contenido | Hasta 30 caracteres. |
| Origen | Migración. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | Índice único `uq_tipos_documento_2`; Único. |

#### `nombre_tipo_documento`

| Atributo | Detalle |
|---|---|
| Nombre | `nombre_tipo_documento` |
| Tipo de dato | `nvarchar(100)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Nombre legible. |
| Justificación | Pantallas. |
| Contenido | Hasta 100 caracteres. |
| Origen | Migración. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | NOT NULL. |

#### `id_tipos_documento`

| Atributo | Detalle |
|---|---|
| Nombre | `id_tipos_documento` |
| Tipo de dato | `bigint` — IDENTITY(1,1) |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Clave primaria de la tabla: identifica de forma única cada fila y es el valor que otras tablas, la API y la auditoría usan para referirse a ella. |
| Justificación | Un identificador técnico numérico, estable y sin significado de negocio evita depender de datos que pueden cambiar (nombres, códigos) y hace eficientes los JOIN y las claves foráneas (decisión V24/V27: «toda tabla de aplicación tiene su propio id_<tabla> BIGINT IDENTITY»). |
| Contenido | Número entero positivo correlativo (1, 2, 3…). No lo ingresa el usuario. |
| Origen | SQL Server, columna IDENTITY(1,1): se asigna en el propio INSERT. Hibernate lo declara `@GeneratedValue(strategy = IDENTITY)` y lo lee de vuelta tras insertar. |
| Momento inicial | En el INSERT; no existe fila sin identificador. |
| Modificación | Nunca cambia (inmutable; JPA lo declara `updatable=false`). |
| Validaciones | PRIMARY KEY; PRIMARY KEY (unicidad y NOT NULL); no se reutiliza al borrar filas. |

#### `solo_vuelo_sanitario`

| Atributo | Detalle |
|---|---|
| Nombre | `solo_vuelo_sanitario` |
| Tipo de dato | `bit` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Si el tipo sólo corresponde a vuelos sanitarios. |
| Justificación | El parte médico describe a un paciente. |
| Contenido | 0/1. |
| Origen | Migración V53. |
| Momento inicial | En el INSERT/ALTER (DEFAULT 0). |
| Modificación | No cambia. |
| Validaciones | DEFAULT 0; DEFAULT 0. |

### D. Momento en que se crea un registro

**Escenario 1: Siembra por migración**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | Flyway |
| Pantalla / componente y acción | — |
| Datos que aporta el usuario | — |
| Endpoint | — |
| Servicio | `V1`, `V25` y `V53` |
| Validaciones y condiciones | — |
| Mecanismo que crea el registro | INSERT…VALUES en la migración. |
| Columnas completadas y de dónde sale cada valor | Código, nombre y compatibilidad. |
| Columnas que quedan NULL o con valor predeterminado | — |
| Otros registros creados en la misma operación | — |
| Si la operación falla / atomicidad | Todo o nada por migración. |

### E. Ejemplo funcional completo

Valores: AUTORIZACION · PARTE_MEDICO (solo sanitario) · PLAN_DE_VUELO · OTRO. Al registrar un documento, el desplegable se obtiene de `GET /api/flights/{id}/documents/types`, filtrado por compatibilidad con el vuelo.

### F. Ciclo de vida del registro

Estable; cambios sólo por migración.

### G. Relaciones con otras tablas

**Clave primaria:** `id_tipos_documento`.

**Claves foráneas salientes:** ninguna (tabla raíz).

**Claves foráneas entrantes (tablas hijas):** `documentos_vuelo`(id_tipos_documento).

Padre de `documentos_vuelo`.

### H. Restricciones y decisiones de diseño

**Índices (no PK):**

| Índice | Único | Columnas | Filtro | Incluye |
|---|---|---|---|---|
| `uq_tipos_documento_2` | sí | codigo_tipo_documento | — | — |

**Restricciones CHECK:** ninguna.

**Triggers:** ninguno.

**DEFAULT / IDENTITY / nulabilidad:** ver la ficha de cada columna en la sección C (los DEFAULT figuran en «Validaciones»).

- **Código único.**
- **Observación:** los tipos RUTA_VUELO, HANGAR, AA2000, INFORME_FINAL y TEXTO_LIBRE que agregaron V2/V4 ya no existen tras la resiembra V25 (esos temas tienen tablas propias).

### I. Evidencia de implementación

- [`V1 (document_types)`](../../backend-java/src/main/resources/db/migration/V1__init_sanitary_flights_schema.sql#L94)
- [`V25 (resiembra)`](../../backend-java/src/main/resources/db/migration/V25__resembrar_catalogos_basicos.sql#L12)
- [`V53 (compatibilidad)`](../../backend-java/src/main/resources/db/migration/V53__compatibilidad_tipos_documento_con_tipo_vuelo.sql#L7)
- [`Entidad DocumentType`](../../backend-java/src/main/java/com/vuelossanitarios/backend/domain/catalog/DocumentType.java#L8)
- [`Uso en documentos`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/DocumentService.java#L46)

**La aplicación no inserta filas en `tipos_documento`**: ningún servicio llama a su repositorio con `save`; sólo la lee. Las filas se crean únicamente por migración Flyway.

---

## 38. Tabla `roles_tripulacion`

### A. Identificación de la tabla

| Atributo | Detalle |
|---|---|
| Nombre exacto y esquema | `dbo.roles_tripulacion` (esquema `dbo`) |
| Módulo funcional | 5. Recursos, geografía y catálogos |
| Tipo de tabla | Catálogo — funciones de tripulación |
| Migración que la creó | V1 (como `crew_roles`) |
| Migraciones posteriores que modificaron su estructura | V8/V24/V27/V28, V25 (resiembra) |
| Estado actual en el esquema | Vigente — 3 columnas, PK `id_roles_tripulacion`, 0 FK salientes, 4 FK entrantes, 1 índice(s) único(s), 0 CHECK, 0 trigger(s) (verificado contra `sys.*` de la base E2E en Flyway V62) |
| Tablas relacionadas | vuelos_tripulantes, clasificaciones_tripulacion, habilitaciones_profesionales, politicas_habilitacion |

### B. Funcionalidad y justificación

Las **4 funciones** que se pueden cumplir a bordo: COMANDANTE, COPILOTO, MEDICO y ENFERMERO. Se usa en asignaciones, clasificaciones, habilitaciones y políticas.

**Por qué es una tabla independiente.** Cuatro tablas distintas necesitan hablar de «función»; un catálogo evita incoherencias.

**Qué dejaría de funcionar sin ella.** No se podría describir la tripulación ni exigir habilitaciones por función.

### C. Descripción campo por campo

#### `codigo_rol_tripulacion`

| Atributo | Detalle |
|---|---|
| Nombre | `codigo_rol_tripulacion` |
| Tipo de dato | `nvarchar(30)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Código de la función. |
| Justificación | Referencia estable. |
| Contenido | Hasta 30 caracteres. |
| Origen | Migración. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | Índice único `uq_roles_tripulacion_2`; Único. |

#### `nombre_rol_tripulacion`

| Atributo | Detalle |
|---|---|
| Nombre | `nombre_rol_tripulacion` |
| Tipo de dato | `nvarchar(100)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Nombre legible. |
| Justificación | Pantallas. |
| Contenido | Hasta 100 caracteres. |
| Origen | Migración. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | NOT NULL. |

#### `id_roles_tripulacion`

| Atributo | Detalle |
|---|---|
| Nombre | `id_roles_tripulacion` |
| Tipo de dato | `bigint` — IDENTITY(1,1) |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Clave primaria de la tabla: identifica de forma única cada fila y es el valor que otras tablas, la API y la auditoría usan para referirse a ella. |
| Justificación | Un identificador técnico numérico, estable y sin significado de negocio evita depender de datos que pueden cambiar (nombres, códigos) y hace eficientes los JOIN y las claves foráneas (decisión V24/V27: «toda tabla de aplicación tiene su propio id_<tabla> BIGINT IDENTITY»). |
| Contenido | Número entero positivo correlativo (1, 2, 3…). No lo ingresa el usuario. |
| Origen | SQL Server, columna IDENTITY(1,1): se asigna en el propio INSERT. Hibernate lo declara `@GeneratedValue(strategy = IDENTITY)` y lo lee de vuelta tras insertar. |
| Momento inicial | En el INSERT; no existe fila sin identificador. |
| Modificación | Nunca cambia (inmutable; JPA lo declara `updatable=false`). |
| Validaciones | PRIMARY KEY; PRIMARY KEY (unicidad y NOT NULL); no se reutiliza al borrar filas. |

### D. Momento en que se crea un registro

**Escenario 1: Siembra por migración**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | Flyway |
| Pantalla / componente y acción | — |
| Datos que aporta el usuario | — |
| Endpoint | — |
| Servicio | `V1` y `V25` |
| Validaciones y condiciones | — |
| Mecanismo que crea el registro | INSERT…VALUES en la migración. |
| Columnas completadas y de dónde sale cada valor | Código y nombre. |
| Columnas que quedan NULL o con valor predeterminado | — |
| Otros registros creados en la misma operación | — |
| Si la operación falla / atomicidad | Todo o nada por migración. |

### E. Ejemplo funcional completo

Cuando se clasifica a una persona como MEDICO se crea una fila en `clasificaciones_tripulacion` con el `id_roles_tripulacion` de «MEDICO»; cuando se la asigna a un vuelo se repite en `vuelos_tripulantes`; la política de habilitación para esa función también apunta aquí.

### F. Ciclo de vida del registro

Estable.

### G. Relaciones con otras tablas

**Clave primaria:** `id_roles_tripulacion`.

**Claves foráneas salientes:** ninguna (tabla raíz).

**Claves foráneas entrantes (tablas hijas):** `clasificaciones_tripulacion`(id_roles_tripulacion), `habilitaciones_profesionales`(id_roles_tripulacion), `politicas_habilitacion`(id_roles_tripulacion), `vuelos_tripulantes`(id_roles_tripulacion).

Padre de `vuelos_tripulantes`, `clasificaciones_tripulacion`, `habilitaciones_profesionales` y `politicas_habilitacion` (todas obligatorias).

### H. Restricciones y decisiones de diseño

**Índices (no PK):**

| Índice | Único | Columnas | Filtro | Incluye |
|---|---|---|---|---|
| `uq_roles_tripulacion_2` | sí | codigo_rol_tripulacion | — | — |

**Restricciones CHECK:** ninguna.

**Triggers:** ninguno.

**DEFAULT / IDENTITY / nulabilidad:** ver la ficha de cada columna en la sección C (los DEFAULT figuran en «Validaciones»).

- **Código único.**
- **Nota:** «COMANDANTE» aparece como función de tripulación y también como rol de acceso en `roles` (dos catálogos con nombres iguales y finalidades distintas: permiso vs. función).

### I. Evidencia de implementación

- [`V1 (crew_roles)`](../../backend-java/src/main/resources/db/migration/V1__init_sanitary_flights_schema.sql#L77)
- [`V25 (resiembra)`](../../backend-java/src/main/resources/db/migration/V25__resembrar_catalogos_basicos.sql#L8)
- [`Entidad CrewRole`](../../backend-java/src/main/java/com/vuelossanitarios/backend/domain/catalog/CrewRole.java#L8)
- [`Uso`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/CrewManagementService.java#L66)

**La aplicación no inserta filas en `roles_tripulacion`**: ningún servicio llama a su repositorio con `save`; sólo la lee. Las filas se crean únicamente por migración Flyway.

---

## 39. Tabla `motivos_cancelacion`

### A. Identificación de la tabla

| Atributo | Detalle |
|---|---|
| Nombre exacto y esquema | `dbo.motivos_cancelacion` (esquema `dbo`) |
| Módulo funcional | 5. Recursos, geografía y catálogos |
| Tipo de tabla | Catálogo — motivos normalizados de cancelación/rechazo |
| Migración que la creó | V21 |
| Migraciones posteriores que modificaron su estructura | V24/V27/V28 |
| Estado actual en el esquema | Vigente — 7 columnas, PK `id_motivos_cancelacion`, 0 FK salientes, 1 FK entrantes, 2 índice(s) único(s), 0 CHECK, 0 trigger(s) (verificado contra `sys.*` de la base E2E en Flyway V62) |
| Tablas relacionadas | vuelos |

### B. Funcionalidad y justificación

Los **23 motivos** (clínicos, aeronáuticos, meteorológicos, de infraestructura, administrativos y «OTRO») que se pueden invocar al cancelar un vuelo o rechazar una solicitud. Sustituyó al texto libre de V2 para poder analizar causas.

**Por qué es una tabla independiente.** Un catálogo normalizado permite estadísticas y evita textos inconsistentes.

**Qué dejaría de funcionar sin ella.** Cancelaciones y rechazos no tendrían motivo normalizado (el trigger de `vuelos` lo exige).

### C. Descripción campo por campo

#### `codigo_motivo_cancelacion`

| Atributo | Detalle |
|---|---|
| Nombre | `codigo_motivo_cancelacion` |
| Tipo de dato | `nvarchar(80)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Código del motivo. |
| Justificación | Referencia estable. |
| Contenido | Hasta 80 caracteres. |
| Origen | Migración. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | Índice único `uq_motivos_cancelacion_codigo`; Único. |

#### `nombre_motivo_cancelacion`

| Atributo | Detalle |
|---|---|
| Nombre | `nombre_motivo_cancelacion` |
| Tipo de dato | `nvarchar(200)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Nombre legible. |
| Justificación | Lo que se muestra y se copia a `motivo_rechazo`. |
| Contenido | Hasta 200 caracteres. |
| Origen | Migración. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | NOT NULL. |

#### `descripcion_motivo_cancelacion`

| Atributo | Detalle |
|---|---|
| Nombre | `descripcion_motivo_cancelacion` |
| Tipo de dato | `nvarchar(max)` |
| Nulabilidad | **Permite NULL.** Opcional; en las filas actuales está informada. |
| Función | Explicación del motivo. |
| Justificación | Ayuda al operador a elegir. |
| Contenido | Texto. |
| Origen | Migración. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | — |

#### `categoria`

| Atributo | Detalle |
|---|---|
| Nombre | `categoria` |
| Tipo de dato | `nvarchar(40)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Familia del motivo. |
| Justificación | Agrupa estadísticas. |
| Contenido | CLINICO, AERONAUTICO, METEOROLOGICO, OPERATIVO_INFRAESTRUCTURA, ADMINISTRATIVO_SEGURIDAD u OTRO. |
| Origen | Migración. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | NOT NULL. |

#### `esta_activo`

| Atributo | Detalle |
|---|---|
| Nombre | `esta_activo` |
| Tipo de dato | `bit` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Si se ofrece. |
| Justificación | Retirar motivos. |
| Contenido | 0/1. |
| Origen | Migración. |
| Momento inicial | 1. |
| Modificación | No lo cambia la aplicación. |
| Validaciones | DEFAULT 1; DEFAULT 1; el servicio sólo acepta motivos activos. |

#### `orden`

| Atributo | Detalle |
|---|---|
| Nombre | `orden` |
| Tipo de dato | `smallint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Posición. |
| Justificación | Ordenar el desplegable. |
| Contenido | Entero. |
| Origen | Migración. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | Índice único `uq_motivos_cancelacion_orden`; Único. |

#### `id_motivos_cancelacion`

| Atributo | Detalle |
|---|---|
| Nombre | `id_motivos_cancelacion` |
| Tipo de dato | `bigint` — IDENTITY(1,1) |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Clave primaria de la tabla: identifica de forma única cada fila y es el valor que otras tablas, la API y la auditoría usan para referirse a ella. |
| Justificación | Un identificador técnico numérico, estable y sin significado de negocio evita depender de datos que pueden cambiar (nombres, códigos) y hace eficientes los JOIN y las claves foráneas (decisión V24/V27: «toda tabla de aplicación tiene su propio id_<tabla> BIGINT IDENTITY»). |
| Contenido | Número entero positivo correlativo (1, 2, 3…). No lo ingresa el usuario. |
| Origen | SQL Server, columna IDENTITY(1,1): se asigna en el propio INSERT. Hibernate lo declara `@GeneratedValue(strategy = IDENTITY)` y lo lee de vuelta tras insertar. |
| Momento inicial | En el INSERT; no existe fila sin identificador. |
| Modificación | Nunca cambia (inmutable; JPA lo declara `updatable=false`). |
| Validaciones | PRIMARY KEY; PRIMARY KEY (unicidad y NOT NULL); no se reutiliza al borrar filas. |

### D. Momento en que se crea un registro

**Escenario 1: Siembra por migración**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | Flyway |
| Pantalla / componente y acción | — |
| Datos que aporta el usuario | — |
| Endpoint | — |
| Servicio | `V21` (creación y siembra) y `V25` (resiembra tras el corte destructivo de V24) |
| Validaciones y condiciones | — |
| Mecanismo que crea el registro | INSERT…VALUES en la migración. |
| Columnas completadas y de dónde sale cada valor | Código, nombre, descripción, categoría y orden de los 23 motivos. |
| Columnas que quedan NULL o con valor predeterminado | — |
| Otros registros creados en la misma operación | — |
| Si la operación falla / atomicidad | Todo o nada por migración. |

### E. Ejemplo funcional completo

El motivo «OTRO» exige un texto adicional (`motivo_cancelacion_personalizado`); los demás lo prohíben. Ejemplo: Operaciones cancela por «Meteorología bajo mínimos» → `vuelos.id_motivos_cancelacion` apunta a esa fila y el personalizado queda NULL.

### F. Ciclo de vida del registro

Estable.

### G. Relaciones con otras tablas

**Clave primaria:** `id_motivos_cancelacion`.

**Claves foráneas salientes:** ninguna (tabla raíz).

**Claves foráneas entrantes (tablas hijas):** `vuelos`(id_motivos_cancelacion).

Padre de `vuelos` (opcional).

### H. Restricciones y decisiones de diseño

**Índices (no PK):**

| Índice | Único | Columnas | Filtro | Incluye |
|---|---|---|---|---|
| `uq_motivos_cancelacion_codigo` | sí | codigo_motivo_cancelacion | — | — |
| `uq_motivos_cancelacion_orden` | sí | orden | — | — |

**Restricciones CHECK:** ninguna.

**Triggers:** ninguno.

**DEFAULT / IDENTITY / nulabilidad:** ver la ficha de cada columna en la sección C (los DEFAULT figuran en «Validaciones»).

- **Código único y orden único.**
- **Categoría** en texto libre (no hay catálogo de categorías).

### I. Evidencia de implementación

- [`V21 (creación)`](../../backend-java/src/main/resources/db/migration/V21__motivos_cancelacion_clima_manual_y_hangar.sql#L6)
- [`Entidad CancellationReason`](../../backend-java/src/main/java/com/vuelossanitarios/backend/domain/catalog/CancellationReason.java#L8)
- [`Uso`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/FlightService.java#L285)
- [`Selector (UI)`](../../frontend-react/src/main.jsx#L404)

**La aplicación no inserta filas en `motivos_cancelacion`**: ningún servicio llama a su repositorio con `save`; sólo la lee. Las filas se crean únicamente por migración Flyway.
