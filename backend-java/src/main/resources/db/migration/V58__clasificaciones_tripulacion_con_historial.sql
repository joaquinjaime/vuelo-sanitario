-- V58: la clasificación administrativa de tripulación se retira sin borrarse (I-5.5, clasificaciones_tripulacion).
-- Hasta V57 retirar una función eliminaba la fila: quién clasificó, cuándo y por cuánto tiempo sólo sobrevivía en la auditoría, y reclasificar a la
-- misma persona la presentaba como una clasificación nueva sin pasado. Ahora una fila vigente tiene fecha_baja NULL; retirarla registra fecha, actor y
-- motivo y la conserva como historial, y reclasificar inserta una fila nueva. La unicidad pasa a aplicarse sólo entre filas vigentes. No se modifican
-- ni se eliminan filas existentes: todas quedan vigentes.
ALTER TABLE dbo.clasificaciones_tripulacion ADD
    fecha_baja DATETIME2(3) NULL,
    id_usuario_baja BIGINT NULL,
    motivo_baja NVARCHAR(200) NULL;
GO
ALTER TABLE dbo.clasificaciones_tripulacion ADD CONSTRAINT fk_clasificacion_usuario_baja FOREIGN KEY (id_usuario_baja) REFERENCES dbo.usuarios (id_usuarios);
ALTER TABLE dbo.clasificaciones_tripulacion ADD CONSTRAINT ck_clasificacion_baja CHECK (
    (fecha_baja IS NULL AND id_usuario_baja IS NULL AND motivo_baja IS NULL)
    OR (fecha_baja IS NOT NULL AND id_usuario_baja IS NOT NULL AND motivo_baja IS NOT NULL AND LEN(LTRIM(RTRIM(motivo_baja))) > 0));
GO
IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = N'uq_clasificacion_tripulacion' AND parent_object_id = OBJECT_ID(N'dbo.clasificaciones_tripulacion'))
    ALTER TABLE dbo.clasificaciones_tripulacion DROP CONSTRAINT uq_clasificacion_tripulacion;
ELSE IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'uq_clasificacion_tripulacion' AND object_id = OBJECT_ID(N'dbo.clasificaciones_tripulacion'))
    DROP INDEX uq_clasificacion_tripulacion ON dbo.clasificaciones_tripulacion;
GO
CREATE UNIQUE INDEX ux_clasificacion_tripulacion_vigente ON dbo.clasificaciones_tripulacion (id_usuarios, id_roles_tripulacion) WHERE fecha_baja IS NULL;
GO
CREATE INDEX ix_clasificacion_tripulacion_rol_vigente ON dbo.clasificaciones_tripulacion (id_roles_tripulacion, id_usuarios) WHERE fecha_baja IS NULL;
GO
