-- La cuenta se conserva para mantener vuelos, documentos y auditorías.
-- dni ya es un índice único global en personas (V11); no se incluye activo
-- en esa identidad ni se libera nombre_usuario al desactivar una cuenta.
ALTER TABLE usuarios ADD version_credenciales BIGINT NOT NULL
    CONSTRAINT df_usuarios_version_credenciales DEFAULT 1;
ALTER TABLE usuarios ADD fecha_baja DATETIME2(3) NULL;
GO

ALTER TABLE usuarios ADD CONSTRAINT ck_usuarios_version_credenciales_positiva
    CHECK (version_credenciales >= 1);
GO

-- Las cuentas que ya estaban desactivadas mantienen la fecha desconocida de
-- la migración, pero todas comienzan con una versión de credenciales válida.
UPDATE usuarios SET version_credenciales = 1 WHERE version_credenciales IS NULL;
GO

CREATE INDEX ix_usuarios_activo_estado ON usuarios(activo, estado_cuenta);
GO
