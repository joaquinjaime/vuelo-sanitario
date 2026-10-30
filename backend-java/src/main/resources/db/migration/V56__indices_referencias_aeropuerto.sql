-- V56: índices de las referencias a aeropuertos (I-5.3, bajas lógicas e integridad referencial).
-- La baja lógica de un aeropuerto cuenta sus referencias vigentes (vuelos abiertos, rutas vigentes con el aeropuerto como alternativo, coordinaciones
-- de vuelos abiertos) dentro de una transacción que ya bloqueó la fila del aeropuerto. Sin un índice por la columna referenciante, SQL Server resuelve
-- ese conteo con un recorrido completo de la tabla y espera por filas que otras transacciones modifican sin tener relación con el aeropuerto, lo que
-- convierte una baja en un riesgo de bloqueo mutuo. Con el índice el conteo busca sólo las filas del aeropuerto. No cambia datos ni restricciones.
-- vuelos.id_aeropuerto_origen/destino y aeronaves.id_aeropuertos ya tienen índice (V1/V18).
CREATE INDEX idx_rutas_vuelo_aeropuerto_alternativo ON dbo.rutas_vuelo (id_aeropuerto_alternativo);
GO
CREATE INDEX idx_coordinaciones_aa2000_aeropuerto_gestion ON dbo.coordinaciones_aa2000 (id_aeropuerto_gestion);
GO
CREATE INDEX idx_informacion_hangar_origen_contexto ON dbo.informacion_hangar (id_origen_contexto);
GO
