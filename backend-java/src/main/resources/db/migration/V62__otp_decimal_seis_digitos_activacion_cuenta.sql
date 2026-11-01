-- V62: los códigos de activación nuevos son OTP decimal de seis dígitos, 10 minutos y cinco intentos.
-- Los registros existentes se marcan explícitamente como legados: conservan su hash alfanumérico y sus 24 horas
-- originales, para no cortar activaciones que ya habían sido entregadas antes de desplegar esta versión.
ALTER TABLE dbo.activaciones_cuenta ADD codigo_numerico BIT NOT NULL
    CONSTRAINT df_activaciones_cuenta_codigo_numerico DEFAULT 0;
ALTER TABLE dbo.activaciones_cuenta ADD intentos_fallidos INT NOT NULL
    CONSTRAINT df_activaciones_cuenta_intentos_fallidos DEFAULT 0;
GO

ALTER TABLE dbo.activaciones_cuenta DROP CONSTRAINT ck_activaciones_cuenta_fechas;
ALTER TABLE dbo.activaciones_cuenta ADD CONSTRAINT ck_activaciones_cuenta_fechas
 CHECK ((codigo_numerico=1 AND fecha_expiracion=DATEADD(MINUTE,10,fecha_creacion))
     OR (codigo_numerico=0 AND fecha_expiracion=DATEADD(HOUR,24,fecha_creacion)));
ALTER TABLE dbo.activaciones_cuenta ADD CONSTRAINT ck_activaciones_cuenta_intentos
 CHECK (intentos_fallidos BETWEEN 0 AND 5);
GO
