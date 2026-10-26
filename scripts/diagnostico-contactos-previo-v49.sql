-- Diagnóstico de SÓLO LECTURA previo a V49/V50 (contactos personales). No modifica ninguna tabla de la base consultada:
-- únicamente SELECT sobre las tablas de la aplicación y tablas temporales de la sesión.
-- Qué haría V49 con los datos actuales: agrupa por persona y valor normalizado (correo en minúsculas; teléfono sin espacios,
-- guiones, puntos ni paréntesis), conserva una fila por grupo (la principal o, si no hay, la más antigua) y da de baja las demás
-- como DUPLICADO_MIGRACION. V50 registra esas bajas en la auditoría y promueve un principal donde no hay ninguno.
-- Uso: node scripts/diagnostico-contactos-previo-v49.cjs [contenedor] [base]
SET NOCOUNT ON;
IF COL_LENGTH('dbo.correos_electronicos', 'fecha_baja') IS NOT NULL
BEGIN
    SELECT N'V49 ya está aplicada en esta base: el diagnóstico previo no corresponde. Versión Flyway máxima:' AS aviso,
           (SELECT MAX(CAST(version AS int)) FROM dbo.flyway_schema_history WHERE version IS NOT NULL) AS version_flyway;
    RETURN;
END;

SELECT N'1. Versión Flyway' AS seccion, MAX(CAST(version AS int)) AS valor FROM dbo.flyway_schema_history WHERE version IS NOT NULL;
SELECT N'2. Totales' AS seccion, N'correos_electronicos' AS tabla, COUNT(*) AS filas, COUNT(DISTINCT id_personas) AS personas FROM dbo.correos_electronicos
UNION ALL SELECT N'2. Totales', N'telefonos', COUNT(*), COUNT(DISTINCT id_personas) FROM dbo.telefonos;

SELECT id_correos_electronicos AS id, id_personas, direccion AS valor, tipo_correo_electronico AS tipo, es_principal,
       LOWER(LTRIM(RTRIM(direccion))) AS normalizado, id_correos_electronicos AS orden_antiguedad
INTO #correos FROM dbo.correos_electronicos;
SELECT id_telefonos AS id, id_personas, numero AS valor, tipo_telefono AS tipo, es_principal,
       REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(numero)), N' ', N''), N'-', N''), N'(', N''), N')', N''), N'.', N'') AS normalizado,
       id_telefonos AS orden_antiguedad
INTO #telefonos FROM dbo.telefonos;

-- 3. Grupos duplicados: qué fila se conserva y cuáles se retirarían. TIPOS_DISTINTOS = caso ambiguo (se perdería la clasificación).
SELECT N'3. Duplicados de correo' AS seccion, c.id_personas, c.id, c.valor, c.tipo, c.es_principal,
       CASE WHEN ROW_NUMBER() OVER (PARTITION BY c.id_personas, c.normalizado ORDER BY c.es_principal DESC, c.id) = 1 THEN N'SE CONSERVA' ELSE N'SE RETIRA (DUPLICADO_MIGRACION)' END AS destino,
       CASE WHEN MIN(c.tipo) OVER (PARTITION BY c.id_personas, c.normalizado) <> MAX(c.tipo) OVER (PARTITION BY c.id_personas, c.normalizado) THEN N'TIPOS_DISTINTOS: revisar antes de migrar' ELSE N'' END AS ambiguedad
FROM #correos c
WHERE EXISTS (SELECT 1 FROM #correos d WHERE d.id_personas = c.id_personas AND d.normalizado = c.normalizado AND d.id <> c.id)
ORDER BY c.id_personas, c.normalizado, c.id;
SELECT N'3. Duplicados de teléfono' AS seccion, t.id_personas, t.id, t.valor, t.tipo, t.es_principal,
       CASE WHEN ROW_NUMBER() OVER (PARTITION BY t.id_personas, t.normalizado ORDER BY t.es_principal DESC, t.id) = 1 THEN N'SE CONSERVA' ELSE N'SE RETIRA (DUPLICADO_MIGRACION)' END AS destino,
       CASE WHEN MIN(t.tipo) OVER (PARTITION BY t.id_personas, t.normalizado) <> MAX(t.tipo) OVER (PARTITION BY t.id_personas, t.normalizado) THEN N'TIPOS_DISTINTOS: revisar antes de migrar' ELSE N'' END AS ambiguedad
FROM #telefonos t
WHERE EXISTS (SELECT 1 FROM #telefonos d WHERE d.id_personas = t.id_personas AND d.normalizado = t.normalizado AND d.id <> t.id)
ORDER BY t.id_personas, t.normalizado, t.id;

SELECT N'3. Resumen de bajas previstas' AS seccion,
       (SELECT COUNT(*) FROM (SELECT ROW_NUMBER() OVER (PARTITION BY id_personas, normalizado ORDER BY es_principal DESC, id) AS n FROM #correos) x WHERE n > 1) AS correos_a_retirar,
       (SELECT COUNT(*) FROM (SELECT ROW_NUMBER() OVER (PARTITION BY id_personas, normalizado ORDER BY es_principal DESC, id) AS n FROM #telefonos) x WHERE n > 1) AS telefonos_a_retirar;

-- 4. Personas con contactos y sin principal (V11 lo permitía): V50 promueve el más antiguo.
SELECT N'4. Personas sin principal' AS seccion, N'correo' AS tipo_contacto, id_personas, COUNT(*) AS contactos FROM #correos GROUP BY id_personas HAVING SUM(CAST(es_principal AS int)) = 0
UNION ALL SELECT N'4. Personas sin principal', N'telefono', id_personas, COUNT(*) FROM #telefonos GROUP BY id_personas HAVING SUM(CAST(es_principal AS int)) = 0;

-- 5. Valores que no cumplen el formato exigido hoy a las altas nuevas. No se tocan; se validan cuando su titular los edita.
SELECT N'5. Correos con formato dudoso' AS seccion, id, id_personas, valor FROM #correos WHERE normalizado NOT LIKE N'%_@_%._%' OR normalizado LIKE N'% %';
SELECT N'5. Teléfonos con formato dudoso' AS seccion, id, id_personas, valor FROM #telefonos
WHERE normalizado LIKE N'%[^0-9+]%' OR LEN(REPLACE(normalizado, N'+', N'')) NOT BETWEEN 6 AND 15 OR normalizado LIKE N'_%+%';

-- 6. Informativo: valores compartidos por personas distintas (se permite; no se modifica).
SELECT N'6. Teléfonos compartidos entre personas' AS seccion, normalizado, COUNT(DISTINCT id_personas) AS personas FROM #telefonos GROUP BY normalizado HAVING COUNT(DISTINCT id_personas) > 1;
SELECT N'6. Correos compartidos entre personas' AS seccion, normalizado, COUNT(DISTINCT id_personas) AS personas FROM #correos GROUP BY normalizado HAVING COUNT(DISTINCT id_personas) > 1;
DROP TABLE #correos; DROP TABLE #telefonos;
