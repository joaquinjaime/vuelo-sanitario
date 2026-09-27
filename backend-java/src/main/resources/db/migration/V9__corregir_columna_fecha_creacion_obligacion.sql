-- Corrección puntual detectada al auditar el catálogo posterior a V8.
-- No cambia la semántica ni la estructura de la obligación; sólo normaliza
-- el último identificador físico de negocio que permanecía en inglés.
EXEC sp_rename N'dbo.obligaciones_informe_final.created_at', N'fecha_creacion', N'COLUMN';
GO
