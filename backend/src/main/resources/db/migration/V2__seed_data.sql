-- V2__seed_data.sql
-- Datos iniciales: roles y usuarios de prueba

INSERT INTO roles (nombre_rol, descripcion) VALUES
    ('DTS',         'Dirección de Tránsito Sanitario'),
    ('COMANDANTE',  'Comandante de aeronave'),
    ('OPERACIONES', 'Centro de Control de Operaciones');

-- Personas base para usuarios de prueba
INSERT INTO persona (nombre, apellido, email) VALUES
    ('Admin',    'DTS',         'dts@vuelos.mil.ar'),
    ('Carlos',   'Mendez',      'comandante@vuelos.mil.ar'),
    ('Lucia',    'Fernandez',   'operaciones@vuelos.mil.ar');

-- Usuarios de prueba (password: Admin1234! → BCrypt)
INSERT INTO usuario (id_persona, id_rol, username, password_hash, nombre_licencia, activo_sistema) VALUES
    (1, 1, 'dts_admin',    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lh/S', 'DTS-001', TRUE),
    (2, 2, 'cmd_mendez',   '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lh/S', 'CMD-047', TRUE),
    (3, 3, 'ops_fernandez','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lh/S', 'OPS-012', TRUE);
