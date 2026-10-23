-- V47: ciclo administrativo de usuarios.
-- 1) La unicidad del DNI de la persona y del nombre de usuario sólo se verificaba en la aplicación (dos altas simultáneas podían duplicarlas):
--    ahora la garantiza SQL Server con índices únicos filtrados (los NULL no compiten: personas sin DNI y cuentas pendientes sin nombre de usuario).
-- 2) La baja de una cuenta registra quién la realizó y por qué en la propia fila (antes sólo constaba en la auditoría).
-- No se modifica ninguna persona, cuenta ni evento existente salvo el rellenado de la baja a partir de los eventos USUARIO_DESACTIVADO.

IF EXISTS (SELECT 1 FROM dbo.personas WHERE dni IS NOT NULL GROUP BY dni HAVING COUNT(*) > 1)
    THROW 51047, N'V47: existen personas con el mismo DNI; resuelva los duplicados manualmente antes de migrar (no se fusionan identidades automáticamente)', 1;
GO
IF EXISTS (SELECT 1 FROM dbo.usuarios WHERE nombre_usuario IS NOT NULL GROUP BY nombre_usuario HAVING COUNT(*) > 1)
    THROW 51048, N'V47: existen cuentas con el mismo nombre de usuario; resuelva los duplicados manualmente antes de migrar', 1;
GO

CREATE UNIQUE INDEX uq_personas_dni ON dbo.personas (dni) WHERE dni IS NOT NULL;
GO
CREATE UNIQUE INDEX uq_usuarios_nombre_usuario ON dbo.usuarios (nombre_usuario) WHERE nombre_usuario IS NOT NULL;
GO

ALTER TABLE dbo.usuarios ADD id_usuario_baja BIGINT NULL, motivo_baja NVARCHAR(500) NULL;
GO
ALTER TABLE dbo.usuarios ADD CONSTRAINT fk_usuarios_usuario_baja FOREIGN KEY (id_usuario_baja) REFERENCES dbo.usuarios (id_usuarios);
GO
CREATE INDEX idx_usuarios_id_usuario_baja ON dbo.usuarios (id_usuario_baja) WHERE id_usuario_baja IS NOT NULL;
GO

-- Las bajas anteriores conservan su responsable y motivo sólo si la auditoría los registró (no se inventa información).
UPDATE u SET u.id_usuario_baja = a.id_usuario_actor, u.motivo_baja = LEFT(JSON_VALUE(a.valores_nuevos, '$.motivo'), 500)
FROM dbo.usuarios u
CROSS APPLY (SELECT TOP 1 x.id_usuario_actor, x.valores_nuevos FROM dbo.eventos_auditoria x
             WHERE x.tipo_entidad = N'USER' AND x.operacion = N'USUARIO_DESACTIVADO' AND x.entidad_id = u.id_usuarios
             ORDER BY x.id_eventos_auditoria DESC) a
WHERE u.esta_activo = 0 AND u.id_usuario_baja IS NULL;
GO
