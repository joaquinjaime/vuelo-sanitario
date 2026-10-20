-- V22: el documento es una identidad lógica y cada versión es un PDF físico.
-- Se preservan los registros de texto del modelo abandonado en un archivo de
-- legado, porque no existe una conversión PDF fiel y automática de su contenido.
SET XACT_ABORT ON;
GO

CREATE TABLE documentos_vuelo_texto_legacy (
    id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    documento_vuelo_id UNIQUEIDENTIFIER NOT NULL,
    vuelo_id UNIQUEIDENTIFIER NOT NULL,
    tipo_documento_id UNIQUEIDENTIFIER NOT NULL,
    nombre_documento NVARCHAR(255) NOT NULL,
    numero_version INT NOT NULL,
    contenido_texto NVARCHAR(MAX) NOT NULL,
    creado_por_usuario_id UNIQUEIDENTIFIER NOT NULL,
    fecha_creacion DATETIME2(3) NOT NULL,
    fecha_archivado DATETIME2(3) NOT NULL DEFAULT SYSDATETIME()
);
GO

-- Las versiones TEXT no cumplen el nuevo contrato PDF. Se archivan antes de
-- retirar la columna para no eliminar contenido real de manera silenciosa.
INSERT INTO documentos_vuelo_texto_legacy (
    documento_vuelo_id, vuelo_id, tipo_documento_id, nombre_documento,
    numero_version, contenido_texto, creado_por_usuario_id, fecha_creacion
)
SELECT v.documento_vuelo_id, d.vuelo_id, d.tipo_documento_id, d.titulo,
       v.version, v.contenido_texto, v.creado_por_usuario_id, v.fecha_creacion
FROM versiones_documento_vuelo v
INNER JOIN documentos_vuelo d ON d.id = v.documento_vuelo_id
WHERE v.contenido_texto IS NOT NULL OR v.clave_almacenamiento IS NULL;

DELETE FROM versiones_documento_vuelo
WHERE contenido_texto IS NOT NULL OR clave_almacenamiento IS NULL;

-- Un documento lógico sin una versión PDF queda completamente preservado en
-- la tabla de legado y se retira del modelo operativo para no crear documentos
-- activos sin archivo físico.
DELETE d
FROM documentos_vuelo d
WHERE NOT EXISTS (
    SELECT 1 FROM versiones_documento_vuelo v WHERE v.documento_vuelo_id = d.id
);
GO

-- El CHECK anterior describía la bifurcación PDF/TEXT y deja de ser válido.
DECLARE @sql nvarchar(max) = N'';
SELECT @sql = @sql + N'ALTER TABLE dbo.versiones_documento_vuelo DROP CONSTRAINT ' + QUOTENAME(name) + N';'
FROM sys.check_constraints
WHERE parent_object_id = OBJECT_ID(N'dbo.versiones_documento_vuelo')
  AND (definition LIKE N'%contenido_texto%' OR definition LIKE N'%clave_almacenamiento%' OR definition LIKE N'%modalidad%' OR definition LIKE N'%[version]%');
IF @sql <> N'' EXEC sp_executesql @sql;
GO

-- La restricción única histórica incluye la columna version. SQL Server no
-- permite renombrarla mientras la restricción exista; se reconstruye con el
-- nuevo nombre inmediatamente después del rename.
DECLARE @unique_version nvarchar(max) = N'';
SELECT @unique_version = @unique_version + N'ALTER TABLE dbo.versiones_documento_vuelo DROP CONSTRAINT ' + QUOTENAME(kc.name) + N';'
FROM sys.key_constraints kc
JOIN sys.index_columns ic ON ic.object_id = kc.parent_object_id AND ic.index_id = kc.unique_index_id
JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
WHERE kc.parent_object_id = OBJECT_ID(N'dbo.versiones_documento_vuelo')
  AND kc.type = N'UQ' AND c.name = N'version';
IF @unique_version <> N'' EXEC sp_executesql @unique_version;
GO

EXEC sp_rename N'dbo.documentos_vuelo.titulo', N'nombre_documento', N'COLUMN';
EXEC sp_rename N'dbo.versiones_documento_vuelo.version', N'numero_version', N'COLUMN';
EXEC sp_rename N'dbo.versiones_documento_vuelo.nombre_archivo', N'nombre_archivo_original', N'COLUMN';
-- DocumentStorage usa una clave relativa generada dentro de documents-directory;
-- no es una URL ni un path absoluto, por eso se nombra como ubicación.
EXEC sp_rename N'dbo.versiones_documento_vuelo.clave_almacenamiento', N'ubicacion_almacenamiento', N'COLUMN';
GO

DECLARE @document_checks nvarchar(max) = N'';
SELECT @document_checks = @document_checks + N'ALTER TABLE dbo.documentos_vuelo DROP CONSTRAINT ' + QUOTENAME(name) + N';'
FROM sys.check_constraints
WHERE parent_object_id = OBJECT_ID(N'dbo.documentos_vuelo')
  AND definition LIKE N'%modalidad%';
IF @document_checks <> N'' EXEC sp_executesql @document_checks;
GO

ALTER TABLE documentos_vuelo DROP COLUMN modalidad;
ALTER TABLE versiones_documento_vuelo DROP COLUMN tipo_mime;
ALTER TABLE versiones_documento_vuelo DROP COLUMN contenido_texto;

ALTER TABLE versiones_documento_vuelo ALTER COLUMN nombre_archivo_original NVARCHAR(255) NOT NULL;
ALTER TABLE versiones_documento_vuelo ALTER COLUMN ubicacion_almacenamiento NVARCHAR(255) NOT NULL;
ALTER TABLE versiones_documento_vuelo ALTER COLUMN tamanio_bytes BIGINT NOT NULL;
ALTER TABLE versiones_documento_vuelo ADD CONSTRAINT uq_versiones_documento_vuelo_numero UNIQUE(documento_vuelo_id, numero_version);
ALTER TABLE versiones_documento_vuelo ADD CONSTRAINT ck_versiones_documento_vuelo_numero CHECK (numero_version > 0);
GO

-- Normaliza cualquier inconsistencia histórica antes de imponer una única
-- versión actual. Si había varias, conserva la actual de mayor número; si no
-- había ninguna, promueve la versión de mayor número.
;WITH version_rankeada AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY documento_vuelo_id
               ORDER BY CASE WHEN es_version_actual = 1 THEN 0 ELSE 1 END,
                        numero_version DESC, id DESC
           ) AS posicion
    FROM versiones_documento_vuelo
)
UPDATE v
SET es_version_actual = CASE WHEN r.posicion = 1 THEN 1 ELSE 0 END
FROM versiones_documento_vuelo v
INNER JOIN version_rankeada r ON r.id = v.id;
GO

-- V4 ya creó este índice filtrado, pero su nombre fue normalizado en V8.
-- Se localiza por catálogo para evitar depender del nombre histórico.
DECLARE @drop_indices nvarchar(max) = N'';
SELECT @drop_indices = @drop_indices + N'DROP INDEX ' + QUOTENAME(i.name) + N' ON dbo.versiones_documento_vuelo;'
FROM sys.indexes i
INNER JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
INNER JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
WHERE i.object_id = OBJECT_ID(N'dbo.versiones_documento_vuelo')
  AND i.is_unique = 1 AND i.has_filter = 1 AND i.is_unique_constraint = 0
  AND c.name = N'es_version_actual';
IF @drop_indices <> N'' EXEC sp_executesql @drop_indices;
GO

CREATE UNIQUE INDEX uq_versiones_documento_vuelo_actual
    ON versiones_documento_vuelo(documento_vuelo_id)
    WHERE es_version_actual = 1;
GO
