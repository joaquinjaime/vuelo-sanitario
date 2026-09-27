-- La fecha_solicitada y fecha_limite_traslado son hora civil de la zona de negocio.
-- Los registros anteriores conservan extrema_urgencia = 0: no se los reclasifica retrospectivamente.
ALTER TABLE flights ADD
    extrema_urgencia BIT NOT NULL CONSTRAINT df_flights_extrema_urgencia DEFAULT 0,
    justificacion_extrema_urgencia NVARCHAR(MAX) NULL,
    fecha_limite_traslado DATETIME2(3) NULL;
GO

ALTER TABLE flights ADD CONSTRAINT chk_flights_extreme_urgency_data CHECK (
    (extrema_urgencia = 0 AND justificacion_extrema_urgencia IS NULL AND fecha_limite_traslado IS NULL)
    OR
    (extrema_urgencia = 1 AND justificacion_extrema_urgencia IS NOT NULL
        AND LEN(REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(justificacion_extrema_urgencia)), CHAR(9), N''), CHAR(10), N''), CHAR(13), N'')) > 0
        AND fecha_limite_traslado IS NOT NULL
        AND fecha_limite_traslado >= fecha_solicitada)
);
GO

CREATE INDEX idx_flights_pending_urgency ON flights (status_id, extrema_urgencia, fecha_limite_traslado, fecha_solicitada);
GO
