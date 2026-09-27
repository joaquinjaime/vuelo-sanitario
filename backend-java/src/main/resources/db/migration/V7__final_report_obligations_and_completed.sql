-- FINALIZADO conserva el expediente abierto; COMPLETADO sólo se alcanza al aprobar el informe.
INSERT INTO flight_statuses (codigo, nombre, orden)
SELECT N'COMPLETADO', N'Completado', 6
WHERE NOT EXISTS (SELECT 1 FROM flight_statuses WHERE codigo = N'COMPLETADO');
GO

CREATE TABLE final_report_obligations (
    id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    flight_id UNIQUEIDENTIFIER NOT NULL REFERENCES flights(id),
    commander_id UNIQUEIDENTIFIER NOT NULL REFERENCES users(id),
    obligation_number INT NOT NULL,
    status NVARCHAR(20) NOT NULL CHECK (status IN (N'PENDIENTE', N'PRESENTADO', N'DEVUELTO', N'APROBADO')),
    original_due_at DATETIMEOFFSET(3) NOT NULL,
    due_at DATETIMEOFFSET(3) NOT NULL,
    extension_used BIT NOT NULL DEFAULT 0,
    extended_at DATETIMEOFFSET(3) NULL,
    presented_at DATETIMEOFFSET(3) NULL,
    report_id UNIQUEIDENTIFIER NULL REFERENCES flight_final_reports(id),
    returned_at DATETIMEOFFSET(3) NULL,
    returned_by_id UNIQUEIDENTIFIER NULL REFERENCES users(id),
    return_reason NVARCHAR(MAX) NULL,
    approved_at DATETIMEOFFSET(3) NULL,
    approved_by_id UNIQUEIDENTIFIER NULL REFERENCES users(id),
    is_current BIT NOT NULL DEFAULT 1,
    row_version ROWVERSION NOT NULL,
    created_at DATETIMEOFFSET(3) NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT uq_final_report_obligation_number UNIQUE (flight_id, obligation_number),
    CONSTRAINT chk_final_report_obligation_dates CHECK (due_at >= original_due_at OR extension_used = 1),
    CONSTRAINT chk_final_report_obligation_review CHECK (
        (status = N'APROBADO' AND report_id IS NOT NULL AND approved_at IS NOT NULL AND approved_by_id IS NOT NULL)
        OR (status = N'DEVUELTO' AND return_reason IS NOT NULL AND LEN(LTRIM(RTRIM(return_reason))) > 0 AND returned_at IS NOT NULL AND returned_by_id IS NOT NULL)
        OR status IN (N'PENDIENTE', N'PRESENTADO')
    )
);
GO
CREATE UNIQUE INDEX ux_final_report_obligation_current ON final_report_obligations(flight_id) WHERE is_current = 1;
CREATE INDEX ix_final_report_obligation_commander_due ON final_report_obligations(commander_id, status, due_at) WHERE is_current = 1;
GO

-- Vuelos finalizados previos no generan obligaciones ni bloqueos retroactivos.
-- El trigger histórico también debe impedir cancelación tras el nuevo cierre administrativo.
DROP TRIGGER trg_flights_validate_lifecycle;
GO
CREATE TRIGGER trg_flights_validate_lifecycle
ON flights
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1 FROM inserted i
        INNER JOIN flight_statuses current_status ON current_status.id = i.status_id
        LEFT JOIN deleted d ON d.id = i.id
        LEFT JOIN flight_statuses previous_status ON previous_status.id = d.status_id
        WHERE (current_status.codigo = N'CANCELADO' AND
               (i.fecha_cancelacion IS NULL OR i.cancelado_por_id IS NULL OR NULLIF(LTRIM(RTRIM(i.motivo_cancelacion)), N'') IS NULL))
           OR (current_status.codigo <> N'CANCELADO' AND
               (i.fecha_cancelacion IS NOT NULL OR i.cancelado_por_id IS NOT NULL OR i.motivo_cancelacion IS NOT NULL))
           OR (current_status.codigo = N'CANCELADO' AND previous_status.codigo IN (N'EN_CURSO', N'FINALIZADO', N'COMPLETADO'))
    )
    BEGIN
        THROW 51000, 'La cancelación debe ser previa a la ejecución y contener fecha, actor y motivo.', 1;
    END
END;
GO
