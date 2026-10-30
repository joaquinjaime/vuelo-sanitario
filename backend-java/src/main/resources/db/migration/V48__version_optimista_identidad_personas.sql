-- Una identidad puede ser corregida desde la administración de usuarios o desde pacientes.
-- Una versión compartida evita pérdidas silenciosas entre ambos procesos sin bloquearla de forma permanente.
ALTER TABLE dbo.personas ADD version_identidad BIGINT NOT NULL
    CONSTRAINT df_personas_version_identidad DEFAULT 0;
GO
