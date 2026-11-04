# Catálogo completo de relaciones, restricciones, índices y triggers

[← Informe principal](../INFORME_COMPLETO_BASE_DATOS.md)

Volcado automático del catálogo de SQL Server de la base de pruebas (Flyway V62). Complementa la sección G/H de cada tabla.

## 1. Claves foráneas (110)

| Tabla hija | Columna | → Tabla padre | Columna padre | Borrado |
|---|---|---|---|---|
| `activaciones_cuenta` | `id_usuario_administrador_creador` | `usuarios` | `id_usuarios` | NO ACTION |
| `activaciones_cuenta` | `id_usuarios` | `usuarios` | `id_usuarios` | NO ACTION |
| `aeronaves` | `id_aeropuertos` | `aeropuertos` | `id_aeropuertos` | NO ACTION |
| `aeropuertos` | `id_localidades` | `localidades` | `id_localidades` | NO ACTION |
| `aeropuertos` | `id_provincias` | `provincias` | `id_provincias` | NO ACTION |
| `bitacora_vuelos` | `id_entrada_corregida` | `bitacora_vuelos` | `id_bitacora_vuelos` | NO ACTION |
| `bitacora_vuelos` | `id_usuarios` | `usuarios` | `id_usuarios` | NO ACTION |
| `bitacora_vuelos` | `id_vuelos` | `vuelos` | `id_vuelos` | **CASCADE** |
| `bloqueos_documento_vuelo` | `id_documentos_vuelo` | `documentos_vuelo` | `id_documentos_vuelo` | NO ACTION |
| `bloqueos_documento_vuelo` | `id_usuario_propietario` | `usuarios` | `id_usuarios` | NO ACTION |
| `clasificaciones_tripulacion` | `id_usuario_clasificador` | `usuarios` | `id_usuarios` | NO ACTION |
| `clasificaciones_tripulacion` | `id_roles_tripulacion` | `roles_tripulacion` | `id_roles_tripulacion` | NO ACTION |
| `clasificaciones_tripulacion` | `id_usuarios` | `usuarios` | `id_usuarios` | NO ACTION |
| `clasificaciones_tripulacion` | `id_usuario_baja` | `usuarios` | `id_usuarios` | NO ACTION |
| `consultas_externas_habilitacion` | `id_documentos_habilitacion` | `documentos_habilitacion` | `id_documentos_habilitacion` | NO ACTION |
| `consultas_externas_habilitacion` | `id_habilitaciones_profesionales` | `habilitaciones_profesionales` | `id_habilitaciones_profesionales` | NO ACTION |
| `consultas_externas_habilitacion` | `id_usuario_responsable` | `usuarios` | `id_usuarios` | NO ACTION |
| `contactos_coordinacion_traslado` | `id_usuario_alta` | `usuarios` | `id_usuarios` | NO ACTION |
| `contactos_coordinacion_traslado` | `id_usuario_baja` | `usuarios` | `id_usuarios` | NO ACTION |
| `contactos_coordinacion_traslado` | `id_vuelos` | `vuelos_sanitarios` | `id_vuelos` | NO ACTION |
| `coordinaciones_aa2000` | `id_aeropuerto_gestion` | `aeropuertos` | `id_aeropuertos` | NO ACTION |
| `coordinaciones_aa2000` | `id_usuario_registrador` | `usuarios` | `id_usuarios` | NO ACTION |
| `coordinaciones_aa2000` | `id_vuelos` | `vuelos` | `id_vuelos` | **CASCADE** |
| `correos_electronicos` | `id_personas` | `personas` | `id_personas` | NO ACTION |
| `correos_electronicos` | `id_usuario_baja` | `usuarios` | `id_usuarios` | NO ACTION |
| `decisiones_habilitacion` | `id_documentos_habilitacion` | `documentos_habilitacion` | `id_documentos_habilitacion` | NO ACTION |
| `decisiones_habilitacion` | `id_habilitaciones_profesionales` | `habilitaciones_profesionales` | `id_habilitaciones_profesionales` | NO ACTION |
| `decisiones_habilitacion` | `id_usuarios` | `usuarios` | `id_usuarios` | NO ACTION |
| `documentos_habilitacion` | `id_habilitaciones_profesionales` | `habilitaciones_profesionales` | `id_habilitaciones_profesionales` | NO ACTION |
| `documentos_habilitacion` | `id_usuario_baja` | `usuarios` | `id_usuarios` | NO ACTION |
| `documentos_habilitacion` | `id_usuario_cargador` | `usuarios` | `id_usuarios` | NO ACTION |
| `documentos_habilitacion` | `id_documento_reemplazado` | `documentos_habilitacion` | `id_documentos_habilitacion` | NO ACTION |
| `documentos_habilitacion` | `id_usuario_regularizacion` | `usuarios` | `id_usuarios` | NO ACTION |
| `documentos_vuelo` | `id_tipos_documento` | `tipos_documento` | `id_tipos_documento` | NO ACTION |
| `documentos_vuelo` | `id_vuelos` | `vuelos` | `id_vuelos` | **CASCADE** |
| `documentos_vuelo` | `id_usuario_baja` | `usuarios` | `id_usuarios` | NO ACTION |
| `eventos_auditoria` | `id_usuario_actor` | `usuarios` | `id_usuarios` | NO ACTION |
| `eventos_auditoria` | `id_vuelos` | `vuelos` | `id_vuelos` | NO ACTION |
| `habilitaciones_profesionales` | `id_personas` | `personas` | `id_personas` | NO ACTION |
| `habilitaciones_profesionales` | `id_roles_tripulacion` | `roles_tripulacion` | `id_roles_tripulacion` | NO ACTION |
| `habilitaciones_profesionales` | `id_usuario_verificador` | `usuarios` | `id_usuarios` | NO ACTION |
| `habilitaciones_profesionales` | `id_provincias_jurisdiccion` | `provincias` | `id_provincias` | NO ACTION |
| `habilitaciones_profesionales` | `id_habilitacion_renovada` | `habilitaciones_profesionales` | `id_habilitaciones_profesionales` | NO ACTION |
| `informacion_hangar` | `id_aeronave_contexto` | `aeronaves` | `id_aeronaves` | NO ACTION |
| `informacion_hangar` | `id_comandante_contexto` | `usuarios` | `id_usuarios` | NO ACTION |
| `informacion_hangar` | `id_origen_contexto` | `aeropuertos` | `id_aeropuertos` | NO ACTION |
| `informacion_hangar` | `id_usuario_registrador` | `usuarios` | `id_usuarios` | NO ACTION |
| `informacion_hangar` | `id_vuelos` | `vuelos` | `id_vuelos` | **CASCADE** |
| `informacion_medica_vuelo` | `id_vuelos` | `vuelos` | `id_vuelos` | **CASCADE** |
| `informes_finales_vuelo` | `id_usuario_creador` | `usuarios` | `id_usuarios` | NO ACTION |
| `informes_finales_vuelo` | `id_vuelos` | `vuelos` | `id_vuelos` | **CASCADE** |
| `informes_finales_vuelo` | `id_usuario_revisor` | `usuarios` | `id_usuarios` | NO ACTION |
| `instantaneas_clima` | `id_usuario_registrador` | `usuarios` | `id_usuarios` | NO ACTION |
| `instantaneas_clima` | `id_vuelos` | `vuelos` | `id_vuelos` | **CASCADE** |
| `localidades` | `id_provincias` | `provincias` | `id_provincias` | NO ACTION |
| `negociaciones_horario_vuelo` | `id_usuario_actor` | `usuarios` | `id_usuarios` | NO ACTION |
| `negociaciones_horario_vuelo` | `id_vuelos` | `vuelos` | `id_vuelos` | NO ACTION |
| `negociaciones_horario_vuelo` | `id_negociacion_respondida` | `negociaciones_horario_vuelo` | `id_negociaciones_horario_vuelo` | NO ACTION |
| `notificaciones` | `id_usuarios` | `usuarios` | `id_usuarios` | **CASCADE** |
| `notificaciones` | `id_vuelos` | `vuelos` | `id_vuelos` | **CASCADE** |
| `obligaciones_informe_final` | `id_usuario_finalizador` | `usuarios` | `id_usuarios` | NO ACTION |
| `obligaciones_informe_final` | `id_informes_finales_vuelo` | `informes_finales_vuelo` | `id_informes_finales_vuelo` | NO ACTION |
| `obligaciones_informe_final` | `id_usuario_aprobador` | `usuarios` | `id_usuarios` | NO ACTION |
| `obligaciones_informe_final` | `id_usuario_comandante` | `usuarios` | `id_usuarios` | NO ACTION |
| `obligaciones_informe_final` | `id_usuario_devolvedor` | `usuarios` | `id_usuarios` | NO ACTION |
| `obligaciones_informe_final` | `id_vuelos` | `vuelos` | `id_vuelos` | NO ACTION |
| `pacientes` | `id_personas` | `personas` | `id_personas` | NO ACTION |
| `perfiles_comandante` | `id_personas` | `personas` | `id_personas` | NO ACTION |
| `perfiles_comandante` | `id_provincias` | `provincias` | `id_provincias` | NO ACTION |
| `politicas_habilitacion` | `id_roles_tripulacion` | `roles_tripulacion` | `id_roles_tripulacion` | NO ACTION |
| `politicas_habilitacion` | `id_tipos_vuelo` | `tipos_vuelo` | `id_tipos_vuelo` | NO ACTION |
| `politicas_habilitacion` | `id_usuario_alta` | `usuarios` | `id_usuarios` | NO ACTION |
| `politicas_habilitacion` | `id_usuario_baja` | `usuarios` | `id_usuarios` | NO ACTION |
| `rutas_vuelo` | `id_aeropuerto_alternativo` | `aeropuertos` | `id_aeropuertos` | NO ACTION |
| `rutas_vuelo` | `id_usuario_creador` | `usuarios` | `id_usuarios` | NO ACTION |
| `rutas_vuelo` | `id_vuelos` | `vuelos` | `id_vuelos` | **CASCADE** |
| `rutas_vuelo` | `id_usuario_presenta` | `usuarios` | `id_usuarios` | NO ACTION |
| `rutas_vuelo` | `id_usuario_revisor` | `usuarios` | `id_usuarios` | NO ACTION |
| `telefonos` | `id_personas` | `personas` | `id_personas` | NO ACTION |
| `telefonos` | `id_usuario_baja` | `usuarios` | `id_usuarios` | NO ACTION |
| `usuarios` | `id_personas` | `personas` | `id_personas` | NO ACTION |
| `usuarios` | `id_usuario_baja` | `usuarios` | `id_usuarios` | NO ACTION |
| `usuarios_roles` | `id_roles` | `roles` | `id_roles` | **CASCADE** |
| `usuarios_roles` | `id_usuarios` | `usuarios` | `id_usuarios` | **CASCADE** |
| `verificaciones_correo` | `id_correos_electronicos` | `correos_electronicos` | `id_correos_electronicos` | NO ACTION |
| `verificaciones_correo` | `id_usuario_solicitante` | `usuarios` | `id_usuarios` | NO ACTION |
| `versiones_documento_vuelo` | `id_documentos_vuelo` | `documentos_vuelo` | `id_documentos_vuelo` | **CASCADE** |
| `versiones_documento_vuelo` | `id_usuario_creador` | `usuarios` | `id_usuarios` | NO ACTION |
| `vuelos` | `id_aeronaves` | `aeronaves` | `id_aeronaves` | NO ACTION |
| `vuelos` | `id_aeropuerto_destino` | `aeropuertos` | `id_aeropuertos` | NO ACTION |
| `vuelos` | `id_aeropuerto_origen` | `aeropuertos` | `id_aeropuertos` | NO ACTION |
| `vuelos` | `id_estados_vuelo` | `estados_vuelo` | `id_estados_vuelo` | NO ACTION |
| `vuelos` | `id_motivos_cancelacion` | `motivos_cancelacion` | `id_motivos_cancelacion` | NO ACTION |
| `vuelos` | `id_tipos_vuelo` | `tipos_vuelo` | `id_tipos_vuelo` | NO ACTION |
| `vuelos` | `id_usuario_cancelador` | `usuarios` | `id_usuarios` | NO ACTION |
| `vuelos` | `id_usuario_comandante` | `usuarios` | `id_usuarios` | NO ACTION |
| `vuelos` | `id_usuario_creador` | `usuarios` | `id_usuarios` | NO ACTION |
| `vuelos_sanitarios` | `id_estados_solicitud_sanitaria` | `estados_solicitud_sanitaria` | `id_estados_solicitud_sanitaria` | NO ACTION |
| `vuelos_sanitarios` | `id_localidad_destino` | `localidades` | `id_localidades` | NO ACTION |
| `vuelos_sanitarios` | `id_localidad_origen` | `localidades` | `id_localidades` | NO ACTION |
| `vuelos_sanitarios` | `id_pacientes` | `pacientes` | `id_pacientes` | NO ACTION |
| `vuelos_sanitarios` | `id_prioridades_vuelo` | `prioridades_vuelo` | `id_prioridades_vuelo` | NO ACTION |
| `vuelos_sanitarios` | `id_usuario_evaluador` | `usuarios` | `id_usuarios` | NO ACTION |
| `vuelos_sanitarios` | `id_usuario_solicitante` | `usuarios` | `id_usuarios` | NO ACTION |
| `vuelos_sanitarios` | `id_vuelos` | `vuelos` | `id_vuelos` | **CASCADE** |
| `vuelos_tripulantes` | `id_roles_tripulacion` | `roles_tripulacion` | `id_roles_tripulacion` | NO ACTION |
| `vuelos_tripulantes` | `id_usuario_asignador` | `usuarios` | `id_usuarios` | NO ACTION |
| `vuelos_tripulantes` | `id_usuarios` | `usuarios` | `id_usuarios` | NO ACTION |
| `vuelos_tripulantes` | `id_vuelos` | `vuelos` | `id_vuelos` | **CASCADE** |
| `vuelos_tripulantes` | `id_usuario_baja` | `usuarios` | `id_usuarios` | NO ACTION |

## 2. Triggers (11)

| Tabla | Trigger | Qué impide |
|---|---|---|
| `bitacora_vuelos` | `tr_bitacora_operativa_inmutable` | Impide UPDATE y DELETE de los acontecimientos operativos de la bitácora (error 51001). |
| `consultas_externas_habilitacion` | `tr_consultas_externas_inmutable` | Impide cualquier UPDATE o DELETE de las consultas externas (error 51061). |
| `decisiones_habilitacion` | `tr_decisiones_habilitacion_inmutable` | Impide cualquier UPDATE o DELETE de las decisiones sobre habilitaciones (error 51060). |
| `documentos_habilitacion` | `tr_documentos_habilitacion_integridad` | Prohíbe DELETE y cambios de archivo, habilitación, origen, propósito, huella registrada y baja registrada (errores 51065–51066). |
| `eventos_auditoria` | `tr_eventos_auditoria_inmutable` | Impide UPDATE y DELETE de eventos de auditoría (error 51046). |
| `obligaciones_informe_final` | `trg_obligaciones_informe_validar_aprobacion` | Una obligación sólo pasa a APROBADO con el vuelo FINALIZADO/COMPLETADO y el informe enlazado aprobado (error 51044). |
| `politicas_habilitacion` | `tr_politicas_habilitacion_proteccion` | No se eliminan políticas, no cambia su definición y una baja no se revierte (errores 51062–51064). |
| `vuelos` | `trg_vuelos_validar_cierre` | Transiciones terminales del vuelo: COMPLETADO/CANCELADO inmutables; EN_CURSO y FINALIZADO sólo desde su estado previo con fecha real; COMPLETADO exige informe aprobado (error 51043). |
| `vuelos` | `trg_vuelos_validar_ciclo_vida` | Coherencia de la cancelación: CANCELADO exige fecha, actor y motivo válido; otros estados no pueden tenerlos; no se cancela desde EN_CURSO/FINALIZADO/COMPLETADO (error 51000). |
| `vuelos` | `trg_vuelos_coherencia_sanitaria` | Un vuelo sanitario sólo avanza con la solicitud APROBADA y sólo está CANCELADO con la solicitud CANCELADA (error 51046). |
| `vuelos_sanitarios` | `trg_vuelos_sanitarios_validar_estado` | Máquina de estados de la solicitud sanitaria (error 51045). |

## 3. Restricciones CHECK (62)

| Tabla | Restricción | Definición |
|---|---|---|
| `aeronaves` | `ck_aeronaves_1362103893` | `(capacidad_pacientes>(0) AND capacidad_tripulacion>(0))` |
| `bitacora_vuelos` | `CK_bitacora_operativa` | `(origen_acontecimiento IS NULL OR (origen_acontecimiento=N'AUTOMATICO' OR origen_acontecimiento=N'MANUAL') AND tipo_acontecimiento IS NOT NULL AND descripcion_operativa IS NOT NULL AND fecha_acontecimiento IS NOT NULL AND fecha_registro_operativo IS NOT NULL AND id_usuarios IS NOT NULL AND importancia IS NOT NULL AND (importancia=N'IMPORTANTE' OR importancia=N'NORMAL') AND (id_entrada_corregida IS NULL AND motivo_correccion IS NULL OR id_entrada_corregida IS NOT NULL AND motivo_correccion IS NOT NULL AND origen_acontecimiento=N'MANUAL'))` |
| `bloqueos_documento_vuelo` | `ck_bloqueos_documento_vuelo_vencimiento` | `(fecha_vencimiento>fecha_adquisicion)` |
| `clasificaciones_tripulacion` | `ck_clasificacion_baja` | `(fecha_baja IS NULL AND id_usuario_baja IS NULL AND motivo_baja IS NULL OR fecha_baja IS NOT NULL AND id_usuario_baja IS NOT NULL AND motivo_baja IS NOT NULL AND len(ltrim(rtrim(motivo_baja)))>(0))` |
| `consultas_externas_habilitacion` | `ck_consulta_organismo` | `(organismo='OTRO' OR organismo='REFEPS_SISA' OR organismo='ANAC')` |
| `consultas_externas_habilitacion` | `ck_consulta_resultado` | `(resultado='NO_CONCLUYENTE' OR resultado='NO_ENCONTRADO' OR resultado='NO_COINCIDE' OR resultado='COINCIDE')` |
| `contactos_coordinacion_traslado` | `ck_contactos_coordinacion_traslado_baja` | `(fecha_baja IS NULL AND id_usuario_baja IS NULL AND motivo_baja IS NULL OR fecha_baja IS NOT NULL AND id_usuario_baja IS NOT NULL AND es_principal=(0) AND motivo_baja=N'RETIRO')` |
| `contactos_coordinacion_traslado` | `ck_contactos_coordinacion_traslado_nombre` | `(relacion_contacto=N'PACIENTE' OR len(ltrim(rtrim(isnull(nombre_contacto,N''))))>(0))` |
| `contactos_coordinacion_traslado` | `ck_contactos_coordinacion_traslado_relacion` | `(relacion_contacto=N'OTRO' OR relacion_contacto=N'ESTABLECIMIENTO_DESTINO' OR relacion_contacto=N'ESTABLECIMIENTO_ORIGEN' OR relacion_contacto=N'FAMILIAR_RESPONSABLE' OR relacion_contacto=N'PACIENTE')` |
| `contactos_coordinacion_traslado` | `ck_contactos_coordinacion_traslado_telefono` | `(len(telefono_normalizado)>=(6) AND len(telefono_normalizado)<=(16))` |
| `contactos_coordinacion_traslado` | `ck_contactos_coordinacion_traslado_validacion_internacional` | `(codigo_pais IS NULL OR len(codigo_pais)=(2) AND NOT (codigo_pais) collate Latin1_General_BIN2 like N'%^A-Z%' AND telefono_normalizado like N'+1-9%' AND NOT substring(telefono_normalizado,(2),(30)) like N'%^0-9%' AND (len(telefono_normalizado)>=(8) AND len(telefono_normalizado)<=(16)))` |
| `coordinaciones_aa2000` | `ck_coordinacion_estado_seguimiento` | `(estado_autorizacion=N'CANCELADO' OR estado_autorizacion=N'RECHAZADO' OR estado_autorizacion=N'CONFIRMADO' OR estado_autorizacion=N'EN_SEGUIMIENTO' OR estado_autorizacion=N'PENDIENTE')` |
| `coordinaciones_aa2000` | `ck_coordinaciones_aa2000_1458104235` | `(version>(0))` |
| `correos_electronicos` | `ck_correos_electronicos_baja` | `(fecha_baja IS NULL AND id_usuario_baja IS NULL AND motivo_baja IS NULL OR fecha_baja IS NOT NULL AND es_principal=(0) AND (motivo_baja=N'RETIRO' AND id_usuario_baja IS NOT NULL OR motivo_baja=N'DUPLICADO_MIGRACION' AND id_usuario_baja IS NULL))` |
| `correos_electronicos` | `ck_correos_electronicos_direccion` | `(len(ltrim(rtrim(direccion)))>(2))` |
| `decisiones_habilitacion` | `ck_decision_tipo` | `(tipo_decision='ANALISIS_DOCUMENTO' OR tipo_decision='SOLICITUD_SUPRESION' OR tipo_decision='SOLICITUD_RECTIFICACION' OR tipo_decision='LIBERACION_BLOQUEO' OR tipo_decision='BLOQUEO_CONSERVACION' OR tipo_decision='RETIRO_DOCUMENTO' OR tipo_decision='CONSULTA_EXTERNA' OR tipo_decision='RENOVACION' OR tipo_decision='REVOCADA' OR tipo_decision='CORRECCION_SOLICITADA' OR tipo_decision='RECHAZADA' OR tipo_decision='VERIFICADA' OR tipo_decision='DOCUMENTO' OR tipo_decision='MODIFICACION' OR tipo_decision='REGISTRO')` |
| `documentos_habilitacion` | `ck_dochab_analisis` | `(estado_analisis='LEGADO_SIN_ANALISIS' OR estado_analisis='ERROR_ANALISIS' OR estado_analisis='RECHAZADO' OR estado_analisis='LIMPIO' OR estado_analisis='EN_CUARENTENA')` |
| `documentos_habilitacion` | `ck_dochab_baja` | `(fecha_baja IS NULL AND id_usuario_baja IS NULL AND motivo_baja IS NULL OR fecha_baja IS NOT NULL AND id_usuario_baja IS NOT NULL AND motivo_baja IS NOT NULL)` |
| `documentos_habilitacion` | `ck_dochab_bloqueo` | `(bloqueo_conservacion=(0) OR motivo_bloqueo IS NOT NULL)` |
| `documentos_habilitacion` | `ck_dochab_hash_coherente` | `(hash_sha256 IS NULL AND hash_momento IS NULL OR hash_sha256 IS NOT NULL AND hash_momento IS NOT NULL)` |
| `documentos_habilitacion` | `ck_dochab_hash_momento` | `(hash_momento IS NULL OR (hash_momento='REGULARIZACION' OR hash_momento='CARGA'))` |
| `documentos_habilitacion` | `ck_dochab_origen` | `(origen_registro='POSTERIOR_V59' OR origen_registro='ANTERIOR_V59')` |
| `documentos_habilitacion` | `ck_dochab_proposito` | `(proposito='CONSULTA_EXTERNA' OR proposito='CORRECCION' OR proposito='RENOVACION' OR proposito='EVIDENCIA')` |
| `documentos_habilitacion` | `ck_dochab_regularizacion` | `(fecha_regularizacion IS NULL AND id_usuario_regularizacion IS NULL OR fecha_regularizacion IS NOT NULL AND id_usuario_regularizacion IS NOT NULL AND origen_registro='ANTERIOR_V59')` |
| `documentos_vuelo` | `ck_documentos_vuelo_baja` | `(esta_activo=(1) AND fecha_baja IS NULL AND id_usuario_baja IS NULL AND motivo_baja IS NULL OR esta_activo=(0) AND fecha_baja IS NOT NULL AND id_usuario_baja IS NOT NULL AND motivo_baja IS NOT NULL AND len(ltrim(rtrim(motivo_baja)))>(0))` |
| `eventos_auditoria` | `ck_eventos_auditoria_json` | `((valores_anteriores IS NULL OR isjson(valores_anteriores)=(1)) AND (valores_nuevos IS NULL OR isjson(valores_nuevos)=(1)))` |
| `habilitaciones_profesionales` | `ck_habilitacion_estado` | `(estado_verificacion='CORRECCION_SOLICITADA' OR estado_verificacion='REVOCADA' OR estado_verificacion='RECHAZADA' OR estado_verificacion='VERIFICADA' OR estado_verificacion='PENDIENTE')` |
| `habilitaciones_profesionales` | `ck_habilitacion_fechas` | `(fecha_emision IS NULL OR fecha_vencimiento IS NULL OR fecha_vencimiento>=fecha_emision)` |
| `informes_finales_vuelo` | `ck_informes_finales_vuelo_1474104292` | `(version>(0))` |
| `informes_finales_vuelo` | `ck_informes_finales_vuelo_adjunto` | `(adjunto_nombre_original IS NULL AND adjunto_ubicacion IS NULL AND adjunto_tamanio_bytes IS NULL AND adjunto_sha256 IS NULL OR adjunto_nombre_original IS NOT NULL AND adjunto_ubicacion IS NOT NULL AND adjunto_tamanio_bytes>(0) AND adjunto_sha256 IS NOT NULL AND len(adjunto_sha256)=(64))` |
| `informes_finales_vuelo` | `ck_informes_finales_vuelo_contenido` | `(origen_decision<>N'FLUJO_ACTUAL' OR adjunto_ubicacion IS NOT NULL OR len(ltrim(rtrim(isnull(resumen,N''))))>(0))` |
| `informes_finales_vuelo` | `ck_informes_finales_vuelo_revision` | `((estado_revision=N'HISTORICO_SIN_DECISION' OR estado_revision=N'REEMPLAZADO' OR estado_revision=N'APROBADO' OR estado_revision=N'DEVUELTO' OR estado_revision=N'PRESENTADO') AND (origen_decision=N'HISTORICA_SIN_EVIDENCIA' OR origen_decision=N'HISTORICA_OBLIGACION_AUDITADA' OR origen_decision=N'HISTORICA_OBLIGACION' OR origen_decision=N'FLUJO_ACTUAL') AND (estado_revision=N'DEVUELTO' AND motivo_devolucion IS NOT NULL AND len(ltrim(rtrim(motivo_devolucion)))>(0) AND fecha_revision IS NOT NULL AND id_usuario_revisor IS NOT NULL AND origen_decision<>N'HISTORICA_SIN_EVIDENCIA' OR estado_revision=N'APROBADO' AND fecha_revision IS NOT NULL AND id_usuario_revisor IS NOT NULL AND origen_decision<>N'HISTORICA_SIN_EVIDENCIA' OR estado_revision=N'PRESENTADO' AND origen_decision<>N'HISTORICA_SIN_EVIDENCIA' OR (estado_revision=N'HISTORICO_SIN_DECISION' OR estado_revision=N'REEMPLAZADO') AND origen_dec` |
| `negociaciones_horario_vuelo` | `ck_negociaciones_horario_tipo` | `(tipo_negociacion=N'CO_RECHAZA_PROPUESTA_COMANDANTE' OR tipo_negociacion=N'CO_ACEPTA_PROPUESTA_COMANDANTE' OR tipo_negociacion=N'COMANDANTE_PROPONE_HORARIO' OR tipo_negociacion=N'COMANDANTE_RECHAZA_ASIGNACION' OR tipo_negociacion=N'COMANDANTE_ACEPTA_ASIGNACION' OR tipo_negociacion=N'CO_RECHAZO_DIRECTO' OR tipo_negociacion=N'DTS_RECHAZA_CONTRAPROPUESTA' OR tipo_negociacion=N'DTS_ACEPTA_CONTRAPROPUESTA' OR tipo_negociacion=N'CO_CONTRAPROPUESTA' OR tipo_negociacion=N'CO_ACEPTA_PROPUESTA' OR tipo_negociacion=N'DTS_PROPUESTA')` |
| `obligaciones_informe_final` | `ck_obligaciones_informe_final_estado` | `(estado_obligacion=N'APROBADO' OR estado_obligacion=N'DEVUELTO' OR estado_obligacion=N'PRESENTADO' OR estado_obligacion=N'PENDIENTE')` |
| `obligaciones_informe_final` | `ck_obligaciones_informe_final_fechas` | `(vencimiento>=vencimiento_original OR prorroga_utilizada=(1))` |
| `obligaciones_informe_final` | `ck_obligaciones_informe_final_revision` | `(estado_obligacion=N'APROBADO' AND id_informes_finales_vuelo IS NOT NULL AND fecha_aprobacion IS NOT NULL AND id_usuario_aprobador IS NOT NULL OR estado_obligacion=N'DEVUELTO' AND motivo_devolucion IS NOT NULL AND len(ltrim(rtrim(motivo_devolucion)))>(0) AND fecha_devolucion IS NOT NULL AND id_usuario_devolvedor IS NOT NULL OR (estado_obligacion=N'PRESENTADO' OR estado_obligacion=N'PENDIENTE'))` |
| `perfiles_comandante` | `ck_perfiles_comandante_licencia_alphanumerica` | `(NOT numero_licencia like N'%^0-9A-Za-z%')` |
| `personas` | `ck_personas_dni_solo_digitos` | `(dni IS NULL OR NOT dni like N'%^0-9%')` |
| `politicas_habilitacion` | `ck_politica_baja` | `(activa=(1) AND fecha_baja IS NULL OR activa=(0) AND fecha_baja IS NOT NULL AND id_usuario_baja IS NOT NULL AND motivo_baja IS NOT NULL)` |
| `politicas_habilitacion` | `ck_politica_fuente` | `(origen<>'FUENTE_OFICIAL_CITADA' OR fuente_referencia IS NOT NULL)` |
| `politicas_habilitacion` | `ck_politica_origen` | `(origen='FUENTE_OFICIAL_CITADA' OR origen='CONFIGURACION_INTERNA')` |
| `rutas_vuelo` | `ck_rutas_vuelo_1426104121` | `(version>(0))` |
| `rutas_vuelo` | `ck_rutas_vuelo_decision` | `(NOT (estado_revision='DEVUELTA' OR estado_revision='APROBADA') OR id_usuario_revisor IS NOT NULL AND fecha_revision IS NOT NULL)` |
| `rutas_vuelo` | `ck_rutas_vuelo_devolucion` | `(estado_revision<>'DEVUELTA' OR observaciones_revision IS NOT NULL AND len(ltrim(rtrim(observaciones_revision)))>(0))` |
| `rutas_vuelo` | `ck_rutas_vuelo_estado_revision` | `(estado_revision='SIN_REVISION' OR estado_revision='REQUIERE_REVISION' OR estado_revision='DEVUELTA' OR estado_revision='APROBADA' OR estado_revision='PENDIENTE_REVISION' OR estado_revision='BORRADOR')` |
| `rutas_vuelo` | `ck_rutas_vuelo_invalidacion` | `(estado_revision<>'REQUIERE_REVISION' OR fecha_invalidacion IS NOT NULL AND causa_invalidacion IS NOT NULL)` |
| `rutas_vuelo` | `ck_rutas_vuelo_presentacion` | `(NOT (estado_revision='DEVUELTA' OR estado_revision='APROBADA' OR estado_revision='PENDIENTE_REVISION') OR id_usuario_presenta IS NOT NULL AND fecha_presentacion IS NOT NULL)` |
| `rutas_vuelo` | `ck_rutas_vuelo_revisor_distinto` | `(id_usuario_revisor IS NULL OR id_usuario_presenta IS NULL OR id_usuario_revisor<>id_usuario_presenta)` |
| `telefonos` | `ck_telefonos_baja` | `(fecha_baja IS NULL AND id_usuario_baja IS NULL AND motivo_baja IS NULL OR fecha_baja IS NOT NULL AND es_principal=(0) AND (motivo_baja=N'RETIRO' AND id_usuario_baja IS NOT NULL OR motivo_baja=N'DUPLICADO_MIGRACION' AND id_usuario_baja IS NULL))` |
| `telefonos` | `ck_telefonos_numero` | `(len(ltrim(rtrim(numero)))>(2))` |
| `telefonos` | `ck_telefonos_validacion_internacional` | `(codigo_pais IS NULL OR len(codigo_pais)=(2) AND NOT (codigo_pais) collate Latin1_General_BIN2 like N'%^A-Z%' AND numero_normalizado like N'+1-9%' AND NOT substring(numero_normalizado,(2),(30)) like N'%^0-9%' AND (len(numero_normalizado)>=(8) AND len(numero_normalizado)<=(16)))` |
| `usuarios` | `ck_usuarios_estado_cuenta` | `(estado_cuenta=N'DESACTIVADO' OR estado_cuenta=N'ACTIVO' OR estado_cuenta=N'PENDIENTE_ACTIVACION')` |
| `usuarios` | `ck_usuarios_version_credenciales_positiva` | `(version_credenciales>=(1))` |
| `verificaciones_correo` | `ck_verificaciones_correo_cierre` | `(fecha_invalidacion IS NULL AND motivo_invalidacion IS NULL OR fecha_invalidacion IS NOT NULL AND fecha_uso IS NULL AND (motivo_invalidacion=N'CORREO_VERIFICADO' OR motivo_invalidacion=N'ENVIO_FALLIDO' OR motivo_invalidacion=N'CORREO_RETIRADO' OR motivo_invalidacion=N'CORREO_MODIFICADO' OR motivo_invalidacion=N'AGOTADO' OR motivo_invalidacion=N'VENCIDO' OR motivo_invalidacion=N'REEMPLAZADO'))` |
| `verificaciones_correo` | `ck_verificaciones_correo_intentos` | `(intentos_fallidos<=(5) OR fecha_invalidacion IS NOT NULL)` |
| `verificaciones_correo` | `ck_verificaciones_correo_vigencia` | `(fecha_vencimiento>fecha_creacion)` |
| `versiones_documento_vuelo` | `ck_versiones_documento_vuelo_numero` | `(numero_version>(0))` |
| `vuelos` | `ck_vuelos_1378103950` | `(fecha_planificada_salida IS NULL OR fecha_planificada_llegada IS NULL OR fecha_planificada_llegada>fecha_planificada_salida)` |
| `vuelos` | `ck_vuelos_1394104007` | `(fecha_salida_real IS NULL OR fecha_llegada_real IS NULL OR fecha_llegada_real>fecha_salida_real)` |
| `vuelos` | `ck_vuelos_2021582240` | `(id_aeropuerto_origen IS NULL OR id_aeropuerto_destino IS NULL OR id_aeropuerto_origen<>id_aeropuerto_destino)` |
| `vuelos_sanitarios` | `ck_vuelos_sanitarios_urgencia` | `(extrema_urgencia=(0) AND justificacion_extrema_urgencia IS NULL AND fecha_limite_traslado IS NULL OR extrema_urgencia=(1) AND nullif(ltrim(rtrim(justificacion_extrema_urgencia)),N'') IS NOT NULL AND fecha_limite_traslado IS NOT NULL)` |
| `vuelos_tripulantes` | `ck_vuelos_tripulantes_baja` | `(fecha_baja IS NULL AND id_usuario_baja IS NULL AND motivo_baja IS NULL OR fecha_baja IS NOT NULL AND id_usuario_baja IS NOT NULL AND (motivo_baja=N'CAMBIO_COMANDANTE' OR motivo_baja=N'REEMPLAZO' OR motivo_baja=N'RETIRO'))` |

## 4. Índices únicos (51, sin contar las PK)

| Tabla | Índice | Columnas | Filtro |
|---|---|---|---|
| `activaciones_cuenta` | `uq_activaciones_cuenta_usuario_vigente` | id_usuarios | `(fecha_utilizacion IS NULL)` |
| `aeronaves` | `uq_aeronaves_2` | matricula | — |
| `bitacora_vuelos` | `UX_bitacora_transicion` | id_vuelos, tipo_acontecimiento | `(origen_acontecimiento=N'AUTOMATICO')` |
| `bloqueos_documento_vuelo` | `uq_bloqueos_documento_vuelo_documento` | id_documentos_vuelo | — |
| `clasificaciones_tripulacion` | `ux_clasificacion_tripulacion_vigente` | id_usuarios, id_roles_tripulacion | `(fecha_baja IS NULL)` |
| `contactos_coordinacion_traslado` | `uq_contactos_coordinacion_traslado_principal_vigente` | id_vuelos | `(es_principal=(1) AND fecha_baja IS NULL)` |
| `contactos_coordinacion_traslado` | `uq_contactos_coordinacion_traslado_telefono_vigente` | id_vuelos, telefono_normalizado | `(fecha_baja IS NULL)` |
| `coordinaciones_aa2000` | `uq_coordinacion_gestion_actual` | identificador_gestion | `(es_version_actual=(1))` |
| `coordinaciones_aa2000` | `uq_coordinacion_gestion_version` | identificador_gestion, version | — |
| `correos_electronicos` | `uq_correos_electronicos_principal_por_persona` | id_personas | `(es_principal=(1))` |
| `correos_electronicos` | `uq_correos_electronicos_vigente_por_persona` | id_personas, direccion_normalizada | `(fecha_baja IS NULL)` |
| `estados_solicitud_sanitaria` | `uq_estados_solicitud_sanitaria_codigo` | codigo_estado_solicitud | — |
| `estados_vuelo` | `uq_estados_vuelo_2` | codigo_estado_vuelo | — |
| `informacion_hangar` | `uq_informacion_hangar_4` | id_vuelos, version | — |
| `informacion_hangar` | `uq_informacion_hangar_version_actual` | id_vuelos | `(es_version_actual=(1))` |
| `informacion_medica_vuelo` | `uq_informacion_medica_vuelo_2` | id_vuelos | — |
| `informes_finales_vuelo` | `uq_informes_finales_vuelo_4` | id_vuelos, version | — |
| `informes_finales_vuelo` | `ux_informes_finales_vuelo_actual` | id_vuelos | `(es_version_actual=(1))` |
| `informes_finales_vuelo` | `ux_informes_finales_vuelo_adjunto_ubicacion` | adjunto_ubicacion | `(adjunto_ubicacion IS NOT NULL)` |
| `localidades` | `UQ__localida__754AA10E3E2ABF20` | codigo_oficial | — |
| `motivos_cancelacion` | `uq_motivos_cancelacion_codigo` | codigo_motivo_cancelacion | — |
| `motivos_cancelacion` | `uq_motivos_cancelacion_orden` | orden | — |
| `negociaciones_horario_vuelo` | `ux_negociaciones_horario_vuelo_respondida` | id_negociacion_respondida | `(id_negociacion_respondida IS NOT NULL)` |
| `notificaciones` | `ux_notificaciones_usuario_clave_evento` | id_usuarios, clave_evento | `(clave_evento IS NOT NULL)` |
| `obligaciones_informe_final` | `uq_obligaciones_informe_final_2` | id_vuelos, numero_obligacion | — |
| `obligaciones_informe_final` | `uq_obligaciones_informe_final_actual` | id_vuelos | `(es_actual=(1))` |
| `pacientes` | `uq_pacientes_2` | id_personas | — |
| `perfiles_comandante` | `uq_perfiles_comandante_id_personas` | id_personas | — |
| `perfiles_comandante` | `uq_perfiles_comandante_numero_licencia` | numero_licencia_normalizada | — |
| `personas` | `uq_personas_dni` | dni | `(dni IS NOT NULL)` |
| `politicas_habilitacion` | `ux_politica_habilitacion_activa` | id_roles_tripulacion, id_tipos_vuelo, categoria_aeronave, tipo_habilitacion | `(activa=(1))` |
| `prioridades_vuelo` | `uq_prioridades_vuelo_2` | codigo_prioridad_vuelo | — |
| `provincias` | `UQ__provinci__72AFBCC686C17419` | nombre_provincia | — |
| `provincias` | `UQ__provinci__754AA10E9EA02787` | codigo_oficial | — |
| `roles` | `uq_roles_2` | codigo_rol | — |
| `roles_tripulacion` | `uq_roles_tripulacion_2` | codigo_rol_tripulacion | — |
| `rutas_vuelo` | `uq_rutas_vuelo_4` | id_vuelos, version | — |
| `rutas_vuelo` | `uq_rutas_vuelo_actual` | id_vuelos | `(es_version_actual=(1))` |
| `telefonos` | `uq_telefonos_principal_por_persona` | id_personas | `(es_principal=(1))` |
| `telefonos` | `uq_telefonos_vigente_por_persona` | id_personas, numero_normalizado | `(fecha_baja IS NULL)` |
| `tipos_documento` | `uq_tipos_documento_2` | codigo_tipo_documento | — |
| `tipos_vuelo` | `uq_tipos_vuelo_codigo` | codigo_tipo_vuelo | — |
| `usuarios` | `uq_usuarios_5` | id_personas | — |
| `usuarios` | `uq_usuarios_nombre_usuario` | nombre_usuario | `(nombre_usuario IS NOT NULL)` |
| `usuarios_roles` | `uq_usuarios_roles_id_usuarios_id_roles` | id_usuarios, id_roles | — |
| `verificaciones_correo` | `uq_verificaciones_correo_abierta` | id_correos_electronicos | `(fecha_uso IS NULL AND fecha_invalidacion IS NULL)` |
| `versiones_documento_vuelo` | `uq_versiones_documento_vuelo_actual` | id_documentos_vuelo | `(es_version_actual=(1))` |
| `versiones_documento_vuelo` | `uq_versiones_documento_vuelo_numero` | id_documentos_vuelo, numero_version | — |
| `vuelos` | `uq_vuelos_2` | codigo_vuelo | — |
| `vuelos_sanitarios` | `uq_vuelos_sanitarios_id_vuelos` | id_vuelos | — |
| `vuelos_tripulantes` | `ux_vuelos_tripulantes_asignacion_vigente` | id_vuelos, id_usuarios | `(fecha_baja IS NULL)` |

## 5. Índices no únicos duplicados (63 grupos) — hallazgo A1

| Tabla | Columnas | Índices que las cubren |
|---|---|---|
| `activaciones_cuenta` | id_usuario_administrador_creador | `idx_activaciones_cuenta_administrador_creador_id`, `idx_activaciones_cuenta_id_usuario_administrador_creador` |
| `activaciones_cuenta` | id_usuarios | `idx_activaciones_cuenta_id_usuarios`, `idx_activaciones_cuenta_usuario_id` |
| `aeronaves` | id_aeropuertos | `idx_aeronaves_aeropuerto_actual_id`, `idx_aeronaves_id_aeropuertos` |
| `aeropuertos` | id_localidades | `idx_aeropuertos_id_localidades`, `idx_aeropuertos_localidad_id` |
| `aeropuertos` | id_provincias | `idx_aeropuertos_id_provincias`, `idx_aeropuertos_provincia_id` |
| `bitacora_vuelos` | id_usuarios | `idx_bitacora_vuelos_id_usuarios`, `idx_bitacora_vuelos_usuario_id` |
| `bitacora_vuelos` | id_vuelos | `idx_bitacora_vuelos_id_vuelos`, `idx_bitacora_vuelos_vuelo_id` |
| `coordinaciones_aa2000` | id_usuario_registrador | `idx_coordinaciones_aa2000_id_usuario_registrador`, `idx_coordinaciones_aa2000_registrado_por_usuario_id` |
| `coordinaciones_aa2000` | id_vuelos | `idx_coordinaciones_aa2000_id_vuelos`, `idx_coordinaciones_aa2000_vuelo_id` |
| `correos_electronicos` | id_personas | `idx_correos_electronicos_id_personas`, `idx_correos_electronicos_persona_id` |
| `documentos_vuelo` | id_tipos_documento | `idx_documentos_vuelo_id_tipos_documento`, `idx_documentos_vuelo_tipo_documento_id` |
| `documentos_vuelo` | id_vuelos | `idx_documentos_vuelo_id_vuelos`, `idx_documentos_vuelo_vuelo_id` |
| `eventos_auditoria` | id_usuario_actor | `idx_eventos_auditoria_actor_usuario_id`, `idx_eventos_auditoria_id_usuario_actor` |
| `eventos_auditoria` | id_vuelos | `idx_eventos_auditoria_id_vuelos`, `idx_eventos_auditoria_vuelo_id` |
| `informacion_hangar` | id_usuario_registrador | `idx_informacion_hangar_id_usuario_registrador`, `idx_informacion_hangar_registrado_por_usuario_id` |
| `informacion_hangar` | id_vuelos | `idx_informacion_hangar_id_vuelos`, `idx_informacion_hangar_vuelo_id` |
| `informacion_medica_vuelo` | id_vuelos | `idx_informacion_medica_vuelo_id_vuelos`, `idx_informacion_medica_vuelo_vuelo_id` |
| `informes_finales_vuelo` | id_usuario_creador | `idx_informes_finales_vuelo_creado_por_usuario_id`, `idx_informes_finales_vuelo_id_usuario_creador` |
| `informes_finales_vuelo` | id_vuelos | `idx_informes_finales_vuelo_id_vuelos`, `idx_informes_finales_vuelo_vuelo_id` |
| `instantaneas_clima` | id_usuario_registrador | `idx_instantaneas_clima_id_usuario_registrador`, `idx_instantaneas_clima_registrado_por_usuario_id` |
| `instantaneas_clima` | id_vuelos | `idx_instantaneas_clima_id_vuelos`, `idx_instantaneas_clima_vuelo_id` |
| `localidades` | id_provincias | `idx_localidades_id_provincias`, `idx_localidades_provincia_id` |
| `negociaciones_horario_vuelo` | id_usuario_actor | `idx_negociaciones_horario_vuelo_actor_usuario_id`, `idx_negociaciones_horario_vuelo_id_usuario_actor` |
| `negociaciones_horario_vuelo` | id_vuelos | `idx_negociaciones_horario_vuelo_id_vuelos`, `idx_negociaciones_horario_vuelo_vuelo_id` |
| `notificaciones` | id_usuarios | `idx_notificaciones_id_usuarios`, `idx_notificaciones_usuario_id` |
| `notificaciones` | id_vuelos | `idx_notificaciones_id_vuelos`, `idx_notificaciones_vuelo_id` |
| `obligaciones_informe_final` | id_usuario_aprobador | `idx_obligaciones_informe_final_aprobado_por_usuario_id`, `idx_obligaciones_informe_final_id_usuario_aprobador` |
| `obligaciones_informe_final` | id_usuario_comandante | `idx_obligaciones_informe_final_comandante_usuario_id`, `idx_obligaciones_informe_final_id_usuario_comandante` |
| `obligaciones_informe_final` | id_usuario_devolvedor | `idx_obligaciones_informe_final_devuelto_por_usuario_id`, `idx_obligaciones_informe_final_id_usuario_devolvedor` |
| `obligaciones_informe_final` | id_informes_finales_vuelo | `idx_obligaciones_informe_final_id_informes_finales_vuelo`, `idx_obligaciones_informe_final_informe_id` |
| `obligaciones_informe_final` | id_vuelos | `idx_obligaciones_informe_final_id_vuelos`, `idx_obligaciones_informe_final_vuelo_id` |
| `pacientes` | id_personas | `idx_pacientes_id_personas`, `idx_pacientes_persona_id` |
| `perfiles_comandante` | id_personas | `idx_perfiles_comandante_id_personas`, `idx_perfiles_comandante_persona_id` |
| `perfiles_comandante` | id_provincias | `idx_perfiles_comandante_id_provincias`, `idx_perfiles_comandante_provincia_actual_id` |
| `rutas_vuelo` | id_usuario_creador | `idx_rutas_vuelo_creado_por_usuario_id`, `idx_rutas_vuelo_id_usuario_creador` |
| `rutas_vuelo` | id_vuelos | `idx_rutas_vuelo_id_vuelos`, `idx_rutas_vuelo_vuelo_id` |
| `telefonos` | id_personas | `idx_telefonos_id_personas`, `idx_telefonos_persona_id` |
| `usuarios` | id_personas | `idx_usuarios_id_personas`, `idx_usuarios_persona_id` |
| `usuarios_roles` | id_roles | `idx_usuarios_roles_id_roles`, `idx_usuarios_roles_rol_id` |
| `usuarios_roles` | id_usuarios | `idx_usuarios_roles_id_usuarios`, `idx_usuarios_roles_usuario_id` |
| `versiones_documento_vuelo` | id_usuario_creador | `idx_versiones_documento_vuelo_creado_por_usuario_id`, `idx_versiones_documento_vuelo_id_usuario_creador` |
| `versiones_documento_vuelo` | id_documentos_vuelo | `idx_versiones_documento_vuelo_documento_vuelo_id`, `idx_versiones_documento_vuelo_id_documentos_vuelo` |
| `vuelos` | id_aeronaves | `idx_vuelos_aeronave_id`, `idx_vuelos_id_aeronaves` |
| `vuelos` | id_usuario_cancelador | `idx_vuelos_cancelado_por_usuario_id`, `idx_vuelos_id_usuario_cancelador` |
| `vuelos` | id_usuario_comandante | `idx_vuelos_comandante_usuario_id`, `idx_vuelos_id_usuario_comandante` |
| `vuelos` | id_usuario_creador | `idx_vuelos_creado_por_usuario_id`, `idx_vuelos_id_usuario_creador` |
| `vuelos` | id_aeropuerto_destino | `idx_vuelos_destino_id`, `idx_vuelos_id_aeropuerto_destino` |
| `vuelos` | id_estados_vuelo | `idx_vuelos_estado_vuelo_id`, `idx_vuelos_id_estados_vuelo` |
| `vuelos` | id_aeropuerto_origen | `idx_vuelos_id_aeropuerto_origen`, `idx_vuelos_origen_id` |
| `vuelos` | id_motivos_cancelacion | `idx_vuelos_id_motivos_cancelacion`, `idx_vuelos_motivo_cancelacion_id` |
| `vuelos` | id_tipos_vuelo | `idx_vuelos_id_tipos_vuelo`, `idx_vuelos_tipo_vuelo_id` |
| `vuelos_sanitarios` | id_estados_solicitud_sanitaria | `idx_vuelos_sanitarios_estado_solicitud_id`, `idx_vuelos_sanitarios_id_estados_solicitud_sanitaria` |
| `vuelos_sanitarios` | id_usuario_evaluador | `idx_vuelos_sanitarios_evaluado_por_usuario_id`, `idx_vuelos_sanitarios_id_usuario_evaluador` |
| `vuelos_sanitarios` | id_localidad_destino | `idx_vuelos_sanitarios_id_localidad_destino`, `idx_vuelos_sanitarios_localidad_destino_id` |
| `vuelos_sanitarios` | id_localidad_origen | `idx_vuelos_sanitarios_id_localidad_origen`, `idx_vuelos_sanitarios_localidad_origen_id` |
| `vuelos_sanitarios` | id_pacientes | `idx_vuelos_sanitarios_id_pacientes`, `idx_vuelos_sanitarios_paciente_id` |
| `vuelos_sanitarios` | id_prioridades_vuelo | `idx_vuelos_sanitarios_id_prioridades_vuelo`, `idx_vuelos_sanitarios_prioridad_id` |
| `vuelos_sanitarios` | id_usuario_solicitante | `idx_vuelos_sanitarios_id_usuario_solicitante`, `idx_vuelos_sanitarios_solicitado_por_usuario_id` |
| `vuelos_sanitarios` | id_vuelos | `idx_vuelos_sanitarios_id_vuelos`, `idx_vuelos_sanitarios_vuelo_id` |
| `vuelos_tripulantes` | id_usuario_asignador | `idx_vuelos_tripulantes_asignado_por_usuario_id`, `idx_vuelos_tripulantes_id_usuario_asignador` |
| `vuelos_tripulantes` | id_roles_tripulacion | `idx_vuelos_tripulantes_id_roles_tripulacion`, `idx_vuelos_tripulantes_rol_tripulacion_id` |
| `vuelos_tripulantes` | id_usuarios | `idx_vuelos_tripulantes_id_usuarios`, `idx_vuelos_tripulantes_usuario_id` |
| `vuelos_tripulantes` | id_vuelos | `idx_vuelos_tripulantes_id_vuelos`, `idx_vuelos_tripulantes_vuelo_id` |

## 6. Índices de migraciones ausentes del esquema vivo (7) — hallazgo A2

- `ix_vuelos_aeronave_estado`
- `ix_aeronaves_aeropuerto_actual_activo`
- `ix_usuarios_activo_estado`
- `ix_perfiles_comandante_provincia_actual`
- `ix_negociaciones_horario_vuelo_fecha`
- `ix_vuelos_motivo_cancelacion`
- `ix_vuelos_tipo_vuelo_estado`
