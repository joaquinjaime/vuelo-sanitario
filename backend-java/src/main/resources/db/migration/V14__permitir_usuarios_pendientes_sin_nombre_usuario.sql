-- SQL Server permite un solo NULL en un índice UNIQUE no filtrado. Las cuentas
-- pendientes aún no poseen nombre de usuario, por lo que la unicidad debe
-- aplicarse únicamente cuando el nombre fue informado.
DECLARE @indice sysname, @tipo nvarchar(10), @sql nvarchar(max);
DECLARE usuario_cursor CURSOR LOCAL FAST_FORWARD FOR
SELECT i.name, CASE WHEN kc.name IS NULL THEN N'INDEX' ELSE N'CONSTRAINT' END
FROM sys.indexes i
JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id
JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
LEFT JOIN sys.key_constraints kc ON kc.parent_object_id=i.object_id AND kc.unique_index_id=i.index_id
WHERE i.object_id=OBJECT_ID(N'dbo.usuarios')
  AND i.is_unique=1
  AND c.name=N'nombre_usuario'
  AND i.filter_definition IS NULL
  AND (SELECT COUNT(*) FROM sys.index_columns only_column WHERE only_column.object_id=i.object_id AND only_column.index_id=i.index_id AND only_column.key_ordinal>0)=1;
OPEN usuario_cursor; FETCH NEXT FROM usuario_cursor INTO @indice,@tipo;
WHILE @@FETCH_STATUS = 0 BEGIN
  SET @sql=CASE WHEN @tipo=N'CONSTRAINT' THEN N'ALTER TABLE usuarios DROP CONSTRAINT '+QUOTENAME(@indice) ELSE N'DROP INDEX '+QUOTENAME(@indice)+N' ON usuarios' END;
  EXEC sp_executesql @sql;
  FETCH NEXT FROM usuario_cursor INTO @indice,@tipo;
END
CLOSE usuario_cursor; DEALLOCATE usuario_cursor;
GO
CREATE UNIQUE INDEX uq_usuarios_nombre_usuario_informado ON usuarios(nombre_usuario) WHERE nombre_usuario IS NOT NULL;
GO
