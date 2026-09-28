CREATE TABLE provincias (id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY, codigo_oficial NVARCHAR(10) NOT NULL UNIQUE, nombre NVARCHAR(100) NOT NULL UNIQUE, activo BIT NOT NULL DEFAULT 1);
GO
CREATE TABLE localidades (id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY, codigo_oficial NVARCHAR(20) NOT NULL UNIQUE, nombre NVARCHAR(200) NOT NULL, provincia_id UNIQUEIDENTIFIER NOT NULL REFERENCES provincias(id), activo BIT NOT NULL DEFAULT 1);
GO
CREATE INDEX ix_localidades_provincia_nombre ON localidades(provincia_id,nombre);
CREATE INDEX ix_localidades_nombre ON localidades(nombre);
GO
ALTER TABLE vuelos ADD localidad_origen_id UNIQUEIDENTIFIER NULL REFERENCES localidades(id), localidad_destino_id UNIQUEIDENTIFIER NULL REFERENCES localidades(id);
GO
CREATE INDEX ix_vuelos_localidad_origen ON vuelos(localidad_origen_id);
CREATE INDEX ix_vuelos_localidad_destino ON vuelos(localidad_destino_id);
GO
ALTER TABLE aeropuertos ADD codigo_oficial NVARCHAR(20) NULL, provincia_id UNIQUEIDENTIFIER NULL REFERENCES provincias(id), localidad_id UNIQUEIDENTIFIER NULL REFERENCES localidades(id), tipo NVARCHAR(30) NULL;
GO
CREATE UNIQUE INDEX uq_aeropuertos_codigo_oficial ON aeropuertos(codigo_oficial) WHERE codigo_oficial IS NOT NULL;
CREATE INDEX ix_aeropuertos_provincia_nombre ON aeropuertos(provincia_id,nombre);
CREATE INDEX ix_aeropuertos_localidad ON aeropuertos(localidad_id);
CREATE INDEX ix_aeropuertos_codigo_oaci ON aeropuertos(codigo_oaci) WHERE codigo_oaci IS NOT NULL;
CREATE INDEX ix_aeropuertos_codigo_iata ON aeropuertos(codigo_iata) WHERE codigo_iata IS NOT NULL;
