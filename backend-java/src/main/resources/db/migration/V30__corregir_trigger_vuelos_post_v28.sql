-- V28 contextualizó los códigos de catálogos. El trigger recreado en V27
-- conservaba los nombres previos y bloqueaba todo INSERT en vuelos.
CREATE OR ALTER TRIGGER dbo.trg_vuelos_validar_ciclo_vida ON dbo.vuelos AFTER INSERT, UPDATE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS (
   SELECT 1 FROM inserted i
   LEFT JOIN dbo.estados_vuelo e ON e.id_estados_vuelo=i.id_estados_vuelo
   LEFT JOIN dbo.motivos_cancelacion m ON m.id_motivos_cancelacion=i.id_motivos_cancelacion
   LEFT JOIN deleted d ON d.id_vuelos=i.id_vuelos
   LEFT JOIN dbo.estados_vuelo previo ON previo.id_estados_vuelo=d.id_estados_vuelo
   WHERE (e.codigo_estado_vuelo=N'CANCELADO' AND (i.fecha_cancelacion IS NULL OR i.id_usuario_cancelador IS NULL OR i.id_motivos_cancelacion IS NULL OR (m.codigo_motivo_cancelacion=N'OTRO' AND NULLIF(LTRIM(RTRIM(i.motivo_cancelacion_personalizado)),N'') IS NULL) OR (m.codigo_motivo_cancelacion<>N'OTRO' AND i.motivo_cancelacion_personalizado IS NOT NULL)))
      OR ((e.codigo_estado_vuelo IS NULL OR e.codigo_estado_vuelo<>N'CANCELADO') AND (i.fecha_cancelacion IS NOT NULL OR i.id_usuario_cancelador IS NOT NULL OR i.id_motivos_cancelacion IS NOT NULL OR i.motivo_cancelacion_personalizado IS NOT NULL))
      OR (e.codigo_estado_vuelo=N'CANCELADO' AND previo.codigo_estado_vuelo IN (N'EN_CURSO',N'FINALIZADO',N'COMPLETADO'))
 ) THROW 51000, 'La cancelación debe ser previa a la ejecución, con actor y motivo válido.', 1;
END;
GO
