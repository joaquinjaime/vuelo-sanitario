# Inventario físico posterior a V32

Generado el 2026-10-14 directamente desde `sys.tables` y `sys.columns` de la base `vuelos_sanitarios_e2e` tras Flyway V32. Incluye las 37 tablas de aplicación del esquema `dbo`; se excluyen las tablas de infraestructura `flyway_schema_history` y `sysdiagrams`. `documentos_vuelo_texto_legacy`, creado por V22 como archivo de textos pre-PDF, fue retirado por V32 al estar vacío.

| Tabla | Columnas en orden físico |
| --- | --- |
| activaciones_cuenta | token_hash, fecha_creacion, fecha_expiracion, fecha_utilizacion, id_activaciones_cuenta, id_usuarios, id_usuario_administrador_creador |
| aeronaves | matricula, modelo, tipo_aeronave, capacidad_pacientes, capacidad_tripulacion, equipamiento_medico, esta_activa, fecha_creacion, id_aeronaves, id_aeropuertos |
| aeropuertos | codigo_oaci, codigo_iata, nombre_aeropuerto, ciudad, provincia, pais, latitud, longitud, esta_activo, codigo_oficial, tipo_aeropuerto, id_aeropuertos, id_provincias, id_localidades |
| bitacora_vuelos | id_bitacora_vuelos, campo, valor_anterior, valor_nuevo, fecha_cambio, id_vuelos, id_usuarios |
| bloqueos_documento_vuelo | id_bloqueos_documento_vuelo, id_documentos_vuelo, id_usuario_propietario, fecha_adquisicion, fecha_vencimiento |
| coordinaciones_aa2000 | version, es_version_actual, fecha_slot, contacto_aa2000, estado_autorizacion, observaciones_coordinacion, fecha_creacion, id_coordinaciones_aa2000, id_vuelos, id_usuario_registrador |
| correos_electronicos | direccion, tipo_correo_electronico, es_principal, fecha_creacion, fecha_actualizacion, id_correos_electronicos, id_personas |
| documentos_vuelo | nombre_documento, esta_activo, row_version, fecha_creacion, id_documentos_vuelo, id_vuelos, id_tipos_documento |
| estados_solicitud_sanitaria | codigo_estado_solicitud, nombre_estado_solicitud, orden, id_estados_solicitud_sanitaria |
| estados_vuelo | codigo_estado_vuelo, nombre_estado_vuelo, orden, id_estados_vuelo |
| eventos_auditoria | id_eventos_auditoria, tipo_entidad, operacion, valores_anteriores, valores_nuevos, fecha_ocurrencia, id_vuelos, id_usuario_actor, entidad_id |
| informacion_hangar | version, es_version_actual, combustible_litros, preparacion_completa, observaciones_hangar, fecha_creacion, id_informacion_hangar, id_vuelos, id_usuario_registrador |
| informacion_medica_vuelo | diagnostico, condicion_medica, requiere_equipamiento_especial, observaciones_medicas, fecha_creacion, fecha_actualizacion, id_informacion_medica_vuelo, id_vuelos |
| informes_finales_vuelo | version, es_version_actual, horas_vuelo, combustible_consumido_litros, incidentes, resumen, fecha_creacion, id_informes_finales_vuelo, id_vuelos, id_usuario_creador |
| instantaneas_clima | fecha_registro, observaciones_clima, condiciones, favorable, id_instantaneas_clima, id_vuelos, id_usuario_registrador |
| localidades | codigo_oficial, nombre_localidad, esta_activa, id_localidades, id_provincias |
| motivos_cancelacion | codigo_motivo_cancelacion, nombre_motivo_cancelacion, descripcion_motivo_cancelacion, categoria, esta_activo, orden, id_motivos_cancelacion |
| negociaciones_horario_vuelo | tipo_negociacion, fecha_hora_propuesta, motivo_negociacion, fecha_ocurrencia, fecha_hora_llegada_propuesta, id_negociaciones_horario_vuelo, id_vuelos, id_usuario_actor |
| notificaciones | tipo_notificacion, mensaje, leido, fecha_creacion, id_notificaciones, id_usuarios, id_vuelos |
| obligaciones_informe_final | numero_obligacion, estado_obligacion, vencimiento_original, vencimiento, prorroga_utilizada, fecha_prorroga, fecha_presentacion, fecha_devolucion, motivo_devolucion, fecha_aprobacion, es_actual, version_fila, fecha_creacion, id_obligaciones_informe_final, id_vuelos, id_usuario_comandante, id_informes_finales_vuelo, id_usuario_devolvedor, id_usuario_aprobador |
| pacientes | fecha_creacion, fecha_actualizacion, id_pacientes, id_personas |
| perfiles_comandante | numero_licencia, numero_licencia_normalizada, fecha_creacion, fecha_actualizacion, id_personas, id_provincias, id_perfiles_comandante |
| personas | nombre_persona, apellido_persona, dni, fecha_nacimiento, fecha_creacion, fecha_actualizacion, id_personas |
| prioridades_vuelo | codigo_prioridad_vuelo, nombre_prioridad_vuelo, esta_activa, orden, id_prioridades_vuelo |
| provincias | codigo_oficial, nombre_provincia, esta_activa, id_provincias |
| roles | codigo_rol, nombre_rol, descripcion_rol, esta_activo, fecha_creacion, id_roles |
| roles_tripulacion | codigo_rol_tripulacion, nombre_rol_tripulacion, id_roles_tripulacion |
| rutas_vuelo | version, es_version_actual, altitud_pies, distancia_nm, tiempo_estimado_minutos, observaciones_ruta, fecha_creacion, id_rutas_vuelo, id_vuelos, id_usuario_creador |
| telefonos | numero, tipo_telefono, es_principal, fecha_creacion, fecha_actualizacion, id_telefonos, id_personas |
| tipos_documento | codigo_tipo_documento, nombre_tipo_documento, id_tipos_documento |
| tipos_vuelo | codigo_tipo_vuelo, nombre_tipo_vuelo, esta_activo, id_tipos_vuelo |
| usuarios | nombre_usuario, hash_contrasena, esta_activo, fecha_creacion, fecha_actualizacion, estado_cuenta, debe_cambiar_contrasena, version_credenciales, fecha_baja, id_usuarios, id_personas |
| usuarios_roles | fecha_asignacion, id_usuarios, id_roles, id_usuarios_roles |
| versiones_documento_vuelo | numero_version, es_version_actual, nombre_archivo_original, ubicacion_almacenamiento, tamanio_bytes, fecha_creacion, id_versiones_documento_vuelo, id_documentos_vuelo, id_usuario_creador |
| vuelos | codigo_vuelo, motivo_vuelo, fecha_planificada_salida, fecha_planificada_llegada, fecha_salida_real, fecha_llegada_real, fecha_creacion, fecha_actualizacion, fecha_cancelacion, motivo_cancelacion_personalizado, id_vuelos, id_aeronaves, id_usuario_comandante, id_aeropuerto_origen, id_aeropuerto_destino, id_usuario_cancelador, id_motivos_cancelacion, id_tipos_vuelo, id_estados_vuelo, id_usuario_creador |
| vuelos_sanitarios | fecha_solicitada, extrema_urgencia, justificacion_extrema_urgencia, fecha_limite_traslado, origen_solicitado_legacy, destino_solicitado_legacy, fecha_evaluacion, motivo_rechazo, id_vuelos, id_pacientes, id_usuario_solicitante, id_prioridades_vuelo, id_localidad_origen, id_localidad_destino, id_estados_solicitud_sanitaria, id_usuario_evaluador, id_vuelos_sanitarios |
| vuelos_tripulantes | fecha_creacion, id_vuelos_tripulantes, id_vuelos, id_usuarios, id_roles_tripulacion, id_usuario_asignador |

Los campos `*_legacy` son la única ambigüedad semántica deliberada detectada: conservan datos históricos de texto de origen y destino. No se renombraron ni eliminaron porque tienen propósito de compatibilidad explícito; un cambio requeriría una decisión funcional y una migración de datos, no una corrección de nomenclatura.
