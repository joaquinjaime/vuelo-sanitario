# Capítulo 6 — Habilitaciones y clasificación de tripulación

[← Informe principal](../INFORME_COMPLETO_BASE_DATOS.md) · [Índice de capítulos](../INFORME_COMPLETO_BASE_DATOS.md#3-índice-y-navegación)

Tablas de este capítulo: [`clasificaciones_tripulacion`](#40-tabla-clasificaciones_tripulacion), [`habilitaciones_profesionales`](#41-tabla-habilitaciones_profesionales), [`documentos_habilitacion`](#42-tabla-documentos_habilitacion), [`decisiones_habilitacion`](#43-tabla-decisiones_habilitacion), [`consultas_externas_habilitacion`](#44-tabla-consultas_externas_habilitacion), [`politicas_habilitacion`](#45-tabla-politicas_habilitacion).

Cada tabla sigue la estructura A–I del encargo: **A** identificación · **B** funcionalidad · **C** campo por campo · **D** creación de registros · **E** ejemplo funcional · **F** ciclo de vida · **G** relaciones · **H** restricciones y diseño · **I** evidencia. Convenciones y fuentes en [00-metodologia-y-convenciones.md](00-metodologia-y-convenciones.md).

---

## 40. Tabla `clasificaciones_tripulacion`

### A. Identificación de la tabla

| Atributo | Detalle |
|---|---|
| Nombre exacto y esquema | `dbo.clasificaciones_tripulacion` (esquema `dbo`) |
| Módulo funcional | 6. Habilitaciones y clasificación de tripulación |
| Tipo de tabla | Relación con historial — funciones que una persona puede cumplir |
| Migración que la creó | V33 |
| Migraciones posteriores que modificaron su estructura | V58 (baja lógica con historial; unicidad sólo entre vigentes) |
| Estado actual en el esquema | Vigente — 8 columnas, PK `id_clasificaciones_tripulacion`, 4 FK salientes, 0 FK entrantes, 1 índice(s) único(s), 1 CHECK, 0 trigger(s) (verificado contra `sys.*` de la base E2E en Flyway V62) |
| Tablas relacionadas | usuarios, roles_tripulacion |

### B. Funcionalidad y justificación

Registra **qué funciones de tripulación puede cumplir cada persona** (MEDICO, ENFERMERO, COPILOTO, COMANDANTE). Es una clasificación administrativa: la hace un Administrador y es el primer filtro para que Operaciones vea candidatos a asignar. Que alguien esté clasificado **no basta**: además debe tener una habilitación suficiente según las políticas (`habilitaciones_profesionales` + `politicas_habilitacion`).

**Por qué es una tabla independiente.** Una persona puede tener varias funciones y cada clasificación tiene autor, fecha y baja (V58 la volvió histórica: reclasificar inserta una fila nueva).

**Qué dejaría de funcionar sin ella.** Operaciones no tendría candidatos filtrados por función; los selectores de tripulación quedarían vacíos.

### C. Descripción campo por campo

#### `id_clasificaciones_tripulacion`

| Atributo | Detalle |
|---|---|
| Nombre | `id_clasificaciones_tripulacion` |
| Tipo de dato | `bigint` — IDENTITY(1,1) |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Clave primaria de la tabla: identifica de forma única cada fila y es el valor que otras tablas, la API y la auditoría usan para referirse a ella. |
| Justificación | Un identificador técnico numérico, estable y sin significado de negocio evita depender de datos que pueden cambiar (nombres, códigos) y hace eficientes los JOIN y las claves foráneas (decisión V24/V27: «toda tabla de aplicación tiene su propio id_<tabla> BIGINT IDENTITY»). |
| Contenido | Número entero positivo correlativo (1, 2, 3…). No lo ingresa el usuario. |
| Origen | SQL Server, columna IDENTITY(1,1): se asigna en el propio INSERT. Hibernate lo declara `@GeneratedValue(strategy = IDENTITY)` y lo lee de vuelta tras insertar. |
| Momento inicial | En el INSERT; no existe fila sin identificador. |
| Modificación | Nunca cambia (inmutable; JPA lo declara `updatable=false`). |
| Validaciones | PRIMARY KEY; PRIMARY KEY (unicidad y NOT NULL); no se reutiliza al borrar filas. |

#### `id_usuarios`

| Atributo | Detalle |
|---|---|
| Nombre | `id_usuarios` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Persona clasificada (cuenta). |
| Justificación | Sujeto de la clasificación. |
| Contenido | Identificador de `usuarios`. |
| Origen | URL del endpoint. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `usuarios.id_usuarios` (borrado: NO ACTION); Índice único `ux_clasificacion_tripulacion_vigente` sobre (id_usuarios, id_roles_tripulacion) filtrado `fecha_baja IS NULL`; NOT NULL, FK. |

#### `id_roles_tripulacion`

| Atributo | Detalle |
|---|---|
| Nombre | `id_roles_tripulacion` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Función otorgada. |
| Justificación | Define para qué puede ser asignada. |
| Contenido | Identificador de `roles_tripulacion`. |
| Origen | URL del endpoint (por código). |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `roles_tripulacion.id_roles_tripulacion` (borrado: NO ACTION); Índice único `ux_clasificacion_tripulacion_vigente` sobre (id_usuarios, id_roles_tripulacion) filtrado `fecha_baja IS NULL`; NOT NULL, FK. |

#### `id_usuario_clasificador`

| Atributo | Detalle |
|---|---|
| Nombre | `id_usuario_clasificador` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Administrador que clasificó. |
| Justificación | Responsabilidad. |
| Contenido | Identificador de `usuarios`. |
| Origen | Usuario autenticado. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `usuarios.id_usuarios` (borrado: NO ACTION); NOT NULL, FK. |

#### `fecha_clasificacion`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_clasificacion` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Cuándo se otorgó. |
| Justificación | Historial. |
| Contenido | Fecha y hora (UTC). |
| Origen | DEFAULT `SYSUTCDATETIME()`. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | DEFAULT sysutcdatetime(); DEFAULT. |

#### `fecha_baja`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_baja` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **Permite NULL.** NULL mientras está vigente. |
| Función | Cuándo se retiró. |
| Justificación | Baja lógica. |
| Contenido | Fecha y hora. |
| Origen | Backend (`retire`). |
| Momento inicial | NULL. |
| Modificación | Al retirar. |
| Validaciones | CHECK `ck_clasificacion_baja`; CHECK de baja. |

#### `id_usuario_baja`

| Atributo | Detalle |
|---|---|
| Nombre | `id_usuario_baja` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** NULL si vigente. |
| Función | Quién retiró. |
| Justificación | Responsabilidad. |
| Contenido | Identificador de `usuarios`. |
| Origen | Usuario autenticado. |
| Momento inicial | NULL. |
| Modificación | Al retirar. |
| Validaciones | FOREIGN KEY → `usuarios.id_usuarios` (borrado: NO ACTION); CHECK `ck_clasificacion_baja`; CHECK. |

#### `motivo_baja`

| Atributo | Detalle |
|---|---|
| Nombre | `motivo_baja` |
| Tipo de dato | `nvarchar(200)` |
| Nulabilidad | **Permite NULL.** NULL si vigente. |
| Función | Motivo del retiro. |
| Justificación | Constancia. |
| Contenido | Hasta 200 caracteres. |
| Origen | Formulario o «RETIRO_ADMINISTRATIVO». |
| Momento inicial | NULL. |
| Modificación | Al retirar. |
| Validaciones | CHECK `ck_clasificacion_baja`; CHECK: no vacío. |

### D. Momento en que se crea un registro

**Escenario 1: El Administrador clasifica a una persona**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | ADMINISTRADOR |
| Pantalla / componente y acción | `AdminCrewQualifications` ([`main.jsx`](../../frontend-react/src/main.jsx), línea 717): selector de usuario y función. |
| Datos que aporta el usuario | Usuario y función. |
| Endpoint | `PUT /api/crew-qualifications/{userId}/{code}` ([`CrewQualificationController.java`](../../backend-java/src/main/java/com/vuelossanitarios/backend/api/CrewQualificationController.java)) |
| Servicio | `CrewManagementService.classify` |
| Validaciones y condiciones | Es idempotente: si ya está vigente no hace nada; toma el bloqueo de la persona. |
| Mecanismo que crea el registro | `qualifications.saveAndFlush(q)`. |
| Columnas completadas y de dónde sale cada valor | `id_usuarios`, `id_roles_tripulacion` ← parámetros; `id_usuario_clasificador` ← administrador; `fecha_clasificacion` ← DEFAULT `SYSUTCDATETIME()`. |
| Columnas que quedan NULL o con valor predeterminado | Baja. |
| Otros registros creados en la misma operación | Auditoría `CREW_QUALIFICATION/CREATE`. |
| Si la operación falla / atomicidad | Atómico. |

### E. Ejemplo funcional completo

**Situación:** el administrador clasifica a Sofía (usuario 60) como MEDICO y luego retira la función.

| id | id_usuarios | id_roles_tripulacion | id_usuario_clasificador | fecha_clasificacion | fecha_baja | id_usuario_baja | motivo_baja |
|---|---|---|---|---|---|---|---|
| 40 | 60 | MEDICO | 2 | 2026-10-01 | 2026-10-20 | 2 | RETIRO_ADMINISTRATIVO |
| 52 | 60 | MEDICO | 2 | 2026-10-25 | NULL | NULL | NULL |

Retirar (`DELETE /api/crew-qualifications/{userId}/{code}`) se rechaza (409 `CLASIFICACION_EN_USO`) mientras la persona tenga asignaciones vigentes en esa función en vuelos no terminales.

### F. Ciclo de vida del registro

| Transición | Acción | Actor | Campos |
|---|---|---|---|
| Clasificar | PUT | Admin | INSERT (vigente) |
| Retirar | DELETE (motivo opcional ≤ 200) | Admin | `fecha_baja`, `id_usuario_baja`, `motivo_baja` (por defecto «RETIRO_ADMINISTRATIVO») |
| Reclasificar | PUT tras un retiro | Admin | nueva fila |

### G. Relaciones con otras tablas

**Clave primaria:** `id_clasificaciones_tripulacion`.

**Claves foráneas salientes (tabla hija → padre):**

| Columna | Referencia | Borrado | Obligatoria |
|---|---|---|---|
| `id_usuario_clasificador` | `usuarios.id_usuarios` (`fk_clasificacion_actor`) | NO ACTION | Obligatoria |
| `id_roles_tripulacion` | `roles_tripulacion.id_roles_tripulacion` (`fk_clasificacion_funcion`) | NO ACTION | Obligatoria |
| `id_usuarios` | `usuarios.id_usuarios` (`fk_clasificacion_tripulante`) | NO ACTION | Obligatoria |
| `id_usuario_baja` | `usuarios.id_usuarios` (`fk_clasificacion_usuario_baja`) | NO ACTION | Opcional (NULL) |

**Claves foráneas entrantes:** ninguna.

FK a `usuarios` (persona, clasificador, baja) y `roles_tripulacion`. Consultada por candidatos, elegibilidad y por el barrido de monitoreo.

### H. Restricciones y decisiones de diseño

**Índices (no PK):**

| Índice | Único | Columnas | Filtro | Incluye |
|---|---|---|---|---|
| `ix_clasificacion_tripulacion_rol_vigente` | no | id_roles_tripulacion, id_usuarios | `fecha_baja IS NULL` | — |
| `ux_clasificacion_tripulacion_vigente` | sí | id_usuarios, id_roles_tripulacion | `fecha_baja IS NULL` | — |

**Restricciones CHECK:** 

- `ck_clasificacion_baja`: `(fecha_baja IS NULL AND id_usuario_baja IS NULL AND motivo_baja IS NULL OR fecha_baja IS NOT NULL AND id_usuario_baja IS NOT NULL AND motivo_baja IS NOT NULL AND len(ltrim(rtrim(motivo_baja)))>(0))`

**Triggers:** ninguno.

**DEFAULT / IDENTITY / nulabilidad:** ver la ficha de cada columna en la sección C (los DEFAULT figuran en «Validaciones»).

- **`ux_clasificacion_tripulacion_vigente` (V58):** una función vigente por persona; las bajas no compiten.
- **`ix_clasificacion_tripulacion_rol_vigente`:** búsqueda de candidatos por función.
- **CHECK `ck_clasificacion_baja`:** baja con fecha, actor y motivo no vacío.
- **Bloqueos:** clasificar y retirar toman el bloqueo de la persona, como asignar.

### I. Evidencia de implementación

- [`V33 (creación)`](../../backend-java/src/main/resources/db/migration/V33__clasificaciones_tripulacion.sql#L1)
- [`V58 (historial)`](../../backend-java/src/main/resources/db/migration/V58__clasificaciones_tripulacion_con_historial.sql#L21)
- [`Entidad CrewQualification`](../../backend-java/src/main/java/com/vuelossanitarios/backend/domain/flight/CrewQualification.java#L13)
- [`CrewManagementService.classify`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/CrewManagementService.java#L162)
- [`CrewManagementService.unclassify`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/CrewManagementService.java#L168)
- [`Controlador`](../../backend-java/src/main/java/com/vuelossanitarios/backend/api/CrewQualificationController.java#L17)
- [`Pantalla`](../../frontend-react/src/main.jsx#L717)
- [`Prueba: CrewClassificationConcurrencyIntegrationTest`](../../backend-java/src/test/java/com/vuelossanitarios/backend/service/CrewClassificationConcurrencyIntegrationTest.java#L37)

---

## 41. Tabla `habilitaciones_profesionales`

### A. Identificación de la tabla

| Atributo | Detalle |
|---|---|
| Nombre exacto y esquema | `dbo.habilitaciones_profesionales` (esquema `dbo`) |
| Módulo funcional | 6. Habilitaciones y clasificación de tripulación |
| Tipo de tabla | Principal — credenciales profesionales de una persona |
| Migración que la creó | V35 |
| Migraciones posteriores que modificaron su estructura | V36 (vencimiento_no_aplica), V59 (categoría, jurisdicción, restricciones, renovación; nuevos estados) |
| Estado actual en el esquema | Vigente — 18 columnas, PK `id_habilitaciones_profesionales`, 5 FK salientes, 4 FK entrantes, 0 índice(s) único(s), 2 CHECK, 0 trigger(s) (verificado contra `sys.*` de la base E2E en Flyway V62) |
| Tablas relacionadas | personas, roles_tripulacion, provincias, usuarios, documentos_habilitacion, decisiones_habilitacion, consultas_externas_habilitacion |

### B. Funcionalidad y justificación

Registra las **credenciales que acreditan a una persona para una función**: licencia de piloto, matrícula médica, etc., con tipo, número, organismo emisor, fechas, categoría de aeronave, jurisdicción, restricciones y su **estado administrativo** (PENDIENTE → VERIFICADA / RECHAZADA / CORRECCION_SOLICITADA; VERIFICADA → REVOCADA). Es una *revisión interna manual*: el sistema no consulta a ANAC ni a REFEPS/SISA (esas consultas son declarativas, en `consultas_externas_habilitacion`).

Una renovación es una habilitación nueva y pendiente que apunta a la anterior; la anterior sigue valiendo hasta que se verifique su sucesora o venza.

**Por qué es una tabla independiente.** Separa la credencial (hecho con ciclo de revisión y renovaciones) de la clasificación (decisión administrativa de funciones) y de la política (qué se considera suficiente).

**Qué dejaría de funcionar sin ella.** No habría base para decidir si una persona puede ser asignada a una función ni para avisar de vencimientos.

### C. Descripción campo por campo

#### `id_habilitaciones_profesionales`

| Atributo | Detalle |
|---|---|
| Nombre | `id_habilitaciones_profesionales` |
| Tipo de dato | `bigint` — IDENTITY(1,1) |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Clave primaria de la tabla: identifica de forma única cada fila y es el valor que otras tablas, la API y la auditoría usan para referirse a ella. |
| Justificación | Un identificador técnico numérico, estable y sin significado de negocio evita depender de datos que pueden cambiar (nombres, códigos) y hace eficientes los JOIN y las claves foráneas (decisión V24/V27: «toda tabla de aplicación tiene su propio id_<tabla> BIGINT IDENTITY»). |
| Contenido | Número entero positivo correlativo (1, 2, 3…). No lo ingresa el usuario. |
| Origen | SQL Server, columna IDENTITY(1,1): se asigna en el propio INSERT. Hibernate lo declara `@GeneratedValue(strategy = IDENTITY)` y lo lee de vuelta tras insertar. |
| Momento inicial | En el INSERT; no existe fila sin identificador. |
| Modificación | Nunca cambia (inmutable; JPA lo declara `updatable=false`). |
| Validaciones | PRIMARY KEY; PRIMARY KEY (unicidad y NOT NULL); no se reutiliza al borrar filas. |

#### `id_personas`

| Atributo | Detalle |
|---|---|
| Nombre | `id_personas` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Titular de la habilitación. |
| Justificación | Cuelga de la identidad de la persona. |
| Contenido | Identificador de `personas`. |
| Origen | Persona de la cuenta indicada. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `personas.id_personas` (borrado: NO ACTION); NOT NULL, FK. |

#### `id_roles_tripulacion`

| Atributo | Detalle |
|---|---|
| Nombre | `id_roles_tripulacion` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Función que acredita. |
| Justificación | Vincula con la política de suficiencia. |
| Contenido | Identificador de `roles_tripulacion`. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | Puede cambiar al modificar (nueva revisión). |
| Validaciones | FOREIGN KEY → `roles_tripulacion.id_roles_tripulacion` (borrado: NO ACTION); NOT NULL, FK. |

#### `tipo_habilitacion`

| Atributo | Detalle |
|---|---|
| Nombre | `tipo_habilitacion` |
| Tipo de dato | `nvarchar(100)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Tipo de credencial (p. ej. «Licencia de piloto»). |
| Justificación | Se compara con las políticas. |
| Contenido | Hasta 100 caracteres. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | Modificación. |
| Validaciones | NOT NULL. |

#### `numero_habilitacion`

| Atributo | Detalle |
|---|---|
| Nombre | `numero_habilitacion` |
| Tipo de dato | `nvarchar(100)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Número del documento. |
| Justificación | Permite el contraste con la fuente oficial. |
| Contenido | Hasta 100 caracteres. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | Modificación. |
| Validaciones | NOT NULL. |

#### `organismo_emisor`

| Atributo | Detalle |
|---|---|
| Nombre | `organismo_emisor` |
| Tipo de dato | `nvarchar(200)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Quién la emitió. |
| Justificación | Contexto. |
| Contenido | Hasta 200 caracteres. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | Modificación. |
| Validaciones | NOT NULL. |

#### `fecha_emision`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_emision` |
| Tipo de dato | `date` |
| Nulabilidad | **Permite NULL.** Opcional. |
| Función | Fecha de emisión. |
| Justificación | Vigencia. |
| Contenido | Fecha. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | Modificación. |
| Validaciones | CHECK `ck_habilitacion_fechas`; CHECK ≤ vencimiento. |

#### `fecha_vencimiento`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_vencimiento` |
| Tipo de dato | `date` |
| Nulabilidad | **Permite NULL.** NULL si la credencial no vence (entonces `vencimiento_no_aplica`=1). Para verificar debe haber vencimiento o «no aplica». |
| Función | Fecha de vencimiento. |
| Justificación | Determina la vigencia y los avisos. |
| Contenido | Fecha. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | Modificación. |
| Validaciones | CHECK `ck_habilitacion_fechas`; CHECK ≥ emisión. |

#### `estado_verificacion`

| Atributo | Detalle |
|---|---|
| Nombre | `estado_verificacion` |
| Tipo de dato | `varchar(25)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Estado de la revisión interna. |
| Justificación | Gobierna la suficiencia. |
| Contenido | PENDIENTE, VERIFICADA, RECHAZADA, REVOCADA o CORRECCION_SOLICITADA. |
| Origen | Backend. |
| Momento inicial | PENDIENTE. |
| Modificación | Decisiones; vuelve a PENDIENTE al modificarse o recibir evidencia nueva. |
| Validaciones | CHECK `ck_habilitacion_estado`; DEFAULT 'PENDIENTE'; CHECK; DEFAULT 'PENDIENTE'. |

#### `fecha_verificacion`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_verificacion` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **Permite NULL.** NULL mientras esté PENDIENTE sin decisión. |
| Función | Cuándo se tomó la última decisión. |
| Justificación | Trazabilidad. |
| Contenido | Fecha y hora (UTC). |
| Origen | Backend. |
| Momento inicial | NULL. |
| Modificación | En cada decisión; se borra al reiniciar la revisión. |
| Validaciones | — |

#### `id_usuario_verificador`

| Atributo | Detalle |
|---|---|
| Nombre | `id_usuario_verificador` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** NULL mientras esté PENDIENTE. |
| Función | Quién tomó la decisión. |
| Justificación | Responsabilidad. |
| Contenido | Identificador de `usuarios`. |
| Origen | Administrador autenticado. |
| Momento inicial | NULL. |
| Modificación | En cada decisión. |
| Validaciones | FOREIGN KEY → `usuarios.id_usuarios` (borrado: NO ACTION); FK; el titular no puede. |

#### `observaciones`

| Atributo | Detalle |
|---|---|
| Nombre | `observaciones` |
| Tipo de dato | `nvarchar(max)` |
| Nulabilidad | **Permite NULL.** Opcional. |
| Función | Notas del registro. |
| Justificación | Contexto. |
| Contenido | Texto. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | Modificación. |
| Validaciones | — |

#### `fecha_creacion`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_creacion` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Registra el instante en que la habilitación se incorporó al sistema. |
| Justificación | Permite ordenar cronológicamente, reconstruir el historial y aportar trazabilidad sin depender de la auditoría. |
| Contenido | Fecha y hora (DATETIME2) de la inserción. |
| Origen | Automático: DEFAULT `SYSDATETIME()` de SQL Server o `@CreationTimestamp` de Hibernate (según la entidad); el usuario nunca ingresa esta fecha. |
| Momento inicial | En el INSERT. |
| Modificación | Inmutable: ningún flujo la actualiza (`updatable=false` en la entidad). |
| Validaciones | DEFAULT sysutcdatetime() |

#### `vencimiento_no_aplica`

| Atributo | Detalle |
|---|---|
| Nombre | `vencimiento_no_aplica` |
| Tipo de dato | `bit` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Declaración de que la credencial no vence. |
| Justificación | Distingue «sin vencimiento» de «dato faltante» (V36). |
| Contenido | 0/1. |
| Origen | Formulario. |
| Momento inicial | 0. |
| Modificación | Modificación. |
| Validaciones | DEFAULT 0; No se admite junto con una fecha de vencimiento. |

#### `categoria_aeronave`

| Atributo | Detalle |
|---|---|
| Nombre | `categoria_aeronave` |
| Tipo de dato | `nvarchar(50)` |
| Nulabilidad | **Permite NULL.** Opcional. |
| Función | Categoría de aeronave a la que aplica. |
| Justificación | Políticas por categoría. |
| Contenido | Hasta 50 caracteres. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | Modificación. |
| Validaciones | — |

#### `id_provincias_jurisdiccion`

| Atributo | Detalle |
|---|---|
| Nombre | `id_provincias_jurisdiccion` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** Opcional (sólo si la política lo exige). |
| Función | Jurisdicción provincial de la credencial. |
| Justificación | Las políticas pueden exigirla. |
| Contenido | Identificador de `provincias`. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | Modificación. |
| Validaciones | FOREIGN KEY → `provincias.id_provincias` (borrado: NO ACTION); FK. |

#### `restricciones`

| Atributo | Detalle |
|---|---|
| Nombre | `restricciones` |
| Tipo de dato | `nvarchar(1000)` |
| Nulabilidad | **Permite NULL.** Opcional. |
| Función | Restricciones de la credencial. |
| Justificación | Deben confirmarse expresamente al verificar. |
| Contenido | Hasta 1000 caracteres. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | Modificación. |
| Validaciones | — |

#### `id_habilitacion_renovada`

| Atributo | Detalle |
|---|---|
| Nombre | `id_habilitacion_renovada` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** NULL en habilitaciones que no son renovación. |
| Función | Habilitación anterior a la que renueva. |
| Justificación | Cadena de renovación. |
| Contenido | Identificador de la propia tabla. |
| Origen | Backend. |
| Momento inicial | En el INSERT de la renovación. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `habilitaciones_profesionales.id_habilitaciones_profesionales` (borrado: NO ACTION); FK autorreferencia. |

### D. Momento en que se crea un registro

**Escenario 1: El Administrador registra una habilitación**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | ADMINISTRADOR (distinto del titular para las revisiones) |
| Pantalla / componente y acción | `ProfessionalCredentials` ([`credentials.jsx`](../../frontend-react/src/credentials.jsx), línea 34): **Guardar habilitación**. |
| Datos que aporta el usuario | Función, tipo, número, organismo, emisión, vencimiento (o «no aplica»), categoría de aeronave, jurisdicción, restricciones, observaciones. |
| Endpoint | `POST /api/users/{userId}/professional-credentials` ([`ProfessionalCredentialController.java`](../../backend-java/src/main/java/com/vuelossanitarios/backend/api/ProfessionalCredentialController.java)) |
| Servicio | `ProfessionalCredentialService.create` |
| Validaciones y condiciones | Función válida; vencimiento no anterior a la emisión; vencimiento o «no aplica», no ambos; bloqueo de la cuenta titular. |
| Mecanismo que crea el registro | `credentials.saveAndFlush(c)`. |
| Columnas completadas y de dónde sale cada valor | `id_personas` ← persona de la cuenta; `id_roles_tripulacion` ← función; campos del formulario; `estado_verificacion`='PENDIENTE'; `fecha_creacion` ← DEFAULT. |
| Columnas que quedan NULL o con valor predeterminado | Verificación y renovación. |
| Otros registros creados en la misma operación | Auditoría `PROFESSIONAL_CREDENTIAL/CREATE` y una decisión REGISTRO en `decisiones_habilitacion`. |
| Si la operación falla / atomicidad | Atómico. |

**Escenario 2: Renovación**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | ADMINISTRADOR |
| Pantalla / componente y acción | Detalle de la habilitación → renovar. |
| Datos que aporta el usuario | Nuevos datos (misma función). |
| Endpoint | `POST /api/professional-credentials/{id}/renew` |
| Servicio | `ProfessionalCredentialService.renew` |
| Validaciones y condiciones | Sólo VERIFICADA o vencida (no REVOCADA/RECHAZADA); misma función; no hay otra renovación pendiente. |
| Mecanismo que crea el registro | `credentials.saveAndFlush(next)`. |
| Columnas completadas y de dónde sale cada valor | Idem más `id_habilitacion_renovada` ← la anterior. |
| Columnas que quedan NULL o con valor predeterminado | Verificación. |
| Otros registros creados en la misma operación | Decisión RENOVACION y auditoría `RENEW`. |
| Si la operación falla / atomicidad | Atómico. |

### E. Ejemplo funcional completo

**Situación:** licencia de comandante de Luis.

| id | id_personas | id_roles_tripulacion | tipo_habilitacion | numero_habilitacion | organismo_emisor | fecha_emision | fecha_vencimiento | estado_verificacion | id_usuario_verificador |
|---|---|---|---|---|---|---|---|---|---|
| 300 | 101 | COMANDANTE | Licencia de piloto | ARG1234 | ANAC | 2022-03-01 | 2027-03-01 | PENDIENTE | NULL |

1. El Administrador adjunta el PDF (`documentos_habilitacion`, queda EN_CUARENTENA y se analiza).
2. Registra una consulta externa manual (`consultas_externas_habilitacion`, COINCIDE).
3. Un **Administrador distinto del titular** pulsa *Verificar*: requiere documentación limpia, vencimiento vigente o «no aplica», y confirmar suficiencia: `estado_verificacion`='VERIFICADA', `fecha_verificacion` y `id_usuario_verificador` se completan.
4. Si se **modifica** una habilitación ya revisada, vuelve a PENDIENTE y se borran verificador y fecha (la revisión se reinicia).

### F. Ciclo de vida del registro

| Transición | Acción | Actor | Campos | Validaciones |
|---|---|---|---|---|
| Alta | «Guardar habilitación» | Admin | INSERT (PENDIENTE) | — |
| Modificación | «Guardar» | Admin | datos; si ya había revisión: estado → PENDIENTE, verificación a NULL | no si REVOCADA |
| PENDIENTE → VERIFICADA | Verificar | Admin ≠ titular | estado, `fecha_verificacion`, `id_usuario_verificador` | documentación limpia, vigencia, suficiencia confirmada, restricciones aceptadas |
| PENDIENTE → RECHAZADA / CORRECCION_SOLICITADA | Rechazar / pedir corrección | Admin ≠ titular | idem | notas obligatorias |
| VERIFICADA → REVOCADA | Revocar | Admin ≠ titular | idem | notas obligatorias |
| Renovación | Renovar | Admin | nueva fila | — |
| Cambio de documentos | subir documento no externo a una habilitación revisada | Admin | vuelve a PENDIENTE | evita sostener una verificación con evidencia nueva sin revisar |
| Vencimiento | paso del tiempo | Sistema | **ninguno** (la vigencia se calcula con la fecha); avisos en notificaciones | — |

### G. Relaciones con otras tablas

**Clave primaria:** `id_habilitaciones_profesionales`.

**Claves foráneas salientes (tabla hija → padre):**

| Columna | Referencia | Borrado | Obligatoria |
|---|---|---|---|
| `id_personas` | `personas.id_personas` (`FK__habilitac__id_pe__1CDC41A7`) | NO ACTION | Obligatoria |
| `id_roles_tripulacion` | `roles_tripulacion.id_roles_tripulacion` (`FK__habilitac__id_ro__1DD065E0`) | NO ACTION | Obligatoria |
| `id_usuario_verificador` | `usuarios.id_usuarios` (`FK__habilitac__id_us__1FB8AE52`) | NO ACTION | Opcional (NULL) |
| `id_provincias_jurisdiccion` | `provincias.id_provincias` (`fk_habilitacion_jurisdiccion`) | NO ACTION | Opcional (NULL) |
| `id_habilitacion_renovada` | `habilitaciones_profesionales.id_habilitaciones_profesionales` (`fk_habilitacion_renovada`) | NO ACTION | Opcional (NULL) |

**Claves foráneas entrantes (tablas hijas):** `consultas_externas_habilitacion`(id_habilitaciones_profesionales), `decisiones_habilitacion`(id_habilitaciones_profesionales), `documentos_habilitacion`(id_habilitaciones_profesionales), `habilitaciones_profesionales`(id_habilitacion_renovada).

FK `id_personas` (titular), `id_roles_tripulacion` (función), `id_provincias_jurisdiccion` (opcional), `id_usuario_verificador` (opcional), `id_habilitacion_renovada` (autorreferencia). Padre de `documentos_habilitacion`, `decisiones_habilitacion` y `consultas_externas_habilitacion`.

### H. Restricciones y decisiones de diseño

**Índices (no PK):**

| Índice | Único | Columnas | Filtro | Incluye |
|---|---|---|---|---|
| `ix_habilitaciones_persona_funcion` | no | id_personas, id_roles_tripulacion, estado_verificacion | — | — |
| `ix_habilitaciones_renovada` | no | id_habilitacion_renovada | `id_habilitacion_renovada IS NOT NULL` | — |

**Restricciones CHECK:** 

- `ck_habilitacion_estado`: `(estado_verificacion='CORRECCION_SOLICITADA' OR estado_verificacion='REVOCADA' OR estado_verificacion='RECHAZADA' OR estado_verificacion='VERIFICADA' OR estado_verificacion='PENDIENTE')`
- `ck_habilitacion_fechas`: `(fecha_emision IS NULL OR fecha_vencimiento IS NULL OR fecha_vencimiento>=fecha_emision)`

**Triggers:** ninguno.

**DEFAULT / IDENTITY / nulabilidad:** ver la ficha de cada columna en la sección C (los DEFAULT figuran en «Validaciones»).

- **`ck_habilitacion_estado`:** cinco estados. **`ck_habilitacion_fechas`:** vencimiento ≥ emisión.
- **`ix_habilitaciones_persona_funcion`:** consulta por persona y función.
- **Sin unicidad por número:** una misma persona puede registrar varias habilitaciones iguales (observación).
- **Auto-verificación prohibida:** el titular no puede verificar, rechazar ni revocar sus propias habilitaciones (regla en servicio, `forbidSelfReview`).

### I. Evidencia de implementación

- [`V35 (creación)`](../../backend-java/src/main/resources/db/migration/V35__habilitaciones_profesionales.sql#L1)
- [`V59 (ciclo de vida)`](../../backend-java/src/main/resources/db/migration/V59__politica_habilitaciones_ciclo_y_documentos.sql#L9)
- [`Entidad ProfessionalCredential`](../../backend-java/src/main/java/com/vuelossanitarios/backend/domain/person/ProfessionalCredential.java#L10)
- [`ProfessionalCredentialService.create`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/ProfessionalCredentialService.java#L160)
- [`ProfessionalCredentialService.decide`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/ProfessionalCredentialService.java#L185)
- [`Controlador`](../../backend-java/src/main/java/com/vuelossanitarios/backend/api/ProfessionalCredentialController.java#L29)
- [`Pantalla`](../../frontend-react/src/credentials.jsx#L34)
- [`Prueba: CredentialLifecycleIntegrationTest`](../../backend-java/src/test/java/com/vuelossanitarios/backend/service/CredentialLifecycleIntegrationTest.java#L35)
- [`Prueba: ProfessionalCredentialServiceTest`](../../backend-java/src/test/java/com/vuelossanitarios/backend/service/ProfessionalCredentialServiceTest.java#L19)

---

## 42. Tabla `documentos_habilitacion`

### A. Identificación de la tabla

| Atributo | Detalle |
|---|---|
| Nombre exacto y esquema | `dbo.documentos_habilitacion` (esquema `dbo`) |
| Módulo funcional | 6. Habilitaciones y clasificación de tripulación |
| Tipo de tabla | Versionada con integridad — evidencia documental de habilitaciones |
| Migración que la creó | V35 |
| Migraciones posteriores que modificaron su estructura | V59 (propósito, huella SHA-256, versión, análisis antimalware, baja, bloqueo de conservación), V60 (origen del registro, momento de la huella, regularización y trigger de integridad) |
| Estado actual en el esquema | Vigente — 24 columnas, PK `id_documentos_habilitacion`, 5 FK salientes, 3 FK entrantes, 0 índice(s) único(s), 8 CHECK, 1 trigger(s) (verificado contra `sys.*` de la base E2E en Flyway V62) |
| Tablas relacionadas | habilitaciones_profesionales, usuarios, decisiones_habilitacion, consultas_externas_habilitacion |

### B. Funcionalidad y justificación

Cada fila es **un archivo PDF** que respalda una habilitación (copia de la licencia, constancia de consulta externa…): su clave en el almacenamiento, nombre, huella SHA-256, tamaño, propósito, versión, resultado del **análisis antimalware** y retiro con motivo. Un documento nuevo nace **EN_CUARENTENA** hasta que el analizador (ClamAV) lo declara LIMPIO o lo RECHAZA; sólo los limpios cuentan para verificar y se pueden descargar.

Los documentos anteriores a V59 se marcaron **LEGADO_SIN_ANALISIS** y se regularizan aparte (calculando su huella *en ese momento*, lo que no prueba integridad desde la carga original).

**Por qué es una tabla independiente.** La evidencia tiene su propio ciclo (análisis, retiro, conservación, reemplazo) y se versiona; el trigger de V60 protege la integridad del archivo y la huella.

**Qué dejaría de funcionar sin ella.** No habría evidencia documental ni control antimalware de los archivos de habilitaciones.

### C. Descripción campo por campo

#### `id_documentos_habilitacion`

| Atributo | Detalle |
|---|---|
| Nombre | `id_documentos_habilitacion` |
| Tipo de dato | `bigint` — IDENTITY(1,1) |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Clave primaria de la tabla: identifica de forma única cada fila y es el valor que otras tablas, la API y la auditoría usan para referirse a ella. |
| Justificación | Un identificador técnico numérico, estable y sin significado de negocio evita depender de datos que pueden cambiar (nombres, códigos) y hace eficientes los JOIN y las claves foráneas (decisión V24/V27: «toda tabla de aplicación tiene su propio id_<tabla> BIGINT IDENTITY»). |
| Contenido | Número entero positivo correlativo (1, 2, 3…). No lo ingresa el usuario. |
| Origen | SQL Server, columna IDENTITY(1,1): se asigna en el propio INSERT. Hibernate lo declara `@GeneratedValue(strategy = IDENTITY)` y lo lee de vuelta tras insertar. |
| Momento inicial | En el INSERT; no existe fila sin identificador. |
| Modificación | Nunca cambia (inmutable; JPA lo declara `updatable=false`). |
| Validaciones | PRIMARY KEY; PRIMARY KEY (unicidad y NOT NULL); no se reutiliza al borrar filas. |

#### `id_habilitaciones_profesionales`

| Atributo | Detalle |
|---|---|
| Nombre | `id_habilitaciones_profesionales` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Habilitación que respalda. |
| Justificación | Cada documento pertenece a una credencial. |
| Contenido | Identificador de `habilitaciones_profesionales`. |
| Origen | Backend. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia (trigger). |
| Validaciones | FOREIGN KEY → `habilitaciones_profesionales.id_habilitaciones_profesionales` (borrado: NO ACTION); NOT NULL, FK. |

#### `clave_archivo`

| Atributo | Detalle |
|---|---|
| Nombre | `clave_archivo` |
| Tipo de dato | `nvarchar(120)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Clave del archivo en el almacenamiento. |
| Justificación | El PDF no se guarda en la base. |
| Contenido | Clave generada (hasta 120). |
| Origen | Almacenamiento. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia (trigger). |
| Validaciones | NOT NULL. |

#### `nombre_archivo`

| Atributo | Detalle |
|---|---|
| Nombre | `nombre_archivo` |
| Tipo de dato | `nvarchar(255)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Nombre original. |
| Justificación | Mostrar y descargar. |
| Contenido | Hasta 255 caracteres. |
| Origen | Archivo subido. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | NOT NULL. |

#### `id_usuario_cargador`

| Atributo | Detalle |
|---|---|
| Nombre | `id_usuario_cargador` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Quién subió. |
| Justificación | Responsabilidad. |
| Contenido | Identificador de `usuarios`. |
| Origen | Usuario autenticado. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `usuarios.id_usuarios` (borrado: NO ACTION); NOT NULL, FK. |

#### `fecha_carga`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_carga` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Cuándo se subió. |
| Justificación | Trazabilidad. |
| Contenido | Fecha y hora (UTC). |
| Origen | Backend / DEFAULT. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | DEFAULT sysutcdatetime(); DEFAULT. |

#### `proposito`

| Atributo | Detalle |
|---|---|
| Nombre | `proposito` |
| Tipo de dato | `varchar(25)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Para qué se subió. |
| Justificación | Distinguir evidencia de renovación o de consulta externa (esta última no reinicia la revisión). |
| Contenido | EVIDENCIA, RENOVACION, CORRECCION o CONSULTA_EXTERNA. |
| Origen | Formulario. |
| Momento inicial | EVIDENCIA por defecto. |
| Modificación | No cambia (trigger). |
| Validaciones | CHECK `ck_dochab_proposito`; DEFAULT 'EVIDENCIA'; CHECK. |

#### `hash_sha256`

| Atributo | Detalle |
|---|---|
| Nombre | `hash_sha256` |
| Tipo de dato | `char(64)` |
| Nulabilidad | **Permite NULL.** NULL en documentos heredados no regularizados: sin huella no se prueba integridad. |
| Función | Huella SHA-256 del archivo. |
| Justificación | Prueba de integridad y detección de duplicados. |
| Contenido | 64 hexadecimales. |
| Origen | Backend (al cargar o al regularizar). |
| Momento inicial | En el INSERT. |
| Modificación | Una vez registrada no cambia (trigger). |
| Validaciones | CHECK `ck_dochab_hash_coherente`; CHECK de coherencia con `hash_momento`. |

#### `tamano_bytes`

| Atributo | Detalle |
|---|---|
| Nombre | `tamano_bytes` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** NULL en documentos heredados no regularizados. |
| Función | Tamaño del archivo. |
| Justificación | Control. |
| Contenido | Entero largo. |
| Origen | Backend. |
| Momento inicial | En el INSERT. |
| Modificación | Al regularizar un legado. |
| Validaciones | — |

#### `numero_version`

| Atributo | Detalle |
|---|---|
| Nombre | `numero_version` |
| Tipo de dato | `int` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Versión dentro de la habilitación. |
| Justificación | Historial. |
| Contenido | Entero ≥ 1. |
| Origen | Backend (máx. + 1). |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | DEFAULT 1; DEFAULT 1. |

#### `id_documento_reemplazado`

| Atributo | Detalle |
|---|---|
| Nombre | `id_documento_reemplazado` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** NULL si no reemplaza a otro. |
| Función | Documento al que sustituye. |
| Justificación | Cadena de reemplazos. |
| Contenido | Identificador de la propia tabla. |
| Origen | Backend. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `documentos_habilitacion.id_documentos_habilitacion` (borrado: NO ACTION); FK autorreferencia. |

#### `estado_analisis`

| Atributo | Detalle |
|---|---|
| Nombre | `estado_analisis` |
| Tipo de dato | `varchar(25)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Resultado del análisis antimalware. |
| Justificación | Sólo LIMPIO cuenta para verificar y descargar. |
| Contenido | EN_CUARENTENA, LIMPIO, RECHAZADO, ERROR_ANALISIS o LEGADO_SIN_ANALISIS. |
| Origen | Backend. |
| Momento inicial | EN_CUARENTENA. |
| Modificación | Análisis o regularización. |
| Validaciones | CHECK `ck_dochab_analisis`; DEFAULT 'EN_CUARENTENA'; CHECK. |

#### `fecha_analisis`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_analisis` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **Permite NULL.** NULL mientras esté en cuarentena sin analizar. |
| Función | Cuándo se analizó. |
| Justificación | Trazabilidad. |
| Contenido | Fecha y hora. |
| Origen | Backend. |
| Momento inicial | NULL. |
| Modificación | En cada análisis. |
| Validaciones | — |

#### `motor_analisis`

| Atributo | Detalle |
|---|---|
| Nombre | `motor_analisis` |
| Tipo de dato | `nvarchar(100)` |
| Nulabilidad | **Permite NULL.** NULL hasta el primer análisis. |
| Función | Motor que analizó (p. ej. clamav). |
| Justificación | Trazabilidad. |
| Contenido | Hasta 100 caracteres. |
| Origen | Analizador. |
| Momento inicial | NULL. |
| Modificación | En el análisis. |
| Validaciones | — |

#### `detalle_analisis`

| Atributo | Detalle |
|---|---|
| Nombre | `detalle_analisis` |
| Tipo de dato | `nvarchar(500)` |
| Nulabilidad | **Permite NULL.** NULL hasta que exista detalle. |
| Función | Detalle del resultado. |
| Justificación | Explica rechazos y errores. |
| Contenido | Hasta 500 caracteres. |
| Origen | Analizador. |
| Momento inicial | NULL. |
| Modificación | En el análisis o regularización. |
| Validaciones | — |

#### `fecha_baja`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_baja` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **Permite NULL.** NULL mientras esté activo. |
| Función | Cuándo se retiró. |
| Justificación | Baja lógica. |
| Contenido | Fecha y hora. |
| Origen | Backend. |
| Momento inicial | NULL. |
| Modificación | Al retirar o reemplazar. |
| Validaciones | CHECK `ck_dochab_baja`; CHECK de baja; inmutable una vez puesta. |

#### `id_usuario_baja`

| Atributo | Detalle |
|---|---|
| Nombre | `id_usuario_baja` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** NULL si activo. |
| Función | Quién retiró. |
| Justificación | Responsabilidad. |
| Contenido | Identificador de `usuarios`. |
| Origen | Usuario autenticado. |
| Momento inicial | NULL. |
| Modificación | Al retirar. |
| Validaciones | FOREIGN KEY → `usuarios.id_usuarios` (borrado: NO ACTION); CHECK `ck_dochab_baja`; CHECK. |

#### `motivo_baja`

| Atributo | Detalle |
|---|---|
| Nombre | `motivo_baja` |
| Tipo de dato | `nvarchar(500)` |
| Nulabilidad | **Permite NULL.** NULL si activo. |
| Función | Por qué se retiró. |
| Justificación | Constancia. |
| Contenido | Hasta 500 caracteres. |
| Origen | Formulario o «Reemplazado por la versión n». |
| Momento inicial | NULL. |
| Modificación | Al retirar. |
| Validaciones | CHECK `ck_dochab_baja`; CHECK. |

#### `bloqueo_conservacion`

| Atributo | Detalle |
|---|---|
| Nombre | `bloqueo_conservacion` |
| Tipo de dato | `bit` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Impide retirar o reemplazar. |
| Justificación | Proteger evidencia ante solicitudes de rectificación/supresión o auditorías. |
| Contenido | 0/1. |
| Origen | Admin. |
| Momento inicial | 0. |
| Modificación | «bloquear» o solicitud de datos; «liberar». |
| Validaciones | CHECK `ck_dochab_bloqueo`; DEFAULT 0; CHECK: si es 1 exige motivo. |

#### `motivo_bloqueo`

| Atributo | Detalle |
|---|---|
| Nombre | `motivo_bloqueo` |
| Tipo de dato | `nvarchar(500)` |
| Nulabilidad | **Permite NULL.** NULL si no está bloqueado. |
| Función | Motivo del bloqueo. |
| Justificación | Constancia. |
| Contenido | Hasta 500 caracteres. |
| Origen | Admin / sistema. |
| Momento inicial | NULL. |
| Modificación | Con el bloqueo. |
| Validaciones | CHECK `ck_dochab_bloqueo`; CHECK. |

#### `origen_registro`

| Atributo | Detalle |
|---|---|
| Nombre | `origen_registro` |
| Tipo de dato | `varchar(15)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Si el documento es anterior o posterior a V59. |
| Justificación | Los heredados no tienen huella ni análisis originales; esa condición es permanente. |
| Contenido | ANTERIOR_V59 o POSTERIOR_V59. |
| Origen | Migración / backend. |
| Momento inicial | POSTERIOR_V59. |
| Modificación | No cambia (trigger). |
| Validaciones | CHECK `ck_dochab_origen`; CHECK `ck_dochab_regularizacion`; DEFAULT 'POSTERIOR_V59'; CHECK. |

#### `hash_momento`

| Atributo | Detalle |
|---|---|
| Nombre | `hash_momento` |
| Tipo de dato | `varchar(15)` |
| Nulabilidad | **Permite NULL.** NULL si no hay huella. |
| Función | Cuándo se calculó la huella. |
| Justificación | CARGA prueba que no cambió desde la carga; REGULARIZACION no. |
| Contenido | CARGA o REGULARIZACION. |
| Origen | Backend. |
| Momento inicial | CARGA al subir. |
| Modificación | Una vez registrada no cambia. |
| Validaciones | CHECK `ck_dochab_hash_coherente`; CHECK `ck_dochab_hash_momento`; CHECK de coherencia con la huella. |

#### `fecha_regularizacion`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_regularizacion` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **Permite NULL.** NULL salvo documentos heredados regularizados. |
| Función | Cuándo se regularizó un legado. |
| Justificación | Trazabilidad. |
| Contenido | Fecha y hora. |
| Origen | Backend. |
| Momento inicial | NULL. |
| Modificación | Al regularizar. |
| Validaciones | CHECK `ck_dochab_regularizacion`; CHECK: sólo ANTERIOR_V59. |

#### `id_usuario_regularizacion`

| Atributo | Detalle |
|---|---|
| Nombre | `id_usuario_regularizacion` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** Idem. |
| Función | Quién regularizó. |
| Justificación | Responsabilidad. |
| Contenido | Identificador de `usuarios`. |
| Origen | Usuario autenticado. |
| Momento inicial | NULL. |
| Modificación | Al regularizar. |
| Validaciones | FOREIGN KEY → `usuarios.id_usuarios` (borrado: NO ACTION); CHECK `ck_dochab_regularizacion`; FK, CHECK. |

### D. Momento en que se crea un registro

**Escenario 1: El Administrador adjunta un documento**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | ADMINISTRADOR |
| Pantalla / componente y acción | `ProfessionalCredentials`: **Adjuntar documento**. |
| Datos que aporta el usuario | Archivo PDF, propósito (EVIDENCIA, RENOVACION, CORRECCION, CONSULTA_EXTERNA) y, opcionalmente, el documento que reemplaza. |
| Endpoint | `POST /api/professional-credentials/{id}/documents` (multipart) |
| Servicio | `CredentialDocumentService.upload` (validación y escaneo **fuera** de la transacción, alta dentro) |
| Validaciones y condiciones | PDF válido (`PdfInspector`); propósito válido; habilitación no revocada; sin duplicado activo de la misma huella; si reemplaza, el anterior debe estar activo y sin bloqueo de conservación; no auto-gestión del titular. |
| Mecanismo que crea el registro | `documents.saveAndFlush(d)` y, si reemplaza, UPDATE del anterior (baja). |
| Columnas completadas y de dónde sale cada valor | `id_habilitaciones_profesionales`; `clave_archivo` ← clave de almacenamiento; `nombre_archivo` ← nombre sin ruta; `id_usuario_cargador`; `fecha_carga`; `proposito`; `hash_sha256` y `hash_momento`='CARGA'; `tamano_bytes`; `numero_version` = máx. + 1; `id_documento_reemplazado`; `estado_analisis`='EN_CUARENTENA'; `origen_registro`='POSTERIOR_V59'. |
| Columnas que quedan NULL o con valor predeterminado | Análisis, baja, bloqueo y regularización. |
| Otros registros creados en la misma operación | Decisión DOCUMENTO, evento `CREDENTIAL_DOCUMENT/CREATE` y, si el estado ya era revisado, la habilitación vuelve a PENDIENTE. |
| Si la operación falla / atomicidad | Si la transacción falla se elimina el archivo (callback de transacción). El análisis se hace después, en otra transacción. |

**Escenario 2: Migración V59**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | Flyway |
| Pantalla / componente y acción | — |
| Datos que aporta el usuario | — |
| Endpoint | — |
| Servicio | V59/V60 |
| Validaciones y condiciones | — |
| Mecanismo que crea el registro | ALTER + UPDATE: marca los existentes como LEGADO_SIN_ANALISIS y ANTERIOR_V59. |
| Columnas completadas y de dónde sale cada valor | — |
| Columnas que quedan NULL o con valor predeterminado | — |
| Otros registros creados en la misma operación | — |
| Si la operación falla / atomicidad | — |

### E. Ejemplo funcional completo

**Situación:** se adjunta la licencia de Luis (habilitación 300).

| id | id_habilitaciones_profesionales | nombre_archivo | numero_version | proposito | hash_sha256 | hash_momento | estado_analisis | fecha_analisis | motor_analisis |
|---|---|---|---|---|---|---|---|---|---|
| 900 | 300 | licencia.pdf | 1 | EVIDENCIA | (64 hex) | CARGA | EN_CUARENTENA → LIMPIO | 2026-11-01 11:00:03 | clamav |

El análisis lo ejecuta el servicio justo después de la carga; si el antivirus no responde queda ERROR_ANALISIS y un proceso programado lo reintenta cada 5 minutos. Para **reemplazarlo**, se sube otro (v2) con `id_documento_reemplazado`=900 y el 900 recibe `fecha_baja` y motivo «Reemplazado por la versión 2». Con **bloqueo de conservación** (`bloqueo_conservacion`=1 + motivo) no puede retirarse ni reemplazarse.

### F. Ciclo de vida del registro

| Transición | Acción | Actor | Campos |
|---|---|---|---|
| Alta | Adjuntar | Admin | INSERT (EN_CUARENTENA) |
| EN_CUARENTENA / ERROR_ANALISIS → LIMPIO / RECHAZADO | análisis antimalware (automático o «Reintentar») | Sistema / Admin | `estado_analisis`, `fecha_analisis`, `motor_analisis`, `detalle_analisis` |
| Retiro | «Retirar» (motivo) | Admin ≠ titular | `fecha_baja`, `id_usuario_baja`, `motivo_baja` |
| Reemplazo | subir con reemplazo | Admin | baja del anterior + INSERT |
| Bloqueo de conservación | «bloquear» / solicitud de rectificación o supresión | Admin | `bloqueo_conservacion`, `motivo_bloqueo` |
| Regularización de legado | «Regularizar» | Admin | huella (REGULARIZACION), análisis, `fecha_regularizacion`, `id_usuario_regularizacion` |
| Borrado | prohibido por trigger | — | — |

### G. Relaciones con otras tablas

**Clave primaria:** `id_documentos_habilitacion`.

**Claves foráneas salientes (tabla hija → padre):**

| Columna | Referencia | Borrado | Obligatoria |
|---|---|---|---|
| `id_habilitaciones_profesionales` | `habilitaciones_profesionales.id_habilitaciones_profesionales` (`FK__documento__id_ha__257187A8`) | NO ACTION | Obligatoria |
| `id_usuario_baja` | `usuarios.id_usuarios` (`FK__documento__id_us__0E591826`) | NO ACTION | Opcional (NULL) |
| `id_usuario_cargador` | `usuarios.id_usuarios` (`FK__documento__id_us__2665ABE1`) | NO ACTION | Obligatoria |
| `id_documento_reemplazado` | `documentos_habilitacion.id_documentos_habilitacion` (`fk_dochab_reemplazado`) | NO ACTION | Opcional (NULL) |
| `id_usuario_regularizacion` | `usuarios.id_usuarios` (`fk_dochab_regularizo`) | NO ACTION | Opcional (NULL) |

**Claves foráneas entrantes (tablas hijas):** `consultas_externas_habilitacion`(id_documentos_habilitacion), `decisiones_habilitacion`(id_documentos_habilitacion), `documentos_habilitacion`(id_documento_reemplazado).

FK a `habilitaciones_profesionales`, a `usuarios` (cargador, baja, regularización) y a la propia tabla (`id_documento_reemplazado`). Referenciada por `decisiones_habilitacion` y `consultas_externas_habilitacion` (evidencia).

### H. Restricciones y decisiones de diseño

**Índices (no PK):**

| Índice | Único | Columnas | Filtro | Incluye |
|---|---|---|---|---|
| `ix_dochab_habilitacion` | no | id_habilitaciones_profesionales, numero_version | — | — |
| `ix_dochab_origen_analisis` | no | origen_registro, estado_analisis | — | — |

**Restricciones CHECK:** 

- `ck_dochab_analisis`: `(estado_analisis='LEGADO_SIN_ANALISIS' OR estado_analisis='ERROR_ANALISIS' OR estado_analisis='RECHAZADO' OR estado_analisis='LIMPIO' OR estado_analisis='EN_CUARENTENA')`
- `ck_dochab_baja`: `(fecha_baja IS NULL AND id_usuario_baja IS NULL AND motivo_baja IS NULL OR fecha_baja IS NOT NULL AND id_usuario_baja IS NOT NULL AND motivo_baja IS NOT NULL)`
- `ck_dochab_bloqueo`: `(bloqueo_conservacion=(0) OR motivo_bloqueo IS NOT NULL)`
- `ck_dochab_hash_coherente`: `(hash_sha256 IS NULL AND hash_momento IS NULL OR hash_sha256 IS NOT NULL AND hash_momento IS NOT NULL)`
- `ck_dochab_hash_momento`: `(hash_momento IS NULL OR (hash_momento='REGULARIZACION' OR hash_momento='CARGA'))`
- `ck_dochab_origen`: `(origen_registro='POSTERIOR_V59' OR origen_registro='ANTERIOR_V59')`
- `ck_dochab_proposito`: `(proposito='CONSULTA_EXTERNA' OR proposito='CORRECCION' OR proposito='RENOVACION' OR proposito='EVIDENCIA')`
- `ck_dochab_regularizacion`: `(fecha_regularizacion IS NULL AND id_usuario_regularizacion IS NULL OR fecha_regularizacion IS NOT NULL AND id_usuario_regularizacion IS NOT NULL AND origen_registro='ANTERIOR_V59')`

**Triggers:** `tr_documentos_habilitacion_integridad`

**DEFAULT / IDENTITY / nulabilidad:** ver la ficha de cada columna en la sección C (los DEFAULT figuran en «Validaciones»).

- **Trigger `tr_documentos_habilitacion_integridad` (V60):** prohíbe DELETE y cambios en archivo, habilitación, origen, propósito, huella registrada y baja registrada.
- **CHECK:** análisis y propósito en conjuntos cerrados; huella y momento van juntos; baja completa; bloqueo exige motivo; regularización sólo para ANTERIOR_V59.
- **Archivo fuera de la base:** sólo la clave y la huella; la huella permite detectar alteraciones al descargar.
- **Observación:** la columna se llama `tamano_bytes` aquí y `tamanio_bytes` en otras tablas (nombres inconsistentes).

### I. Evidencia de implementación

- [`V35 (creación)`](../../backend-java/src/main/resources/db/migration/V35__habilitaciones_profesionales.sql#L18)
- [`V59 (análisis y huella)`](../../backend-java/src/main/resources/db/migration/V59__politica_habilitaciones_ciclo_y_documentos.sql#L112)
- [`V60 (integridad)`](../../backend-java/src/main/resources/db/migration/V60__endurecimiento_politicas_y_documentos_heredados.sql#L73)
- [`Entidad CredentialDocument`](../../backend-java/src/main/java/com/vuelossanitarios/backend/domain/person/CredentialDocument.java#L8)
- [`CredentialDocumentService.upload`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/CredentialDocumentService.java#L53)
- [`CredentialDocumentService.retire`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/CredentialDocumentService.java#L130)
- [`LegacyDocumentService`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/LegacyDocumentService.java#L30)
- [`Pantalla`](../../frontend-react/src/credentials.jsx#L113)
- [`Prueba: PolicyActivationAndLegacyIntegrationTest`](../../backend-java/src/test/java/com/vuelossanitarios/backend/service/PolicyActivationAndLegacyIntegrationTest.java#L38)

---

## 43. Tabla `decisiones_habilitacion`

### A. Identificación de la tabla

| Atributo | Detalle |
|---|---|
| Nombre exacto y esquema | `dbo.decisiones_habilitacion` (esquema `dbo`) |
| Módulo funcional | 6. Habilitaciones y clasificación de tripulación |
| Tipo de tabla | Historial inmutable — decisiones sobre habilitaciones |
| Migración que la creó | V59 |
| Migraciones posteriores que modificaron su estructura | V60 (trigger de inmutabilidad) |
| Estado actual en el esquema | Vigente — 8 columnas, PK `id_decisiones_habilitacion`, 3 FK salientes, 0 FK entrantes, 0 índice(s) único(s), 1 CHECK, 1 trigger(s) (verificado contra `sys.*` de la base E2E en Flyway V62) |
| Tablas relacionadas | habilitaciones_profesionales, usuarios, documentos_habilitacion |

### B. Funcionalidad y justificación

Registra **cada decisión o hecho relevante** sobre una habilitación (registro, modificación, documento, verificación, rechazo, corrección, revocación, renovación, consulta externa, retiro y bloqueo de documentos, solicitudes de rectificación/supresión, análisis), con actor, fecha, motivo, estado resultante y documento de evidencia. Se escribe en la misma transacción que el cambio y se muestra en «Consultar historial».

**Por qué es una tabla independiente.** Es el historial inmutable de la revisión: la habilitación sólo guarda el estado actual.

**Qué dejaría de funcionar sin ella.** No se sabría quién decidió qué ni por qué.

### C. Descripción campo por campo

#### `id_decisiones_habilitacion`

| Atributo | Detalle |
|---|---|
| Nombre | `id_decisiones_habilitacion` |
| Tipo de dato | `bigint` — IDENTITY(1,1) |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Clave primaria de la tabla: identifica de forma única cada fila y es el valor que otras tablas, la API y la auditoría usan para referirse a ella. |
| Justificación | Un identificador técnico numérico, estable y sin significado de negocio evita depender de datos que pueden cambiar (nombres, códigos) y hace eficientes los JOIN y las claves foráneas (decisión V24/V27: «toda tabla de aplicación tiene su propio id_<tabla> BIGINT IDENTITY»). |
| Contenido | Número entero positivo correlativo (1, 2, 3…). No lo ingresa el usuario. |
| Origen | SQL Server, columna IDENTITY(1,1): se asigna en el propio INSERT. Hibernate lo declara `@GeneratedValue(strategy = IDENTITY)` y lo lee de vuelta tras insertar. |
| Momento inicial | En el INSERT; no existe fila sin identificador. |
| Modificación | Nunca cambia (inmutable; JPA lo declara `updatable=false`). |
| Validaciones | PRIMARY KEY; PRIMARY KEY (unicidad y NOT NULL); no se reutiliza al borrar filas. |

#### `id_habilitaciones_profesionales`

| Atributo | Detalle |
|---|---|
| Nombre | `id_habilitaciones_profesionales` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Habilitación afectada. |
| Justificación | Historial por credencial. |
| Contenido | Identificador de `habilitaciones_profesionales`. |
| Origen | Backend. |
| Momento inicial | En el INSERT. |
| Modificación | Inmutable. |
| Validaciones | FOREIGN KEY → `habilitaciones_profesionales.id_habilitaciones_profesionales` (borrado: NO ACTION); NOT NULL, FK. |

#### `tipo_decision`

| Atributo | Detalle |
|---|---|
| Nombre | `tipo_decision` |
| Tipo de dato | `varchar(30)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Clase de decisión o hecho. |
| Justificación | Distingue qué ocurrió. |
| Contenido | Uno de 15 tipos. |
| Origen | Servicio. |
| Momento inicial | En el INSERT. |
| Modificación | Inmutable. |
| Validaciones | CHECK `ck_decision_tipo`; CHECK. |

#### `estado_resultante`

| Atributo | Detalle |
|---|---|
| Nombre | `estado_resultante` |
| Tipo de dato | `varchar(25)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Estado de la habilitación tras la acción. |
| Justificación | Reconstruir la evolución. |
| Contenido | Uno de los 5 estados. |
| Origen | Backend. |
| Momento inicial | En el INSERT. |
| Modificación | Inmutable. |
| Validaciones | NOT NULL. |

#### `id_usuarios`

| Atributo | Detalle |
|---|---|
| Nombre | `id_usuarios` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Autor de la decisión. |
| Justificación | Responsabilidad. |
| Contenido | Identificador de `usuarios`. |
| Origen | Usuario autenticado o cargador. |
| Momento inicial | En el INSERT. |
| Modificación | Inmutable. |
| Validaciones | FOREIGN KEY → `usuarios.id_usuarios` (borrado: NO ACTION); NOT NULL, FK. |

#### `fecha_decision`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_decision` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Cuándo ocurrió. |
| Justificación | Orden. |
| Contenido | Fecha y hora (UTC). |
| Origen | Backend. |
| Momento inicial | En el INSERT. |
| Modificación | Inmutable. |
| Validaciones | DEFAULT sysutcdatetime(); DEFAULT. |

#### `motivo`

| Atributo | Detalle |
|---|---|
| Nombre | `motivo` |
| Tipo de dato | `nvarchar(4000)` |
| Nulabilidad | **Permite NULL.** Opcional. |
| Función | Notas o motivo. |
| Justificación | Justificación. |
| Contenido | Hasta 4000 caracteres. |
| Origen | Formulario o texto del servicio. |
| Momento inicial | En el INSERT. |
| Modificación | Inmutable. |
| Validaciones | — |

#### `id_documentos_habilitacion`

| Atributo | Detalle |
|---|---|
| Nombre | `id_documentos_habilitacion` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** NULL en decisiones sin documento. |
| Función | Documento de evidencia. |
| Justificación | Enlaza la decisión con la prueba. |
| Contenido | Identificador de `documentos_habilitacion`. |
| Origen | Servicio. |
| Momento inicial | En el INSERT. |
| Modificación | Inmutable. |
| Validaciones | FOREIGN KEY → `documentos_habilitacion.id_documentos_habilitacion` (borrado: NO ACTION); FK. |

### D. Momento en que se crea un registro

**Escenario 1: Toda acción sobre una habilitación**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | ADMINISTRADOR (o el proceso de análisis automático) |
| Pantalla / componente y acción | Acciones de `ProfessionalCredentials`: guardar, verificar, rechazar, pedir corrección, revocar, renovar, adjuntar/retirar documento, registrar consulta externa, bloquear, solicitar rectificación/supresión; análisis automático de documentos. |
| Datos que aporta el usuario | Notas o motivo. |
| Endpoint | Varios (`/api/professional-credentials/…`) |
| Servicio | `ProfessionalCredentialService.decision` (invocado por los servicios de habilitaciones y documentos) |
| Validaciones y condiciones | Las de cada acción. |
| Mecanismo que crea el registro | `decisions.saveAndFlush(d)`. |
| Columnas completadas y de dónde sale cada valor | `id_habilitaciones_profesionales`; `tipo_decision`; `estado_resultante` ← estado de la habilitación tras la acción; `id_usuarios` ← actor (o el cargador si fue automático); `fecha_decision`; `motivo`; `id_documentos_habilitacion`. |
| Columnas que quedan NULL o con valor predeterminado | Motivo y documento según la acción. |
| Otros registros creados en la misma operación | La acción misma y su evento en `eventos_auditoria`. |
| Si la operación falla / atomicidad | Misma transacción que la acción. |

### E. Ejemplo funcional completo

**Situación:** historial de la habilitación 300.

| id | tipo_decision | estado_resultante | id_usuarios | motivo | id_documentos_habilitacion |
|---|---|---|---|---|---|
| 1 | REGISTRO | PENDIENTE | 2 | Alta | NULL |
| 2 | DOCUMENTO | PENDIENTE | 2 | Documento licencia.pdf (v1, EVIDENCIA) en cuarentena | 900 |
| 3 | ANALISIS_DOCUMENTO | PENDIENTE | 2 | Documento licencia.pdf: LIMPIO | 900 |
| 4 | CONSULTA_EXTERNA | PENDIENTE | 2 | ANAC: COINCIDE | 900 |
| 5 | VERIFICADA | VERIFICADA | 3 | Revisión manual de suficiencia | NULL |

### F. Ciclo de vida del registro

Insert-only: el trigger `tr_decisiones_habilitacion_inmutable` rechaza UPDATE y DELETE (error 51060). El historial sólo crece.

### G. Relaciones con otras tablas

**Clave primaria:** `id_decisiones_habilitacion`.

**Claves foráneas salientes (tabla hija → padre):**

| Columna | Referencia | Borrado | Obligatoria |
|---|---|---|---|
| `id_documentos_habilitacion` | `documentos_habilitacion.id_documentos_habilitacion` (`FK__decisione__id_do__000AF8CF`) | NO ACTION | Opcional (NULL) |
| `id_habilitaciones_profesionales` | `habilitaciones_profesionales.id_habilitaciones_profesionales` (`FK__decisione__id_ha__7D2E8C24`) | NO ACTION | Obligatoria |
| `id_usuarios` | `usuarios.id_usuarios` (`FK__decisione__id_us__7E22B05D`) | NO ACTION | Obligatoria |

**Claves foráneas entrantes:** ninguna.

FK a `habilitaciones_profesionales`, `usuarios` y (opcional) `documentos_habilitacion`. Sin cascada.

### H. Restricciones y decisiones de diseño

**Índices (no PK):**

| Índice | Único | Columnas | Filtro | Incluye |
|---|---|---|---|---|
| `ix_decisiones_habilitacion` | no | id_habilitaciones_profesionales, fecha_decision | — | — |

**Restricciones CHECK:** 

- `ck_decision_tipo`: `(tipo_decision='ANALISIS_DOCUMENTO' OR tipo_decision='SOLICITUD_SUPRESION' OR tipo_decision='SOLICITUD_RECTIFICACION' OR tipo_decision='LIBERACION_BLOQUEO' OR tipo_decision='BLOQUEO_CONSERVACION' OR tipo_decision='RETIRO_DOCUMENTO' OR tipo_decision='CONSULTA_EXTERNA' OR tipo_decision='RENOVACION' OR tipo_decision='REVOCADA' OR tipo_decision='CORRECCION_SOLICITADA' OR tipo_decision='RECHAZADA' OR tipo_decision='VERIFICADA' OR tipo_decision='DOCUMENTO' OR tipo_decision='MODIFICACION' OR tipo_decision='REGISTRO')`

**Triggers:** `tr_decisiones_habilitacion_inmutable`

**DEFAULT / IDENTITY / nulabilidad:** ver la ficha de cada columna en la sección C (los DEFAULT figuran en «Validaciones»).

- **`ck_decision_tipo`:** 15 tipos (REGISTRO, MODIFICACION, DOCUMENTO, VERIFICADA, RECHAZADA, CORRECCION_SOLICITADA, REVOCADA, RENOVACION, CONSULTA_EXTERNA, RETIRO_DOCUMENTO, BLOQUEO_CONSERVACION, LIBERACION_BLOQUEO, SOLICITUD_RECTIFICACION, SOLICITUD_SUPRESION, ANALISIS_DOCUMENTO).
- **Trigger de inmutabilidad (V60).**
- **Observación:** el historial de decisiones duplica parcialmente los eventos de auditoría, pero con estructura propia consultable por habilitación.

### I. Evidencia de implementación

- [`V59 (creación)`](../../backend-java/src/main/resources/db/migration/V59__politica_habilitaciones_ciclo_y_documentos.sql#L54)
- [`V60 (inmutabilidad)`](../../backend-java/src/main/resources/db/migration/V60__endurecimiento_politicas_y_documentos_heredados.sql#L36)
- [`Entidad CredentialDecision`](../../backend-java/src/main/java/com/vuelossanitarios/backend/domain/person/CredentialDecision.java#L9)
- [`ProfessionalCredentialService.decision`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/ProfessionalCredentialService.java#L63)
- [`Consulta del historial`](../../backend-java/src/main/java/com/vuelossanitarios/backend/api/ProfessionalCredentialController.java#L38)
- [`Pantalla`](../../frontend-react/src/credentials.jsx#L155)
- [`Prueba: CredentialLifecycleIntegrationTest`](../../backend-java/src/test/java/com/vuelossanitarios/backend/service/CredentialLifecycleIntegrationTest.java#L35)

---

## 44. Tabla `consultas_externas_habilitacion`

### A. Identificación de la tabla

| Atributo | Detalle |
|---|---|
| Nombre exacto y esquema | `dbo.consultas_externas_habilitacion` (esquema `dbo`) |
| Módulo funcional | 6. Habilitaciones y clasificación de tripulación |
| Tipo de tabla | Historial inmutable — constancias de consultas manuales a fuentes oficiales |
| Migración que la creó | V59 |
| Migraciones posteriores que modificaron su estructura | V60 (trigger de inmutabilidad) |
| Estado actual en el esquema | Vigente — 11 columnas, PK `id_consultas_externas_habilitacion`, 3 FK salientes, 0 FK entrantes, 0 índice(s) único(s), 2 CHECK, 1 trigger(s) (verificado contra `sys.*` de la base E2E en Flyway V62) |
| Tablas relacionadas | habilitaciones_profesionales, usuarios, documentos_habilitacion |

### B. Funcionalidad y justificación

Constancia de lo que un administrador **declara haber contrastado** en ANAC (personal aeronáutico) o REFEPS/SISA (sanitario) —u otra fuente—: número consultado, datos contrastados, resultado (COINCIDE, NO_COINCIDE, NO_ENCONTRADO, NO_CONCLUYENTE), fecha y evidencia. **No es una validación emitida por el organismo** ni cambia el estado administrativo; sólo condiciona la suficiencia si una política exige consulta externa.

**Por qué es una tabla independiente.** Es un hecho con autor y fecha que no debe mezclarse con el estado de la habilitación.

**Qué dejaría de funcionar sin ella.** No habría constancia de verificaciones externas manuales.

### C. Descripción campo por campo

#### `id_consultas_externas_habilitacion`

| Atributo | Detalle |
|---|---|
| Nombre | `id_consultas_externas_habilitacion` |
| Tipo de dato | `bigint` — IDENTITY(1,1) |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Clave primaria de la tabla: identifica de forma única cada fila y es el valor que otras tablas, la API y la auditoría usan para referirse a ella. |
| Justificación | Un identificador técnico numérico, estable y sin significado de negocio evita depender de datos que pueden cambiar (nombres, códigos) y hace eficientes los JOIN y las claves foráneas (decisión V24/V27: «toda tabla de aplicación tiene su propio id_<tabla> BIGINT IDENTITY»). |
| Contenido | Número entero positivo correlativo (1, 2, 3…). No lo ingresa el usuario. |
| Origen | SQL Server, columna IDENTITY(1,1): se asigna en el propio INSERT. Hibernate lo declara `@GeneratedValue(strategy = IDENTITY)` y lo lee de vuelta tras insertar. |
| Momento inicial | En el INSERT; no existe fila sin identificador. |
| Modificación | Nunca cambia (inmutable; JPA lo declara `updatable=false`). |
| Validaciones | PRIMARY KEY; PRIMARY KEY (unicidad y NOT NULL); no se reutiliza al borrar filas. |

#### `id_habilitaciones_profesionales`

| Atributo | Detalle |
|---|---|
| Nombre | `id_habilitaciones_profesionales` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Habilitación consultada. |
| Justificación | Liga la constancia con la credencial. |
| Contenido | Identificador de `habilitaciones_profesionales`. |
| Origen | Backend. |
| Momento inicial | En el INSERT. |
| Modificación | Inmutable. |
| Validaciones | FOREIGN KEY → `habilitaciones_profesionales.id_habilitaciones_profesionales` (borrado: NO ACTION); NOT NULL, FK. |

#### `organismo`

| Atributo | Detalle |
|---|---|
| Nombre | `organismo` |
| Tipo de dato | `varchar(20)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Fuente consultada. |
| Justificación | Distingue ANAC, REFEPS/SISA u otra. |
| Contenido | ANAC, REFEPS_SISA u OTRO. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | Inmutable. |
| Validaciones | CHECK `ck_consulta_organismo`; CHECK. |

#### `fecha_consulta`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_consulta` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Cuándo se consultó. |
| Justificación | Vigencia del contraste. |
| Contenido | Fecha y hora. |
| Origen | Formulario o ahora. |
| Momento inicial | En el INSERT. |
| Modificación | Inmutable. |
| Validaciones | No futura (servicio). |

#### `id_usuario_responsable`

| Atributo | Detalle |
|---|---|
| Nombre | `id_usuario_responsable` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Quién consultó. |
| Justificación | Responsabilidad. |
| Contenido | Identificador de `usuarios`. |
| Origen | Usuario autenticado. |
| Momento inicial | En el INSERT. |
| Modificación | Inmutable. |
| Validaciones | FOREIGN KEY → `usuarios.id_usuarios` (borrado: NO ACTION); NOT NULL, FK. |

#### `numero_consultado`

| Atributo | Detalle |
|---|---|
| Nombre | `numero_consultado` |
| Tipo de dato | `nvarchar(100)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Número que se consultó. |
| Justificación | La coincidencia sólo vale para ese número. |
| Contenido | Hasta 100 caracteres. |
| Origen | Copia del número de la habilitación. |
| Momento inicial | En el INSERT. |
| Modificación | Inmutable. |
| Validaciones | NOT NULL. |

#### `datos_contrastados`

| Atributo | Detalle |
|---|---|
| Nombre | `datos_contrastados` |
| Tipo de dato | `nvarchar(1000)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Qué se comparó. |
| Justificación | Alcance de la constancia. |
| Contenido | Hasta 1000 caracteres. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | Inmutable. |
| Validaciones | NOT NULL. |

#### `resultado`

| Atributo | Detalle |
|---|---|
| Nombre | `resultado` |
| Tipo de dato | `varchar(20)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Resultado del contraste. |
| Justificación | Condiciona políticas que exigen consulta. |
| Contenido | COINCIDE, NO_COINCIDE, NO_ENCONTRADO o NO_CONCLUYENTE. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | Inmutable. |
| Validaciones | CHECK `ck_consulta_resultado`; CHECK. |

#### `observaciones`

| Atributo | Detalle |
|---|---|
| Nombre | `observaciones` |
| Tipo de dato | `nvarchar(2000)` |
| Nulabilidad | **Permite NULL.** Opcional. |
| Función | Notas. |
| Justificación | Contexto. |
| Contenido | Hasta 2000 caracteres. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | Inmutable. |
| Validaciones | — |

#### `id_documentos_habilitacion`

| Atributo | Detalle |
|---|---|
| Nombre | `id_documentos_habilitacion` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** Opcional. |
| Función | Documento de evidencia (captura de la consulta). |
| Justificación | Respaldo. |
| Contenido | Identificador de `documentos_habilitacion`. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | Inmutable. |
| Validaciones | FOREIGN KEY → `documentos_habilitacion.id_documentos_habilitacion` (borrado: NO ACTION); FK. |

#### `fecha_registro`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_registro` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Cuándo se registró. |
| Justificación | Distingue consulta y registro. |
| Contenido | Fecha y hora (UTC). |
| Origen | DEFAULT. |
| Momento inicial | En el INSERT. |
| Modificación | Inmutable. |
| Validaciones | DEFAULT sysutcdatetime(); DEFAULT. |

### D. Momento en que se crea un registro

**Escenario 1: El Administrador registra la consulta**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | ADMINISTRADOR (≠ titular) |
| Pantalla / componente y acción | `ProfessionalCredentials`: **Registrar consulta externa** (línea 144). |
| Datos que aporta el usuario | Organismo, resultado, datos contrastados, fecha (opcional), observaciones, documento de evidencia. |
| Endpoint | `POST /api/professional-credentials/{id}/external-checks` |
| Servicio | `ProfessionalCredentialService.recordExternalCheck` |
| Validaciones y condiciones | ANAC sólo a COMANDANTE/COPILOTO; REFEPS_SISA sólo a MEDICO/ENFERMERO; fecha no futura; evidencia perteneciente a la misma habilitación; el titular no puede registrar la suya. |
| Mecanismo que crea el registro | `checks.saveAndFlush(k)`. |
| Columnas completadas y de dónde sale cada valor | `id_habilitaciones_profesionales`; `organismo`; `fecha_consulta` ← formulario o ahora; `id_usuario_responsable`; `numero_consultado` ← número de la habilitación en ese momento; `datos_contrastados`, `resultado`, `observaciones` ← formulario; `id_documentos_habilitacion`; `fecha_registro` ← DEFAULT. |
| Columnas que quedan NULL o con valor predeterminado | Observaciones y evidencia. |
| Otros registros creados en la misma operación | Decisión CONSULTA_EXTERNA y auditoría `EXTERNAL_CHECK`. |
| Si la operación falla / atomicidad | Atómico. |

### E. Ejemplo funcional completo

**Situación:** el administrador consulta el sitio de ANAC y registra:

| id | id_habilitaciones_profesionales | organismo | fecha_consulta | numero_consultado | datos_contrastados | resultado | id_documentos_habilitacion |
|---|---|---|---|---|---|---|---|
| 12 | 300 | ANAC | 2026-11-01 11:20 | ARG1234 | Nombre, categoría y vigencia coinciden | COINCIDE | 901 |

La coincidencia sólo vale para el número vigente de la habilitación. El sistema nunca llama a ANAC.

### F. Ciclo de vida del registro

Insert-only (trigger `tr_consultas_externas_inmutable`, error 51061).

### G. Relaciones con otras tablas

**Clave primaria:** `id_consultas_externas_habilitacion`.

**Claves foráneas salientes (tabla hija → padre):**

| Columna | Referencia | Borrado | Obligatoria |
|---|---|---|---|
| `id_documentos_habilitacion` | `documentos_habilitacion.id_documentos_habilitacion` (`FK__consultas__id_do__05C3D225`) | NO ACTION | Opcional (NULL) |
| `id_habilitaciones_profesionales` | `habilitaciones_profesionales.id_habilitaciones_profesionales` (`FK__consultas__id_ha__03DB89B3`) | NO ACTION | Obligatoria |
| `id_usuario_responsable` | `usuarios.id_usuarios` (`FK__consultas__id_us__04CFADEC`) | NO ACTION | Obligatoria |

**Claves foráneas entrantes:** ninguna.

FK a `habilitaciones_profesionales`, `usuarios` y (opcional) `documentos_habilitacion`.

### H. Restricciones y decisiones de diseño

**Índices (no PK):**

| Índice | Único | Columnas | Filtro | Incluye |
|---|---|---|---|---|
| `ix_consultas_habilitacion` | no | id_habilitaciones_profesionales, fecha_consulta | — | — |

**Restricciones CHECK:** 

- `ck_consulta_organismo`: `(organismo='OTRO' OR organismo='REFEPS_SISA' OR organismo='ANAC')`
- `ck_consulta_resultado`: `(resultado='NO_CONCLUYENTE' OR resultado='NO_ENCONTRADO' OR resultado='NO_COINCIDE' OR resultado='COINCIDE')`

**Triggers:** `tr_consultas_externas_inmutable`

**DEFAULT / IDENTITY / nulabilidad:** ver la ficha de cada columna en la sección C (los DEFAULT figuran en «Validaciones»).

- **CHECK de organismo y de resultado** en conjuntos cerrados.
- **Inmutabilidad** por trigger.
- **Dependencia externa:** no existe API acreditada de los organismos; la consulta seguirá siendo manual.

### I. Evidencia de implementación

- [`V59 (creación)`](../../backend-java/src/main/resources/db/migration/V59__politica_habilitaciones_ciclo_y_documentos.sql#L71)
- [`V60 (inmutabilidad)`](../../backend-java/src/main/resources/db/migration/V60__endurecimiento_politicas_y_documentos_heredados.sql#L42)
- [`Entidad ExternalCredentialCheck`](../../backend-java/src/main/java/com/vuelossanitarios/backend/domain/person/ExternalCredentialCheck.java#L9)
- [`recordExternalCheck`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/ProfessionalCredentialService.java#L207)
- [`Pantalla`](../../frontend-react/src/credentials.jsx#L144)
- [`Prueba: CredentialLifecycleIntegrationTest`](../../backend-java/src/test/java/com/vuelossanitarios/backend/service/CredentialLifecycleIntegrationTest.java#L35)

---

## 45. Tabla `politicas_habilitacion`

### A. Identificación de la tabla

| Atributo | Detalle |
|---|---|
| Nombre exacto y esquema | `dbo.politicas_habilitacion` (esquema `dbo`) |
| Módulo funcional | 6. Habilitaciones y clasificación de tripulación |
| Tipo de tabla | Configuración — reglas de suficiencia de habilitaciones |
| Migración que la creó | V59 |
| Migraciones posteriores que modificaron su estructura | V60 (referencia de aprobación, lote de activación, trigger de protección) |
| Estado actual en el esquema | Vigente — 18 columnas, PK `id_politicas_habilitacion`, 4 FK salientes, 0 FK entrantes, 1 índice(s) único(s), 3 CHECK, 1 trigger(s) (verificado contra `sys.*` de la base E2E en Flyway V62) |
| Tablas relacionadas | roles_tripulacion, tipos_vuelo, usuarios |

### B. Funcionalidad y justificación

Cada fila es **una combinación aceptada** que define cuándo una habilitación es *suficiente* para una función: función, tipo de vuelo (o cualquiera), categoría de aeronave (o cualquiera) y tipo de habilitación, más si exige jurisdicción o consulta externa. **Sin políticas activas para una función no hay suficiencia demostrable**: la elegibilidad responde POLITICA_HABILITACION_NO_CONFIGURADA. V59 no siembra ninguna regla: el contenido es una decisión de negocio.

**Por qué es una tabla independiente.** Separa la regla de la credencial: la misma regla se aplica a todas las personas y se versiona por alta/baja.

**Qué dejaría de funcionar sin ella.** No podría determinarse la suficiencia de ninguna habilitación (nadie sería asignable).

### C. Descripción campo por campo

#### `id_politicas_habilitacion`

| Atributo | Detalle |
|---|---|
| Nombre | `id_politicas_habilitacion` |
| Tipo de dato | `bigint` — IDENTITY(1,1) |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Clave primaria de la tabla: identifica de forma única cada fila y es el valor que otras tablas, la API y la auditoría usan para referirse a ella. |
| Justificación | Un identificador técnico numérico, estable y sin significado de negocio evita depender de datos que pueden cambiar (nombres, códigos) y hace eficientes los JOIN y las claves foráneas (decisión V24/V27: «toda tabla de aplicación tiene su propio id_<tabla> BIGINT IDENTITY»). |
| Contenido | Número entero positivo correlativo (1, 2, 3…). No lo ingresa el usuario. |
| Origen | SQL Server, columna IDENTITY(1,1): se asigna en el propio INSERT. Hibernate lo declara `@GeneratedValue(strategy = IDENTITY)` y lo lee de vuelta tras insertar. |
| Momento inicial | En el INSERT; no existe fila sin identificador. |
| Modificación | Nunca cambia (inmutable; JPA lo declara `updatable=false`). |
| Validaciones | PRIMARY KEY; PRIMARY KEY (unicidad y NOT NULL); no se reutiliza al borrar filas. |

#### `id_roles_tripulacion`

| Atributo | Detalle |
|---|---|
| Nombre | `id_roles_tripulacion` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Función a la que aplica. |
| Justificación | La suficiencia se define por función. |
| Contenido | Identificador de `roles_tripulacion`. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | Inmutable (trigger). |
| Validaciones | FOREIGN KEY → `roles_tripulacion.id_roles_tripulacion` (borrado: NO ACTION); Índice único `ux_politica_habilitacion_activa` sobre (id_roles_tripulacion, id_tipos_vuelo, categoria_aeronave, tipo_habilitacion) filtrado `activa=(1)`; NOT NULL, FK. |

#### `id_tipos_vuelo`

| Atributo | Detalle |
|---|---|
| Nombre | `id_tipos_vuelo` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** NULL = cualquier tipo de vuelo. |
| Función | Tipo de vuelo al que aplica. |
| Justificación | Permite reglas distintas por tipo. |
| Contenido | Identificador de `tipos_vuelo`. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | Inmutable. |
| Validaciones | FOREIGN KEY → `tipos_vuelo.id_tipos_vuelo` (borrado: NO ACTION); Índice único `ux_politica_habilitacion_activa` sobre (id_roles_tripulacion, id_tipos_vuelo, categoria_aeronave, tipo_habilitacion) filtrado `activa=(1)`; FK. |

#### `categoria_aeronave`

| Atributo | Detalle |
|---|---|
| Nombre | `categoria_aeronave` |
| Tipo de dato | `nvarchar(50)` |
| Nulabilidad | **Permite NULL.** NULL = cualquier categoría. |
| Función | Categoría de aeronave. |
| Justificación | Reglas por categoría. |
| Contenido | Hasta 50 caracteres. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | Inmutable. |
| Validaciones | Índice único `ux_politica_habilitacion_activa` sobre (id_roles_tripulacion, id_tipos_vuelo, categoria_aeronave, tipo_habilitacion) filtrado `activa=(1)`; — |

#### `tipo_habilitacion`

| Atributo | Detalle |
|---|---|
| Nombre | `tipo_habilitacion` |
| Tipo de dato | `nvarchar(100)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Tipo de habilitación aceptado. |
| Justificación | Qué credencial es suficiente. |
| Contenido | Hasta 100 caracteres. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | Inmutable. |
| Validaciones | Índice único `ux_politica_habilitacion_activa` sobre (id_roles_tripulacion, id_tipos_vuelo, categoria_aeronave, tipo_habilitacion) filtrado `activa=(1)`; NOT NULL; comparación normalizada. |

#### `requiere_jurisdiccion`

| Atributo | Detalle |
|---|---|
| Nombre | `requiere_jurisdiccion` |
| Tipo de dato | `bit` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Exige jurisdicción en la habilitación. |
| Justificación | Control regulatorio. |
| Contenido | 0/1. |
| Origen | Formulario. |
| Momento inicial | 0. |
| Modificación | Inmutable. |
| Validaciones | DEFAULT 0; DEFAULT 0. |

#### `requiere_consulta_externa`

| Atributo | Detalle |
|---|---|
| Nombre | `requiere_consulta_externa` |
| Tipo de dato | `bit` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Exige una consulta externa COINCIDE. |
| Justificación | Control adicional. |
| Contenido | 0/1. |
| Origen | Formulario. |
| Momento inicial | 0. |
| Modificación | Inmutable. |
| Validaciones | DEFAULT 0; DEFAULT 0. |

#### `origen`

| Atributo | Detalle |
|---|---|
| Nombre | `origen` |
| Tipo de dato | `varchar(30)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | De dónde proviene la regla. |
| Justificación | Distingue configuración interna de una regla con fuente oficial citada. |
| Contenido | CONFIGURACION_INTERNA o FUENTE_OFICIAL_CITADA. |
| Origen | Formulario. |
| Momento inicial | CONFIGURACION_INTERNA. |
| Modificación | Inmutable. |
| Validaciones | CHECK `ck_politica_fuente`; CHECK `ck_politica_origen`; DEFAULT 'CONFIGURACION_INTERNA'; CHECK. |

#### `fuente_referencia`

| Atributo | Detalle |
|---|---|
| Nombre | `fuente_referencia` |
| Tipo de dato | `nvarchar(500)` |
| Nulabilidad | **Permite NULL.** NULL en configuración interna. |
| Función | Cita de la fuente oficial. |
| Justificación | Respaldo normativo. |
| Contenido | Hasta 500 caracteres. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | Inmutable. |
| Validaciones | CHECK `ck_politica_fuente`; CHECK: obligatoria si es oficial. |

#### `observaciones`

| Atributo | Detalle |
|---|---|
| Nombre | `observaciones` |
| Tipo de dato | `nvarchar(1000)` |
| Nulabilidad | **Permite NULL.** Opcional. |
| Función | Notas. |
| Justificación | Contexto. |
| Contenido | Hasta 1000 caracteres. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | Inmutable. |
| Validaciones | — |

#### `activa`

| Atributo | Detalle |
|---|---|
| Nombre | `activa` |
| Tipo de dato | `bit` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Si está vigente. |
| Justificación | Baja lógica; sólo las activas rigen. |
| Contenido | 0/1. |
| Origen | Backend. |
| Momento inicial | 1. |
| Modificación | 0 al dar de baja (no vuelve). |
| Validaciones | CHECK `ck_politica_baja`; DEFAULT 1; CHECK de baja; DEFAULT 1. |

#### `id_usuario_alta`

| Atributo | Detalle |
|---|---|
| Nombre | `id_usuario_alta` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Quién la creó. |
| Justificación | Responsabilidad. |
| Contenido | Identificador de `usuarios`. |
| Origen | Usuario autenticado. |
| Momento inicial | En el INSERT. |
| Modificación | Inmutable. |
| Validaciones | FOREIGN KEY → `usuarios.id_usuarios` (borrado: NO ACTION); NOT NULL, FK. |

#### `fecha_alta`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_alta` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Cuándo se creó. |
| Justificación | Historial. |
| Contenido | Fecha y hora (UTC). |
| Origen | Backend / DEFAULT. |
| Momento inicial | En el INSERT. |
| Modificación | Inmutable. |
| Validaciones | DEFAULT sysutcdatetime(); DEFAULT. |

#### `id_usuario_baja`

| Atributo | Detalle |
|---|---|
| Nombre | `id_usuario_baja` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** NULL mientras esté activa. |
| Función | Quién la dio de baja. |
| Justificación | Responsabilidad. |
| Contenido | Identificador de `usuarios`. |
| Origen | Usuario autenticado. |
| Momento inicial | NULL. |
| Modificación | Al dar de baja. |
| Validaciones | FOREIGN KEY → `usuarios.id_usuarios` (borrado: NO ACTION); CHECK `ck_politica_baja`; CHECK. |

#### `fecha_baja`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_baja` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **Permite NULL.** NULL mientras esté activa. |
| Función | Cuándo se dio de baja. |
| Justificación | Historial. |
| Contenido | Fecha y hora. |
| Origen | Backend. |
| Momento inicial | NULL. |
| Modificación | Al dar de baja. |
| Validaciones | CHECK `ck_politica_baja`; CHECK. |

#### `motivo_baja`

| Atributo | Detalle |
|---|---|
| Nombre | `motivo_baja` |
| Tipo de dato | `nvarchar(500)` |
| Nulabilidad | **Permite NULL.** NULL mientras esté activa. |
| Función | Motivo de la baja. |
| Justificación | Constancia (incluye «Reemplazada por el lote…»). |
| Contenido | Hasta 500 caracteres. |
| Origen | Formulario / backend. |
| Momento inicial | NULL. |
| Modificación | Al dar de baja. |
| Validaciones | CHECK `ck_politica_baja`; CHECK. |

#### `referencia_aprobacion`

| Atributo | Detalle |
|---|---|
| Nombre | `referencia_aprobacion` |
| Tipo de dato | `nvarchar(500)` |
| Nulabilidad | **Permite NULL.** NULL en altas individuales. |
| Función | Referencia de la aprobación del lote (acta, expediente). |
| Justificación | Trazabilidad de quién aprobó la activación. |
| Contenido | Hasta 500 caracteres. |
| Origen | Formulario del lote. |
| Momento inicial | NULL. |
| Modificación | En el INSERT del lote. |
| Validaciones | Inmutable. |

#### `lote_activacion`

| Atributo | Detalle |
|---|---|
| Nombre | `lote_activacion` |
| Tipo de dato | `varchar(36)` |
| Nulabilidad | **Permite NULL.** NULL en altas individuales. |
| Función | Identificador (UUID) del lote que la activó. |
| Justificación | Agrupa las políticas activadas juntas. |
| Contenido | 36 caracteres. |
| Origen | Backend. |
| Momento inicial | NULL. |
| Modificación | En el INSERT del lote. |
| Validaciones | Inmutable; índice filtrado. |

### D. Momento en que se crea un registro

**Escenario 1: Alta individual**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | ADMINISTRADOR |
| Pantalla / componente y acción | `CredentialPolicies` ([`credentials.jsx`](../../frontend-react/src/credentials.jsx), línea 164): alta de política. |
| Datos que aporta el usuario | Función, tipo de vuelo (opcional), categoría (opcional), tipo de habilitación, exige jurisdicción, exige consulta externa, origen (CONFIGURACION_INTERNA o FUENTE_OFICIAL_CITADA con fuente), observaciones. |
| Endpoint | `POST /api/credential-policies` |
| Servicio | `CredentialPolicyService.create` |
| Validaciones y condiciones | Función válida; la fuente es obligatoria si el origen la declara oficial; sin combinación activa duplicada (409 `POLITICA_DUPLICADA`, también por índice único); bloqueo por función. |
| Mecanismo que crea el registro | `policies.saveAndFlush(p)`. |
| Columnas completadas y de dónde sale cada valor | Campos del formulario; `activa`=1; `id_usuario_alta`; `fecha_alta`. |
| Columnas que quedan NULL o con valor predeterminado | Baja, aprobación y lote. |
| Otros registros creados en la misma operación | Auditoría `CREDENTIAL_POLICY/CREATE`. |
| Si la operación falla / atomicidad | Atómico. |

**Escenario 2: Activación por lote aprobado**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | ADMINISTRADOR |
| Pantalla / componente y acción | `PolicyActivation` (línea 211): **Validar y simular** y luego **Activar política aprobada**. |
| Datos que aporta el usuario | Propuesta de políticas, referencia de aprobación, reconocimiento de incompatibilidades. |
| Endpoint | `POST /api/credential-policies/simulation` y `…/activation` |
| Servicio | `CredentialPolicyActivationService` |
| Validaciones y condiciones | La propuesta debe validar sin errores; si hay integrantes de vuelos abiertos que dejarían de ser elegibles, exige reconocimiento; referencia de aprobación obligatoria; huella de la simulación. |
| Mecanismo que crea el registro | `policies.saveAndFlush(p)` por política nueva y UPDATE de baja para las reemplazadas. |
| Columnas completadas y de dónde sale cada valor | Idem más `referencia_aprobacion` y `lote_activacion` (UUID del lote). |
| Columnas que quedan NULL o con valor predeterminado | Baja. |
| Otros registros creados en la misma operación | Eventos `CREDENTIAL_POLICY` y `CREDENTIAL_POLICY_BATCH/ACTIVATE`. |
| Si la operación falla / atomicidad | Todo el lote en una transacción. |

### E. Ejemplo funcional completo

**Situación:** el Administrador define que el COMANDANTE en vuelos SANITARIOS necesita una «Licencia de piloto» con jurisdicción.

| id | id_roles_tripulacion | id_tipos_vuelo | categoria_aeronave | tipo_habilitacion | requiere_jurisdiccion | requiere_consulta_externa | origen | fuente_referencia | activa |
|---|---|---|---|---|---|---|---|---|---|
| 21 | COMANDANTE | SANITARIO | NULL | Licencia de piloto | 1 | 0 | FUENTE_OFICIAL_CITADA | Resolución X/2026 | 1 |

Si luego cambia la regla, **no se edita**: se da de baja la 21 (`activa`=0 + `fecha_baja` + `id_usuario_baja` + `motivo_baja`) y se crea otra. Con un lote aprobado se reemplazan varias a la vez, con el mismo `lote_activacion`.

### F. Ciclo de vida del registro

| Transición | Acción | Actor | Campos |
|---|---|---|---|
| Alta | «Crear política» / lote | Admin | INSERT (activa) |
| Baja | «Dar de baja» (motivo) / reemplazo por lote | Admin | `activa`=0, `id_usuario_baja`, `fecha_baja`, `motivo_baja` |
| Reactivación | **prohibida** (trigger): se crea una nueva | — | — |
| Edición | **prohibida**: la definición no cambia | — | — |
| Borrado | prohibido por trigger | — | — |

### G. Relaciones con otras tablas

**Clave primaria:** `id_politicas_habilitacion`.

**Claves foráneas salientes (tabla hija → padre):**

| Columna | Referencia | Borrado | Obligatoria |
|---|---|---|---|
| `id_roles_tripulacion` | `roles_tripulacion.id_roles_tripulacion` (`FK__politicas__id_ro__6FD49106`) | NO ACTION | Obligatoria |
| `id_tipos_vuelo` | `tipos_vuelo.id_tipos_vuelo` (`FK__politicas__id_ti__70C8B53F`) | NO ACTION | Opcional (NULL) |
| `id_usuario_alta` | `usuarios.id_usuarios` (`FK__politicas__id_us__758D6A5C`) | NO ACTION | Obligatoria |
| `id_usuario_baja` | `usuarios.id_usuarios` (`FK__politicas__id_us__7775B2CE`) | NO ACTION | Opcional (NULL) |

**Claves foráneas entrantes:** ninguna.

FK a `roles_tripulacion` (obligatoria), `tipos_vuelo` (opcional, NULL = cualquiera), `usuarios` (alta y baja). La consulta `CredentialSufficiency` es la única regla de suficiencia (listar candidatos, asignar, replanificar, aceptar, iniciar).

### H. Restricciones y decisiones de diseño

**Índices (no PK):**

| Índice | Único | Columnas | Filtro | Incluye |
|---|---|---|---|---|
| `ix_politicas_lote_activacion` | no | lote_activacion | `lote_activacion IS NOT NULL` | — |
| `ux_politica_habilitacion_activa` | sí | id_roles_tripulacion, id_tipos_vuelo, categoria_aeronave, tipo_habilitacion | `activa=(1)` | — |

**Restricciones CHECK:** 

- `ck_politica_baja`: `(activa=(1) AND fecha_baja IS NULL OR activa=(0) AND fecha_baja IS NOT NULL AND id_usuario_baja IS NOT NULL AND motivo_baja IS NOT NULL)`
- `ck_politica_fuente`: `(origen<>'FUENTE_OFICIAL_CITADA' OR fuente_referencia IS NOT NULL)`
- `ck_politica_origen`: `(origen='FUENTE_OFICIAL_CITADA' OR origen='CONFIGURACION_INTERNA')`

**Triggers:** `tr_politicas_habilitacion_proteccion`

**DEFAULT / IDENTITY / nulabilidad:** ver la ficha de cada columna en la sección C (los DEFAULT figuran en «Validaciones»).

- **`ux_politica_habilitacion_activa`:** una sola política activa por (función, tipo de vuelo, categoría, tipo de habilitación).
- **CHECK:** origen cerrado; fuente obligatoria si es oficial; baja completa.
- **Trigger `tr_politicas_habilitacion_proteccion` (V60):** no se eliminan ni se modifican las definiciones; una baja no se revierte.
- **Observación:** los NULL de tipo de vuelo y categoría cuentan como «cualquiera», pero en un índice único los NULL se comparan como iguales, de modo que dos políticas «cualquiera» idénticas sí chocan (comportamiento deseado).

### I. Evidencia de implementación

- [`V59 (creación)`](../../backend-java/src/main/resources/db/migration/V59__politica_habilitaciones_ciclo_y_documentos.sql#L28)
- [`V60 (protección)`](../../backend-java/src/main/resources/db/migration/V60__endurecimiento_politicas_y_documentos_heredados.sql#L50)
- [`Entidad CredentialPolicy`](../../backend-java/src/main/java/com/vuelossanitarios/backend/domain/person/CredentialPolicy.java#L11)
- [`CredentialPolicyService.create`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/CredentialPolicyService.java#L38)
- [`Activación por lote`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/CredentialPolicyActivationService.java#L244)
- [`Regla de suficiencia`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/CredentialSufficiency.java#L14)
- [`Pantalla`](../../frontend-react/src/credentials.jsx#L164)
- [`Prueba: PolicyActivationAndLegacyIntegrationTest`](../../backend-java/src/test/java/com/vuelossanitarios/backend/service/PolicyActivationAndLegacyIntegrationTest.java#L38)
- [`Prueba: PolicyChangeReviewIntegrationTest`](../../backend-java/src/test/java/com/vuelossanitarios/backend/service/PolicyChangeReviewIntegrationTest.java#L29)
