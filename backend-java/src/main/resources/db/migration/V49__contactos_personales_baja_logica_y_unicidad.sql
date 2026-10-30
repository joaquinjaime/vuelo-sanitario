-- V49: mantenimiento de contactos personales (correos_electronicos y telefonos).
-- 1) Un contacto retirado por su titular se conserva con fecha, responsable y motivo (baja lógica) en lugar de borrarse.
-- 2) La unicidad "un mismo valor vigente por persona" la garantiza SQL Server (antes sólo existía la unicidad del contacto principal).
--    Se compara el valor normalizado (correo en minúsculas; teléfono sin espacios, guiones, puntos ni paréntesis); el valor
--    ingresado por la persona se conserva tal cual en direccion / numero.
-- 3) version_contacto permite detectar ediciones simultáneas del mismo contacto.
-- No se borra ningún contacto. Si una persona tuviera dos contactos vigentes con el mismo valor normalizado, el duplicado se
-- da de baja como DUPLICADO_MIGRACION (queda el principal o, si no hay, el más antiguo); no se fusionan personas ni se tocan
-- cuentas, roles ni credenciales. La unicidad entre personas distintas no se impone: varias personas pueden compartir un
-- teléfono (p. ej. familiares) y una restricción global revelaría si un valor ya pertenece a otra persona.

ALTER TABLE dbo.correos_electronicos ADD
    direccion_normalizada NVARCHAR(150) NULL,
    version_contacto BIGINT NOT NULL CONSTRAINT df_correos_electronicos_version_contacto DEFAULT 0,
    fecha_baja DATETIME2 NULL,
    id_usuario_baja BIGINT NULL,
    motivo_baja NVARCHAR(30) NULL;
ALTER TABLE dbo.telefonos ADD
    numero_normalizado NVARCHAR(30) NULL,
    version_contacto BIGINT NOT NULL CONSTRAINT df_telefonos_version_contacto DEFAULT 0,
    fecha_baja DATETIME2 NULL,
    id_usuario_baja BIGINT NULL,
    motivo_baja NVARCHAR(30) NULL;
GO

UPDATE dbo.correos_electronicos SET direccion_normalizada = LOWER(LTRIM(RTRIM(direccion)));
UPDATE dbo.telefonos SET numero_normalizado =
    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(numero)), N' ', N''), N'-', N''), N'(', N''), N')', N''), N'.', N'');
GO

-- Duplicados vigentes de una misma persona: se conserva una fila y las demás quedan dadas de baja (sin borrar).
WITH ordenados AS (
    SELECT id_correos_electronicos,
           ROW_NUMBER() OVER (PARTITION BY id_personas, direccion_normalizada
                              ORDER BY es_principal DESC, id_correos_electronicos) AS orden
    FROM dbo.correos_electronicos)
UPDATE c SET c.fecha_baja = SYSUTCDATETIME(), c.motivo_baja = N'DUPLICADO_MIGRACION', c.es_principal = 0
FROM dbo.correos_electronicos c JOIN ordenados o ON o.id_correos_electronicos = c.id_correos_electronicos
WHERE o.orden > 1;
WITH ordenados AS (
    SELECT id_telefonos,
           ROW_NUMBER() OVER (PARTITION BY id_personas, numero_normalizado
                              ORDER BY es_principal DESC, id_telefonos) AS orden
    FROM dbo.telefonos)
UPDATE t SET t.fecha_baja = SYSUTCDATETIME(), t.motivo_baja = N'DUPLICADO_MIGRACION', t.es_principal = 0
FROM dbo.telefonos t JOIN ordenados o ON o.id_telefonos = t.id_telefonos
WHERE o.orden > 1;
GO

ALTER TABLE dbo.correos_electronicos ALTER COLUMN direccion_normalizada NVARCHAR(150) NOT NULL;
ALTER TABLE dbo.telefonos ALTER COLUMN numero_normalizado NVARCHAR(30) NOT NULL;
GO

ALTER TABLE dbo.correos_electronicos ADD CONSTRAINT fk_correos_electronicos_usuario_baja
    FOREIGN KEY (id_usuario_baja) REFERENCES dbo.usuarios (id_usuarios);
ALTER TABLE dbo.telefonos ADD CONSTRAINT fk_telefonos_usuario_baja
    FOREIGN KEY (id_usuario_baja) REFERENCES dbo.usuarios (id_usuarios);
GO

-- Un contacto vigente no tiene datos de baja; uno dado de baja tiene fecha y motivo, no es principal y, salvo la baja de
-- la migración, identifica a quien lo retiró.
ALTER TABLE dbo.correos_electronicos ADD CONSTRAINT ck_correos_electronicos_baja CHECK (
    (fecha_baja IS NULL AND id_usuario_baja IS NULL AND motivo_baja IS NULL)
 OR (fecha_baja IS NOT NULL AND es_principal = 0
     AND ((motivo_baja = N'RETIRO' AND id_usuario_baja IS NOT NULL) OR (motivo_baja = N'DUPLICADO_MIGRACION' AND id_usuario_baja IS NULL))));
ALTER TABLE dbo.telefonos ADD CONSTRAINT ck_telefonos_baja CHECK (
    (fecha_baja IS NULL AND id_usuario_baja IS NULL AND motivo_baja IS NULL)
 OR (fecha_baja IS NOT NULL AND es_principal = 0
     AND ((motivo_baja = N'RETIRO' AND id_usuario_baja IS NOT NULL) OR (motivo_baja = N'DUPLICADO_MIGRACION' AND id_usuario_baja IS NULL))));
GO

CREATE UNIQUE INDEX uq_correos_electronicos_vigente_por_persona
    ON dbo.correos_electronicos (id_personas, direccion_normalizada) WHERE fecha_baja IS NULL;
CREATE UNIQUE INDEX uq_telefonos_vigente_por_persona
    ON dbo.telefonos (id_personas, numero_normalizado) WHERE fecha_baja IS NULL;
CREATE INDEX idx_correos_electronicos_id_usuario_baja ON dbo.correos_electronicos (id_usuario_baja) WHERE id_usuario_baja IS NOT NULL;
CREATE INDEX idx_telefonos_id_usuario_baja ON dbo.telefonos (id_usuario_baja) WHERE id_usuario_baja IS NOT NULL;
GO
