ALTER TABLE dbo.habilitaciones_profesionales
 ADD vencimiento_no_aplica BIT NOT NULL CONSTRAINT df_habilitacion_sin_vencimiento DEFAULT 0 WITH VALUES;
GO
