-- V46: consulta de auditoría por roles.
-- 1) Índices para el listado global y por vuelo con orden estable (fecha DESC, id DESC) y filtros combinables.
-- 2) La tabla pasa a ser de sólo inserción: ningún proceso de negocio actualiza ni borra eventos, y el motor lo impide.
-- No se modifica ni reinterpreta ningún evento existente. Las fechas históricas siguen siendo DATETIME2 en UTC
-- (el backend y SQL Server corren en UTC); desde esta versión el backend las escribe con su reloj de negocio convertido a UTC.

CREATE INDEX idx_eventos_auditoria_fecha
    ON dbo.eventos_auditoria (fecha_ocurrencia DESC, id_eventos_auditoria DESC);
GO
CREATE INDEX idx_eventos_auditoria_vuelo_fecha
    ON dbo.eventos_auditoria (id_vuelos, fecha_ocurrencia DESC, id_eventos_auditoria DESC);
GO
CREATE INDEX idx_eventos_auditoria_actor_fecha
    ON dbo.eventos_auditoria (id_usuario_actor, fecha_ocurrencia DESC, id_eventos_auditoria DESC);
GO
CREATE INDEX idx_eventos_auditoria_entidad_fecha
    ON dbo.eventos_auditoria (tipo_entidad, entidad_id, fecha_ocurrencia DESC);
GO

CREATE INDEX idx_eventos_auditoria_tipo_operacion
    ON dbo.eventos_auditoria (tipo_entidad, operacion);
GO

CREATE TRIGGER dbo.tr_eventos_auditoria_inmutable ON dbo.eventos_auditoria AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    THROW 51046, N'Los eventos de auditoría son inmutables: no admiten modificación ni eliminación', 1;
END;
GO
