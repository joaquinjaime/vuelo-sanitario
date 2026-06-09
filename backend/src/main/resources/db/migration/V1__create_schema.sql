-- V1__create_schema.sql
-- Sistema de Vuelos Sanitarios - Esquema inicial

CREATE TABLE roles (
    id_rol     SERIAL PRIMARY KEY,
    nombre_rol VARCHAR(20)  NOT NULL UNIQUE,
    descripcion TEXT
);

CREATE TABLE persona (
    id_persona SERIAL PRIMARY KEY,
    nombre     VARCHAR(150) NOT NULL,
    apellido   VARCHAR(150) NOT NULL,
    dni        VARCHAR(20),
    email      VARCHAR(150),
    telefono   VARCHAR(30),
    direccion  VARCHAR(250)
);

CREATE TABLE usuario (
    id_usuario      SERIAL PRIMARY KEY,
    id_persona      INTEGER      NOT NULL REFERENCES persona(id_persona),
    id_rol          INTEGER      NOT NULL REFERENCES roles(id_rol),
    username        VARCHAR(50)  NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    nombre_licencia VARCHAR(50),
    fecha_alta      DATE         NOT NULL DEFAULT CURRENT_DATE,
    activo_sistema  BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_usuario_rol ON usuario(id_rol);

CREATE TABLE paciente (
    id_paciente              SERIAL PRIMARY KEY,
    id_persona               INTEGER NOT NULL REFERENCES persona(id_persona),
    diagnostico              TEXT,
    condicion_medica         TEXT,
    requerimientos_especiales TEXT
);

CREATE TABLE acompanante (
    id_acompanante   SERIAL PRIMARY KEY,
    id_usuario       INTEGER      NOT NULL REFERENCES usuario(id_usuario),
    id_paciente      INTEGER      NOT NULL REFERENCES paciente(id_paciente),
    relacion_paciente VARCHAR(100) NOT NULL
);

CREATE TABLE medico (
    id_acompanante_med  SERIAL PRIMARY KEY,
    id_persona          INTEGER      NOT NULL REFERENCES persona(id_persona),
    id_paciente         INTEGER      NOT NULL REFERENCES paciente(id_paciente),
    especialidad_medica VARCHAR(150) NOT NULL
);

CREATE TABLE peticion (
    id_peticion              SERIAL PRIMARY KEY,
    id_usuario               INTEGER      NOT NULL REFERENCES usuario(id_usuario),
    fecha_peticion           DATE         NOT NULL DEFAULT CURRENT_DATE,
    hora_despegue_solicitada TIME         NOT NULL,
    estado                   VARCHAR(30)  NOT NULL DEFAULT 'PENDIENTE',
    prioridad                VARCHAR(20)  NOT NULL DEFAULT 'NORMAL',
    observaciones            TEXT
);

CREATE INDEX idx_peticion_usuario ON peticion(id_usuario);
CREATE INDEX idx_peticion_estado  ON peticion(estado);

CREATE TABLE peticion_persona (
    id_peticion INTEGER NOT NULL REFERENCES peticion(id_peticion) ON DELETE CASCADE,
    id_persona  INTEGER NOT NULL REFERENCES persona(id_persona),
    PRIMARY KEY (id_peticion, id_persona)
);

CREATE TABLE vuelo (
    id_vuelo            SERIAL PRIMARY KEY,
    id_peticion         INTEGER      NOT NULL REFERENCES peticion(id_peticion),
    fecha_vuelo         DATE         NOT NULL,
    hora_despegue       TIME         NOT NULL,
    hora_aterrizaje     TIME,
    hora_cancelacion    TIME,
    estado              VARCHAR(30)  NOT NULL DEFAULT 'PLANEAMIENTO',
    motivo_cancelacion  VARCHAR(255),
    aprobacion_cargada  BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vuelo_peticion ON vuelo(id_peticion);
CREATE INDEX idx_vuelo_estado   ON vuelo(estado);
CREATE INDEX idx_vuelo_fecha    ON vuelo(fecha_vuelo);

CREATE TABLE vuelo_persona (
    id_vuelo   INTEGER NOT NULL REFERENCES vuelo(id_vuelo) ON DELETE CASCADE,
    id_persona INTEGER NOT NULL REFERENCES persona(id_persona),
    PRIMARY KEY (id_vuelo, id_persona)
);

CREATE TABLE historial_vuelo (
    id_historial            SERIAL PRIMARY KEY,
    id_vuelo                INTEGER      NOT NULL REFERENCES vuelo(id_vuelo),
    id_usuario_cambio       INTEGER      NOT NULL REFERENCES usuario(id_usuario),
    accion                  VARCHAR(50)  NOT NULL,
    datos_anteriores        TEXT,
    datos_nuevos            TEXT,
    fecha_hora_modificacion TIMESTAMP    NOT NULL DEFAULT NOW(),
    comentarios             TEXT
);

CREATE INDEX idx_historial_vuelo   ON historial_vuelo(id_vuelo);
CREATE INDEX idx_historial_usuario ON historial_vuelo(id_usuario_cambio);

CREATE TABLE info_vuelo (
    id_formulario SERIAL PRIMARY KEY,
    id_vuelo      INTEGER   NOT NULL REFERENCES vuelo(id_vuelo) ON DELETE CASCADE,
    id_usuario    INTEGER   NOT NULL REFERENCES usuario(id_usuario),
    tipo          VARCHAR(30) NOT NULL,  -- RUTA, HANGAR, AA2000, METEOROLOGIA, PLAN_VUELO
    contenido     TEXT,
    pdf           BYTEA,
    created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_info_vuelo      ON info_vuelo(id_vuelo);
CREATE INDEX idx_info_vuelo_tipo ON info_vuelo(id_vuelo, tipo);

CREATE TABLE informe_final (
    id_informe               SERIAL PRIMARY KEY,
    id_vuelo                 INTEGER   NOT NULL UNIQUE REFERENCES vuelo(id_vuelo),
    id_usuario_creador       INTEGER   NOT NULL REFERENCES usuario(id_usuario),
    fecha_creacion           TIMESTAMP NOT NULL DEFAULT NOW(),
    cambios_ocurridos        TEXT,
    ajustes_realizados       TEXT,
    observaciones_generales  TEXT,
    archivos_adjuntos        VARCHAR(255)
);

CREATE TABLE notificacion (
    id_notificacion  SERIAL PRIMARY KEY,
    id_usuario       INTEGER      NOT NULL REFERENCES usuario(id_usuario),
    id_vuelo         INTEGER      REFERENCES vuelo(id_vuelo),
    tipo             VARCHAR(50)  NOT NULL,
    titulo           VARCHAR(200) NOT NULL,
    mensaje          TEXT         NOT NULL,
    leida            BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notificacion_usuario ON notificacion(id_usuario, leida);
