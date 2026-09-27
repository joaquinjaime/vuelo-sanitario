# Diccionario de datos

Fuente: catálogos `sys.tables`, `sys.columns`, `sys.key_constraints`, `sys.foreign_keys`, `sys.check_constraints`, `sys.default_constraints` y `sys.indexes` de SQL Server, posterior a Flyway V10. Son 25 tablas de negocio; `flyway_schema_history` y `sysdiagrams` son técnicas.

| Tabla | Propósito | Clave y relaciones principales |
|---|---|---|
| `personas` | Identidad compartida | PK `id`; base de usuarios y pacientes |
| `usuarios` | Cuentas y perfiles operativos | PK `id`; UQ nombre/correo/persona; FK persona |
| `roles`, `usuarios_roles` | Autorización | N:M usuario–rol; PK compuesta en la tabla puente |
| `pacientes` | Datos clínicos del paciente | PK `id`; UQ/FK `persona_id` |
| `aeronaves`, `aeropuertos` | Catálogos operativos | PK `id`; códigos y matrícula únicos |
| `estados_vuelo`, `prioridades_vuelo`, `roles_tripulacion`, `tipos_documento` | Catálogos de dominio | PK `id`; código único |
| `vuelos` | Agregado principal | PK `id`; FKs a paciente, estado, prioridad, aeronave, aeropuertos y usuarios; UQ `codigo` |
| `vuelos_tripulantes` | Asignación de tripulación | PK `id`; FKs a vuelo, usuario y rol; UQ de la asignación |
| `informacion_medica_vuelo` | Información clínica del vuelo | PK `id`; UQ/FK `vuelo_id` |
| `documentos_vuelo`, `versiones_documento_vuelo` | Documentación y sus versiones | FKs a vuelo/tipo y documento/usuario; unicidad de versión actual |
| `rutas_vuelo`, `informacion_hangar`, `coordinaciones_aa2000` | Planificación versionada | FK a vuelo; restricciones de versión y actual vigente |
| `informes_finales_vuelo` | Informes finales versionados | FK a vuelo y creador; UQ por vuelo/versión |
| `obligaciones_informe_final` | Presentación, prórroga, devolución y aprobación | FKs a vuelo, informe y usuarios; checks de fechas/estado; UQ de obligación actual |
| `instantaneas_clima` | Evidencia meteorológica | FKs a vuelo y consultante |
| `notificaciones` | Avisos de usuarios | FKs a usuario y, opcionalmente, vuelo |
| `eventos_auditoria`, `bitacora_vuelos` | Trazabilidad | FKs a vuelo y usuario; JSON validado donde corresponde |

Las columnas físicas de negocio usan español en `snake_case`. Las columnas de control relevantes son `extrema_urgencia`, `fecha_limite_traslado`, `prorroga_utilizada`, `estado`, `es_actual`, `fecha_creacion` y `version_fila`.

Índices de consulta relevantes: disponibilidad de aeronave/comandante por rango de fechas (`vuelos`), cola de extrema urgencia (`vuelos`), obligaciones por comandante/estado/vencimiento, documentos activos por vuelo, notificaciones no leídas y auditoría por vuelo/fecha.
