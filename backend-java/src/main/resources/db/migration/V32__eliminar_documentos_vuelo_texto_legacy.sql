-- V32: retira el archivo de textos pre-PDF que ya no participa del modelo
-- documental. Nunca elimina contenido histórico sin una decisión explícita.
IF OBJECT_ID(N'dbo.documentos_vuelo_texto_legacy', N'U') IS NOT NULL
BEGIN
    IF EXISTS (SELECT 1 FROM dbo.documentos_vuelo_texto_legacy)
    BEGIN
        THROW 51032, 'No se elimina documentos_vuelo_texto_legacy porque contiene registros. Archive o migre su contenido antes de ejecutar V32.', 1;
    END;

    DROP TABLE dbo.documentos_vuelo_texto_legacy;
END;
GO
