-- Cierre de vuelos: historial de revisión por versión de informe, índice de
-- vencimientos y deduplicación de notificaciones de cierre.
-- Migración incremental: no elimina ni reescribe informes, obligaciones ni notificaciones.

-- Una versión vigente por vuelo: se verifica antes de imponerlo para fallar sin alterar datos.
IF EXISTS (SELECT 1 FROM dbo.informes_finales_vuelo WHERE es_version_actual = 1 GROUP BY id_vuelos HAVING COUNT(*) > 1)
    THROW 51042, 'Existen vuelos con más de una versión vigente de informe final; resuélvalos antes de migrar.', 1;
GO

ALTER TABLE dbo.informes_finales_vuelo ADD
    estado_revision NVARCHAR(20) NOT NULL CONSTRAINT df_informes_finales_vuelo_estado_revision DEFAULT N'PRESENTADO',
    motivo_devolucion NVARCHAR(MAX) NULL,
    fecha_revision DATETIMEOFFSET(3) NULL,
    id_usuario_revisor BIGINT NULL CONSTRAINT fk_informes_finales_vuelo_revisor REFERENCES dbo.usuarios(id_usuarios);
GO

-- Reconstrucción de la decisión sobre la versión que cada obligación tiene vinculada.
UPDATE r SET
    estado_revision = N'APROBADO',
    fecha_revision = o.fecha_aprobacion,
    id_usuario_revisor = o.id_usuario_aprobador
FROM dbo.informes_finales_vuelo r
INNER JOIN dbo.obligaciones_informe_final o ON o.id_informes_finales_vuelo = r.id_informes_finales_vuelo
WHERE o.estado_obligacion = N'APROBADO';

UPDATE r SET
    estado_revision = N'DEVUELTO',
    motivo_devolucion = o.motivo_devolucion,
    fecha_revision = o.fecha_devolucion,
    id_usuario_revisor = o.id_usuario_devolvedor
FROM dbo.informes_finales_vuelo r
INNER JOIN dbo.obligaciones_informe_final o ON o.id_informes_finales_vuelo = r.id_informes_finales_vuelo
WHERE o.estado_obligacion = N'DEVUELTO';

-- Versiones anteriores sin decisión registrada en la obligación: se conservan, marcadas como reemplazadas.
UPDATE r SET estado_revision = N'REEMPLAZADO'
FROM dbo.informes_finales_vuelo r
WHERE r.es_version_actual = 0 AND r.estado_revision = N'PRESENTADO';
GO

ALTER TABLE dbo.informes_finales_vuelo ADD CONSTRAINT ck_informes_finales_vuelo_revision CHECK (
    estado_revision IN (N'PRESENTADO', N'DEVUELTO', N'APROBADO', N'REEMPLAZADO')
    AND (
        (estado_revision = N'DEVUELTO' AND motivo_devolucion IS NOT NULL AND LEN(LTRIM(RTRIM(motivo_devolucion))) > 0
            AND fecha_revision IS NOT NULL AND id_usuario_revisor IS NOT NULL)
        OR (estado_revision = N'APROBADO' AND fecha_revision IS NOT NULL AND id_usuario_revisor IS NOT NULL)
        OR estado_revision IN (N'PRESENTADO', N'REEMPLAZADO')
    ));
GO

CREATE UNIQUE INDEX ux_informes_finales_vuelo_actual ON dbo.informes_finales_vuelo(id_vuelos) WHERE es_version_actual = 1;
CREATE INDEX ix_informes_finales_vuelo_revisor ON dbo.informes_finales_vuelo(id_usuario_revisor) WHERE id_usuario_revisor IS NOT NULL;
CREATE INDEX ix_obligaciones_informe_final_abiertas_vencimiento
    ON dbo.obligaciones_informe_final(vencimiento, id_usuario_comandante)
    WHERE es_actual = 1 AND estado_obligacion IN (N'PENDIENTE', N'DEVUELTO');
GO

-- Clave de evento: un mismo hecho de cierre no puede notificarse dos veces al mismo usuario.
ALTER TABLE dbo.notificaciones ADD clave_evento NVARCHAR(160) NULL;
GO
CREATE UNIQUE INDEX ux_notificaciones_usuario_clave_evento
    ON dbo.notificaciones(id_usuarios, clave_evento) WHERE clave_evento IS NOT NULL;
GO

-- Respaldo en base de datos del ciclo terminal: ninguna transición fuera de orden puede persistir.
-- Sólo evalúa cambios de estado, por lo que no revalida vuelos históricos al actualizar otras columnas.
CREATE OR ALTER TRIGGER dbo.trg_vuelos_validar_cierre ON dbo.vuelos AFTER UPDATE AS
BEGIN
 SET NOCOUNT ON;
 IF UPDATE(id_estados_vuelo) AND EXISTS (
   SELECT 1 FROM inserted i
   INNER JOIN deleted d ON d.id_vuelos = i.id_vuelos
   LEFT JOIN dbo.estados_vuelo n ON n.id_estados_vuelo = i.id_estados_vuelo
   LEFT JOIN dbo.estados_vuelo p ON p.id_estados_vuelo = d.id_estados_vuelo
   WHERE ISNULL(i.id_estados_vuelo, 0) <> ISNULL(d.id_estados_vuelo, 0) AND (
        p.codigo_estado_vuelo IN (N'COMPLETADO', N'CANCELADO')
     OR (p.codigo_estado_vuelo = N'FINALIZADO' AND ISNULL(n.codigo_estado_vuelo, N'') <> N'COMPLETADO')
     OR (p.codigo_estado_vuelo = N'EN_CURSO' AND ISNULL(n.codigo_estado_vuelo, N'') <> N'FINALIZADO')
     OR (n.codigo_estado_vuelo = N'EN_CURSO' AND (ISNULL(p.codigo_estado_vuelo, N'') <> N'PLANIFICADO' OR i.fecha_salida_real IS NULL))
     OR (n.codigo_estado_vuelo = N'FINALIZADO' AND (ISNULL(p.codigo_estado_vuelo, N'') <> N'EN_CURSO' OR i.fecha_llegada_real IS NULL))
     OR (n.codigo_estado_vuelo = N'COMPLETADO' AND ISNULL(p.codigo_estado_vuelo, N'') <> N'FINALIZADO')
   ))
   THROW 51043, 'Transición de estado de vuelo no permitida por el ciclo de vida terminal.', 1;
END;
GO
