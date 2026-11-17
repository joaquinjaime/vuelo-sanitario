-- V67: removes the sanitary transfer coordination contacts (V51, V54) from the application.
-- The application no longer records coordination contacts on a sanitary request, so the table, its constraints and its
-- indexes are dropped. Historical audit events with entity type TRANSFER_CONTACT are kept untouched.

DROP TABLE IF EXISTS dbo.contactos_coordinacion_traslado;
GO
