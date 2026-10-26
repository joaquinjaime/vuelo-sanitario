-- V52: baja lógica trazable de los documentos de vuelo.
-- documentos_vuelo.esta_activo existía sin ningún proceso que lo cambiara. Retirar un documento cargado por error exige saber quién,
-- cuándo y por qué; la auditoría conserva el evento, pero el listado histórico necesita el dato en la propia fila (mismo patrón que
-- usuarios y contactos_coordinacion_traslado). Nunca se elimina la fila, sus versiones ni sus archivos.
ALTER TABLE dbo.documentos_vuelo ADD
    fecha_baja DATETIME2(3) NULL,
    id_usuario_baja BIGINT NULL,
    motivo_baja NVARCHAR(500) NULL;
GO

-- Cualquier baja previa (ninguna en las bases conocidas) se conserva y se completa con el autor de su primera versión y una
-- leyenda explícita: no se inventa un motivo ni un responsable que no existan.
UPDATE d SET
    fecha_baja = d.fecha_creacion,
    id_usuario_baja = (SELECT TOP 1 v.id_usuario_creador FROM dbo.versiones_documento_vuelo v
                       WHERE v.id_documentos_vuelo = d.id_documentos_vuelo ORDER BY v.numero_version),
    motivo_baja = N'Baja anterior a la trazabilidad (V52): motivo y responsable no registrados'
FROM dbo.documentos_vuelo d
WHERE d.esta_activo = 0;
GO

IF EXISTS (SELECT 1 FROM dbo.documentos_vuelo WHERE esta_activo = 0 AND id_usuario_baja IS NULL)
    THROW 51052, 'Hay documentos inactivos sin versiones: no se puede atribuir su baja. Revise esos registros antes de ejecutar V52.', 1;
GO

ALTER TABLE dbo.documentos_vuelo ADD
    CONSTRAINT fk_documentos_vuelo_usuario_baja FOREIGN KEY (id_usuario_baja) REFERENCES dbo.usuarios (id_usuarios),
    CONSTRAINT ck_documentos_vuelo_baja CHECK (
        (esta_activo = 1 AND fecha_baja IS NULL AND id_usuario_baja IS NULL AND motivo_baja IS NULL)
     OR (esta_activo = 0 AND fecha_baja IS NOT NULL AND id_usuario_baja IS NOT NULL
         AND motivo_baja IS NOT NULL AND LEN(LTRIM(RTRIM(motivo_baja))) > 0));
GO

CREATE INDEX idx_documentos_vuelo_vuelo_activo ON dbo.documentos_vuelo (id_vuelos, esta_activo);
GO
