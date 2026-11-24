/* ============================================================================
   CONSULTAS DE FLUJO DE DATOS - Vuelos Sanitarios (SQL Server, base vuelos_sanitarios)

   Para qué sirve: seguir, tabla por tabla y en orden, cómo se van cargando los
   datos cuando se crea un usuario, se solicita un vuelo, se planifica, se vuela,
   se cierra con un informe y qué rastro deja la auditoría.

   Son sólo SELECT: no insertan, modifican ni borran nada. Se pueden ejecutar
   contra la base habitual sin riesgo.

   Cómo usarlo
     1. Ejecutá el bloque "PARÁMETROS" (siempre, aunque sólo corras una sección).
     2. Ejecutá la sección que quieras. Cada SELECT se puede correr por separado.
     3. Si dejás @nombre_usuario o @codigo_vuelo en NULL se toma el último usuario
        o el último vuelo creado, así se ve el flujo del dato más reciente.

   Convenciones
     - Las fechas de eventos_auditoria están en UTC.
     - "Baja lógica" = fecha_baja / esta_activo: los registros no se borran.
     - Orden de las secciones = orden en que el sistema carga los datos.

   Secciones
     1. Alta de un usuario
     2. Activación de cuenta y verificación de correo
     3. Solicitud de vuelo sanitario (DTS)
     4. Vuelo operativo (Operaciones)
     5. Planificación: aeropuertos, ruta, comandante, aeronave, tripulación
     6. Ejecución: bitácora, clima, hangar, coordinaciones y documentos
     7. Cierre: informe final y obligaciones
     8. Auditoría
     9. Notificaciones
    10. Panorama general y controles de consistencia
   ============================================================================ */

/* ----------------------------------------------------------------------------
   PARÁMETROS
   ---------------------------------------------------------------------------- */
DECLARE @nombre_usuario NVARCHAR(100) = NULL;   -- p. ej. N'jperez'; NULL = último usuario creado
DECLARE @codigo_vuelo   NVARCHAR(50)  = NULL;   -- p. ej. el código de un vuelo; NULL = último vuelo creado

DECLARE @id_usuario BIGINT = COALESCE(
    (SELECT id_usuarios FROM usuarios WHERE nombre_usuario = @nombre_usuario),
    (SELECT TOP 1 id_usuarios FROM usuarios ORDER BY fecha_creacion DESC, id_usuarios DESC));
DECLARE @id_persona BIGINT = (SELECT id_personas FROM usuarios WHERE id_usuarios = @id_usuario);

DECLARE @id_vuelo BIGINT = COALESCE(
    (SELECT id_vuelos FROM vuelos WHERE codigo_vuelo = @codigo_vuelo),
    (SELECT TOP 1 id_vuelos FROM vuelos ORDER BY fecha_creacion DESC, id_vuelos DESC));

SELECT @id_usuario AS usuario_analizado, @id_persona AS persona_analizada, @id_vuelo AS vuelo_analizado;


/* ============================================================================
   1. ALTA DE UN USUARIO
   Lo carga AuthService.createPending (POST /api/auth/users) en una sola
   transacción. Orden de inserción:
     personas -> usuarios -> usuarios_roles -> correos_electronicos -> telefonos
     -> activaciones_cuenta -> (perfiles_comandante si es comandante)
     -> eventos_auditoria (USER / USUARIO_CREADO)
   ============================================================================ */

-- 1.1 Persona: datos de identidad (se reutiliza si el DNI ya existía, p. ej. un paciente)
SELECT id_personas, nombre_persona, apellido_persona, dni, fecha_nacimiento,
       version_identidad, fecha_creacion, fecha_actualizacion
FROM personas
WHERE id_personas = @id_persona;

-- 1.2 Cuenta de acceso: nace en PENDIENTE_ACTIVACION con contraseña temporal
SELECT id_usuarios, nombre_usuario, id_personas, estado_cuenta, esta_activo,
       debe_cambiar_contrasena, version_credenciales,
       fecha_baja, id_usuario_baja, motivo_baja, fecha_creacion, fecha_actualizacion
FROM usuarios
WHERE id_usuarios = @id_usuario;

-- 1.3 Roles asignados al usuario (catálogo roles + tabla puente usuarios_roles)
SELECT ur.id_usuarios_roles, r.codigo_rol, r.nombre_rol, r.esta_activo AS rol_activo, ur.fecha_asignacion
FROM usuarios_roles ur
JOIN roles r ON r.id_roles = ur.id_roles
WHERE ur.id_usuarios = @id_usuario
ORDER BY ur.fecha_asignacion;

-- 1.4 Correos de la persona (el principal y su estado de verificación)
SELECT id_correos_electronicos, direccion, tipo_correo_electronico, es_principal,
       fecha_verificacion, fecha_baja, motivo_baja, fecha_creacion
FROM correos_electronicos
WHERE id_personas = @id_persona
ORDER BY es_principal DESC, fecha_creacion;

-- 1.5 Teléfonos de la persona
SELECT id_telefonos, numero, codigo_pais, tipo_telefono, es_principal,
       fecha_baja, motivo_baja, fecha_creacion
FROM telefonos
WHERE id_personas = @id_persona
ORDER BY es_principal DESC, fecha_creacion;

-- 1.6 Código de activación generado al crear la cuenta (sólo se guarda su hash)
SELECT id_activaciones_cuenta, id_usuarios, fecha_creacion, fecha_expiracion,
       fecha_utilizacion, intentos_fallidos, id_usuario_administrador_creador
FROM activaciones_cuenta
WHERE id_usuarios = @id_usuario
ORDER BY fecha_creacion DESC;

-- 1.7 Perfil de comandante (sólo existe si el usuario tiene el rol COMANDANTE)
SELECT pc.id_perfiles_comandante, pc.numero_licencia, p.nombre_provincia AS provincia_actual,
       pc.fecha_ubicacion_actual, pc.id_usuario_ubicacion, pc.fecha_creacion
FROM perfiles_comandante pc
LEFT JOIN provincias p ON p.id_provincias = pc.id_provincias
WHERE pc.id_personas = @id_persona;

-- 1.8 Auditoría de la cuenta (alta, activación, cambios de rol, bajas, contraseñas)
SELECT id_eventos_auditoria, fecha_ocurrencia, tipo_entidad, operacion,
       id_usuario_actor, valores_anteriores, valores_nuevos
FROM eventos_auditoria
WHERE tipo_entidad IN ('USER', 'USER_ROLE')
  AND entidad_id = @id_usuario
ORDER BY fecha_ocurrencia, id_eventos_auditoria;

-- 1.9 Vista completa: una fila por usuario con todo lo anterior resumido (últimos 20 creados)
SELECT TOP (20)
       u.id_usuarios, u.nombre_usuario, p.nombre_persona, p.apellido_persona, p.dni,
       u.estado_cuenta, u.esta_activo,
       (SELECT STRING_AGG(r.codigo_rol, ', ') FROM usuarios_roles ur JOIN roles r ON r.id_roles = ur.id_roles
         WHERE ur.id_usuarios = u.id_usuarios) AS roles,
       (SELECT COUNT(*) FROM correos_electronicos c WHERE c.id_personas = p.id_personas AND c.fecha_baja IS NULL) AS correos_vigentes,
       (SELECT COUNT(*) FROM telefonos t WHERE t.id_personas = p.id_personas AND t.fecha_baja IS NULL) AS telefonos_vigentes,
       u.fecha_creacion
FROM usuarios u
JOIN personas p ON p.id_personas = u.id_personas
ORDER BY u.fecha_creacion DESC, u.id_usuarios DESC;


/* ============================================================================
   2. ACTIVACIÓN DE CUENTA Y VERIFICACIÓN DE CORREO
   Activación (POST /api/auth/activar-cuenta): marca fecha_utilizacion en
   activaciones_cuenta y pasa usuarios.estado_cuenta a ACTIVO.
   Verificación (POST /api/auth/me/correos/{id}/verificacion[/confirmar]):
   inserta en verificaciones_correo y, al confirmar, completa
   correos_electronicos.fecha_verificacion.
   ============================================================================ */

-- 2.1 Estado de la cuenta frente a su activación
SELECT u.nombre_usuario, u.estado_cuenta, u.debe_cambiar_contrasena,
       a.fecha_creacion AS codigo_generado, a.fecha_expiracion, a.fecha_utilizacion, a.intentos_fallidos
FROM usuarios u
LEFT JOIN activaciones_cuenta a ON a.id_usuarios = u.id_usuarios
WHERE u.id_usuarios = @id_usuario
ORDER BY a.fecha_creacion DESC;

-- 2.2 Intentos de verificación de los correos de la persona
SELECT v.id_verificaciones_correo, c.direccion, v.fecha_creacion, v.fecha_envio,
       v.fecha_vencimiento, v.fecha_uso, v.fecha_invalidacion, v.motivo_invalidacion,
       v.intentos_fallidos, v.id_usuario_solicitante
FROM verificaciones_correo v
JOIN correos_electronicos c ON c.id_correos_electronicos = v.id_correos_electronicos
WHERE c.id_personas = @id_persona
ORDER BY v.fecha_creacion DESC;

-- 2.3 Cuentas todavía sin activar (útil para ver qué quedó a mitad de camino)
SELECT u.id_usuarios, u.nombre_usuario, u.fecha_creacion,
       MAX(a.fecha_expiracion) AS ultimo_codigo_vence
FROM usuarios u
LEFT JOIN activaciones_cuenta a ON a.id_usuarios = u.id_usuarios
WHERE u.estado_cuenta = 'PENDIENTE_ACTIVACION' AND u.esta_activo = 1
GROUP BY u.id_usuarios, u.nombre_usuario, u.fecha_creacion
ORDER BY u.fecha_creacion DESC;


/* ============================================================================
   3. SOLICITUD DE VUELO SANITARIO (DTS)
   FlightService.createSanitary (POST /api/flights o /api/flights/with-patient).
   Orden de inserción:
     [personas -> pacientes si el paciente es nuevo]
     -> vuelos -> vuelos_sanitarios -> informacion_medica_vuelo
     -> eventos_auditoria (FLIGHT / CREATE_SANITARY) -> notificaciones
   Luego Operaciones aprueba o rechaza y DTS responde contrapropuestas
   (negociaciones_horario_vuelo).
   ============================================================================ */

-- 3.1 Vuelo: cabecera común a todos los tipos de vuelo
SELECT v.id_vuelos, v.codigo_vuelo, tv.codigo_tipo_vuelo AS tipo, ev.codigo_estado_vuelo AS estado,
       v.motivo_vuelo, v.id_usuario_creador, u.nombre_usuario AS creado_por,
       v.fecha_planificada_salida, v.fecha_planificada_llegada,
       v.fecha_salida_real, v.fecha_llegada_real, v.fecha_creacion, v.fecha_actualizacion
FROM vuelos v
JOIN tipos_vuelo tv ON tv.id_tipos_vuelo = v.id_tipos_vuelo
JOIN estados_vuelo ev ON ev.id_estados_vuelo = v.id_estados_vuelo
LEFT JOIN usuarios u ON u.id_usuarios = v.id_usuario_creador
WHERE v.id_vuelos = @id_vuelo;

-- 3.2 Extensión sanitaria: solicitud, prioridad, localidades y evaluación
SELECT vs.id_vuelos_sanitarios, es.codigo_estado_solicitud AS estado_solicitud,
       pr.codigo_prioridad_vuelo AS prioridad, vs.extrema_urgencia, vs.justificacion_extrema_urgencia,
       vs.fecha_solicitada, vs.fecha_limite_traslado,
       lo.nombre_localidad AS localidad_origen, ld.nombre_localidad AS localidad_destino,
       us.nombre_usuario AS solicitante, ue.nombre_usuario AS evaluador,
       vs.fecha_evaluacion, vs.motivo_rechazo
FROM vuelos_sanitarios vs
JOIN estados_solicitud_sanitaria es ON es.id_estados_solicitud_sanitaria = vs.id_estados_solicitud_sanitaria
LEFT JOIN prioridades_vuelo pr ON pr.id_prioridades_vuelo = vs.id_prioridades_vuelo
LEFT JOIN localidades lo ON lo.id_localidades = vs.id_localidad_origen
LEFT JOIN localidades ld ON ld.id_localidades = vs.id_localidad_destino
LEFT JOIN usuarios us ON us.id_usuarios = vs.id_usuario_solicitante
LEFT JOIN usuarios ue ON ue.id_usuarios = vs.id_usuario_evaluador
WHERE vs.id_vuelos = @id_vuelo;

-- 3.3 Paciente del vuelo (pacientes -> personas) y su ficha médica
SELECT pa.id_pacientes, pe.nombre_persona, pe.apellido_persona, pe.dni, pe.fecha_nacimiento,
       im.diagnostico, pc.nombre_condicion_paciente AS condicion, im.condicion_medica,
       im.requiere_equipamiento_especial, im.observaciones_medicas, im.fecha_creacion, im.fecha_actualizacion
FROM vuelos_sanitarios vs
JOIN pacientes pa ON pa.id_pacientes = vs.id_pacientes
JOIN personas pe ON pe.id_personas = pa.id_personas
LEFT JOIN informacion_medica_vuelo im ON im.id_vuelos = vs.id_vuelos
LEFT JOIN condiciones_paciente pc ON pc.id_condiciones_paciente = im.id_condiciones_paciente
WHERE vs.id_vuelos = @id_vuelo;

-- 3.4 Negociación de horario entre DTS, Operaciones y comandante (sólo se agregan filas)
SELECT n.id_negociaciones_horario_vuelo, n.fecha_ocurrencia, n.tipo_negociacion,
       n.fecha_hora_propuesta, n.fecha_hora_llegada_propuesta, n.motivo_negociacion,
       u.nombre_usuario AS actor, n.id_negociacion_respondida
FROM negociaciones_horario_vuelo n
LEFT JOIN usuarios u ON u.id_usuarios = n.id_usuario_actor
WHERE n.id_vuelos = @id_vuelo
ORDER BY n.fecha_ocurrencia, n.id_negociaciones_horario_vuelo;

-- 3.5 Últimas solicitudes sanitarias creadas, con su estado
SELECT TOP (20) v.codigo_vuelo, es.codigo_estado_solicitud AS estado_solicitud,
       ev.codigo_estado_vuelo AS estado_vuelo, vs.fecha_solicitada, vs.extrema_urgencia
FROM vuelos_sanitarios vs
JOIN vuelos v ON v.id_vuelos = vs.id_vuelos
JOIN estados_vuelo ev ON ev.id_estados_vuelo = v.id_estados_vuelo
JOIN estados_solicitud_sanitaria es ON es.id_estados_solicitud_sanitaria = vs.id_estados_solicitud_sanitaria
ORDER BY vs.fecha_solicitada DESC;


/* ============================================================================
   4. VUELO OPERATIVO (Operaciones)
   FlightService.createOperational (POST /api/flights/operational): inserta en
   vuelos con un tipo operativo (REGRESO_BASE, REPOSICIONAMIENTO, TRASLADO_OPERATIVO,
   ENTRENAMIENTO, OTRO) y queda PENDIENTE_CONFIRMACION_COMANDANTE. No tiene fila
   en vuelos_sanitarios ni en informacion_medica_vuelo.
   ============================================================================ */

-- 4.1 Últimos vuelos operativos (los que no tienen extensión sanitaria)
SELECT TOP (20) v.codigo_vuelo, tv.codigo_tipo_vuelo AS tipo, ev.codigo_estado_vuelo AS estado,
       v.motivo_vuelo, a.matricula, uc.nombre_usuario AS comandante, v.fecha_creacion
FROM vuelos v
JOIN tipos_vuelo tv ON tv.id_tipos_vuelo = v.id_tipos_vuelo
JOIN estados_vuelo ev ON ev.id_estados_vuelo = v.id_estados_vuelo
LEFT JOIN aeronaves a ON a.id_aeronaves = v.id_aeronaves
LEFT JOIN usuarios uc ON uc.id_usuarios = v.id_usuario_comandante
WHERE NOT EXISTS (SELECT 1 FROM vuelos_sanitarios vs WHERE vs.id_vuelos = v.id_vuelos)
ORDER BY v.fecha_creacion DESC;

-- 4.2 Vuelos por tipo y estado (cómo se reparte lo cargado)
SELECT tv.codigo_tipo_vuelo AS tipo, ev.codigo_estado_vuelo AS estado, COUNT(*) AS cantidad
FROM vuelos v
JOIN tipos_vuelo tv ON tv.id_tipos_vuelo = v.id_tipos_vuelo
JOIN estados_vuelo ev ON ev.id_estados_vuelo = v.id_estados_vuelo
GROUP BY tv.codigo_tipo_vuelo, ev.codigo_estado_vuelo
ORDER BY tv.codigo_tipo_vuelo, ev.codigo_estado_vuelo;


/* ============================================================================
   5. PLANIFICACIÓN: AEROPUERTOS, RUTA, COMANDANTE, AERONAVE, TRIPULACIÓN
   Cada paso actualiza columnas de vuelos o inserta filas en tablas hijas, y deja
   un evento en eventos_auditoria:
     SET_AIRPORTS / OPERATIONAL_PLANNING -> vuelos.id_aeropuerto_origen/destino
     FLIGHT_ROUTE SUBMIT                 -> rutas_vuelo (nueva versión)
     ASSIGN_FLIGHT_COMMANDER             -> vuelos.id_usuario_comandante (+ excepcion geográfica)
     ASSIGN_FLIGHT_AIRCRAFT / CHANGE_AIRCRAFT -> vuelos.id_aeronaves
     FLIGHT_CREW CREATE / REPLACE / REMOVE    -> vuelos_tripulantes
     personal sanitario                  -> vuelos_personal_sanitario
   ============================================================================ */

-- 5.1 Aeropuertos, comandante y aeronave elegidos en el vuelo
SELECT v.codigo_vuelo,
       ao.codigo_oaci AS origen, v.estado_aeropuerto_origen,
       ad.codigo_oaci AS destino, v.estado_aeropuerto_destino,
       v.fecha_aeropuertos, uap.nombre_usuario AS aeropuertos_definidos_por,
       uc.nombre_usuario AS comandante, a.matricula AS aeronave, a.modelo
FROM vuelos v
LEFT JOIN aeropuertos ao ON ao.id_aeropuertos = v.id_aeropuerto_origen
LEFT JOIN aeropuertos ad ON ad.id_aeropuertos = v.id_aeropuerto_destino
LEFT JOIN usuarios uap ON uap.id_usuarios = v.id_usuario_aeropuertos
LEFT JOIN usuarios uc ON uc.id_usuarios = v.id_usuario_comandante
LEFT JOIN aeronaves a ON a.id_aeronaves = v.id_aeronaves
WHERE v.id_vuelos = @id_vuelo;

-- 5.2 Ruta: una fila por versión (la vigente tiene es_version_actual = 1)
SELECT r.version, r.es_version_actual, r.estado_revision, r.altitud_pies, r.distancia_nm,
       r.tiempo_estimado_minutos, aa.codigo_oaci AS alterno,
       up.nombre_usuario AS presentada_por, r.fecha_presentacion,
       ur.nombre_usuario AS revisada_por, r.fecha_revision, r.observaciones_revision,
       r.fecha_invalidacion, r.causa_invalidacion
FROM rutas_vuelo r
LEFT JOIN aeropuertos aa ON aa.id_aeropuertos = r.id_aeropuerto_alternativo
LEFT JOIN usuarios up ON up.id_usuarios = r.id_usuario_presenta
LEFT JOIN usuarios ur ON ur.id_usuarios = r.id_usuario_revisor
WHERE r.id_vuelos = @id_vuelo
ORDER BY r.version;

-- 5.3 Excepciones geográficas del comandante asignado (si fue de otra provincia)
SELECT e.*
FROM excepciones_geograficas_comandante e
WHERE e.id_vuelos = @id_vuelo;

-- 5.4 Tripulación del vuelo (vigentes y retiradas; la baja es lógica)
SELECT vt.id_vuelos_tripulantes, u.nombre_usuario, rt.codigo_rol_tripulacion AS funcion,
       ua.nombre_usuario AS asignado_por, vt.fecha_creacion,
       vt.fecha_baja, ub.nombre_usuario AS retirado_por, vt.motivo_baja
FROM vuelos_tripulantes vt
JOIN usuarios u ON u.id_usuarios = vt.id_usuarios
JOIN roles_tripulacion rt ON rt.id_roles_tripulacion = vt.id_roles_tripulacion
LEFT JOIN usuarios ua ON ua.id_usuarios = vt.id_usuario_asignador
LEFT JOIN usuarios ub ON ub.id_usuarios = vt.id_usuario_baja
WHERE vt.id_vuelos = @id_vuelo
ORDER BY vt.fecha_creacion;

-- 5.5 Personal sanitario del vuelo (médico / enfermero, vigentes y retirados)
SELECT vps.id_vuelos_personal_sanitario, ps.tipo_profesional, ps.matricula,
       pe.nombre_persona, pe.apellido_persona,
       ua.nombre_usuario AS asignado_por, vps.fecha_creacion,
       vps.fecha_baja, vps.motivo_baja
FROM vuelos_personal_sanitario vps
JOIN personal_sanitario ps ON ps.id_personal_sanitario = vps.id_personal_sanitario
JOIN personas pe ON pe.id_personas = ps.id_personas
LEFT JOIN usuarios ua ON ua.id_usuarios = vps.id_usuario_asignador
WHERE vps.id_vuelos = @id_vuelo
ORDER BY vps.fecha_creacion;

-- 5.6 Comandantes y su ubicación actual (de dónde sale la elegibilidad por provincia)
SELECT u.nombre_usuario, pe.nombre_persona, pe.apellido_persona, pc.numero_licencia,
       pr.nombre_provincia AS provincia_actual, pc.fecha_ubicacion_actual
FROM perfiles_comandante pc
JOIN personas pe ON pe.id_personas = pc.id_personas
JOIN usuarios u ON u.id_personas = pe.id_personas
LEFT JOIN provincias pr ON pr.id_provincias = pc.id_provincias
ORDER BY pr.nombre_provincia, pe.apellido_persona;

-- 5.7 Aeronaves, dónde están y si están activas
SELECT a.matricula, a.modelo, a.tipo_aeronave, a.capacidad_pacientes, a.capacidad_tripulacion,
       a.esta_activa, ap.codigo_oaci AS aeropuerto_actual
FROM aeronaves a
LEFT JOIN aeropuertos ap ON ap.id_aeropuertos = a.id_aeropuertos
ORDER BY a.matricula;


/* ============================================================================
   6. EJECUCIÓN: BITÁCORA, CLIMA, HANGAR, COORDINACIONES Y DOCUMENTOS
   Cada registro se agrega (nunca se pisa) con versión o fecha:
     bitacora_vuelos, instantaneas_clima, informacion_hangar (versionada),
     coordinaciones_aa2000 (versionada), documentos_vuelo + versiones_documento_vuelo.
   Los PDF se guardan como archivos; en la base queda sólo su ubicación y tamaño.
   ============================================================================ */

-- 6.1 Bitácora operativa del vuelo (anotaciones manuales y automáticas)
SELECT b.id_bitacora_vuelos,
       COALESCE(b.fecha_acontecimiento, b.fecha_registro_operativo, b.fecha_cambio) AS fecha,
       b.tipo_acontecimiento, b.importancia, b.origen_acontecimiento,
       b.descripcion_operativa, b.campo, b.valor_anterior, b.valor_nuevo,
       u.nombre_usuario AS usuario, b.id_entrada_corregida, b.motivo_correccion
FROM bitacora_vuelos b
LEFT JOIN usuarios u ON u.id_usuarios = b.id_usuarios
WHERE b.id_vuelos = @id_vuelo
ORDER BY COALESCE(b.fecha_acontecimiento, b.fecha_registro_operativo, b.fecha_cambio), b.id_bitacora_vuelos;

-- 6.2 Condiciones meteorológicas registradas
SELECT c.fecha_registro, c.condiciones, c.favorable, c.observaciones_clima,
       u.nombre_usuario AS registrado_por
FROM instantaneas_clima c
LEFT JOIN usuarios u ON u.id_usuarios = c.id_usuario_registrador
WHERE c.id_vuelos = @id_vuelo
ORDER BY c.fecha_registro;

-- 6.3 Información de hangar (versiones; la vigente tiene es_version_actual = 1)
SELECT h.version, h.es_version_actual, h.requiere_hangar, h.combustible_litros,
       h.preparacion_completa, h.observaciones_hangar, h.observaciones_comandante,
       u.nombre_usuario AS registrado_por, h.fecha_creacion
FROM informacion_hangar h
LEFT JOIN usuarios u ON u.id_usuarios = h.id_usuario_registrador
WHERE h.id_vuelos = @id_vuelo
ORDER BY h.version;

-- 6.4 Coordinaciones con el aeropuerto (AA2000): una fila por gestión y versión
SELECT c.identificador_gestion, c.version, c.es_version_actual, c.estado_autorizacion,
       ap.codigo_oaci AS aeropuerto, c.finalidad_gestion, c.canal_comunicacion,
       c.fecha_slot, c.fecha_comunicacion, c.fecha_respuesta, c.motivo_cambio,
       u.nombre_usuario AS registrado_por, c.fecha_creacion
FROM coordinaciones_aa2000 c
LEFT JOIN aeropuertos ap ON ap.id_aeropuertos = c.id_aeropuerto_gestion
LEFT JOIN usuarios u ON u.id_usuarios = c.id_usuario_registrador
WHERE c.id_vuelos = @id_vuelo
ORDER BY c.identificador_gestion, c.version;

-- 6.5 Documentos del vuelo y su versión vigente (activos y retirados)
SELECT d.id_documentos_vuelo, td.codigo_tipo_documento AS tipo, d.nombre_documento, d.esta_activo,
       vd.numero_version AS version_vigente, vd.nombre_archivo_original,
       vd.tamanio_bytes, vd.ubicacion_almacenamiento AS archivo_en_disco,
       uc.nombre_usuario AS cargada_por, vd.fecha_creacion AS cargada_el,
       d.fecha_baja, ub.nombre_usuario AS retirado_por, d.motivo_baja
FROM documentos_vuelo d
JOIN tipos_documento td ON td.id_tipos_documento = d.id_tipos_documento
LEFT JOIN versiones_documento_vuelo vd
       ON vd.id_documentos_vuelo = d.id_documentos_vuelo AND vd.es_version_actual = 1
LEFT JOIN usuarios uc ON uc.id_usuarios = vd.id_usuario_creador
LEFT JOIN usuarios ub ON ub.id_usuarios = d.id_usuario_baja
WHERE d.id_vuelos = @id_vuelo
ORDER BY d.fecha_creacion;

-- 6.6 Historial completo de versiones de cada documento
SELECT d.nombre_documento, vd.numero_version, vd.es_version_actual,
       vd.nombre_archivo_original, vd.tamanio_bytes, vd.ubicacion_almacenamiento,
       u.nombre_usuario AS cargada_por, vd.fecha_creacion
FROM versiones_documento_vuelo vd
JOIN documentos_vuelo d ON d.id_documentos_vuelo = vd.id_documentos_vuelo
LEFT JOIN usuarios u ON u.id_usuarios = vd.id_usuario_creador
WHERE d.id_vuelos = @id_vuelo
ORDER BY d.nombre_documento, vd.numero_version;

-- 6.7 Bloqueos de edición documental vigentes (un usuario por documento, vencen solos)
SELECT d.nombre_documento, u.nombre_usuario AS bloqueado_por,
       b.fecha_adquisicion, b.fecha_vencimiento,
       CASE WHEN b.fecha_vencimiento > SYSUTCDATETIME() THEN 'VIGENTE' ELSE 'VENCIDO' END AS estado
FROM bloqueos_documento_vuelo b
JOIN documentos_vuelo d ON d.id_documentos_vuelo = b.id_documentos_vuelo
JOIN usuarios u ON u.id_usuarios = b.id_usuario_propietario
WHERE d.id_vuelos = @id_vuelo;


/* ============================================================================
   7. CIERRE: INFORME FINAL Y OBLIGACIONES
   Al finalizar el vuelo se crea una fila en obligaciones_informe_final
   (FINAL_REPORT_OBLIGATION / CREATE). El comandante presenta el informe
   (informes_finales_vuelo, versionado, con PDF opcional) y Operaciones lo aprueba o
   lo devuelve; una devolución abre una obligación nueva.
   ============================================================================ */

-- 7.1 Obligaciones de informe del vuelo (es_actual = 1 es la vigente)
SELECT o.numero_obligacion, o.estado_obligacion, o.es_actual,
       u.nombre_usuario AS comandante, o.vencimiento_original, o.vencimiento,
       o.prorroga_utilizada, o.fecha_prorroga, o.fecha_presentacion,
       o.fecha_devolucion, o.motivo_devolucion, o.fecha_aprobacion
FROM obligaciones_informe_final o
JOIN usuarios u ON u.id_usuarios = o.id_usuario_comandante
WHERE o.id_vuelos = @id_vuelo
ORDER BY o.numero_obligacion;

-- 7.2 Informes presentados (una versión por presentación)
SELECT i.version, i.es_version_actual, i.estado_revision, i.horas_vuelo,
       i.combustible_consumido_litros, i.incidentes, i.resumen,
       i.adjunto_nombre_original, i.adjunto_tamanio_bytes, i.adjunto_ubicacion,
       uc.nombre_usuario AS presentado_por, i.fecha_creacion,
       ur.nombre_usuario AS revisado_por, i.fecha_revision, i.motivo_devolucion, i.origen_decision
FROM informes_finales_vuelo i
LEFT JOIN usuarios uc ON uc.id_usuarios = i.id_usuario_creador
LEFT JOIN usuarios ur ON ur.id_usuarios = i.id_usuario_revisor
WHERE i.id_vuelos = @id_vuelo
ORDER BY i.version;

-- 7.3 Comandantes con informes vencidos o pendientes
SELECT u.nombre_usuario AS comandante, o.id_vuelos, v.codigo_vuelo, o.estado_obligacion,
       o.vencimiento, o.prorroga_utilizada
FROM obligaciones_informe_final o
JOIN usuarios u ON u.id_usuarios = o.id_usuario_comandante
JOIN vuelos v ON v.id_vuelos = o.id_vuelos
WHERE o.es_actual = 1 AND o.fecha_aprobacion IS NULL
ORDER BY o.vencimiento;


/* ============================================================================
   8. AUDITORÍA
   AuditService.record inserta en eventos_auditoria en la MISMA transacción que el
   cambio auditado. Es de sólo inserción (la base impide UPDATE y DELETE).
     tipo_entidad = qué se tocó (FLIGHT, DOCUMENT, USER, AIRCRAFT, ...)
     entidad_id   = id de la fila tocada
     operacion    = qué se hizo (CREATE, CANCEL, DEACTIVATE, ...)
     valores_anteriores / valores_nuevos = instantánea JSON
     id_vuelos    = vuelo asociado (NULL para usuarios, geografía, etc.)
   ============================================================================ */

-- 8.1 Línea de tiempo del vuelo: eventos de auditoría ordenados
SELECT e.fecha_ocurrencia, e.tipo_entidad, e.operacion, e.entidad_id,
       u.nombre_usuario AS actor, e.valores_anteriores, e.valores_nuevos
FROM eventos_auditoria e
LEFT JOIN usuarios u ON u.id_usuarios = e.id_usuario_actor
WHERE e.id_vuelos = @id_vuelo
ORDER BY e.fecha_ocurrencia, e.id_eventos_auditoria;

-- 8.2 Todo lo que el flujo del vuelo cargó, en una sola línea de tiempo (varias tablas)
SELECT fecha, tabla_origen, detalle
FROM (
    SELECT fecha_creacion AS fecha, 'vuelos' AS tabla_origen,
           CONCAT('Vuelo creado: ', codigo_vuelo) AS detalle
    FROM vuelos WHERE id_vuelos = @id_vuelo
  UNION ALL
    SELECT fecha_ocurrencia, 'negociaciones_horario_vuelo',
           CONCAT(tipo_negociacion, ' - ', motivo_negociacion)
    FROM negociaciones_horario_vuelo WHERE id_vuelos = @id_vuelo
  UNION ALL
    SELECT fecha_creacion, 'rutas_vuelo',
           CONCAT('Ruta v', version, ' ', estado_revision)
    FROM rutas_vuelo WHERE id_vuelos = @id_vuelo
  UNION ALL
    SELECT fecha_creacion, 'vuelos_tripulantes',
           CONCAT('Tripulante asignado, usuario ', id_usuarios)
    FROM vuelos_tripulantes WHERE id_vuelos = @id_vuelo
  UNION ALL
    SELECT fecha_creacion, 'vuelos_personal_sanitario',
           CONCAT('Personal sanitario asignado, id ', id_personal_sanitario)
    FROM vuelos_personal_sanitario WHERE id_vuelos = @id_vuelo
  UNION ALL
    SELECT fecha_registro, 'instantaneas_clima', CONCAT('Clima: ', condiciones)
    FROM instantaneas_clima WHERE id_vuelos = @id_vuelo
  UNION ALL
    SELECT fecha_creacion, 'informacion_hangar', CONCAT('Hangar v', version)
    FROM informacion_hangar WHERE id_vuelos = @id_vuelo
  UNION ALL
    SELECT fecha_creacion, 'coordinaciones_aa2000',
           CONCAT('Coordinación ', identificador_gestion, ' v', version, ' ', estado_autorizacion)
    FROM coordinaciones_aa2000 WHERE id_vuelos = @id_vuelo
  UNION ALL
    SELECT vd.fecha_creacion, 'versiones_documento_vuelo',
           CONCAT(d.nombre_documento, ' v', vd.numero_version)
    FROM versiones_documento_vuelo vd
    JOIN documentos_vuelo d ON d.id_documentos_vuelo = vd.id_documentos_vuelo
    WHERE d.id_vuelos = @id_vuelo
  UNION ALL
    SELECT fecha_creacion, 'informes_finales_vuelo',
           CONCAT('Informe final v', version, ' ', estado_revision)
    FROM informes_finales_vuelo WHERE id_vuelos = @id_vuelo
  UNION ALL
    SELECT fecha_ocurrencia, 'eventos_auditoria', CONCAT(tipo_entidad, ' / ', operacion)
    FROM eventos_auditoria WHERE id_vuelos = @id_vuelo
) t
ORDER BY fecha;

-- 8.3 Qué hizo un usuario en el sistema (como actor)
SELECT e.fecha_ocurrencia, e.tipo_entidad, e.operacion, e.entidad_id, e.id_vuelos
FROM eventos_auditoria e
WHERE e.id_usuario_actor = @id_usuario
ORDER BY e.fecha_ocurrencia DESC, e.id_eventos_auditoria DESC;

-- 8.4 Catálogo de lo que se audita: tipos de entidad y operaciones con su frecuencia
SELECT tipo_entidad, operacion, COUNT(*) AS cantidad,
       MIN(fecha_ocurrencia) AS primero, MAX(fecha_ocurrencia) AS ultimo
FROM eventos_auditoria
GROUP BY tipo_entidad, operacion
ORDER BY tipo_entidad, operacion;

-- 8.5 Últimos 50 eventos del sistema, con vuelo y actor
SELECT TOP (50) e.fecha_ocurrencia, e.tipo_entidad, e.operacion, e.entidad_id,
       v.codigo_vuelo, u.nombre_usuario AS actor
FROM eventos_auditoria e
LEFT JOIN vuelos v ON v.id_vuelos = e.id_vuelos
LEFT JOIN usuarios u ON u.id_usuarios = e.id_usuario_actor
ORDER BY e.fecha_ocurrencia DESC, e.id_eventos_auditoria DESC;

-- 8.6 Historial de cambios de una aeronave (lo que muestra la pantalla de aeronaves)
SELECT e.fecha_ocurrencia, e.operacion, u.nombre_usuario AS actor, e.id_vuelos,
       e.valores_anteriores, e.valores_nuevos
FROM eventos_auditoria e
LEFT JOIN usuarios u ON u.id_usuarios = e.id_usuario_actor
WHERE e.tipo_entidad = 'AIRCRAFT'
ORDER BY e.fecha_ocurrencia DESC;

-- 8.7 Correcciones de identidad de pacientes (CORRECT, RECTIFY_DNI, ASSIGN_DNI)
SELECT e.fecha_ocurrencia, e.operacion, e.entidad_id AS id_paciente_o_persona,
       u.nombre_usuario AS actor, e.valores_anteriores, e.valores_nuevos
FROM eventos_auditoria e
LEFT JOIN usuarios u ON u.id_usuarios = e.id_usuario_actor
WHERE e.tipo_entidad = 'PATIENT_IDENTITY'
ORDER BY e.fecha_ocurrencia DESC;


/* ============================================================================
   9. NOTIFICACIONES
   NotificationService.createOnce inserta en notificaciones (clave_evento evita
   duplicados) en la misma transacción que el hecho que las motiva.
   ============================================================================ */

-- 9.1 Notificaciones del vuelo, a quién y si ya se leyeron
SELECT n.fecha_creacion, u.nombre_usuario AS destinatario, n.tipo_notificacion,
       n.mensaje, n.leido, n.clave_evento
FROM notificaciones n
JOIN usuarios u ON u.id_usuarios = n.id_usuarios
WHERE n.id_vuelos = @id_vuelo
ORDER BY n.fecha_creacion;

-- 9.2 Bandeja de un usuario
SELECT TOP (50) n.fecha_creacion, n.tipo_notificacion, n.mensaje, n.leido, n.id_vuelos
FROM notificaciones n
WHERE n.id_usuarios = @id_usuario
ORDER BY n.fecha_creacion DESC;


/* ============================================================================
   10. PANORAMA GENERAL Y CONTROLES DE CONSISTENCIA
   ============================================================================ */

-- 10.1 Cuántas filas tiene cada tabla del flujo y cuándo se cargó la última
SELECT tabla, filas, ultima_carga
FROM (
    SELECT 'personas' AS tabla, COUNT(*) AS filas, MAX(fecha_creacion) AS ultima_carga FROM personas
    UNION ALL SELECT 'usuarios', COUNT(*), MAX(fecha_creacion) FROM usuarios
    UNION ALL SELECT 'usuarios_roles', COUNT(*), MAX(fecha_asignacion) FROM usuarios_roles
    UNION ALL SELECT 'correos_electronicos', COUNT(*), MAX(fecha_creacion) FROM correos_electronicos
    UNION ALL SELECT 'telefonos', COUNT(*), MAX(fecha_creacion) FROM telefonos
    UNION ALL SELECT 'activaciones_cuenta', COUNT(*), MAX(fecha_creacion) FROM activaciones_cuenta
    UNION ALL SELECT 'verificaciones_correo', COUNT(*), MAX(fecha_creacion) FROM verificaciones_correo
    UNION ALL SELECT 'perfiles_comandante', COUNT(*), MAX(fecha_creacion) FROM perfiles_comandante
    UNION ALL SELECT 'pacientes', COUNT(*), MAX(fecha_creacion) FROM pacientes
    UNION ALL SELECT 'personal_sanitario', COUNT(*), MAX(fecha_creacion) FROM personal_sanitario
    UNION ALL SELECT 'aeronaves', COUNT(*), MAX(fecha_creacion) FROM aeronaves
    UNION ALL SELECT 'vuelos', COUNT(*), MAX(fecha_creacion) FROM vuelos
    UNION ALL SELECT 'vuelos_sanitarios', COUNT(*), MAX(fecha_solicitada) FROM vuelos_sanitarios
    UNION ALL SELECT 'informacion_medica_vuelo', COUNT(*), MAX(fecha_creacion) FROM informacion_medica_vuelo
    UNION ALL SELECT 'negociaciones_horario_vuelo', COUNT(*), MAX(fecha_ocurrencia) FROM negociaciones_horario_vuelo
    UNION ALL SELECT 'rutas_vuelo', COUNT(*), MAX(fecha_creacion) FROM rutas_vuelo
    UNION ALL SELECT 'vuelos_tripulantes', COUNT(*), MAX(fecha_creacion) FROM vuelos_tripulantes
    UNION ALL SELECT 'vuelos_personal_sanitario', COUNT(*), MAX(fecha_creacion) FROM vuelos_personal_sanitario
    UNION ALL SELECT 'bitacora_vuelos', COUNT(*), MAX(COALESCE(fecha_acontecimiento, fecha_registro_operativo, fecha_cambio)) FROM bitacora_vuelos
    UNION ALL SELECT 'instantaneas_clima', COUNT(*), MAX(fecha_registro) FROM instantaneas_clima
    UNION ALL SELECT 'informacion_hangar', COUNT(*), MAX(fecha_creacion) FROM informacion_hangar
    UNION ALL SELECT 'coordinaciones_aa2000', COUNT(*), MAX(fecha_creacion) FROM coordinaciones_aa2000
    UNION ALL SELECT 'documentos_vuelo', COUNT(*), MAX(fecha_creacion) FROM documentos_vuelo
    UNION ALL SELECT 'versiones_documento_vuelo', COUNT(*), MAX(fecha_creacion) FROM versiones_documento_vuelo
    UNION ALL SELECT 'obligaciones_informe_final', COUNT(*), MAX(vencimiento_original) FROM obligaciones_informe_final
    UNION ALL SELECT 'informes_finales_vuelo', COUNT(*), MAX(fecha_creacion) FROM informes_finales_vuelo
    UNION ALL SELECT 'notificaciones', COUNT(*), MAX(fecha_creacion) FROM notificaciones
    UNION ALL SELECT 'eventos_auditoria', COUNT(*), MAX(fecha_ocurrencia) FROM eventos_auditoria
) x
ORDER BY tabla;

-- 10.2 Control: vuelos sin su evento de creación en auditoría (no debería haber filas)
SELECT v.id_vuelos, v.codigo_vuelo, v.fecha_creacion
FROM vuelos v
WHERE NOT EXISTS (
    SELECT 1 FROM eventos_auditoria e
    WHERE e.id_vuelos = v.id_vuelos AND e.tipo_entidad = 'FLIGHT'
      AND e.operacion IN ('CREATE_SANITARY', 'CREATE_OPERATIONAL'));

-- 10.3 Control: documentos activos sin exactamente una versión vigente (no debería haber filas)
SELECT d.id_documentos_vuelo, d.nombre_documento,
       SUM(CASE WHEN vd.es_version_actual = 1 THEN 1 ELSE 0 END) AS versiones_vigentes
FROM documentos_vuelo d
LEFT JOIN versiones_documento_vuelo vd ON vd.id_documentos_vuelo = d.id_documentos_vuelo
WHERE d.esta_activo = 1
GROUP BY d.id_documentos_vuelo, d.nombre_documento
HAVING SUM(CASE WHEN vd.es_version_actual = 1 THEN 1 ELSE 0 END) <> 1;

-- 10.4 Control: usuarios activos sin ningún rol (no debería haber filas)
SELECT u.id_usuarios, u.nombre_usuario
FROM usuarios u
WHERE u.esta_activo = 1
  AND NOT EXISTS (SELECT 1 FROM usuarios_roles ur WHERE ur.id_usuarios = u.id_usuarios);

-- 10.5 Control: vuelos sanitarios sin ficha médica (no debería haber filas)
SELECT vs.id_vuelos, v.codigo_vuelo
FROM vuelos_sanitarios vs
JOIN vuelos v ON v.id_vuelos = vs.id_vuelos
WHERE NOT EXISTS (SELECT 1 FROM informacion_medica_vuelo im WHERE im.id_vuelos = vs.id_vuelos);

-- 10.6 Control: comandantes asignados a un vuelo que no tienen perfil de comandante
SELECT v.codigo_vuelo, u.nombre_usuario
FROM vuelos v
JOIN usuarios u ON u.id_usuarios = v.id_usuario_comandante
WHERE NOT EXISTS (SELECT 1 FROM perfiles_comandante pc WHERE pc.id_personas = u.id_personas);
