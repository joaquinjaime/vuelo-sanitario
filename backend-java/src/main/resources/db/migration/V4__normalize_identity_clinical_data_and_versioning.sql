-- V4: normalización de identidad, datos clínicos por traslado y versionado.
-- La migración conserva las migraciones históricas. En bases de desarrollo con
-- datos previos crea personas a partir de usuarios/pacientes y copia el último
-- estado clínico conocido a cada vuelo del paciente.

CREATE TABLE persons (
    id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    nombre NVARCHAR(100) NOT NULL,
    apellido NVARCHAR(100) NOT NULL,
    dni NVARCHAR(20) NULL,
    fecha_nacimiento DATE NULL,
    telefono NVARCHAR(30) NULL,
    created_at DATETIME2(3) NOT NULL DEFAULT SYSDATETIME(),
    updated_at DATETIME2(3) NOT NULL DEFAULT SYSDATETIME()
);
GO

ALTER TABLE users ADD person_id UNIQUEIDENTIFIER NULL;
ALTER TABLE patients ADD person_id UNIQUEIDENTIFIER NULL;
GO

-- Un usuario y un paciente con el mismo DNI pasan a compartir identidad.
UPDATE u SET person_id = NEWID() FROM users u;
INSERT INTO persons (id, nombre, apellido, dni, telefono)
SELECT person_id, nombre, apellido, dni, telefono FROM users;

UPDATE p SET person_id = u.person_id
FROM patients p INNER JOIN users u ON u.dni = p.dni
WHERE p.dni IS NOT NULL;
UPDATE patients SET person_id = NEWID() WHERE person_id IS NULL;
INSERT INTO persons (id, nombre, apellido, dni, fecha_nacimiento)
SELECT p.person_id, p.nombre, p.apellido, p.dni, p.fecha_nacimiento
FROM patients p
WHERE NOT EXISTS (SELECT 1 FROM persons pe WHERE pe.id = p.person_id);
GO

ALTER TABLE users ALTER COLUMN person_id UNIQUEIDENTIFIER NOT NULL;
ALTER TABLE patients ALTER COLUMN person_id UNIQUEIDENTIFIER NOT NULL;
ALTER TABLE users ADD CONSTRAINT uq_users_person UNIQUE (person_id);
ALTER TABLE patients ADD CONSTRAINT uq_patients_person UNIQUE (person_id);
ALTER TABLE users ADD CONSTRAINT fk_users_person FOREIGN KEY (person_id) REFERENCES persons(id);
ALTER TABLE patients ADD CONSTRAINT fk_patients_person FOREIGN KEY (person_id) REFERENCES persons(id);
CREATE UNIQUE INDEX ux_persons_dni ON persons(dni) WHERE dni IS NOT NULL;
GO

CREATE TABLE flight_medical_info (
    id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    flight_id UNIQUEIDENTIFIER NOT NULL UNIQUE REFERENCES flights(id) ON DELETE CASCADE,
    diagnostico NVARCHAR(MAX) NULL,
    condicion_medica NVARCHAR(100) NULL,
    requiere_equipamiento_especial BIT NOT NULL DEFAULT 0,
    observaciones NVARCHAR(MAX) NULL,
    created_at DATETIME2(3) NOT NULL DEFAULT SYSDATETIME(),
    updated_at DATETIME2(3) NOT NULL DEFAULT SYSDATETIME()
);
INSERT INTO flight_medical_info (flight_id, diagnostico, condicion_medica, requiere_equipamiento_especial, observaciones)
SELECT f.id, p.diagnostico, p.condicion_medica, p.requiere_equipamiento_especial, p.observaciones
FROM flights f INNER JOIN patients p ON p.id = f.patient_id;
GO

-- Los atributos personales y clínicos dejan de duplicarse en los subtipos.
-- V1 declaró UNIQUE sin nombre sobre users.dni; SQL Server genera ese nombre.
-- Se elimina dinámicamente sólo la restricción que depende de esa columna.
DECLARE @drop_user_dni_unique NVARCHAR(MAX) = N'';
SELECT @drop_user_dni_unique = @drop_user_dni_unique +
    N'ALTER TABLE users DROP CONSTRAINT [' + kc.name + N'];'
FROM sys.key_constraints kc
INNER JOIN sys.index_columns ic ON ic.object_id = kc.parent_object_id AND ic.index_id = kc.unique_index_id
INNER JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
WHERE kc.parent_object_id = OBJECT_ID(N'users') AND c.name = N'dni';
IF @drop_user_dni_unique <> N'' EXEC sp_executesql @drop_user_dni_unique;

ALTER TABLE users DROP COLUMN nombre, apellido, dni, telefono;

-- SQL Server crea nombres no deterministas para los DEFAULT de V1. Deben
-- eliminarse antes de quitar las columnas clínicas normalizadas.
DECLARE @drop_patient_defaults NVARCHAR(MAX) = N'';
SELECT @drop_patient_defaults = @drop_patient_defaults +
    N'ALTER TABLE patients DROP CONSTRAINT [' + dc.name + N'];'
FROM sys.default_constraints dc
INNER JOIN sys.columns c
    ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
WHERE dc.parent_object_id = OBJECT_ID(N'patients')
  AND c.name IN (N'nombre', N'apellido', N'dni', N'fecha_nacimiento',
                 N'diagnostico', N'condicion_medica',
                 N'requiere_equipamiento_especial', N'observaciones');
IF @drop_patient_defaults <> N'' EXEC sp_executesql @drop_patient_defaults;

ALTER TABLE patients DROP COLUMN nombre, apellido, dni, fecha_nacimiento,
    diagnostico, condicion_medica, requiere_equipamiento_especial, observaciones;
GO

ALTER TABLE aircraft ADD CONSTRAINT chk_aircraft_capacities_positive
    CHECK (capacidad_pacientes > 0 AND capacidad_tripulacion > 0);
ALTER TABLE flights ADD CONSTRAINT chk_flights_planned_time_order
    CHECK (fecha_planificada_salida IS NULL OR fecha_planificada_llegada IS NULL
           OR fecha_planificada_llegada > fecha_planificada_salida);
ALTER TABLE flights ADD CONSTRAINT chk_flights_real_time_order
    CHECK (fecha_salida_real IS NULL OR fecha_llegada_real IS NULL
           OR fecha_llegada_real > fecha_salida_real);
ALTER TABLE flight_crew ADD CONSTRAINT uq_flight_crew_member UNIQUE (flight_id, user_id);
CREATE INDEX idx_flights_aircraft_schedule
    ON flights (aircraft_id, fecha_planificada_salida, fecha_planificada_llegada);
CREATE INDEX idx_flights_commander_schedule
    ON flights (comandante_id, fecha_planificada_salida, fecha_planificada_llegada);
GO

-- Cada tabla operativa representa el historial de un único registro lógico por vuelo.
ALTER TABLE flight_routes ADD CONSTRAINT chk_flight_routes_version_positive CHECK (version > 0);
ALTER TABLE hangar_info ADD CONSTRAINT chk_hangar_info_version_positive CHECK (version > 0);
ALTER TABLE aa2000_coordination ADD CONSTRAINT chk_aa2000_version_positive CHECK (version > 0);
ALTER TABLE flight_final_reports ADD CONSTRAINT chk_final_reports_version_positive CHECK (version > 0);
ALTER TABLE flight_routes ADD CONSTRAINT uq_flight_routes_version UNIQUE (flight_id, version);
ALTER TABLE hangar_info ADD CONSTRAINT uq_hangar_info_version UNIQUE (flight_id, version);
ALTER TABLE aa2000_coordination ADD CONSTRAINT uq_aa2000_version UNIQUE (flight_id, version);
ALTER TABLE flight_final_reports ADD CONSTRAINT uq_final_reports_version UNIQUE (flight_id, version);
GO

-- El modelo anterior limitaba un documento por tipo y vuelo. En desarrollo se
-- eliminan sus archivos de prueba para reemplazarlo por documentos lógicos con
-- versiones independientes. Las rutas no se reutilizan.
DROP INDEX uq_flight_documents_actual ON flight_documents;
DROP TABLE flight_documents;
GO

CREATE TABLE flight_document_items (
    id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    flight_id UNIQUEIDENTIFIER NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
    document_type_id UNIQUEIDENTIFIER NOT NULL REFERENCES document_types(id),
    modalidad NVARCHAR(10) NOT NULL CHECK (modalidad IN (N'PDF', N'TEXT')),
    titulo NVARCHAR(255) NOT NULL,
    activo BIT NOT NULL DEFAULT 1,
    row_version ROWVERSION NOT NULL,
    created_at DATETIME2(3) NOT NULL DEFAULT SYSDATETIME()
);
CREATE INDEX idx_document_items_flight ON flight_document_items(flight_id, activo);

CREATE TABLE flight_documents (
    id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    document_item_id UNIQUEIDENTIFIER NOT NULL REFERENCES flight_document_items(id) ON DELETE CASCADE,
    version INT NOT NULL,
    es_version_actual BIT NOT NULL DEFAULT 1,
    nombre_archivo NVARCHAR(255) NULL,
    storage_key NVARCHAR(255) NULL,
    mime_type NVARCHAR(100) NULL,
    tamanio_bytes BIGINT NULL,
    contenido_texto NVARCHAR(MAX) NULL,
    creado_por_id UNIQUEIDENTIFIER NOT NULL REFERENCES users(id),
    created_at DATETIME2(3) NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT chk_flight_documents_version_positive CHECK (version > 0),
    CONSTRAINT chk_flight_documents_payload CHECK (
        (storage_key IS NOT NULL AND contenido_texto IS NULL AND nombre_archivo IS NOT NULL AND tamanio_bytes IS NOT NULL)
        OR (storage_key IS NULL AND contenido_texto IS NOT NULL AND nombre_archivo IS NULL AND tamanio_bytes IS NULL)
    ),
    CONSTRAINT uq_flight_documents_item_version UNIQUE (document_item_id, version)
);
CREATE UNIQUE INDEX ux_flight_documents_current ON flight_documents(document_item_id)
    WHERE es_version_actual = 1;
GO

INSERT INTO document_types (codigo, nombre)
SELECT N'TEXTO_LIBRE', N'Texto libre'
WHERE NOT EXISTS (SELECT 1 FROM document_types WHERE codigo = N'TEXTO_LIBRE');
GO

CREATE TABLE audit_events (
    id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    flight_id UNIQUEIDENTIFIER NULL REFERENCES flights(id),
    actor_user_id UNIQUEIDENTIFIER NULL REFERENCES users(id),
    entity_type NVARCHAR(80) NOT NULL,
    entity_id UNIQUEIDENTIFIER NULL,
    operation NVARCHAR(40) NOT NULL,
    old_values NVARCHAR(MAX) NULL,
    new_values NVARCHAR(MAX) NULL,
    occurred_at DATETIME2(3) NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT chk_audit_json CHECK ((old_values IS NULL OR ISJSON(old_values) = 1)
        AND (new_values IS NULL OR ISJSON(new_values) = 1))
);
CREATE INDEX idx_audit_events_flight ON audit_events(flight_id, occurred_at DESC);
GO

DROP TRIGGER trg_flights_validate_cancellation;
GO
CREATE TRIGGER trg_flights_validate_lifecycle
ON flights
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1
        FROM inserted i
        INNER JOIN flight_statuses current_status ON current_status.id = i.status_id
        LEFT JOIN deleted d ON d.id = i.id
        LEFT JOIN flight_statuses previous_status ON previous_status.id = d.status_id
        WHERE (current_status.codigo = N'CANCELADO' AND
               (i.fecha_cancelacion IS NULL OR i.cancelado_por_id IS NULL OR NULLIF(LTRIM(RTRIM(i.motivo_cancelacion)), N'') IS NULL))
           OR (current_status.codigo <> N'CANCELADO' AND
               (i.fecha_cancelacion IS NOT NULL OR i.cancelado_por_id IS NOT NULL OR i.motivo_cancelacion IS NOT NULL))
           OR (current_status.codigo = N'CANCELADO' AND previous_status.codigo IN (N'EN_CURSO', N'FINALIZADO'))
    )
    BEGIN
        THROW 51000, 'La cancelación debe ser previa a la ejecución y contener fecha, actor y motivo.', 1;
    END
END;
GO
