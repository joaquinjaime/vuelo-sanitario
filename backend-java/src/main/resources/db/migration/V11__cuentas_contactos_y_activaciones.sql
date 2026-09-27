-- Administración de identidades: una persona conserva sus contactos y una cuenta puede estar pendiente de activación.
CREATE TABLE correos_electronicos (
    id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    persona_id UNIQUEIDENTIFIER NOT NULL REFERENCES personas(id),
    direccion NVARCHAR(150) NOT NULL,
    tipo NVARCHAR(30) NOT NULL DEFAULT N'PERSONAL',
    es_principal BIT NOT NULL DEFAULT 0,
    fecha_creacion DATETIME2(3) NOT NULL DEFAULT SYSDATETIME(),
    fecha_actualizacion DATETIME2(3) NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT ck_correos_electronicos_direccion CHECK (LEN(LTRIM(RTRIM(direccion))) > 2)
);
GO
CREATE TABLE telefonos (
    id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    persona_id UNIQUEIDENTIFIER NOT NULL REFERENCES personas(id),
    numero NVARCHAR(30) NOT NULL,
    tipo NVARCHAR(30) NOT NULL DEFAULT N'PERSONAL',
    es_principal BIT NOT NULL DEFAULT 0,
    fecha_creacion DATETIME2(3) NOT NULL DEFAULT SYSDATETIME(),
    fecha_actualizacion DATETIME2(3) NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT ck_telefonos_numero CHECK (LEN(LTRIM(RTRIM(numero))) > 2)
);
GO
CREATE UNIQUE INDEX uq_correos_electronicos_principal_por_persona ON correos_electronicos(persona_id) WHERE es_principal = 1;
CREATE UNIQUE INDEX uq_telefonos_principal_por_persona ON telefonos(persona_id) WHERE es_principal = 1;
CREATE INDEX ix_correos_electronicos_persona ON correos_electronicos(persona_id);
CREATE INDEX ix_telefonos_persona ON telefonos(persona_id);
GO

-- Se conservan los contactos históricos antes de retirar las columnas desnormalizadas.
INSERT INTO correos_electronicos (persona_id, direccion, es_principal)
SELECT u.persona_id, LTRIM(RTRIM(u.correo_electronico)), 1
FROM usuarios u
WHERE NULLIF(LTRIM(RTRIM(u.correo_electronico)), N'') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM correos_electronicos c WHERE c.persona_id = u.persona_id AND c.direccion = LTRIM(RTRIM(u.correo_electronico)));
INSERT INTO telefonos (persona_id, numero, es_principal)
SELECT p.id, LTRIM(RTRIM(p.telefono)), 1
FROM personas p
WHERE NULLIF(LTRIM(RTRIM(p.telefono)), N'') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM telefonos t WHERE t.persona_id = p.id AND t.numero = LTRIM(RTRIM(p.telefono)));
GO

ALTER TABLE usuarios ALTER COLUMN nombre_usuario NVARCHAR(50) NULL;
ALTER TABLE usuarios ALTER COLUMN hash_contrasena NVARCHAR(255) NULL;
ALTER TABLE usuarios ADD estado_cuenta NVARCHAR(24) NOT NULL CONSTRAINT df_usuarios_estado_cuenta DEFAULT N'ACTIVO';
ALTER TABLE usuarios ADD debe_cambiar_contrasena BIT NOT NULL CONSTRAINT df_usuarios_debe_cambiar_contrasena DEFAULT 0;
GO
ALTER TABLE usuarios ADD CONSTRAINT ck_usuarios_estado_cuenta CHECK (estado_cuenta IN (N'PENDIENTE_ACTIVACION', N'ACTIVO', N'DESACTIVADO'));
GO

-- DNI es único sólo cuando fue informado; se permiten personas bootstrap sin DNI.
DECLARE @nombre sysname, @sql nvarchar(max);
DECLARE dni_cursor CURSOR LOCAL FAST_FORWARD FOR
SELECT kc.name FROM sys.key_constraints kc
JOIN sys.index_columns ic ON ic.object_id = kc.parent_object_id AND ic.index_id = kc.unique_index_id
JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
WHERE kc.parent_object_id = OBJECT_ID(N'dbo.personas') AND kc.type = 'UQ' AND c.name = N'dni';
OPEN dni_cursor; FETCH NEXT FROM dni_cursor INTO @nombre;
WHILE @@FETCH_STATUS = 0 BEGIN SET @sql=N'ALTER TABLE personas DROP CONSTRAINT '+QUOTENAME(@nombre); EXEC sp_executesql @sql; FETCH NEXT FROM dni_cursor INTO @nombre; END
CLOSE dni_cursor; DEALLOCATE dni_cursor;
CREATE UNIQUE INDEX uq_personas_dni ON personas(dni) WHERE dni IS NOT NULL;
GO

-- correo_electronico dejó de ser parte de usuarios. Se eliminan sus índices/constraints antes de quitarla.
DECLARE @indice sysname, @tipo nvarchar(10), @sqlCorreo nvarchar(max);
DECLARE correo_cursor CURSOR LOCAL FAST_FORWARD FOR
SELECT i.name, CASE WHEN kc.name IS NULL THEN N'INDEX' ELSE N'CONSTRAINT' END
FROM sys.indexes i
JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id
JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
LEFT JOIN sys.key_constraints kc ON kc.parent_object_id=i.object_id AND kc.unique_index_id=i.index_id
WHERE i.object_id=OBJECT_ID(N'dbo.usuarios') AND c.name=N'correo_electronico' AND i.is_unique=1;
OPEN correo_cursor; FETCH NEXT FROM correo_cursor INTO @indice,@tipo;
WHILE @@FETCH_STATUS = 0 BEGIN
  SET @sqlCorreo=CASE WHEN @tipo=N'CONSTRAINT' THEN N'ALTER TABLE usuarios DROP CONSTRAINT '+QUOTENAME(@indice) ELSE N'DROP INDEX '+QUOTENAME(@indice)+N' ON usuarios' END;
  EXEC sp_executesql @sqlCorreo; FETCH NEXT FROM correo_cursor INTO @indice,@tipo;
END
CLOSE correo_cursor; DEALLOCATE correo_cursor;
ALTER TABLE usuarios DROP COLUMN correo_electronico;
ALTER TABLE personas DROP COLUMN telefono;
GO

CREATE TABLE activaciones_cuenta (
    id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    usuario_id UNIQUEIDENTIFIER NOT NULL REFERENCES usuarios(id),
    token_hash NVARCHAR(255) NOT NULL,
    fecha_creacion DATETIME2(3) NOT NULL DEFAULT SYSDATETIME(),
    fecha_expiracion DATETIME2(3) NOT NULL,
    fecha_utilizacion DATETIME2(3) NULL,
    administrador_creador_id UNIQUEIDENTIFIER NULL REFERENCES usuarios(id),
    CONSTRAINT ck_activaciones_cuenta_fechas CHECK (fecha_expiracion = DATEADD(HOUR, 24, fecha_creacion))
);
GO
CREATE UNIQUE INDEX uq_activaciones_cuenta_usuario_vigente ON activaciones_cuenta(usuario_id) WHERE fecha_utilizacion IS NULL;
CREATE INDEX ix_activaciones_cuenta_usuario ON activaciones_cuenta(usuario_id, fecha_expiracion);
GO

-- ADMINISTRADOR es exclusivo también para escrituras directas en SQL.
CREATE TRIGGER trg_usuarios_roles_administrador_exclusivo ON usuarios_roles AFTER INSERT, UPDATE AS
BEGIN
  SET NOCOUNT ON;
  IF EXISTS (
    SELECT 1 FROM usuarios_roles ur JOIN roles r ON r.id=ur.rol_id
    WHERE ur.usuario_id IN (SELECT usuario_id FROM inserted)
    GROUP BY ur.usuario_id
    HAVING SUM(CASE WHEN r.codigo=N'ADMINISTRADOR' THEN 1 ELSE 0 END) > 0
       AND SUM(CASE WHEN r.codigo IN (N'DTS',N'OPERACIONES',N'CENTRO_OPERACIONES',N'COMANDANTE') THEN 1 ELSE 0 END) > 0
  )
  BEGIN
    ROLLBACK TRANSACTION;
    THROW 51001, 'ADMINISTRADOR es un rol exclusivo.', 1;
  END
END;
GO
