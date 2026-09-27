-- V8: traduccion fisica del esquema. Las clases Java conservan sus nombres
-- en ingles; esta migracion solo cambia los identificadores SQL de negocio.
SET XACT_ABORT ON;
GO

-- sp_rename no permite columnas referenciadas por CHECK o por el trigger.
-- Se retiran y recrean dentro de la misma transaccion Flyway con los nombres
-- finales, sin cambiar ninguna regla de negocio.
DROP TRIGGER trg_flights_validate_lifecycle;
ALTER TABLE flight_documents DROP CONSTRAINT chk_flight_documents_payload;
ALTER TABLE audit_events DROP CONSTRAINT chk_audit_json;
ALTER TABLE final_report_obligations DROP CONSTRAINT chk_final_report_obligation_dates;
ALTER TABLE final_report_obligations DROP CONSTRAINT chk_final_report_obligation_review;
-- El CHECK de valores de status fue creado inline por SQL Server con nombre
-- generado; se localiza por catalogo para no depender de su sufijo variable.
DECLARE @check_obligacion sysname, @sql_check nvarchar(max);
DECLARE checks_obligacion CURSOR LOCAL FAST_FORWARD FOR
SELECT name FROM sys.check_constraints WHERE parent_object_id = OBJECT_ID(N'dbo.final_report_obligations');
OPEN checks_obligacion; FETCH NEXT FROM checks_obligacion INTO @check_obligacion;
WHILE @@FETCH_STATUS = 0 BEGIN
    SET @sql_check = N'ALTER TABLE dbo.final_report_obligations DROP CONSTRAINT ' + QUOTENAME(@check_obligacion);
    EXEC sp_executesql @sql_check;
    FETCH NEXT FROM checks_obligacion INTO @check_obligacion;
END
CLOSE checks_obligacion; DEALLOCATE checks_obligacion;
DROP INDEX ix_final_report_obligation_commander_due ON final_report_obligations;
DROP INDEX ux_final_report_obligation_current ON final_report_obligations;
GO

-- Tablas: plural, snake_case y espanol tecnico.
EXEC sp_rename N'dbo.users', N'usuarios';
EXEC sp_rename N'dbo.user_roles', N'usuarios_roles';
EXEC sp_rename N'dbo.airports', N'aeropuertos';
EXEC sp_rename N'dbo.aircraft', N'aeronaves';
EXEC sp_rename N'dbo.crew_roles', N'roles_tripulacion';
EXEC sp_rename N'dbo.flight_statuses', N'estados_vuelo';
EXEC sp_rename N'dbo.flight_priorities', N'prioridades_vuelo';
EXEC sp_rename N'dbo.document_types', N'tipos_documento';
EXEC sp_rename N'dbo.patients', N'pacientes';
EXEC sp_rename N'dbo.persons', N'personas';
EXEC sp_rename N'dbo.flights', N'vuelos';
EXEC sp_rename N'dbo.flight_crew', N'vuelos_tripulantes';
EXEC sp_rename N'dbo.weather_snapshots', N'instantaneas_clima';
EXEC sp_rename N'dbo.flight_document_items', N'documentos_vuelo';
EXEC sp_rename N'dbo.flight_documents', N'versiones_documento_vuelo';
EXEC sp_rename N'dbo.flight_audit_log', N'bitacora_vuelos';
EXEC sp_rename N'dbo.audit_events', N'eventos_auditoria';
EXEC sp_rename N'dbo.notifications', N'notificaciones';
EXEC sp_rename N'dbo.flight_medical_info', N'informacion_medica_vuelo';
EXEC sp_rename N'dbo.flight_routes', N'rutas_vuelo';
EXEC sp_rename N'dbo.hangar_info', N'informacion_hangar';
EXEC sp_rename N'dbo.aa2000_coordination', N'coordinaciones_aa2000';
EXEC sp_rename N'dbo.flight_final_reports', N'informes_finales_vuelo';
EXEC sp_rename N'dbo.final_report_obligations', N'obligaciones_informe_final';
GO

-- Columnas comunes y relaciones. sp_rename mantiene tipos, datos y FKs.
DECLARE @renombres TABLE (tabla sysname, anterior sysname, nuevo sysname);
INSERT INTO @renombres VALUES
 (N'roles',N'created_at',N'fecha_creacion'),
 (N'usuarios',N'username',N'nombre_usuario'),(N'usuarios',N'email',N'correo_electronico'),(N'usuarios',N'password_hash',N'hash_contrasena'),(N'usuarios',N'person_id',N'persona_id'),(N'usuarios',N'created_at',N'fecha_creacion'),(N'usuarios',N'updated_at',N'fecha_actualizacion'),
 (N'usuarios_roles',N'user_id',N'usuario_id'),(N'usuarios_roles',N'role_id',N'rol_id'),(N'usuarios_roles',N'assigned_at',N'fecha_asignacion'),
 (N'aeronaves',N'created_at',N'fecha_creacion'),
 (N'pacientes',N'person_id',N'persona_id'),(N'pacientes',N'created_at',N'fecha_creacion'),(N'pacientes',N'updated_at',N'fecha_actualizacion'),
 (N'personas',N'created_at',N'fecha_creacion'),(N'personas',N'updated_at',N'fecha_actualizacion'),
 (N'vuelos',N'patient_id',N'paciente_id'),(N'vuelos',N'solicitado_por_id',N'solicitado_por_usuario_id'),(N'vuelos',N'status_id',N'estado_id'),(N'vuelos',N'priority_id',N'prioridad_id'),(N'vuelos',N'evaluado_por_id',N'evaluado_por_usuario_id'),(N'vuelos',N'aircraft_id',N'aeronave_id'),(N'vuelos',N'comandante_id',N'comandante_usuario_id'),(N'vuelos',N'cancelado_por_id',N'cancelado_por_usuario_id'),(N'vuelos',N'created_at',N'fecha_creacion'),(N'vuelos',N'updated_at',N'fecha_actualizacion'),
 (N'vuelos_tripulantes',N'flight_id',N'vuelo_id'),(N'vuelos_tripulantes',N'user_id',N'usuario_id'),(N'vuelos_tripulantes',N'crew_role_id',N'rol_tripulacion_id'),(N'vuelos_tripulantes',N'asignado_por_id',N'asignado_por_usuario_id'),(N'vuelos_tripulantes',N'created_at',N'fecha_creacion'),
 (N'instantaneas_clima',N'flight_id',N'vuelo_id'),(N'instantaneas_clima',N'consultado_por_id',N'consultado_por_usuario_id'),
 (N'documentos_vuelo',N'flight_id',N'vuelo_id'),(N'documentos_vuelo',N'document_type_id',N'tipo_documento_id'),(N'documentos_vuelo',N'created_at',N'fecha_creacion'),
 (N'versiones_documento_vuelo',N'document_item_id',N'documento_vuelo_id'),(N'versiones_documento_vuelo',N'storage_key',N'clave_almacenamiento'),(N'versiones_documento_vuelo',N'mime_type',N'tipo_mime'),(N'versiones_documento_vuelo',N'creado_por_id',N'creado_por_usuario_id'),(N'versiones_documento_vuelo',N'created_at',N'fecha_creacion'),
 (N'informacion_medica_vuelo',N'flight_id',N'vuelo_id'),(N'informacion_medica_vuelo',N'created_at',N'fecha_creacion'),(N'informacion_medica_vuelo',N'updated_at',N'fecha_actualizacion'),
 (N'rutas_vuelo',N'flight_id',N'vuelo_id'),(N'rutas_vuelo',N'creado_por_id',N'creado_por_usuario_id'),(N'rutas_vuelo',N'created_at',N'fecha_creacion'),
 (N'informacion_hangar',N'flight_id',N'vuelo_id'),(N'informacion_hangar',N'registrado_por_id',N'registrado_por_usuario_id'),(N'informacion_hangar',N'created_at',N'fecha_creacion'),
 (N'coordinaciones_aa2000',N'flight_id',N'vuelo_id'),(N'coordinaciones_aa2000',N'registrado_por_id',N'registrado_por_usuario_id'),(N'coordinaciones_aa2000',N'created_at',N'fecha_creacion'),
 (N'informes_finales_vuelo',N'flight_id',N'vuelo_id'),(N'informes_finales_vuelo',N'creado_por_id',N'creado_por_usuario_id'),(N'informes_finales_vuelo',N'created_at',N'fecha_creacion'),
 (N'obligaciones_informe_final',N'flight_id',N'vuelo_id'),(N'obligaciones_informe_final',N'commander_id',N'comandante_usuario_id'),(N'obligaciones_informe_final',N'obligation_number',N'numero_obligacion'),(N'obligaciones_informe_final',N'status',N'estado'),(N'obligaciones_informe_final',N'original_due_at',N'vencimiento_original'),(N'obligaciones_informe_final',N'due_at',N'vencimiento'),(N'obligaciones_informe_final',N'extension_used',N'prorroga_utilizada'),(N'obligaciones_informe_final',N'extended_at',N'fecha_prorroga'),(N'obligaciones_informe_final',N'presented_at',N'fecha_presentacion'),(N'obligaciones_informe_final',N'report_id',N'informe_id'),(N'obligaciones_informe_final',N'returned_at',N'fecha_devolucion'),(N'obligaciones_informe_final',N'returned_by_id',N'devuelto_por_usuario_id'),(N'obligaciones_informe_final',N'return_reason',N'motivo_devolucion'),(N'obligaciones_informe_final',N'approved_at',N'fecha_aprobacion'),(N'obligaciones_informe_final',N'approved_by_id',N'aprobado_por_usuario_id'),(N'obligaciones_informe_final',N'is_current',N'es_actual'),(N'obligaciones_informe_final',N'row_version',N'version_fila'),
 (N'eventos_auditoria',N'flight_id',N'vuelo_id'),(N'eventos_auditoria',N'actor_user_id',N'actor_usuario_id'),(N'eventos_auditoria',N'entity_type',N'tipo_entidad'),(N'eventos_auditoria',N'entity_id',N'entidad_id'),(N'eventos_auditoria',N'operation',N'operacion'),(N'eventos_auditoria',N'old_values',N'valores_anteriores'),(N'eventos_auditoria',N'new_values',N'valores_nuevos'),(N'eventos_auditoria',N'occurred_at',N'fecha_ocurrencia'),
 (N'bitacora_vuelos',N'flight_id',N'vuelo_id'),
 (N'notificaciones',N'user_id',N'usuario_id'),(N'notificaciones',N'flight_id',N'vuelo_id'),(N'notificaciones',N'created_at',N'fecha_creacion');
DECLARE @tabla sysname, @anterior sysname, @nuevo sysname, @objeto nvarchar(776);
DECLARE renombrar_cursor CURSOR LOCAL FAST_FORWARD FOR SELECT tabla, anterior, nuevo FROM @renombres;
OPEN renombrar_cursor; FETCH NEXT FROM renombrar_cursor INTO @tabla,@anterior,@nuevo;
WHILE @@FETCH_STATUS = 0 BEGIN
  SET @objeto = N'dbo.' + @tabla + N'.' + @anterior;
  EXEC sp_rename @objname = @objeto, @newname = @nuevo, @objtype = N'COLUMN';
  FETCH NEXT FROM renombrar_cursor INTO @tabla,@anterior,@nuevo;
END
CLOSE renombrar_cursor; DEALLOCATE renombrar_cursor;
GO

-- Convencion uniforme para constraints e indices existentes.
DECLARE @objeto_id int, @nombre sysname, @nuevo_nombre sysname, @tabla_nombre sysname, @sql nvarchar(max);
DECLARE c CURSOR LOCAL FAST_FORWARD FOR
SELECT kc.parent_object_id, kc.name,
       CASE kc.type WHEN 'PK' THEN N'pk_' + OBJECT_NAME(kc.parent_object_id)
                    ELSE N'uq_' + OBJECT_NAME(kc.parent_object_id) + N'_' + CONVERT(nvarchar(10), kc.unique_index_id) END,
       OBJECT_NAME(kc.parent_object_id)
FROM sys.key_constraints kc WHERE OBJECT_SCHEMA_NAME(kc.parent_object_id) = N'dbo';
OPEN c; FETCH NEXT FROM c INTO @objeto_id,@nombre,@nuevo_nombre,@tabla_nombre;
WHILE @@FETCH_STATUS = 0 BEGIN SET @sql = N'dbo.' + @nombre; EXEC sp_rename @sql, @nuevo_nombre, N'OBJECT'; FETCH NEXT FROM c INTO @objeto_id,@nombre,@nuevo_nombre,@tabla_nombre; END
CLOSE c; DEALLOCATE c;
GO

-- SQL Server genero varios nombres historicos; se normalizan todos los
-- objetos de integridad e indices no asociados a una PK/UQ. El sufijo por
-- object_id/index_id conserva unicidad sin exponer nombres ingleses.
DECLARE @nombre_anterior sysname, @nombre_nuevo sysname, @tabla sysname, @objeto_indice nvarchar(776);
DECLARE fk_cursor CURSOR LOCAL FAST_FORWARD FOR
SELECT fk.name, N'fk_' + OBJECT_NAME(fk.parent_object_id) + N'_' + OBJECT_NAME(fk.referenced_object_id) + N'_' + CONVERT(nvarchar(10), fk.object_id)
FROM sys.foreign_keys fk WHERE OBJECT_SCHEMA_NAME(fk.parent_object_id) = N'dbo';
OPEN fk_cursor; FETCH NEXT FROM fk_cursor INTO @nombre_anterior,@nombre_nuevo;
WHILE @@FETCH_STATUS = 0 BEGIN SET @objeto_indice = N'dbo.' + @nombre_anterior; EXEC sp_rename @objeto_indice, @nombre_nuevo, N'OBJECT'; FETCH NEXT FROM fk_cursor INTO @nombre_anterior,@nombre_nuevo; END
CLOSE fk_cursor; DEALLOCATE fk_cursor;

DECLARE ck_cursor CURSOR LOCAL FAST_FORWARD FOR
SELECT cc.name, N'ck_' + OBJECT_NAME(cc.parent_object_id) + N'_' + CONVERT(nvarchar(10), cc.object_id)
FROM sys.check_constraints cc WHERE OBJECT_SCHEMA_NAME(cc.parent_object_id) = N'dbo';
OPEN ck_cursor; FETCH NEXT FROM ck_cursor INTO @nombre_anterior,@nombre_nuevo;
WHILE @@FETCH_STATUS = 0 BEGIN SET @objeto_indice = N'dbo.' + @nombre_anterior; EXEC sp_rename @objeto_indice, @nombre_nuevo, N'OBJECT'; FETCH NEXT FROM ck_cursor INTO @nombre_anterior,@nombre_nuevo; END
CLOSE ck_cursor; DEALLOCATE ck_cursor;

DECLARE df_cursor CURSOR LOCAL FAST_FORWARD FOR
SELECT dc.name, N'df_' + OBJECT_NAME(dc.parent_object_id) + N'_' + COL_NAME(dc.parent_object_id, dc.parent_column_id)
FROM sys.default_constraints dc WHERE OBJECT_SCHEMA_NAME(dc.parent_object_id) = N'dbo';
OPEN df_cursor; FETCH NEXT FROM df_cursor INTO @nombre_anterior,@nombre_nuevo;
WHILE @@FETCH_STATUS = 0 BEGIN SET @objeto_indice = N'dbo.' + @nombre_anterior; EXEC sp_rename @objeto_indice, @nombre_nuevo, N'OBJECT'; FETCH NEXT FROM df_cursor INTO @nombre_anterior,@nombre_nuevo; END
CLOSE df_cursor; DEALLOCATE df_cursor;

DECLARE ix_cursor CURSOR LOCAL FAST_FORWARD FOR
SELECT OBJECT_NAME(i.object_id), i.name,
       CASE WHEN i.is_unique = 1 THEN N'uq_' ELSE N'ix_' END + OBJECT_NAME(i.object_id) + N'_' + CONVERT(nvarchar(10), i.index_id)
FROM sys.indexes i
WHERE OBJECT_SCHEMA_NAME(i.object_id) = N'dbo'
  AND i.name IS NOT NULL AND i.is_primary_key = 0 AND i.is_unique_constraint = 0;
OPEN ix_cursor; FETCH NEXT FROM ix_cursor INTO @tabla,@nombre_anterior,@nombre_nuevo;
WHILE @@FETCH_STATUS = 0 BEGIN SET @objeto_indice = N'dbo.' + @tabla + N'.' + @nombre_anterior; EXEC sp_rename @objeto_indice, @nombre_nuevo, N'INDEX'; FETCH NEXT FROM ix_cursor INTO @tabla,@nombre_anterior,@nombre_nuevo; END
CLOSE ix_cursor; DEALLOCATE ix_cursor;
GO

-- Reglas retiradas antes del renombrado: mismas semanticas, identificadores finales.
ALTER TABLE versiones_documento_vuelo ADD CONSTRAINT ck_versiones_documento_vuelo_carga CHECK (
    (clave_almacenamiento IS NOT NULL AND contenido_texto IS NULL AND nombre_archivo IS NOT NULL AND tamanio_bytes IS NOT NULL)
    OR (clave_almacenamiento IS NULL AND contenido_texto IS NOT NULL AND nombre_archivo IS NULL AND tamanio_bytes IS NULL)
);
ALTER TABLE eventos_auditoria ADD CONSTRAINT ck_eventos_auditoria_json CHECK (
    (valores_anteriores IS NULL OR ISJSON(valores_anteriores) = 1)
    AND (valores_nuevos IS NULL OR ISJSON(valores_nuevos) = 1)
);
ALTER TABLE obligaciones_informe_final ADD CONSTRAINT ck_obligaciones_informe_final_fechas
    CHECK (vencimiento >= vencimiento_original OR prorroga_utilizada = 1);
ALTER TABLE obligaciones_informe_final ADD CONSTRAINT ck_obligaciones_informe_final_estado
    CHECK (estado IN (N'PENDIENTE', N'PRESENTADO', N'DEVUELTO', N'APROBADO'));
ALTER TABLE obligaciones_informe_final ADD CONSTRAINT ck_obligaciones_informe_final_revision CHECK (
    (estado = N'APROBADO' AND informe_id IS NOT NULL AND fecha_aprobacion IS NOT NULL AND aprobado_por_usuario_id IS NOT NULL)
    OR (estado = N'DEVUELTO' AND motivo_devolucion IS NOT NULL AND LEN(LTRIM(RTRIM(motivo_devolucion))) > 0 AND fecha_devolucion IS NOT NULL AND devuelto_por_usuario_id IS NOT NULL)
    OR estado IN (N'PENDIENTE', N'PRESENTADO')
);
CREATE UNIQUE INDEX uq_obligaciones_informe_final_actual
    ON obligaciones_informe_final(vuelo_id) WHERE es_actual = 1;
CREATE INDEX ix_obligaciones_informe_final_comandante_vencimiento
    ON obligaciones_informe_final(comandante_usuario_id, estado, vencimiento) WHERE es_actual = 1;

GO
CREATE TRIGGER trg_vuelos_validar_ciclo_vida
ON vuelos
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1 FROM inserted i
        INNER JOIN estados_vuelo estado_actual ON estado_actual.id = i.estado_id
        LEFT JOIN deleted d ON d.id = i.id
        LEFT JOIN estados_vuelo estado_anterior ON estado_anterior.id = d.estado_id
        WHERE (estado_actual.codigo = N'CANCELADO' AND
               (i.fecha_cancelacion IS NULL OR i.cancelado_por_usuario_id IS NULL OR NULLIF(LTRIM(RTRIM(i.motivo_cancelacion)), N'') IS NULL))
           OR (estado_actual.codigo <> N'CANCELADO' AND
               (i.fecha_cancelacion IS NOT NULL OR i.cancelado_por_usuario_id IS NOT NULL OR i.motivo_cancelacion IS NOT NULL))
           OR (estado_actual.codigo = N'CANCELADO' AND estado_anterior.codigo IN (N'EN_CURSO', N'FINALIZADO', N'COMPLETADO'))
    )
    BEGIN
        THROW 51000, 'La cancelacion debe ser previa a la ejecucion y contener fecha, actor y motivo.', 1;
    END
END;
GO
