-- La regla de tipos de negociación depende de la columna física. Se conserva
-- su definición de catálogo y se recompila luego del renombrado.
SET XACT_ABORT ON;

DECLARE @nombre sysname,@definicion nvarchar(max),@sql nvarchar(max);
SELECT @nombre=name,@definicion=definition
FROM sys.check_constraints
WHERE parent_object_id=OBJECT_ID(N'dbo.negociaciones_horario_vuelo')
  AND name=N'ck_negociaciones_horario_tipo';

IF @nombre IS NOT NULL
BEGIN
  SET @sql=N'ALTER TABLE dbo.negociaciones_horario_vuelo DROP CONSTRAINT '+QUOTENAME(@nombre);
  EXEC sp_executesql @sql;
END

EXEC sp_rename N'dbo.negociaciones_horario_vuelo.tipo',N'tipo_negociacion',N'COLUMN';
EXEC sp_rename N'dbo.negociaciones_horario_vuelo.motivo',N'motivo_negociacion',N'COLUMN';

IF @nombre IS NOT NULL
BEGIN
  SET @definicion=REPLACE(@definicion,N'[tipo]',N'[tipo_negociacion]');
  SET @sql=N'ALTER TABLE dbo.negociaciones_horario_vuelo ADD CONSTRAINT '+QUOTENAME(@nombre)+N' CHECK '+@definicion;
  EXEC sp_executesql @sql;
END
