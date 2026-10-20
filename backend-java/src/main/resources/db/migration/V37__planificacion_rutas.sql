ALTER TABLE dbo.rutas_vuelo ADD recorrido_planificado NVARCHAR(MAX) NULL, id_aeropuerto_alternativo BIGINT NULL, contexto_operativo NVARCHAR(300) NULL;
ALTER TABLE dbo.rutas_vuelo ADD CONSTRAINT FK_rutas_vuelo_aeropuerto_alternativo FOREIGN KEY (id_aeropuerto_alternativo) REFERENCES dbo.aeropuertos(id_aeropuertos);
CREATE UNIQUE INDEX uq_rutas_vuelo_actual ON dbo.rutas_vuelo(id_vuelos) WHERE es_version_actual = 1;
