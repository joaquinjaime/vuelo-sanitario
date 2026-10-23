-- Tripulación adicional con historial: el retiro o reemplazo de un tripulante ya no borra la fila de vuelos_tripulantes.
-- Migración incremental: conserva todas las asignaciones existentes (todas quedan vigentes) y no modifica aeronaves.

-- 1. Baja lógica de la asignación: quién la dio de baja, cuándo y por qué. Una asignación vigente tiene los tres valores en NULL.
ALTER TABLE dbo.vuelos_tripulantes ADD
    fecha_baja DATETIME2 NULL,
    id_usuario_baja BIGINT NULL,
    motivo_baja NVARCHAR(30) NULL;
GO

ALTER TABLE dbo.vuelos_tripulantes ADD CONSTRAINT fk_vuelos_tripulantes_usuario_baja
    FOREIGN KEY (id_usuario_baja) REFERENCES dbo.usuarios(id_usuarios);
GO

ALTER TABLE dbo.vuelos_tripulantes ADD CONSTRAINT ck_vuelos_tripulantes_baja CHECK (
    (fecha_baja IS NULL AND id_usuario_baja IS NULL AND motivo_baja IS NULL)
 OR (fecha_baja IS NOT NULL AND id_usuario_baja IS NOT NULL AND motivo_baja IN (N'RETIRO', N'REEMPLAZO', N'CAMBIO_COMANDANTE')));
GO

-- 2. Las restricciones únicas históricas (vuelo + usuario [+ rol]) impedirían volver a asignar a una persona retirada.
--    Se reemplazan por un único índice filtrado: una persona sólo puede tener UNA asignación vigente por vuelo.
--    Los nombres de las restricciones se generaron al renombrar tablas (V8/V27), por eso se localizan dinámicamente.
DECLARE @drop NVARCHAR(MAX) = N'';
SELECT @drop += N'ALTER TABLE dbo.vuelos_tripulantes DROP CONSTRAINT ' + QUOTENAME(kc.name) + N';' + CHAR(10)
FROM sys.key_constraints kc
WHERE kc.parent_object_id = OBJECT_ID(N'dbo.vuelos_tripulantes') AND kc.type = 'UQ';
EXEC sp_executesql @drop;
GO

CREATE UNIQUE INDEX ux_vuelos_tripulantes_asignacion_vigente
    ON dbo.vuelos_tripulantes (id_vuelos, id_usuarios) WHERE fecha_baja IS NULL;
GO

-- 3. Consulta de compromisos de una persona (disponibilidad): sólo asignaciones vigentes.
CREATE INDEX ix_vuelos_tripulantes_usuario_vigente
    ON dbo.vuelos_tripulantes (id_usuarios) INCLUDE (id_vuelos) WHERE fecha_baja IS NULL;
GO
