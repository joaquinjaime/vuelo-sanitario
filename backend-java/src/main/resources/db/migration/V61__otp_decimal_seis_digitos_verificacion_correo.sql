-- V61: el OTP de verificación pasa a ser decimal de seis dígitos y vence siempre a los diez minutos.
-- Los HMAC de solicitudes pendientes V54 se calculaban sobre códigos alfanuméricos de ocho caracteres. No pueden
-- verificarse mediante el nuevo contrato y se invalidan sin borrar historial; el titular puede pedir un OTP nuevo.
UPDATE dbo.verificaciones_correo
   SET fecha_invalidacion = SYSUTCDATETIME(), motivo_invalidacion = N'REEMPLAZADO'
 WHERE fecha_uso IS NULL AND fecha_invalidacion IS NULL;
GO

-- Se conserva únicamente una huella HMAC del origen de red directo, nunca una cabecera X-Forwarded-For ni la IP en claro.
ALTER TABLE dbo.verificaciones_correo ADD origen_huella VARCHAR(64) NOT NULL
    CONSTRAINT df_verificaciones_correo_origen_huella DEFAULT 'LEGACY';
CREATE INDEX idx_verificaciones_correo_origen_fecha ON dbo.verificaciones_correo (origen_huella, fecha_creacion);
GO

-- El máximo de cinco errores se hace invariante para cualquier código abierto, incluso si una variable de entorno fuera errónea.
-- Los registros históricos ya cerrados se preservan aunque una instalación anterior hubiera configurado un máximo mayor.
ALTER TABLE dbo.verificaciones_correo DROP CONSTRAINT ck_verificaciones_correo_intentos;
ALTER TABLE dbo.verificaciones_correo ADD CONSTRAINT ck_verificaciones_correo_intentos CHECK (intentos_fallidos <= 5 OR fecha_invalidacion IS NOT NULL);
GO
