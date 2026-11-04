
# Metodología, fuentes y convenciones

## 1. Qué se hizo (y qué no)

| Actividad | Detalle |
|---|---|
| Esquema real | Consultas **de solo lectura** al catálogo de SQL Server (`sys.tables`, `sys.columns`, `sys.foreign_keys`, `sys.check_constraints`, `sys.indexes`, `sys.triggers`, `sys.partitions`) de dos bases del entorno local Docker: la **habitual** (`vuelos_sanitarios`, Flyway V62, 47 tablas) y la **aislada de pruebas** (`vuelos_sanitarios_e2e`, Flyway V62, 46 tablas). Los volcados columna por columna (tipo, longitud, nulabilidad, DEFAULT, columna calculada, IDENTITY), claves foráneas (con acción de borrado), CHECK, índices (con filtro) y triggers salieron de la base de pruebas, que tiene exactamente el esquema Flyway; las dos bases coinciden en tablas y columnas; difieren en los nombres de restricciones que genera el motor y en `sysdiagrams` (ver más abajo). Sólo se leyeron agregados de filas (conteos y valores de catálogos); no se consultaron datos personales. |
| Migraciones | Lectura de las 62 migraciones (`V1__…` a `V62__…`; 59 SQL y 3 Java: V16, V17 y V26) para reconstruir la historia de cada tabla y sus renombres (V8 tradujo el esquema al español; V24 reconstruyó los identificadores a BIGINT; V27/V28/V29 normalizaron nombres). |
| Backend | Lectura de entidades JPA, repositorios, servicios, controladores, DTO, seguridad, tareas programadas y migraciones Java. Cada INSERT/UPDATE/DELETE se rastreó hasta su servicio y su endpoint. |
| Frontend | Identificación de los componentes React y botones que invocan cada endpoint (`main.jsx`, `users.jsx`, `account.jsx`, `aircraft.jsx`, `geography.jsx`, `credentials.jsx`, `closure.jsx`, `documents.jsx`, `flightRoute.jsx`, `transferContacts.jsx`, `patients.jsx`, `audit.jsx`). |
| Pruebas | Se citan las pruebas automatizadas que cubren cada tabla (`backend-java/src/test` y `scripts/e2e-*.cjs`). **No se ejecutó ninguna prueba ni flujo** para este informe. |
| Qué no se hizo | No se modificó código, migraciones, configuración ni datos; no se reinició ningún servicio; no se ejecutó ninguna migración; no se consultaron contraseñas, tokens ni códigos. |

## 2. Cómo leer las fichas

- **Evidencia:** cada afirmación sobre comportamiento se apoya en una referencia `archivo#Lnn` al código o a la migración (el número de línea es el de la revisión analizada; los patrones de búsqueda se resolvieron automáticamente contra el repositorio).
- **Origen de un valor:** *usuario* (lo ingresa una persona), *backend* (lo calcula el servicio Java), *base de datos* (DEFAULT, IDENTITY, columna calculada, trigger), *migración* (script Flyway).
- **Clases de campos con NULL** en la sección «Nulabilidad»: **D** = opcional por diseño; **E** = pendiente de una etapa posterior (se completa cuando ocurre algo); **I** = posible inconsistencia o dato heredado.
- **Justificación inferida:** cuando la razón de una decisión no está documentada en el repositorio, se señala como «inferencia»; las decisiones citadas con una migración o un comentario del código son *documentadas*.
- **Datos de ejemplo:** todos los ejemplos usan nombres, identificadores y fechas **ficticios**; no hay contraseñas, tokens ni códigos vigentes.

## 3. Convenciones del esquema (verificadas)

| Convención | Evidencia |
|---|---|
| Todas las tablas de aplicación están en el esquema `dbo`. | `sys.tables` |
| Cada tabla tiene su propia PK `id_<tabla>` de tipo **BIGINT IDENTITY(1,1)** (V24/V27). Excepción: `flyway_schema_history` (PK `installed_rank`). | Volcado de columnas |
| Las claves foráneas se llaman `id_<tabla padre>` o llevan el rol (`id_usuario_baja`, `id_usuario_creador`). | Volcado |
| Nombres en español; columnas «contextualizadas» por V28 (`nombre_persona`, `codigo_estado_vuelo`…). | V28 |
| Baja lógica: `fecha_baja` + `id_usuario_baja` + `motivo_baja` (usuarios, contactos, documentos, tripulación, políticas, clasificaciones) o `esta_activo`/`activa` (catálogos). | CHECK de baja |
| Versionado de filas: `version` + `es_version_actual` + índice único filtrado (rutas, hangar, coordinaciones, informes, documentos). | Índices filtrados |
| Control de concurrencia optimista: `version_identidad`, `version_contacto` (@Version de Hibernate). | Entidades |
| **Tiempo:** los vuelos y solicitudes guardan hora civil de la zona de negocio (`America/Argentina/Tucuman`) en DATETIME2; la auditoría, las habilitaciones y la obligación de informes guardan UTC (o DATETIMEOFFSET). | Servicios y V46 |
| Persistencia: JPA/Hibernate con `@GeneratedValue(IDENTITY)` (clase base `BaseEntity`); no hay JdbcTemplate para negocio; los scripts SQL sólo viven en migraciones. | Código |
| Transacciones: cada método de servicio público es `@Transactional`; la auditoría exige transacción previa (`Propagation.MANDATORY`). | `AuditService` |

## 4. Diferencias entre las fuentes

- **46 vs 47 tablas.** El esquema Flyway tiene **46** tablas físicas (45 de negocio + `flyway_schema_history`). La base habitual tiene además `sysdiagrams` (5 columnas, 0 filas), creada por SQL Server Management Studio al usar diagramas; no pertenece al sistema ni a ninguna migración. Se documenta en el anexo de la tabla de control.
- **Documentación previa.** El repositorio ya contenía `docs/INFORME_COMPLETO_BASE_DE_DATOS.md`, `docs/DICCIONARIO_BASE_DATOS.md` y `docs/CONCILIACION_TABLAS_I57_2026-10-28.md`; este informe no los modifica ni se apoya en ellos como fuente: se rehízo desde el esquema y el código. La conciliación I-5.7 llegaba a 46 tablas con V60; el esquema actual (V62) conserva las 46, porque V61 y V62 sólo agregan columnas.

[← Informe principal](../INFORME_COMPLETO_BASE_DATOS.md)
