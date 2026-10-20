-- Cada gestión tiene sus propias versiones; los históricos anteriores de un
-- mismo vuelo se conservan juntos, sin adjudicarles un aeropuerto ficticio.
ALTER TABLE dbo.coordinaciones_aa2000 ADD
    identificador_gestion uniqueidentifier NULL,
    id_aeropuerto_gestion bigint NULL,
    finalidad_gestion nvarchar(200) NULL,
    descripcion_gestion nvarchar(max) NULL,
    canal_comunicacion nvarchar(100) NULL,
    fecha_comunicacion datetime2(3) NULL,
    fecha_respuesta datetime2(3) NULL,
    fuente_respuesta nvarchar(250) NULL,
    referencia_externa nvarchar(250) NULL,
    contexto_planificacion nvarchar(500) NULL,
    motivo_cambio nvarchar(1000) NULL;
GO

DECLARE @grupos TABLE (id_vuelos bigint PRIMARY KEY, identificador uniqueidentifier NOT NULL);
INSERT INTO @grupos SELECT id_vuelos, NEWID() FROM dbo.coordinaciones_aa2000 GROUP BY id_vuelos;
UPDATE c SET identificador_gestion=g.identificador FROM dbo.coordinaciones_aa2000 c JOIN @grupos g ON g.id_vuelos=c.id_vuelos;
ALTER TABLE dbo.coordinaciones_aa2000 ALTER COLUMN identificador_gestion uniqueidentifier NOT NULL;
ALTER TABLE dbo.coordinaciones_aa2000 ADD CONSTRAINT FK_coordinacion_aeropuerto
    FOREIGN KEY (id_aeropuerto_gestion) REFERENCES dbo.aeropuertos(id_aeropuertos);

-- La unicidad antigua sólo permitía una secuencia por vuelo. Se reemplaza
-- por unicidad por gestión para admitir gestiones independientes.
DECLARE @constraint sysname, @sql nvarchar(max);
SELECT @constraint=k.name FROM sys.key_constraints k
 WHERE k.parent_object_id=OBJECT_ID(N'dbo.coordinaciones_aa2000') AND k.type='UQ'
 AND (SELECT COUNT(*) FROM sys.index_columns ic WHERE ic.object_id=k.parent_object_id AND ic.index_id=k.unique_index_id AND ic.key_ordinal>0)=2
 AND EXISTS (SELECT 1 FROM sys.index_columns ic WHERE ic.object_id=k.parent_object_id AND ic.index_id=k.unique_index_id AND COL_NAME(ic.object_id,ic.column_id)=N'id_vuelos')
 AND EXISTS (SELECT 1 FROM sys.index_columns ic WHERE ic.object_id=k.parent_object_id AND ic.index_id=k.unique_index_id AND COL_NAME(ic.object_id,ic.column_id)=N'version');
IF @constraint IS NOT NULL BEGIN SET @sql=N'ALTER TABLE dbo.coordinaciones_aa2000 DROP CONSTRAINT '+QUOTENAME(@constraint); EXEC sp_executesql @sql; END;
SELECT @constraint=name FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.coordinaciones_aa2000') AND definition LIKE N'%estado_autorizacion%';
IF @constraint IS NOT NULL BEGIN SET @sql=N'ALTER TABLE dbo.coordinaciones_aa2000 DROP CONSTRAINT '+QUOTENAME(@constraint); EXEC sp_executesql @sql; END;
ALTER TABLE dbo.coordinaciones_aa2000 ADD CONSTRAINT ck_coordinacion_estado_seguimiento
 CHECK (estado_autorizacion IN (N'PENDIENTE',N'EN_SEGUIMIENTO',N'CONFIRMADO',N'RECHAZADO',N'CANCELADO'));
ALTER TABLE dbo.coordinaciones_aa2000 ADD CONSTRAINT uq_coordinacion_gestion_version UNIQUE (identificador_gestion,version);
CREATE UNIQUE INDEX uq_coordinacion_gestion_actual ON dbo.coordinaciones_aa2000(identificador_gestion) WHERE es_version_actual=1;
