-- V54: verificación de correos y validación internacional de teléfonos (I-2b).
-- 1) correos_electronicos.fecha_verificacion: instante en que alguien con acceso a la dirección confirmó un código recibido en ella.
--    NULL = sin verificar. Los correos existentes NO se marcan verificados (no hay evidencia): quedan NULL y sus titulares los confirman
--    desde "Mi cuenta". No se agrega un estado aparte: pendiente / vencido se deducen de verificaciones_correo.
-- 2) telefonos.codigo_pais y contactos_coordinacion_traslado.codigo_pais: país (ISO 3166-1 alfa-2) con cuyas reglas de numeración se
--    validó el número. NULL = dato anterior a V54, conservado tal cual y pendiente de validar (no se adivina el país: el mismo
--    "3815551234" no identifica un país). Los valores nuevos guardan en numero_normalizado / telefono_normalizado el formato E.164
--    ("+" y 7 a 15 dígitos), de modo que dos grafías del mismo número chocan con los índices únicos vigentes de V49 / V51.
-- 3) verificaciones_correo: códigos de un solo uso (sólo su HMAC), con vencimiento, intentos y motivo de invalidación. Persistente: sobreviven
--    a un reinicio del backend. Una sola verificación abierta por contacto (índice filtrado).
-- No se borra ni se modifica ningún dato existente. V1–V53 no se tocan.

ALTER TABLE dbo.correos_electronicos ADD fecha_verificacion DATETIME2 NULL;
ALTER TABLE dbo.telefonos ADD codigo_pais VARCHAR(2) NULL;
ALTER TABLE dbo.contactos_coordinacion_traslado ADD codigo_pais VARCHAR(2) NULL;
GO

-- País en mayúsculas ASCII y número E.164 cuando el país está informado (colación binaria: "ar" no cumple).
ALTER TABLE dbo.telefonos ADD CONSTRAINT ck_telefonos_validacion_internacional CHECK (
    codigo_pais IS NULL
 OR (LEN(codigo_pais) = 2 AND codigo_pais COLLATE Latin1_General_BIN2 NOT LIKE N'%[^A-Z]%'
     AND numero_normalizado LIKE N'+[1-9]%' AND SUBSTRING(numero_normalizado, 2, 30) NOT LIKE N'%[^0-9]%'
     AND LEN(numero_normalizado) BETWEEN 8 AND 16));
ALTER TABLE dbo.contactos_coordinacion_traslado ADD CONSTRAINT ck_contactos_coordinacion_traslado_validacion_internacional CHECK (
    codigo_pais IS NULL
 OR (LEN(codigo_pais) = 2 AND codigo_pais COLLATE Latin1_General_BIN2 NOT LIKE N'%[^A-Z]%'
     AND telefono_normalizado LIKE N'+[1-9]%' AND SUBSTRING(telefono_normalizado, 2, 30) NOT LIKE N'%[^0-9]%'
     AND LEN(telefono_normalizado) BETWEEN 8 AND 16));
GO

CREATE TABLE dbo.verificaciones_correo (
    id_verificaciones_correo BIGINT IDENTITY(1,1) NOT NULL,
    id_correos_electronicos BIGINT NOT NULL,
    direccion_normalizada NVARCHAR(150) NOT NULL,        -- dirección a la que se envió el código: si el correo cambia, el código deja de servir
    codigo_hash VARCHAR(64) NOT NULL,                    -- HMAC-SHA256 con una clave del servidor; nunca el código
    intentos_fallidos TINYINT NOT NULL CONSTRAINT df_verificaciones_correo_intentos DEFAULT 0,
    fecha_creacion DATETIME2 NOT NULL,
    fecha_vencimiento DATETIME2 NOT NULL,
    fecha_envio DATETIME2 NULL,                          -- el servidor SMTP aceptó el mensaje (no prueba la entrega)
    fecha_uso DATETIME2 NULL,                            -- código confirmado
    fecha_invalidacion DATETIME2 NULL,
    motivo_invalidacion NVARCHAR(30) NULL,
    id_usuario_solicitante BIGINT NOT NULL,
    CONSTRAINT pk_verificaciones_correo PRIMARY KEY (id_verificaciones_correo),
    CONSTRAINT fk_verificaciones_correo_correo FOREIGN KEY (id_correos_electronicos) REFERENCES dbo.correos_electronicos (id_correos_electronicos),
    CONSTRAINT fk_verificaciones_correo_solicitante FOREIGN KEY (id_usuario_solicitante) REFERENCES dbo.usuarios (id_usuarios),
    CONSTRAINT ck_verificaciones_correo_vigencia CHECK (fecha_vencimiento > fecha_creacion),
    CONSTRAINT ck_verificaciones_correo_cierre CHECK (
        (fecha_invalidacion IS NULL AND motivo_invalidacion IS NULL)
     OR (fecha_invalidacion IS NOT NULL AND fecha_uso IS NULL AND motivo_invalidacion IN
         (N'REEMPLAZADO', N'VENCIDO', N'AGOTADO', N'CORREO_MODIFICADO', N'CORREO_RETIRADO', N'ENVIO_FALLIDO', N'CORREO_VERIFICADO'))),
    CONSTRAINT ck_verificaciones_correo_intentos CHECK (intentos_fallidos <= 10)
);
GO

-- A lo sumo una verificación abierta (sin usar ni invalidar) por correo.
CREATE UNIQUE INDEX uq_verificaciones_correo_abierta
    ON dbo.verificaciones_correo (id_correos_electronicos) WHERE fecha_uso IS NULL AND fecha_invalidacion IS NULL;
-- Límites de envío: cuántos códigos se emitieron para un correo en una ventana.
CREATE INDEX idx_verificaciones_correo_correo_fecha ON dbo.verificaciones_correo (id_correos_electronicos, fecha_creacion);
CREATE INDEX idx_verificaciones_correo_id_usuario_solicitante ON dbo.verificaciones_correo (id_usuario_solicitante, fecha_creacion);
GO
