CREATE TABLE dbo.bloqueos_documento_vuelo (
    id_bloqueos_documento_vuelo BIGINT IDENTITY(1,1) NOT NULL,
    id_documentos_vuelo BIGINT NOT NULL,
    id_usuario_propietario BIGINT NOT NULL,
    fecha_adquisicion DATETIME2(3) NOT NULL,
    fecha_vencimiento DATETIME2(3) NOT NULL,
    CONSTRAINT pk_bloqueos_documento_vuelo PRIMARY KEY (id_bloqueos_documento_vuelo),
    CONSTRAINT fk_bloqueos_documento_vuelo_documento FOREIGN KEY (id_documentos_vuelo)
        REFERENCES dbo.documentos_vuelo(id_documentos_vuelo),
    CONSTRAINT fk_bloqueos_documento_vuelo_propietario FOREIGN KEY (id_usuario_propietario)
        REFERENCES dbo.usuarios(id_usuarios),
    CONSTRAINT ck_bloqueos_documento_vuelo_vencimiento
        CHECK (fecha_vencimiento > fecha_adquisicion)
);
GO
CREATE UNIQUE INDEX uq_bloqueos_documento_vuelo_documento
    ON dbo.bloqueos_documento_vuelo(id_documentos_vuelo);
CREATE INDEX idx_bloqueos_documento_vuelo_vencimiento
    ON dbo.bloqueos_documento_vuelo(fecha_vencimiento);
GO
