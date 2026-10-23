/* Verificaciones para seed-migration-v32-fixture.sql. Solo sobre la base descartable. */
SET NOCOUNT ON;
SET XACT_ABORT OFF;
IF DB_NAME() <> N'$(FixtureDatabase)'
    THROW 51110, 'Verificacion restringida a la base descartable de validacion de migraciones.', 1;

IF (SELECT MAX(TRY_CONVERT(int, version)) FROM dbo.flyway_schema_history WHERE success = 1) <> 47
    THROW 51111, 'Flyway no termino en V47.', 1;
IF EXISTS (SELECT 1 FROM dbo.flyway_schema_history WHERE success = 0)
    THROW 51112, 'Flyway contiene una migracion fallida.', 1;
IF (SELECT COUNT_BIG(*) FROM dbo.personas) <> 6 OR (SELECT COUNT_BIG(*) FROM dbo.usuarios) <> 5
 OR (SELECT COUNT_BIG(*) FROM dbo.vuelos) <> 3 OR (SELECT COUNT_BIG(*) FROM dbo.vuelos_sanitarios) <> 1
 OR (SELECT COUNT_BIG(*) FROM dbo.vuelos_tripulantes) <> 1 OR (SELECT COUNT_BIG(*) FROM dbo.negociaciones_horario_vuelo) <> 1
 OR (SELECT COUNT_BIG(*) FROM dbo.documentos_vuelo) <> 1 OR (SELECT COUNT_BIG(*) FROM dbo.versiones_documento_vuelo) <> 1
 OR (SELECT COUNT_BIG(*) FROM dbo.informes_finales_vuelo) <> 1 OR (SELECT COUNT_BIG(*) FROM dbo.obligaciones_informe_final) <> 1
 OR (SELECT COUNT_BIG(*) FROM dbo.eventos_auditoria) <> 2
    THROW 51113, 'Los conteos de filas sinteticas difieren del snapshot V32.', 1;

IF NOT EXISTS (
    SELECT 1 FROM dbo.vuelos_sanitarios s JOIN dbo.vuelos v ON v.id_vuelos=s.id_vuelos
    JOIN dbo.estados_solicitud_sanitaria e ON e.id_estados_solicitud_sanitaria=s.id_estados_solicitud_sanitaria
    WHERE v.codigo_vuelo=N'MIG-SAN-CANCEL-001' AND e.codigo_estado_solicitud=N'CANCELADO')
    THROW 51114, 'V44 no reconcilio la solicitud sanitaria con su vuelo cancelado.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.vuelos_tripulantes WHERE fecha_baja IS NULL)
    THROW 51115, 'V45 altero el estado vigente del fixture de tripulacion.', 1;
IF NOT EXISTS (
    SELECT 1 FROM dbo.usuarios WHERE nombre_usuario=N'mig_inactivo' AND esta_activo=0
      AND id_usuario_baja IS NOT NULL AND motivo_baja=N'Baja sintetica')
    THROW 51116, 'V47 no reconstruyo el responsable/motivo de baja respaldado por auditoria.', 1;
IF NOT EXISTS (
    SELECT 1 FROM dbo.informes_finales_vuelo WHERE resumen=N'Informe historico sintetico'
      AND estado_revision=N'HISTORICO_SIN_DECISION' AND origen_decision=N'HISTORICA_SIN_EVIDENCIA')
    THROW 51117, 'V43 no preservo la incertidumbre de la decision historica.', 1;
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE is_disabled=1 OR is_not_trusted=1)
    THROW 51118, 'Hay claves foraneas deshabilitadas o no confiables.', 1;
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE is_disabled=1 OR is_not_trusted=1)
    THROW 51119, 'Hay restricciones CHECK deshabilitadas o no confiables.', 1;

DECLARE @id BIGINT, @error INT, @vuelo BIGINT, @tripulante BIGINT, @rol BIGINT, @admin BIGINT;
SELECT @id=id_eventos_auditoria FROM dbo.eventos_auditoria WHERE tipo_entidad=N'USER' AND operacion=N'USUARIO_DESACTIVADO';
SET @error=0; BEGIN TRANSACTION;
BEGIN TRY
    UPDATE dbo.eventos_auditoria SET valores_nuevos=N'{"motivo":"alterado"}' WHERE id_eventos_auditoria=@id;
END TRY BEGIN CATCH
    SET @error=ERROR_NUMBER();
END CATCH;
IF XACT_STATE() <> 0 ROLLBACK;
IF @error <> 51046 THROW 51120, 'El trigger de auditoria no rechazo UPDATE (error 51046).', 1;

SET @error=0; BEGIN TRANSACTION;
BEGIN TRY
    DELETE dbo.eventos_auditoria WHERE id_eventos_auditoria=@id;
END TRY BEGIN CATCH
    SET @error=ERROR_NUMBER();
END CATCH;
IF XACT_STATE() <> 0 ROLLBACK;
IF @error <> 51046 THROW 51121, 'El trigger de auditoria no rechazo DELETE (error 51046).', 1;

SET @error=0; BEGIN TRANSACTION;
BEGIN TRY
    UPDATE dbo.vuelos_sanitarios SET id_estados_solicitud_sanitaria=(SELECT id_estados_solicitud_sanitaria FROM dbo.estados_solicitud_sanitaria WHERE codigo_estado_solicitud=N'SOLICITADO')
    WHERE id_vuelos=(SELECT id_vuelos FROM dbo.vuelos WHERE codigo_vuelo=N'MIG-SAN-CANCEL-001');
END TRY BEGIN CATCH
    SET @error=ERROR_NUMBER();
END CATCH;
IF XACT_STATE() <> 0 ROLLBACK;
IF @error <> 51045 THROW 51122, 'V44 no rechazo el cambio desde estado terminal.', 1;

BEGIN TRANSACTION;
SELECT TOP 1 @vuelo=id_vuelos,@tripulante=id_usuarios,@rol=id_roles_tripulacion FROM dbo.vuelos_tripulantes;
SELECT @admin=id_usuarios FROM dbo.usuarios WHERE nombre_usuario=N'mig_admin';
UPDATE dbo.vuelos_tripulantes SET fecha_baja=SYSUTCDATETIME(),id_usuario_baja=@admin,motivo_baja=N'RETIRO'
WHERE id_vuelos=@vuelo AND id_usuarios=@tripulante AND id_roles_tripulacion=@rol AND fecha_baja IS NULL;
INSERT dbo.vuelos_tripulantes (id_vuelos,id_usuarios,id_roles_tripulacion,id_usuario_asignador)
VALUES (@vuelo,@tripulante,@rol,@admin);
IF (SELECT COUNT(*) FROM dbo.vuelos_tripulantes WHERE id_vuelos=@vuelo AND id_usuarios=@tripulante) <> 2
BEGIN ROLLBACK; THROW 51123, 'El indice filtrado V45 no permite retener historial y una asignacion vigente.', 1; END;
ROLLBACK TRANSACTION;

SET @error=0; BEGIN TRANSACTION;
BEGIN TRY
    INSERT dbo.personas(nombre_persona,apellido_persona,dni) VALUES (N'Duplicado',N'Sintetico',N'200000001');
END TRY BEGIN CATCH
    SET @error=ERROR_NUMBER();
END CATCH;
IF XACT_STATE() <> 0 ROLLBACK;
IF @error NOT IN (2601,2627) THROW 51124, 'El indice unico V47 no rechazo DNI duplicado.', 1;

SET @error=0; BEGIN TRANSACTION;
BEGIN TRY
    INSERT dbo.personas(nombre_persona,apellido_persona,dni) VALUES (N'Usuario duplicado',N'Sintetico',N'299999999');
    INSERT dbo.usuarios(nombre_usuario,hash_contrasena,id_personas)
    SELECT N'mig_admin',N'synthetic-only',id_personas FROM dbo.personas WHERE dni=N'299999999';
END TRY BEGIN CATCH
    SET @error=ERROR_NUMBER();
END CATCH;
IF XACT_STATE() <> 0 ROLLBACK;
IF @error NOT IN (2601,2627) THROW 51125, 'El indice unico V47 no rechazo nombre de usuario duplicado.', 1;

DBCC CHECKCONSTRAINTS WITH ALL_CONSTRAINTS;
SELECT N'PASS: V32-V47, conteos e identidades sinteticos, V44/V43 backfill, integridad referencial, auditoria inmutable, asignacion V45 y unicidad V47' AS resultado;
