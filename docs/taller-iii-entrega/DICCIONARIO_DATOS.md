# Diccionario de datos

## Método y alcance

El diccionario combina dos cortes explícitamente diferenciados: (a) metadatos de sólo lectura de la instancia habitual `vuelos_sanitarios`, que estaba en Flyway V47 al relevamiento; y (b) el esquema objetivo del código V60, conciliado contra la evidencia de la base E2E aislada (`docs/evidencia-i57/inventario-tablas-e2e-v60.json`). Por ello no se presenta V60 como estado aplicado a la instancia habitual.

La instancia habitual contiene 42 tablas físicas: 40 de negocio, `flyway_schema_history` y `sysdiagrams` (esta última es auxiliar de SSMS). El esquema V60 comprobado en E2E posee 46: 45 de negocio y `flyway_schema_history`. Los tipos y restricciones de V47 se extrajeron de `sys.columns`, `sys.foreign_keys`, índices y defaults; las cinco adiciones V48-V60 se fundamentan en sus migraciones. `NO VERIFICADO`: no se reinterrogó una base V60 durante esta elaboración.

Leyenda: NN = no admite NULL; PK = clave primaria; FK = clave foránea; UQ = índice/clave única. Un nombre de índice único puede ser filtrado; consultar las migraciones para el predicado exacto.

## `activaciones_cuenta`

**Finalidad:** códigos y ciclo de activación de cuentas. **Corte:** instancia habitual V47, metadatos verificados.

| Columna | Tipo SQL Server | NULL | Clave/relación | Default | UQ |
|---|---|---|---|---|---|
| `token_hash` | `nvarchar(255)` | No | - | `-` | `-` |
| `fecha_creacion` | `datetime2(3)` | No | - | `(sysdatetime())` | `-` |
| `fecha_expiracion` | `datetime2(3)` | No | - | `-` | `-` |
| `fecha_utilizacion` | `datetime2(3)` | Sí | - | `-` | `-` |
| `id_activaciones_cuenta` | `bigint` | No | PK | `-` | `-` |
| `id_usuarios` | `bigint` | No | FK -> dbo.usuarios.id_usuarios | `-` | `uq_activaciones_cuenta_usuario_vigente` |
| `id_usuario_administrador_creador` | `bigint` | Sí | FK -> dbo.usuarios.id_usuarios | `-` | `-` |

## `aeronaves`

**Finalidad:** recurso aéreo, disponibilidad y ubicación. **Corte:** instancia habitual V47, metadatos verificados.

| Columna | Tipo SQL Server | NULL | Clave/relación | Default | UQ |
|---|---|---|---|---|---|
| `matricula` | `nvarchar(20)` | No | - | `-` | `uq_aeronaves_2` |
| `modelo` | `nvarchar(100)` | No | - | `-` | `-` |
| `tipo_aeronave` | `nvarchar(50)` | No | - | `-` | `-` |
| `capacidad_pacientes` | `smallint` | No | - | `((1))` | `-` |
| `capacidad_tripulacion` | `smallint` | No | - | `((2))` | `-` |
| `equipamiento_medico` | `nvarchar(MAX)` | Sí | - | `-` | `-` |
| `esta_activa` | `bit` | No | - | `((1))` | `-` |
| `fecha_creacion` | `datetime2(3)` | No | - | `(sysdatetime())` | `-` |
| `id_aeronaves` | `bigint` | No | PK | `-` | `-` |
| `id_aeropuertos` | `bigint` | Sí | FK -> dbo.aeropuertos.id_aeropuertos | `-` | `-` |

## `aeropuertos`

**Finalidad:** catálogo de aeropuertos y referencia geográfica. **Corte:** instancia habitual V47, metadatos verificados.

| Columna | Tipo SQL Server | NULL | Clave/relación | Default | UQ |
|---|---|---|---|---|---|
| `codigo_oaci` | `nvarchar(4)` | Sí | - | `-` | `-` |
| `codigo_iata` | `nvarchar(3)` | Sí | - | `-` | `-` |
| `nombre_aeropuerto` | `nvarchar(150)` | No | - | `-` | `-` |
| `ciudad` | `nvarchar(100)` | Sí | - | `-` | `-` |
| `provincia` | `nvarchar(100)` | Sí | - | `-` | `-` |
| `pais` | `nvarchar(100)` | No | - | `(N'Argentina')` | `-` |
| `latitud` | `decimal(9,6)` | Sí | - | `-` | `-` |
| `longitud` | `decimal(9,6)` | Sí | - | `-` | `-` |
| `esta_activo` | `bit` | No | - | `((1))` | `-` |
| `codigo_oficial` | `nvarchar(20)` | Sí | - | `-` | `-` |
| `tipo_aeropuerto` | `nvarchar(30)` | Sí | - | `-` | `-` |
| `id_aeropuertos` | `bigint` | No | PK | `-` | `-` |
| `id_provincias` | `bigint` | Sí | FK -> dbo.provincias.id_provincias | `-` | `-` |
| `id_localidades` | `bigint` | Sí | FK -> dbo.localidades.id_localidades | `-` | `-` |

## `bitacora_vuelos`

**Finalidad:** asientos operativos del vuelo. **Corte:** instancia habitual V47, metadatos verificados.

| Columna | Tipo SQL Server | NULL | Clave/relación | Default | UQ |
|---|---|---|---|---|---|
| `id_bitacora_vuelos` | `bigint` | No | PK | `-` | `-` |
| `campo` | `nvarchar(100)` | No | - | `-` | `-` |
| `valor_anterior` | `nvarchar(MAX)` | Sí | - | `-` | `-` |
| `valor_nuevo` | `nvarchar(MAX)` | Sí | - | `-` | `-` |
| `fecha_cambio` | `datetime2(3)` | No | - | `(sysdatetime())` | `-` |
| `id_vuelos` | `bigint` | No | FK -> dbo.vuelos.id_vuelos | `-` | `UX_bitacora_transicion` |
| `id_usuarios` | `bigint` | Sí | FK -> dbo.usuarios.id_usuarios | `-` | `-` |
| `tipo_acontecimiento` | `nvarchar(40)` | Sí | - | `-` | `UX_bitacora_transicion` |
| `descripcion_operativa` | `nvarchar(4000)` | Sí | - | `-` | `-` |
| `fecha_acontecimiento` | `datetimeoffset(3)` | Sí | - | `-` | `-` |
| `fecha_registro_operativo` | `datetimeoffset(3)` | Sí | - | `-` | `-` |
| `origen_acontecimiento` | `nvarchar(12)` | Sí | - | `-` | `-` |
| `importancia` | `nvarchar(12)` | Sí | - | `-` | `-` |
| `id_entrada_corregida` | `bigint` | Sí | FK -> dbo.bitacora_vuelos.id_bitacora_vuelos | `-` | `-` |
| `motivo_correccion` | `nvarchar(1000)` | Sí | - | `-` | `-` |

## `bloqueos_documento_vuelo`

**Finalidad:** lease temporal para edición documental. **Corte:** instancia habitual V47, metadatos verificados.

| Columna | Tipo SQL Server | NULL | Clave/relación | Default | UQ |
|---|---|---|---|---|---|
| `id_bloqueos_documento_vuelo` | `bigint` | No | PK | `-` | `-` |
| `id_documentos_vuelo` | `bigint` | No | FK -> dbo.documentos_vuelo.id_documentos_vuelo | `-` | `uq_bloqueos_documento_vuelo_documento` |
| `id_usuario_propietario` | `bigint` | No | FK -> dbo.usuarios.id_usuarios | `-` | `-` |
| `fecha_adquisicion` | `datetime2(3)` | No | - | `-` | `-` |
| `fecha_vencimiento` | `datetime2(3)` | No | - | `-` | `-` |

## `clasificaciones_tripulacion`

**Finalidad:** historial de clasificación de personas de tripulación. **Corte:** instancia habitual V47, metadatos verificados.

| Columna | Tipo SQL Server | NULL | Clave/relación | Default | UQ |
|---|---|---|---|---|---|
| `id_clasificaciones_tripulacion` | `bigint` | No | PK | `-` | `-` |
| `id_usuarios` | `bigint` | No | FK -> dbo.usuarios.id_usuarios | `-` | `ux_clasificacion_tripulacion_vigente` |
| `id_roles_tripulacion` | `bigint` | No | FK -> dbo.roles_tripulacion.id_roles_tripulacion | `-` | `ux_clasificacion_tripulacion_vigente` |
| `id_usuario_clasificador` | `bigint` | No | FK -> dbo.usuarios.id_usuarios | `-` | `-` |
| `fecha_clasificacion` | `datetime2(3)` | No | - | `(sysutcdatetime())` | `-` |
| `fecha_baja` | `datetime2(3)` | Sí | - | `-` | `-` |
| `id_usuario_baja` | `bigint` | Sí | FK -> dbo.usuarios.id_usuarios | `-` | `-` |
| `motivo_baja` | `nvarchar(200)` | Sí | - | `-` | `-` |

## `consultas_externas_habilitacion`

**Finalidad:** constancia manual e inmutable de consulta externa. **Corte:** instancia habitual V47, metadatos verificados.

| Columna | Tipo SQL Server | NULL | Clave/relación | Default | UQ |
|---|---|---|---|---|---|
| `id_consultas_externas_habilitacion` | `bigint` | No | PK | `-` | `-` |
| `id_habilitaciones_profesionales` | `bigint` | No | FK -> dbo.habilitaciones_profesionales.id_habilitaciones_profesionales | `-` | `-` |
| `organismo` | `varchar(20)` | No | - | `-` | `-` |
| `fecha_consulta` | `datetime2(3)` | No | - | `-` | `-` |
| `id_usuario_responsable` | `bigint` | No | FK -> dbo.usuarios.id_usuarios | `-` | `-` |
| `numero_consultado` | `nvarchar(100)` | No | - | `-` | `-` |
| `datos_contrastados` | `nvarchar(1000)` | No | - | `-` | `-` |
| `resultado` | `varchar(20)` | No | - | `-` | `-` |
| `observaciones` | `nvarchar(2000)` | Sí | - | `-` | `-` |
| `id_documentos_habilitacion` | `bigint` | Sí | FK -> dbo.documentos_habilitacion.id_documentos_habilitacion | `-` | `-` |
| `fecha_registro` | `datetime2(3)` | No | - | `(sysutcdatetime())` | `-` |

## `contactos_coordinacion_traslado`

**Finalidad:** contactos propios de una solicitud sanitaria. **Corte:** instancia habitual V47, metadatos verificados.

| Columna | Tipo SQL Server | NULL | Clave/relación | Default | UQ |
|---|---|---|---|---|---|
| `id_contactos_coordinacion_traslado` | `bigint` | No | PK | `-` | `-` |
| `id_vuelos` | `bigint` | No | FK -> dbo.vuelos_sanitarios.id_vuelos | `-` | `uq_contactos_coordinacion_traslado_telefono_vigente` |
| `id_vuelos` | `bigint` | No | FK -> dbo.vuelos_sanitarios.id_vuelos | `-` | `uq_contactos_coordinacion_traslado_principal_vigente` |
| `relacion_contacto` | `nvarchar(30)` | No | - | `-` | `-` |
| `nombre_contacto` | `nvarchar(150)` | Sí | - | `-` | `-` |
| `telefono_contacto` | `nvarchar(30)` | No | - | `-` | `-` |
| `telefono_normalizado` | `nvarchar(30)` | No | - | `-` | `uq_contactos_coordinacion_traslado_telefono_vigente` |
| `observaciones_contacto` | `nvarchar(200)` | Sí | - | `-` | `-` |
| `es_principal` | `bit` | No | - | `-` | `-` |
| `version_contacto` | `bigint` | No | - | `((0))` | `-` |
| `id_usuario_alta` | `bigint` | No | FK -> dbo.usuarios.id_usuarios | `-` | `-` |
| `fecha_alta` | `datetime2(7)` | No | - | `-` | `-` |
| `fecha_actualizacion` | `datetime2(7)` | No | - | `-` | `-` |
| `fecha_baja` | `datetime2(7)` | Sí | - | `-` | `-` |
| `id_usuario_baja` | `bigint` | Sí | FK -> dbo.usuarios.id_usuarios | `-` | `-` |
| `motivo_baja` | `nvarchar(30)` | Sí | - | `-` | `-` |
| `codigo_pais` | `varchar(2)` | Sí | - | `-` | `-` |

## `coordinaciones_aa2000`

**Finalidad:** coordinaciones aeroportuarias por vuelo. **Corte:** instancia habitual V47, metadatos verificados.

| Columna | Tipo SQL Server | NULL | Clave/relación | Default | UQ |
|---|---|---|---|---|---|
| `version` | `int` | No | - | `((1))` | `uq_coordinacion_gestion_version` |
| `es_version_actual` | `bit` | No | - | `((1))` | `-` |
| `fecha_slot` | `datetime2(3)` | Sí | - | `-` | `-` |
| `contacto_aa2000` | `nvarchar(150)` | Sí | - | `-` | `-` |
| `estado_autorizacion` | `nvarchar(30)` | No | - | `(N'PENDIENTE')` | `-` |
| `observaciones_coordinacion` | `nvarchar(MAX)` | Sí | - | `-` | `-` |
| `fecha_creacion` | `datetime2(3)` | No | - | `(sysdatetime())` | `-` |
| `id_coordinaciones_aa2000` | `bigint` | No | PK | `-` | `-` |
| `id_vuelos` | `bigint` | No | FK -> dbo.vuelos.id_vuelos | `-` | `-` |
| `id_usuario_registrador` | `bigint` | No | FK -> dbo.usuarios.id_usuarios | `-` | `-` |
| `identificador_gestion` | `uniqueidentifier` | No | - | `-` | `uq_coordinacion_gestion_version` |
| `identificador_gestion` | `uniqueidentifier` | No | - | `-` | `uq_coordinacion_gestion_actual` |
| `id_aeropuerto_gestion` | `bigint` | Sí | FK -> dbo.aeropuertos.id_aeropuertos | `-` | `-` |
| `finalidad_gestion` | `nvarchar(200)` | Sí | - | `-` | `-` |
| `descripcion_gestion` | `nvarchar(MAX)` | Sí | - | `-` | `-` |
| `canal_comunicacion` | `nvarchar(100)` | Sí | - | `-` | `-` |
| `fecha_comunicacion` | `datetime2(3)` | Sí | - | `-` | `-` |
| `fecha_respuesta` | `datetime2(3)` | Sí | - | `-` | `-` |
| `fuente_respuesta` | `nvarchar(250)` | Sí | - | `-` | `-` |
| `referencia_externa` | `nvarchar(250)` | Sí | - | `-` | `-` |
| `contexto_planificacion` | `nvarchar(500)` | Sí | - | `-` | `-` |
| `motivo_cambio` | `nvarchar(1000)` | Sí | - | `-` | `-` |

## `correos_electronicos`

**Finalidad:** contactos de correo de identidad. **Corte:** instancia habitual V47, metadatos verificados.

| Columna | Tipo SQL Server | NULL | Clave/relación | Default | UQ |
|---|---|---|---|---|---|
| `direccion` | `nvarchar(150)` | No | - | `-` | `-` |
| `tipo_correo_electronico` | `nvarchar(30)` | No | - | `(N'PERSONAL')` | `-` |
| `es_principal` | `bit` | No | - | `((0))` | `-` |
| `fecha_creacion` | `datetime2(3)` | No | - | `(sysdatetime())` | `-` |
| `fecha_actualizacion` | `datetime2(3)` | No | - | `(sysdatetime())` | `-` |
| `id_correos_electronicos` | `bigint` | No | PK | `-` | `-` |
| `id_personas` | `bigint` | No | FK -> dbo.personas.id_personas | `-` | `uq_correos_electronicos_principal_por_persona` |
| `id_personas` | `bigint` | No | FK -> dbo.personas.id_personas | `-` | `uq_correos_electronicos_vigente_por_persona` |
| `direccion_normalizada` | `nvarchar(150)` | No | - | `-` | `uq_correos_electronicos_vigente_por_persona` |
| `version_contacto` | `bigint` | No | - | `((0))` | `-` |
| `fecha_baja` | `datetime2(7)` | Sí | - | `-` | `-` |
| `id_usuario_baja` | `bigint` | Sí | FK -> dbo.usuarios.id_usuarios | `-` | `-` |
| `motivo_baja` | `nvarchar(30)` | Sí | - | `-` | `-` |
| `fecha_verificacion` | `datetime2(7)` | Sí | - | `-` | `-` |

## `decisiones_habilitacion`

**Finalidad:** historial inmutable de decisiones de habilitación. **Corte:** instancia habitual V47, metadatos verificados.

| Columna | Tipo SQL Server | NULL | Clave/relación | Default | UQ |
|---|---|---|---|---|---|
| `id_decisiones_habilitacion` | `bigint` | No | PK | `-` | `-` |
| `id_habilitaciones_profesionales` | `bigint` | No | FK -> dbo.habilitaciones_profesionales.id_habilitaciones_profesionales | `-` | `-` |
| `tipo_decision` | `varchar(30)` | No | - | `-` | `-` |
| `estado_resultante` | `varchar(25)` | No | - | `-` | `-` |
| `id_usuarios` | `bigint` | No | FK -> dbo.usuarios.id_usuarios | `-` | `-` |
| `fecha_decision` | `datetime2(3)` | No | - | `(sysutcdatetime())` | `-` |
| `motivo` | `nvarchar(4000)` | Sí | - | `-` | `-` |
| `id_documentos_habilitacion` | `bigint` | Sí | FK -> dbo.documentos_habilitacion.id_documentos_habilitacion | `-` | `-` |

## `documentos_habilitacion`

**Finalidad:** archivos de evidencia profesional y su análisis. **Corte:** instancia habitual V47, metadatos verificados.

| Columna | Tipo SQL Server | NULL | Clave/relación | Default | UQ |
|---|---|---|---|---|---|
| `id_documentos_habilitacion` | `bigint` | No | PK | `-` | `-` |
| `id_habilitaciones_profesionales` | `bigint` | No | FK -> dbo.habilitaciones_profesionales.id_habilitaciones_profesionales | `-` | `-` |
| `clave_archivo` | `nvarchar(120)` | No | - | `-` | `-` |
| `nombre_archivo` | `nvarchar(255)` | No | - | `-` | `-` |
| `id_usuario_cargador` | `bigint` | No | FK -> dbo.usuarios.id_usuarios | `-` | `-` |
| `fecha_carga` | `datetime2(3)` | No | - | `(sysutcdatetime())` | `-` |
| `proposito` | `varchar(25)` | No | - | `('EVIDENCIA')` | `-` |
| `hash_sha256` | `char(64)` | Sí | - | `-` | `-` |
| `tamano_bytes` | `bigint` | Sí | - | `-` | `-` |
| `numero_version` | `int` | No | - | `((1))` | `-` |
| `id_documento_reemplazado` | `bigint` | Sí | FK -> dbo.documentos_habilitacion.id_documentos_habilitacion | `-` | `-` |
| `estado_analisis` | `varchar(25)` | No | - | `('EN_CUARENTENA')` | `-` |
| `fecha_analisis` | `datetime2(3)` | Sí | - | `-` | `-` |
| `motor_analisis` | `nvarchar(100)` | Sí | - | `-` | `-` |
| `detalle_analisis` | `nvarchar(500)` | Sí | - | `-` | `-` |
| `fecha_baja` | `datetime2(3)` | Sí | - | `-` | `-` |
| `id_usuario_baja` | `bigint` | Sí | FK -> dbo.usuarios.id_usuarios | `-` | `-` |
| `motivo_baja` | `nvarchar(500)` | Sí | - | `-` | `-` |
| `bloqueo_conservacion` | `bit` | No | - | `((0))` | `-` |
| `motivo_bloqueo` | `nvarchar(500)` | Sí | - | `-` | `-` |
| `origen_registro` | `varchar(15)` | No | - | `('POSTERIOR_V59')` | `-` |
| `hash_momento` | `varchar(15)` | Sí | - | `-` | `-` |
| `fecha_regularizacion` | `datetime2(3)` | Sí | - | `-` | `-` |
| `id_usuario_regularizacion` | `bigint` | Sí | FK -> dbo.usuarios.id_usuarios | `-` | `-` |

## `documentos_vuelo`

**Finalidad:** documento lógico asociado al vuelo. **Corte:** instancia habitual V47, metadatos verificados.

| Columna | Tipo SQL Server | NULL | Clave/relación | Default | UQ |
|---|---|---|---|---|---|
| `nombre_documento` | `nvarchar(255)` | No | - | `-` | `-` |
| `esta_activo` | `bit` | No | - | `((1))` | `-` |
| `row_version` | `timestamp` | No | - | `-` | `-` |
| `fecha_creacion` | `datetime2(3)` | No | - | `(sysdatetime())` | `-` |
| `id_documentos_vuelo` | `bigint` | No | PK | `-` | `-` |
| `id_vuelos` | `bigint` | No | FK -> dbo.vuelos.id_vuelos | `-` | `-` |
| `id_tipos_documento` | `bigint` | No | FK -> dbo.tipos_documento.id_tipos_documento | `-` | `-` |
| `fecha_baja` | `datetime2(3)` | Sí | - | `-` | `-` |
| `id_usuario_baja` | `bigint` | Sí | FK -> dbo.usuarios.id_usuarios | `-` | `-` |
| `motivo_baja` | `nvarchar(500)` | Sí | - | `-` | `-` |

## `estados_solicitud_sanitaria`

**Finalidad:** catálogo de estados de solicitud. **Corte:** instancia habitual V47, metadatos verificados.

| Columna | Tipo SQL Server | NULL | Clave/relación | Default | UQ |
|---|---|---|---|---|---|
| `codigo_estado_solicitud` | `nvarchar(40)` | No | - | `-` | `uq_estados_solicitud_sanitaria_codigo` |
| `nombre_estado_solicitud` | `nvarchar(100)` | No | - | `-` | `-` |
| `orden` | `smallint` | No | - | `-` | `-` |
| `id_estados_solicitud_sanitaria` | `bigint` | No | PK | `-` | `-` |

## `estados_vuelo`

**Finalidad:** catálogo de estados operativos. **Corte:** instancia habitual V47, metadatos verificados.

| Columna | Tipo SQL Server | NULL | Clave/relación | Default | UQ |
|---|---|---|---|---|---|
| `codigo_estado_vuelo` | `nvarchar(50)` | No | - | `-` | `uq_estados_vuelo_2` |
| `nombre_estado_vuelo` | `nvarchar(100)` | No | - | `-` | `-` |
| `orden` | `smallint` | No | - | `-` | `-` |
| `id_estados_vuelo` | `bigint` | No | PK | `-` | `-` |

## `eventos_auditoria`

**Finalidad:** auditoría de eventos de aplicación. **Corte:** instancia habitual V47, metadatos verificados.

| Columna | Tipo SQL Server | NULL | Clave/relación | Default | UQ |
|---|---|---|---|---|---|
| `id_eventos_auditoria` | `bigint` | No | PK | `-` | `-` |
| `tipo_entidad` | `nvarchar(80)` | No | - | `-` | `-` |
| `operacion` | `nvarchar(40)` | No | - | `-` | `-` |
| `valores_anteriores` | `nvarchar(MAX)` | Sí | - | `-` | `-` |
| `valores_nuevos` | `nvarchar(MAX)` | Sí | - | `-` | `-` |
| `fecha_ocurrencia` | `datetime2(3)` | No | - | `(sysdatetime())` | `-` |
| `id_vuelos` | `bigint` | Sí | FK -> dbo.vuelos.id_vuelos | `-` | `-` |
| `id_usuario_actor` | `bigint` | Sí | FK -> dbo.usuarios.id_usuarios | `-` | `-` |
| `entidad_id` | `bigint` | Sí | - | `-` | `-` |

## `flyway_schema_history`

**Finalidad:** infraestructura o tabla auxiliar. **Corte:** instancia habitual V47, metadatos verificados.

| Columna | Tipo SQL Server | NULL | Clave/relación | Default | UQ |
|---|---|---|---|---|---|
| `installed_rank` | `int` | No | PK | `-` | `-` |
| `version` | `nvarchar(50)` | Sí | - | `-` | `-` |
| `description` | `nvarchar(200)` | Sí | - | `-` | `-` |
| `type` | `nvarchar(20)` | No | - | `-` | `-` |
| `script` | `nvarchar(1000)` | No | - | `-` | `-` |
| `checksum` | `int` | Sí | - | `-` | `-` |
| `installed_by` | `nvarchar(100)` | No | - | `-` | `-` |
| `installed_on` | `datetime` | No | - | `(getdate())` | `-` |
| `execution_time` | `int` | No | - | `-` | `-` |
| `success` | `bit` | No | - | `-` | `-` |

## `habilitaciones_profesionales`

**Finalidad:** habilitaciones de tripulantes. **Corte:** instancia habitual V47, metadatos verificados.

| Columna | Tipo SQL Server | NULL | Clave/relación | Default | UQ |
|---|---|---|---|---|---|
| `id_habilitaciones_profesionales` | `bigint` | No | PK | `-` | `-` |
| `id_personas` | `bigint` | No | FK -> dbo.personas.id_personas | `-` | `-` |
| `id_roles_tripulacion` | `bigint` | No | FK -> dbo.roles_tripulacion.id_roles_tripulacion | `-` | `-` |
| `tipo_habilitacion` | `nvarchar(100)` | No | - | `-` | `-` |
| `numero_habilitacion` | `nvarchar(100)` | No | - | `-` | `-` |
| `organismo_emisor` | `nvarchar(200)` | No | - | `-` | `-` |
| `fecha_emision` | `date` | Sí | - | `-` | `-` |
| `fecha_vencimiento` | `date` | Sí | - | `-` | `-` |
| `estado_verificacion` | `varchar(25)` | No | - | `('PENDIENTE')` | `-` |
| `fecha_verificacion` | `datetime2(3)` | Sí | - | `-` | `-` |
| `id_usuario_verificador` | `bigint` | Sí | FK -> dbo.usuarios.id_usuarios | `-` | `-` |
| `observaciones` | `nvarchar(MAX)` | Sí | - | `-` | `-` |
| `fecha_creacion` | `datetime2(3)` | No | - | `(sysutcdatetime())` | `-` |
| `vencimiento_no_aplica` | `bit` | No | - | `((0))` | `-` |
| `categoria_aeronave` | `nvarchar(50)` | Sí | - | `-` | `-` |
| `id_provincias_jurisdiccion` | `bigint` | Sí | FK -> dbo.provincias.id_provincias | `-` | `-` |
| `restricciones` | `nvarchar(1000)` | Sí | - | `-` | `-` |
| `id_habilitacion_renovada` | `bigint` | Sí | FK -> dbo.habilitaciones_profesionales.id_habilitaciones_profesionales | `-` | `-` |

## `informacion_hangar`

**Finalidad:** información operativa del hangar. **Corte:** instancia habitual V47, metadatos verificados.

| Columna | Tipo SQL Server | NULL | Clave/relación | Default | UQ |
|---|---|---|---|---|---|
| `version` | `int` | No | - | `((1))` | `uq_informacion_hangar_4` |
| `es_version_actual` | `bit` | No | - | `((1))` | `-` |
| `combustible_litros` | `decimal(10,2)` | Sí | - | `-` | `-` |
| `preparacion_completa` | `bit` | No | - | `((0))` | `-` |
| `observaciones_hangar` | `nvarchar(MAX)` | Sí | - | `-` | `-` |
| `fecha_creacion` | `datetime2(3)` | No | - | `(sysdatetime())` | `-` |
| `id_informacion_hangar` | `bigint` | No | PK | `-` | `-` |
| `id_vuelos` | `bigint` | No | FK -> dbo.vuelos.id_vuelos | `-` | `uq_informacion_hangar_4` |
| `id_vuelos` | `bigint` | No | FK -> dbo.vuelos.id_vuelos | `-` | `uq_informacion_hangar_version_actual` |
| `id_usuario_registrador` | `bigint` | No | FK -> dbo.usuarios.id_usuarios | `-` | `-` |
| `requiere_hangar` | `bit` | Sí | - | `-` | `-` |
| `observaciones_comandante` | `nvarchar(MAX)` | Sí | - | `-` | `-` |
| `id_aeronave_contexto` | `bigint` | Sí | FK -> dbo.aeronaves.id_aeronaves | `-` | `-` |
| `id_origen_contexto` | `bigint` | Sí | FK -> dbo.aeropuertos.id_aeropuertos | `-` | `-` |
| `id_comandante_contexto` | `bigint` | Sí | FK -> dbo.usuarios.id_usuarios | `-` | `-` |

## `informacion_medica_vuelo`

**Finalidad:** datos sanitarios específicos de un traslado. **Corte:** instancia habitual V47, metadatos verificados.

| Columna | Tipo SQL Server | NULL | Clave/relación | Default | UQ |
|---|---|---|---|---|---|
| `diagnostico` | `nvarchar(MAX)` | Sí | - | `-` | `-` |
| `condicion_medica` | `nvarchar(100)` | Sí | - | `-` | `-` |
| `requiere_equipamiento_especial` | `bit` | No | - | `((0))` | `-` |
| `observaciones_medicas` | `nvarchar(MAX)` | Sí | - | `-` | `-` |
| `fecha_creacion` | `datetime2(3)` | No | - | `(sysdatetime())` | `-` |
| `fecha_actualizacion` | `datetime2(3)` | No | - | `(sysdatetime())` | `-` |
| `id_informacion_medica_vuelo` | `bigint` | No | PK | `-` | `-` |
| `id_vuelos` | `bigint` | No | FK -> dbo.vuelos.id_vuelos | `-` | `uq_informacion_medica_vuelo_2` |

## `informes_finales_vuelo`

**Finalidad:** informe de cierre. **Corte:** instancia habitual V47, metadatos verificados.

| Columna | Tipo SQL Server | NULL | Clave/relación | Default | UQ |
|---|---|---|---|---|---|
| `version` | `int` | No | - | `((1))` | `uq_informes_finales_vuelo_4` |
| `es_version_actual` | `bit` | No | - | `((1))` | `-` |
| `horas_vuelo` | `decimal(5,2)` | Sí | - | `-` | `-` |
| `combustible_consumido_litros` | `decimal(10,2)` | Sí | - | `-` | `-` |
| `incidentes` | `nvarchar(MAX)` | Sí | - | `-` | `-` |
| `resumen` | `nvarchar(MAX)` | Sí | - | `-` | `-` |
| `fecha_creacion` | `datetime2(3)` | No | - | `(sysdatetime())` | `-` |
| `id_informes_finales_vuelo` | `bigint` | No | PK | `-` | `-` |
| `id_vuelos` | `bigint` | No | FK -> dbo.vuelos.id_vuelos | `-` | `uq_informes_finales_vuelo_4` |
| `id_vuelos` | `bigint` | No | FK -> dbo.vuelos.id_vuelos | `-` | `ux_informes_finales_vuelo_actual` |
| `id_usuario_creador` | `bigint` | No | FK -> dbo.usuarios.id_usuarios | `-` | `-` |
| `estado_revision` | `nvarchar(40)` | No | - | `(N'PRESENTADO')` | `-` |
| `motivo_devolucion` | `nvarchar(MAX)` | Sí | - | `-` | `-` |
| `fecha_revision` | `datetimeoffset(3)` | Sí | - | `-` | `-` |
| `id_usuario_revisor` | `bigint` | Sí | FK -> dbo.usuarios.id_usuarios | `-` | `-` |
| `origen_decision` | `nvarchar(40)` | No | - | `(N'FLUJO_ACTUAL')` | `-` |
| `adjunto_nombre_original` | `nvarchar(255)` | Sí | - | `-` | `-` |
| `adjunto_ubicacion` | `nvarchar(255)` | Sí | - | `-` | `ux_informes_finales_vuelo_adjunto_ubicacion` |
| `adjunto_tamanio_bytes` | `bigint` | Sí | - | `-` | `-` |
| `adjunto_sha256` | `char(64)` | Sí | - | `-` | `-` |

## `instantaneas_clima`

**Finalidad:** observaciones climáticas registradas. **Corte:** instancia habitual V47, metadatos verificados.

| Columna | Tipo SQL Server | NULL | Clave/relación | Default | UQ |
|---|---|---|---|---|---|
| `fecha_registro` | `datetime2(3)` | No | - | `(sysdatetime())` | `-` |
| `observaciones_clima` | `nvarchar(MAX)` | Sí | - | `-` | `-` |
| `condiciones` | `nvarchar(MAX)` | Sí | - | `-` | `-` |
| `favorable` | `bit` | Sí | - | `-` | `-` |
| `id_instantaneas_clima` | `bigint` | No | PK | `-` | `-` |
| `id_vuelos` | `bigint` | No | FK -> dbo.vuelos.id_vuelos | `-` | `-` |
| `id_usuario_registrador` | `bigint` | No | FK -> dbo.usuarios.id_usuarios | `-` | `-` |

## `localidades`

**Finalidad:** catálogo geográfico. **Corte:** instancia habitual V47, metadatos verificados.

| Columna | Tipo SQL Server | NULL | Clave/relación | Default | UQ |
|---|---|---|---|---|---|
| `codigo_oficial` | `nvarchar(20)` | No | - | `-` | `UQ__localida__754AA10E44B985C6` |
| `nombre_localidad` | `nvarchar(200)` | No | - | `-` | `-` |
| `esta_activa` | `bit` | No | - | `((1))` | `-` |
| `id_localidades` | `bigint` | No | PK | `-` | `-` |
| `id_provincias` | `bigint` | No | FK -> dbo.provincias.id_provincias | `-` | `-` |

## `motivos_cancelacion`

**Finalidad:** catálogo de motivos. **Corte:** instancia habitual V47, metadatos verificados.

| Columna | Tipo SQL Server | NULL | Clave/relación | Default | UQ |
|---|---|---|---|---|---|
| `codigo_motivo_cancelacion` | `nvarchar(80)` | No | - | `-` | `uq_motivos_cancelacion_codigo` |
| `nombre_motivo_cancelacion` | `nvarchar(200)` | No | - | `-` | `-` |
| `descripcion_motivo_cancelacion` | `nvarchar(MAX)` | Sí | - | `-` | `-` |
| `categoria` | `nvarchar(40)` | No | - | `-` | `-` |
| `esta_activo` | `bit` | No | - | `((1))` | `-` |
| `orden` | `smallint` | No | - | `-` | `uq_motivos_cancelacion_orden` |
| `id_motivos_cancelacion` | `bigint` | No | PK | `-` | `-` |

## `negociaciones_horario_vuelo`

**Finalidad:** propuestas y decisión de negociación horaria. **Corte:** instancia habitual V47, metadatos verificados.

| Columna | Tipo SQL Server | NULL | Clave/relación | Default | UQ |
|---|---|---|---|---|---|
| `tipo_negociacion` | `nvarchar(40)` | No | - | `-` | `-` |
| `fecha_hora_propuesta` | `datetime2(3)` | Sí | - | `-` | `-` |
| `motivo_negociacion` | `nvarchar(MAX)` | Sí | - | `-` | `-` |
| `fecha_ocurrencia` | `datetime2(3)` | No | - | `(sysdatetime())` | `-` |
| `fecha_hora_llegada_propuesta` | `datetime2(3)` | Sí | - | `-` | `-` |
| `id_negociaciones_horario_vuelo` | `bigint` | No | PK | `-` | `-` |
| `id_vuelos` | `bigint` | No | FK -> dbo.vuelos.id_vuelos | `-` | `-` |
| `id_usuario_actor` | `bigint` | Sí | FK -> dbo.usuarios.id_usuarios | `-` | `-` |
| `id_negociacion_respondida` | `bigint` | Sí | FK -> dbo.negociaciones_horario_vuelo.id_negociaciones_horario_vuelo | `-` | `ux_negociaciones_horario_vuelo_respondida` |

## `notificaciones`

**Finalidad:** bandeja persistente por usuario. **Corte:** instancia habitual V47, metadatos verificados.

| Columna | Tipo SQL Server | NULL | Clave/relación | Default | UQ |
|---|---|---|---|---|---|
| `tipo_notificacion` | `nvarchar(50)` | No | - | `-` | `-` |
| `mensaje` | `nvarchar(MAX)` | No | - | `-` | `-` |
| `leido` | `bit` | No | - | `((0))` | `-` |
| `fecha_creacion` | `datetime2(3)` | No | - | `(sysdatetime())` | `-` |
| `id_notificaciones` | `bigint` | No | PK | `-` | `-` |
| `id_usuarios` | `bigint` | No | FK -> dbo.usuarios.id_usuarios | `-` | `ux_notificaciones_usuario_clave_evento` |
| `id_vuelos` | `bigint` | Sí | FK -> dbo.vuelos.id_vuelos | `-` | `-` |
| `clave_evento` | `nvarchar(160)` | Sí | - | `-` | `ux_notificaciones_usuario_clave_evento` |

## `obligaciones_informe_final`

**Finalidad:** obligación y plazos de informe. **Corte:** instancia habitual V47, metadatos verificados.

| Columna | Tipo SQL Server | NULL | Clave/relación | Default | UQ |
|---|---|---|---|---|---|
| `numero_obligacion` | `int` | No | - | `-` | `uq_obligaciones_informe_final_2` |
| `estado_obligacion` | `nvarchar(20)` | No | - | `-` | `-` |
| `vencimiento_original` | `datetimeoffset(3)` | No | - | `-` | `-` |
| `vencimiento` | `datetimeoffset(3)` | No | - | `-` | `-` |
| `prorroga_utilizada` | `bit` | No | - | `((0))` | `-` |
| `fecha_prorroga` | `datetimeoffset(3)` | Sí | - | `-` | `-` |
| `fecha_presentacion` | `datetimeoffset(3)` | Sí | - | `-` | `-` |
| `fecha_devolucion` | `datetimeoffset(3)` | Sí | - | `-` | `-` |
| `motivo_devolucion` | `nvarchar(MAX)` | Sí | - | `-` | `-` |
| `fecha_aprobacion` | `datetimeoffset(3)` | Sí | - | `-` | `-` |
| `es_actual` | `bit` | No | - | `((1))` | `-` |
| `version_fila` | `timestamp` | No | - | `-` | `-` |
| `fecha_creacion` | `datetimeoffset(3)` | No | - | `(sysutcdatetime())` | `-` |
| `id_obligaciones_informe_final` | `bigint` | No | PK | `-` | `-` |
| `id_vuelos` | `bigint` | No | FK -> dbo.vuelos.id_vuelos | `-` | `uq_obligaciones_informe_final_2` |
| `id_vuelos` | `bigint` | No | FK -> dbo.vuelos.id_vuelos | `-` | `uq_obligaciones_informe_final_actual` |
| `id_usuario_comandante` | `bigint` | No | FK -> dbo.usuarios.id_usuarios | `-` | `-` |
| `id_informes_finales_vuelo` | `bigint` | Sí | FK -> dbo.informes_finales_vuelo.id_informes_finales_vuelo | `-` | `-` |
| `id_usuario_devolvedor` | `bigint` | Sí | FK -> dbo.usuarios.id_usuarios | `-` | `-` |
| `id_usuario_aprobador` | `bigint` | Sí | FK -> dbo.usuarios.id_usuarios | `-` | `-` |
| `id_usuario_finalizador` | `bigint` | Sí | FK -> dbo.usuarios.id_usuarios | `-` | `-` |

## `pacientes`

**Finalidad:** subtipo paciente de una persona. **Corte:** instancia habitual V47, metadatos verificados.

| Columna | Tipo SQL Server | NULL | Clave/relación | Default | UQ |
|---|---|---|---|---|---|
| `fecha_creacion` | `datetime2(3)` | No | - | `(sysdatetime())` | `-` |
| `fecha_actualizacion` | `datetime2(3)` | No | - | `(sysdatetime())` | `-` |
| `id_pacientes` | `bigint` | No | PK | `-` | `-` |
| `id_personas` | `bigint` | No | FK -> dbo.personas.id_personas | `-` | `uq_pacientes_2` |

## `perfiles_comandante`

**Finalidad:** perfil operativo de comandante. **Corte:** instancia habitual V47, metadatos verificados.

| Columna | Tipo SQL Server | NULL | Clave/relación | Default | UQ |
|---|---|---|---|---|---|
| `numero_licencia` | `nvarchar(50)` | No | - | `-` | `-` |
| `numero_licencia_normalizada` | `nvarchar(50)` | Sí | - | `-` | `uq_perfiles_comandante_numero_licencia` |
| `fecha_creacion` | `datetime2(3)` | No | - | `(sysdatetime())` | `-` |
| `fecha_actualizacion` | `datetime2(3)` | No | - | `(sysdatetime())` | `-` |
| `id_personas` | `bigint` | No | FK -> dbo.personas.id_personas | `-` | `uq_perfiles_comandante_id_personas` |
| `id_provincias` | `bigint` | Sí | FK -> dbo.provincias.id_provincias | `-` | `-` |
| `id_perfiles_comandante` | `bigint` | No | PK | `-` | `-` |

## `personas`

**Finalidad:** identidad civil compartida. **Corte:** instancia habitual V47, metadatos verificados.

| Columna | Tipo SQL Server | NULL | Clave/relación | Default | UQ |
|---|---|---|---|---|---|
| `nombre_persona` | `nvarchar(100)` | No | - | `-` | `-` |
| `apellido_persona` | `nvarchar(100)` | No | - | `-` | `-` |
| `dni` | `nvarchar(20)` | Sí | - | `-` | `uq_personas_dni` |
| `fecha_nacimiento` | `date` | Sí | - | `-` | `-` |
| `fecha_creacion` | `datetime2(3)` | No | - | `(sysdatetime())` | `-` |
| `fecha_actualizacion` | `datetime2(3)` | No | - | `(sysdatetime())` | `-` |
| `id_personas` | `bigint` | No | PK | `-` | `-` |
| `version_identidad` | `bigint` | No | - | `((0))` | `-` |

## `politicas_habilitacion`

**Finalidad:** reglas configurables de suficiencia. **Corte:** instancia habitual V47, metadatos verificados.

| Columna | Tipo SQL Server | NULL | Clave/relación | Default | UQ |
|---|---|---|---|---|---|
| `id_politicas_habilitacion` | `bigint` | No | PK | `-` | `-` |
| `id_roles_tripulacion` | `bigint` | No | FK -> dbo.roles_tripulacion.id_roles_tripulacion | `-` | `ux_politica_habilitacion_activa` |
| `id_tipos_vuelo` | `bigint` | Sí | FK -> dbo.tipos_vuelo.id_tipos_vuelo | `-` | `ux_politica_habilitacion_activa` |
| `categoria_aeronave` | `nvarchar(50)` | Sí | - | `-` | `ux_politica_habilitacion_activa` |
| `tipo_habilitacion` | `nvarchar(100)` | No | - | `-` | `ux_politica_habilitacion_activa` |
| `requiere_jurisdiccion` | `bit` | No | - | `((0))` | `-` |
| `requiere_consulta_externa` | `bit` | No | - | `((0))` | `-` |
| `origen` | `varchar(30)` | No | - | `('CONFIGURACION_INTERNA')` | `-` |
| `fuente_referencia` | `nvarchar(500)` | Sí | - | `-` | `-` |
| `observaciones` | `nvarchar(1000)` | Sí | - | `-` | `-` |
| `activa` | `bit` | No | - | `((1))` | `-` |
| `id_usuario_alta` | `bigint` | No | FK -> dbo.usuarios.id_usuarios | `-` | `-` |
| `fecha_alta` | `datetime2(3)` | No | - | `(sysutcdatetime())` | `-` |
| `id_usuario_baja` | `bigint` | Sí | FK -> dbo.usuarios.id_usuarios | `-` | `-` |
| `fecha_baja` | `datetime2(3)` | Sí | - | `-` | `-` |
| `motivo_baja` | `nvarchar(500)` | Sí | - | `-` | `-` |
| `referencia_aprobacion` | `nvarchar(500)` | Sí | - | `-` | `-` |
| `lote_activacion` | `varchar(36)` | Sí | - | `-` | `-` |

## `prioridades_vuelo`

**Finalidad:** catálogo de prioridad. **Corte:** instancia habitual V47, metadatos verificados.

| Columna | Tipo SQL Server | NULL | Clave/relación | Default | UQ |
|---|---|---|---|---|---|
| `codigo_prioridad_vuelo` | `nvarchar(30)` | No | - | `-` | `uq_prioridades_vuelo_2` |
| `nombre_prioridad_vuelo` | `nvarchar(100)` | No | - | `-` | `-` |
| `esta_activa` | `bit` | No | - | `((1))` | `-` |
| `orden` | `smallint` | No | - | `-` | `-` |
| `id_prioridades_vuelo` | `bigint` | No | PK | `-` | `-` |

## `provincias`

**Finalidad:** catálogo geográfico. **Corte:** instancia habitual V47, metadatos verificados.

| Columna | Tipo SQL Server | NULL | Clave/relación | Default | UQ |
|---|---|---|---|---|---|
| `codigo_oficial` | `nvarchar(10)` | No | - | `-` | `UQ__provinci__754AA10E7AC2D56D` |
| `nombre_provincia` | `nvarchar(100)` | No | - | `-` | `UQ__provinci__72AFBCC6741BFCC2` |
| `esta_activa` | `bit` | No | - | `((1))` | `-` |
| `id_provincias` | `bigint` | No | PK | `-` | `-` |

## `roles`

**Finalidad:** roles de autorización. **Corte:** instancia habitual V47, metadatos verificados.

| Columna | Tipo SQL Server | NULL | Clave/relación | Default | UQ |
|---|---|---|---|---|---|
| `codigo_rol` | `nvarchar(30)` | No | - | `-` | `uq_roles_2` |
| `nombre_rol` | `nvarchar(100)` | No | - | `-` | `-` |
| `descripcion_rol` | `nvarchar(MAX)` | Sí | - | `-` | `-` |
| `esta_activo` | `bit` | No | - | `((1))` | `-` |
| `fecha_creacion` | `datetime2(3)` | No | - | `(sysdatetime())` | `-` |
| `id_roles` | `bigint` | No | PK | `-` | `-` |

## `roles_tripulacion`

**Finalidad:** roles funcionales de tripulación. **Corte:** instancia habitual V47, metadatos verificados.

| Columna | Tipo SQL Server | NULL | Clave/relación | Default | UQ |
|---|---|---|---|---|---|
| `codigo_rol_tripulacion` | `nvarchar(30)` | No | - | `-` | `uq_roles_tripulacion_2` |
| `nombre_rol_tripulacion` | `nvarchar(100)` | No | - | `-` | `-` |
| `id_roles_tripulacion` | `bigint` | No | PK | `-` | `-` |

## `rutas_vuelo`

**Finalidad:** versiones y revisión de ruta. **Corte:** instancia habitual V47, metadatos verificados.

| Columna | Tipo SQL Server | NULL | Clave/relación | Default | UQ |
|---|---|---|---|---|---|
| `version` | `int` | No | - | `((1))` | `uq_rutas_vuelo_4` |
| `es_version_actual` | `bit` | No | - | `((1))` | `-` |
| `altitud_pies` | `decimal(8,2)` | Sí | - | `-` | `-` |
| `distancia_nm` | `decimal(8,2)` | Sí | - | `-` | `-` |
| `tiempo_estimado_minutos` | `int` | Sí | - | `-` | `-` |
| `observaciones_ruta` | `nvarchar(MAX)` | Sí | - | `-` | `-` |
| `fecha_creacion` | `datetime2(3)` | No | - | `(sysdatetime())` | `-` |
| `id_rutas_vuelo` | `bigint` | No | PK | `-` | `-` |
| `id_vuelos` | `bigint` | No | FK -> dbo.vuelos.id_vuelos | `-` | `uq_rutas_vuelo_4` |
| `id_vuelos` | `bigint` | No | FK -> dbo.vuelos.id_vuelos | `-` | `uq_rutas_vuelo_actual` |
| `id_usuario_creador` | `bigint` | No | FK -> dbo.usuarios.id_usuarios | `-` | `-` |
| `recorrido_planificado` | `nvarchar(MAX)` | Sí | - | `-` | `-` |
| `id_aeropuerto_alternativo` | `bigint` | Sí | FK -> dbo.aeropuertos.id_aeropuertos | `-` | `-` |
| `contexto_operativo` | `nvarchar(300)` | Sí | - | `-` | `-` |
| `estado_revision` | `varchar(25)` | No | - | `-` | `-` |
| `motivo_modificacion` | `nvarchar(500)` | Sí | - | `-` | `-` |
| `id_usuario_presenta` | `bigint` | Sí | FK -> dbo.usuarios.id_usuarios | `-` | `-` |
| `fecha_presentacion` | `datetime2(3)` | Sí | - | `-` | `-` |
| `id_usuario_revisor` | `bigint` | Sí | FK -> dbo.usuarios.id_usuarios | `-` | `-` |
| `fecha_revision` | `datetime2(3)` | Sí | - | `-` | `-` |
| `observaciones_revision` | `nvarchar(1000)` | Sí | - | `-` | `-` |
| `fecha_invalidacion` | `datetime2(3)` | Sí | - | `-` | `-` |
| `causa_invalidacion` | `nvarchar(500)` | Sí | - | `-` | `-` |

## `sysdiagrams`

**Finalidad:** infraestructura o tabla auxiliar. **Corte:** instancia habitual V47, metadatos verificados.

| Columna | Tipo SQL Server | NULL | Clave/relación | Default | UQ |
|---|---|---|---|---|---|
| `name` | `sysname` | No | - | `-` | `UK_principal_name` |
| `principal_id` | `int` | No | - | `-` | `UK_principal_name` |
| `diagram_id` | `int` | No | PK | `-` | `-` |
| `version` | `int` | Sí | - | `-` | `-` |
| `definition` | `varbinary(MAX)` | Sí | - | `-` | `-` |

## `telefonos`

**Finalidad:** contactos telefónicos de identidad. **Corte:** instancia habitual V47, metadatos verificados.

| Columna | Tipo SQL Server | NULL | Clave/relación | Default | UQ |
|---|---|---|---|---|---|
| `numero` | `nvarchar(30)` | No | - | `-` | `-` |
| `tipo_telefono` | `nvarchar(30)` | No | - | `(N'PERSONAL')` | `-` |
| `es_principal` | `bit` | No | - | `((0))` | `-` |
| `fecha_creacion` | `datetime2(3)` | No | - | `(sysdatetime())` | `-` |
| `fecha_actualizacion` | `datetime2(3)` | No | - | `(sysdatetime())` | `-` |
| `id_telefonos` | `bigint` | No | PK | `-` | `-` |
| `id_personas` | `bigint` | No | FK -> dbo.personas.id_personas | `-` | `uq_telefonos_principal_por_persona` |
| `id_personas` | `bigint` | No | FK -> dbo.personas.id_personas | `-` | `uq_telefonos_vigente_por_persona` |
| `numero_normalizado` | `nvarchar(30)` | No | - | `-` | `uq_telefonos_vigente_por_persona` |
| `version_contacto` | `bigint` | No | - | `((0))` | `-` |
| `fecha_baja` | `datetime2(7)` | Sí | - | `-` | `-` |
| `id_usuario_baja` | `bigint` | Sí | FK -> dbo.usuarios.id_usuarios | `-` | `-` |
| `motivo_baja` | `nvarchar(30)` | Sí | - | `-` | `-` |
| `codigo_pais` | `varchar(2)` | Sí | - | `-` | `-` |

## `tipos_documento`

**Finalidad:** catálogo documental. **Corte:** instancia habitual V47, metadatos verificados.

| Columna | Tipo SQL Server | NULL | Clave/relación | Default | UQ |
|---|---|---|---|---|---|
| `codigo_tipo_documento` | `nvarchar(30)` | No | - | `-` | `uq_tipos_documento_2` |
| `nombre_tipo_documento` | `nvarchar(100)` | No | - | `-` | `-` |
| `id_tipos_documento` | `bigint` | No | PK | `-` | `-` |
| `solo_vuelo_sanitario` | `bit` | No | - | `((0))` | `-` |

## `tipos_vuelo`

**Finalidad:** catálogo de tipos. **Corte:** instancia habitual V47, metadatos verificados.

| Columna | Tipo SQL Server | NULL | Clave/relación | Default | UQ |
|---|---|---|---|---|---|
| `codigo_tipo_vuelo` | `nvarchar(40)` | No | - | `-` | `uq_tipos_vuelo_codigo` |
| `nombre_tipo_vuelo` | `nvarchar(100)` | No | - | `-` | `-` |
| `esta_activo` | `bit` | No | - | `((1))` | `-` |
| `id_tipos_vuelo` | `bigint` | No | PK | `-` | `-` |

## `usuarios`

**Finalidad:** cuenta autenticable. **Corte:** instancia habitual V47, metadatos verificados.

| Columna | Tipo SQL Server | NULL | Clave/relación | Default | UQ |
|---|---|---|---|---|---|
| `nombre_usuario` | `nvarchar(50)` | Sí | - | `-` | `uq_usuarios_nombre_usuario` |
| `hash_contrasena` | `nvarchar(255)` | Sí | - | `-` | `-` |
| `esta_activo` | `bit` | No | - | `((1))` | `-` |
| `fecha_creacion` | `datetime2(3)` | No | - | `(sysdatetime())` | `-` |
| `fecha_actualizacion` | `datetime2(3)` | No | - | `(sysdatetime())` | `-` |
| `estado_cuenta` | `nvarchar(24)` | No | - | `(N'ACTIVO')` | `-` |
| `debe_cambiar_contrasena` | `bit` | No | - | `((0))` | `-` |
| `version_credenciales` | `bigint` | No | - | `((1))` | `-` |
| `fecha_baja` | `datetime2(3)` | Sí | - | `-` | `-` |
| `id_usuarios` | `bigint` | No | PK | `-` | `-` |
| `id_personas` | `bigint` | No | FK -> dbo.personas.id_personas | `-` | `uq_usuarios_5` |
| `id_usuario_baja` | `bigint` | Sí | FK -> dbo.usuarios.id_usuarios | `-` | `-` |
| `motivo_baja` | `nvarchar(500)` | Sí | - | `-` | `-` |

## `usuarios_roles`

**Finalidad:** asociación usuario-rol. **Corte:** instancia habitual V47, metadatos verificados.

| Columna | Tipo SQL Server | NULL | Clave/relación | Default | UQ |
|---|---|---|---|---|---|
| `fecha_asignacion` | `datetime2(3)` | No | - | `(sysdatetime())` | `-` |
| `id_usuarios` | `bigint` | No | FK -> dbo.usuarios.id_usuarios | `-` | `uq_usuarios_roles_id_usuarios_id_roles` |
| `id_roles` | `bigint` | No | FK -> dbo.roles.id_roles | `-` | `uq_usuarios_roles_id_usuarios_id_roles` |
| `id_usuarios_roles` | `bigint` | No | PK | `-` | `-` |

## `verificaciones_correo`

**Finalidad:** códigos de verificación de correo. **Corte:** instancia habitual V47, metadatos verificados.

| Columna | Tipo SQL Server | NULL | Clave/relación | Default | UQ |
|---|---|---|---|---|---|
| `id_verificaciones_correo` | `bigint` | No | PK | `-` | `-` |
| `id_correos_electronicos` | `bigint` | No | FK -> dbo.correos_electronicos.id_correos_electronicos | `-` | `uq_verificaciones_correo_abierta` |
| `direccion_normalizada` | `nvarchar(150)` | No | - | `-` | `-` |
| `codigo_hash` | `varchar(64)` | No | - | `-` | `-` |
| `intentos_fallidos` | `tinyint` | No | - | `((0))` | `-` |
| `fecha_creacion` | `datetime2(7)` | No | - | `-` | `-` |
| `fecha_vencimiento` | `datetime2(7)` | No | - | `-` | `-` |
| `fecha_envio` | `datetime2(7)` | Sí | - | `-` | `-` |
| `fecha_uso` | `datetime2(7)` | Sí | - | `-` | `-` |
| `fecha_invalidacion` | `datetime2(7)` | Sí | - | `-` | `-` |
| `motivo_invalidacion` | `nvarchar(30)` | Sí | - | `-` | `-` |
| `id_usuario_solicitante` | `bigint` | No | FK -> dbo.usuarios.id_usuarios | `-` | `-` |

## `versiones_documento_vuelo`

**Finalidad:** versiones PDF de documento. **Corte:** instancia habitual V47, metadatos verificados.

| Columna | Tipo SQL Server | NULL | Clave/relación | Default | UQ |
|---|---|---|---|---|---|
| `numero_version` | `int` | No | - | `-` | `uq_versiones_documento_vuelo_numero` |
| `es_version_actual` | `bit` | No | - | `((1))` | `-` |
| `nombre_archivo_original` | `nvarchar(255)` | No | - | `-` | `-` |
| `ubicacion_almacenamiento` | `nvarchar(255)` | No | - | `-` | `-` |
| `tamanio_bytes` | `bigint` | No | - | `-` | `-` |
| `fecha_creacion` | `datetime2(3)` | No | - | `(sysdatetime())` | `-` |
| `id_versiones_documento_vuelo` | `bigint` | No | PK | `-` | `-` |
| `id_documentos_vuelo` | `bigint` | No | FK -> dbo.documentos_vuelo.id_documentos_vuelo | `-` | `uq_versiones_documento_vuelo_numero` |
| `id_documentos_vuelo` | `bigint` | No | FK -> dbo.documentos_vuelo.id_documentos_vuelo | `-` | `uq_versiones_documento_vuelo_actual` |
| `id_usuario_creador` | `bigint` | No | FK -> dbo.usuarios.id_usuarios | `-` | `-` |

## `vuelos`

**Finalidad:** agregado principal del vuelo. **Corte:** instancia habitual V47, metadatos verificados.

| Columna | Tipo SQL Server | NULL | Clave/relación | Default | UQ |
|---|---|---|---|---|---|
| `codigo_vuelo` | `nvarchar(30)` | No | - | `-` | `uq_vuelos_2` |
| `motivo_vuelo` | `nvarchar(MAX)` | No | - | `-` | `-` |
| `fecha_planificada_salida` | `datetime2(3)` | Sí | - | `-` | `-` |
| `fecha_planificada_llegada` | `datetime2(3)` | Sí | - | `-` | `-` |
| `fecha_salida_real` | `datetime2(3)` | Sí | - | `-` | `-` |
| `fecha_llegada_real` | `datetime2(3)` | Sí | - | `-` | `-` |
| `fecha_creacion` | `datetime2(3)` | No | - | `(sysdatetime())` | `-` |
| `fecha_actualizacion` | `datetime2(3)` | No | - | `(sysdatetime())` | `-` |
| `fecha_cancelacion` | `datetime2(3)` | Sí | - | `-` | `-` |
| `motivo_cancelacion_personalizado` | `nvarchar(MAX)` | Sí | - | `-` | `-` |
| `id_vuelos` | `bigint` | No | PK | `-` | `-` |
| `id_aeronaves` | `bigint` | Sí | FK -> dbo.aeronaves.id_aeronaves | `-` | `-` |
| `id_usuario_comandante` | `bigint` | Sí | FK -> dbo.usuarios.id_usuarios | `-` | `-` |
| `id_aeropuerto_origen` | `bigint` | Sí | FK -> dbo.aeropuertos.id_aeropuertos | `-` | `-` |
| `id_aeropuerto_destino` | `bigint` | Sí | FK -> dbo.aeropuertos.id_aeropuertos | `-` | `-` |
| `id_usuario_cancelador` | `bigint` | Sí | FK -> dbo.usuarios.id_usuarios | `-` | `-` |
| `id_motivos_cancelacion` | `bigint` | Sí | FK -> dbo.motivos_cancelacion.id_motivos_cancelacion | `-` | `-` |
| `id_tipos_vuelo` | `bigint` | No | FK -> dbo.tipos_vuelo.id_tipos_vuelo | `-` | `-` |
| `id_estados_vuelo` | `bigint` | Sí | FK -> dbo.estados_vuelo.id_estados_vuelo | `-` | `-` |
| `id_usuario_creador` | `bigint` | No | FK -> dbo.usuarios.id_usuarios | `-` | `-` |

## `vuelos_sanitarios`

**Finalidad:** especialización sanitaria de un vuelo. **Corte:** instancia habitual V47, metadatos verificados.

| Columna | Tipo SQL Server | NULL | Clave/relación | Default | UQ |
|---|---|---|---|---|---|
| `fecha_solicitada` | `datetime2(3)` | No | - | `-` | `-` |
| `extrema_urgencia` | `bit` | No | - | `((0))` | `-` |
| `justificacion_extrema_urgencia` | `nvarchar(MAX)` | Sí | - | `-` | `-` |
| `fecha_limite_traslado` | `datetime2(3)` | Sí | - | `-` | `-` |
| `origen_solicitado_legacy` | `nvarchar(100)` | Sí | - | `-` | `-` |
| `destino_solicitado_legacy` | `nvarchar(100)` | Sí | - | `-` | `-` |
| `fecha_evaluacion` | `datetime2(3)` | Sí | - | `-` | `-` |
| `motivo_rechazo` | `nvarchar(MAX)` | Sí | - | `-` | `-` |
| `id_vuelos` | `bigint` | No | FK -> dbo.vuelos.id_vuelos | `-` | `uq_vuelos_sanitarios_id_vuelos` |
| `id_pacientes` | `bigint` | No | FK -> dbo.pacientes.id_pacientes | `-` | `-` |
| `id_usuario_solicitante` | `bigint` | No | FK -> dbo.usuarios.id_usuarios | `-` | `-` |
| `id_prioridades_vuelo` | `bigint` | Sí | FK -> dbo.prioridades_vuelo.id_prioridades_vuelo | `-` | `-` |
| `id_localidad_origen` | `bigint` | Sí | FK -> dbo.localidades.id_localidades | `-` | `-` |
| `id_localidad_destino` | `bigint` | Sí | FK -> dbo.localidades.id_localidades | `-` | `-` |
| `id_estados_solicitud_sanitaria` | `bigint` | No | FK -> dbo.estados_solicitud_sanitaria.id_estados_solicitud_sanitaria | `-` | `-` |
| `id_usuario_evaluador` | `bigint` | Sí | FK -> dbo.usuarios.id_usuarios | `-` | `-` |
| `id_vuelos_sanitarios` | `bigint` | No | PK | `-` | `-` |

## `vuelos_tripulantes`

**Finalidad:** asignaciones e historial de tripulación. **Corte:** instancia habitual V47, metadatos verificados.

| Columna | Tipo SQL Server | NULL | Clave/relación | Default | UQ |
|---|---|---|---|---|---|
| `fecha_creacion` | `datetime2(3)` | No | - | `(sysdatetime())` | `-` |
| `id_vuelos_tripulantes` | `bigint` | No | PK | `-` | `-` |
| `id_vuelos` | `bigint` | No | FK -> dbo.vuelos.id_vuelos | `-` | `ux_vuelos_tripulantes_asignacion_vigente` |
| `id_usuarios` | `bigint` | No | FK -> dbo.usuarios.id_usuarios | `-` | `ux_vuelos_tripulantes_asignacion_vigente` |
| `id_roles_tripulacion` | `bigint` | No | FK -> dbo.roles_tripulacion.id_roles_tripulacion | `-` | `-` |
| `id_usuario_asignador` | `bigint` | Sí | FK -> dbo.usuarios.id_usuarios | `-` | `-` |
| `fecha_baja` | `datetime2(7)` | Sí | - | `-` | `-` |
| `id_usuario_baja` | `bigint` | Sí | FK -> dbo.usuarios.id_usuarios | `-` | `-` |
| `motivo_baja` | `nvarchar(30)` | Sí | - | `-` | `-` |

## Diferencia V47 a V60

El código agrega/modifica el modelo tras V47: V48 concurrencia de identidad; V49-V50 contactos; V51 `contactos_coordinacion_traslado`; V52-V53 documentos de vuelo; V54 `verificaciones_correo` y validación internacional; V55 rutas; V56-V58 índices, licencia y clasificación; V59 `politicas_habilitacion`, `decisiones_habilitacion`, `consultas_externas_habilitacion` y ciclo documental; V60 endurece restricciones e inmutabilidad. Las definiciones exactas están en `backend-java/src/main/resources/db/migration/V48__...sql` a `V60__...sql`.

## Inventario V60 conciliado

| Clase | Cantidad | Fuente |
|---|---:|---|
| Negocio | 45 | `docs/evidencia-i57/inventario-tablas-e2e-v60.json` |
| Infraestructura | 1 | `flyway_schema_history` |
| Total físico | 46 | inventario E2E V60 |

Las 45 tablas de negocio son: `activaciones_cuenta`, `aeronaves`, `aeropuertos`, `bitacora_vuelos`, `bloqueos_documento_vuelo`, `clasificaciones_tripulacion`, `consultas_externas_habilitacion`, `contactos_coordinacion_traslado`, `coordinaciones_aa2000`, `correos_electronicos`, `decisiones_habilitacion`, `documentos_habilitacion`, `documentos_vuelo`, `estados_solicitud_sanitaria`, `estados_vuelo`, `eventos_auditoria`, `habilitaciones_profesionales`, `informacion_hangar`, `informacion_medica_vuelo`, `informes_finales_vuelo`, `instantaneas_clima`, `localidades`, `motivos_cancelacion`, `negociaciones_horario_vuelo`, `notificaciones`, `obligaciones_informe_final`, `pacientes`, `perfiles_comandante`, `personas`, `politicas_habilitacion`, `prioridades_vuelo`, `provincias`, `roles`, `roles_tripulacion`, `rutas_vuelo`, `telefonos`, `tipos_documento`, `tipos_vuelo`, `usuarios`, `usuarios_roles`, `verificaciones_correo`, `versiones_documento_vuelo`, `vuelos`, `vuelos_sanitarios`, `vuelos_tripulantes`.
