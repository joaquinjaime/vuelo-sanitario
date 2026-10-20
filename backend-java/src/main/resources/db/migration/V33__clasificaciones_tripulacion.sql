CREATE TABLE dbo.clasificaciones_tripulacion (
    id_clasificaciones_tripulacion BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    id_usuarios BIGINT NOT NULL,
    id_roles_tripulacion BIGINT NOT NULL,
    id_usuario_clasificador BIGINT NOT NULL,
    fecha_clasificacion DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_clasificacion_tripulante FOREIGN KEY (id_usuarios) REFERENCES dbo.usuarios(id_usuarios),
    CONSTRAINT fk_clasificacion_funcion FOREIGN KEY (id_roles_tripulacion) REFERENCES dbo.roles_tripulacion(id_roles_tripulacion),
    CONSTRAINT fk_clasificacion_actor FOREIGN KEY (id_usuario_clasificador) REFERENCES dbo.usuarios(id_usuarios),
    CONSTRAINT uq_clasificacion_tripulacion UNIQUE (id_usuarios, id_roles_tripulacion)
);
GO
