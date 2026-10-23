-- Ciclo previo a la planificación: coherencia entre el estado de la solicitud sanitaria y el estado operativo del vuelo,
-- trazabilidad de las respuestas de negociación y cancelación diferenciada del rechazo.
-- Migración incremental: no elimina ni reescribe solicitudes, vuelos, negociaciones ni auditoría.

-- 1. La cancelación de una solicitud sanitaria (por DTS al rechazar una propuesta o por una cancelación autorizada) es distinta
--    del rechazo de Operaciones: se incorpora el estado CANCELADO al catálogo de solicitudes.
INSERT INTO dbo.estados_solicitud_sanitaria (codigo_estado_solicitud, nombre_estado_solicitud, orden)
SELECT N'CANCELADO', N'Cancelado', ISNULL((SELECT MAX(orden) FROM dbo.estados_solicitud_sanitaria), 0) + 1
WHERE NOT EXISTS (SELECT 1 FROM dbo.estados_solicitud_sanitaria WHERE codigo_estado_solicitud = N'CANCELADO');
GO

-- 2. Cada respuesta de negociación referencia la propuesta que responde (o reemplaza). Una propuesta sólo puede tener una
--    respuesta: el índice único impide respuestas contradictorias aun ante concurrencia.
ALTER TABLE dbo.negociaciones_horario_vuelo ADD id_negociacion_respondida BIGINT NULL
    CONSTRAINT fk_negociaciones_horario_vuelo_respondida REFERENCES dbo.negociaciones_horario_vuelo(id_negociaciones_horario_vuelo);
GO
CREATE UNIQUE INDEX ux_negociaciones_horario_vuelo_respondida ON dbo.negociaciones_horario_vuelo(id_negociacion_respondida) WHERE id_negociacion_respondida IS NOT NULL;
GO

-- 3. Datos anteriores: una solicitud cuyo vuelo consta cancelado (con fecha, actor y motivo, exigidos por trg_vuelos_validar_ciclo_vida)
--    pasa a CANCELADO; los rechazos de Operaciones y de propuestas ya registrados como RECHAZADO no se reinterpretan.
UPDATE s SET id_estados_solicitud_sanitaria = (SELECT id_estados_solicitud_sanitaria FROM dbo.estados_solicitud_sanitaria WHERE codigo_estado_solicitud = N'CANCELADO')
FROM dbo.vuelos_sanitarios s
INNER JOIN dbo.vuelos v ON v.id_vuelos = s.id_vuelos
INNER JOIN dbo.estados_vuelo ev ON ev.id_estados_vuelo = v.id_estados_vuelo AND ev.codigo_estado_vuelo = N'CANCELADO'
INNER JOIN dbo.estados_solicitud_sanitaria es ON es.id_estados_solicitud_sanitaria = s.id_estados_solicitud_sanitaria
WHERE es.codigo_estado_solicitud IN (N'SOLICITADO', N'PENDIENTE_RESPUESTA_DTS', N'APROBADO');
GO

-- 4. Máquina de estados de la solicitud en SQL Server (sólo evalúa cambios de estado).
CREATE OR ALTER TRIGGER dbo.trg_vuelos_sanitarios_validar_estado ON dbo.vuelos_sanitarios AFTER UPDATE AS
BEGIN
 SET NOCOUNT ON;
 IF UPDATE(id_estados_solicitud_sanitaria) AND EXISTS (
   SELECT 1 FROM inserted i
   INNER JOIN deleted d ON d.id_vuelos_sanitarios = i.id_vuelos_sanitarios
   INNER JOIN dbo.estados_solicitud_sanitaria n ON n.id_estados_solicitud_sanitaria = i.id_estados_solicitud_sanitaria
   INNER JOIN dbo.estados_solicitud_sanitaria p ON p.id_estados_solicitud_sanitaria = d.id_estados_solicitud_sanitaria
   LEFT JOIN dbo.vuelos v ON v.id_vuelos = i.id_vuelos
   LEFT JOIN dbo.estados_vuelo ev ON ev.id_estados_vuelo = v.id_estados_vuelo
   WHERE i.id_estados_solicitud_sanitaria <> d.id_estados_solicitud_sanitaria AND (
        p.codigo_estado_solicitud IN (N'RECHAZADO', N'CANCELADO')
     OR (p.codigo_estado_solicitud = N'SOLICITADO' AND n.codigo_estado_solicitud NOT IN (N'APROBADO', N'RECHAZADO', N'PENDIENTE_RESPUESTA_DTS', N'CANCELADO'))
     OR (p.codigo_estado_solicitud = N'PENDIENTE_RESPUESTA_DTS' AND n.codigo_estado_solicitud NOT IN (N'APROBADO', N'CANCELADO', N'SOLICITADO'))
     OR (p.codigo_estado_solicitud = N'APROBADO' AND n.codigo_estado_solicitud <> N'CANCELADO')
     OR (n.codigo_estado_solicitud = N'CANCELADO' AND ev.codigo_estado_vuelo IN (N'EN_CURSO', N'FINALIZADO', N'COMPLETADO'))
     OR (n.codigo_estado_solicitud = N'RECHAZADO' AND (i.motivo_rechazo IS NULL OR LEN(LTRIM(RTRIM(i.motivo_rechazo))) = 0))
   ))
   THROW 51045, 'Transición de estado de la solicitud sanitaria no permitida.', 1;
END;
GO

-- 5. Un vuelo sanitario sólo avanza a un estado operativo con la solicitud aprobada, y sólo consta cancelado con la solicitud cancelada.
--    El backend persiste primero el estado de la solicitud y luego el del vuelo.
CREATE OR ALTER TRIGGER dbo.trg_vuelos_coherencia_sanitaria ON dbo.vuelos AFTER UPDATE AS
BEGIN
 SET NOCOUNT ON;
 IF UPDATE(id_estados_vuelo) AND EXISTS (
   SELECT 1 FROM inserted i
   INNER JOIN deleted d ON d.id_vuelos = i.id_vuelos
   INNER JOIN dbo.vuelos_sanitarios s ON s.id_vuelos = i.id_vuelos
   INNER JOIN dbo.estados_solicitud_sanitaria es ON es.id_estados_solicitud_sanitaria = s.id_estados_solicitud_sanitaria
   INNER JOIN dbo.estados_vuelo n ON n.id_estados_vuelo = i.id_estados_vuelo
   WHERE ISNULL(i.id_estados_vuelo, 0) <> ISNULL(d.id_estados_vuelo, 0) AND (
        (n.codigo_estado_vuelo IN (N'PLANIFICADO', N'EN_CURSO', N'FINALIZADO', N'COMPLETADO') AND es.codigo_estado_solicitud <> N'APROBADO')
     OR (n.codigo_estado_vuelo = N'CANCELADO' AND es.codigo_estado_solicitud <> N'CANCELADO')
     OR (n.codigo_estado_vuelo NOT IN (N'PLANIFICADO', N'EN_CURSO', N'FINALIZADO', N'COMPLETADO', N'CANCELADO'))
   ))
   THROW 51046, 'El estado del vuelo es incompatible con el estado de la solicitud sanitaria.', 1;
END;
GO
