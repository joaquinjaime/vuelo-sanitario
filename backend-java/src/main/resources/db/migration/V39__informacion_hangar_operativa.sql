-- Las referencias son el contexto de la versión, no la ubicación oficial de la aeronave.
ALTER TABLE dbo.informacion_hangar ADD requiere_hangar bit NULL,
    observaciones_comandante nvarchar(max) NULL,
    id_aeronave_contexto bigint NULL,
    id_origen_contexto bigint NULL,
    id_comandante_contexto bigint NULL;
ALTER TABLE dbo.informacion_hangar ADD CONSTRAINT FK_hangar_aeronave_contexto
    FOREIGN KEY (id_aeronave_contexto) REFERENCES dbo.aeronaves(id_aeronaves);
ALTER TABLE dbo.informacion_hangar ADD CONSTRAINT FK_hangar_origen_contexto
    FOREIGN KEY (id_origen_contexto) REFERENCES dbo.aeropuertos(id_aeropuertos);
ALTER TABLE dbo.informacion_hangar ADD CONSTRAINT FK_hangar_comandante_contexto
    FOREIGN KEY (id_comandante_contexto) REFERENCES dbo.usuarios(id_usuarios);
