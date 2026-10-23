CREATE TABLE dbo.habilitaciones_profesionales (
 id_habilitaciones_profesionales BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
 id_personas BIGINT NOT NULL REFERENCES dbo.personas(id_personas),
 id_roles_tripulacion BIGINT NOT NULL REFERENCES dbo.roles_tripulacion(id_roles_tripulacion),
 tipo_habilitacion NVARCHAR(100) NOT NULL,
 numero_habilitacion NVARCHAR(100) NOT NULL,
 organismo_emisor NVARCHAR(200) NOT NULL,
 fecha_emision DATE NULL,
 fecha_vencimiento DATE NULL,
 estado_verificacion VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
 fecha_verificacion DATETIME2(3) NULL,
 id_usuario_verificador BIGINT NULL REFERENCES dbo.usuarios(id_usuarios),
 observaciones NVARCHAR(MAX) NULL,
 fecha_creacion DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
 CONSTRAINT ck_habilitacion_estado CHECK (estado_verificacion IN ('PENDIENTE','VERIFICADA','RECHAZADA','REVOCADA')),
 CONSTRAINT ck_habilitacion_fechas CHECK (fecha_emision IS NULL OR fecha_vencimiento IS NULL OR fecha_vencimiento >= fecha_emision)
);
CREATE TABLE dbo.documentos_habilitacion (
 id_documentos_habilitacion BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
 id_habilitaciones_profesionales BIGINT NOT NULL REFERENCES dbo.habilitaciones_profesionales(id_habilitaciones_profesionales),
 clave_archivo NVARCHAR(120) NOT NULL,
 nombre_archivo NVARCHAR(255) NOT NULL,
 id_usuario_cargador BIGINT NOT NULL REFERENCES dbo.usuarios(id_usuarios),
 fecha_carga DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX ix_habilitaciones_persona_funcion ON dbo.habilitaciones_profesionales(id_personas,id_roles_tripulacion,estado_verificacion);
GO
