-- V50: corrección preventiva posterior a V49 (V49 ya está aplicada y no se modifica).
-- Revisión de V49 (ver docs/INTEGRACION_CONTACTOS_SOLICITUD_2026-10-24.md):
--  1) La baja de duplicados (DUPLICADO_MIGRACION) sólo quedaba en la propia fila; no dejaba un evento en eventos_auditoria,
--     a diferencia de toda baja posterior. Se registra ahora un evento por cada baja de migración que no lo tenga.
--  2) V49 no corrige personas con contactos vigentes pero sin ninguno principal (V11 lo permitía). La aplicación asumía que,
--     con contactos vigentes, siempre existe un principal. Se promueve el contacto vigente más antiguo, y sólo en esas personas.
-- Idempotente. No borra ni modifica valores, tipos, cuentas, roles ni credenciales.

-- 1) Trazabilidad de las bajas de V49 (actor nulo: no las hizo un usuario).
INSERT INTO dbo.eventos_auditoria (tipo_entidad, operacion, valores_anteriores, valores_nuevos, fecha_ocurrencia, id_vuelos, id_usuario_actor, entidad_id)
SELECT N'PERSON_EMAIL', N'REMOVE', NULL, N'{"motivo":"DUPLICADO_MIGRACION"}', SYSUTCDATETIME(), NULL, NULL, c.id_correos_electronicos
FROM dbo.correos_electronicos c
WHERE c.motivo_baja = N'DUPLICADO_MIGRACION'
  AND NOT EXISTS (SELECT 1 FROM dbo.eventos_auditoria e WHERE e.tipo_entidad = N'PERSON_EMAIL' AND e.operacion = N'REMOVE' AND e.entidad_id = c.id_correos_electronicos);
INSERT INTO dbo.eventos_auditoria (tipo_entidad, operacion, valores_anteriores, valores_nuevos, fecha_ocurrencia, id_vuelos, id_usuario_actor, entidad_id)
SELECT N'PERSON_PHONE', N'REMOVE', NULL, N'{"motivo":"DUPLICADO_MIGRACION"}', SYSUTCDATETIME(), NULL, NULL, t.id_telefonos
FROM dbo.telefonos t
WHERE t.motivo_baja = N'DUPLICADO_MIGRACION'
  AND NOT EXISTS (SELECT 1 FROM dbo.eventos_auditoria e WHERE e.tipo_entidad = N'PERSON_PHONE' AND e.operacion = N'REMOVE' AND e.entidad_id = t.id_telefonos);
GO

-- 2) Una persona con contactos vigentes debe tener exactamente un principal.
WITH sin_principal AS (
    SELECT id_correos_electronicos,
           ROW_NUMBER() OVER (PARTITION BY id_personas ORDER BY id_correos_electronicos) AS orden
    FROM dbo.correos_electronicos c
    WHERE c.fecha_baja IS NULL
      AND NOT EXISTS (SELECT 1 FROM dbo.correos_electronicos p WHERE p.id_personas = c.id_personas AND p.fecha_baja IS NULL AND p.es_principal = 1))
UPDATE c SET c.es_principal = 1
FROM dbo.correos_electronicos c JOIN sin_principal s ON s.id_correos_electronicos = c.id_correos_electronicos
WHERE s.orden = 1;
WITH sin_principal AS (
    SELECT id_telefonos,
           ROW_NUMBER() OVER (PARTITION BY id_personas ORDER BY id_telefonos) AS orden
    FROM dbo.telefonos t
    WHERE t.fecha_baja IS NULL
      AND NOT EXISTS (SELECT 1 FROM dbo.telefonos p WHERE p.id_personas = t.id_personas AND p.fecha_baja IS NULL AND p.es_principal = 1))
UPDATE t SET t.es_principal = 1
FROM dbo.telefonos t JOIN sin_principal s ON s.id_telefonos = t.id_telefonos
WHERE s.orden = 1;
GO
