-- Roles, prioridad operativa y datos de solicitud que no pertenecen a la planificación.
INSERT INTO roles (codigo, nombre)
SELECT N'ADMINISTRADOR', N'Administrador del sistema'
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE codigo = N'ADMINISTRADOR');
GO

CREATE TABLE flight_priorities (
    id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    codigo NVARCHAR(30) NOT NULL UNIQUE,
    nombre NVARCHAR(100) NOT NULL,
    activo BIT NOT NULL DEFAULT 1,
    orden SMALLINT NOT NULL
);
GO

-- Etiquetas operativas configurables; no constituyen una clasificación clínica.
INSERT INTO flight_priorities (codigo, nombre, orden) VALUES
    (N'BAJA', N'Prioridad baja', 1),
    (N'MEDIA', N'Prioridad media', 2),
    (N'ALTA', N'Prioridad alta', 3);
GO

ALTER TABLE flights ADD
    priority_id UNIQUEIDENTIFIER NULL REFERENCES flight_priorities(id),
    ciudad_origen_solicitada NVARCHAR(100) NULL,
    ciudad_destino_solicitada NVARCHAR(100) NULL;
GO

CREATE INDEX idx_flights_priority ON flights(priority_id);
GO
