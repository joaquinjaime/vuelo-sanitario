-- V68: reference catalog for the patient's condition in a sanitary request.
-- The DTS now selects the condition from this catalog instead of typing free text.
-- The legacy free-text column condicion_medica is kept untouched as history: existing rows
-- whose text matches a catalog entry (ignoring case, accents, spaces and underscores) are
-- linked to it; rows that do not match keep their original text and no catalog reference.
SET XACT_ABORT ON;
GO

CREATE TABLE dbo.condiciones_paciente (
    id_condiciones_paciente BIGINT IDENTITY(1,1) NOT NULL,
    codigo_condicion_paciente NVARCHAR(30) NOT NULL,
    nombre_condicion_paciente NVARCHAR(100) NOT NULL,
    esta_activa BIT NOT NULL CONSTRAINT df_condiciones_paciente_activa DEFAULT 1,
    orden SMALLINT NOT NULL,
    CONSTRAINT pk_condiciones_paciente PRIMARY KEY (id_condiciones_paciente),
    CONSTRAINT uq_condiciones_paciente_codigo UNIQUE (codigo_condicion_paciente),
    CONSTRAINT uq_condiciones_paciente_orden UNIQUE (orden)
);
GO

INSERT INTO dbo.condiciones_paciente (codigo_condicion_paciente, nombre_condicion_paciente, orden) VALUES
(N'BUENO', N'Bueno', 1),
(N'REGULAR', N'Regular', 2),
(N'GRAVE_ESTABLE', N'Grave estable', 3),
(N'GRAVE_INESTABLE', N'Grave inestable', 4),
(N'CRITICO', N'Crítico', 5),
(N'EXTREMA_GRAVEDAD', N'Extrema gravedad', 6),
(N'ESTABLE', N'Estable', 7);
GO

ALTER TABLE dbo.informacion_medica_vuelo ADD id_condiciones_paciente BIGINT NULL;
GO

UPDATE i SET id_condiciones_paciente = c.id_condiciones_paciente
FROM dbo.informacion_medica_vuelo i
JOIN dbo.condiciones_paciente c
  ON REPLACE(LTRIM(RTRIM(i.condicion_medica)), N' ', N'_') COLLATE Latin1_General_CI_AI = c.codigo_condicion_paciente COLLATE Latin1_General_CI_AI
  OR REPLACE(LTRIM(RTRIM(i.condicion_medica)), N'_', N' ') COLLATE Latin1_General_CI_AI = c.nombre_condicion_paciente COLLATE Latin1_General_CI_AI
WHERE NULLIF(LTRIM(RTRIM(i.condicion_medica)), N'') IS NOT NULL;
GO

ALTER TABLE dbo.informacion_medica_vuelo ADD CONSTRAINT fk_informacion_medica_vuelo_condicion_paciente
    FOREIGN KEY (id_condiciones_paciente) REFERENCES dbo.condiciones_paciente (id_condiciones_paciente);
CREATE INDEX ix_informacion_medica_vuelo_condicion_paciente ON dbo.informacion_medica_vuelo (id_condiciones_paciente)
    WHERE id_condiciones_paciente IS NOT NULL;
GO
