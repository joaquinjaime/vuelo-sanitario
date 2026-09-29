-- La propuesta DTS y sus respuestas son hechos inmutables: no se reutiliza
-- fecha_solicitada ni se sobrescribe el historial al fijar la salida final.
CREATE TABLE negociaciones_horario_vuelo (
    id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    vuelo_id UNIQUEIDENTIFIER NOT NULL REFERENCES vuelos(id),
    tipo NVARCHAR(40) NOT NULL,
    fecha_hora_propuesta DATETIME2(3) NULL,
    motivo NVARCHAR(MAX) NULL,
    actor_usuario_id UNIQUEIDENTIFIER NULL REFERENCES usuarios(id),
    fecha_ocurrencia DATETIME2(3) NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT ck_negociaciones_horario_tipo CHECK (tipo IN (
        N'DTS_PROPUESTA', N'CO_ACEPTA_PROPUESTA', N'CO_CONTRAPROPUESTA',
        N'DTS_ACEPTA_CONTRAPROPUESTA', N'DTS_RECHAZA_CONTRAPROPUESTA',
        N'CO_RECHAZO_DIRECTO')),
    CONSTRAINT ck_negociaciones_horario_motivo CHECK (
        (tipo IN (N'CO_CONTRAPROPUESTA', N'DTS_RECHAZA_CONTRAPROPUESTA', N'CO_RECHAZO_DIRECTO')
             AND NULLIF(LTRIM(RTRIM(motivo)), N'') IS NOT NULL)
        OR tipo NOT IN (N'CO_CONTRAPROPUESTA', N'DTS_RECHAZA_CONTRAPROPUESTA', N'CO_RECHAZO_DIRECTO'))
);
GO
CREATE INDEX ix_negociaciones_horario_vuelo_fecha ON negociaciones_horario_vuelo(vuelo_id, fecha_ocurrencia);
GO

INSERT INTO negociaciones_horario_vuelo(vuelo_id,tipo,fecha_hora_propuesta,actor_usuario_id,fecha_ocurrencia)
SELECT id,N'DTS_PROPUESTA',fecha_solicitada,solicitado_por_usuario_id,fecha_creacion
FROM vuelos
WHERE NOT EXISTS (SELECT 1 FROM negociaciones_horario_vuelo n WHERE n.vuelo_id=vuelos.id);
GO
INSERT INTO negociaciones_horario_vuelo(vuelo_id,tipo,fecha_hora_propuesta,actor_usuario_id,fecha_ocurrencia)
SELECT id,N'CO_ACEPTA_PROPUESTA',fecha_planificada_salida,evaluado_por_usuario_id,COALESCE(fecha_evaluacion,fecha_actualizacion)
FROM vuelos
WHERE fecha_planificada_salida IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM negociaciones_horario_vuelo n WHERE n.vuelo_id=vuelos.id AND n.tipo=N'CO_ACEPTA_PROPUESTA');
GO

INSERT INTO estados_vuelo(codigo,nombre,orden)
SELECT N'PENDIENTE_RESPUESTA_DTS',N'Pendiente de respuesta DTS',2
WHERE NOT EXISTS (SELECT 1 FROM estados_vuelo WHERE codigo=N'PENDIENTE_RESPUESTA_DTS');
GO

ALTER TABLE perfiles_comandante ADD provincia_actual_id UNIQUEIDENTIFIER NULL REFERENCES provincias(id);
GO
CREATE INDEX ix_perfiles_comandante_provincia_actual ON perfiles_comandante(provincia_actual_id);
GO

-- Se completa localidad_id sólo cuando ciudad + provincia identifica una única
-- localidad oficial. Las filas ambiguas o sin equivalencia se conservan para
-- intervención administrativa; por eso no se eliminan aún las columnas fuente.
UPDATE a SET localidad_id = x.id
FROM aeropuertos a
CROSS APPLY (
    SELECT MIN(l.id) id
    FROM localidades l
    WHERE l.provincia_id=a.provincia_id
      AND UPPER(LTRIM(RTRIM(l.nombre))) COLLATE Latin1_General_100_CI_AI =
          UPPER(LTRIM(RTRIM(a.ciudad))) COLLATE Latin1_General_100_CI_AI
    HAVING COUNT(*)=1
) x
WHERE a.localidad_id IS NULL AND a.provincia_id IS NOT NULL
  AND NULLIF(LTRIM(RTRIM(a.ciudad)),N'') IS NOT NULL;
GO
