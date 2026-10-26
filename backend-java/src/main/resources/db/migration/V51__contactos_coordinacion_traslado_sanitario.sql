-- V51: contactos de coordinación de un traslado sanitario.
-- Un teléfono informado en una solicitud sanitaria no es el contacto personal del paciente ni de una cuenta (personas / telefonos):
-- es el medio con el que Operaciones coordina ESE traslado y puede pertenecer a un familiar, un responsable o un establecimiento
-- que no es una persona del sistema. Por eso pertenece a la solicitud (vuelos_sanitarios), tiene su relación con el paciente,
-- baja lógica y versión, y no modifica ni reutiliza los contactos compartidos de ninguna persona.

CREATE TABLE dbo.contactos_coordinacion_traslado (
    id_contactos_coordinacion_traslado BIGINT IDENTITY(1,1) NOT NULL,
    id_vuelos BIGINT NOT NULL,
    relacion_contacto NVARCHAR(30) NOT NULL,
    nombre_contacto NVARCHAR(150) NULL,
    telefono_contacto NVARCHAR(30) NOT NULL,
    telefono_normalizado NVARCHAR(30) NOT NULL,
    observaciones_contacto NVARCHAR(200) NULL,
    es_principal BIT NOT NULL,
    version_contacto BIGINT NOT NULL CONSTRAINT df_contactos_coordinacion_traslado_version DEFAULT 0,
    id_usuario_alta BIGINT NOT NULL,
    fecha_alta DATETIME2 NOT NULL,
    fecha_actualizacion DATETIME2 NOT NULL,
    fecha_baja DATETIME2 NULL,
    id_usuario_baja BIGINT NULL,
    motivo_baja NVARCHAR(30) NULL,
    CONSTRAINT pk_contactos_coordinacion_traslado PRIMARY KEY (id_contactos_coordinacion_traslado),
    CONSTRAINT fk_contactos_coordinacion_traslado_vuelo FOREIGN KEY (id_vuelos) REFERENCES dbo.vuelos_sanitarios (id_vuelos),
    CONSTRAINT fk_contactos_coordinacion_traslado_alta FOREIGN KEY (id_usuario_alta) REFERENCES dbo.usuarios (id_usuarios),
    CONSTRAINT fk_contactos_coordinacion_traslado_baja FOREIGN KEY (id_usuario_baja) REFERENCES dbo.usuarios (id_usuarios),
    CONSTRAINT ck_contactos_coordinacion_traslado_relacion CHECK (relacion_contacto IN
        (N'PACIENTE', N'FAMILIAR_RESPONSABLE', N'ESTABLECIMIENTO_ORIGEN', N'ESTABLECIMIENTO_DESTINO', N'OTRO')),
    -- Sólo el propio paciente puede omitir el nombre (se sabe quién es); cualquier otro contacto debe identificarse.
    CONSTRAINT ck_contactos_coordinacion_traslado_nombre CHECK (relacion_contacto = N'PACIENTE' OR LEN(LTRIM(RTRIM(ISNULL(nombre_contacto, N'')))) > 0),
    CONSTRAINT ck_contactos_coordinacion_traslado_telefono CHECK (LEN(telefono_normalizado) BETWEEN 6 AND 16),
    CONSTRAINT ck_contactos_coordinacion_traslado_baja CHECK (
        (fecha_baja IS NULL AND id_usuario_baja IS NULL AND motivo_baja IS NULL)
     OR (fecha_baja IS NOT NULL AND id_usuario_baja IS NOT NULL AND es_principal = 0 AND motivo_baja = N'RETIRO'))
);
GO

-- Un mismo teléfono vigente una sola vez por solicitud, y a lo sumo un principal vigente por solicitud.
CREATE UNIQUE INDEX uq_contactos_coordinacion_traslado_telefono_vigente
    ON dbo.contactos_coordinacion_traslado (id_vuelos, telefono_normalizado) WHERE fecha_baja IS NULL;
CREATE UNIQUE INDEX uq_contactos_coordinacion_traslado_principal_vigente
    ON dbo.contactos_coordinacion_traslado (id_vuelos) WHERE es_principal = 1 AND fecha_baja IS NULL;
CREATE INDEX idx_contactos_coordinacion_traslado_id_usuario_alta ON dbo.contactos_coordinacion_traslado (id_usuario_alta);
CREATE INDEX idx_contactos_coordinacion_traslado_id_usuario_baja ON dbo.contactos_coordinacion_traslado (id_usuario_baja) WHERE id_usuario_baja IS NOT NULL;
GO
