-- V66: simplificación del modelo de tripulación.
-- 1) El comandante deja de depender de clasificaciones administrativas, políticas de suficiencia y habilitaciones documentadas: esas reglas salen del flujo
--    funcional. Las tablas clasificaciones_tripulacion, habilitaciones_profesionales, documentos_habilitacion, decisiones_habilitacion,
--    consultas_externas_habilitacion y politicas_habilitacion NO se modifican ni se borran: conservan su historial (y sus disparadores de inmutabilidad),
--    pero la aplicación ya no las lee ni las escribe. Sólo se las marca como retiradas del flujo.
-- 2) El copiloto es un usuario COMANDANTE asignado a un vuelo con la función COPILOTO (vuelos_tripulantes ya lo representa; no se crea ningún rol de acceso).
--    Una persona no puede ser comandante principal y copiloto del mismo vuelo: lo impide el índice único filtrado de V45 (id_vuelos, id_usuarios) de asignaciones vigentes.
--    La excepción geográfica pasa a registrar a qué función se aplica (comandante o copiloto).
-- 3) Los médicos y enfermeros son registros administrativos de personas que DTS asocia a sus vuelos. No son usuarios: no tienen cuenta, contraseña, rol ni sesión.
--    personal_sanitario reutiliza personas (identidad) y vuelos_personal_sanitario es la participación en cada vuelo, con baja lógica que conserva el historial.
-- No se modifica ninguna fila existente.

-- 1. Excepción geográfica: función a la que se aplica (comandante principal o copiloto). Las filas existentes eran de comandantes.
ALTER TABLE dbo.excepciones_geograficas_comandante ADD funcion NVARCHAR(20) NOT NULL
    CONSTRAINT df_excepcion_geografica_funcion DEFAULT N'COMANDANTE';
GO
ALTER TABLE dbo.excepciones_geograficas_comandante ADD CONSTRAINT ck_excepcion_geografica_funcion CHECK (funcion IN (N'COMANDANTE', N'COPILOTO'));
GO

-- 2. Catálogo de personal sanitario de cada DTS. El responsable (id_usuario_dts) es el usuario DTS que lo registró: no existe una entidad "organización" en el modelo,
--    de modo que el catálogo es de cada cuenta DTS y ninguna otra puede verlo ni modificarlo. La matrícula es un dato declarado para identificar a la persona; la
--    aplicación no la verifica ante ningún organismo.
CREATE TABLE dbo.personal_sanitario (
    id_personal_sanitario BIGINT IDENTITY(1,1) NOT NULL,
    id_personas BIGINT NOT NULL,
    id_usuario_dts BIGINT NOT NULL,
    tipo_profesional NVARCHAR(20) NOT NULL,
    matricula NVARCHAR(50) NOT NULL,
    esta_activo BIT NOT NULL CONSTRAINT df_personal_sanitario_activo DEFAULT 1,
    fecha_desactivacion DATETIME2(3) NULL,
    version_registro BIGINT NOT NULL CONSTRAINT df_personal_sanitario_version DEFAULT 0,
    fecha_creacion DATETIME2(3) NOT NULL CONSTRAINT df_personal_sanitario_creacion DEFAULT SYSDATETIME(),
    fecha_actualizacion DATETIME2(3) NOT NULL CONSTRAINT df_personal_sanitario_actualizacion DEFAULT SYSDATETIME(),
    CONSTRAINT pk_personal_sanitario PRIMARY KEY (id_personal_sanitario),
    CONSTRAINT fk_personal_sanitario_persona FOREIGN KEY (id_personas) REFERENCES dbo.personas (id_personas),
    CONSTRAINT fk_personal_sanitario_dts FOREIGN KEY (id_usuario_dts) REFERENCES dbo.usuarios (id_usuarios),
    CONSTRAINT ck_personal_sanitario_tipo CHECK (tipo_profesional IN (N'MEDICO', N'ENFERMERO')),
    CONSTRAINT ck_personal_sanitario_matricula CHECK (LEN(LTRIM(RTRIM(matricula))) >= 1),
    CONSTRAINT ck_personal_sanitario_desactivacion CHECK ((esta_activo = 1 AND fecha_desactivacion IS NULL) OR (esta_activo = 0 AND fecha_desactivacion IS NOT NULL)),
    -- Una persona figura una sola vez en el catálogo de cada DTS, y una matrícula no se repite para el mismo tipo de profesional dentro de un catálogo.
    CONSTRAINT uq_personal_sanitario_dts_persona UNIQUE (id_usuario_dts, id_personas),
    CONSTRAINT uq_personal_sanitario_dts_tipo_matricula UNIQUE (id_usuario_dts, tipo_profesional, matricula)
);
GO
CREATE INDEX ix_personal_sanitario_persona ON dbo.personal_sanitario (id_personas);
GO

-- 3. Participación del personal sanitario en un vuelo. La función (médico o enfermero) se deduce del catálogo. Retirar o sustituir da de baja la fila (quién, cuándo,
--    por qué) y la conserva como historial. Que el profesional pertenezca al DTS que solicitó el vuelo lo verifica el servicio en la misma transacción.
CREATE TABLE dbo.vuelos_personal_sanitario (
    id_vuelos_personal_sanitario BIGINT IDENTITY(1,1) NOT NULL,
    id_vuelos BIGINT NOT NULL,
    id_personal_sanitario BIGINT NOT NULL,
    id_usuario_asignador BIGINT NOT NULL,
    fecha_creacion DATETIME2(3) NOT NULL CONSTRAINT df_vuelos_personal_sanitario_creacion DEFAULT SYSDATETIME(),
    fecha_baja DATETIME2(3) NULL,
    id_usuario_baja BIGINT NULL,
    motivo_baja NVARCHAR(30) NULL,
    CONSTRAINT pk_vuelos_personal_sanitario PRIMARY KEY (id_vuelos_personal_sanitario),
    CONSTRAINT fk_vuelos_personal_sanitario_vuelo FOREIGN KEY (id_vuelos) REFERENCES dbo.vuelos (id_vuelos),
    CONSTRAINT fk_vuelos_personal_sanitario_personal FOREIGN KEY (id_personal_sanitario) REFERENCES dbo.personal_sanitario (id_personal_sanitario),
    CONSTRAINT fk_vuelos_personal_sanitario_asignador FOREIGN KEY (id_usuario_asignador) REFERENCES dbo.usuarios (id_usuarios),
    CONSTRAINT fk_vuelos_personal_sanitario_baja FOREIGN KEY (id_usuario_baja) REFERENCES dbo.usuarios (id_usuarios),
    CONSTRAINT ck_vuelos_personal_sanitario_baja CHECK (
        (fecha_baja IS NULL AND id_usuario_baja IS NULL AND motivo_baja IS NULL)
     OR (fecha_baja IS NOT NULL AND id_usuario_baja IS NOT NULL AND motivo_baja IN (N'RETIRO', N'REEMPLAZO')))
);
GO
-- Un profesional sólo puede tener una participación vigente por vuelo.
CREATE UNIQUE INDEX ux_vuelos_personal_sanitario_vigente ON dbo.vuelos_personal_sanitario (id_vuelos, id_personal_sanitario) WHERE fecha_baja IS NULL;
-- Compromisos de un profesional (para evitar participaciones simultáneas incompatibles).
CREATE INDEX ix_vuelos_personal_sanitario_personal_vigente ON dbo.vuelos_personal_sanitario (id_personal_sanitario) INCLUDE (id_vuelos) WHERE fecha_baja IS NULL;
CREATE INDEX ix_vuelos_personal_sanitario_asignador ON dbo.vuelos_personal_sanitario (id_usuario_asignador);
CREATE INDEX ix_vuelos_personal_sanitario_baja ON dbo.vuelos_personal_sanitario (id_usuario_baja) WHERE id_usuario_baja IS NOT NULL;
GO

-- 4. Las tablas de habilitaciones y clasificaciones salen del flujo funcional; se conservan sólo como historial consultable.
DECLARE @legacy TABLE (tabla SYSNAME);
INSERT INTO @legacy (tabla) VALUES (N'clasificaciones_tripulacion'), (N'habilitaciones_profesionales'), (N'documentos_habilitacion'),
    (N'decisiones_habilitacion'), (N'consultas_externas_habilitacion'), (N'politicas_habilitacion');
DECLARE @t SYSNAME;
DECLARE c CURSOR LOCAL FAST_FORWARD FOR SELECT tabla FROM @legacy;
OPEN c; FETCH NEXT FROM c INTO @t;
WHILE @@FETCH_STATUS = 0
BEGIN
    IF OBJECT_ID(N'dbo.' + @t, N'U') IS NOT NULL
    BEGIN
        IF EXISTS (SELECT 1 FROM sys.extended_properties WHERE major_id = OBJECT_ID(N'dbo.' + @t) AND minor_id = 0 AND name = N'MS_Description')
            EXEC sp_updateextendedproperty @name = N'MS_Description', @value = N'V66: retirada del flujo funcional; sólo historial. La aplicación ya no la lee ni la escribe.',
                @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = @t;
        ELSE
            EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'V66: retirada del flujo funcional; sólo historial. La aplicación ya no la lee ni la escribe.',
                @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = @t;
    END
    FETCH NEXT FROM c INTO @t;
END
CLOSE c; DEALLOCATE c;
GO
