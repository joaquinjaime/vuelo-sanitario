-- V25 reconstruyó el catálogo sin el estado utilizado por la respuesta del
-- comandante. No modifica estados ni vuelos existentes.
IF NOT EXISTS (SELECT 1 FROM dbo.estados_vuelo WHERE codigo_estado_vuelo = N'PENDIENTE_REPLANIFICACION')
    INSERT INTO dbo.estados_vuelo (codigo_estado_vuelo, nombre_estado_vuelo, orden)
    VALUES (N'PENDIENTE_REPLANIFICACION', N'Pendiente de replanificación', 8);
GO
