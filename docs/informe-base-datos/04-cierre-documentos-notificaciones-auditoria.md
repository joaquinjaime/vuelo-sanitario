# Capítulo 4 — Cierre, documentos, notificaciones y auditoría

[← Informe principal](../INFORME_COMPLETO_BASE_DATOS.md) · [Índice de capítulos](../INFORME_COMPLETO_BASE_DATOS.md#3-índice-y-navegación)

Tablas de este capítulo: [`informes_finales_vuelo`](#22-tabla-informes_finales_vuelo), [`obligaciones_informe_final`](#23-tabla-obligaciones_informe_final), [`documentos_vuelo`](#24-tabla-documentos_vuelo), [`versiones_documento_vuelo`](#25-tabla-versiones_documento_vuelo), [`bloqueos_documento_vuelo`](#26-tabla-bloqueos_documento_vuelo), [`notificaciones`](#27-tabla-notificaciones), [`eventos_auditoria`](#28-tabla-eventos_auditoria).

Cada tabla sigue la estructura A–I del encargo: **A** identificación · **B** funcionalidad · **C** campo por campo · **D** creación de registros · **E** ejemplo funcional · **F** ciclo de vida · **G** relaciones · **H** restricciones y diseño · **I** evidencia. Convenciones y fuentes en [00-metodologia-y-convenciones.md](00-metodologia-y-convenciones.md).

---

## 22. Tabla `informes_finales_vuelo`

### A. Identificación de la tabla

| Atributo | Detalle |
|---|---|
| Nombre exacto y esquema | `dbo.informes_finales_vuelo` (esquema `dbo`) |
| Módulo funcional | 4. Cierre del vuelo, documentos, notificaciones y auditoría |
| Tipo de tabla | Versionada con revisión — informe final del comandante |
| Migración que la creó | V2 (como `flight_final_reports`) |
| Migraciones posteriores que modificaron su estructura | V4 (unicidad), V8/V24/V27, V42 (estado de revisión por versión, revisor, índice de versión vigente), V43 (procedencia de la decisión, adjunto PDF, contenido obligatorio) |
| Estado actual en el esquema | Vigente — 19 columnas, PK `id_informes_finales_vuelo`, 3 FK salientes, 1 FK entrantes, 3 índice(s) único(s), 4 CHECK, 0 trigger(s) (verificado contra `sys.*` de la base E2E en Flyway V62) |
| Tablas relacionadas | vuelos, obligaciones_informe_final, usuarios |

### B. Funcionalidad y justificación

Cada fila es **una presentación del informe final** de un vuelo: horas de vuelo, combustible consumido, incidentes y resumen, con un PDF opcional. Si Operaciones lo devuelve, el comandante presenta una **versión nueva** (la anterior se conserva marcada como no vigente). Sólo cuando la versión vigente es aprobada el vuelo pasa a COMPLETADO.

**Por qué es una tabla independiente.** El informe se versiona y tiene su propio ciclo de revisión (PRESENTADO/DEVUELTO/APROBADO); la obligación (plazo, prórroga) es otra cosa y vive en `obligaciones_informe_final`, que apunta a la versión vigente.

**Qué dejaría de funcionar sin ella.** No habría informe final ni cierre administrativo del vuelo (COMPLETADO).

### C. Descripción campo por campo

#### `version`

| Atributo | Detalle |
|---|---|
| Nombre | `version` |
| Tipo de dato | `int` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Número de la presentación. |
| Justificación | Historial de lo presentado. |
| Contenido | Entero ≥ 1. |
| Origen | Backend (cantidad de informes del vuelo + 1). |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | Índice único `uq_informes_finales_vuelo_4` sobre (id_vuelos, version); CHECK `ck_informes_finales_vuelo_1474104292`; DEFAULT 1; CHECK > 0; única con el vuelo. |

#### `es_version_actual`

| Atributo | Detalle |
|---|---|
| Nombre | `es_version_actual` |
| Tipo de dato | `bit` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Marca la versión vigente. |
| Justificación | Sólo la vigente se revisa y habilita el cierre. |
| Contenido | 0/1. |
| Origen | Backend. |
| Momento inicial | 1. |
| Modificación | Pasa a 0 al presentar otra versión. |
| Validaciones | DEFAULT 1; Índice único filtrado. |

#### `horas_vuelo`

| Atributo | Detalle |
|---|---|
| Nombre | `horas_vuelo` |
| Tipo de dato | `decimal(5,2)` |
| Nulabilidad | **Permite NULL.** Opcional: el comandante puede presentar sólo texto o PDF. |
| Función | Horas efectivamente voladas. |
| Justificación | Dato operativo del cierre. |
| Contenido | Decimal (5,2). |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | Nueva versión. |
| Validaciones | — |

#### `combustible_consumido_litros`

| Atributo | Detalle |
|---|---|
| Nombre | `combustible_consumido_litros` |
| Tipo de dato | `decimal(10,2)` |
| Nulabilidad | **Permite NULL.** Opcional. |
| Función | Combustible consumido. |
| Justificación | Dato operativo. |
| Contenido | Decimal (10,2). |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | Nueva versión. |
| Validaciones | — |

#### `incidentes`

| Atributo | Detalle |
|---|---|
| Nombre | `incidentes` |
| Tipo de dato | `nvarchar(max)` |
| Nulabilidad | **Permite NULL.** Opcional; NULL si no hubo. |
| Función | Incidentes ocurridos. |
| Justificación | Registro de seguridad operacional. |
| Contenido | Texto. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | Nueva versión. |
| Validaciones | — |

#### `resumen`

| Atributo | Detalle |
|---|---|
| Nombre | `resumen` |
| Tipo de dato | `nvarchar(max)` |
| Nulabilidad | **Permite NULL.** NULL si el informe es sólo PDF. |
| Función | Texto del informe. |
| Justificación | Cuerpo del informe. |
| Contenido | Texto. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | Nueva versión. |
| Validaciones | CHECK `ck_informes_finales_vuelo_contenido`; Con el PDF, al menos uno de los dos (CHECK). |

#### `fecha_creacion`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_creacion` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Registra el instante en que la versión del informe se incorporó al sistema. |
| Justificación | Permite ordenar cronológicamente, reconstruir el historial y aportar trazabilidad sin depender de la auditoría. |
| Contenido | Fecha y hora (DATETIME2) de la inserción. |
| Origen | Automático: DEFAULT `SYSDATETIME()` de SQL Server o `@CreationTimestamp` de Hibernate (según la entidad); el usuario nunca ingresa esta fecha. |
| Momento inicial | En el INSERT. |
| Modificación | Inmutable: ningún flujo la actualiza (`updatable=false` en la entidad). |
| Validaciones | DEFAULT sysdatetime() |

#### `id_informes_finales_vuelo`

| Atributo | Detalle |
|---|---|
| Nombre | `id_informes_finales_vuelo` |
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
| Función | Vuelo informado. |
| Justificación | Un informe vigente por vuelo. |
| Contenido | Identificador de `vuelos`. |
| Origen | Backend. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `vuelos.id_vuelos` (borrado: **CASCADE**); Índice único `uq_informes_finales_vuelo_4` sobre (id_vuelos, version); Índice único `ux_informes_finales_vuelo_actual` filtrado `es_version_actual=(1)`; NOT NULL, FK CASCADE. |

#### `id_usuario_creador`

| Atributo | Detalle |
|---|---|
| Nombre | `id_usuario_creador` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Comandante autor. |
| Justificación | Responsabilidad. |
| Contenido | Identificador de `usuarios`. |
| Origen | Usuario autenticado. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `usuarios.id_usuarios` (borrado: NO ACTION); NOT NULL, FK. |

#### `estado_revision`

| Atributo | Detalle |
|---|---|
| Nombre | `estado_revision` |
| Tipo de dato | `nvarchar(40)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Estado de revisión de esta versión. |
| Justificación | Distingue lo pendiente, aprobado o devuelto. |
| Contenido | PRESENTADO, APROBADO, DEVUELTO, REEMPLAZADO o HISTORICO_SIN_DECISION. |
| Origen | Backend. |
| Momento inicial | PRESENTADO. |
| Modificación | Operaciones al aprobar o devolver. |
| Validaciones | CHECK `ck_informes_finales_vuelo_revision`; DEFAULT N'PRESENTADO'; CHECK de coherencia con origen. |

#### `motivo_devolucion`

| Atributo | Detalle |
|---|---|
| Nombre | `motivo_devolucion` |
| Tipo de dato | `nvarchar(max)` |
| Nulabilidad | **Permite NULL.** NULL salvo DEVUELTO. |
| Función | Qué debe corregirse. |
| Justificación | Informa al comandante. |
| Contenido | Texto. |
| Origen | Operaciones. |
| Momento inicial | NULL. |
| Modificación | Al devolver. |
| Validaciones | CHECK `ck_informes_finales_vuelo_revision`; CHECK: obligatorio en DEVUELTO. |

#### `fecha_revision`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_revision` |
| Tipo de dato | `datetimeoffset(3)` |
| Nulabilidad | **Permite NULL.** NULL mientras está PRESENTADO. |
| Función | Cuándo se decidió. |
| Justificación | Trazabilidad. |
| Contenido | Fecha y hora con desplazamiento. |
| Origen | Backend. |
| Momento inicial | NULL. |
| Modificación | Al decidir. |
| Validaciones | CHECK `ck_informes_finales_vuelo_revision`; CHECK. |

#### `id_usuario_revisor`

| Atributo | Detalle |
|---|---|
| Nombre | `id_usuario_revisor` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** NULL mientras está PRESENTADO. |
| Función | Quién decidió. |
| Justificación | Responsabilidad. |
| Contenido | Identificador de `usuarios`. |
| Origen | Operaciones. |
| Momento inicial | NULL. |
| Modificación | Al decidir. |
| Validaciones | FOREIGN KEY → `usuarios.id_usuarios` (borrado: NO ACTION); CHECK `ck_informes_finales_vuelo_revision`; CHECK. |

#### `origen_decision`

| Atributo | Detalle |
|---|---|
| Nombre | `origen_decision` |
| Tipo de dato | `nvarchar(40)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Procedencia de la decisión (flujo actual o histórica). |
| Justificación | Evita presentar datos migrados como si tuvieran evidencia. |
| Contenido | FLUJO_ACTUAL, HISTORICA_OBLIGACION, HISTORICA_OBLIGACION_AUDITADA o HISTORICA_SIN_EVIDENCIA. |
| Origen | Backend/migración. |
| Momento inicial | FLUJO_ACTUAL. |
| Modificación | No cambia. |
| Validaciones | CHECK `ck_informes_finales_vuelo_contenido`; CHECK `ck_informes_finales_vuelo_revision`; DEFAULT N'FLUJO_ACTUAL'; CHECK. |

#### `adjunto_nombre_original`

| Atributo | Detalle |
|---|---|
| Nombre | `adjunto_nombre_original` |
| Tipo de dato | `nvarchar(255)` |
| Nulabilidad | **Permite NULL.** NULL si el informe no tiene PDF. |
| Función | Nombre original del PDF. |
| Justificación | Mostrar el nombre. |
| Contenido | Texto de hasta 255 caracteres. |
| Origen | Archivo subido. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | CHECK `ck_informes_finales_vuelo_adjunto`; Todo o nada con los demás adjuntos. |

#### `adjunto_ubicacion`

| Atributo | Detalle |
|---|---|
| Nombre | `adjunto_ubicacion` |
| Tipo de dato | `nvarchar(255)` |
| Nulabilidad | **Permite NULL.** NULL si no hay PDF. |
| Función | Clave del archivo en el almacenamiento. |
| Justificación | No se guarda el PDF en la base. |
| Contenido | Clave relativa generada (no una ruta). |
| Origen | `ReportAttachmentService`. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | Índice único `ux_informes_finales_vuelo_adjunto_ubicacion` filtrado `adjunto_ubicacion IS NOT NULL`; CHECK `ck_informes_finales_vuelo_adjunto`; CHECK `ck_informes_finales_vuelo_contenido`; Índice único filtrado. |

#### `adjunto_tamanio_bytes`

| Atributo | Detalle |
|---|---|
| Nombre | `adjunto_tamanio_bytes` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** NULL si no hay PDF. |
| Función | Tamaño del PDF. |
| Justificación | Verificar integridad básica. |
| Contenido | Entero > 0. |
| Origen | Backend. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | CHECK `ck_informes_finales_vuelo_adjunto`; CHECK. |

#### `adjunto_sha256`

| Atributo | Detalle |
|---|---|
| Nombre | `adjunto_sha256` |
| Tipo de dato | `char(64)` |
| Nulabilidad | **Permite NULL.** NULL si no hay PDF. |
| Función | Huella SHA-256. |
| Justificación | Prueba de integridad del archivo. |
| Contenido | 64 caracteres hexadecimales. |
| Origen | Backend. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | CHECK `ck_informes_finales_vuelo_adjunto`; CHECK de longitud 64. |

### D. Momento en que se crea un registro

**Escenario 1: El comandante presenta el informe (o lo vuelve a presentar)**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | COMANDANTE (el de la obligación) |
| Pantalla / componente y acción | `CommanderReports` ([`closure.jsx`](../../frontend-react/src/closure.jsx), línea 76): **Presentar informe** (texto, PDF o ambos). |
| Datos que aporta el usuario | Horas de vuelo, combustible, incidentes, texto del resumen y/o PDF adjunto. |
| Endpoint | `POST /api/final-reports/{id}/submit` (JSON o multipart; {id} = obligación) — [`FinalReportController.java`](../../backend-java/src/main/java/com/vuelossanitarios/backend/api/FinalReportController.java) |
| Servicio | `FinalReportWorkflowService.submit` |
| Validaciones y condiciones | Comandante dueño de la obligación vigente; vuelo FINALIZADO; la obligación no está APROBADA ni ya PRESENTADA; debe haber texto o PDF; el PDF se valida (estructura, tamaño) y se guarda antes de tocar la base. |
| Mecanismo que crea el registro | `reports.saveAndFlush(x)` (anterior a no vigente) y `reports.saveAndFlush(r)` (INSERT). |
| Columnas completadas y de dónde sale cada valor | `version` = cantidad previa + 1; `es_version_actual`=1; `estado_revision`='PRESENTADO'; `origen_decision`='FLUJO_ACTUAL'; `horas_vuelo`, `combustible_consumido_litros`, `incidentes`, `resumen` ← formulario; `adjunto_*` ← archivo guardado (nombre, ubicación, tamaño, SHA-256); `id_usuario_creador` ← comandante. |
| Columnas que quedan NULL o con valor predeterminado | Motivo de devolución, fecha y revisor; adjunto si no hay PDF. |
| Otros registros creados en la misma operación | UPDATE de la obligación (PRESENTADO, `fecha_presentacion`, `id_informes_finales_vuelo`); auditoría `SUBMIT\|RESUBMIT`; notificación a Operaciones; si estaba bloqueado y cumple todo, desbloqueo. |
| Si la operación falla / atomicidad | Atómico; si falla se descarta el PDF recién guardado. |

**Escenario 2: Migración**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | Flyway V42/V43 |
| Pantalla / componente y acción | — |
| Datos que aporta el usuario | — |
| Endpoint | — |
| Servicio | V42/V43 reclasificaron informes históricos (HISTORICO_SIN_DECISION, REEMPLAZADO) sin inventar decisiones |
| Validaciones y condiciones | — |
| Mecanismo que crea el registro | UPDATE SQL. |
| Columnas completadas y de dónde sale cada valor | — |
| Columnas que quedan NULL o con valor predeterminado | — |
| Otros registros creados en la misma operación | — |
| Si la operación falla / atomicidad | — |

### E. Ejemplo funcional completo

**Situación:** el vuelo 900 finalizó a las 12:00; el comandante presenta el informe a las 18:00.

| version | es_version_actual | estado_revision | horas_vuelo | combustible_consumido_litros | resumen | adjunto_nombre_original | fecha_revision | id_usuario_revisor |
|---|---|---|---|---|---|---|---|---|
| 1 | 0 | DEVUELTO | 1.50 | 420.00 | Vuelo sin novedades | informe.pdf | 2026-11-04 09:00 | 20 |
| 2 | 1 | APROBADO | 1.50 | 420.00 | Se corrige hora de aterrizaje | NULL | 2026-11-04 15:00 | 20 |

La v1 fue **devuelta** con `motivo_devolucion`; se presentó la v2, que Operaciones **aprobó**: la obligación quedó APROBADO y el vuelo COMPLETADO.

### F. Ciclo de vida del registro

| Transición | Acción | Actor | Campos | Validaciones |
|---|---|---|---|---|
| Presentación | «Presentar informe» | Comandante | INSERT (PRESENTADO) | ver D |
| PRESENTADO → APROBADO | «Aprobar y completar vuelo» | Operaciones | `estado_revision`, `fecha_revision`, `id_usuario_revisor` | sólo la versión vigente presentada y vuelo FINALIZADO |
| PRESENTADO → DEVUELTO | «Devolver para corrección» | Operaciones | `estado_revision`, `motivo_devolucion`, `fecha_revision`, `id_usuario_revisor` | motivo obligatorio |
| (vigente) → no vigente | Nueva presentación | Comandante | `es_version_actual`=0 | conserva su estado (p. ej. DEVUELTO) |
| REEMPLAZADO / HISTORICO_SIN_DECISION | Migración V42/V43 | — | — | sólo en datos históricos |

### G. Relaciones con otras tablas

**Clave primaria:** `id_informes_finales_vuelo`.

**Claves foráneas salientes (tabla hija → padre):**

| Columna | Referencia | Borrado | Obligatoria |
|---|---|---|---|
| `id_usuario_creador` | `usuarios.id_usuarios` (`fk_informes_finales_vuelo_id_usuario_creador`) | NO ACTION | Obligatoria |
| `id_vuelos` | `vuelos.id_vuelos` (`fk_informes_finales_vuelo_id_vuelos`) | **CASCADE** | Obligatoria |
| `id_usuario_revisor` | `usuarios.id_usuarios` (`fk_informes_finales_vuelo_revisor`) | NO ACTION | Opcional (NULL) |

**Claves foráneas entrantes (tablas hijas):** `obligaciones_informe_final`(id_informes_finales_vuelo).

FK `id_vuelos` → `vuelos` (CASCADE), `id_usuario_creador` y `id_usuario_revisor` → `usuarios`. Es referenciada por `obligaciones_informe_final.id_informes_finales_vuelo` (la versión que cumple o cumplió la obligación).

### H. Restricciones y decisiones de diseño

**Índices (no PK):**

| Índice | Único | Columnas | Filtro | Incluye |
|---|---|---|---|---|
| `idx_informes_finales_vuelo_creado_por_usuario_id` | no | id_usuario_creador | — | — |
| `idx_informes_finales_vuelo_id_usuario_creador` | no | id_usuario_creador | — | — |
| `idx_informes_finales_vuelo_id_vuelos` | no | id_vuelos | — | — |
| `idx_informes_finales_vuelo_vuelo_id` | no | id_vuelos | — | — |
| `ix_informes_finales_vuelo_revisor` | no | id_usuario_revisor | `id_usuario_revisor IS NOT NULL` | — |
| `uq_informes_finales_vuelo_4` | sí | id_vuelos, version | — | — |
| `ux_informes_finales_vuelo_actual` | sí | id_vuelos | `es_version_actual=(1)` | — |
| `ux_informes_finales_vuelo_adjunto_ubicacion` | sí | adjunto_ubicacion | `adjunto_ubicacion IS NOT NULL` | — |

**Restricciones CHECK:** 

- `ck_informes_finales_vuelo_1474104292`: `(version>(0))`
- `ck_informes_finales_vuelo_adjunto`: `(adjunto_nombre_original IS NULL AND adjunto_ubicacion IS NULL AND adjunto_tamanio_bytes IS NULL AND adjunto_sha256 IS NULL OR adjunto_nombre_original IS NOT NULL AND adjunto_ubicacion IS NOT NULL AND adjunto_tamanio_bytes>(0) AND adjunto_sha256 IS NOT NULL AND len(adjunto_sha256)=(64))`
- `ck_informes_finales_vuelo_contenido`: `(origen_decision<>N'FLUJO_ACTUAL' OR adjunto_ubicacion IS NOT NULL OR len(ltrim(rtrim(isnull(resumen,N''))))>(0))`
- `ck_informes_finales_vuelo_revision`: `((estado_revision=N'HISTORICO_SIN_DECISION' OR estado_revision=N'REEMPLAZADO' OR estado_revision=N'APROBADO' OR estado_revision=N'DEVUELTO' OR estado_revision=N'PRESENTADO') AND (origen_decision=N'HISTORICA_SIN_EVIDENCIA' OR origen_decision=N'HISTORICA_OBLIGACION_AUDITADA' OR origen_decision=N'HISTORICA_OBLIGACION' OR origen_decision=N'FLUJO_ACTUAL') AND (estado_revision=N'DEVUELTO' AND motivo_devolucion IS NOT NULL AND len(ltrim(rtrim(motivo_devolucion)))>(0) AND fecha_revision IS NOT NULL AND id_usuario_revisor IS NOT NULL AND origen_decision<>N'HISTORICA_SIN_EVIDENCIA' OR estado_revision=N'APROBADO' AND fecha_revision IS NOT NULL AND id_usuario_revisor IS NOT NULL AND origen_decision<>N'H…`

**Triggers:** ninguno.

**DEFAULT / IDENTITY / nulabilidad:** ver la ficha de cada columna en la sección C (los DEFAULT figuran en «Validaciones»).

- **`ux_informes_finales_vuelo_actual`:** una sola versión vigente por vuelo.
- **`ck_informes_finales_vuelo_revision` (V43):** combinaciones válidas de estado y origen de la decisión; una decisión sin evidencia sólo existe en datos históricos; APROBADO/DEVUELTO exigen revisor y fecha; DEVUELTO exige motivo.
- **`ck_informes_finales_vuelo_adjunto`:** el adjunto es todo o nada (nombre, ubicación, tamaño > 0 y SHA-256 de 64 caracteres).
- **`ck_informes_finales_vuelo_contenido`:** todo informe del flujo actual tiene texto o PDF.
- **`ux_informes_finales_vuelo_adjunto_ubicacion`:** dos informes no comparten el mismo archivo.

### I. Evidencia de implementación

- [`V2 (creación)`](../../backend-java/src/main/resources/db/migration/V2__planning_phase_tables.sql#L117)
- [`V42 (revisión)`](../../backend-java/src/main/resources/db/migration/V42__cierre_vuelos_informes_revision.sql#L11)
- [`V43 (adjunto y procedencia)`](../../backend-java/src/main/resources/db/migration/V43__informes_historicos_adjuntos_y_responsable_cierre.sql#L23)
- [`Entidad FlightFinalReport`](../../backend-java/src/main/java/com/vuelossanitarios/backend/domain/flight/FlightFinalReport.java#L24)
- [`FinalReportWorkflowService.submit`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/FinalReportWorkflowService.java#L42)
- [`FinalReportWorkflowService.review`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/FinalReportWorkflowService.java#L83)
- [`Controlador`](../../backend-java/src/main/java/com/vuelossanitarios/backend/api/FinalReportController.java#L23)
- [`Pantalla del comandante`](../../frontend-react/src/closure.jsx#L76)
- [`Prueba: FinalReportWorkflowServiceTest`](../../backend-java/src/test/java/com/vuelossanitarios/backend/service/FinalReportWorkflowServiceTest.java#L23)

---

## 23. Tabla `obligaciones_informe_final`

### A. Identificación de la tabla

| Atributo | Detalle |
|---|---|
| Nombre exacto y esquema | `dbo.obligaciones_informe_final` (esquema `dbo`) |
| Módulo funcional | 4. Cierre del vuelo, documentos, notificaciones y auditoría |
| Tipo de tabla | Principal — obligación de presentar el informe (plazos, prórroga, revisión) |
| Migración que la creó | V7 (como `final_report_obligations`) |
| Migraciones posteriores que modificaron su estructura | V8 (renombre), V9 (`fecha_creacion`), V10 (índice por comandante), V24/V27/V28, V42 (índice de abiertas), V43 (`id_usuario_finalizador` y trigger de aprobación) |
| Estado actual en el esquema | Vigente — 20 columnas, PK `id_obligaciones_informe_final`, 6 FK salientes, 0 FK entrantes, 2 índice(s) único(s), 3 CHECK, 1 trigger(s) (verificado contra `sys.*` de la base E2E en Flyway V62) |
| Tablas relacionadas | vuelos, informes_finales_vuelo, usuarios |

### B. Funcionalidad y justificación

Cuando Operaciones finaliza un vuelo se crea una **obligación del comandante de presentar el informe final en 48 horas**. La fila lleva el estado (PENDIENTE, PRESENTADO, DEVUELTO, APROBADO), el plazo original y vigente, si se usó la prórroga de 24 horas, quién la devolvió o aprobó, qué versión del informe la sostiene y quién finalizó el vuelo. Un comandante con una obligación vencida **queda bloqueado**: sólo puede presentar los informes pendientes.

**Por qué es una tabla independiente.** El plazo y el bloqueo son una regla de negocio distinta del contenido del informe y de su historial de versiones; separarlos permite calcular el bloqueo con una sola consulta (`ix_obligaciones_informe_final_abiertas_vencimiento`).

**Qué dejaría de funcionar sin ella.** No habría plazos, prórrogas ni bloqueo por informe vencido; el vuelo no podría pasar de FINALIZADO a COMPLETADO.

### C. Descripción campo por campo

#### `numero_obligacion`

| Atributo | Detalle |
|---|---|
| Nombre | `numero_obligacion` |
| Tipo de dato | `int` |
| Nulabilidad | **NOT NULL.** Siempre 1: el esquema admite más de una, ningún flujo lo usa. |
| Función | Número de la obligación dentro del vuelo. |
| Justificación | Permite varias obligaciones por vuelo en el futuro. |
| Contenido | Entero (siempre 1). |
| Origen | Backend. |
| Momento inicial | 1. |
| Modificación | No cambia. |
| Validaciones | Índice único `uq_obligaciones_informe_final_2` sobre (id_vuelos, numero_obligacion); Única con el vuelo. |

#### `estado_obligacion`

| Atributo | Detalle |
|---|---|
| Nombre | `estado_obligacion` |
| Tipo de dato | `nvarchar(20)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Estado de la obligación. |
| Justificación | Gobierna qué puede hacer el comandante y Operaciones. |
| Contenido | PENDIENTE, PRESENTADO, DEVUELTO o APROBADO. |
| Origen | Backend. |
| Momento inicial | PENDIENTE. |
| Modificación | Presentación, devolución, aprobación. |
| Validaciones | CHECK `ck_obligaciones_informe_final_estado`; CHECK `ck_obligaciones_informe_final_revision`; CHECK de estados y de coherencia. |

#### `vencimiento_original`

| Atributo | Detalle |
|---|---|
| Nombre | `vencimiento_original` |
| Tipo de dato | `datetimeoffset(3)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Plazo original de 48 h. |
| Justificación | Referencia de la prórroga. |
| Contenido | Fecha y hora con desplazamiento (UTC). |
| Origen | Backend (finalización o devolución + 48 h). |
| Momento inicial | En el INSERT. |
| Modificación | Se reinicia al devolver. |
| Validaciones | CHECK `ck_obligaciones_informe_final_fechas`; CHECK de fechas. |

#### `vencimiento`

| Atributo | Detalle |
|---|---|
| Nombre | `vencimiento` |
| Tipo de dato | `datetimeoffset(3)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Plazo vigente. |
| Justificación | Determina el bloqueo y los avisos. |
| Contenido | Fecha y hora con desplazamiento. |
| Origen | Backend. |
| Momento inicial | Igual al original. |
| Modificación | +24 h con la prórroga; reinicia al devolver. |
| Validaciones | CHECK `ck_obligaciones_informe_final_fechas`; CHECK ≥ original salvo prórroga. |

#### `prorroga_utilizada`

| Atributo | Detalle |
|---|---|
| Nombre | `prorroga_utilizada` |
| Tipo de dato | `bit` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Si ya se usó la prórroga. |
| Justificación | La prórroga se concede una vez por ciclo. |
| Contenido | 0/1. |
| Origen | Backend. |
| Momento inicial | 0. |
| Modificación | 1 con la prórroga; 0 al devolver. |
| Validaciones | CHECK `ck_obligaciones_informe_final_fechas`; DEFAULT 0; DEFAULT 0. |

#### `fecha_prorroga`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_prorroga` |
| Tipo de dato | `datetimeoffset(3)` |
| Nulabilidad | **Permite NULL.** NULL si no se pidió prórroga. |
| Función | Cuándo se concedió. |
| Justificación | Trazabilidad. |
| Contenido | Fecha y hora. |
| Origen | Backend. |
| Momento inicial | NULL. |
| Modificación | Con la prórroga; se limpia al devolver. |
| Validaciones | — |

#### `fecha_presentacion`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_presentacion` |
| Tipo de dato | `datetimeoffset(3)` |
| Nulabilidad | **Permite NULL.** NULL hasta la primera presentación. |
| Función | Cuándo se presentó. |
| Justificación | Control del cumplimiento. |
| Contenido | Fecha y hora. |
| Origen | Backend. |
| Momento inicial | NULL. |
| Modificación | Al presentar. |
| Validaciones | — |

#### `fecha_devolucion`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_devolucion` |
| Tipo de dato | `datetimeoffset(3)` |
| Nulabilidad | **Permite NULL.** NULL salvo si fue devuelta. |
| Función | Cuándo se devolvió. |
| Justificación | Trazabilidad. |
| Contenido | Fecha y hora. |
| Origen | Backend. |
| Momento inicial | NULL. |
| Modificación | Al devolver. |
| Validaciones | CHECK `ck_obligaciones_informe_final_revision`; CHECK en DEVUELTO. |

#### `motivo_devolucion`

| Atributo | Detalle |
|---|---|
| Nombre | `motivo_devolucion` |
| Tipo de dato | `nvarchar(max)` |
| Nulabilidad | **Permite NULL.** NULL salvo si fue devuelta. |
| Función | Qué corregir. |
| Justificación | Instrucción al comandante. |
| Contenido | Texto. |
| Origen | Operaciones. |
| Momento inicial | NULL. |
| Modificación | Al devolver. |
| Validaciones | CHECK `ck_obligaciones_informe_final_revision`; CHECK en DEVUELTO. |

#### `fecha_aprobacion`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_aprobacion` |
| Tipo de dato | `datetimeoffset(3)` |
| Nulabilidad | **Permite NULL.** NULL hasta la aprobación. |
| Función | Cuándo se aprobó. |
| Justificación | Fecha de cierre. |
| Contenido | Fecha y hora. |
| Origen | Backend. |
| Momento inicial | NULL. |
| Modificación | Al aprobar. |
| Validaciones | CHECK `ck_obligaciones_informe_final_revision`; CHECK en APROBADO. |

#### `es_actual`

| Atributo | Detalle |
|---|---|
| Nombre | `es_actual` |
| Tipo de dato | `bit` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Marca la obligación vigente del vuelo. |
| Justificación | Permite el índice de unicidad. |
| Contenido | 0/1. |
| Origen | Backend. |
| Momento inicial | 1. |
| Modificación | Ningún flujo la pone en 0 hoy. |
| Validaciones | DEFAULT 1; Índice único filtrado. |

#### `version_fila`

| Atributo | Detalle |
|---|---|
| Nombre | `version_fila` |
| Tipo de dato | `rowversion (timestamp)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Marca de versión que mantiene SQL Server (rowversion). |
| Justificación | Previsto como control optimista. |
| Contenido | 8 bytes automáticos. |
| Origen | SQL Server. |
| Momento inicial | En el INSERT. |
| Modificación | En cada UPDATE. |
| Validaciones | — |

#### `fecha_creacion`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_creacion` |
| Tipo de dato | `datetimeoffset(3)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Cuándo se creó la obligación. |
| Justificación | Base del plazo original. |
| Contenido | Fecha y hora con desplazamiento (UTC). |
| Origen | Backend / DEFAULT `SYSUTCDATETIME()`. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | DEFAULT sysutcdatetime() |

#### `id_obligaciones_informe_final`

| Atributo | Detalle |
|---|---|
| Nombre | `id_obligaciones_informe_final` |
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
| Función | Vuelo finalizado. |
| Justificación | Cada vuelo finalizado genera una obligación. |
| Contenido | Identificador de `vuelos`. |
| Origen | Backend. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `vuelos.id_vuelos` (borrado: NO ACTION); Índice único `uq_obligaciones_informe_final_2` sobre (id_vuelos, numero_obligacion); Índice único `uq_obligaciones_informe_final_actual` filtrado `es_actual=(1)`; NOT NULL, FK. |

#### `id_usuario_comandante`

| Atributo | Detalle |
|---|---|
| Nombre | `id_usuario_comandante` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Comandante obligado. |
| Justificación | Destinatario de plazos y bloqueos. |
| Contenido | Identificador de `usuarios`. |
| Origen | Comandante del vuelo. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `usuarios.id_usuarios` (borrado: NO ACTION); NOT NULL, FK; índice por (comandante, vencimiento). |

#### `id_informes_finales_vuelo`

| Atributo | Detalle |
|---|---|
| Nombre | `id_informes_finales_vuelo` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** NULL hasta que el comandante presenta. |
| Función | Versión del informe vinculada. |
| Justificación | Qué presentación sostiene el estado. |
| Contenido | Identificador de `informes_finales_vuelo`. |
| Origen | Backend. |
| Momento inicial | NULL. |
| Modificación | En cada presentación. |
| Validaciones | FOREIGN KEY → `informes_finales_vuelo.id_informes_finales_vuelo` (borrado: NO ACTION); CHECK `ck_obligaciones_informe_final_revision`; FK; CHECK en APROBADO. |

#### `id_usuario_devolvedor`

| Atributo | Detalle |
|---|---|
| Nombre | `id_usuario_devolvedor` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** NULL salvo devolución. |
| Función | Operador que devolvió. |
| Justificación | Responsabilidad. |
| Contenido | Identificador de `usuarios`. |
| Origen | Operaciones. |
| Momento inicial | NULL. |
| Modificación | Al devolver. |
| Validaciones | FOREIGN KEY → `usuarios.id_usuarios` (borrado: NO ACTION); CHECK `ck_obligaciones_informe_final_revision`; CHECK en DEVUELTO. |

#### `id_usuario_aprobador`

| Atributo | Detalle |
|---|---|
| Nombre | `id_usuario_aprobador` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** NULL hasta la aprobación. |
| Función | Operador que aprobó. |
| Justificación | Responsabilidad del cierre. |
| Contenido | Identificador de `usuarios`. |
| Origen | Operaciones. |
| Momento inicial | NULL. |
| Modificación | Al aprobar. |
| Validaciones | FOREIGN KEY → `usuarios.id_usuarios` (borrado: NO ACTION); CHECK `ck_obligaciones_informe_final_revision`; CHECK en APROBADO. |

#### `id_usuario_finalizador`

| Atributo | Detalle |
|---|---|
| Nombre | `id_usuario_finalizador` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** NULL en obligaciones anteriores a V43 (se avisa a todo Operaciones). |
| Función | Quién finalizó el vuelo. |
| Justificación | Dirige los avisos de gestión a ese operador (V43). |
| Contenido | Identificador de `usuarios`. |
| Origen | Operaciones. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `usuarios.id_usuarios` (borrado: NO ACTION); FK. |

### D. Momento en que se crea un registro

**Escenario 1: Finaliza el vuelo**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | Operaciones / Centro de Operaciones |
| Pantalla / componente y acción | `LifecycleActions` ([`closure.jsx`](../../frontend-react/src/closure.jsx), línea 268): **Finalizar vuelo**. |
| Datos que aporta el usuario | — |
| Endpoint | `POST /api/flights/{id}/finish` |
| Servicio | `FlightService.finish` → `FinalReportWorkflowService.createObligationAfterFinish` |
| Validaciones y condiciones | Vuelo EN_CURSO con aeronave y destino; el vuelo debe tener comandante; es idempotente por vuelo (si ya hay una obligación vigente no crea otra). |
| Mecanismo que crea el registro | `obligations.save(o)`. |
| Columnas completadas y de dónde sale cada valor | `id_vuelos`, `id_usuario_comandante` ← comandante del vuelo; `id_usuario_finalizador` ← quien finalizó; `numero_obligacion`=1; `estado_obligacion`='PENDIENTE'; `vencimiento_original` = `vencimiento` = ahora + 48 h; `prorroga_utilizada`=0; `es_actual`=1; `fecha_creacion` ← UTC; `version_fila` ← rowversion. |
| Columnas que quedan NULL o con valor predeterminado | Prórroga, presentación, devolución, aprobación e informe vinculado. |
| Otros registros creados en la misma operación | Aterrizaje real del vuelo, bitácora FINALIZACION, aeronave movida al destino, notificaciones al comandante y al DTS, auditoría `FINAL_REPORT_OBLIGATION/CREATE`. |
| Si la operación falla / atomicidad | Misma transacción que la finalización del vuelo. |

### E. Ejemplo funcional completo

**Situación:** el vuelo 900 finaliza el 2026-11-04 12:00 UTC.

| estado | vencimiento_original | vencimiento | prorroga_utilizada | fecha_presentacion | id_informes_finales_vuelo | fecha_devolucion | fecha_aprobacion |
|---|---|---|---|---|---|---|---|
| PENDIENTE | 11-06 12:00 | 11-06 12:00 | 0 | NULL | NULL | NULL | NULL |

1. El comandante pide **prórroga de 24 h** (`POST …/extension`): `vencimiento` = 11-07 12:00 (si ya estaba vencida, ahora + 24 h), `prorroga_utilizada`=1, `fecha_prorroga`. Sólo una vez.
2. **Presenta**: PRESENTADO, `fecha_presentacion`, `id_informes_finales_vuelo` → versión 1.
3. Operaciones **devuelve**: DEVUELTO, `motivo_devolucion`, `fecha_devolucion`, `id_usuario_devolvedor`; el plazo se reinicia a ahora + 48 h y la prórroga se rehabilita.
4. Presenta de nuevo y Operaciones **aprueba**: APROBADO, `fecha_aprobacion`, `id_usuario_aprobador` → el vuelo pasa a COMPLETADO.
5. Si el plazo vence en PENDIENTE/DEVUELTO, un barrido cada 60 s genera notificaciones y el comandante queda bloqueado (se calcula al consultar, no se persiste).

### F. Ciclo de vida del registro

| Transición | Acción | Actor | Campos | Validaciones |
|---|---|---|---|---|
| Creación | Finalizar vuelo | Operaciones | INSERT | ver D |
| Prórroga | «Solicitar prórroga de 24 h» | Comandante | `vencimiento`, `prorroga_utilizada`, `fecha_prorroga` | una sola vez, sólo PENDIENTE/DEVUELTO |
| PENDIENTE/DEVUELTO → PRESENTADO | «Presentar informe» | Comandante | estado, `fecha_presentacion`, `id_informes_finales_vuelo` | ver informes |
| PRESENTADO → APROBADO | «Aprobar y completar vuelo» | Operaciones | estado, `fecha_aprobacion`, `id_usuario_aprobador` | trigger: vuelo FINALIZADO y versión aprobada |
| PRESENTADO → DEVUELTO | «Devolver para corrección» | Operaciones | estado, `motivo_devolucion`, `fecha_devolucion`, `id_usuario_devolvedor`, `vencimiento_original`, `vencimiento`, `prorroga_utilizada`=0, `fecha_prorroga`=NULL | motivo obligatorio |
| Vencimiento | Paso del tiempo | Sistema | (ninguno; notifica y audita) | bloqueo calculado en cada operación |
| Cierre | APROBADO es terminal | — | — | — |

### G. Relaciones con otras tablas

**Clave primaria:** `id_obligaciones_informe_final`.

**Claves foráneas salientes (tabla hija → padre):**

| Columna | Referencia | Borrado | Obligatoria |
|---|---|---|---|
| `id_usuario_finalizador` | `usuarios.id_usuarios` (`fk_obligaciones_informe_final_finalizador`) | NO ACTION | Opcional (NULL) |
| `id_informes_finales_vuelo` | `informes_finales_vuelo.id_informes_finales_vuelo` (`fk_obligaciones_informe_final_id_informes_finales_vuelo`) | NO ACTION | Opcional (NULL) |
| `id_usuario_aprobador` | `usuarios.id_usuarios` (`fk_obligaciones_informe_final_id_usuario_aprobador`) | NO ACTION | Opcional (NULL) |
| `id_usuario_comandante` | `usuarios.id_usuarios` (`fk_obligaciones_informe_final_id_usuario_comandante`) | NO ACTION | Obligatoria |
| `id_usuario_devolvedor` | `usuarios.id_usuarios` (`fk_obligaciones_informe_final_id_usuario_devolvedor`) | NO ACTION | Opcional (NULL) |
| `id_vuelos` | `vuelos.id_vuelos` (`fk_obligaciones_informe_final_id_vuelos`) | NO ACTION | Obligatoria |

**Claves foráneas entrantes:** ninguna.

FK `id_vuelos` → `vuelos` (obligatoria, NO ACTION), `id_usuario_comandante`, `id_usuario_devolvedor`, `id_usuario_aprobador`, `id_usuario_finalizador` → `usuarios`, `id_informes_finales_vuelo` → `informes_finales_vuelo` (la versión que sostiene el estado).

### H. Restricciones y decisiones de diseño

**Índices (no PK):**

| Índice | Único | Columnas | Filtro | Incluye |
|---|---|---|---|---|
| `idx_obligaciones_informe_final_aprobado_por_usuario_id` | no | id_usuario_aprobador | — | — |
| `idx_obligaciones_informe_final_comandante_usuario_id` | no | id_usuario_comandante | — | — |
| `idx_obligaciones_informe_final_devuelto_por_usuario_id` | no | id_usuario_devolvedor | — | — |
| `idx_obligaciones_informe_final_id_informes_finales_vuelo` | no | id_informes_finales_vuelo | — | — |
| `idx_obligaciones_informe_final_id_usuario_aprobador` | no | id_usuario_aprobador | — | — |
| `idx_obligaciones_informe_final_id_usuario_comandante` | no | id_usuario_comandante | — | — |
| `idx_obligaciones_informe_final_id_usuario_devolvedor` | no | id_usuario_devolvedor | — | — |
| `idx_obligaciones_informe_final_id_vuelos` | no | id_vuelos | — | — |
| `idx_obligaciones_informe_final_informe_id` | no | id_informes_finales_vuelo | — | — |
| `idx_obligaciones_informe_final_vuelo_id` | no | id_vuelos | — | — |
| `ix_obligaciones_informe_final_abiertas_vencimiento` | no | vencimiento, id_usuario_comandante | `es_actual=(1) AND (estado_obligacion IN (N'PENDIENTE', N'DEVUELTO'))` | — |
| `ix_obligaciones_informe_final_finalizador` | no | id_usuario_finalizador | `id_usuario_finalizador IS NOT NULL` | — |
| `uq_obligaciones_informe_final_2` | sí | id_vuelos, numero_obligacion | — | — |
| `uq_obligaciones_informe_final_actual` | sí | id_vuelos | `es_actual=(1)` | — |

**Restricciones CHECK:** 

- `ck_obligaciones_informe_final_estado`: `(estado_obligacion=N'APROBADO' OR estado_obligacion=N'DEVUELTO' OR estado_obligacion=N'PRESENTADO' OR estado_obligacion=N'PENDIENTE')`
- `ck_obligaciones_informe_final_fechas`: `(vencimiento>=vencimiento_original OR prorroga_utilizada=(1))`
- `ck_obligaciones_informe_final_revision`: `(estado_obligacion=N'APROBADO' AND id_informes_finales_vuelo IS NOT NULL AND fecha_aprobacion IS NOT NULL AND id_usuario_aprobador IS NOT NULL OR estado_obligacion=N'DEVUELTO' AND motivo_devolucion IS NOT NULL AND len(ltrim(rtrim(motivo_devolucion)))>(0) AND fecha_devolucion IS NOT NULL AND id_usuario_devolvedor IS NOT NULL OR (estado_obligacion=N'PRESENTADO' OR estado_obligacion=N'PENDIENTE'))`

**Triggers:** `trg_obligaciones_informe_validar_aprobacion`

**DEFAULT / IDENTITY / nulabilidad:** ver la ficha de cada columna en la sección C (los DEFAULT figuran en «Validaciones»).

- **`uq_obligaciones_informe_final_actual` (vuelo, `es_actual`=1):** una obligación vigente por vuelo; **`uq_obligaciones_informe_final_2`** (vuelo, número) deja lugar a más de una obligación por vuelo.
- **`ck_obligaciones_informe_final_revision`:** APROBADO exige informe, fecha y aprobador; DEVUELTO exige motivo, fecha y devolvedor.
- **`ck_obligaciones_informe_final_fechas`:** el vencimiento no es anterior al original salvo prórroga.
- **Trigger `trg_obligaciones_informe_validar_aprobacion` (V43):** sólo se aprueba con el vuelo FINALIZADO/COMPLETADO y la versión enlazada aprobada.
- **`version_fila` (rowversion):** columna de control de concurrencia que mantiene SQL Server pero la aplicación no mapea (usa bloqueo pesimista).
- **Observación:** hoy `numero_obligacion` vale siempre 1 y `es_actual` siempre 1; el esquema admite varias obligaciones por vuelo pero ningún flujo las crea.

### I. Evidencia de implementación

- [`V7 (creación)`](../../backend-java/src/main/resources/db/migration/V7__final_report_obligations_and_completed.sql#L7)
- [`V43 (finalizador y trigger)`](../../backend-java/src/main/resources/db/migration/V43__informes_historicos_adjuntos_y_responsable_cierre.sql#L137)
- [`Entidad FinalReportObligation`](../../backend-java/src/main/java/com/vuelossanitarios/backend/domain/flight/FinalReportObligation.java#L8)
- [`createObligationAfterFinish`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/FinalReportWorkflowService.java#L29)
- [`extend`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/FinalReportWorkflowService.java#L72)
- [`Barrido de plazos`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/FinalReportDeadlineService.java#L25)
- [`Bloqueo del comandante`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/CommanderReportAccessService.java#L12)
- [`Pantalla de Operaciones`](../../frontend-react/src/closure.jsx#L181)
- [`Prueba: FinalReportDeadlineServiceTest`](../../backend-java/src/test/java/com/vuelossanitarios/backend/service/FinalReportDeadlineServiceTest.java#L16)

---

## 24. Tabla `documentos_vuelo`

### A. Identificación de la tabla

| Atributo | Detalle |
|---|---|
| Nombre exacto y esquema | `dbo.documentos_vuelo` (esquema `dbo`) |
| Módulo funcional | 4. Cierre del vuelo, documentos, notificaciones y auditoría |
| Tipo de tabla | Principal — documento lógico adjunto al vuelo (identidad estable) |
| Migración que la creó | V4 (como `flight_document_items`) |
| Migraciones posteriores que modificaron su estructura | V8, V22 (el documento es una identidad lógica y cada versión un PDF), V24/V27/V28, V52 (baja lógica trazable), V53 (compatibilidad con tipo de vuelo en `tipos_documento`) |
| Estado actual en el esquema | Vigente — 10 columnas, PK `id_documentos_vuelo`, 3 FK salientes, 2 FK entrantes, 0 índice(s) único(s), 1 CHECK, 0 trigger(s) (verificado contra `sys.*` de la base E2E en Flyway V62) |
| Tablas relacionadas | vuelos, tipos_documento, versiones_documento_vuelo, bloqueos_documento_vuelo, usuarios |

### B. Funcionalidad y justificación

Un **documento lógico** es «el parte médico», «la autorización» o «el plan de vuelo» de un vuelo: tiene nombre, tipo y estado (activo o retirado), pero **su contenido está en sus versiones** (`versiones_documento_vuelo`), cada una un archivo PDF. Subir una corrección no crea otro documento: agrega una versión.

Retirar un documento cargado por error es una baja lógica con motivo, usuario y fecha; la fila, sus versiones y sus archivos se conservan.

**Por qué es una tabla independiente.** Separa la identidad del documento (que se retira o se bloquea) de sus versiones físicas (V22: «el documento es una identidad lógica y cada versión es un PDF físico»), para versionar sin perder el historial y para bloquear la edición de un documento con un solo bloqueo.

**Qué dejaría de funcionar sin ella.** No habría documentación adjunta a los vuelos ni historial de versiones.

### C. Descripción campo por campo

#### `nombre_documento`

| Atributo | Detalle |
|---|---|
| Nombre | `nombre_documento` |
| Tipo de dato | `nvarchar(255)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Nombre del documento lógico. |
| Justificación | Es cómo lo reconocen los usuarios; identifica al documento dentro del vuelo. |
| Contenido | Texto de hasta 255 caracteres. |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | No hay endpoint de renombrado. |
| Validaciones | No repetido entre documentos activos del mismo vuelo (servicio). |

#### `esta_activo`

| Atributo | Detalle |
|---|---|
| Nombre | `esta_activo` |
| Tipo de dato | `bit` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Si el documento está en uso o fue retirado. |
| Justificación | Baja lógica. |
| Contenido | 0/1. |
| Origen | Backend. |
| Momento inicial | 1. |
| Modificación | 0 al retirarlo. |
| Validaciones | CHECK `ck_documentos_vuelo_baja`; DEFAULT 1; CHECK de baja; DEFAULT 1. |

#### `row_version`

| Atributo | Detalle |
|---|---|
| Nombre | `row_version` |
| Tipo de dato | `rowversion (timestamp)` |
| Nulabilidad | **NOT NULL.** Columna rowversion sin mapeo en la aplicación (la concurrencia se resuelve con el bloqueo de fila y el bloqueo documental). |
| Función | Marca de versión de SQL Server. |
| Justificación | Previsto como control optimista. |
| Contenido | 8 bytes automáticos. |
| Origen | SQL Server. |
| Momento inicial | En el INSERT. |
| Modificación | En cada UPDATE. |
| Validaciones | — |

#### `fecha_creacion`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_creacion` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Registra el instante en que el documento se incorporó al sistema. |
| Justificación | Permite ordenar cronológicamente, reconstruir el historial y aportar trazabilidad sin depender de la auditoría. |
| Contenido | Fecha y hora (DATETIME2) de la inserción. |
| Origen | Automático: DEFAULT `SYSDATETIME()` de SQL Server o `@CreationTimestamp` de Hibernate (según la entidad); el usuario nunca ingresa esta fecha. |
| Momento inicial | En el INSERT. |
| Modificación | Inmutable: ningún flujo la actualiza (`updatable=false` en la entidad). |
| Validaciones | DEFAULT sysdatetime() |

#### `id_documentos_vuelo`

| Atributo | Detalle |
|---|---|
| Nombre | `id_documentos_vuelo` |
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
| Justificación | Documentos por vuelo. |
| Contenido | Identificador de `vuelos`. |
| Origen | Backend. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `vuelos.id_vuelos` (borrado: **CASCADE**); NOT NULL, FK CASCADE. |

#### `id_tipos_documento`

| Atributo | Detalle |
|---|---|
| Nombre | `id_tipos_documento` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Tipo del documento. |
| Justificación | Define compatibilidad y filtros. |
| Contenido | Identificador de `tipos_documento` (se busca por código). |
| Origen | Formulario. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `tipos_documento.id_tipos_documento` (borrado: NO ACTION); NOT NULL, FK; compatible con el tipo de vuelo. |

#### `fecha_baja`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_baja` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **Permite NULL.** NULL mientras está activo. |
| Función | Cuándo se retiró. |
| Justificación | Trazabilidad. |
| Contenido | Fecha y hora. |
| Origen | Backend. |
| Momento inicial | NULL. |
| Modificación | Al retirar. |
| Validaciones | CHECK `ck_documentos_vuelo_baja`; CHECK de baja. |

#### `id_usuario_baja`

| Atributo | Detalle |
|---|---|
| Nombre | `id_usuario_baja` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** NULL mientras está activo. |
| Función | Quién lo retiró. |
| Justificación | Responsabilidad. |
| Contenido | Identificador de `usuarios`. |
| Origen | Usuario autenticado. |
| Momento inicial | NULL. |
| Modificación | Al retirar. |
| Validaciones | FOREIGN KEY → `usuarios.id_usuarios` (borrado: NO ACTION); CHECK `ck_documentos_vuelo_baja`; CHECK. |

#### `motivo_baja`

| Atributo | Detalle |
|---|---|
| Nombre | `motivo_baja` |
| Tipo de dato | `nvarchar(500)` |
| Nulabilidad | **Permite NULL.** NULL mientras está activo. |
| Función | Por qué se retiró. |
| Justificación | Justificación obligatoria. |
| Contenido | Hasta 500 caracteres. |
| Origen | Formulario. |
| Momento inicial | NULL. |
| Modificación | Al retirar. |
| Validaciones | CHECK `ck_documentos_vuelo_baja`; CHECK: no vacío. |

### D. Momento en que se crea un registro

**Escenario 1: Se registra un documento nuevo**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | COMANDANTE asignado, Operaciones o Centro de Operaciones |
| Pantalla / componente y acción | `FlightDocuments` ([`documents.jsx`](../../frontend-react/src/documents.jsx), línea 143): **Registrar documento** (tipo, nombre y PDF). |
| Datos que aporta el usuario | Tipo de documento, nombre, archivo PDF. |
| Endpoint | `POST /api/flights/{flightId}/documents/pdf` (multipart) — [`DocumentController.java`](../../backend-java/src/main/java/com/vuelossanitarios/backend/api/DocumentController.java) |
| Servicio | `DocumentService.createPdf` |
| Validaciones y condiciones | Puede modificar el vuelo (no cerrado; comandante sin bloqueo); PDF válido; tipo activo y compatible con el vuelo (p. ej. PARTE_MEDICO sólo en sanitarios); sin documento activo del mismo nombre en el vuelo (sin distinguir mayúsculas). |
| Mecanismo que crea el registro | `items.save(item)` + `versions.save(version)`. |
| Columnas completadas y de dónde sale cada valor | `id_vuelos`, `id_tipos_documento`, `nombre_documento` ← formulario; `esta_activo`=1; `fecha_creacion` ← @CreationTimestamp; `row_version` ← rowversion. |
| Columnas que quedan NULL o con valor predeterminado | `fecha_baja`, `id_usuario_baja`, `motivo_baja`. |
| Otros registros creados en la misma operación | Versión 1 (`versiones_documento_vuelo`), archivo en almacenamiento, auditoría `DOCUMENT/CREATE`. |
| Si la operación falla / atomicidad | Atómico; si falla se borra el archivo guardado. |

### E. Ejemplo funcional completo

**Situación:** el comandante sube «Autorización de vuelo.pdf».

| id_documentos_vuelo | id_vuelos | id_tipos_documento | nombre_documento | esta_activo | fecha_baja | id_usuario_baja | motivo_baja |
|---|---|---|---|---|---|---|---|
| 60 | 900 | AUTORIZACION | Autorización de vuelo | 1 | NULL | NULL | NULL |

Se subió por error el documento equivocado: Operaciones usa **Retirar documento** (motivo obligatorio): `esta_activo`=0, `fecha_baja`, `id_usuario_baja`, `motivo_baja`; desaparece del listado operativo y aparece en «Documentos retirados». Se libera su bloqueo, si lo tenía.

### F. Ciclo de vida del registro

| Transición | Acción | Actor | Campos |
|---|---|---|---|
| Alta | «Registrar documento» | Comandante / Operaciones | INSERT (+ versión 1) |
| Nueva versión | «Guardar nueva versión» | idem (con bloqueo adquirido) | (en `versiones_documento_vuelo`) |
| Baja lógica | «Retirar documento» | Operaciones, o el comandante autor | `esta_activo`=0, `fecha_baja`, `id_usuario_baja`, `motivo_baja` |
| Reactivación | **No existe** | — | — |
| Borrado | no existe | — | — |

### G. Relaciones con otras tablas

**Clave primaria:** `id_documentos_vuelo`.

**Claves foráneas salientes (tabla hija → padre):**

| Columna | Referencia | Borrado | Obligatoria |
|---|---|---|---|
| `id_tipos_documento` | `tipos_documento.id_tipos_documento` (`fk_documentos_vuelo_id_tipos_documento`) | NO ACTION | Obligatoria |
| `id_vuelos` | `vuelos.id_vuelos` (`fk_documentos_vuelo_id_vuelos`) | **CASCADE** | Obligatoria |
| `id_usuario_baja` | `usuarios.id_usuarios` (`fk_documentos_vuelo_usuario_baja`) | NO ACTION | Opcional (NULL) |

**Claves foráneas entrantes (tablas hijas):** `bloqueos_documento_vuelo`(id_documentos_vuelo), `versiones_documento_vuelo`(id_documentos_vuelo).

FK `id_vuelos` → `vuelos` (CASCADE), `id_tipos_documento` → `tipos_documento`, `id_usuario_baja` → `usuarios`. Es padre de `versiones_documento_vuelo` (CASCADE) y de `bloqueos_documento_vuelo`.

### H. Restricciones y decisiones de diseño

**Índices (no PK):**

| Índice | Único | Columnas | Filtro | Incluye |
|---|---|---|---|---|
| `idx_documentos_vuelo_id_tipos_documento` | no | id_tipos_documento | — | — |
| `idx_documentos_vuelo_id_vuelos` | no | id_vuelos | — | — |
| `idx_documentos_vuelo_tipo_documento_id` | no | id_tipos_documento | — | — |
| `idx_documentos_vuelo_vuelo_activo` | no | id_vuelos, esta_activo | — | — |
| `idx_documentos_vuelo_vuelo_id` | no | id_vuelos | — | — |

**Restricciones CHECK:** 

- `ck_documentos_vuelo_baja`: `(esta_activo=(1) AND fecha_baja IS NULL AND id_usuario_baja IS NULL AND motivo_baja IS NULL OR esta_activo=(0) AND fecha_baja IS NOT NULL AND id_usuario_baja IS NOT NULL AND motivo_baja IS NOT NULL AND len(ltrim(rtrim(motivo_baja)))>(0))`

**Triggers:** ninguno.

**DEFAULT / IDENTITY / nulabilidad:** ver la ficha de cada columna en la sección C (los DEFAULT figuran en «Validaciones»).

- **`ck_documentos_vuelo_baja` (V52):** activo ⇒ sin datos de baja; inactivo ⇒ fecha, usuario y motivo no vacío.
- **Sin restricción única de nombre:** la unicidad (sin distinguir mayúsculas, entre documentos activos del mismo vuelo) se impone en el servicio bajo bloqueo del vuelo; el esquema no la garantiza (observación).
- **`row_version`:** columna rowversion no mapeada por JPA.
- **Tipos de documento (V53):** el catálogo marca `solo_vuelo_sanitario` para impedir tipos incompatibles.

### I. Evidencia de implementación

- [`V4 (creación)`](../../backend-java/src/main/resources/db/migration/V4__normalize_identity_clinical_data_and_versioning.sql#L126)
- [`V22 (documento lógico)`](../../backend-java/src/main/resources/db/migration/V22__refactorizar_documentos_de_vuelo_solo_pdf.sql#L12)
- [`V52 (baja lógica)`](../../backend-java/src/main/resources/db/migration/V52__baja_logica_documentos_vuelo.sql#L28)
- [`Entidad FlightDocumentItem`](../../backend-java/src/main/java/com/vuelossanitarios/backend/domain/flight/FlightDocumentItem.java#L9)
- [`DocumentService.createPdf`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/DocumentService.java#L40)
- [`DocumentService.deactivate`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/DocumentService.java#L116)
- [`Controlador`](../../backend-java/src/main/java/com/vuelossanitarios/backend/api/DocumentController.java#L17)
- [`Pantalla`](../../frontend-react/src/documents.jsx#L22)
- [`Prueba: DocumentServiceTest`](../../backend-java/src/test/java/com/vuelossanitarios/backend/service/DocumentServiceTest.java#L26)
- [`Prueba: DocumentAuthorizationTest`](../../backend-java/src/test/java/com/vuelossanitarios/backend/api/DocumentAuthorizationTest.java#L28)

---

## 25. Tabla `versiones_documento_vuelo`

### A. Identificación de la tabla

| Atributo | Detalle |
|---|---|
| Nombre exacto y esquema | `dbo.versiones_documento_vuelo` (esquema `dbo`) |
| Módulo funcional | 4. Cierre del vuelo, documentos, notificaciones y auditoría |
| Tipo de tabla | Historial versionado — archivos PDF de cada documento |
| Migración que la creó | V4 (como `flight_documents`) |
| Migraciones posteriores que modificaron su estructura | V8, V22 (sólo PDF: `numero_version`, `nombre_archivo_original`, `ubicacion_almacenamiento`; retira texto y MIME), V24/V27/V28 |
| Estado actual en el esquema | Vigente — 9 columnas, PK `id_versiones_documento_vuelo`, 2 FK salientes, 0 FK entrantes, 2 índice(s) único(s), 1 CHECK, 0 trigger(s) (verificado contra `sys.*` de la base E2E en Flyway V62) |
| Tablas relacionadas | documentos_vuelo, usuarios |

### B. Funcionalidad y justificación

Cada fila es **una versión concreta del archivo PDF** de un documento: su nombre original, la clave con la que el archivo está guardado en el almacenamiento, su tamaño y quién la subió. El contenido no está en la base de datos sino en el disco (`DocumentStorage`); la base sólo conserva su ubicación.

**Por qué es una tabla independiente.** El historial de versiones crece sin tocar la identidad del documento; sólo una versión es la vigente.

**Qué dejaría de funcionar sin ella.** No habría archivos asociados a los documentos.

### C. Descripción campo por campo

#### `numero_version`

| Atributo | Detalle |
|---|---|
| Nombre | `numero_version` |
| Tipo de dato | `int` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Número de la versión. |
| Justificación | Orden del historial. |
| Contenido | Entero ≥ 1. |
| Origen | Backend. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | Índice único `uq_versiones_documento_vuelo_numero` sobre (id_documentos_vuelo, numero_version); CHECK `ck_versiones_documento_vuelo_numero`; CHECK > 0; única con el documento. |

#### `es_version_actual`

| Atributo | Detalle |
|---|---|
| Nombre | `es_version_actual` |
| Tipo de dato | `bit` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Marca la versión vigente. |
| Justificación | La que se muestra y descarga por defecto. |
| Contenido | 0/1. |
| Origen | Backend. |
| Momento inicial | 1. |
| Modificación | Pasa a 0 con una versión posterior. |
| Validaciones | DEFAULT 1; Índice único filtrado. |

#### `nombre_archivo_original`

| Atributo | Detalle |
|---|---|
| Nombre | `nombre_archivo_original` |
| Tipo de dato | `nvarchar(255)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Nombre del archivo subido. |
| Justificación | Mostrar y descargar con el nombre original. |
| Contenido | Texto sin ruta. |
| Origen | Archivo. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | NOT NULL. |

#### `ubicacion_almacenamiento`

| Atributo | Detalle |
|---|---|
| Nombre | `ubicacion_almacenamiento` |
| Tipo de dato | `nvarchar(255)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Clave del archivo en el almacenamiento. |
| Justificación | Localiza el PDF sin guardar rutas absolutas. |
| Contenido | Clave relativa generada. |
| Origen | `DocumentStorage`. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | NOT NULL. |

#### `tamanio_bytes`

| Atributo | Detalle |
|---|---|
| Nombre | `tamanio_bytes` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Tamaño del archivo. |
| Justificación | Control y presentación. |
| Contenido | Entero largo. |
| Origen | Archivo. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | NOT NULL. |

#### `fecha_creacion`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_creacion` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Registra el instante en que la versión se incorporó al sistema. |
| Justificación | Permite ordenar cronológicamente, reconstruir el historial y aportar trazabilidad sin depender de la auditoría. |
| Contenido | Fecha y hora (DATETIME2) de la inserción. |
| Origen | Automático: DEFAULT `SYSDATETIME()` de SQL Server o `@CreationTimestamp` de Hibernate (según la entidad); el usuario nunca ingresa esta fecha. |
| Momento inicial | En el INSERT. |
| Modificación | Inmutable: ningún flujo la actualiza (`updatable=false` en la entidad). |
| Validaciones | DEFAULT sysdatetime() |

#### `id_versiones_documento_vuelo`

| Atributo | Detalle |
|---|---|
| Nombre | `id_versiones_documento_vuelo` |
| Tipo de dato | `bigint` — IDENTITY(1,1) |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Clave primaria de la tabla: identifica de forma única cada fila y es el valor que otras tablas, la API y la auditoría usan para referirse a ella. |
| Justificación | Un identificador técnico numérico, estable y sin significado de negocio evita depender de datos que pueden cambiar (nombres, códigos) y hace eficientes los JOIN y las claves foráneas (decisión V24/V27: «toda tabla de aplicación tiene su propio id_<tabla> BIGINT IDENTITY»). |
| Contenido | Número entero positivo correlativo (1, 2, 3…). No lo ingresa el usuario. |
| Origen | SQL Server, columna IDENTITY(1,1): se asigna en el propio INSERT. Hibernate lo declara `@GeneratedValue(strategy = IDENTITY)` y lo lee de vuelta tras insertar. |
| Momento inicial | En el INSERT; no existe fila sin identificador. |
| Modificación | Nunca cambia (inmutable; JPA lo declara `updatable=false`). |
| Validaciones | PRIMARY KEY; PRIMARY KEY (unicidad y NOT NULL); no se reutiliza al borrar filas. |

#### `id_documentos_vuelo`

| Atributo | Detalle |
|---|---|
| Nombre | `id_documentos_vuelo` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Documento lógico. |
| Justificación | Agrupa las versiones. |
| Contenido | Identificador de `documentos_vuelo`. |
| Origen | Backend. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `documentos_vuelo.id_documentos_vuelo` (borrado: **CASCADE**); Índice único `uq_versiones_documento_vuelo_actual` filtrado `es_version_actual=(1)`; Índice único `uq_versiones_documento_vuelo_numero` sobre (id_documentos_vuelo, numero_version); NOT NULL, FK CASCADE. |

#### `id_usuario_creador`

| Atributo | Detalle |
|---|---|
| Nombre | `id_usuario_creador` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Quién subió la versión. |
| Justificación | Responsabilidad; el primer autor puede retirar el documento. |
| Contenido | Identificador de `usuarios`. |
| Origen | Usuario autenticado. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `usuarios.id_usuarios` (borrado: NO ACTION); NOT NULL, FK. |

### D. Momento en que se crea un registro

**Escenario 1: Versión 1 al registrar el documento**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | Comandante / Operaciones |
| Pantalla / componente y acción | **Registrar documento**. |
| Datos que aporta el usuario | Archivo PDF. |
| Endpoint | `POST /api/flights/{id}/documents/pdf` |
| Servicio | `DocumentService.createPdf` (`pdfVersion`) |
| Validaciones y condiciones | PDF válido (estructura, tamaño). |
| Mecanismo que crea el registro | `versions.save(version)`. |
| Columnas completadas y de dónde sale cada valor | `id_documentos_vuelo`; `numero_version`=1; `es_version_actual`=1; `nombre_archivo_original` (sin ruta), `ubicacion_almacenamiento` (clave generada), `tamanio_bytes` ← archivo; `id_usuario_creador`; `fecha_creacion`. |
| Columnas que quedan NULL o con valor predeterminado | Ninguna. |
| Otros registros creados en la misma operación | Documento. |
| Si la operación falla / atomicidad | Atómico. |

**Escenario 2: Nueva versión de un documento existente**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | Comandante / Operaciones con el bloqueo del documento |
| Pantalla / componente y acción | `FlightDocuments`: **Guardar nueva versión**. |
| Datos que aporta el usuario | Archivo PDF. |
| Endpoint | `POST /api/documents/{itemId}/versions/pdf` |
| Servicio | `DocumentService.replacePdf` + `advance` |
| Validaciones y condiciones | Documento activo y compatible; el usuario debe tener el bloqueo vigente (lease); el bloqueo se revalida después de guardar el archivo. |
| Mecanismo que crea el registro | UPDATE de la vigente anterior + `versions.save`. |
| Columnas completadas y de dónde sale cada valor | `numero_version` = anterior + 1; resto como arriba. |
| Columnas que quedan NULL o con valor predeterminado | Ninguna. |
| Otros registros creados en la misma operación | Auditoría `CREATE_VERSION`. |
| Si la operación falla / atomicidad | Atómico. |

### E. Ejemplo funcional completo

**Situación:** «Autorización de vuelo» tiene dos versiones.

| id | id_documentos_vuelo | numero_version | es_version_actual | nombre_archivo_original | ubicacion_almacenamiento | tamanio_bytes | id_usuario_creador |
|---|---|---|---|---|---|---|---|
| 80 | 60 | 1 | 0 | autorizacion.pdf | 3f1c…a9.pdf | 120400 | 55 |
| 81 | 60 | 2 | 1 | autorizacion_firmada.pdf | b27d…e1.pdf | 131200 | 55 |

La descarga (`GET /api/document-versions/{versionId}/download`) lee el archivo por la clave y la autorización del vuelo.

### F. Ciclo de vida del registro

Sólo se inserta. La única modificación es `es_version_actual`: pasa a 0 cuando se crea una versión posterior. No se borra (ni siquiera al retirar el documento; sólo CASCADE si se borrara el documento).

### G. Relaciones con otras tablas

**Clave primaria:** `id_versiones_documento_vuelo`.

**Claves foráneas salientes (tabla hija → padre):**

| Columna | Referencia | Borrado | Obligatoria |
|---|---|---|---|
| `id_documentos_vuelo` | `documentos_vuelo.id_documentos_vuelo` (`fk_versiones_documento_vuelo_id_documentos_vuelo`) | **CASCADE** | Obligatoria |
| `id_usuario_creador` | `usuarios.id_usuarios` (`fk_versiones_documento_vuelo_id_usuario_creador`) | NO ACTION | Obligatoria |

**Claves foráneas entrantes:** ninguna.

FK `id_documentos_vuelo` → `documentos_vuelo` (CASCADE) y `id_usuario_creador` → `usuarios`.

### H. Restricciones y decisiones de diseño

**Índices (no PK):**

| Índice | Único | Columnas | Filtro | Incluye |
|---|---|---|---|---|
| `idx_versiones_documento_vuelo_creado_por_usuario_id` | no | id_usuario_creador | — | — |
| `idx_versiones_documento_vuelo_documento_vuelo_id` | no | id_documentos_vuelo | — | — |
| `idx_versiones_documento_vuelo_id_documentos_vuelo` | no | id_documentos_vuelo | — | — |
| `idx_versiones_documento_vuelo_id_usuario_creador` | no | id_usuario_creador | — | — |
| `uq_versiones_documento_vuelo_actual` | sí | id_documentos_vuelo | `es_version_actual=(1)` | — |
| `uq_versiones_documento_vuelo_numero` | sí | id_documentos_vuelo, numero_version | — | — |

**Restricciones CHECK:** 

- `ck_versiones_documento_vuelo_numero`: `(numero_version>(0))`

**Triggers:** ninguno.

**DEFAULT / IDENTITY / nulabilidad:** ver la ficha de cada columna en la sección C (los DEFAULT figuran en «Validaciones»).

- **`uq_versiones_documento_vuelo_numero`** (documento, versión) y **`uq_versiones_documento_vuelo_actual`** (una vigente por documento).
- **CHECK `ck_versiones_documento_vuelo_numero`:** versión > 0.
- **El archivo no está en la base:** la integridad entre la fila y el disco no la garantiza el motor (observación): si se borra el archivo, la fila queda huérfana.

### I. Evidencia de implementación

- [`V22 (sólo PDF)`](../../backend-java/src/main/resources/db/migration/V22__refactorizar_documentos_de_vuelo_solo_pdf.sql#L73)
- [`Entidad FlightDocument`](../../backend-java/src/main/java/com/vuelossanitarios/backend/domain/flight/FlightDocument.java#L9)
- [`DocumentService.replacePdf`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/DocumentService.java#L58)
- [`DocumentService.advance`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/DocumentService.java#L207)
- [`Almacenamiento`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/DocumentStorage.java#L11)
- [`Pantalla`](../../frontend-react/src/documents.jsx#L182)
- [`Prueba: DocumentStorageTest`](../../backend-java/src/test/java/com/vuelossanitarios/backend/service/DocumentStorageTest.java#L10)

---

## 26. Tabla `bloqueos_documento_vuelo`

### A. Identificación de la tabla

| Atributo | Detalle |
|---|---|
| Nombre exacto y esquema | `dbo.bloqueos_documento_vuelo` (esquema `dbo`) |
| Módulo funcional | 4. Cierre del vuelo, documentos, notificaciones y auditoría |
| Tipo de tabla | Auxiliar de concurrencia — bloqueo con vencimiento (lease) por documento |
| Migración que la creó | V31 (ya con id BIGINT IDENTITY) |
| Migraciones posteriores que modificaron su estructura | Sin cambios estructurales posteriores identificados |
| Estado actual en el esquema | Vigente — 5 columnas, PK `id_bloqueos_documento_vuelo`, 2 FK salientes, 0 FK entrantes, 1 índice(s) único(s), 1 CHECK, 0 trigger(s) (verificado contra `sys.*` de la base E2E en Flyway V62) |
| Tablas relacionadas | documentos_vuelo, usuarios |

### B. Funcionalidad y justificación

Impide que dos personas guarden **a la vez** nuevas versiones del mismo documento. Quien va a editar **adquiere un bloqueo** de 300 segundos (configurable); mientras esté vigente, otro usuario no puede adquirirlo ni subir versiones. Puede renovarlo o liberarlo; si vence, otro puede recuperarlo.

**Por qué es una tabla independiente.** Es un hecho transitorio con dueño y vencimiento; no corresponde ni al documento ni a sus versiones.

**Qué dejaría de funcionar sin ella.** Dos usuarios podrían pisarse al versionar el mismo documento.

### C. Descripción campo por campo

#### `id_bloqueos_documento_vuelo`

| Atributo | Detalle |
|---|---|
| Nombre | `id_bloqueos_documento_vuelo` |
| Tipo de dato | `bigint` — IDENTITY(1,1) |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Clave primaria de la tabla: identifica de forma única cada fila y es el valor que otras tablas, la API y la auditoría usan para referirse a ella. |
| Justificación | Un identificador técnico numérico, estable y sin significado de negocio evita depender de datos que pueden cambiar (nombres, códigos) y hace eficientes los JOIN y las claves foráneas (decisión V24/V27: «toda tabla de aplicación tiene su propio id_<tabla> BIGINT IDENTITY»). |
| Contenido | Número entero positivo correlativo (1, 2, 3…). No lo ingresa el usuario. |
| Origen | SQL Server, columna IDENTITY(1,1): se asigna en el propio INSERT. Hibernate lo declara `@GeneratedValue(strategy = IDENTITY)` y lo lee de vuelta tras insertar. |
| Momento inicial | En el INSERT; no existe fila sin identificador. |
| Modificación | Nunca cambia (inmutable; JPA lo declara `updatable=false`). |
| Validaciones | PRIMARY KEY; PRIMARY KEY (unicidad y NOT NULL); no se reutiliza al borrar filas. |

#### `id_documentos_vuelo`

| Atributo | Detalle |
|---|---|
| Nombre | `id_documentos_vuelo` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Documento bloqueado. |
| Justificación | Un bloqueo por documento. |
| Contenido | Identificador de `documentos_vuelo`. |
| Origen | Backend. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `documentos_vuelo.id_documentos_vuelo` (borrado: NO ACTION); Índice único `uq_bloqueos_documento_vuelo_documento`; NOT NULL, FK, único. |

#### `id_usuario_propietario`

| Atributo | Detalle |
|---|---|
| Nombre | `id_usuario_propietario` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Quien tiene el bloqueo. |
| Justificación | Sólo el propietario lo libera o renueva. |
| Contenido | Identificador de `usuarios`. |
| Origen | Usuario autenticado. |
| Momento inicial | En el INSERT. |
| Modificación | Cambia si otro recupera un bloqueo vencido. |
| Validaciones | FOREIGN KEY → `usuarios.id_usuarios` (borrado: NO ACTION); NOT NULL, FK. |

#### `fecha_adquisicion`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_adquisicion` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Cuándo se adquirió o recuperó. |
| Justificación | Base del vencimiento. |
| Contenido | Fecha y hora (reloj de negocio). |
| Origen | Backend. |
| Momento inicial | En el INSERT. |
| Modificación | En renovación o recuperación. |
| Validaciones | CHECK `ck_bloqueos_documento_vuelo_vencimiento`; NOT NULL (sin DEFAULT). |

#### `fecha_vencimiento`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_vencimiento` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Cuándo caduca. |
| Justificación | Evita bloqueos eternos. |
| Contenido | Adquisición + 300 s. |
| Origen | Backend. |
| Momento inicial | En el INSERT. |
| Modificación | En renovación. |
| Validaciones | CHECK `ck_bloqueos_documento_vuelo_vencimiento`; CHECK > adquisición. |

### D. Momento en que se crea un registro

**Escenario 1: Se adquiere el bloqueo**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | COMANDANTE / Operaciones |
| Pantalla / componente y acción | `FlightDocuments`: **Adquirir bloqueo** (y «Renovar bloqueo» / «Intentar adquirir bloqueo»). |
| Datos que aporta el usuario | — |
| Endpoint | `POST /api/documents/{itemId}/lock` |
| Servicio | `DocumentService.acquireLock` |
| Validaciones y condiciones | Documento activo y compatible; el vuelo editable; si hay un bloqueo vigente de otro usuario → 409; la fila del documento se bloquea para serializar la primera inserción. |
| Mecanismo que crea el registro | `locks.saveAndFlush(lock)` (INSERT la primera vez; UPDATE al renovar o recuperar uno vencido). |
| Columnas completadas y de dónde sale cada valor | `id_documentos_vuelo` ← documento; `id_usuario_propietario` ← usuario; `fecha_adquisicion` ← ahora; `fecha_vencimiento` ← ahora + 300 s. |
| Columnas que quedan NULL o con valor predeterminado | Ninguna. |
| Otros registros creados en la misma operación | Auditoría `DOCUMENT_LOCK/ACQUIRE\|RECOVER`. |
| Si la operación falla / atomicidad | Atómico. |

### E. Ejemplo funcional completo

**Situación:** Luis adquiere el bloqueo del documento 60 a las 11:00:00.

| id | id_documentos_vuelo | id_usuario_propietario | fecha_adquisicion | fecha_vencimiento |
|---|---|---|---|---|
| 5 | 60 | 55 | 11:00:00 | 11:05:00 |

Si Operaciones intenta adquirirlo a las 11:02 recibe 409. Luis sube la versión y **libera** (`DELETE …/lock`): la fila se **borra**. Si Luis cierra el navegador sin liberar, a las 11:05 el bloqueo vence; la fila queda hasta que alguien lo recupere (UPDATE) o el documento se retire.

### F. Ciclo de vida del registro

| Transición | Acción | Efecto |
|---|---|---|
| Adquirir | «Adquirir bloqueo» | INSERT |
| Renovar | «Renovar bloqueo» | UPDATE `fecha_vencimiento` |
| Recuperar uno vencido | adquirir por otro usuario | UPDATE de propietario y fechas |
| Liberar | «Liberar bloqueo» | **DELETE físico** |
| Retiro de documento / baja del usuario | acciones administrativas | DELETE físico (con auditoría) |
| Vencimiento | paso del tiempo | La fila **permanece** (no hay limpieza automática) y deja de impedir la edición |

### G. Relaciones con otras tablas

**Clave primaria:** `id_bloqueos_documento_vuelo`.

**Claves foráneas salientes (tabla hija → padre):**

| Columna | Referencia | Borrado | Obligatoria |
|---|---|---|---|
| `id_documentos_vuelo` | `documentos_vuelo.id_documentos_vuelo` (`fk_bloqueos_documento_vuelo_documento`) | NO ACTION | Obligatoria |
| `id_usuario_propietario` | `usuarios.id_usuarios` (`fk_bloqueos_documento_vuelo_propietario`) | NO ACTION | Obligatoria |

**Claves foráneas entrantes:** ninguna.

FK `id_documentos_vuelo` → `documentos_vuelo` (única: un bloqueo por documento) y `id_usuario_propietario` → `usuarios`.

### H. Restricciones y decisiones de diseño

**Índices (no PK):**

| Índice | Único | Columnas | Filtro | Incluye |
|---|---|---|---|---|
| `idx_bloqueos_documento_vuelo_vencimiento` | no | fecha_vencimiento | — | — |
| `uq_bloqueos_documento_vuelo_documento` | sí | id_documentos_vuelo | — | — |

**Restricciones CHECK:** 

- `ck_bloqueos_documento_vuelo_vencimiento`: `(fecha_vencimiento>fecha_adquisicion)`

**Triggers:** ninguno.

**DEFAULT / IDENTITY / nulabilidad:** ver la ficha de cada columna en la sección C (los DEFAULT figuran en «Validaciones»).

- **`uq_bloqueos_documento_vuelo_documento`:** un bloqueo por documento.
- **`ck_bloqueos_documento_vuelo_vencimiento`:** vencimiento > adquisición.
- **Observación:** la tabla no tiene baja lógica: las filas se borran físicamente y los vencidos no se limpian solos.

### I. Evidencia de implementación

- [`V31 (creación)`](../../backend-java/src/main/resources/db/migration/V31__agregar_bloqueos_documentales.sql#L1)
- [`Entidad DocumentLock`](../../backend-java/src/main/java/com/vuelossanitarios/backend/domain/flight/DocumentLock.java#L8)
- [`DocumentService.acquireLock`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/DocumentService.java#L146)
- [`DocumentService.releaseLock`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/DocumentService.java#L159)
- [`Liberación al desactivar usuarios`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/UserResponsibilityService.java#L56)
- [`Pantalla`](../../frontend-react/src/documents.jsx#L165)
- [`Prueba: DocumentServiceTest`](../../backend-java/src/test/java/com/vuelossanitarios/backend/service/DocumentServiceTest.java#L26)

---

## 27. Tabla `notificaciones`

### A. Identificación de la tabla

| Atributo | Detalle |
|---|---|
| Nombre exacto y esquema | `dbo.notificaciones` (esquema `dbo`) |
| Módulo funcional | 4. Cierre del vuelo, documentos, notificaciones y auditoría |
| Tipo de tabla | Auxiliar — avisos por usuario |
| Migración que la creó | V1 (como `notifications`) |
| Migraciones posteriores que modificaron su estructura | V8/V24/V27/V28 (renombres), V42 (clave_evento y deduplicación) |
| Estado actual en el esquema | Vigente — 8 columnas, PK `id_notificaciones`, 2 FK salientes, 0 FK entrantes, 1 índice(s) único(s), 0 CHECK, 0 trigger(s) (verificado contra `sys.*` de la base E2E en Flyway V62) |
| Tablas relacionadas | usuarios, vuelos |

### B. Funcionalidad y justificación

Cada fila es **un aviso dirigido a un usuario** (nueva solicitud, horario propuesto, asignación pendiente, ruta pendiente de revisión, informe vencido, vencimiento de habilitación…) con tipo, mensaje y marca de leído. El usuario las ve en su panel de notificaciones y puede marcarlas leídas.

**Por qué es una tabla independiente.** Es un flujo de eventos con destinatario propio y estado de lectura. La columna `clave_evento` (V42) garantiza que el mismo hecho no se notifique dos veces al mismo usuario.

**Qué dejaría de funcionar sin ella.** Los actores no se enterarían de lo que les toca resolver (aprobaciones, respuestas, vencimientos).

### C. Descripción campo por campo

#### `tipo_notificacion`

| Atributo | Detalle |
|---|---|
| Nombre | `tipo_notificacion` |
| Tipo de dato | `nvarchar(50)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Clase de aviso. |
| Justificación | Permite iconos, filtros y semántica. |
| Contenido | Cadena en inglés técnico (p. ej. NEW_SANITARY_REQUEST). |
| Origen | Servicio que notifica. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | NOT NULL (sin conjunto cerrado en la base). |

#### `mensaje`

| Atributo | Detalle |
|---|---|
| Nombre | `mensaje` |
| Tipo de dato | `nvarchar(max)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Texto mostrado al usuario. |
| Justificación | Explica qué ocurrió. |
| Contenido | Texto. |
| Origen | Servicio. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | NOT NULL. |

#### `leido`

| Atributo | Detalle |
|---|---|
| Nombre | `leido` |
| Tipo de dato | `bit` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Si el destinatario ya la vio. |
| Justificación | Contador de no leídas. |
| Contenido | 0/1. |
| Origen | Backend. |
| Momento inicial | 0. |
| Modificación | A 1 al leer. |
| Validaciones | DEFAULT 0; DEFAULT 0. |

#### `fecha_creacion`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_creacion` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Registra el instante en que la notificación se incorporó al sistema. |
| Justificación | Permite ordenar cronológicamente, reconstruir el historial y aportar trazabilidad sin depender de la auditoría. |
| Contenido | Fecha y hora (DATETIME2) de la inserción. |
| Origen | Automático: DEFAULT `SYSDATETIME()` de SQL Server o `@CreationTimestamp` de Hibernate (según la entidad); el usuario nunca ingresa esta fecha. |
| Momento inicial | En el INSERT. |
| Modificación | Inmutable: ningún flujo la actualiza (`updatable=false` en la entidad). |
| Validaciones | DEFAULT sysdatetime() |

#### `id_notificaciones`

| Atributo | Detalle |
|---|---|
| Nombre | `id_notificaciones` |
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
| Función | Destinatario. |
| Justificación | Cada usuario ve sólo las suyas (se valida el dueño). |
| Contenido | Identificador de `usuarios`. |
| Origen | Servicio. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `usuarios.id_usuarios` (borrado: **CASCADE**); Índice único `ux_notificaciones_usuario_clave_evento` sobre (id_usuarios, clave_evento) filtrado `clave_evento IS NOT NULL`; NOT NULL, FK CASCADE. |

#### `id_vuelos`

| Atributo | Detalle |
|---|---|
| Nombre | `id_vuelos` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** NULL en avisos no ligados a un vuelo (p. ej. vencimientos de habilitaciones). |
| Función | Vuelo asociado. |
| Justificación | Permite abrir el vuelo desde el aviso. |
| Contenido | Identificador de `vuelos`. |
| Origen | Servicio. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `vuelos.id_vuelos` (borrado: **CASCADE**); FK CASCADE. |

#### `clave_evento`

| Atributo | Detalle |
|---|---|
| Nombre | `clave_evento` |
| Tipo de dato | `nvarchar(160)` |
| Nulabilidad | **Permite NULL.** NULL en las notificaciones creadas con `create` (sin deduplicación). |
| Función | Clave de deduplicación del hecho. |
| Justificación | Idempotencia: el mismo hecho no se avisa dos veces al mismo usuario. |
| Contenido | Texto de hasta 160 caracteres (p. ej. NEW_SANITARY_REQUEST:900). |
| Origen | Servicio. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | Índice único `ux_notificaciones_usuario_clave_evento` sobre (id_usuarios, clave_evento) filtrado `clave_evento IS NOT NULL`; Índice único con el usuario. |

### D. Momento en que se crea un registro

**Escenario 1: Eventos de negocio durante los flujos**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | Sistema (como consecuencia de acciones de DTS, Operaciones, comandante o administrador) |
| Pantalla / componente y acción | No hay pantalla: se generan al ejecutar la acción (crear solicitud, aprobar, asignar, presentar ruta, finalizar vuelo…). |
| Datos que aporta el usuario | — |
| Endpoint | — |
| Servicio | `NotificationService.create`, `createOnce` y `createOncePreferred`, invocados desde `FlightService`, `CrewManagementService`, `FlightRouteService`, `FinalReportWorkflowService` y otros |
| Validaciones y condiciones | `createOnce` no inserta si ya existe (usuario, clave_evento). |
| Mecanismo que crea el registro | `notifications.save(n)`. |
| Columnas completadas y de dónde sale cada valor | `id_usuarios` ← destinatario; `id_vuelos` ← vuelo (si aplica); `tipo_notificacion`, `mensaje`, `clave_evento` ← servicio; `leido`=0; `fecha_creacion` ← @CreationTimestamp. |
| Columnas que quedan NULL o con valor predeterminado | `id_vuelos` y `clave_evento` según el tipo. |
| Otros registros creados en la misma operación | Se escribe en la misma transacción que la acción que la origina. |
| Si la operación falla / atomicidad | Si la acción falla, no hay aviso. |

**Escenario 2: Procesos programados**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | Procesos automáticos (@Scheduled) |
| Pantalla / componente y acción | — |
| Datos que aporta el usuario | — |
| Endpoint | — |
| Servicio | `FinalReportDeadlineService` (cada 60 s; avisos de vencimiento próximo, vencido y bloqueo), `CrewEligibilityMonitoringService` y `CredentialExpiryNoticeService` (cada hora; `CREW_ELIGIBILITY_REVIEW` y `CREDENTIAL_EXPIRY`) |
| Validaciones y condiciones | Cada hecho se notifica una vez por usuario y clave. |
| Mecanismo que crea el registro | `NotificationService.createOnce`. |
| Columnas completadas y de dónde sale cada valor | Idem. |
| Columnas que quedan NULL o con valor predeterminado | Idem. |
| Otros registros creados en la misma operación | Auditoría de hechos como `OVERDUE`. |
| Si la operación falla / atomicidad | Cada elemento en su propia transacción. |

### E. Ejemplo funcional completo

**Situación:** el DTS crea la solicitud del vuelo 900.

| id_notificaciones | id_usuarios | id_vuelos | tipo_notificacion | mensaje | leido | clave_evento |
|---|---|---|---|---|---|---|
| 9100 | 20 (Ops) | 900 | NEW_SANITARY_REQUEST | Nueva solicitud sanitaria V-7F3A21BC para el 2026-11-04 09:00 | 0 | NEW_SANITARY_REQUEST:900 |

Al crearse una solicitud nueva (todavía sin evaluador) se genera una fila por cada usuario activo con rol de Operaciones; en avisos posteriores el servicio prefiere al responsable concreto (el evaluador de la solicitud o el creador del vuelo) y sólo si no es elegible cae a toda la cola de Operaciones (`createOncePreferred`). Cuando Ops abre el panel y pulsa «Marcar todas como leídas» (`POST /api/notifications/read-all`), todas sus filas pasan a `leido`=1. Tipos observados en la base de pruebas: NEW_SANITARY_REQUEST, EXTREME_URGENCY_REQUEST, SCHEDULE_ACCEPTED, SCHEDULE_COUNTERPROPOSAL, REQUEST_REJECTED, COMMANDER_ASSIGNMENT_PENDING/ACCEPTED/REJECTED, CREW_ASSIGNED/REMOVED, ROUTE_PENDING_REVIEW/APPROVED/RETURNED/REVIEW_REQUIRED, FLIGHT_CANCELLED/FINISHED/COMPLETED, FINAL_REPORT_* y COMMANDER_BLOCKED/UNBLOCKED, CREW_ELIGIBILITY_REVIEW, CREDENTIAL_EXPIRY.

### F. Ciclo de vida del registro

| Transición | Acción | Actor | Campos |
|---|---|---|---|
| Creación | Evento de negocio o barrido | Sistema | INSERT |
| Lectura | Pulsar la notificación / «Marcar todas como leídas» | Destinatario | `leido` 0 → 1 |
| Borrado | **No existe** (sólo CASCADE al borrar usuario o vuelo) | — | — |

Una notificación leída no vuelve a no leída.

### G. Relaciones con otras tablas

**Clave primaria:** `id_notificaciones`.

**Claves foráneas salientes (tabla hija → padre):**

| Columna | Referencia | Borrado | Obligatoria |
|---|---|---|---|
| `id_usuarios` | `usuarios.id_usuarios` (`fk_notificaciones_id_usuarios`) | **CASCADE** | Obligatoria |
| `id_vuelos` | `vuelos.id_vuelos` (`fk_notificaciones_id_vuelos`) | **CASCADE** | Opcional (NULL) |

**Claves foráneas entrantes:** ninguna.

FK `id_usuarios` → `usuarios` (CASCADE, obligatoria) y `id_vuelos` → `vuelos` (CASCADE, opcional).

### H. Restricciones y decisiones de diseño

**Índices (no PK):**

| Índice | Único | Columnas | Filtro | Incluye |
|---|---|---|---|---|
| `idx_notificaciones_id_usuarios` | no | id_usuarios | — | — |
| `idx_notificaciones_id_vuelos` | no | id_vuelos | — | — |
| `idx_notificaciones_usuario_id` | no | id_usuarios | — | — |
| `idx_notificaciones_vuelo_id` | no | id_vuelos | — | — |
| `ux_notificaciones_usuario_clave_evento` | sí | id_usuarios, clave_evento | `clave_evento IS NOT NULL` | — |

**Restricciones CHECK:** ninguna.

**Triggers:** ninguno.

**DEFAULT / IDENTITY / nulabilidad:** ver la ficha de cada columna en la sección C (los DEFAULT figuran en «Validaciones»).

- **`ux_notificaciones_usuario_clave_evento` (V42):** impide duplicar el mismo hecho para el mismo usuario (e idempotencia ante reintentos y barridos).
- **Crecimiento:** en la base de pruebas la tabla supera 1,5 millones de filas porque no hay purga ni archivo (observación).
- **Privacidad:** el mensaje incluye códigos de vuelo pero no datos clínicos.

### I. Evidencia de implementación

- [`V1 (creación)`](../../backend-java/src/main/resources/db/migration/V1__init_sanitary_flights_schema.sql#L231)
- [`V42 (clave de evento)`](../../backend-java/src/main/resources/db/migration/V42__cierre_vuelos_informes_revision.sql#L61)
- [`Entidad Notification`](../../backend-java/src/main/java/com/vuelossanitarios/backend/domain/notification/Notification.java#L21)
- [`NotificationService`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/NotificationService.java#L8)
- [`Endpoints`](../../backend-java/src/main/java/com/vuelossanitarios/backend/api/NotificationController.java#L3)
- [`Panel de notificaciones`](../../frontend-react/src/closure.jsx#L305)
- [`Barrido de plazos`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/FinalReportDeadlineService.java#L40)

---

## 28. Tabla `eventos_auditoria`

### A. Identificación de la tabla

| Atributo | Detalle |
|---|---|
| Nombre exacto y esquema | `dbo.eventos_auditoria` (esquema `dbo`) |
| Módulo funcional | 4. Cierre del vuelo, documentos, notificaciones y auditoría |
| Tipo de tabla | Auditoría — registro inmutable de hechos |
| Migración que la creó | V4 (como `audit_events`) |
| Migraciones posteriores que modificaron su estructura | V8 (renombre), V24/V27/V28 (nombres y BIGINT), V46 (índices de consulta y trigger de inmutabilidad) |
| Estado actual en el esquema | Vigente — 9 columnas, PK `id_eventos_auditoria`, 2 FK salientes, 0 FK entrantes, 0 índice(s) único(s), 1 CHECK, 1 trigger(s) (verificado contra `sys.*` de la base E2E en Flyway V62) |
| Tablas relacionadas | usuarios, vuelos |

### B. Funcionalidad y justificación

Es el **registro de auditoría del sistema**: cada operación con consecuencias (crear o activar un usuario, aprobar una solicitud, asignar recursos, presentar una ruta, verificar una habilitación…) deja un evento con tipo de entidad, operación, valores anteriores y posteriores (JSON), actor, vuelo (si aplica) y fecha en UTC. Sólo se escribe en la misma transacción que la operación, de modo que **ningún cambio queda sin su evento ni un evento sin su cambio**.

Lo consultan los administradores (auditoría global) y Operaciones/comandante (línea de tiempo de un vuelo).

**Por qué es una tabla independiente.** La trazabilidad no puede mezclarse con los datos operativos: es de sólo inserción, con índices propios y control de acceso distinto.

**Qué dejaría de funcionar sin ella.** No habría trazabilidad de quién hizo qué; no se podrían reconstruir cambios ni investigar incidentes.

### C. Descripción campo por campo

#### `id_eventos_auditoria`

| Atributo | Detalle |
|---|---|
| Nombre | `id_eventos_auditoria` |
| Tipo de dato | `bigint` — IDENTITY(1,1) |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Clave primaria de la tabla: identifica de forma única cada fila y es el valor que otras tablas, la API y la auditoría usan para referirse a ella. |
| Justificación | Un identificador técnico numérico, estable y sin significado de negocio evita depender de datos que pueden cambiar (nombres, códigos) y hace eficientes los JOIN y las claves foráneas (decisión V24/V27: «toda tabla de aplicación tiene su propio id_<tabla> BIGINT IDENTITY»). |
| Contenido | Número entero positivo correlativo (1, 2, 3…). Se muestra como identificador del evento en el detalle de auditoría. |
| Origen | SQL Server, columna IDENTITY(1,1): se asigna en el propio INSERT. Hibernate lo declara `@GeneratedValue(strategy = IDENTITY)` y lo lee de vuelta tras insertar. |
| Momento inicial | En el INSERT; no existe fila sin identificador. |
| Modificación | Nunca cambia (inmutable; JPA lo declara `updatable=false`). |
| Validaciones | PRIMARY KEY; PRIMARY KEY (unicidad y NOT NULL); no se reutiliza al borrar filas. |

#### `tipo_entidad`

| Atributo | Detalle |
|---|---|
| Nombre | `tipo_entidad` |
| Tipo de dato | `nvarchar(80)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Clase del objeto afectado. |
| Justificación | Filtro principal de la auditoría. |
| Contenido | Códigos como USER, FLIGHT, SANITARY_REQUEST, FLIGHT_ROUTE, PROFESSIONAL_CREDENTIAL (29 tipos observados). |
| Origen | Servicio. |
| Momento inicial | En el INSERT. |
| Modificación | Nunca cambia. |
| Validaciones | NOT NULL (sin conjunto cerrado en la base). |

#### `operacion`

| Atributo | Detalle |
|---|---|
| Nombre | `operacion` |
| Tipo de dato | `nvarchar(40)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Acción realizada. |
| Justificación | Distingue creación, aprobación, baja, etc. |
| Contenido | Códigos como CREATE, APPROVE, DEACTIVATE. |
| Origen | Servicio. |
| Momento inicial | En el INSERT. |
| Modificación | Nunca cambia. |
| Validaciones | NOT NULL. |

#### `valores_anteriores`

| Atributo | Detalle |
|---|---|
| Nombre | `valores_anteriores` |
| Tipo de dato | `nvarchar(max)` |
| Nulabilidad | **Permite NULL.** NULL en creaciones. |
| Función | Estado previo en JSON. |
| Justificación | Permite ver qué cambió. |
| Contenido | JSON. |
| Origen | Servicio. |
| Momento inicial | En el INSERT. |
| Modificación | Nunca cambia. |
| Validaciones | CHECK `ck_eventos_auditoria_json`; CHECK ISJSON. |

#### `valores_nuevos`

| Atributo | Detalle |
|---|---|
| Nombre | `valores_nuevos` |
| Tipo de dato | `nvarchar(max)` |
| Nulabilidad | **Permite NULL.** NULL en consultas o eliminaciones sin dato nuevo. |
| Función | Estado posterior en JSON. |
| Justificación | Idem. |
| Contenido | JSON. |
| Origen | Servicio. |
| Momento inicial | En el INSERT. |
| Modificación | Nunca cambia. |
| Validaciones | CHECK `ck_eventos_auditoria_json`; CHECK ISJSON. |

#### `fecha_ocurrencia`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_ocurrencia` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Instante del hecho (UTC). |
| Justificación | Orden cronológico. |
| Contenido | Fecha y hora UTC. |
| Origen | Reloj de negocio convertido a UTC. |
| Momento inicial | En el INSERT. |
| Modificación | Nunca cambia. |
| Validaciones | DEFAULT sysdatetime(); Índices por fecha. |

#### `id_vuelos`

| Atributo | Detalle |
|---|---|
| Nombre | `id_vuelos` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** NULL en eventos no ligados a un vuelo (usuarios, aeronaves, habilitaciones…). |
| Función | Vuelo relacionado. |
| Justificación | Línea de tiempo de un vuelo. |
| Contenido | Identificador de `vuelos`. |
| Origen | Servicio. |
| Momento inicial | En el INSERT. |
| Modificación | Nunca cambia. |
| Validaciones | FOREIGN KEY → `vuelos.id_vuelos` (borrado: NO ACTION); FK. |

#### `id_usuario_actor`

| Atributo | Detalle |
|---|---|
| Nombre | `id_usuario_actor` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** NULL en procesos automáticos (p. ej. barridos de vencimiento) o acciones sin sesión (activación). |
| Función | Quién ejecutó la acción. |
| Justificación | Responsabilidad. |
| Contenido | Identificador de `usuarios`. |
| Origen | Usuario autenticado. |
| Momento inicial | En el INSERT. |
| Modificación | Nunca cambia. |
| Validaciones | FOREIGN KEY → `usuarios.id_usuarios` (borrado: NO ACTION); FK. |

#### `entidad_id`

| Atributo | Detalle |
|---|---|
| Nombre | `entidad_id` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** NULL en operaciones sin objeto único (p. ej. VIEW de listas). |
| Función | Identificador del objeto afectado. |
| Justificación | Reconstruir el historial de un objeto. |
| Contenido | Entero (BIGINT). |
| Origen | Servicio. |
| Momento inicial | En el INSERT. |
| Modificación | Nunca cambia. |
| Validaciones | Sin FK. |

### D. Momento en que se crea un registro

**Escenario 1: Toda operación auditada**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | Cualquier usuario autenticado o proceso (según la operación) |
| Pantalla / componente y acción | Ninguna acción directa: se escribe como parte de cada acción. Ejemplos: «Nuevo usuario» (USER/USUARIO_CREADO), «Aprobar horario» (SANITARY_REQUEST/APPROVE), «Asignar recursos» (FLIGHT/ASSIGN_RESOURCES), «Registrar clima» (WEATHER/CREATE). |
| Datos que aporta el usuario | — |
| Endpoint | — |
| Servicio | `AuditService.record` (`@Transactional(propagation=MANDATORY)`: exige una transacción en curso) |
| Validaciones y condiciones | El valor anterior y posterior son JSON válido o NULL; datos sensibles se enmascaran (correos, teléfonos). |
| Mecanismo que crea el registro | `events.save(e)` (INSERT). |
| Columnas completadas y de dónde sale cada valor | `id_vuelos` ← vuelo si aplica; `id_usuario_actor` ← usuario (NULL para procesos); `tipo_entidad` y `operacion` ← constantes del servicio; `entidad_id` ← identificador del objeto; `valores_anteriores`/`valores_nuevos` ← JSON; `fecha_ocurrencia` ← reloj de negocio convertido a UTC. |
| Columnas que quedan NULL o con valor predeterminado | Según la operación. |
| Otros registros creados en la misma operación | Siempre dentro de la misma transacción que el cambio. |
| Si la operación falla / atomicidad | Si la operación se revierte, el evento también. |

### E. Ejemplo funcional completo

**Situación:** Ops aprueba la solicitud 700.

| id_eventos_auditoria | id_vuelos | id_usuario_actor | tipo_entidad | entidad_id | operacion | valores_anteriores | valores_nuevos | fecha_ocurrencia (UTC) |
|---|---|---|---|---|---|---|---|---|
| 150001 | 900 | 20 | SANITARY_REQUEST | 700 | APPROVE | {"estado":"SOLICITADO"} | {"estado":"APROBADO","salida":"2026-11-04T09:00"} | 2026-11-01 13:05:00 |

Un administrador la consulta en *Auditoría* (`GET /api/audit`); un Operaciones/comandante ve los eventos de ese vuelo en la línea de tiempo (`GET /api/audit/flights/{id}`). Nadie puede modificarla ni borrarla: un UPDATE o DELETE directo falla con el error 51046.

### F. Ciclo de vida del registro

Cada fila se inserta una vez y nunca cambia: el trigger `tr_eventos_auditoria_inmutable` (V46) rechaza UPDATE y DELETE, Hibernate la declara `@Immutable` y no hay endpoint de edición o borrado. Los eventos se conservan siempre (la FK al vuelo es NO ACTION: no se podría borrar un vuelo con eventos).

### G. Relaciones con otras tablas

**Clave primaria:** `id_eventos_auditoria`.

**Claves foráneas salientes (tabla hija → padre):**

| Columna | Referencia | Borrado | Obligatoria |
|---|---|---|---|
| `id_usuario_actor` | `usuarios.id_usuarios` (`fk_eventos_auditoria_id_usuario_actor`) | NO ACTION | Opcional (NULL) |
| `id_vuelos` | `vuelos.id_vuelos` (`fk_eventos_auditoria_id_vuelos`) | NO ACTION | Opcional (NULL) |

**Claves foráneas entrantes:** ninguna.

FK `id_vuelos` → `vuelos` (NO ACTION, opcional) e `id_usuario_actor` → `usuarios` (opcional). `entidad_id` **no** es una clave foránea: apunta a la entidad indicada en `tipo_entidad` (FLIGHT, USER, PROFESSIONAL_CREDENTIAL…).

### H. Restricciones y decisiones de diseño

**Índices (no PK):**

| Índice | Único | Columnas | Filtro | Incluye |
|---|---|---|---|---|
| `idx_eventos_auditoria_actor_fecha` | no | id_usuario_actor, fecha_ocurrencia DESC, id_eventos_auditoria DESC | — | — |
| `idx_eventos_auditoria_actor_usuario_id` | no | id_usuario_actor | — | — |
| `idx_eventos_auditoria_entidad_fecha` | no | tipo_entidad, entidad_id, fecha_ocurrencia DESC | — | — |
| `idx_eventos_auditoria_fecha` | no | fecha_ocurrencia DESC, id_eventos_auditoria DESC | — | — |
| `idx_eventos_auditoria_id_usuario_actor` | no | id_usuario_actor | — | — |
| `idx_eventos_auditoria_id_vuelos` | no | id_vuelos | — | — |
| `idx_eventos_auditoria_tipo_operacion` | no | tipo_entidad, operacion | — | — |
| `idx_eventos_auditoria_vuelo_fecha` | no | id_vuelos, fecha_ocurrencia DESC, id_eventos_auditoria DESC | — | — |
| `idx_eventos_auditoria_vuelo_id` | no | id_vuelos | — | — |

**Restricciones CHECK:** 

- `ck_eventos_auditoria_json`: `((valores_anteriores IS NULL OR isjson(valores_anteriores)=(1)) AND (valores_nuevos IS NULL OR isjson(valores_nuevos)=(1)))`

**Triggers:** `tr_eventos_auditoria_inmutable`

**DEFAULT / IDENTITY / nulabilidad:** ver la ficha de cada columna en la sección C (los DEFAULT figuran en «Validaciones»).

- **Trigger de sólo inserción (V46)** y **índices de consulta** por fecha, vuelo, actor, entidad y tipo/operación (orden estable fecha DESC, id DESC).
- **`ck_eventos_auditoria_json`:** ambos valores son JSON válido o NULL.
- **Fecha en UTC:** a diferencia de otras tablas (hora civil), los eventos se guardan en UTC y se convierten al mostrarlos.
- **Sin FK por entidad:** ventaja: el evento sobrevive al objeto; limitación: no hay integridad referencial sobre `entidad_id`.

### I. Evidencia de implementación

- [`V4 (creación)`](../../backend-java/src/main/resources/db/migration/V4__normalize_identity_clinical_data_and_versioning.sql#L166)
- [`V46 (inmutabilidad e índices)`](../../backend-java/src/main/resources/db/migration/V46__auditoria_consulta_indices_e_inmutabilidad.sql#L24)
- [`Entidad AuditEvent`](../../backend-java/src/main/java/com/vuelossanitarios/backend/domain/audit/AuditEvent.java#L14)
- [`AuditService.record`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/AuditService.java#L25)
- [`Consulta de auditoría`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/AuditQueryService.java#L31)
- [`Controlador`](../../backend-java/src/main/java/com/vuelossanitarios/backend/api/AuditController.java#L16)
- [`Pantalla de auditoría`](../../frontend-react/src/audit.jsx#L101)
- [`Prueba: AuditQueryIntegrationTest`](../../backend-java/src/test/java/com/vuelossanitarios/backend/api/AuditQueryIntegrationTest.java#L44)
