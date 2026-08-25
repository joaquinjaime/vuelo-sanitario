-- V5: usuario de sistema para atribuir transiciones automáticas
-- (inicio de ejecución al alcanzar el horario programado).
-- activo_sistema = FALSE → isEnabled() devuelve false → nadie puede loguearse como 'system'.

INSERT INTO roles (nombre_rol, descripcion)
VALUES ('SISTEMA', 'Procesos automáticos del sistema');

INSERT INTO persona (nombre, apellido, email)
VALUES ('Sistema', 'Automatización', 'sistema@vuelos.mil.ar');

INSERT INTO usuario (id_persona, id_rol, username, password_hash, nombre_licencia, activo_sistema)
VALUES (
    (SELECT MAX(id_persona) FROM persona),
    (SELECT id_rol FROM roles WHERE nombre_rol = 'SISTEMA'),
    'system',
    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lh/S', -- hash sin contraseña real conocida
    'SYS-000',
    FALSE
);
