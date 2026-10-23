# Diccionario de datos

Fuente: catálogos `sys.tables`, `sys.columns`, `sys.key_constraints`, `sys.foreign_keys`, `sys.check_constraints`, `sys.default_constraints` y `sys.indexes` de SQL Server, posterior a Flyway V32. `flyway_schema_history` y `sysdiagrams` son técnicas.

| Tabla | Propósito | Clave y relaciones principales |
|---|---|---|
| `personas` | Identidad compartida | PK `id`; base de usuarios y pacientes |
| `perfiles_comandante` | Información profesional de comandante | PK/FK `persona_id`; licencia alfanumérica canónica y única |
| `usuarios` | Cuentas y perfiles operativos | PK `id`; UQ nombre/correo/persona; FK persona |
| `roles`, `usuarios_roles` | Autorización | N:M usuario–rol; PK compuesta en la tabla puente |
| `pacientes` | Datos clínicos del paciente | PK `id`; UQ/FK `persona_id` |
| `aeronaves`, `aeropuertos` | Catálogos operativos | PK `id`; códigos y matrícula únicos |
| `estados_vuelo`, `prioridades_vuelo`, `roles_tripulacion`, `tipos_documento` | Catálogos de dominio | PK `id`; código único |
| `vuelos` | Agregado principal | PK `id`; FKs a paciente, estado, prioridad, aeronave, aeropuertos y usuarios; UQ `codigo` |
| `vuelos_tripulantes` | Asignación de tripulación con historial (V45) | PK `id`; FKs a vuelo, usuario, rol, asignador y usuario de baja; `fecha_baja`/`id_usuario_baja`/`motivo_baja` (RETIRO, REEMPLAZO, CAMBIO_COMANDANTE) con CHECK de coherencia; índice único filtrado `(id_vuelos, id_usuarios) WHERE fecha_baja IS NULL` |
| `informacion_medica_vuelo` | Información clínica del vuelo | PK `id`; UQ/FK `vuelo_id` |
| `documentos_vuelo`, `versiones_documento_vuelo` | Documento lógico PDF y sus versiones físicas | FKs a vuelo/tipo y documento/usuario; UQ por número y un único índice filtrado de versión actual |
| `rutas_vuelo`, `informacion_hangar`, `coordinaciones_aa2000` | Planificación versionada | FK a vuelo; restricciones de versión y actual vigente |
| `informes_finales_vuelo` | Informes finales versionados | FK a vuelo y creador; UQ por vuelo/versión |
| `obligaciones_informe_final` | Presentación, prórroga, devolución y aprobación | FKs a vuelo, informe y usuarios; checks de fechas/estado; UQ de obligación actual |
| `instantaneas_clima` | Evidencia meteorológica | FKs a vuelo y consultante |
| `notificaciones` | Avisos de usuarios | FKs a usuario y, opcionalmente, vuelo |
| `eventos_auditoria`, `bitacora_vuelos` | Trazabilidad | FKs a vuelo y usuario; JSON validado donde corresponde. `eventos_auditoria` es de sólo inserción desde V46 (`tr_eventos_auditoria_inmutable` rechaza UPDATE y DELETE) y `fecha_ocurrencia` es DATETIME2 en UTC |

Las columnas físicas de negocio usan español en `snake_case`. Las columnas de control relevantes son `extrema_urgencia`, `fecha_limite_traslado`, `prorroga_utilizada`, `estado`, `es_actual`, `fecha_creacion` y `version_fila`.

`documentos_vuelo_texto_legacy` fue un archivo histórico introducido por V22 para preservar textos previos al modelo exclusivamente PDF. V32 lo retiró después de comprobar que estuviera vacío; no forma parte del modelo vigente.

Índices de consulta relevantes: disponibilidad de aeronave/comandante por rango de fechas (`vuelos`), cola de extrema urgencia (`vuelos`), obligaciones por comandante/estado/vencimiento, documentos activos por vuelo, notificaciones no leídas y auditoría por vuelo/fecha.
# Extensión V11: identidad y activación

`personas` representa la identidad; `usuarios` representa su acceso al sistema. Los contactos ya no pertenecen a la cuenta: `correos_electronicos` y `telefonos` son relaciones 1:N de Persona y poseen un único principal por persona mediante índices filtrados. El correo no tiene unicidad global: una dirección puede ser compartida cuando el caso de negocio lo requiera.

`activaciones_cuenta` guarda únicamente el hash BCrypt del código aleatorio. Cada código dura exactamente 24 horas, se consume al activarse y se invalida al regenerarse. `usuarios.estado_cuenta` toma `PENDIENTE_ACTIVACION`, `ACTIVO` o `DESACTIVADO`; `debe_cambiar_contrasena` marca una contraseña temporal.


# Extensión V46: consulta de auditoría

`eventos_auditoria` no cambia de estructura. V46 agrega los índices `idx_eventos_auditoria_fecha` (fecha, id), `idx_eventos_auditoria_vuelo_fecha` (vuelo, fecha, id), `idx_eventos_auditoria_actor_fecha` (usuario, fecha, id), `idx_eventos_auditoria_entidad_fecha` (tipo, entidad, fecha) e `idx_eventos_auditoria_tipo_operacion` (tipo, operación) para el listado paginado con orden estable y filtros combinables, y el trigger `tr_eventos_auditoria_inmutable`. `fecha_ocurrencia` se guarda en UTC (el backend la toma del reloj de negocio y la convierte); los eventos anteriores a V46 se interpretan también como UTC porque el backend y SQL Server corren en UTC en Docker. Ningún evento existente se modificó.

# Extensión V47: unicidad de identidad y baja administrativa

`personas.dni` tiene el índice único filtrado `uq_personas_dni` (los NULL no compiten) y `usuarios.nombre_usuario` el índice único filtrado `uq_usuarios_nombre_usuario` (las cuentas pendientes no tienen nombre): antes sólo la aplicación verificaba ambas unicidades. El DNI se guarda canónico (sólo dígitos) tanto para cuentas como para pacientes. `usuarios` agrega `id_usuario_baja` (FK a `usuarios`, índice filtrado `idx_usuarios_id_usuario_baja`) y `motivo_baja` (NVARCHAR(500)): quién dio de baja la cuenta y por qué; se limpian al reactivarla y el historial permanece en `eventos_auditoria`. V47 rellenó esas columnas para las bajas anteriores sólo cuando existía un evento `USUARIO_DESACTIVADO` con responsable. `fecha_baja` de las bajas nuevas es hora civil de negocio (las anteriores se escribieron en la zona de la JVM). La migración se detiene con un mensaje explícito si encuentra DNI o nombres de usuario duplicados; no fusiona identidades.
