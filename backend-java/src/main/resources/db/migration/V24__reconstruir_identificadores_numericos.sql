-- V24: corte de desarrollo. No conserva datos transaccionales UUID; Flyway
-- conserva su historial y convierte el esquema físico final a BIGINT IDENTITY.
SET XACT_ABORT ON;
GO

CREATE TABLE #relaciones (
    tabla_origen sysname NOT NULL, columna_origen sysname NOT NULL,
    tabla_destino sysname NOT NULL, columna_destino sysname NOT NULL,
    accion_borrado nvarchar(60) NOT NULL
);
INSERT INTO #relaciones
SELECT OBJECT_NAME(fk.parent_object_id), pc.name,
       OBJECT_NAME(fk.referenced_object_id), rc.name, fk.delete_referential_action_desc
FROM sys.foreign_keys fk
JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id=fk.object_id
JOIN sys.columns pc ON pc.object_id=fk.parent_object_id AND pc.column_id=fkc.parent_column_id
JOIN sys.columns rc ON rc.object_id=fk.referenced_object_id AND rc.column_id=fkc.referenced_column_id
WHERE OBJECT_SCHEMA_NAME(fk.parent_object_id)=N'dbo'
  AND OBJECT_NAME(fk.parent_object_id) <> N'flyway_schema_history';

CREATE TABLE #claves (tabla sysname NOT NULL, nombre sysname NOT NULL, tipo char(2) NOT NULL, columnas nvarchar(max) NOT NULL);
INSERT INTO #claves
SELECT OBJECT_NAME(kc.parent_object_id), kc.name, kc.type,
       STRING_AGG(QUOTENAME(c.name), N',') WITHIN GROUP (ORDER BY ic.key_ordinal)
FROM sys.key_constraints kc
JOIN sys.index_columns ic ON ic.object_id=kc.parent_object_id AND ic.index_id=kc.unique_index_id
JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
WHERE OBJECT_NAME(kc.parent_object_id) <> N'flyway_schema_history'
GROUP BY kc.parent_object_id,kc.name,kc.type;

DECLARE @sql nvarchar(max), @tabla sysname, @nombre sysname, @mensaje_error nvarchar(2048);
-- Los datos de desarrollo se descartan antes de cambiar tipos y claves.
DECLARE tablas_cursor CURSOR LOCAL STATIC READ_ONLY FOR
SELECT QUOTENAME(SCHEMA_NAME(schema_id))+N'.'+QUOTENAME(name) FROM sys.tables
WHERE name<>N'flyway_schema_history';
OPEN tablas_cursor; FETCH NEXT FROM tablas_cursor INTO @tabla;
WHILE @@FETCH_STATUS=0 BEGIN
  SET @sql=N'ALTER TABLE '+@tabla+N' NOCHECK CONSTRAINT ALL;'; EXEC sp_executesql @sql;
  FETCH NEXT FROM tablas_cursor INTO @tabla;
END
CLOSE tablas_cursor; DEALLOCATE tablas_cursor;

DECLARE fk_cursor CURSOR LOCAL STATIC READ_ONLY FOR
SELECT QUOTENAME(OBJECT_SCHEMA_NAME(fk.parent_object_id))+N'.'+QUOTENAME(OBJECT_NAME(fk.parent_object_id)), QUOTENAME(fk.name)
FROM sys.foreign_keys fk
WHERE OBJECT_NAME(fk.parent_object_id)<>N'flyway_schema_history';
OPEN fk_cursor; FETCH NEXT FROM fk_cursor INTO @tabla,@nombre;
WHILE @@FETCH_STATUS=0 BEGIN SET @sql=N'ALTER TABLE '+@tabla+N' DROP CONSTRAINT '+@nombre; EXEC sp_executesql @sql; FETCH NEXT FROM fk_cursor INTO @tabla,@nombre; END
CLOSE fk_cursor; DEALLOCATE fk_cursor;

-- Ya no quedan FK que impongan un orden entre tablas para el corte de datos
-- de desarrollo autorizado.
DECLARE eliminar_cursor CURSOR LOCAL STATIC READ_ONLY FOR
SELECT QUOTENAME(SCHEMA_NAME(schema_id))+N'.'+QUOTENAME(name) FROM sys.tables
WHERE name<>N'flyway_schema_history';
OPEN eliminar_cursor; FETCH NEXT FROM eliminar_cursor INTO @tabla;
WHILE @@FETCH_STATUS=0 BEGIN
  SET @sql=N'DELETE FROM '+@tabla+N';'; EXEC sp_executesql @sql;
  FETCH NEXT FROM eliminar_cursor INTO @tabla;
END
CLOSE eliminar_cursor; DEALLOCATE eliminar_cursor;

DECLARE key_cursor CURSOR LOCAL STATIC READ_ONLY FOR
SELECT QUOTENAME(SCHEMA_NAME(t.schema_id))+N'.'+QUOTENAME(t.name),QUOTENAME(kc.name)
FROM sys.key_constraints kc JOIN sys.tables t ON t.object_id=kc.parent_object_id WHERE t.name<>N'flyway_schema_history';
OPEN key_cursor; FETCH NEXT FROM key_cursor INTO @tabla,@nombre;
WHILE @@FETCH_STATUS=0 BEGIN SET @sql=N'ALTER TABLE '+@tabla+N' DROP CONSTRAINT '+@nombre; EXEC sp_executesql @sql; FETCH NEXT FROM key_cursor INTO @tabla,@nombre; END
CLOSE key_cursor; DEALLOCATE key_cursor;

-- Índices secundarios antiguos pueden referenciar UNIQUEIDENTIFIER; se recrean
-- al final sobre cada FK, con la convención idx_<tabla>_<columna>.
DECLARE index_cursor CURSOR LOCAL STATIC READ_ONLY FOR
SELECT QUOTENAME(SCHEMA_NAME(t.schema_id))+N'.'+QUOTENAME(t.name),QUOTENAME(i.name)
FROM sys.indexes i JOIN sys.tables t ON t.object_id=i.object_id
WHERE t.name<>N'flyway_schema_history' AND i.name IS NOT NULL AND i.is_primary_key=0 AND i.is_unique_constraint=0;
OPEN index_cursor; FETCH NEXT FROM index_cursor INTO @tabla,@nombre;
WHILE @@FETCH_STATUS=0 BEGIN SET @sql=N'DROP INDEX '+@nombre+N' ON '+@tabla; EXEC sp_executesql @sql; FETCH NEXT FROM index_cursor INTO @tabla,@nombre; END
CLOSE index_cursor; DEALLOCATE index_cursor;

-- Se quitan los DEFAULT NEWID() antes de eliminar las antiguas PK UUID.
DECLARE default_cursor CURSOR LOCAL STATIC READ_ONLY FOR
SELECT QUOTENAME(SCHEMA_NAME(t.schema_id))+N'.'+QUOTENAME(t.name),QUOTENAME(dc.name)
FROM sys.default_constraints dc JOIN sys.tables t ON t.object_id=dc.parent_object_id
JOIN sys.columns c ON c.object_id=t.object_id AND c.column_id=dc.parent_column_id
WHERE t.name<>N'flyway_schema_history' AND TYPE_NAME(c.system_type_id)=N'uniqueidentifier';
OPEN default_cursor; FETCH NEXT FROM default_cursor INTO @tabla,@nombre;
WHILE @@FETCH_STATUS=0 BEGIN SET @sql=N'ALTER TABLE '+@tabla+N' DROP CONSTRAINT '+@nombre; EXEC sp_executesql @sql; FETCH NEXT FROM default_cursor INTO @tabla,@nombre; END
CLOSE default_cursor; DEALLOCATE default_cursor;

-- Las validaciones pueden comparar dos UUID que se convierten en distintos
-- pasos. Se preservan y se restauran una vez concluida la conversión.
CREATE TABLE #checks_v24 (tabla sysname NOT NULL, nombre sysname NOT NULL, definicion nvarchar(max) NOT NULL);
INSERT INTO #checks_v24(tabla,nombre,definicion)
SELECT t.name,cc.name,cc.definition
FROM sys.check_constraints cc JOIN sys.tables t ON t.object_id=cc.parent_object_id
WHERE t.name<>N'flyway_schema_history';
DECLARE checks_cursor CURSOR LOCAL STATIC READ_ONLY FOR SELECT tabla,nombre FROM #checks_v24;
OPEN checks_cursor; FETCH NEXT FROM checks_cursor INTO @tabla,@nombre;
WHILE @@FETCH_STATUS=0 BEGIN
  SET @sql=N'ALTER TABLE dbo.'+QUOTENAME(@tabla)+N' DROP CONSTRAINT '+QUOTENAME(@nombre); EXEC sp_executesql @sql;
  FETCH NEXT FROM checks_cursor INTO @tabla,@nombre;
END
CLOSE checks_cursor; DEALLOCATE checks_cursor;

-- Toda tabla convencional recibe id BIGINT IDENTITY. Las extensiones 1:1
-- (perfiles_comandante y vuelos_sanitarios) conservan su PK/FK semántica.
DECLARE id_cursor CURSOR LOCAL STATIC READ_ONLY FOR
SELECT QUOTENAME(SCHEMA_NAME(t.schema_id))+N'.'+QUOTENAME(t.name),t.name
FROM sys.tables t JOIN sys.columns c ON c.object_id=t.object_id
WHERE t.name NOT IN (N'flyway_schema_history',N'perfiles_comandante',N'vuelos_sanitarios')
  AND c.name=N'id' AND TYPE_NAME(c.system_type_id)=N'uniqueidentifier';
OPEN id_cursor; FETCH NEXT FROM id_cursor INTO @tabla,@nombre;
WHILE @@FETCH_STATUS=0 BEGIN
  SET @sql=N'EXEC sp_rename N'''+@tabla+N'.id'',N''id_uuid_anterior'',N''COLUMN''; ALTER TABLE '+@tabla+N' ADD id BIGINT IDENTITY(1,1) NOT NULL; ALTER TABLE '+@tabla+N' DROP COLUMN id_uuid_anterior;';
  BEGIN TRY
    EXEC sp_executesql @sql;
  END TRY
  BEGIN CATCH
    SET @mensaje_error=CONCAT(N'No se pudo reemplazar la PK UUID de ',@tabla,N': ',ERROR_MESSAGE());
    THROW 51020, @mensaje_error, 1;
  END CATCH
  FETCH NEXT FROM id_cursor INTO @tabla,@nombre;
END
CLOSE id_cursor; DEALLOCATE id_cursor;

DECLARE @es_nulo bit;
DECLARE uuid_cursor CURSOR LOCAL STATIC READ_ONLY FOR
SELECT QUOTENAME(SCHEMA_NAME(t.schema_id))+N'.'+QUOTENAME(t.name),QUOTENAME(c.name),c.is_nullable
FROM sys.tables t JOIN sys.columns c ON c.object_id=t.object_id
WHERE t.name<>N'flyway_schema_history' AND TYPE_NAME(c.system_type_id)=N'uniqueidentifier';
OPEN uuid_cursor; FETCH NEXT FROM uuid_cursor INTO @tabla,@nombre,@es_nulo;
WHILE @@FETCH_STATUS=0 BEGIN
  -- SQL Server no permite ALTER COLUMN UNIQUEIDENTIFIER -> BIGINT. Como el
  -- corte autorizado ya vació las tablas y retiró claves/índices, se recrea
  -- cada columna conservando nombre y nulabilidad.
  SET @sql=N'ALTER TABLE '+@tabla+N' DROP COLUMN '+@nombre+N'; ALTER TABLE '+@tabla+N' ADD '+@nombre+N' BIGINT '+CASE WHEN @es_nulo=1 THEN N'NULL' ELSE N'NOT NULL' END;
  BEGIN TRY
    EXEC sp_executesql @sql;
  END TRY
  BEGIN CATCH
    SET @mensaje_error=CONCAT(N'No se pudo recrear ',@tabla,N'.',@nombre,N': ',ERROR_MESSAGE());
    THROW 51021, @mensaje_error, 1;
  END CATCH
  FETCH NEXT FROM uuid_cursor INTO @tabla,@nombre,@es_nulo;
END
CLOSE uuid_cursor; DEALLOCATE uuid_cursor;

DECLARE @definicion_check nvarchar(max);
DECLARE recreate_checks_cursor CURSOR LOCAL STATIC READ_ONLY FOR SELECT tabla,nombre,definicion FROM #checks_v24;
OPEN recreate_checks_cursor; FETCH NEXT FROM recreate_checks_cursor INTO @tabla,@nombre,@definicion_check;
WHILE @@FETCH_STATUS=0 BEGIN
  SET @sql=N'ALTER TABLE dbo.'+QUOTENAME(@tabla)+N' ADD CONSTRAINT '+QUOTENAME(@nombre)+N' CHECK '+@definicion_check; EXEC sp_executesql @sql;
  FETCH NEXT FROM recreate_checks_cursor INTO @tabla,@nombre,@definicion_check;
END
CLOSE recreate_checks_cursor; DEALLOCATE recreate_checks_cursor;

DECLARE @tipo char(2),@columnas nvarchar(max),@columnas_finales nvarchar(max);
DECLARE recreate_key_cursor CURSOR LOCAL STATIC READ_ONLY FOR SELECT tabla,nombre,tipo,columnas FROM #claves;
OPEN recreate_key_cursor; FETCH NEXT FROM recreate_key_cursor INTO @tabla,@nombre,@tipo,@columnas;
WHILE @@FETCH_STATUS=0 BEGIN
  SET @columnas_finales=REPLACE(@columnas,N'[id]',N'[id]');
  SET @sql=N'ALTER TABLE dbo.'+QUOTENAME(@tabla)+N' ADD CONSTRAINT '+QUOTENAME(CASE WHEN @tipo=N'PK' THEN N'pk_'+@tabla ELSE @nombre END)+N' '+CASE WHEN @tipo=N'PK' THEN N'PRIMARY KEY' ELSE N'UNIQUE' END+N' ('+@columnas_finales+N')';
  EXEC sp_executesql @sql; FETCH NEXT FROM recreate_key_cursor INTO @tabla,@nombre,@tipo,@columnas;
END
CLOSE recreate_key_cursor; DEALLOCATE recreate_key_cursor;

DECLARE @origen sysname,@col_origen sysname,@destino sysname,@col_destino sysname,@borrado nvarchar(60);
DECLARE recreate_fk_cursor CURSOR LOCAL STATIC READ_ONLY FOR SELECT tabla_origen,columna_origen,tabla_destino,columna_destino,accion_borrado FROM #relaciones;
OPEN recreate_fk_cursor; FETCH NEXT FROM recreate_fk_cursor INTO @origen,@col_origen,@destino,@col_destino,@borrado;
WHILE @@FETCH_STATUS=0 BEGIN
  SET @sql=N'ALTER TABLE dbo.'+QUOTENAME(@origen)+N' ADD CONSTRAINT '+QUOTENAME(N'fk_'+@origen+N'_'+@col_origen)+N' FOREIGN KEY ('+QUOTENAME(@col_origen)+N') REFERENCES dbo.'+QUOTENAME(@destino)+N'('+QUOTENAME(@col_destino)+N')'+CASE WHEN @borrado=N'CASCADE' THEN N' ON DELETE CASCADE' ELSE N'' END+N'; CREATE INDEX '+QUOTENAME(N'idx_'+@origen+N'_'+@col_origen)+N' ON dbo.'+QUOTENAME(@origen)+N'('+QUOTENAME(@col_origen)+N');';
  EXEC sp_executesql @sql; FETCH NEXT FROM recreate_fk_cursor INTO @origen,@col_origen,@destino,@col_destino,@borrado;
END
CLOSE recreate_fk_cursor; DEALLOCATE recreate_fk_cursor;

-- Índices únicos filtrados: reglas de integridad que no se representan como
-- key constraints en SQL Server y que por eso se recrean explícitamente.
CREATE UNIQUE INDEX uq_correos_electronicos_principal_por_persona ON correos_electronicos(persona_id) WHERE es_principal=1;
CREATE UNIQUE INDEX uq_telefonos_principal_por_persona ON telefonos(persona_id) WHERE es_principal=1;
CREATE UNIQUE INDEX uq_activaciones_cuenta_usuario_vigente ON activaciones_cuenta(usuario_id) WHERE fecha_utilizacion IS NULL;
CREATE UNIQUE INDEX uq_versiones_documento_vuelo_actual ON versiones_documento_vuelo(documento_vuelo_id) WHERE es_version_actual=1;
CREATE UNIQUE INDEX uq_obligaciones_informe_final_actual ON obligaciones_informe_final(vuelo_id) WHERE es_actual=1;
GO
