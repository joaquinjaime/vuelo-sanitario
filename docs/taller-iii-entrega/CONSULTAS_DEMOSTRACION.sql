/* Consultas de demostración - sólo lectura. No exponer datos clínicos reales. */
/* 1. Versión Flyway */
SELECT TOP (20) version, description, installed_on, success
FROM dbo.flyway_schema_history ORDER BY installed_rank DESC;

/* 2. Vuelo y referencias principales */
SELECT TOP (20) v.id_vuelos, v.codigo, ev.codigo AS estado, tv.codigo AS tipo,
       a.matricula, u.nombre_usuario AS comandante
FROM dbo.vuelos v
LEFT JOIN dbo.estados_vuelo ev ON ev.id_estados_vuelo=v.id_estados_vuelo
LEFT JOIN dbo.tipos_vuelo tv ON tv.id_tipos_vuelo=v.id_tipos_vuelo
LEFT JOIN dbo.aeronaves a ON a.id_aeronaves=v.id_aeronaves
LEFT JOIN dbo.usuarios u ON u.id_usuarios=v.id_comandante
ORDER BY v.id_vuelos DESC;

/* 3. Historial de rutas para reemplazar el parámetro ficticio */
SELECT r.id_vuelos, r.version, r.estado_revision, r.es_version_actual,
       r.fecha_presentacion, r.fecha_revision
FROM dbo.rutas_vuelo r
WHERE r.id_vuelos = :ID_VUELO
ORDER BY r.version DESC;

/* 4. Tripulación y roles */
SELECT vt.id_vuelos, u.nombre_usuario, rt.codigo AS rol_tripulacion, vt.activo
FROM dbo.vuelos_tripulantes vt
JOIN dbo.usuarios u ON u.id_usuarios=vt.id_usuarios
JOIN dbo.roles_tripulacion rt ON rt.id_roles_tripulacion=vt.id_roles_tripulacion
WHERE vt.id_vuelos = :ID_VUELO;

/* 5. Auditoría del vuelo: limitar columnas sensibles y filas */
SELECT TOP (50) fecha_evento, tipo_entidad, accion, id_usuarios
FROM dbo.eventos_auditoria
WHERE id_vuelos = :ID_VUELO
ORDER BY fecha_evento DESC;
