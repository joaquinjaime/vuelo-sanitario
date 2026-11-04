# Capítulo 7 — Infraestructura (Flyway)

[← Informe principal](../INFORME_COMPLETO_BASE_DATOS.md) · [Índice de capítulos](../INFORME_COMPLETO_BASE_DATOS.md#3-índice-y-navegación)

Tablas de este capítulo: [`flyway_schema_history`](#46-tabla-flyway_schema_history).

Cada tabla sigue la estructura A–I del encargo: **A** identificación · **B** funcionalidad · **C** campo por campo · **D** creación de registros · **E** ejemplo funcional · **F** ciclo de vida · **G** relaciones · **H** restricciones y diseño · **I** evidencia. Convenciones y fuentes en [00-metodologia-y-convenciones.md](00-metodologia-y-convenciones.md).

---

## 46. Tabla `flyway_schema_history`

### A. Identificación de la tabla

| Atributo | Detalle |
|---|---|
| Nombre exacto y esquema | `dbo.flyway_schema_history` (esquema `dbo`) |
| Módulo funcional | 6. Infraestructura |
| Tipo de tabla | Infraestructura — historial de migraciones (gestionada por Flyway) |
| Migración que la creó | Flyway la crea al ejecutar la primera migración (V1) |
| Migraciones posteriores que modificaron su estructura | Sin cambios por migraciones propias del proyecto; la estructura la define Flyway |
| Estado actual en el esquema | Vigente — 10 columnas, PK `installed_rank`, 0 FK salientes, 0 FK entrantes, 0 índice(s) único(s), 0 CHECK, 0 trigger(s) (verificado contra `sys.*` de la base E2E en Flyway V62) |
| Tablas relacionadas | Ninguna (sin FK) |

### B. Funcionalidad y justificación

Es la **tabla de control de Flyway**: una fila por migración aplicada (versión, descripción, tipo SQL o JDBC, nombre del script, suma de verificación, quién la instaló, cuándo, cuánto tardó y si tuvo éxito). Flyway la consulta al arrancar para saber qué migraciones faltan y detectar scripts modificados (checksum).

En la base habitual tiene 62 filas: V1–V62 (59 SQL y 3 JDBC: V16, V17 y V26, los sembrados geográficos escritos en Java).

**Por qué es una tabla independiente.** Es infraestructura de la herramienta: la aplicación no la usa, la administra Flyway.

**Qué dejaría de funcionar sin ella.** No se podría saber qué esquema tiene la base, ni aplicar migraciones de forma segura.

### C. Descripción campo por campo

#### `installed_rank`

| Atributo | Detalle |
|---|---|
| Nombre | `installed_rank` |
| Tipo de dato | `int` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Posición de la migración en la secuencia aplicada. |
| Justificación | Orden estricto de instalación. |
| Contenido | Entero (1…62). |
| Origen | Flyway. |
| Momento inicial | Al insertar la fila. |
| Modificación | No cambia. |
| Validaciones | PRIMARY KEY; PK. |

#### `version`

| Atributo | Detalle |
|---|---|
| Nombre | `version` |
| Tipo de dato | `nvarchar(50)` |
| Nulabilidad | **Permite NULL.** NULL sólo en migraciones repetibles (no existen en este proyecto). |
| Función | Versión de la migración. |
| Justificación | Identifica la versión del esquema. |
| Contenido | Texto (p. ej. «62»). |
| Origen | Nombre del script. |
| Momento inicial | Al insertar. |
| Modificación | No cambia. |
| Validaciones | — |

#### `description`

| Atributo | Detalle |
|---|---|
| Nombre | `description` |
| Tipo de dato | `nvarchar(200)` |
| Nulabilidad | **Permite NULL.** Flyway admite NULL; todas las filas del proyecto la tienen informada (se deriva del nombre del script). |
| Función | Descripción derivada del nombre del script. |
| Justificación | Lectura humana. |
| Contenido | Texto de hasta 200 caracteres. |
| Origen | Flyway. |
| Momento inicial | Al insertar. |
| Modificación | No cambia. |
| Validaciones | — |

#### `type`

| Atributo | Detalle |
|---|---|
| Nombre | `type` |
| Tipo de dato | `nvarchar(20)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Tipo de migración (SQL o JDBC). |
| Justificación | Diferencia scripts SQL de migraciones Java. |
| Contenido | «SQL» (59) o «JDBC» (3). |
| Origen | Flyway. |
| Momento inicial | Al insertar. |
| Modificación | No cambia. |
| Validaciones | — |

#### `script`

| Atributo | Detalle |
|---|---|
| Nombre | `script` |
| Tipo de dato | `nvarchar(1000)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Nombre del archivo o clase. |
| Justificación | Trazabilidad. |
| Contenido | p. ej. V62__otp_decimal_….sql. |
| Origen | Flyway. |
| Momento inicial | Al insertar. |
| Modificación | No cambia. |
| Validaciones | — |

#### `checksum`

| Atributo | Detalle |
|---|---|
| Nombre | `checksum` |
| Tipo de dato | `int` |
| Nulabilidad | **Permite NULL.** NULL sólo en baseline/repetibles. |
| Función | Suma de verificación del script. |
| Justificación | Detecta que una migración ya aplicada fue modificada. |
| Contenido | Entero. |
| Origen | Flyway. |
| Momento inicial | Al insertar. |
| Modificación | No cambia. |
| Validaciones | — |

#### `installed_by`

| Atributo | Detalle |
|---|---|
| Nombre | `installed_by` |
| Tipo de dato | `nvarchar(100)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Cuenta de base de datos que la instaló. |
| Justificación | Quién aplicó el cambio. |
| Contenido | Nombre de usuario SQL (no se reproduce). |
| Origen | Flyway. |
| Momento inicial | Al insertar. |
| Modificación | No cambia. |
| Validaciones | — |

#### `installed_on`

| Atributo | Detalle |
|---|---|
| Nombre | `installed_on` |
| Tipo de dato | `datetime` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Fecha y hora de instalación. |
| Justificación | Auditoría del despliegue. |
| Contenido | Fecha y hora. |
| Origen | DEFAULT `GETDATE()`. |
| Momento inicial | Al insertar. |
| Modificación | No cambia. |
| Validaciones | DEFAULT getdate(); DEFAULT. |

#### `execution_time`

| Atributo | Detalle |
|---|---|
| Nombre | `execution_time` |
| Tipo de dato | `int` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Duración en milisegundos. |
| Justificación | Diagnóstico. |
| Contenido | Entero. |
| Origen | Flyway. |
| Momento inicial | Al insertar. |
| Modificación | No cambia. |
| Validaciones | — |

#### `success`

| Atributo | Detalle |
|---|---|
| Nombre | `success` |
| Tipo de dato | `bit` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Si terminó bien. |
| Justificación | Flyway se niega a continuar ante una migración fallida. |
| Contenido | 0/1. |
| Origen | Flyway. |
| Momento inicial | Al insertar. |
| Modificación | No cambia. |
| Validaciones | — |

### D. Momento en que se crea un registro

**Escenario 1: Cada migración aplicada**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | Flyway (cuenta de migración al arrancar el backend o la herramienta de migración) |
| Pantalla / componente y acción | Ninguna. |
| Datos que aporta el usuario | — |
| Endpoint | — |
| Servicio | Flyway (`spring.flyway`); en producción la ejecuta una cuenta dedicada distinta de la de la aplicación (V60/I-5.8) |
| Validaciones y condiciones | Checksum e integridad de versiones. |
| Mecanismo que crea el registro | INSERT interno de Flyway tras ejecutar cada script. |
| Columnas completadas y de dónde sale cada valor | Todas las columnas las completa Flyway. |
| Columnas que quedan NULL o con valor predeterminado | `version` y `checksum` pueden ser NULL para migraciones repetibles o baseline (no hay en este proyecto). |
| Otros registros creados en la misma operación | — |
| Si la operación falla / atomicidad | Si una migración falla, Flyway registra `success`=0 o no la registra y se detiene. |

### E. Ejemplo funcional completo

**Situación:** el backend arranca con una versión nueva (V63).

| installed_rank | version | description | type | script | checksum | installed_by | installed_on | execution_time | success |
|---|---|---|---|---|---|---|---|---|---|
| 62 | 62 | otp decimal seis digitos activacion cuenta | SQL | V62__otp_decimal_seis_digitos_activacion_cuenta.sql | (entero) | (cuenta de migración) | 2026-10-29 … | 120 | 1 |
| 63 | 63 | (nueva) | SQL | V63__….sql | … | … | … | … | 1 |

Flyway compara los scripts del classpath con la tabla; sólo ejecuta los que faltan y falla si el checksum de uno ya aplicado cambió.

### F. Ciclo de vida del registro

Las filas se insertan una por migración y no se modifican ni borran en el uso normal (un `flyway repair` podría alterarlas). La base de la aplicación puede operar sin esta tabla, pero el despliegue seguro no.

### G. Relaciones con otras tablas

**Clave primaria:** `installed_rank`.

**Claves foráneas salientes:** ninguna (tabla raíz).

**Claves foráneas entrantes:** ninguna.

Sin claves foráneas ni referencias; su PK es `installed_rank`.

### H. Restricciones y decisiones de diseño

**Índices (no PK):**

| Índice | Único | Columnas | Filtro | Incluye |
|---|---|---|---|---|
| `ix_flyway_schema_history_2` | no | success | — | — |

**Restricciones CHECK:** ninguna.

**Triggers:** ninguno.

**DEFAULT / IDENTITY / nulabilidad:** ver la ficha de cada columna en la sección C (los DEFAULT figuran en «Validaciones»).

- **PK por `installed_rank` (secuencia estricta);** el único índice del esquema es la PK `pk_flyway_schema_history`. Hecho a notar: las 3 migraciones JDBC (V16, V17, V26) siembran datos geográficos desde archivos del classpath.

### I. Evidencia de implementación

- [`Migración V1`](../../backend-java/src/main/resources/db/migration/V1__init_sanitary_flights_schema.sql#L10)
- [`Verificación de preparación`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/ReadinessService.java#L9)
- [`Tarea de migración`](../../scripts/FlywayMigrationRunner.java#L1)
- [`Inventario de tablas`](../../scripts/inventario-tablas.cjs#L16)

**La aplicación Java no lee ni escribe esta tabla** (salvo el chequeo de preparación `ReadinessService`, que consulta la versión de Flyway).
