-- Consolidación del cierre de vuelos sobre V42 (V42 no se modifica).
--  1. Procedencia explícita de la decisión de cada versión de informe: las decisiones que V42 derivó de datos
--     anteriores sólo se conservan si hay evidencia; el resto pasa al estado histórico sin decisión comprobable.
--  2. Adjunto PDF opcional por versión de informe (texto, PDF o ambos).
--  3. Responsable concreto del cierre (quien finalizó el vuelo) para dirigir los avisos de Operaciones.
--  4. Coherencia en SQL Server de COMPLETADO con la aprobación del informe.
-- No elimina ni reescribe informes, obligaciones, notificaciones ni auditoría.

ALTER TABLE dbo.informes_finales_vuelo DROP CONSTRAINT ck_informes_finales_vuelo_revision;
-- V42 creó estado_revision como NVARCHAR(20); HISTORICO_SIN_DECISION necesita más espacio.
ALTER TABLE dbo.informes_finales_vuelo DROP CONSTRAINT df_informes_finales_vuelo_estado_revision;
GO
ALTER TABLE dbo.informes_finales_vuelo ALTER COLUMN estado_revision NVARCHAR(40) NOT NULL;
GO
ALTER TABLE dbo.informes_finales_vuelo ADD CONSTRAINT df_informes_finales_vuelo_estado_revision DEFAULT N'PRESENTADO' FOR estado_revision;
GO

ALTER TABLE dbo.informes_finales_vuelo ADD
    origen_decision NVARCHAR(40) NOT NULL CONSTRAINT df_informes_finales_vuelo_origen_decision DEFAULT N'FLUJO_ACTUAL',
    adjunto_nombre_original NVARCHAR(255) NULL,
    adjunto_ubicacion NVARCHAR(255) NULL,
    adjunto_tamanio_bytes BIGINT NULL,
    adjunto_sha256 CHAR(64) NULL;
GO

ALTER TABLE dbo.obligaciones_informe_final ADD
    id_usuario_finalizador BIGINT NULL CONSTRAINT fk_obligaciones_informe_final_finalizador REFERENCES dbo.usuarios(id_usuarios);
GO

-- Una versión pertenece al flujo actual si su presentación quedó auditada con el formato de V42
-- ({"estadoObligacion": ...}); no se usa ninguna comparación de fechas. El resto es histórica.
UPDATE r SET origen_decision = N'HISTORICA_SIN_EVIDENCIA'
FROM dbo.informes_finales_vuelo r
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.eventos_auditoria a
    WHERE a.tipo_entidad = N'FINAL_REPORT' AND a.operacion IN (N'SUBMIT', N'RESUBMIT')
      AND a.entidad_id = r.id_informes_finales_vuelo AND JSON_VALUE(a.valores_nuevos, '$.estadoObligacion') IS NOT NULL);
GO

-- Aprobaciones históricas: se conservan sólo si la obligación las registra, enlaza esta versión y el vuelo está COMPLETADO.
UPDATE r SET origen_decision = CASE WHEN EXISTS (
        SELECT 1 FROM dbo.eventos_auditoria a WHERE a.tipo_entidad = N'FINAL_REPORT' AND a.operacion = N'APPROVE' AND a.entidad_id = r.id_informes_finales_vuelo)
    THEN N'HISTORICA_OBLIGACION_AUDITADA' ELSE N'HISTORICA_OBLIGACION' END
FROM dbo.informes_finales_vuelo r
INNER JOIN dbo.obligaciones_informe_final o ON o.id_informes_finales_vuelo = r.id_informes_finales_vuelo AND o.estado_obligacion = N'APROBADO'
INNER JOIN dbo.vuelos v ON v.id_vuelos = r.id_vuelos
INNER JOIN dbo.estados_vuelo e ON e.id_estados_vuelo = v.id_estados_vuelo AND e.codigo_estado_vuelo = N'COMPLETADO'
WHERE r.origen_decision = N'HISTORICA_SIN_EVIDENCIA' AND r.estado_revision = N'APROBADO'
  AND o.fecha_aprobacion IS NOT NULL AND o.id_usuario_aprobador IS NOT NULL;

-- Devoluciones históricas: el motivo, el revisor y la fecha constan en la obligación que enlaza esta versión.
UPDATE r SET origen_decision = CASE WHEN EXISTS (
        SELECT 1 FROM dbo.eventos_auditoria a WHERE a.tipo_entidad = N'FINAL_REPORT' AND a.operacion = N'RETURN' AND a.entidad_id = r.id_informes_finales_vuelo)
    THEN N'HISTORICA_OBLIGACION_AUDITADA' ELSE N'HISTORICA_OBLIGACION' END
FROM dbo.informes_finales_vuelo r
INNER JOIN dbo.obligaciones_informe_final o ON o.id_informes_finales_vuelo = r.id_informes_finales_vuelo AND o.estado_obligacion = N'DEVUELTO'
WHERE r.origen_decision = N'HISTORICA_SIN_EVIDENCIA' AND r.estado_revision = N'DEVUELTO'
  AND r.motivo_devolucion IS NOT NULL AND r.fecha_revision IS NOT NULL AND r.id_usuario_revisor IS NOT NULL;

-- Presentaciones históricas pendientes de revisión: la obligación vigente enlaza esta versión (no se afirma ninguna decisión).
UPDATE r SET origen_decision = N'HISTORICA_OBLIGACION'
FROM dbo.informes_finales_vuelo r
INNER JOIN dbo.obligaciones_informe_final o ON o.id_informes_finales_vuelo = r.id_informes_finales_vuelo AND o.estado_obligacion = N'PRESENTADO'
WHERE r.origen_decision = N'HISTORICA_SIN_EVIDENCIA' AND r.estado_revision = N'PRESENTADO';

-- Versiones reemplazadas: sólo se afirma que una versión posterior las sustituyó; no se atribuye decisión alguna.
UPDATE dbo.informes_finales_vuelo SET origen_decision = N'HISTORICA_SIN_EVIDENCIA'
WHERE estado_revision = N'REEMPLAZADO';

-- Todo lo demás que V42 declaró aprobado, devuelto o presentado sin evidencia pasa a "histórico sin decisión comprobable".
UPDATE dbo.informes_finales_vuelo SET
    estado_revision = N'HISTORICO_SIN_DECISION', motivo_devolucion = NULL, fecha_revision = NULL, id_usuario_revisor = NULL
WHERE origen_decision = N'HISTORICA_SIN_EVIDENCIA' AND estado_revision IN (N'APROBADO', N'DEVUELTO', N'PRESENTADO');
GO

-- Responsable de cierre: sólo se completa con evidencia (el actor auditado de la finalización).
UPDATE o SET id_usuario_finalizador = a.id_usuario_actor
FROM dbo.obligaciones_informe_final o
CROSS APPLY (SELECT TOP 1 x.id_usuario_actor FROM dbo.eventos_auditoria x
             WHERE x.id_vuelos = o.id_vuelos AND x.tipo_entidad = N'FLIGHT' AND x.operacion = N'FINISH' AND x.id_usuario_actor IS NOT NULL
             ORDER BY x.id_eventos_auditoria) a
WHERE o.id_usuario_finalizador IS NULL;
GO

ALTER TABLE dbo.informes_finales_vuelo ADD CONSTRAINT ck_informes_finales_vuelo_revision CHECK (
    estado_revision IN (N'PRESENTADO', N'DEVUELTO', N'APROBADO', N'REEMPLAZADO', N'HISTORICO_SIN_DECISION')
    AND origen_decision IN (N'FLUJO_ACTUAL', N'HISTORICA_OBLIGACION', N'HISTORICA_OBLIGACION_AUDITADA', N'HISTORICA_SIN_EVIDENCIA')
    AND (
        (estado_revision = N'DEVUELTO' AND motivo_devolucion IS NOT NULL AND LEN(LTRIM(RTRIM(motivo_devolucion))) > 0
            AND fecha_revision IS NOT NULL AND id_usuario_revisor IS NOT NULL AND origen_decision <> N'HISTORICA_SIN_EVIDENCIA')
        OR (estado_revision = N'APROBADO' AND fecha_revision IS NOT NULL AND id_usuario_revisor IS NOT NULL AND origen_decision <> N'HISTORICA_SIN_EVIDENCIA')
        OR (estado_revision = N'PRESENTADO' AND origen_decision <> N'HISTORICA_SIN_EVIDENCIA')
        OR (estado_revision IN (N'REEMPLAZADO', N'HISTORICO_SIN_DECISION') AND origen_decision = N'HISTORICA_SIN_EVIDENCIA'
            AND fecha_revision IS NULL AND id_usuario_revisor IS NULL)
    ));
GO

ALTER TABLE dbo.informes_finales_vuelo ADD CONSTRAINT ck_informes_finales_vuelo_adjunto CHECK (
    (adjunto_nombre_original IS NULL AND adjunto_ubicacion IS NULL AND adjunto_tamanio_bytes IS NULL AND adjunto_sha256 IS NULL)
    OR (adjunto_nombre_original IS NOT NULL AND adjunto_ubicacion IS NOT NULL AND adjunto_tamanio_bytes > 0 AND adjunto_sha256 IS NOT NULL
        AND LEN(adjunto_sha256) = 64));
-- Todo informe del flujo actual tiene texto, PDF o ambos.
ALTER TABLE dbo.informes_finales_vuelo ADD CONSTRAINT ck_informes_finales_vuelo_contenido CHECK (
    origen_decision <> N'FLUJO_ACTUAL' OR adjunto_ubicacion IS NOT NULL OR LEN(LTRIM(RTRIM(ISNULL(resumen, N'')))) > 0);
GO
CREATE UNIQUE INDEX ux_informes_finales_vuelo_adjunto_ubicacion ON dbo.informes_finales_vuelo(adjunto_ubicacion) WHERE adjunto_ubicacion IS NOT NULL;
CREATE INDEX ix_obligaciones_informe_final_finalizador ON dbo.obligaciones_informe_final(id_usuario_finalizador) WHERE id_usuario_finalizador IS NOT NULL;
GO

-- COMPLETADO sólo desde FINALIZADO y con la obligación vigente aprobada sobre una versión aprobada.
-- (Reemplaza el trigger de V42; las demás reglas del ciclo terminal se conservan.)
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
     OR (n.codigo_estado_vuelo = N'COMPLETADO' AND (ISNULL(p.codigo_estado_vuelo, N'') <> N'FINALIZADO' OR NOT EXISTS (
            SELECT 1 FROM dbo.obligaciones_informe_final o
            INNER JOIN dbo.informes_finales_vuelo r ON r.id_informes_finales_vuelo = o.id_informes_finales_vuelo
            WHERE o.id_vuelos = i.id_vuelos AND o.es_actual = 1 AND o.estado_obligacion = N'APROBADO'
              AND r.estado_revision = N'APROBADO' AND r.es_version_actual = 1)))
   ))
   THROW 51043, 'Transición de estado de vuelo no permitida por el ciclo de vida terminal.', 1;
END;
GO

-- Una obligación sólo pasa a APROBADO con el vuelo FINALIZADO (o ya COMPLETADO) y su versión enlazada aprobada.
CREATE OR ALTER TRIGGER dbo.trg_obligaciones_informe_validar_aprobacion ON dbo.obligaciones_informe_final AFTER INSERT, UPDATE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS (
   SELECT 1 FROM inserted i
   LEFT JOIN deleted d ON d.id_obligaciones_informe_final = i.id_obligaciones_informe_final
   INNER JOIN dbo.vuelos v ON v.id_vuelos = i.id_vuelos
   LEFT JOIN dbo.estados_vuelo e ON e.id_estados_vuelo = v.id_estados_vuelo
   WHERE i.estado_obligacion = N'APROBADO' AND (d.estado_obligacion IS NULL OR d.estado_obligacion <> N'APROBADO')
     AND (ISNULL(e.codigo_estado_vuelo, N'') NOT IN (N'FINALIZADO', N'COMPLETADO')
          OR NOT EXISTS (SELECT 1 FROM dbo.informes_finales_vuelo r WHERE r.id_informes_finales_vuelo = i.id_informes_finales_vuelo AND r.estado_revision = N'APROBADO'))
 )
   THROW 51044, 'Una obligación sólo puede aprobarse con el vuelo finalizado y su versión de informe aprobada.', 1;
END;
GO
