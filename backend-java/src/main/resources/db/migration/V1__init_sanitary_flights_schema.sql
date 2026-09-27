-- =====================================================================
-- Sistema de Gestión de Vuelos Sanitarios
-- Esquema de base de datos (SQL Server / T-SQL)
-- =====================================================================

-- =====================================================================
-- 1. ROLES Y USUARIOS
-- =====================================================================

CREATE TABLE roles (
    id              UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    codigo          NVARCHAR(30) NOT NULL UNIQUE, -- DTS, COMANDANTE, OPERACIONES
    nombre          NVARCHAR(100) NOT NULL,
    descripcion     NVARCHAR(MAX),
    activo          BIT NOT NULL DEFAULT 1,
    created_at      DATETIME2(3) NOT NULL DEFAULT SYSDATETIME()
);
GO

CREATE TABLE users (
    id              UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    username        NVARCHAR(50) NOT NULL UNIQUE,
    email           NVARCHAR(150) NOT NULL UNIQUE,
    password_hash   NVARCHAR(255) NOT NULL,
    nombre          NVARCHAR(100) NOT NULL,
    apellido        NVARCHAR(100) NOT NULL,
    dni             NVARCHAR(20) UNIQUE,
    telefono        NVARCHAR(30),
    licencia_aeronautica NVARCHAR(50), -- aplica a comandantes/copilotos, nullable
    activo          BIT NOT NULL DEFAULT 1,
    created_at      DATETIME2(3) NOT NULL DEFAULT SYSDATETIME(),
    updated_at      DATETIME2(3) NOT NULL DEFAULT SYSDATETIME()
);
GO

-- Relación N:M: un usuario puede tener varios roles
CREATE TABLE user_roles (
    user_id         UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id         UNIQUEIDENTIFIER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    assigned_at     DATETIME2(3) NOT NULL DEFAULT SYSDATETIME(),
    PRIMARY KEY (user_id, role_id)
);
GO

-- =====================================================================
-- 2. CATÁLOGOS (tablas maestras, pensadas para escalar sin tocar código)
-- =====================================================================

CREATE TABLE airports (
    id              UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    codigo_oaci     NVARCHAR(4) UNIQUE,
    codigo_iata     NVARCHAR(3) UNIQUE,
    nombre          NVARCHAR(150) NOT NULL,
    ciudad          NVARCHAR(100),
    provincia       NVARCHAR(100),
    pais            NVARCHAR(100) NOT NULL DEFAULT N'Argentina',
    latitud         DECIMAL(9,6),
    longitud        DECIMAL(9,6),
    activo          BIT NOT NULL DEFAULT 1
);
GO

CREATE TABLE aircraft (
    id              UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    matricula       NVARCHAR(20) NOT NULL UNIQUE,
    modelo          NVARCHAR(100) NOT NULL,
    tipo            NVARCHAR(50) NOT NULL, -- ala fija, helicóptero, etc.
    capacidad_pacientes SMALLINT NOT NULL DEFAULT 1,
    capacidad_tripulacion SMALLINT NOT NULL DEFAULT 2,
    equipamiento_medico NVARCHAR(MAX),
    activo          BIT NOT NULL DEFAULT 1,
    created_at      DATETIME2(3) NOT NULL DEFAULT SYSDATETIME()
);
GO

-- Roles dentro de la tripulación de un vuelo (comandante, copiloto, médico, enfermero...)
CREATE TABLE crew_roles (
    id              UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    codigo          NVARCHAR(30) NOT NULL UNIQUE, -- COMANDANTE, COPILOTO, MEDICO, ENFERMERO
    nombre          NVARCHAR(100) NOT NULL
);
GO

-- Estados posibles de un vuelo (catálogo en vez de valores fijos -> más fácil de escalar)
CREATE TABLE flight_statuses (
    id              UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    codigo          NVARCHAR(30) NOT NULL UNIQUE, -- SOLICITADO, APROBADO, RECHAZADO, PLANIFICADO, EN_CURSO, FINALIZADO, CANCELADO
    nombre          NVARCHAR(100) NOT NULL,
    orden           SMALLINT NOT NULL -- para ordenar el flujo en la UI
);
GO

-- Tipos de documentos que se pueden adjuntar a un vuelo
CREATE TABLE document_types (
    id              UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    codigo          NVARCHAR(30) NOT NULL UNIQUE, -- AUTORIZACION, PARTE_MEDICO, PLAN_DE_VUELO, OTRO
    nombre          NVARCHAR(100) NOT NULL
);
GO

-- =====================================================================
-- 3. PACIENTES
-- =====================================================================

CREATE TABLE patients (
    id                  UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    nombre              NVARCHAR(100) NOT NULL,
    apellido            NVARCHAR(100) NOT NULL,
    dni                 NVARCHAR(20),
    fecha_nacimiento    DATE,
    diagnostico         NVARCHAR(MAX),       -- diagnóstico / condición médica relevante para el vuelo
    condicion_medica    NVARCHAR(100),       -- categoría rápida: crítico, estable, etc.
    requiere_equipamiento_especial BIT NOT NULL DEFAULT 0,
    observaciones       NVARCHAR(MAX),
    created_at          DATETIME2(3) NOT NULL DEFAULT SYSDATETIME(),
    updated_at          DATETIME2(3) NOT NULL DEFAULT SYSDATETIME()
);
GO

-- =====================================================================
-- 4. VUELOS (entidad central)
-- =====================================================================

CREATE TABLE flights (
    id                  UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    codigo              NVARCHAR(30) NOT NULL UNIQUE, -- identificador legible, ej VS-2026-0001

    -- Solicitud (Dirección de Tránsito Sanitario)
    patient_id          UNIQUEIDENTIFIER NOT NULL REFERENCES patients(id),
    solicitado_por_id   UNIQUEIDENTIFIER NOT NULL REFERENCES users(id),
    fecha_solicitada    DATETIME2(3) NOT NULL,
    motivo_solicitud    NVARCHAR(MAX),

    -- Evaluación (Centro de Operaciones)
    status_id           UNIQUEIDENTIFIER NOT NULL REFERENCES flight_statuses(id),
    evaluado_por_id     UNIQUEIDENTIFIER REFERENCES users(id),
    fecha_evaluacion    DATETIME2(3),
    motivo_rechazo      NVARCHAR(MAX),
    aircraft_id         UNIQUEIDENTIFIER REFERENCES aircraft(id),

    -- Planificación (Comandante)
    comandante_id       UNIQUEIDENTIFIER REFERENCES users(id),
    origen_id           UNIQUEIDENTIFIER REFERENCES airports(id),
    destino_id          UNIQUEIDENTIFIER REFERENCES airports(id),
    fecha_planificada_salida DATETIME2(3),
    fecha_planificada_llegada DATETIME2(3),

    -- Ejecución
    fecha_salida_real   DATETIME2(3),
    fecha_llegada_real  DATETIME2(3),

    created_at           DATETIME2(3) NOT NULL DEFAULT SYSDATETIME(),
    updated_at            DATETIME2(3) NOT NULL DEFAULT SYSDATETIME(),

    CONSTRAINT chk_origen_destino_distintos CHECK (
        origen_id IS NULL OR destino_id IS NULL OR origen_id <> destino_id
    )
);
GO

CREATE INDEX idx_flights_status ON flights(status_id);
CREATE INDEX idx_flights_patient ON flights(patient_id);
CREATE INDEX idx_flights_fecha_solicitada ON flights(fecha_solicitada);
CREATE INDEX idx_flights_comandante ON flights(comandante_id);
GO

-- Tripulación asignada a cada vuelo (comandante, copiloto, médico, enfermero...)
CREATE TABLE flight_crew (
    id              UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    flight_id       UNIQUEIDENTIFIER NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
    user_id         UNIQUEIDENTIFIER NOT NULL REFERENCES users(id),
    crew_role_id    UNIQUEIDENTIFIER NOT NULL REFERENCES crew_roles(id),
    asignado_por_id UNIQUEIDENTIFIER REFERENCES users(id),
    created_at      DATETIME2(3) NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT uq_flight_crew UNIQUE (flight_id, user_id, crew_role_id)
);
GO

-- Condiciones climáticas consultadas/guardadas por el Comandante
CREATE TABLE weather_snapshots (
    id                  UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    flight_id           UNIQUEIDENTIFIER NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
    consultado_por_id   UNIQUEIDENTIFIER NOT NULL REFERENCES users(id),
    fecha_consulta      DATETIME2(3) NOT NULL DEFAULT SYSDATETIME(),
    fuente              NVARCHAR(50) NOT NULL DEFAULT N'MANUAL', -- MANUAL, API_EXTERNA
    proveedor_api       NVARCHAR(100),
    datos_clima         NVARCHAR(MAX), -- JSON crudo devuelto por la API o cargado a mano
    apto_para_volar     BIT,
    observaciones       NVARCHAR(MAX),
    CONSTRAINT chk_weather_json CHECK (datos_clima IS NULL OR ISJSON(datos_clima) = 1)
);
GO

CREATE INDEX idx_weather_flight ON weather_snapshots(flight_id);
GO

-- Documentos adjuntos a un vuelo (autorización, parte médico, etc.)
CREATE TABLE flight_documents (
    id                  UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    flight_id           UNIQUEIDENTIFIER NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
    document_type_id    UNIQUEIDENTIFIER NOT NULL REFERENCES document_types(id),
    nombre_archivo      NVARCHAR(255) NOT NULL,
    ruta_archivo        NVARCHAR(500) NOT NULL, -- ruta/URL en el storage (S3, filesystem, etc.)
    mime_type            NVARCHAR(100),
    tamanio_bytes        BIGINT,
    subido_por_id        UNIQUEIDENTIFIER NOT NULL REFERENCES users(id),
    uploaded_at          DATETIME2(3) NOT NULL DEFAULT SYSDATETIME()
);
GO

CREATE INDEX idx_flight_documents_flight ON flight_documents(flight_id);
GO

-- Auditoría completa de cambios sobre un vuelo
CREATE TABLE flight_audit_log (
    id              BIGINT IDENTITY(1,1) PRIMARY KEY,
    flight_id       UNIQUEIDENTIFIER NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
    usuario_id      UNIQUEIDENTIFIER REFERENCES users(id), -- puede ser NULL si lo hizo el sistema
    campo           NVARCHAR(100) NOT NULL,     -- ej: 'status_id', 'aircraft_id', 'comandante_id'
    valor_anterior  NVARCHAR(MAX),
    valor_nuevo     NVARCHAR(MAX),
    fecha_cambio    DATETIME2(3) NOT NULL DEFAULT SYSDATETIME()
);
GO

CREATE INDEX idx_audit_flight ON flight_audit_log(flight_id);
CREATE INDEX idx_audit_fecha ON flight_audit_log(fecha_cambio);
GO

-- Notificaciones (soporte para el canal WebSocket/STOMP ya usado en el backend)
CREATE TABLE notifications (
    id              UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    user_id         UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    flight_id       UNIQUEIDENTIFIER REFERENCES flights(id) ON DELETE CASCADE,
    tipo            NVARCHAR(50) NOT NULL, -- NUEVO_VUELO, VUELO_APROBADO, VUELO_RECHAZADO, COMANDANTE_ASIGNADO, etc.
    mensaje         NVARCHAR(MAX) NOT NULL,
    leido           BIT NOT NULL DEFAULT 0,
    created_at      DATETIME2(3) NOT NULL DEFAULT SYSDATETIME()
);
GO

CREATE INDEX idx_notifications_user ON notifications(user_id, leido);
GO

-- =====================================================================
-- 5. DATOS INICIALES (catálogos base)
-- =====================================================================

INSERT INTO roles (codigo, nombre) VALUES
    (N'DTS', N'Dirección de Tránsito Sanitario'),
    (N'OPERACIONES', N'Centro de Operaciones'),
    (N'COMANDANTE', N'Comandante de Vuelo');
GO

INSERT INTO crew_roles (codigo, nombre) VALUES
    (N'COMANDANTE', N'Comandante'),
    (N'COPILOTO', N'Copiloto'),
    (N'MEDICO', N'Médico'),
    (N'ENFERMERO', N'Enfermero/a');
GO

INSERT INTO flight_statuses (codigo, nombre, orden) VALUES
    (N'SOLICITADO', N'Solicitado', 1),
    (N'APROBADO', N'Aprobado', 2),
    (N'RECHAZADO', N'Rechazado', 2),
    (N'PLANIFICADO', N'Planificado', 3),
    (N'EN_CURSO', N'En curso', 4),
    (N'FINALIZADO', N'Finalizado', 5),
    (N'CANCELADO', N'Cancelado', 6);
GO

INSERT INTO document_types (codigo, nombre) VALUES
    (N'AUTORIZACION', N'Autorización de vuelo'),
    (N'PARTE_MEDICO', N'Parte médico'),
    (N'PLAN_DE_VUELO', N'Plan de vuelo'),
    (N'OTRO', N'Otro documento');
GO
