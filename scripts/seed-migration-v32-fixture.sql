/* Fixture exclusivamente sintético para la base descartable
   vuelos_validacion_migracion_v32_v47_20261022. No contiene datos reales. */
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF DB_NAME() <> N'$(FixtureDatabase)'
    THROW 51100, 'Fixture restringido a la base descartable de validacion de migraciones.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.flyway_schema_history WHERE version = N'32' AND success = 1)
    THROW 51101, 'La base debe estar reconstruida hasta V32 antes de sembrar el fixture.', 1;
IF EXISTS (SELECT 1 FROM dbo.personas)
    THROW 51102, 'El fixture solo se ejecuta en una base V32 vacia.', 1;

BEGIN TRANSACTION;

DECLARE @adminPersona BIGINT, @opsPersona BIGINT, @comandantePersona BIGINT, @tripulantePersona BIGINT, @pacientePersona BIGINT, @inactivoPersona BIGINT;
DECLARE @admin BIGINT, @ops BIGINT, @comandante BIGINT, @tripulante BIGINT, @inactivo BIGINT, @paciente BIGINT;
DECLARE @aeropuerto BIGINT, @aeropuertoDestino BIGINT, @aeronave BIGINT, @vueloCancelado BIGINT, @vueloHistorico BIGINT, @vueloPlanificado BIGINT, @motivoCancelacion BIGINT;
DECLARE @informe BIGINT, @documento BIGINT;

INSERT dbo.personas (nombre_persona, apellido_persona, dni) VALUES (N'Admin', N'Sintetico', N'200000001'); SET @adminPersona = SCOPE_IDENTITY();
INSERT dbo.personas (nombre_persona, apellido_persona, dni) VALUES (N'Operaciones', N'Sintetico', N'200000002'); SET @opsPersona = SCOPE_IDENTITY();
INSERT dbo.personas (nombre_persona, apellido_persona, dni) VALUES (N'Comandante', N'Sintetico', N'200000003'); SET @comandantePersona = SCOPE_IDENTITY();
INSERT dbo.personas (nombre_persona, apellido_persona, dni) VALUES (N'Tripulante', N'Sintetico', N'200000004'); SET @tripulantePersona = SCOPE_IDENTITY();
INSERT dbo.personas (nombre_persona, apellido_persona, dni) VALUES (N'Paciente', N'Sintetico', N'200000005'); SET @pacientePersona = SCOPE_IDENTITY();
INSERT dbo.personas (nombre_persona, apellido_persona, dni) VALUES (N'Cuenta Inactiva', N'Sintetica', N'200000006'); SET @inactivoPersona = SCOPE_IDENTITY();

INSERT dbo.usuarios (nombre_usuario, hash_contrasena, id_personas, estado_cuenta) VALUES (N'mig_admin', N'synthetic-only', @adminPersona, N'ACTIVO'); SET @admin = SCOPE_IDENTITY();
INSERT dbo.usuarios (nombre_usuario, hash_contrasena, id_personas, estado_cuenta) VALUES (N'mig_ops', N'synthetic-only', @opsPersona, N'ACTIVO'); SET @ops = SCOPE_IDENTITY();
INSERT dbo.usuarios (nombre_usuario, hash_contrasena, id_personas, estado_cuenta) VALUES (N'mig_comandante', N'synthetic-only', @comandantePersona, N'ACTIVO'); SET @comandante = SCOPE_IDENTITY();
INSERT dbo.usuarios (nombre_usuario, hash_contrasena, id_personas, estado_cuenta) VALUES (N'mig_tripulante', N'synthetic-only', @tripulantePersona, N'ACTIVO'); SET @tripulante = SCOPE_IDENTITY();
INSERT dbo.usuarios (nombre_usuario, hash_contrasena, id_personas, esta_activo, estado_cuenta, fecha_baja)
VALUES (N'mig_inactivo', N'synthetic-only', @inactivoPersona, 0, N'DESACTIVADO', DATEADD(DAY, -3, SYSUTCDATETIME())); SET @inactivo = SCOPE_IDENTITY();

INSERT dbo.usuarios_roles (id_usuarios, id_roles)
SELECT @admin, id_roles FROM dbo.roles WHERE codigo_rol = N'ADMINISTRADOR';
INSERT dbo.usuarios_roles (id_usuarios, id_roles)
SELECT @ops, id_roles FROM dbo.roles WHERE codigo_rol = N'OPERACIONES';
INSERT dbo.usuarios_roles (id_usuarios, id_roles)
SELECT @comandante, id_roles FROM dbo.roles WHERE codigo_rol = N'COMANDANTE';

INSERT dbo.perfiles_comandante (numero_licencia, id_personas) VALUES (N'SYNTHCMD001', @comandantePersona);
INSERT dbo.pacientes (id_personas) VALUES (@pacientePersona); SET @paciente = SCOPE_IDENTITY();
INSERT dbo.aeropuertos (codigo_oaci, codigo_iata, nombre_aeropuerto, ciudad, provincia) VALUES (N'SYNT', N'SY1', N'Aeropuerto Sintetico', N'Ciudad Ficticia', N'Provincia Ficticia'); SET @aeropuerto = SCOPE_IDENTITY();
INSERT dbo.aeropuertos (codigo_oaci, codigo_iata, nombre_aeropuerto, ciudad, provincia) VALUES (N'SYND', N'SY2', N'Destino Sintetico', N'Otra Ciudad Ficticia', N'Otra Provincia Ficticia'); SET @aeropuertoDestino = SCOPE_IDENTITY();
INSERT dbo.aeronaves (matricula, modelo, tipo_aeronave, id_aeropuertos) VALUES (N'SYN-V32-001', N'Modelo Sintetico', N'SANITARIA', @aeropuerto); SET @aeronave = SCOPE_IDENTITY();
SELECT @motivoCancelacion = id_motivos_cancelacion FROM dbo.motivos_cancelacion WHERE codigo_motivo_cancelacion = N'OTRO';

INSERT dbo.vuelos (codigo_vuelo, motivo_vuelo, id_tipos_vuelo, id_usuario_creador, id_usuario_comandante, id_aeronaves,
                   id_aeropuerto_origen, id_aeropuerto_destino, id_estados_vuelo, fecha_planificada_salida, fecha_planificada_llegada,
                   fecha_cancelacion, id_usuario_cancelador, id_motivos_cancelacion, motivo_cancelacion_personalizado)
SELECT N'MIG-SAN-CANCEL-001', N'Fixture sintetico', tv.id_tipos_vuelo, @ops, @comandante, @aeronave, @aeropuerto, @aeropuertoDestino,
       ev.id_estados_vuelo, '2026-10-20T09:00:00', '2026-10-20T10:00:00', '2026-10-19T08:00:00', @ops, @motivoCancelacion, N'Cancelacion sintetica'
FROM dbo.tipos_vuelo tv CROSS JOIN dbo.estados_vuelo ev
WHERE tv.codigo_tipo_vuelo = N'SANITARIO' AND ev.codigo_estado_vuelo = N'CANCELADO';
SET @vueloCancelado = SCOPE_IDENTITY();

INSERT dbo.vuelos_sanitarios (fecha_solicitada, id_vuelos, id_pacientes, id_usuario_solicitante, id_estados_solicitud_sanitaria)
SELECT '2026-10-18T23:55:00', @vueloCancelado, @paciente, @ops, es.id_estados_solicitud_sanitaria
FROM dbo.estados_solicitud_sanitaria es WHERE es.codigo_estado_solicitud = N'APROBADO';

INSERT dbo.vuelos (codigo_vuelo, motivo_vuelo, id_tipos_vuelo, id_usuario_creador, id_usuario_comandante, id_aeronaves,
                   id_aeropuerto_origen, id_aeropuerto_destino, id_estados_vuelo, fecha_planificada_salida,
                   fecha_planificada_llegada, fecha_salida_real, fecha_llegada_real)
SELECT N'MIG-OP-HIST-002', N'Vuelo operativo sintetico', tv.id_tipos_vuelo, @ops, @comandante, @aeronave,
       @aeropuerto, @aeropuertoDestino, ev.id_estados_vuelo, '2026-10-20T23:30:00', '2026-10-21T00:20:00',
       '2026-10-20T23:32:00', '2026-10-21T00:19:00'
FROM dbo.tipos_vuelo tv CROSS JOIN dbo.estados_vuelo ev
WHERE tv.codigo_tipo_vuelo = N'TRASLADO_OPERATIVO' AND ev.codigo_estado_vuelo = N'FINALIZADO';
SET @vueloHistorico = SCOPE_IDENTITY();

INSERT dbo.vuelos (codigo_vuelo, motivo_vuelo, id_tipos_vuelo, id_usuario_creador, id_usuario_comandante, id_aeronaves,
                   id_aeropuerto_origen, id_aeropuerto_destino, id_estados_vuelo, fecha_planificada_salida, fecha_planificada_llegada)
SELECT N'MIG-OP-ACT-003', N'Vuelo operativo vigente sintetico', tv.id_tipos_vuelo, @ops, @comandante, @aeronave,
       @aeropuerto, @aeropuertoDestino, ev.id_estados_vuelo, '2026-10-23T08:00:00', '2026-10-23T09:00:00'
FROM dbo.tipos_vuelo tv CROSS JOIN dbo.estados_vuelo ev
WHERE tv.codigo_tipo_vuelo = N'TRASLADO_OPERATIVO' AND ev.codigo_estado_vuelo = N'PLANIFICADO';
SET @vueloPlanificado = SCOPE_IDENTITY();

INSERT dbo.vuelos_tripulantes (id_vuelos, id_usuarios, id_roles_tripulacion, id_usuario_asignador)
SELECT @vueloPlanificado, @tripulante, id_roles_tripulacion, @ops FROM dbo.roles_tripulacion WHERE codigo_rol_tripulacion = N'ENFERMERO';

INSERT dbo.negociaciones_horario_vuelo (tipo_negociacion, fecha_hora_propuesta, motivo_negociacion, id_vuelos, id_usuario_actor)
VALUES (N'COMANDANTE_PROPONE_HORARIO', '2026-10-23T08:15:00', N'Propuesta sintetica previa a V33', @vueloPlanificado, @comandante);

INSERT dbo.documentos_vuelo (nombre_documento, id_vuelos, id_tipos_documento)
SELECT N'adjunto-sintetico.pdf', @vueloHistorico, id_tipos_documento FROM dbo.tipos_documento WHERE codigo_tipo_documento = N'PARTE_MEDICO';
SET @documento = SCOPE_IDENTITY();
INSERT dbo.versiones_documento_vuelo (numero_version, nombre_archivo_original, ubicacion_almacenamiento, tamanio_bytes, id_documentos_vuelo, id_usuario_creador)
VALUES (1, N'adjunto-sintetico.pdf', N'synthetic/migration-fixture/parte-medico.pdf', 512, @documento, @ops);

INSERT dbo.informes_finales_vuelo (resumen, id_vuelos, id_usuario_creador)
VALUES (N'Informe historico sintetico', @vueloHistorico, @comandante);
SET @informe = SCOPE_IDENTITY();
INSERT dbo.obligaciones_informe_final (numero_obligacion, estado_obligacion, vencimiento_original, vencimiento,
                                       fecha_presentacion, fecha_aprobacion, id_vuelos, id_usuario_comandante,
                                       id_informes_finales_vuelo, id_usuario_aprobador)
VALUES (1, N'APROBADO', '2026-10-22T12:00:00+00:00', '2026-10-22T12:00:00+00:00',
        '2026-10-21T12:00:00+00:00', '2026-10-21T13:00:00+00:00', @vueloHistorico, @comandante, @informe, @ops);

INSERT dbo.eventos_auditoria (tipo_entidad, operacion, valores_nuevos, fecha_ocurrencia, id_vuelos, id_usuario_actor, entidad_id)
VALUES (N'FLIGHT', N'FINISH', N'{"estado":"FINALIZADO"}', '2026-10-21T13:00:00', @vueloHistorico, @ops, @vueloHistorico);
INSERT dbo.eventos_auditoria (tipo_entidad, operacion, valores_nuevos, fecha_ocurrencia, id_usuario_actor, entidad_id)
VALUES (N'USER', N'USUARIO_DESACTIVADO', N'{"motivo":"Baja sintetica"}', '2026-10-19T08:00:00', @admin, @inactivo);

COMMIT TRANSACTION;

SELECT N'personas' AS entidad, COUNT_BIG(*) AS filas FROM dbo.personas
UNION ALL SELECT N'usuarios', COUNT_BIG(*) FROM dbo.usuarios
UNION ALL SELECT N'usuarios_roles', COUNT_BIG(*) FROM dbo.usuarios_roles
UNION ALL SELECT N'pacientes', COUNT_BIG(*) FROM dbo.pacientes
UNION ALL SELECT N'aeronaves', COUNT_BIG(*) FROM dbo.aeronaves
UNION ALL SELECT N'vuelos', COUNT_BIG(*) FROM dbo.vuelos
UNION ALL SELECT N'vuelos_sanitarios', COUNT_BIG(*) FROM dbo.vuelos_sanitarios
UNION ALL SELECT N'vuelos_tripulantes', COUNT_BIG(*) FROM dbo.vuelos_tripulantes
UNION ALL SELECT N'negociaciones_horario_vuelo', COUNT_BIG(*) FROM dbo.negociaciones_horario_vuelo
UNION ALL SELECT N'documentos_vuelo', COUNT_BIG(*) FROM dbo.documentos_vuelo
UNION ALL SELECT N'informes_finales_vuelo', COUNT_BIG(*) FROM dbo.informes_finales_vuelo
UNION ALL SELECT N'obligaciones_informe_final', COUNT_BIG(*) FROM dbo.obligaciones_informe_final
UNION ALL SELECT N'eventos_auditoria', COUNT_BIG(*) FROM dbo.eventos_auditoria;
