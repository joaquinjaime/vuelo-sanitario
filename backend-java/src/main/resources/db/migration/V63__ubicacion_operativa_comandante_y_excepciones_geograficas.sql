-- V63: ubicación operativa actual del comandante y excepciones geográficas de asignación.
-- Hasta V62 el perfil del comandante sólo guardaba la provincia (id_provincias): no había localidad, ni quién ni cuándo la había fijado, y la
-- elegibilidad geográfica de un vuelo sanitario se resolvía por provincia (estar en Concepción valía como estar en San Miguel de Tucumán).
-- Esta migración agrega la localidad operativa actual (distinta del domicilio, que no se registra aquí), la fecha y el responsable de la última
-- actualización, y una tabla donde queda el registro persistente de cada asignación excepcional (comandante fuera de la localidad de salida).
-- No se modifica ni se elimina ninguna fila: los comandantes existentes conservan su provincia y quedan con localidad DESCONOCIDA (NULL);
-- no se infiere ninguna ciudad. Un comandante sin localidad registrada no es elegible de forma ordinaria (sólo por excepción justificada).

ALTER TABLE dbo.perfiles_comandante ADD
    id_localidades_actual BIGINT NULL,
    fecha_ubicacion_actual DATETIME2(3) NULL,
    id_usuario_ubicacion BIGINT NULL;
GO

-- Clave alternativa que permite a una FK compuesta garantizar que la localidad pertenece a la provincia del perfil (sin duplicar el dato geográfico:
-- id_provincias sigue siendo la provincia de la localidad, y la base impide que difieran).
ALTER TABLE dbo.localidades ADD CONSTRAINT uq_localidades_id_provincia UNIQUE (id_localidades, id_provincias);
GO

ALTER TABLE dbo.perfiles_comandante ADD CONSTRAINT fk_perfiles_comandante_localidad_provincia
    FOREIGN KEY (id_localidades_actual, id_provincias) REFERENCES dbo.localidades (id_localidades, id_provincias);
ALTER TABLE dbo.perfiles_comandante ADD CONSTRAINT fk_perfiles_comandante_usuario_ubicacion
    FOREIGN KEY (id_usuario_ubicacion) REFERENCES dbo.usuarios (id_usuarios);
-- Una localidad registrada exige provincia (la FK compuesta no se evalúa si alguna columna es NULL), fecha y responsable de la actualización.
ALTER TABLE dbo.perfiles_comandante ADD CONSTRAINT ck_perfiles_comandante_ubicacion CHECK (
    id_localidades_actual IS NULL
    OR (id_provincias IS NOT NULL AND fecha_ubicacion_actual IS NOT NULL AND id_usuario_ubicacion IS NOT NULL));
GO
CREATE INDEX ix_perfiles_comandante_localidad_actual ON dbo.perfiles_comandante (id_localidades_actual) WHERE id_localidades_actual IS NOT NULL;
CREATE INDEX ix_perfiles_comandante_usuario_ubicacion ON dbo.perfiles_comandante (id_usuario_ubicacion) WHERE id_usuario_ubicacion IS NOT NULL;
GO

-- Registro de cada asignación excepcional de comandante: quién la autorizó, por qué y en qué situación geográfica estaba el comandante.
-- Es historial (sólo inserción lógica): al reemplazar al comandante la fila queda con fecha_reemplazo.
CREATE TABLE dbo.excepciones_geograficas_comandante (
    id_excepciones_geograficas BIGINT IDENTITY(1,1) NOT NULL,
    id_vuelos BIGINT NOT NULL,
    id_usuario_comandante BIGINT NOT NULL,
    id_localidad_salida BIGINT NOT NULL,
    id_localidad_comandante BIGINT NULL,
    id_provincia_comandante BIGINT NULL,
    tipo_excepcion NVARCHAR(40) NOT NULL,
    motivo NVARCHAR(500) NOT NULL,
    id_usuario_autoriza BIGINT NOT NULL,
    fecha_autorizacion DATETIME2(3) NOT NULL,
    fecha_reemplazo DATETIME2(3) NULL,
    CONSTRAINT pk_excepciones_geograficas_comandante PRIMARY KEY (id_excepciones_geograficas),
    CONSTRAINT fk_excepcion_geografica_vuelo FOREIGN KEY (id_vuelos) REFERENCES dbo.vuelos (id_vuelos),
    CONSTRAINT fk_excepcion_geografica_comandante FOREIGN KEY (id_usuario_comandante) REFERENCES dbo.usuarios (id_usuarios),
    CONSTRAINT fk_excepcion_geografica_salida FOREIGN KEY (id_localidad_salida) REFERENCES dbo.localidades (id_localidades),
    CONSTRAINT fk_excepcion_geografica_loc_comandante FOREIGN KEY (id_localidad_comandante) REFERENCES dbo.localidades (id_localidades),
    CONSTRAINT fk_excepcion_geografica_prov_comandante FOREIGN KEY (id_provincia_comandante) REFERENCES dbo.provincias (id_provincias),
    CONSTRAINT fk_excepcion_geografica_autoriza FOREIGN KEY (id_usuario_autoriza) REFERENCES dbo.usuarios (id_usuarios),
    CONSTRAINT ck_excepcion_geografica_tipo CHECK (tipo_excepcion IN (N'UBICACION_DESCONOCIDA', N'UBICACION_INCOMPLETA', N'LOCALIDAD_DESHABILITADA', N'OTRA_LOCALIDAD', N'OTRA_PROVINCIA')),
    CONSTRAINT ck_excepcion_geografica_motivo CHECK (LEN(LTRIM(RTRIM(motivo))) >= 15),
    CONSTRAINT ck_excepcion_geografica_reemplazo CHECK (fecha_reemplazo IS NULL OR fecha_reemplazo >= fecha_autorizacion)
);
GO
CREATE INDEX ix_excepcion_geografica_vuelo ON dbo.excepciones_geograficas_comandante (id_vuelos, fecha_autorizacion);
CREATE INDEX ix_excepcion_geografica_comandante ON dbo.excepciones_geograficas_comandante (id_usuario_comandante);
CREATE INDEX ix_excepcion_geografica_autoriza ON dbo.excepciones_geograficas_comandante (id_usuario_autoriza);
CREATE INDEX ix_excepcion_geografica_salida ON dbo.excepciones_geograficas_comandante (id_localidad_salida);
GO
