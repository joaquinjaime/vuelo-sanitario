-- V23: vuelos es la entidad operativa común; la solicitud sanitaria es una
-- extensión 0..1. No se eliminan vuelos históricos: todos se migran a SANITARIO.
SET XACT_ABORT ON;
GO

CREATE TABLE tipos_vuelo (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT pk_tipos_vuelo PRIMARY KEY DEFAULT NEWID(),
    codigo NVARCHAR(40) NOT NULL CONSTRAINT uq_tipos_vuelo_codigo UNIQUE,
    nombre NVARCHAR(100) NOT NULL,
    activo BIT NOT NULL CONSTRAINT df_tipos_vuelo_activo DEFAULT 1
);
INSERT INTO tipos_vuelo(codigo,nombre) VALUES
(N'SANITARIO',N'Sanitario'),(N'REGRESO_BASE',N'Regreso a base'),
(N'REPOSICIONAMIENTO',N'Reposicionamiento'),(N'TRASLADO_OPERATIVO',N'Traslado operativo'),
(N'ENTRENAMIENTO',N'Entrenamiento'),(N'OTRO',N'Otro');
GO

CREATE TABLE estados_solicitud_sanitaria (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT pk_estados_solicitud_sanitaria PRIMARY KEY DEFAULT NEWID(),
    codigo NVARCHAR(40) NOT NULL CONSTRAINT uq_estados_solicitud_sanitaria_codigo UNIQUE,
    nombre NVARCHAR(100) NOT NULL,
    orden SMALLINT NOT NULL
);
INSERT INTO estados_solicitud_sanitaria(codigo,nombre,orden) VALUES
(N'SOLICITADO',N'Solicitado',1),(N'PENDIENTE_RESPUESTA_DTS',N'Pendiente de respuesta DTS',2),
(N'APROBADO',N'Aprobado',3),(N'RECHAZADO',N'Rechazado',4);

-- Los nuevos estados operativos superan el ancho histórico de codigo.
ALTER TABLE estados_vuelo ALTER COLUMN codigo NVARCHAR(50) NOT NULL;
INSERT INTO estados_vuelo(codigo,nombre,orden)
SELECT N'PENDIENTE_CONFIRMACION_COMANDANTE',N'Pendiente de confirmación del comandante',1
WHERE NOT EXISTS (SELECT 1 FROM estados_vuelo WHERE codigo=N'PENDIENTE_CONFIRMACION_COMANDANTE');
INSERT INTO estados_vuelo(codigo,nombre,orden)
SELECT N'PENDIENTE_REPLANIFICACION',N'Pendiente de replanificación',1
WHERE NOT EXISTS (SELECT 1 FROM estados_vuelo WHERE codigo=N'PENDIENTE_REPLANIFICACION');
INSERT INTO estados_vuelo(codigo,nombre,orden)
SELECT N'PENDIENTE_RESPUESTA_OPERACIONES',N'Pendiente de respuesta de Operaciones',1
WHERE NOT EXISTS (SELECT 1 FROM estados_vuelo WHERE codigo=N'PENDIENTE_RESPUESTA_OPERACIONES');
GO

ALTER TABLE vuelos ADD tipo_vuelo_id UNIQUEIDENTIFIER NULL,
    estado_vuelo_id UNIQUEIDENTIFIER NULL,
    creado_por_usuario_id UNIQUEIDENTIFIER NULL;
EXEC sp_rename N'dbo.vuelos.motivo_solicitud', N'motivo_vuelo', N'COLUMN';
GO

UPDATE vuelos SET tipo_vuelo_id=(SELECT id FROM tipos_vuelo WHERE codigo=N'SANITARIO'),
    creado_por_usuario_id=solicitado_por_usuario_id,
    motivo_vuelo=COALESCE(NULLIF(LTRIM(RTRIM(motivo_vuelo)),N''),N'Motivo histórico no informado'),
    estado_vuelo_id=CASE WHEN (SELECT codigo FROM estados_vuelo e WHERE e.id=vuelos.estado_id)
                              IN (N'PLANIFICADO',N'EN_CURSO',N'FINALIZADO',N'COMPLETADO') THEN estado_id
                         WHEN (SELECT codigo FROM estados_vuelo e WHERE e.id=vuelos.estado_id)=N'CANCELADO'
                              AND NOT EXISTS (SELECT 1 FROM negociaciones_horario_vuelo n WHERE n.vuelo_id=vuelos.id AND n.tipo IN (N'CO_RECHAZO_DIRECTO',N'DTS_RECHAZA_CONTRAPROPUESTA')) THEN estado_id
                         ELSE NULL END;
ALTER TABLE vuelos ALTER COLUMN tipo_vuelo_id UNIQUEIDENTIFIER NOT NULL;
ALTER TABLE vuelos ALTER COLUMN creado_por_usuario_id UNIQUEIDENTIFIER NOT NULL;
ALTER TABLE vuelos ALTER COLUMN motivo_vuelo NVARCHAR(MAX) NOT NULL;
ALTER TABLE vuelos ADD CONSTRAINT fk_vuelos_tipo_vuelo FOREIGN KEY(tipo_vuelo_id) REFERENCES tipos_vuelo(id);
ALTER TABLE vuelos ADD CONSTRAINT fk_vuelos_estado_vuelo FOREIGN KEY(estado_vuelo_id) REFERENCES estados_vuelo(id);
ALTER TABLE vuelos ADD CONSTRAINT fk_vuelos_creado_por_usuario FOREIGN KEY(creado_por_usuario_id) REFERENCES usuarios(id);
CREATE INDEX ix_vuelos_tipo_vuelo_estado ON vuelos(tipo_vuelo_id,estado_vuelo_id);
GO

CREATE TABLE vuelos_sanitarios (
    vuelo_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT pk_vuelos_sanitarios PRIMARY KEY REFERENCES vuelos(id) ON DELETE CASCADE,
    paciente_id UNIQUEIDENTIFIER NOT NULL REFERENCES pacientes(id),
    solicitado_por_usuario_id UNIQUEIDENTIFIER NOT NULL REFERENCES usuarios(id),
    fecha_solicitada DATETIME2(3) NOT NULL,
    prioridad_id UNIQUEIDENTIFIER NULL REFERENCES prioridades_vuelo(id),
    extrema_urgencia BIT NOT NULL CONSTRAINT df_vuelos_sanitarios_extrema_urgencia DEFAULT 0,
    justificacion_extrema_urgencia NVARCHAR(MAX) NULL,
    fecha_limite_traslado DATETIME2(3) NULL,
    localidad_origen_id UNIQUEIDENTIFIER NULL REFERENCES localidades(id),
    localidad_destino_id UNIQUEIDENTIFIER NULL REFERENCES localidades(id),
    origen_solicitado_legacy NVARCHAR(100) NULL,
    destino_solicitado_legacy NVARCHAR(100) NULL,
    estado_solicitud_id UNIQUEIDENTIFIER NOT NULL REFERENCES estados_solicitud_sanitaria(id),
    evaluado_por_usuario_id UNIQUEIDENTIFIER NULL REFERENCES usuarios(id),
    fecha_evaluacion DATETIME2(3) NULL,
    motivo_rechazo NVARCHAR(MAX) NULL
);
ALTER TABLE vuelos_sanitarios ADD CONSTRAINT ck_vuelos_sanitarios_urgencia CHECK (
    (extrema_urgencia=0 AND justificacion_extrema_urgencia IS NULL AND fecha_limite_traslado IS NULL)
    OR (extrema_urgencia=1 AND NULLIF(LTRIM(RTRIM(justificacion_extrema_urgencia)),N'') IS NOT NULL AND fecha_limite_traslado IS NOT NULL)
);
GO

INSERT INTO vuelos_sanitarios (
    vuelo_id,paciente_id,solicitado_por_usuario_id,fecha_solicitada,prioridad_id,
    extrema_urgencia,justificacion_extrema_urgencia,fecha_limite_traslado,
    localidad_origen_id,localidad_destino_id,origen_solicitado_legacy,destino_solicitado_legacy,
    estado_solicitud_id,evaluado_por_usuario_id,fecha_evaluacion,motivo_rechazo
)
SELECT v.id,v.paciente_id,v.solicitado_por_usuario_id,v.fecha_solicitada,v.prioridad_id,
       v.extrema_urgencia,v.justificacion_extrema_urgencia,v.fecha_limite_traslado,
       v.localidad_origen_id,v.localidad_destino_id,v.ciudad_origen_solicitada,v.ciudad_destino_solicitada,
       ss.id,v.evaluado_por_usuario_id,v.fecha_evaluacion,
       CASE WHEN (SELECT e.codigo FROM estados_vuelo e WHERE e.id=v.estado_id)=N'CANCELADO'
                  AND EXISTS (SELECT 1 FROM negociaciones_horario_vuelo n WHERE n.vuelo_id=v.id AND n.tipo IN (N'CO_RECHAZO_DIRECTO',N'DTS_RECHAZA_CONTRAPROPUESTA'))
            THEN COALESCE(NULLIF(LTRIM(RTRIM(v.motivo_cancelacion_personalizado)),N''),v.motivo_rechazo,N'Rechazo histórico sin motivo')
            ELSE v.motivo_rechazo END
FROM vuelos v
JOIN estados_solicitud_sanitaria ss ON ss.codigo = CASE
  WHEN (SELECT e.codigo FROM estados_vuelo e WHERE e.id=v.estado_id) IN (N'SOLICITADO',N'PENDIENTE_RESPUESTA_DTS',N'APROBADO',N'RECHAZADO')
    THEN (SELECT e.codigo FROM estados_vuelo e WHERE e.id=v.estado_id)
  WHEN (SELECT e.codigo FROM estados_vuelo e WHERE e.id=v.estado_id)=N'CANCELADO'
       AND EXISTS (SELECT 1 FROM negociaciones_horario_vuelo n WHERE n.vuelo_id=v.id AND n.tipo IN (N'CO_RECHAZO_DIRECTO',N'DTS_RECHAZA_CONTRAPROPUESTA')) THEN N'RECHAZADO'
  ELSE N'APROBADO' END;
GO

-- El trigger y los índices/FK que dependen de columnas que se mueven deben
-- retirarse antes de abandonar la representación monolítica.
DROP TRIGGER IF EXISTS dbo.trg_vuelos_validar_ciclo_vida;
DECLARE @drop_checks nvarchar(max)=N'';
SELECT @drop_checks=@drop_checks+N'ALTER TABLE dbo.vuelos DROP CONSTRAINT '+QUOTENAME(name)+N';'
FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.vuelos')
  AND definition LIKE N'%extrema_urgencia%';
IF @drop_checks<>N'' EXEC sp_executesql @drop_checks;
DECLARE @drop nvarchar(max)=N'';
SELECT @drop=@drop+N'DROP INDEX '+QUOTENAME(name)+N' ON dbo.vuelos;'
FROM (SELECT DISTINCT i.name FROM sys.indexes i JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id
      JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
      WHERE i.object_id=OBJECT_ID(N'dbo.vuelos') AND i.is_primary_key=0 AND i.is_unique_constraint=0
        AND c.name IN (N'paciente_id',N'solicitado_por_usuario_id',N'fecha_solicitada',N'prioridad_id',N'extrema_urgencia',N'justificacion_extrema_urgencia',N'fecha_limite_traslado',N'ciudad_origen_solicitada',N'ciudad_destino_solicitada',N'localidad_origen_id',N'localidad_destino_id',N'estado_id',N'evaluado_por_usuario_id',N'fecha_evaluacion',N'motivo_rechazo')) q;
IF @drop<>N'' EXEC sp_executesql @drop;
DECLARE @drop_fk nvarchar(max)=N'';
SELECT @drop_fk=@drop_fk+N'ALTER TABLE dbo.vuelos DROP CONSTRAINT '+QUOTENAME(fk.name)+N';'
FROM sys.foreign_keys fk JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id=fk.object_id
JOIN sys.columns c ON c.object_id=fkc.parent_object_id AND c.column_id=fkc.parent_column_id
WHERE fk.parent_object_id=OBJECT_ID(N'dbo.vuelos')
  AND c.name IN (N'paciente_id',N'solicitado_por_usuario_id',N'prioridad_id',N'localidad_origen_id',N'localidad_destino_id',N'estado_id',N'evaluado_por_usuario_id');
IF @drop_fk<>N'' EXEC sp_executesql @drop_fk;
DECLARE @drop_defaults nvarchar(max)=N'';
SELECT @drop_defaults=@drop_defaults+N'ALTER TABLE dbo.vuelos DROP CONSTRAINT '+QUOTENAME(dc.name)+N';'
FROM sys.default_constraints dc
JOIN sys.columns c ON c.object_id=dc.parent_object_id AND c.column_id=dc.parent_column_id
WHERE dc.parent_object_id=OBJECT_ID(N'dbo.vuelos')
  AND c.name IN (N'paciente_id',N'solicitado_por_usuario_id',N'fecha_solicitada',N'prioridad_id',N'extrema_urgencia',N'justificacion_extrema_urgencia',N'fecha_limite_traslado',N'ciudad_origen_solicitada',N'ciudad_destino_solicitada',N'localidad_origen_id',N'localidad_destino_id',N'estado_id',N'evaluado_por_usuario_id',N'fecha_evaluacion',N'motivo_rechazo');
IF @drop_defaults<>N'' EXEC sp_executesql @drop_defaults;
GO

-- Un rechazo sanitario histórico no equivale a una cancelación operacional.
UPDATE v SET fecha_cancelacion=NULL,cancelado_por_usuario_id=NULL,motivo_cancelacion_id=NULL,motivo_cancelacion_personalizado=NULL
FROM vuelos v
WHERE v.estado_vuelo_id IS NULL
  AND EXISTS (SELECT 1 FROM negociaciones_horario_vuelo n WHERE n.vuelo_id=v.id AND n.tipo IN (N'CO_RECHAZO_DIRECTO',N'DTS_RECHAZA_CONTRAPROPUESTA'));
GO

ALTER TABLE vuelos DROP COLUMN paciente_id,solicitado_por_usuario_id,fecha_solicitada,
    prioridad_id,extrema_urgencia,justificacion_extrema_urgencia,fecha_limite_traslado,
    ciudad_origen_solicitada,ciudad_destino_solicitada,localidad_origen_id,localidad_destino_id,
    estado_id,evaluado_por_usuario_id,fecha_evaluacion,motivo_rechazo;
GO

-- Se conserva y generaliza el historial inmutable de negociación, con actores
-- y respuestas separadas para DTS y comandante.
IF COL_LENGTH(N'dbo.negociaciones_horario_vuelo', N'fecha_hora_llegada_propuesta') IS NULL
    ALTER TABLE dbo.negociaciones_horario_vuelo ADD fecha_hora_llegada_propuesta DATETIME2(3) NULL;
GO
DECLARE @checks nvarchar(max)=N'';
SELECT @checks=@checks+N'ALTER TABLE dbo.negociaciones_horario_vuelo DROP CONSTRAINT '+QUOTENAME(name)+N';'
FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.negociaciones_horario_vuelo');
IF @checks<>N'' EXEC sp_executesql @checks;
ALTER TABLE negociaciones_horario_vuelo ADD CONSTRAINT ck_negociaciones_horario_tipo CHECK (tipo IN (
 N'DTS_PROPUESTA',N'CO_ACEPTA_PROPUESTA',N'CO_CONTRAPROPUESTA',N'DTS_ACEPTA_CONTRAPROPUESTA',N'DTS_RECHAZA_CONTRAPROPUESTA',N'CO_RECHAZO_DIRECTO',
 N'COMANDANTE_ACEPTA_ASIGNACION',N'COMANDANTE_RECHAZA_ASIGNACION',N'COMANDANTE_PROPONE_HORARIO',N'CO_ACEPTA_PROPUESTA_COMANDANTE',N'CO_RECHAZA_PROPUESTA_COMANDANTE'
));
GO

CREATE TRIGGER trg_vuelos_validar_ciclo_vida ON vuelos AFTER INSERT, UPDATE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS (SELECT 1 FROM inserted i LEFT JOIN estados_vuelo e ON e.id=i.estado_vuelo_id
            LEFT JOIN motivos_cancelacion m ON m.id=i.motivo_cancelacion_id
            LEFT JOIN deleted d ON d.id=i.id LEFT JOIN estados_vuelo previo ON previo.id=d.estado_vuelo_id
            WHERE (e.codigo=N'CANCELADO' AND (i.fecha_cancelacion IS NULL OR i.cancelado_por_usuario_id IS NULL OR i.motivo_cancelacion_id IS NULL OR (m.codigo=N'OTRO' AND NULLIF(LTRIM(RTRIM(i.motivo_cancelacion_personalizado)),N'') IS NULL) OR (m.codigo<>N'OTRO' AND i.motivo_cancelacion_personalizado IS NOT NULL)))
               OR ((e.codigo IS NULL OR e.codigo<>N'CANCELADO') AND (i.fecha_cancelacion IS NOT NULL OR i.cancelado_por_usuario_id IS NOT NULL OR i.motivo_cancelacion_id IS NOT NULL OR i.motivo_cancelacion_personalizado IS NOT NULL))
               OR (e.codigo=N'CANCELADO' AND previo.codigo IN (N'EN_CURSO',N'FINALIZADO',N'COMPLETADO')))
  THROW 51000, 'La cancelación debe ser previa a la ejecución, con actor y motivo válido.', 1;
END;
GO
