-- Diagnóstico de SÓLO LECTURA (V54): teléfonos anteriores a la validación internacional (codigo_pais IS NULL).
-- No modifica nada. Sirve para identificar los registros que deben validarse (los valida su titular desde "Mi cuenta")
-- y para decidir, con autorización, si algún subconjunto determinable se regulariza con un procedimiento aparte.
-- Uso: sqlcmd -S <servidor> -d <base> -i scripts/diagnostico-telefonos-sin-pais.sql

-- 1. Teléfonos de personas sin país, por forma (con "+" el prefijo identifica el país salvo prefijos compartidos como +1; sin "+" el país NO es determinable).
SELECT CASE WHEN numero_normalizado LIKE N'+%' THEN N'con +: país determinable por el prefijo (validar con libphonenumber)' ELSE N'sin +: país NO determinable (ambiguo)' END AS forma,
       LEN(numero_normalizado) AS largo, COUNT(*) AS filas, COUNT(DISTINCT numero_normalizado) AS distintos
FROM dbo.telefonos WHERE fecha_baja IS NULL AND codigo_pais IS NULL
GROUP BY CASE WHEN numero_normalizado LIKE N'+%' THEN N'con +: país determinable por el prefijo (validar con libphonenumber)' ELSE N'sin +: país NO determinable (ambiguo)' END, LEN(numero_normalizado)
ORDER BY 1, 2;

-- 2. Posibles duplicados una vez normalizados: el mismo número escrito con y sin prefijo de país en una misma persona (ambos sin validar).
SELECT a.id_personas, a.id_telefonos AS id_a, a.numero_normalizado AS a, b.id_telefonos AS id_b, b.numero_normalizado AS b
FROM dbo.telefonos a JOIN dbo.telefonos b ON b.id_personas = a.id_personas AND b.id_telefonos > a.id_telefonos
WHERE a.fecha_baja IS NULL AND b.fecha_baja IS NULL AND a.codigo_pais IS NULL AND b.codigo_pais IS NULL
  AND RIGHT(a.numero_normalizado, 8) = RIGHT(b.numero_normalizado, 8) AND a.numero_normalizado <> b.numero_normalizado;

-- 3. Los teléfonos laborales sin validar NO se entregan a Operaciones (CrewContactService): cuántos titulares tienen alguno.
SELECT COUNT(DISTINCT id_personas) AS personas_con_telefono_laboral_sin_validar
FROM dbo.telefonos WHERE fecha_baja IS NULL AND codigo_pais IS NULL AND tipo_telefono = N'LABORAL';

-- 4. Correos sin verificar (todos los anteriores a V54 lo están): cuántos por tipo y cuántos son el principal.
SELECT tipo_correo_electronico AS tipo, COUNT(*) AS correos, SUM(CAST(es_principal AS int)) AS principales
FROM dbo.correos_electronicos WHERE fecha_baja IS NULL AND fecha_verificacion IS NULL GROUP BY tipo_correo_electronico;
