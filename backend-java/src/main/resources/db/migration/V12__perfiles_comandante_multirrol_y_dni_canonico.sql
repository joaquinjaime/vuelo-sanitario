-- Perfiles profesionales de comandante, multirrol y valores de identidad canónicos.
IF EXISTS (SELECT 1 FROM personas WHERE dni IS NOT NULL GROUP BY REPLACE(REPLACE(REPLACE(dni,N'.',N''),N' ',N''),N'-',N'') HAVING COUNT(*) > 1)
    THROW 51012, 'Conflicto de DNI al canonicalizar; resolver datos antes de V12.', 1;
IF EXISTS (SELECT 1 FROM usuarios WHERE NULLIF(LTRIM(RTRIM(licencia_aeronautica)),N'') IS NOT NULL GROUP BY UPPER(LTRIM(RTRIM(licencia_aeronautica))) HAVING COUNT(*) > 1)
    THROW 51013, 'Conflicto de licencias al canonicalizar; resolver datos antes de V12.', 1;
GO
DROP TRIGGER trg_usuarios_roles_administrador_exclusivo;
GO
INSERT INTO roles (codigo,nombre)
SELECT N'CENTRO_OPERACIONES',N'Centro de Operaciones'
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE codigo=N'CENTRO_OPERACIONES');
GO
CREATE TABLE perfiles_comandante (
    persona_id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY REFERENCES personas(id),
    numero_licencia NVARCHAR(50) NOT NULL,
    numero_licencia_normalizada AS UPPER(LTRIM(RTRIM(numero_licencia))) PERSISTED,
    fecha_creacion DATETIME2(3) NOT NULL DEFAULT SYSDATETIME(),
    fecha_actualizacion DATETIME2(3) NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT ck_perfiles_comandante_licencia_alphanumerica CHECK (numero_licencia NOT LIKE N'%[^0-9A-Za-z]%')
);
GO
INSERT INTO perfiles_comandante (persona_id,numero_licencia)
SELECT persona_id,UPPER(LTRIM(RTRIM(licencia_aeronautica))) FROM usuarios
WHERE NULLIF(LTRIM(RTRIM(licencia_aeronautica)),N'') IS NOT NULL;
CREATE UNIQUE INDEX uq_perfiles_comandante_numero_licencia ON perfiles_comandante(numero_licencia_normalizada);
GO
UPDATE personas SET dni=REPLACE(REPLACE(REPLACE(dni,N'.',N''),N' ',N''),N'-',N'') WHERE dni IS NOT NULL;
ALTER TABLE usuarios DROP COLUMN licencia_aeronautica;
GO
