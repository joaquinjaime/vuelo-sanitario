-- =====================================================================
-- Sistema de Gestión de Vuelos Sanitarios
-- V2 (SQL Server): Fase de planificación + trigger de cancelación
-- =====================================================================

-- =====================================================================
-- 1. CANCELACIÓN DEL VUELO
-- =====================================================================

ALTER TABLE flights ADD
    motivo_cancelacion  NVARCHAR(MAX),
    fecha_cancelacion   DATETIME2(3),
    cancelado_por_id    UNIQUEIDENTIFIER REFERENCES users(id);
GO

-- =====================================================================
-- 2. NUEVOS TIPOS DE DOCUMENTO
-- =====================================================================

INSERT INTO document_types (codigo, nombre) VALUES
    (N'RUTA_VUELO', N'Ruta de vuelo'),
    (N'HANGAR', N'Reporte de hangar'),
    (N'AA2000', N'Coordinación AA2000'),
    (N'INFORME_FINAL', N'Informe final de vuelo');
GO

-- flight_documents pasa a soportar versionado
ALTER TABLE flight_documents ADD
    version            INT NOT NULL DEFAULT 1,
    es_version_actual   BIT NOT NULL DEFAULT 1;
GO

-- Solo puede haber un documento "actual" por vuelo y tipo de documento
CREATE UNIQUE INDEX uq_flight_documents_actual
    ON flight_documents (flight_id, document_type_id)
    WHERE es_version_actual = 1;
GO

-- =====================================================================
-- 3. RUTA DE VUELO (datos estructurados + versionado)
-- =====================================================================

CREATE TABLE flight_routes (
    id                      UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    flight_id               UNIQUEIDENTIFIER NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
    version                 INT NOT NULL DEFAULT 1,
    es_version_actual       BIT NOT NULL DEFAULT 1,
    altitud_pies            DECIMAL(8,2),
    distancia_nm             DECIMAL(8,2),
    tiempo_estimado_minutos INT,
    observaciones           NVARCHAR(MAX),
    creado_por_id           UNIQUEIDENTIFIER NOT NULL REFERENCES users(id),
    created_at              DATETIME2(3) NOT NULL DEFAULT SYSDATETIME()
);
GO

CREATE INDEX idx_flight_routes_flight ON flight_routes(flight_id);
CREATE UNIQUE INDEX uq_flight_routes_actual
    ON flight_routes (flight_id)
    WHERE es_version_actual = 1;
GO

-- =====================================================================
-- 4. INFORMACIÓN DE HANGAR (datos estructurados + versionado)
-- =====================================================================

CREATE TABLE hangar_info (
    id                      UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    flight_id               UNIQUEIDENTIFIER NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
    version                 INT NOT NULL DEFAULT 1,
    es_version_actual       BIT NOT NULL DEFAULT 1,
    combustible_litros      DECIMAL(10,2),
    checklist_preparacion   NVARCHAR(MAX), -- JSON con items del checklist
    preparacion_completa    BIT NOT NULL DEFAULT 0,
    observaciones           NVARCHAR(MAX),
    registrado_por_id       UNIQUEIDENTIFIER NOT NULL REFERENCES users(id),
    created_at              DATETIME2(3) NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT chk_hangar_checklist_json CHECK (checklist_preparacion IS NULL OR ISJSON(checklist_preparacion) = 1)
);
GO

CREATE INDEX idx_hangar_info_flight ON hangar_info(flight_id);
CREATE UNIQUE INDEX uq_hangar_info_actual
    ON hangar_info (flight_id)
    WHERE es_version_actual = 1;
GO

-- =====================================================================
-- 5. COORDINACIÓN CON AA2000 (datos estructurados + versionado)
-- =====================================================================

CREATE TABLE aa2000_coordination (
    id                      UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    flight_id               UNIQUEIDENTIFIER NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
    version                 INT NOT NULL DEFAULT 1,
    es_version_actual       BIT NOT NULL DEFAULT 1,
    fecha_slot              DATETIME2(3),
    contacto_aa2000         NVARCHAR(150),
    estado_autorizacion     NVARCHAR(30) NOT NULL DEFAULT N'PENDIENTE'
        CHECK (estado_autorizacion IN (N'PENDIENTE', N'CONFIRMADO', N'RECHAZADO')),
    observaciones           NVARCHAR(MAX),
    registrado_por_id       UNIQUEIDENTIFIER NOT NULL REFERENCES users(id),
    created_at              DATETIME2(3) NOT NULL DEFAULT SYSDATETIME()
);
GO

CREATE INDEX idx_aa2000_flight ON aa2000_coordination(flight_id);
CREATE UNIQUE INDEX uq_aa2000_actual
    ON aa2000_coordination (flight_id)
    WHERE es_version_actual = 1;
GO

-- =====================================================================
-- 6. INFORME FINAL (datos estructurados + versionado)
-- =====================================================================

CREATE TABLE flight_final_reports (
    id                            UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    flight_id                     UNIQUEIDENTIFIER NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
    version                       INT NOT NULL DEFAULT 1,
    es_version_actual             BIT NOT NULL DEFAULT 1,
    horas_vuelo                   DECIMAL(5,2),
    combustible_consumido_litros  DECIMAL(10,2),
    incidentes                    NVARCHAR(MAX),
    resumen                       NVARCHAR(MAX),
    creado_por_id                 UNIQUEIDENTIFIER NOT NULL REFERENCES users(id),
    created_at                    DATETIME2(3) NOT NULL DEFAULT SYSDATETIME()
);
GO

CREATE INDEX idx_final_reports_flight ON flight_final_reports(flight_id);
CREATE UNIQUE INDEX uq_final_reports_actual
    ON flight_final_reports (flight_id)
    WHERE es_version_actual = 1;
GO
