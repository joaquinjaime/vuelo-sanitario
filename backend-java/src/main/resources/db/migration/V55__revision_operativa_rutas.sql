-- V55: revisión operativa de rutas (I-4).
-- rutas_vuelo ya versiona cada modificación (version, es_version_actual) y registra el contexto operativo bajo el cual se planificó
-- (contexto_operativo). Esta migración agrega, sobre esas mismas filas, el estado de revisión de CADA versión y la trazabilidad de las
-- decisiones; no crea tablas: una aprobación pertenece a una versión concreta y esa versión es una fila de rutas_vuelo.
--   BORRADOR          versión guardada por el comandante y todavía no presentada
--   PENDIENTE_REVISION presentada a Operaciones, sin decisión
--   APROBADA          aprobada por Operaciones para esta versión y el contexto con que se planificó
--   DEVUELTA          devuelta por Operaciones con observaciones obligatorias
--   REQUIERE_REVISION presentada o aprobada, pero un cambio material del vuelo invalidó esa decisión (se conservan revisor y fecha)
--   SIN_REVISION      versión que nunca recibió decisión (reemplazada por otra o anterior a este procedimiento)
ALTER TABLE dbo.rutas_vuelo ADD
    estado_revision VARCHAR(25) NULL,
    motivo_modificacion NVARCHAR(500) NULL,
    id_usuario_presenta BIGINT NULL,
    fecha_presentacion DATETIME2(3) NULL,
    id_usuario_revisor BIGINT NULL,
    fecha_revision DATETIME2(3) NULL,
    observaciones_revision NVARCHAR(1000) NULL,
    fecha_invalidacion DATETIME2(3) NULL,
    causa_invalidacion NVARCHAR(500) NULL;
GO

-- Tratamiento de las rutas existentes. Ninguna se marca como aprobada ni presentada: no existe una decisión de Operaciones que
-- respalde esa afirmación. La versión vigente de un vuelo que todavía no inició (y puede iniciar) queda como BORRADOR: el comandante
-- debe presentarla y Operaciones aprobarla antes del inicio. Las demás versiones, y las de vuelos ya iniciados, finalizados, completados
-- o cancelados, quedan como SIN_REVISION: se conservan íntegras, sin alterar el significado de lo ya ocurrido.
UPDATE r SET estado_revision =
    CASE WHEN r.es_version_actual = 1 AND (e.codigo_estado_vuelo IS NULL
              OR e.codigo_estado_vuelo NOT IN (N'EN_CURSO', N'FINALIZADO', N'COMPLETADO', N'CANCELADO'))
         THEN 'BORRADOR' ELSE 'SIN_REVISION' END
FROM dbo.rutas_vuelo r
JOIN dbo.vuelos v ON v.id_vuelos = r.id_vuelos
LEFT JOIN dbo.estados_vuelo e ON e.id_estados_vuelo = v.id_estados_vuelo;
GO

ALTER TABLE dbo.rutas_vuelo ALTER COLUMN estado_revision VARCHAR(25) NOT NULL;
GO

ALTER TABLE dbo.rutas_vuelo ADD
    CONSTRAINT fk_rutas_vuelo_usuario_presenta FOREIGN KEY (id_usuario_presenta) REFERENCES dbo.usuarios (id_usuarios),
    CONSTRAINT fk_rutas_vuelo_usuario_revisor FOREIGN KEY (id_usuario_revisor) REFERENCES dbo.usuarios (id_usuarios),
    CONSTRAINT ck_rutas_vuelo_estado_revision CHECK (estado_revision IN
        ('BORRADOR', 'PENDIENTE_REVISION', 'APROBADA', 'DEVUELTA', 'REQUIERE_REVISION', 'SIN_REVISION')),
    -- Una versión presentada conserva quién y cuándo; una decisión conserva revisor y fecha; una devolución, su motivo.
    CONSTRAINT ck_rutas_vuelo_presentacion CHECK (estado_revision NOT IN ('PENDIENTE_REVISION', 'APROBADA', 'DEVUELTA')
        OR (id_usuario_presenta IS NOT NULL AND fecha_presentacion IS NOT NULL)),
    CONSTRAINT ck_rutas_vuelo_decision CHECK (estado_revision NOT IN ('APROBADA', 'DEVUELTA')
        OR (id_usuario_revisor IS NOT NULL AND fecha_revision IS NOT NULL)),
    CONSTRAINT ck_rutas_vuelo_devolucion CHECK (estado_revision <> 'DEVUELTA'
        OR (observaciones_revision IS NOT NULL AND LEN(LTRIM(RTRIM(observaciones_revision))) > 0)),
    CONSTRAINT ck_rutas_vuelo_invalidacion CHECK (estado_revision <> 'REQUIERE_REVISION'
        OR (fecha_invalidacion IS NOT NULL AND causa_invalidacion IS NOT NULL)),
    -- Nadie revisa lo que presentó.
    CONSTRAINT ck_rutas_vuelo_revisor_distinto CHECK (id_usuario_revisor IS NULL OR id_usuario_presenta IS NULL
        OR id_usuario_revisor <> id_usuario_presenta);
GO

-- Consultas efectivamente usadas: cola de revisión de Operaciones (versión vigente por estado) e historial de un vuelo.
CREATE INDEX idx_rutas_vuelo_estado_revision_actual ON dbo.rutas_vuelo (estado_revision, id_vuelos) WHERE es_version_actual = 1;
GO
