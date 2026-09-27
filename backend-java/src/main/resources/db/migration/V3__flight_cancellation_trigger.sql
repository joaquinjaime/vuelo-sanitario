-- =====================================================================
-- 7. TRIGGER DE VALIDACIÓN DE CANCELACIÓN
-- =====================================================================
-- SQL Server no tiene triggers BEFORE, así que se usa un AFTER UPDATE
-- que revierte la transacción si la cancelación no es válida.
-- Regla: no se puede cancelar si el vuelo ya está EN_CURSO o FINALIZADO.

CREATE TRIGGER trg_flights_validate_cancellation
ON flights
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1
        FROM inserted i
        INNER JOIN deleted d ON i.id = d.id
        INNER JOIN flight_statuses fs ON fs.id = d.status_id
        WHERE i.fecha_cancelacion IS NOT NULL
          AND d.fecha_cancelacion IS NULL
          AND fs.codigo IN (N'EN_CURSO', N'FINALIZADO')
    )
    BEGIN
        RAISERROR('No se puede cancelar un vuelo que ya está en curso o finalizado.', 16, 1);
        ROLLBACK TRANSACTION;
        RETURN;
    END
END;
GO
