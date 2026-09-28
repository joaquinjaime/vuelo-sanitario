-- V12 sólo retiraba punto, espacio y guion. Este complemento preserva su orden
-- y garantiza la misma canonicalización de DNI que aplica la capa Java.
CREATE OR ALTER FUNCTION dbo.fn_dni_solo_digitos(@valor NVARCHAR(20))
RETURNS NVARCHAR(20)
AS
BEGIN
    DECLARE @resultado NVARCHAR(20) = N'', @posicion INT = 1, @caracter NCHAR(1);
    WHILE @posicion <= LEN(@valor)
    BEGIN
        SET @caracter = SUBSTRING(@valor, @posicion, 1);
        IF @caracter >= N'0' AND @caracter <= N'9' SET @resultado = @resultado + @caracter;
        SET @posicion = @posicion + 1;
    END;
    RETURN @resultado;
END;
GO
IF EXISTS (SELECT 1 FROM personas WHERE dni IS NOT NULL AND dbo.fn_dni_solo_digitos(dni) = N'')
    THROW 51014, 'DNI sin dígitos al canonicalizar; resolver datos antes de V13.', 1;
IF EXISTS (SELECT 1 FROM personas WHERE dni IS NOT NULL GROUP BY dbo.fn_dni_solo_digitos(dni) HAVING COUNT(*) > 1)
    THROW 51015, 'Conflicto de DNI al canonicalizar; resolver datos antes de V13.', 1;
GO
UPDATE personas SET dni = dbo.fn_dni_solo_digitos(dni)
WHERE dni IS NOT NULL AND dni <> dbo.fn_dni_solo_digitos(dni);
ALTER TABLE personas ADD CONSTRAINT ck_personas_dni_solo_digitos CHECK (dni IS NULL OR dni NOT LIKE N'%[^0-9]%');
GO
