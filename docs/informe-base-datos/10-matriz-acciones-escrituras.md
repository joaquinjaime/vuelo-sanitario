# Matriz transversal de acciones y escrituras (Parte 5)

[← Informe principal](../INFORME_COMPLETO_BASE_DATOS.md)

Cada fila responde «qué tabla toca cada acción». **T1…T7** identifican transacciones distintas; las filas con la misma etiqueta pertenecen a **la misma transacción**. «Origen de los valores» distingue lo que aporta el usuario, lo que calcula el backend y lo que fija la base.

| # | Acción del sistema | Actor | Tabla afectada | Operación | Campos afectados | Origen de los valores | Transacción |
|---|---|---|---|---|---|---|---|
| 1 | Crear usuario | Administrador | personas | INSERT (o reutiliza persona confirmada) | nombre_persona, apellido_persona, dni, fecha_nacimiento, version_identidad | Formulario + backend (DNI canónico) | T1 (misma transacción que las filas siguientes) |
| 2 | Crear usuario | Administrador | usuarios | INSERT | id_personas, esta_activo, estado_cuenta='PENDIENTE_ACTIVACION', version_credenciales | Backend/DEFAULT | T1 |
| 3 | Crear usuario | Administrador | usuarios_roles | INSERT (1 por rol) | id_usuarios, id_roles, fecha_asignacion | Formulario (roles) + backend | T1 |
| 4 | Crear usuario con rol COMANDANTE | Administrador | perfiles_comandante | INSERT | id_personas, numero_licencia | Formulario (licencia) | T1 |
| 5 | Crear usuario | Administrador | correos_electronicos / telefonos | INSERT (≥ 1 de cada uno) | direccion(+normalizada)/numero(+normalizado, codigo_pais), tipo, es_principal | Formulario + validadores | T1 |
| 6 | Crear usuario / regenerar código | Administrador | activaciones_cuenta | INSERT (+ UPDATE de los abiertos al regenerar) | id_usuarios, token_hash, fecha_expiracion, codigo_numerico, id_usuario_administrador_creador | Backend (SecureRandom + BCrypt) | T1 |
| 7 | Crear usuario | Administrador | eventos_auditoria | INSERT | USER/USUARIO_CREADO | Backend | T1 |
| 8 | Activar cuenta | Titular (sin sesión) | usuarios | UPDATE | nombre_usuario, hash_contrasena, estado_cuenta='ACTIVO', debe_cambiar_contrasena=0 | Formulario + BCrypt | T2 (con noRollbackFor para contar errores) |
| 9 | Activar cuenta / intento fallido | Titular | activaciones_cuenta | UPDATE | fecha_utilizacion (uso, vencimiento, agotamiento) / intentos_fallidos | Backend | T2 |
| 10 | Pedir código de verificación de correo | Titular | verificaciones_correo | INSERT (+ UPDATE del abierto) | id_correos_electronicos, direccion_normalizada, codigo_hash, fecha_vencimiento, id_usuario_solicitante, origen_huella | Backend (HMAC) | T3 (alta) y T4 (resultado del envío: fecha_envio o invalidación) |
| 11 | Confirmar correo | Titular | verificaciones_correo + correos_electronicos | UPDATE + UPDATE | fecha_uso / intentos_fallidos; fecha_verificacion | Código ingresado | Misma transacción |
| 12 | Editar/Quitar/Principal de correo o teléfono | Titular | correos_electronicos / telefonos | UPDATE | dirección/número, tipo, es_principal, fecha_baja, id_usuario_baja, motivo_baja, version_contacto | Formulario | Una por operación |
| 13 | Cambiar contraseña propia | Titular | usuarios | UPDATE | hash_contrasena, debe_cambiar_contrasena=0, version_credenciales+1 | Formulario + BCrypt | Una |
| 14 | Editar usuario / roles | Administrador | personas, usuarios_roles, usuarios, perfiles_comandante | UPDATE / DELETE+INSERT / UPDATE / INSERT | nombre, apellido, nacimiento; roles; version_credenciales+1; licencia | Formulario | Una |
| 15 | Desactivar cuenta | Administrador | usuarios | UPDATE | esta_activo=0, estado_cuenta='DESACTIVADO', fecha_baja, id_usuario_baja, motivo_baja, version_credenciales+1 | Formulario + backend | Una (libera bloqueos documentales: DELETE en bloqueos_documento_vuelo) |
| 16 | Reactivar cuenta | Administrador | usuarios (+ usuarios_roles) | UPDATE (+ DELETE/INSERT) | esta_activo=1, estado_cuenta='ACTIVO', campos de baja NULL, hash_contrasena temporal, debe_cambiar_contrasena=1 | Backend | Una |
| 17 | Rectificar DNI | Administrador | personas | UPDATE | dni, version_identidad | Formulario (motivo, cotejo) | Una |
| 18 | Crear solicitud sanitaria | DTS | personas / pacientes (si es nuevo) | INSERT | ver tablas | Formulario | T5 — única transacción de toda la solicitud |
| 19 | Crear solicitud sanitaria | DTS | vuelos | INSERT | codigo_vuelo, id_tipos_vuelo, motivo_vuelo, id_usuario_creador | Formulario + backend | T5 |
| 20 | Crear solicitud sanitaria | DTS | vuelos_sanitarios | INSERT | id_vuelos, id_pacientes, id_usuario_solicitante, fecha_solicitada, id_prioridades_vuelo, extrema_urgencia, justificación, límite, localidades, estado SOLICITADO | Formulario | T5 |
| 21 | Crear solicitud sanitaria | DTS | informacion_medica_vuelo | INSERT | diagnostico, condicion_medica, requiere_equipamiento_especial, observaciones_medicas | Formulario | T5 |
| 22 | Crear solicitud sanitaria | DTS | negociaciones_horario_vuelo | INSERT | tipo='DTS_PROPUESTA', fecha_hora_propuesta | Formulario | T5 |
| 23 | Crear solicitud sanitaria | DTS | contactos_coordinacion_traslado | INSERT (0–5) | relación, nombre, teléfono, país, es_principal | Formulario | T5 |
| 24 | Crear solicitud sanitaria | Sistema | notificaciones, eventos_auditoria | INSERT | NEW_SANITARY_REQUEST (+ EXTREME_URGENCY_REQUEST); FLIGHT/CREATE_SANITARY | Backend | T5 |
| 25 | Aprobar horario solicitado | Operaciones | vuelos_sanitarios | UPDATE | id_estados_solicitud_sanitaria→APROBADO, id_usuario_evaluador, fecha_evaluacion | Backend | Una |
| 26 | Aprobar horario solicitado | Operaciones | vuelos | UPDATE | fecha_planificada_salida | = fecha_solicitada | Una |
| 27 | Aprobar / contraproponer / rechazar | Operaciones | negociaciones_horario_vuelo | INSERT | tipo_negociacion (CO_ACEPTA_PROPUESTA \| CO_CONTRAPROPUESTA \| CO_RECHAZO_DIRECTO), fecha_hora_propuesta, motivo, id_negociacion_respondida | Formulario | Una |
| 28 | Contraproponer horario | Operaciones | vuelos_sanitarios | UPDATE | estado→PENDIENTE_RESPUESTA_DTS, evaluador, fecha_evaluacion | Backend | Una |
| 29 | Rechazar solicitud | Operaciones | vuelos_sanitarios | UPDATE | estado→RECHAZADO, motivo_rechazo, evaluador, fecha_evaluacion | Formulario (motivo de catálogo) | Una |
| 30 | Responder contrapropuesta | DTS solicitante | vuelos_sanitarios / vuelos / negociaciones_horario_vuelo | UPDATE / UPDATE / INSERT | aceptar: estado→APROBADO y salida; rechazar: estado→CANCELADO + cancelación del vuelo | Formulario | Una |
| 31 | Asignar recursos (sanitario) | Operaciones | vuelos | UPDATE | id_aeronaves, id_usuario_comandante, id_estados_vuelo→PLANIFICADO | Formulario | Una (SERIALIZABLE) |
| 32 | Asignar recursos | Operaciones | vuelos_tripulantes | INSERT (+ UPDATE de baja del comandante anterior) | comandante con función COMANDANTE | Backend | Misma |
| 33 | Agregar/Reemplazar/Retirar tripulante | Operaciones | vuelos_tripulantes | INSERT / UPDATE+INSERT / UPDATE | id_usuarios, id_roles_tripulacion, fecha_baja, id_usuario_baja, motivo_baja | Formulario | Una |
| 34 | Cambiar aeronave | Operaciones | vuelos (+ rutas_vuelo) | UPDATE | id_aeronaves (y origen/estado en operativos); la ruta pasa a REQUIERE_REVISION | Formulario | Una |
| 35 | Crear vuelo operativo | Operaciones | vuelos + vuelos_tripulantes | INSERT + INSERT | aeronave, comandante, origen (ubicación de la aeronave), destino, fechas, estado PENDIENTE_CONFIRMACION_COMANDANTE | Formulario | Una (SERIALIZABLE) |
| 36 | Responder asignación (operativo) | Comandante | vuelos + negociaciones_horario_vuelo | UPDATE + INSERT | id_estados_vuelo→PLANIFICADO \| PENDIENTE_RESPUESTA_OPERACIONES \| PENDIENTE_REPLANIFICACION | Formulario | Una |
| 37 | Responder propuesta del comandante | Operaciones | vuelos + negociaciones_horario_vuelo | UPDATE + INSERT | fechas planificadas y estado | Formulario | Una |
| 38 | Planificación operativa | Comandante | vuelos | UPDATE | id_aeropuerto_origen, id_aeropuerto_destino, fecha_planificada_llegada | Formulario | Una |
| 39 | Registrar clima | Comandante | instantaneas_clima | INSERT | condiciones, favorable, observaciones_clima, id_usuario_registrador | Formulario | Una |
| 40 | Guardar ruta | Comandante | rutas_vuelo | UPDATE (anterior) + INSERT (nueva versión) | version, recorrido_planificado, …, estado_revision='BORRADOR', contexto_operativo | Formulario + backend | Una |
| 41 | Presentar ruta | Comandante | rutas_vuelo | UPDATE | estado_revision→PENDIENTE_REVISION, id_usuario_presenta, fecha_presentacion | Backend | Una |
| 42 | Aprobar / devolver ruta | Operaciones | rutas_vuelo | UPDATE | estado_revision→APROBADA\|DEVUELTA, id_usuario_revisor, fecha_revision, observaciones_revision | Formulario | Una |
| 43 | Cambio material del vuelo | Sistema (dentro de la acción del operador) | rutas_vuelo | UPDATE | estado_revision→REQUIERE_REVISION, fecha_invalidacion, causa_invalidacion | Backend (reassess) | Misma que la acción |
| 44 | Guardar hangar / observación | Operaciones / Comandante | informacion_hangar | UPDATE (anterior) + INSERT | version, requiere_hangar, preparacion_completa, observaciones_*, contexto | Formulario | Una |
| 45 | Registrar gestión AA2000 | Operaciones | coordinaciones_aa2000 | INSERT (v1) / UPDATE+INSERT (v n+1) | identificador_gestion, estado, comunicación, respuesta, contexto | Formulario | Una |
| 46 | Registrar novedad | Comandante / Operaciones | bitacora_vuelos | INSERT | tipo_acontecimiento, descripcion_operativa, fecha_acontecimiento, importancia, id_entrada_corregida | Formulario | Una |
| 47 | Iniciar vuelo | Operaciones | vuelos + bitacora_vuelos | UPDATE + INSERT | fecha_salida_real, estado EN_CURSO; hito INICIO | Backend (reloj) | Una |
| 48 | Finalizar vuelo | Operaciones | vuelos, aeronaves, perfiles_comandante, obligaciones_informe_final, bitacora_vuelos | UPDATE, UPDATE, UPDATE, INSERT, INSERT | fecha_llegada_real, FINALIZADO; id_aeropuertos; id_provincias; obligación PENDIENTE; hito FINALIZACION | Backend | Una (misma transacción) |
| 49 | Cancelar vuelo | Operaciones / DTS dueño | vuelos_sanitarios + vuelos + bitacora_vuelos | UPDATE + UPDATE + INSERT | estado CANCELADO; fecha_cancelacion, id_usuario_cancelador, id_motivos_cancelacion, motivo_cancelacion_personalizado; hito CANCELACION | Formulario | Una |
| 50 | Pedir prórroga | Comandante | obligaciones_informe_final | UPDATE | vencimiento+24 h, prorroga_utilizada=1, fecha_prorroga | Backend | Una |
| 51 | Presentar informe final | Comandante | informes_finales_vuelo + obligaciones_informe_final | UPDATE (anterior) + INSERT + UPDATE | versión nueva; obligación→PRESENTADO, fecha_presentacion, id_informes_finales_vuelo | Formulario/PDF | Una (PDF guardado antes) |
| 52 | Aprobar informe y completar vuelo | Operaciones | informes_finales_vuelo, obligaciones_informe_final, vuelos | UPDATE ×3 | APROBADO + revisor/fecha; obligación APROBADO; vuelo COMPLETADO | Formulario | Una |
| 53 | Devolver informe | Operaciones | informes_finales_vuelo + obligaciones_informe_final | UPDATE ×2 | DEVUELTO, motivo, revisor; plazo +48 h, prórroga rehabilitada | Formulario | Una |
| 54 | Registrar documento | Comandante / Operaciones | documentos_vuelo + versiones_documento_vuelo | INSERT ×2 | nombre, tipo; v1 con archivo | Formulario/PDF | Una |
| 55 | Nueva versión de documento | Comandante / Operaciones | versiones_documento_vuelo | UPDATE + INSERT | es_version_actual, numero_version+1 | PDF | Una |
| 56 | Retirar documento | Operaciones / autor | documentos_vuelo (+ DELETE del bloqueo) | UPDATE | esta_activo=0, fecha_baja, id_usuario_baja, motivo_baja | Formulario | Una |
| 57 | Adquirir/renovar/liberar bloqueo | Comandante / Operaciones | bloqueos_documento_vuelo | INSERT / UPDATE / DELETE | id_usuario_propietario, fecha_adquisicion, fecha_vencimiento | Backend | Una |
| 58 | Leer notificación | Destinatario | notificaciones | UPDATE | leido=1 | Clic | Una |
| 59 | Crear / editar aeronave | Administrador | aeronaves | INSERT / UPDATE | matrícula, capacidades, equipamiento, ubicación | Formulario | Una |
| 60 | Activar-desactivar / mover aeronave | Administrador / Operaciones | aeronaves | UPDATE | esta_activa / id_aeropuertos | Formulario | Una |
| 61 | Alta/edición/baja de provincia, localidad o aeropuerto | Administrador | provincias / localidades / aeropuertos | INSERT / UPDATE | campos del catálogo, esta_activa(o) | Formulario | Una |
| 62 | Ubicación manual del comandante | Administrador / Operaciones | perfiles_comandante | UPDATE | id_provincias | Formulario | Una |
| 63 | Clasificar / retirar función | Administrador | clasificaciones_tripulacion | INSERT / UPDATE | función, fecha_baja, id_usuario_baja, motivo_baja | URL + formulario | Una |
| 64 | Registrar/renovar habilitación | Administrador | habilitaciones_profesionales + decisiones_habilitacion | INSERT ×2 | ver ficha | Formulario | Una |
| 65 | Verificar/rechazar/revocar habilitación | Administrador ≠ titular | habilitaciones_profesionales + decisiones_habilitacion | UPDATE + INSERT | estado_verificacion, fecha_verificacion, id_usuario_verificador | Formulario | Una |
| 66 | Adjuntar documento de habilitación | Administrador | documentos_habilitacion + decisiones_habilitacion (+ habilitaciones_profesionales) | INSERT ×2 (+ UPDATE) | ver ficha | PDF | T6; el análisis antimalware se registra luego en T7 |
| 67 | Análisis antimalware | Sistema / Administrador | documentos_habilitacion + decisiones_habilitacion | UPDATE + INSERT | estado_analisis, fecha_analisis, motor_analisis, detalle_analisis | ClamAV | T7 |
| 68 | Retirar / bloquear documento de habilitación | Administrador ≠ titular | documentos_habilitacion + decisiones_habilitacion | UPDATE + INSERT | fecha_baja… / bloqueo_conservacion, motivo_bloqueo | Formulario | Una |
| 69 | Registrar consulta externa | Administrador ≠ titular | consultas_externas_habilitacion + decisiones_habilitacion | INSERT ×2 | ver ficha | Formulario | Una |
| 70 | Crear / dar de baja política; activar lote | Administrador | politicas_habilitacion | INSERT / UPDATE | ver ficha | Formulario | Una (lote en una sola) |
| 71 | Regularizar documentos heredados | Administrador | documentos_habilitacion + decisiones_habilitacion (+ habilitaciones_profesionales) | UPDATE + INSERT (+ UPDATE) | huella (REGULARIZACION), estado_analisis, fecha_regularizacion | Backend | Una por documento |
| 72 | Barrido de plazos de informes (cada 60 s) | Proceso automático | notificaciones + eventos_auditoria | INSERT | FINAL_REPORT_DUE_SOON / OVERDUE / COMMANDER_BLOCKED | Reloj | Una por obligación |
| 73 | Monitoreo de elegibilidad (cada hora) y avisos de vencimiento | Proceso automático | notificaciones | INSERT | CREW_ELIGIBILITY_REVIEW, CREDENTIAL_EXPIRY | Reloj | Una por elemento |
| 74 | Reintento de análisis (cada 5 min) | Proceso automático | documentos_habilitacion + decisiones_habilitacion | UPDATE + INSERT | estado_analisis | ClamAV | Una por documento |
| 75 | Arranque con administrador inicial | Proceso automático | personas, usuarios, usuarios_roles, correos_electronicos | INSERT | Administrador Inicial | Propiedades de entorno | Una |
| 76 | Aplicar migración | Flyway | flyway_schema_history (y las demás) | INSERT | una fila por versión | Flyway | Una por migración |
