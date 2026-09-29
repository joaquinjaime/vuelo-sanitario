-- La disponibilidad se deriva de vuelos reservados/en curso; sólo se persiste
-- la ubicación física administrativa de la aeronave.
ALTER TABLE aeronaves ADD aeropuerto_actual_id UNIQUEIDENTIFIER NULL;
ALTER TABLE aeronaves ADD CONSTRAINT fk_aeronaves_aeropuerto_actual
    FOREIGN KEY (aeropuerto_actual_id) REFERENCES aeropuertos(id);
GO
CREATE INDEX ix_aeronaves_aeropuerto_actual_activo
    ON aeronaves(aeropuerto_actual_id, activo);
GO
CREATE INDEX ix_vuelos_aeronave_estado
    ON vuelos(aeronave_id, estado_id)
    WHERE aeronave_id IS NOT NULL;
GO
