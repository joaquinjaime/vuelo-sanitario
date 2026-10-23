-- Reinstaura la restricción que se perdió al reconstruir las claves en V24.
-- Si existen duplicados, Flyway debe detenerse para que se revisen sin perder datos.
CREATE UNIQUE INDEX uq_informacion_hangar_version_actual
    ON dbo.informacion_hangar (id_vuelos) WHERE es_version_actual = 1;
