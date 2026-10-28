-- I-5.7: la integridad de las tablas de V59 deja de depender sólo del código de la aplicación, las políticas se activan por lotes aprobados
-- y los documentos anteriores a V59 conservan de forma permanente su condición de heredados (aunque luego se analicen).
-- Ninguna fila de negocio se crea ni se borra aquí; sólo se clasifican los documentos que V59 dejó sin análisis ni huella.

-- 1. Políticas: trazabilidad de la aprobación del lote que las activó (NULL = alta individual).
ALTER TABLE dbo.politicas_habilitacion ADD
 referencia_aprobacion NVARCHAR(500) NULL,
 lote_activacion VARCHAR(36) NULL;
GO
CREATE INDEX ix_politicas_lote_activacion ON dbo.politicas_habilitacion(lote_activacion) WHERE lote_activacion IS NOT NULL;
GO

-- 2. Documentos: origen del registro, momento en que se calculó la huella y regularización.
-- hash_momento = CARGA: la huella se calculó al recibir el archivo (prueba que no cambió desde entonces).
-- hash_momento = REGULARIZACION: se calculó después sobre el archivo almacenado; no prueba integridad desde la carga original.
ALTER TABLE dbo.documentos_habilitacion ADD
 origen_registro VARCHAR(15) NOT NULL CONSTRAINT df_dochab_origen DEFAULT 'POSTERIOR_V59',
 hash_momento VARCHAR(15) NULL,
 fecha_regularizacion DATETIME2(3) NULL,
 id_usuario_regularizacion BIGINT NULL CONSTRAINT fk_dochab_regularizo REFERENCES dbo.usuarios(id_usuarios);
GO
UPDATE dbo.documentos_habilitacion SET origen_registro = 'ANTERIOR_V59'
 WHERE estado_analisis = 'LEGADO_SIN_ANALISIS' AND hash_sha256 IS NULL AND fecha_analisis IS NULL;
UPDATE dbo.documentos_habilitacion SET hash_momento = 'CARGA' WHERE hash_sha256 IS NOT NULL;
GO
ALTER TABLE dbo.documentos_habilitacion ADD
 CONSTRAINT ck_dochab_origen CHECK (origen_registro IN ('ANTERIOR_V59','POSTERIOR_V59')),
 CONSTRAINT ck_dochab_hash_momento CHECK (hash_momento IS NULL OR hash_momento IN ('CARGA','REGULARIZACION')),
 CONSTRAINT ck_dochab_hash_coherente CHECK ((hash_sha256 IS NULL AND hash_momento IS NULL) OR (hash_sha256 IS NOT NULL AND hash_momento IS NOT NULL)),
 CONSTRAINT ck_dochab_regularizacion CHECK ((fecha_regularizacion IS NULL AND id_usuario_regularizacion IS NULL) OR (fecha_regularizacion IS NOT NULL AND id_usuario_regularizacion IS NOT NULL AND origen_registro = 'ANTERIOR_V59'));
GO
CREATE INDEX ix_dochab_origen_analisis ON dbo.documentos_habilitacion(origen_registro, estado_analisis);
GO

-- 3. Historial inmutable: decisiones y consultas externas no se modifican ni se eliminan (igual que eventos_auditoria).
CREATE TRIGGER dbo.tr_decisiones_habilitacion_inmutable ON dbo.decisiones_habilitacion AFTER UPDATE, DELETE AS
BEGIN
 SET NOCOUNT ON;
 THROW 51060, N'Las decisiones sobre habilitaciones son inmutables: no admiten modificación ni eliminación', 1;
END;
GO
CREATE TRIGGER dbo.tr_consultas_externas_inmutable ON dbo.consultas_externas_habilitacion AFTER UPDATE, DELETE AS
BEGIN
 SET NOCOUNT ON;
 THROW 51061, N'Las consultas externas registradas son inmutables: no admiten modificación ni eliminación', 1;
END;
GO

-- 4. Políticas: no se eliminan; sólo pasan de activa a dada de baja. La definición y la baja ya registrada no cambian.
CREATE TRIGGER dbo.tr_politicas_habilitacion_proteccion ON dbo.politicas_habilitacion AFTER UPDATE, DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF NOT EXISTS (SELECT 1 FROM inserted)
  THROW 51062, N'Las políticas de habilitación no se eliminan: se dan de baja con motivo', 1;
 IF EXISTS (
  SELECT i.id_politicas_habilitacion, i.id_roles_tripulacion, i.id_tipos_vuelo, i.categoria_aeronave, i.tipo_habilitacion, i.requiere_jurisdiccion, i.requiere_consulta_externa,
         i.origen, i.fuente_referencia, i.observaciones, i.id_usuario_alta, i.fecha_alta, i.referencia_aprobacion, i.lote_activacion
  FROM inserted i
  EXCEPT
  SELECT d.id_politicas_habilitacion, d.id_roles_tripulacion, d.id_tipos_vuelo, d.categoria_aeronave, d.tipo_habilitacion, d.requiere_jurisdiccion, d.requiere_consulta_externa,
         d.origen, d.fuente_referencia, d.observaciones, d.id_usuario_alta, d.fecha_alta, d.referencia_aprobacion, d.lote_activacion
  FROM deleted d)
  THROW 51063, N'La definición de una política no se modifica: dé de baja la política y cree una nueva', 1;
 IF EXISTS (
  SELECT i.id_politicas_habilitacion, i.activa, i.id_usuario_baja, i.fecha_baja, i.motivo_baja FROM inserted i JOIN deleted d ON d.id_politicas_habilitacion = i.id_politicas_habilitacion WHERE d.activa = 0
  EXCEPT
  SELECT d.id_politicas_habilitacion, d.activa, d.id_usuario_baja, d.fecha_baja, d.motivo_baja FROM deleted d WHERE d.activa = 0)
  THROW 51064, N'Una política dada de baja no puede reactivarse ni alterar su baja: cree una nueva', 1;
END;
GO

-- 5. Documentos: no se eliminan; el archivo, la huella ya registrada, el origen y la baja ya registrada no cambian.
CREATE TRIGGER dbo.tr_documentos_habilitacion_integridad ON dbo.documentos_habilitacion AFTER UPDATE, DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF NOT EXISTS (SELECT 1 FROM inserted)
  THROW 51065, N'Los documentos de habilitación no se eliminan: se retiran con motivo', 1;
 IF EXISTS (
  SELECT 1 FROM inserted i JOIN deleted d ON d.id_documentos_habilitacion = i.id_documentos_habilitacion
  WHERE i.clave_archivo <> d.clave_archivo
     OR i.id_habilitaciones_profesionales <> d.id_habilitaciones_profesionales
     OR i.origen_registro <> d.origen_registro
     OR i.proposito <> d.proposito
     OR (d.hash_sha256 IS NOT NULL AND (i.hash_sha256 IS NULL OR i.hash_sha256 <> d.hash_sha256))
     OR (d.hash_momento IS NOT NULL AND (i.hash_momento IS NULL OR i.hash_momento <> d.hash_momento))
     OR (d.fecha_baja IS NOT NULL AND (i.fecha_baja IS NULL OR i.fecha_baja <> d.fecha_baja)))
  THROW 51066, N'El archivo, la huella registrada, el origen y la baja de un documento de habilitación no se modifican', 1;
END;
GO
