-- V4: fecha de inicio de ejecución real del vuelo.
-- Base del plazo de 48 horas para cargar el informe final.
ALTER TABLE vuelo
    ADD COLUMN fecha_inicio_ejecucion TIMESTAMP;
