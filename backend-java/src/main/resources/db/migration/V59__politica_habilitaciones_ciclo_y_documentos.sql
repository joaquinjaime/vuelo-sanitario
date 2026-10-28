-- I-5.6: suficiencia profesional configurable, ciclo de vida completo, consultas externas manuales y documentos con integridad.
-- Ninguna regla de suficiencia se siembra aquí: sin política configurada la elegibilidad responde POLITICA_HABILITACION_NO_CONFIGURADA.

-- 1. Habilitaciones: alcance (categoría de aeronave, jurisdicción), restricciones y cadena de renovación.
ALTER TABLE dbo.habilitaciones_profesionales ADD
 categoria_aeronave NVARCHAR(50) NULL,
 id_provincias_jurisdiccion BIGINT NULL CONSTRAINT fk_habilitacion_jurisdiccion REFERENCES dbo.provincias(id_provincias),
 restricciones NVARCHAR(1000) NULL,
 id_habilitacion_renovada BIGINT NULL CONSTRAINT fk_habilitacion_renovada REFERENCES dbo.habilitaciones_profesionales(id_habilitaciones_profesionales);
GO
ALTER TABLE dbo.habilitaciones_profesionales DROP CONSTRAINT ck_habilitacion_estado;
GO
DECLARE @df sysname = (SELECT dc.name FROM sys.default_constraints dc JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id WHERE dc.parent_object_id = OBJECT_ID('dbo.habilitaciones_profesionales') AND c.name = 'estado_verificacion');
IF @df IS NOT NULL EXEC('ALTER TABLE dbo.habilitaciones_profesionales DROP CONSTRAINT ' + @df);
GO
ALTER TABLE dbo.habilitaciones_profesionales ALTER COLUMN estado_verificacion VARCHAR(25) NOT NULL;
GO
ALTER TABLE dbo.habilitaciones_profesionales ADD CONSTRAINT df_habilitacion_estado DEFAULT 'PENDIENTE' FOR estado_verificacion;
GO
ALTER TABLE dbo.habilitaciones_profesionales ADD CONSTRAINT ck_habilitacion_estado
 CHECK (estado_verificacion IN ('PENDIENTE','VERIFICADA','RECHAZADA','REVOCADA','CORRECCION_SOLICITADA'));
GO
CREATE INDEX ix_habilitaciones_renovada ON dbo.habilitaciones_profesionales(id_habilitacion_renovada) WHERE id_habilitacion_renovada IS NOT NULL;
GO

-- 2. Política de suficiencia: cada fila es una combinación aceptada (función, tipo de operación, categoría, tipo de habilitación).
-- tipo de vuelo / categoría NULL = cualquiera. Sin filas activas para la función no hay suficiencia demostrable.
CREATE TABLE dbo.politicas_habilitacion (
 id_politicas_habilitacion BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
 id_roles_tripulacion BIGINT NOT NULL REFERENCES dbo.roles_tripulacion(id_roles_tripulacion),
 id_tipos_vuelo BIGINT NULL REFERENCES dbo.tipos_vuelo(id_tipos_vuelo),
 categoria_aeronave NVARCHAR(50) NULL,
 tipo_habilitacion NVARCHAR(100) NOT NULL,
 requiere_jurisdiccion BIT NOT NULL CONSTRAINT df_politica_jurisdiccion DEFAULT 0,
 requiere_consulta_externa BIT NOT NULL CONSTRAINT df_politica_consulta DEFAULT 0,
 origen VARCHAR(30) NOT NULL CONSTRAINT df_politica_origen DEFAULT 'CONFIGURACION_INTERNA',
 fuente_referencia NVARCHAR(500) NULL,
 observaciones NVARCHAR(1000) NULL,
 activa BIT NOT NULL CONSTRAINT df_politica_activa DEFAULT 1,
 id_usuario_alta BIGINT NOT NULL REFERENCES dbo.usuarios(id_usuarios),
 fecha_alta DATETIME2(3) NOT NULL CONSTRAINT df_politica_alta DEFAULT SYSUTCDATETIME(),
 id_usuario_baja BIGINT NULL REFERENCES dbo.usuarios(id_usuarios),
 fecha_baja DATETIME2(3) NULL,
 motivo_baja NVARCHAR(500) NULL,
 CONSTRAINT ck_politica_origen CHECK (origen IN ('CONFIGURACION_INTERNA','FUENTE_OFICIAL_CITADA')),
 CONSTRAINT ck_politica_fuente CHECK (origen <> 'FUENTE_OFICIAL_CITADA' OR fuente_referencia IS NOT NULL),
 CONSTRAINT ck_politica_baja CHECK ((activa = 1 AND fecha_baja IS NULL) OR (activa = 0 AND fecha_baja IS NOT NULL AND id_usuario_baja IS NOT NULL AND motivo_baja IS NOT NULL))
);
GO
CREATE UNIQUE INDEX ux_politica_habilitacion_activa ON dbo.politicas_habilitacion(id_roles_tripulacion, id_tipos_vuelo, categoria_aeronave, tipo_habilitacion) WHERE activa = 1;
GO

-- 3. Historial de decisiones: quién, cuándo, por qué y con qué evidencia. Las filas no se modifican ni se borran.
CREATE TABLE dbo.decisiones_habilitacion (
 id_decisiones_habilitacion BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
 id_habilitaciones_profesionales BIGINT NOT NULL REFERENCES dbo.habilitaciones_profesionales(id_habilitaciones_profesionales),
 tipo_decision VARCHAR(30) NOT NULL,
 estado_resultante VARCHAR(25) NOT NULL,
 id_usuarios BIGINT NOT NULL REFERENCES dbo.usuarios(id_usuarios),
 fecha_decision DATETIME2(3) NOT NULL CONSTRAINT df_decision_fecha DEFAULT SYSUTCDATETIME(),
 motivo NVARCHAR(4000) NULL,
 id_documentos_habilitacion BIGINT NULL REFERENCES dbo.documentos_habilitacion(id_documentos_habilitacion),
 CONSTRAINT ck_decision_tipo CHECK (tipo_decision IN ('REGISTRO','MODIFICACION','DOCUMENTO','VERIFICADA','RECHAZADA','CORRECCION_SOLICITADA','REVOCADA','RENOVACION','CONSULTA_EXTERNA','RETIRO_DOCUMENTO','BLOQUEO_CONSERVACION','LIBERACION_BLOQUEO','SOLICITUD_RECTIFICACION','SOLICITUD_SUPRESION','ANALISIS_DOCUMENTO'))
);
GO
CREATE INDEX ix_decisiones_habilitacion ON dbo.decisiones_habilitacion(id_habilitaciones_profesionales, fecha_decision);
GO

-- 4. Consulta externa manual: un administrador contrasta la habilitación con la fuente oficial y deja constancia.
-- No es una validación emitida por el organismo: es lo que el administrador declara haber visto.
CREATE TABLE dbo.consultas_externas_habilitacion (
 id_consultas_externas_habilitacion BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
 id_habilitaciones_profesionales BIGINT NOT NULL REFERENCES dbo.habilitaciones_profesionales(id_habilitaciones_profesionales),
 organismo VARCHAR(20) NOT NULL,
 fecha_consulta DATETIME2(3) NOT NULL,
 id_usuario_responsable BIGINT NOT NULL REFERENCES dbo.usuarios(id_usuarios),
 numero_consultado NVARCHAR(100) NOT NULL,
 datos_contrastados NVARCHAR(1000) NOT NULL,
 resultado VARCHAR(20) NOT NULL,
 observaciones NVARCHAR(2000) NULL,
 id_documentos_habilitacion BIGINT NULL REFERENCES dbo.documentos_habilitacion(id_documentos_habilitacion),
 fecha_registro DATETIME2(3) NOT NULL CONSTRAINT df_consulta_registro DEFAULT SYSUTCDATETIME(),
 CONSTRAINT ck_consulta_organismo CHECK (organismo IN ('ANAC','REFEPS_SISA','OTRO')),
 CONSTRAINT ck_consulta_resultado CHECK (resultado IN ('COINCIDE','NO_COINCIDE','NO_ENCONTRADO','NO_CONCLUYENTE'))
);
GO
CREATE INDEX ix_consultas_habilitacion ON dbo.consultas_externas_habilitacion(id_habilitaciones_profesionales, fecha_consulta);
GO

-- 5. Documentos: propósito, integridad, versión, análisis antimalware, retiro lógico y bloqueo de conservación.
ALTER TABLE dbo.documentos_habilitacion ADD
 proposito VARCHAR(25) NOT NULL CONSTRAINT df_dochab_proposito DEFAULT 'EVIDENCIA',
 hash_sha256 CHAR(64) NULL,
 tamano_bytes BIGINT NULL,
 numero_version INT NOT NULL CONSTRAINT df_dochab_version DEFAULT 1,
 id_documento_reemplazado BIGINT NULL CONSTRAINT fk_dochab_reemplazado REFERENCES dbo.documentos_habilitacion(id_documentos_habilitacion),
 estado_analisis VARCHAR(25) NOT NULL CONSTRAINT df_dochab_analisis DEFAULT 'EN_CUARENTENA',
 fecha_analisis DATETIME2(3) NULL,
 motor_analisis NVARCHAR(100) NULL,
 detalle_analisis NVARCHAR(500) NULL,
 fecha_baja DATETIME2(3) NULL,
 id_usuario_baja BIGINT NULL REFERENCES dbo.usuarios(id_usuarios),
 motivo_baja NVARCHAR(500) NULL,
 bloqueo_conservacion BIT NOT NULL CONSTRAINT df_dochab_bloqueo DEFAULT 0,
 motivo_bloqueo NVARCHAR(500) NULL;
GO
-- Los documentos anteriores a V59 no tienen hash ni análisis: quedan identificados como legado y nunca se tratan como limpios.
UPDATE dbo.documentos_habilitacion SET estado_analisis = 'LEGADO_SIN_ANALISIS', detalle_analisis = N'Cargado antes de V59 sin hash ni análisis antimalware';
GO
ALTER TABLE dbo.documentos_habilitacion ADD
 CONSTRAINT ck_dochab_proposito CHECK (proposito IN ('EVIDENCIA','RENOVACION','CORRECCION','CONSULTA_EXTERNA')),
 CONSTRAINT ck_dochab_analisis CHECK (estado_analisis IN ('EN_CUARENTENA','LIMPIO','RECHAZADO','ERROR_ANALISIS','LEGADO_SIN_ANALISIS')),
 CONSTRAINT ck_dochab_baja CHECK ((fecha_baja IS NULL AND id_usuario_baja IS NULL AND motivo_baja IS NULL) OR (fecha_baja IS NOT NULL AND id_usuario_baja IS NOT NULL AND motivo_baja IS NOT NULL)),
 CONSTRAINT ck_dochab_bloqueo CHECK (bloqueo_conservacion = 0 OR motivo_bloqueo IS NOT NULL);
GO
CREATE INDEX ix_dochab_habilitacion ON dbo.documentos_habilitacion(id_habilitaciones_profesionales, numero_version);
GO
