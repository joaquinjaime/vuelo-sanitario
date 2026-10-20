-- Convención definitiva: toda tabla de aplicación tiene su propio
-- id_<tabla> BIGINT IDENTITY y toda relación interna es BIGINT.
SET XACT_ABORT ON;
GO

-- sp_rename no actualiza el cuerpo de los módulos dependientes. Se recrea al
-- final con la nomenclatura física definitiva.
DROP TRIGGER IF EXISTS dbo.trg_vuelos_validar_ciclo_vida;
GO

CREATE TABLE #relaciones_v27 (
    tabla_origen sysname NOT NULL, columna_origen sysname NOT NULL,
    tabla_destino sysname NOT NULL, columna_destino sysname NOT NULL,
    nueva_columna_origen sysname NULL, nueva_columna_destino sysname NULL,
    accion_borrado nvarchar(60) NOT NULL
);
INSERT INTO #relaciones_v27(tabla_origen,columna_origen,tabla_destino,columna_destino,accion_borrado)
SELECT OBJECT_NAME(fk.parent_object_id),pc.name,OBJECT_NAME(fk.referenced_object_id),rc.name,fk.delete_referential_action_desc
FROM sys.foreign_keys fk
JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id=fk.object_id
JOIN sys.columns pc ON pc.object_id=fk.parent_object_id AND pc.column_id=fkc.parent_column_id
JOIN sys.columns rc ON rc.object_id=fk.referenced_object_id AND rc.column_id=fkc.referenced_column_id
WHERE OBJECT_SCHEMA_NAME(fk.parent_object_id)=N'dbo';

UPDATE #relaciones_v27
SET nueva_columna_destino=N'id_'+tabla_destino,
    nueva_columna_origen=CASE
      WHEN tabla_destino=N'usuarios' AND columna_origen=N'creado_por_usuario_id' THEN N'id_usuario_creador'
      WHEN tabla_destino=N'usuarios' AND columna_origen=N'comandante_usuario_id' THEN N'id_usuario_comandante'
      WHEN tabla_destino=N'usuarios' AND columna_origen=N'cancelado_por_usuario_id' THEN N'id_usuario_cancelador'
      WHEN tabla_destino=N'usuarios' AND columna_origen=N'asignado_por_usuario_id' THEN N'id_usuario_asignador'
      WHEN tabla_destino=N'usuarios' AND columna_origen=N'registrado_por_usuario_id' THEN N'id_usuario_registrador'
      WHEN tabla_destino=N'usuarios' AND columna_origen=N'solicitado_por_usuario_id' THEN N'id_usuario_solicitante'
      WHEN tabla_destino=N'usuarios' AND columna_origen=N'evaluado_por_usuario_id' THEN N'id_usuario_evaluador'
      WHEN tabla_destino=N'usuarios' AND columna_origen=N'actor_usuario_id' THEN N'id_usuario_actor'
      WHEN tabla_destino=N'usuarios' AND columna_origen=N'administrador_creador_id' THEN N'id_usuario_administrador_creador'
      WHEN tabla_destino=N'usuarios' AND columna_origen=N'devuelto_por_usuario_id' THEN N'id_usuario_devolvedor'
      WHEN tabla_destino=N'usuarios' AND columna_origen=N'aprobado_por_usuario_id' THEN N'id_usuario_aprobador'
      WHEN tabla_destino=N'aeropuertos' AND columna_origen=N'origen_id' THEN N'id_aeropuerto_origen'
      WHEN tabla_destino=N'aeropuertos' AND columna_origen=N'destino_id' THEN N'id_aeropuerto_destino'
      WHEN tabla_destino=N'aeropuertos' AND columna_origen=N'aeropuerto_origen_id' THEN N'id_aeropuerto_origen'
      WHEN tabla_destino=N'aeropuertos' AND columna_origen=N'aeropuerto_destino_id' THEN N'id_aeropuerto_destino'
      WHEN tabla_destino=N'localidades' AND columna_origen=N'localidad_origen_id' THEN N'id_localidad_origen'
      WHEN tabla_destino=N'localidades' AND columna_origen=N'localidad_destino_id' THEN N'id_localidad_destino'
      ELSE N'id_'+tabla_destino END;

DECLARE @sql nvarchar(max),@tabla sysname,@nombre sysname;

-- Las definiciones CHECK se conservan y se reescriben con las columnas FK
-- finales. sp_rename no actualiza esos módulos dependientes.
CREATE TABLE #checks_v27 (tabla sysname NOT NULL, nombre sysname NOT NULL, definicion nvarchar(max) NOT NULL);
INSERT INTO #checks_v27(tabla,nombre,definicion)
SELECT t.name,cc.name,cc.definition
FROM sys.check_constraints cc JOIN sys.tables t ON t.object_id=cc.parent_object_id
WHERE t.schema_id=SCHEMA_ID(N'dbo');
DECLARE drop_checks_cursor CURSOR LOCAL STATIC READ_ONLY FOR SELECT tabla,nombre FROM #checks_v27;
OPEN drop_checks_cursor; FETCH NEXT FROM drop_checks_cursor INTO @tabla,@nombre;
WHILE @@FETCH_STATUS=0 BEGIN
  SET @sql=N'ALTER TABLE dbo.'+QUOTENAME(@tabla)+N' DROP CONSTRAINT '+QUOTENAME(@nombre); EXEC sp_executesql @sql;
  FETCH NEXT FROM drop_checks_cursor INTO @tabla,@nombre;
END
CLOSE drop_checks_cursor; DEALLOCATE drop_checks_cursor;

DECLARE fk_cursor CURSOR LOCAL STATIC READ_ONLY FOR
SELECT QUOTENAME(OBJECT_SCHEMA_NAME(parent_object_id))+N'.'+QUOTENAME(OBJECT_NAME(parent_object_id)),QUOTENAME(name) FROM sys.foreign_keys;
OPEN fk_cursor; FETCH NEXT FROM fk_cursor INTO @tabla,@nombre;
WHILE @@FETCH_STATUS=0 BEGIN SET @sql=N'ALTER TABLE '+@tabla+N' DROP CONSTRAINT '+@nombre; EXEC sp_executesql @sql; FETCH NEXT FROM fk_cursor INTO @tabla,@nombre; END
CLOSE fk_cursor; DEALLOCATE fk_cursor;

DECLARE pk_cursor CURSOR LOCAL STATIC READ_ONLY FOR
SELECT QUOTENAME(OBJECT_SCHEMA_NAME(kc.parent_object_id))+N'.'+QUOTENAME(OBJECT_NAME(kc.parent_object_id)),QUOTENAME(kc.name)
FROM sys.key_constraints kc
JOIN sys.tables t ON t.object_id=kc.parent_object_id
WHERE kc.type=N'PK' AND t.schema_id=SCHEMA_ID(N'dbo')
  AND t.name NOT IN (N'flyway_schema_history',N'sysdiagrams');
OPEN pk_cursor; FETCH NEXT FROM pk_cursor INTO @tabla,@nombre;
WHILE @@FETCH_STATUS=0 BEGIN SET @sql=N'ALTER TABLE '+@tabla+N' DROP CONSTRAINT '+@nombre; EXEC sp_executesql @sql; FETCH NEXT FROM pk_cursor INTO @tabla,@nombre; END
CLOSE pk_cursor; DEALLOCATE pk_cursor;

-- V24 deja la identidad como `id`; se le da el nombre físico definitivo.
DECLARE id_cursor CURSOR LOCAL STATIC READ_ONLY FOR
SELECT QUOTENAME(SCHEMA_NAME(t.schema_id))+N'.'+QUOTENAME(t.name),t.name FROM sys.tables t
WHERE t.schema_id=SCHEMA_ID(N'dbo') AND t.name NOT IN (N'flyway_schema_history',N'sysdiagrams')
  AND EXISTS (SELECT 1 FROM sys.columns c WHERE c.object_id=t.object_id AND c.name=N'id');
OPEN id_cursor; FETCH NEXT FROM id_cursor INTO @tabla,@nombre;
WHILE @@FETCH_STATUS=0 BEGIN
  SET @sql=N'EXEC sp_rename N'''+@tabla+N'.id'',N''id_'+@nombre+N''',N''COLUMN'';'; EXEC sp_executesql @sql;
  FETCH NEXT FROM id_cursor INTO @tabla,@nombre;
END
CLOSE id_cursor; DEALLOCATE id_cursor;

-- Las antiguas excepciones reciben su propia identidad sin perder su 1:1/N:M.
IF COL_LENGTH(N'dbo.perfiles_comandante',N'id_perfiles_comandante') IS NULL ALTER TABLE perfiles_comandante ADD id_perfiles_comandante BIGINT IDENTITY(1,1) NOT NULL;
IF COL_LENGTH(N'dbo.vuelos_sanitarios',N'id_vuelos_sanitarios') IS NULL ALTER TABLE vuelos_sanitarios ADD id_vuelos_sanitarios BIGINT IDENTITY(1,1) NOT NULL;
IF COL_LENGTH(N'dbo.usuarios_roles',N'id_usuarios_roles') IS NULL ALTER TABLE usuarios_roles ADD id_usuarios_roles BIGINT IDENTITY(1,1) NOT NULL;

DECLARE @origen sysname,@col_origen sysname,@nuevo_origen sysname;
DECLARE rename_fk_cursor CURSOR LOCAL STATIC READ_ONLY FOR
SELECT tabla_origen,columna_origen,nueva_columna_origen FROM #relaciones_v27 WHERE columna_origen<>nueva_columna_origen;
OPEN rename_fk_cursor; FETCH NEXT FROM rename_fk_cursor INTO @origen,@col_origen,@nuevo_origen;
WHILE @@FETCH_STATUS=0 BEGIN
  SET @sql=N'EXEC sp_rename N''dbo.'+@origen+N'.'+@col_origen+N''',N'''+@nuevo_origen+N''',N''COLUMN'';'; EXEC sp_executesql @sql;
  FETCH NEXT FROM rename_fk_cursor INTO @origen,@col_origen,@nuevo_origen;
END
CLOSE rename_fk_cursor; DEALLOCATE rename_fk_cursor;

-- PK uniforme y restricciones que preservan las cardinalidades anteriores.
DECLARE pk_final_cursor CURSOR LOCAL STATIC READ_ONLY FOR
SELECT name FROM sys.tables WHERE schema_id=SCHEMA_ID(N'dbo') AND name NOT IN (N'flyway_schema_history',N'sysdiagrams');
OPEN pk_final_cursor; FETCH NEXT FROM pk_final_cursor INTO @nombre;
WHILE @@FETCH_STATUS=0 BEGIN
  SET @sql=N'ALTER TABLE dbo.'+QUOTENAME(@nombre)+N' ADD CONSTRAINT '+QUOTENAME(N'pk_'+@nombre)+N' PRIMARY KEY ('+QUOTENAME(N'id_'+@nombre)+N')'; EXEC sp_executesql @sql;
  FETCH NEXT FROM pk_final_cursor INTO @nombre;
END
CLOSE pk_final_cursor; DEALLOCATE pk_final_cursor;

ALTER TABLE perfiles_comandante ADD CONSTRAINT uq_perfiles_comandante_id_personas UNIQUE(id_personas);
ALTER TABLE vuelos_sanitarios ADD CONSTRAINT uq_vuelos_sanitarios_id_vuelos UNIQUE(id_vuelos);
ALTER TABLE usuarios_roles ADD CONSTRAINT uq_usuarios_roles_id_usuarios_id_roles UNIQUE(id_usuarios,id_roles);

DECLARE @destino sysname,@nuevo_destino sysname,@borrado nvarchar(60);
DECLARE recreate_fk_cursor CURSOR LOCAL STATIC READ_ONLY FOR
SELECT tabla_origen,nueva_columna_origen,tabla_destino,nueva_columna_destino,accion_borrado FROM #relaciones_v27;
OPEN recreate_fk_cursor; FETCH NEXT FROM recreate_fk_cursor INTO @origen,@nuevo_origen,@destino,@nuevo_destino,@borrado;
WHILE @@FETCH_STATUS=0 BEGIN
  SET @sql=N'ALTER TABLE dbo.'+QUOTENAME(@origen)+N' ADD CONSTRAINT '+QUOTENAME(N'fk_'+@origen+N'_'+@nuevo_origen)+N' FOREIGN KEY ('+QUOTENAME(@nuevo_origen)+N') REFERENCES dbo.'+QUOTENAME(@destino)+N'('+QUOTENAME(@nuevo_destino)+N')'+CASE WHEN @borrado=N'CASCADE' THEN N' ON DELETE CASCADE' ELSE N'' END+N'; CREATE INDEX '+QUOTENAME(N'idx_'+@origen+N'_'+@nuevo_origen)+N' ON dbo.'+QUOTENAME(@origen)+N'('+QUOTENAME(@nuevo_origen)+N');';
  EXEC sp_executesql @sql; FETCH NEXT FROM recreate_fk_cursor INTO @origen,@nuevo_origen,@destino,@nuevo_destino,@borrado;
END
CLOSE recreate_fk_cursor; DEALLOCATE recreate_fk_cursor;

DECLARE @definicion_check nvarchar(max),@columna_anterior sysname,@columna_final sysname;
DECLARE recreate_checks_cursor CURSOR LOCAL STATIC READ_ONLY FOR SELECT tabla,nombre,definicion FROM #checks_v27;
OPEN recreate_checks_cursor; FETCH NEXT FROM recreate_checks_cursor INTO @tabla,@nombre,@definicion_check;
WHILE @@FETCH_STATUS=0 BEGIN
  DECLARE renombre_check_cursor CURSOR LOCAL STATIC READ_ONLY FOR
  SELECT columna_origen,nueva_columna_origen FROM #relaciones_v27 WHERE tabla_origen=@tabla AND columna_origen<>nueva_columna_origen;
  OPEN renombre_check_cursor; FETCH NEXT FROM renombre_check_cursor INTO @columna_anterior,@columna_final;
  WHILE @@FETCH_STATUS=0 BEGIN
    SET @definicion_check=REPLACE(@definicion_check,@columna_anterior,@columna_final);
    FETCH NEXT FROM renombre_check_cursor INTO @columna_anterior,@columna_final;
  END
  CLOSE renombre_check_cursor; DEALLOCATE renombre_check_cursor;
  SET @sql=N'ALTER TABLE dbo.'+QUOTENAME(@tabla)+N' ADD CONSTRAINT '+QUOTENAME(@nombre)+N' CHECK '+@definicion_check;
  EXEC sp_executesql @sql;
  FETCH NEXT FROM recreate_checks_cursor INTO @tabla,@nombre,@definicion_check;
END
CLOSE recreate_checks_cursor; DEALLOCATE recreate_checks_cursor;
GO

CREATE TRIGGER dbo.trg_vuelos_validar_ciclo_vida ON dbo.vuelos AFTER INSERT, UPDATE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS (
   SELECT 1
   FROM inserted i
   LEFT JOIN dbo.estados_vuelo e ON e.id_estados_vuelo=i.id_estados_vuelo
   LEFT JOIN dbo.motivos_cancelacion m ON m.id_motivos_cancelacion=i.id_motivos_cancelacion
   LEFT JOIN deleted d ON d.id_vuelos=i.id_vuelos
   LEFT JOIN dbo.estados_vuelo previo ON previo.id_estados_vuelo=d.id_estados_vuelo
   WHERE (e.codigo=N'CANCELADO' AND (i.fecha_cancelacion IS NULL OR i.id_usuario_cancelador IS NULL OR i.id_motivos_cancelacion IS NULL OR (m.codigo=N'OTRO' AND NULLIF(LTRIM(RTRIM(i.motivo_cancelacion_personalizado)),N'') IS NULL) OR (m.codigo<>N'OTRO' AND i.motivo_cancelacion_personalizado IS NOT NULL)))
      OR ((e.codigo IS NULL OR e.codigo<>N'CANCELADO') AND (i.fecha_cancelacion IS NOT NULL OR i.id_usuario_cancelador IS NOT NULL OR i.id_motivos_cancelacion IS NOT NULL OR i.motivo_cancelacion_personalizado IS NOT NULL))
      OR (e.codigo=N'CANCELADO' AND previo.codigo IN (N'EN_CURSO',N'FINALIZADO',N'COMPLETADO'))
 )
  THROW 51000, 'La cancelación debe ser previa a la ejecución, con actor y motivo válido.', 1;
END;
GO
