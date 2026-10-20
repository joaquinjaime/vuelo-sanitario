-- Los nombres físicos expresan el significado dentro de cada agregado sin
-- modificar las propiedades Java ni los contratos JSON públicos.
SET XACT_ABORT ON;

-- SQL Server impide renombrar una columna citada por un CHECK. Se preservan
-- todas las reglas y se recompilan contra el nombre físico definitivo.
CREATE TABLE #checks_v28 (tabla sysname NOT NULL, nombre sysname NOT NULL, definicion nvarchar(max) NOT NULL);
INSERT INTO #checks_v28(tabla,nombre,definicion)
SELECT t.name,cc.name,cc.definition
FROM sys.check_constraints cc JOIN sys.tables t ON t.object_id=cc.parent_object_id
WHERE t.schema_id=SCHEMA_ID(N'dbo');

DECLARE @tabla sysname,@nombre sysname,@sql nvarchar(max),@definicion nvarchar(max),@anterior sysname,@nuevo sysname;
DECLARE checks_a_eliminar CURSOR LOCAL STATIC READ_ONLY FOR SELECT tabla,nombre FROM #checks_v28;
OPEN checks_a_eliminar; FETCH NEXT FROM checks_a_eliminar INTO @tabla,@nombre;
WHILE @@FETCH_STATUS=0 BEGIN
  SET @sql=N'ALTER TABLE dbo.'+QUOTENAME(@tabla)+N' DROP CONSTRAINT '+QUOTENAME(@nombre);
  EXEC sp_executesql @sql;
  FETCH NEXT FROM checks_a_eliminar INTO @tabla,@nombre;
END
CLOSE checks_a_eliminar; DEALLOCATE checks_a_eliminar;
EXEC sp_rename N'dbo.aeronaves.activo', N'esta_activa', N'COLUMN';
EXEC sp_rename N'dbo.aeronaves.tipo', N'tipo_aeronave', N'COLUMN';
EXEC sp_rename N'dbo.aeropuertos.activo', N'esta_activo', N'COLUMN';
EXEC sp_rename N'dbo.aeropuertos.nombre', N'nombre_aeropuerto', N'COLUMN';
EXEC sp_rename N'dbo.aeropuertos.tipo', N'tipo_aeropuerto', N'COLUMN';
EXEC sp_rename N'dbo.coordinaciones_aa2000.observaciones', N'observaciones_coordinacion', N'COLUMN';
EXEC sp_rename N'dbo.correos_electronicos.tipo', N'tipo_correo_electronico', N'COLUMN';
EXEC sp_rename N'dbo.documentos_vuelo.activo', N'esta_activo', N'COLUMN';
EXEC sp_rename N'dbo.estados_solicitud_sanitaria.codigo', N'codigo_estado_solicitud', N'COLUMN';
EXEC sp_rename N'dbo.estados_solicitud_sanitaria.nombre', N'nombre_estado_solicitud', N'COLUMN';
EXEC sp_rename N'dbo.estados_vuelo.codigo', N'codigo_estado_vuelo', N'COLUMN';
EXEC sp_rename N'dbo.estados_vuelo.nombre', N'nombre_estado_vuelo', N'COLUMN';
EXEC sp_rename N'dbo.informacion_hangar.observaciones', N'observaciones_hangar', N'COLUMN';
EXEC sp_rename N'dbo.informacion_medica_vuelo.observaciones', N'observaciones_medicas', N'COLUMN';
EXEC sp_rename N'dbo.instantaneas_clima.observaciones', N'observaciones_clima', N'COLUMN';
EXEC sp_rename N'dbo.localidades.activo', N'esta_activa', N'COLUMN';
EXEC sp_rename N'dbo.localidades.nombre', N'nombre_localidad', N'COLUMN';
EXEC sp_rename N'dbo.motivos_cancelacion.activo', N'esta_activo', N'COLUMN';
EXEC sp_rename N'dbo.motivos_cancelacion.codigo', N'codigo_motivo_cancelacion', N'COLUMN';
EXEC sp_rename N'dbo.motivos_cancelacion.descripcion', N'descripcion_motivo_cancelacion', N'COLUMN';
EXEC sp_rename N'dbo.motivos_cancelacion.nombre', N'nombre_motivo_cancelacion', N'COLUMN';
EXEC sp_rename N'dbo.notificaciones.tipo', N'tipo_notificacion', N'COLUMN';
EXEC sp_rename N'dbo.obligaciones_informe_final.estado', N'estado_obligacion', N'COLUMN';
EXEC sp_rename N'dbo.personas.apellido', N'apellido_persona', N'COLUMN';
EXEC sp_rename N'dbo.personas.nombre', N'nombre_persona', N'COLUMN';
EXEC sp_rename N'dbo.prioridades_vuelo.activo', N'esta_activa', N'COLUMN';
EXEC sp_rename N'dbo.prioridades_vuelo.codigo', N'codigo_prioridad_vuelo', N'COLUMN';
EXEC sp_rename N'dbo.prioridades_vuelo.nombre', N'nombre_prioridad_vuelo', N'COLUMN';
EXEC sp_rename N'dbo.provincias.activo', N'esta_activa', N'COLUMN';
EXEC sp_rename N'dbo.provincias.nombre', N'nombre_provincia', N'COLUMN';
EXEC sp_rename N'dbo.roles.activo', N'esta_activo', N'COLUMN';
EXEC sp_rename N'dbo.roles.codigo', N'codigo_rol', N'COLUMN';
EXEC sp_rename N'dbo.roles.descripcion', N'descripcion_rol', N'COLUMN';
EXEC sp_rename N'dbo.roles.nombre', N'nombre_rol', N'COLUMN';
EXEC sp_rename N'dbo.roles_tripulacion.codigo', N'codigo_rol_tripulacion', N'COLUMN';
EXEC sp_rename N'dbo.roles_tripulacion.nombre', N'nombre_rol_tripulacion', N'COLUMN';
EXEC sp_rename N'dbo.rutas_vuelo.observaciones', N'observaciones_ruta', N'COLUMN';
EXEC sp_rename N'dbo.telefonos.tipo', N'tipo_telefono', N'COLUMN';
EXEC sp_rename N'dbo.tipos_documento.codigo', N'codigo_tipo_documento', N'COLUMN';
EXEC sp_rename N'dbo.tipos_documento.nombre', N'nombre_tipo_documento', N'COLUMN';
EXEC sp_rename N'dbo.tipos_vuelo.activo', N'esta_activo', N'COLUMN';
EXEC sp_rename N'dbo.tipos_vuelo.codigo', N'codigo_tipo_vuelo', N'COLUMN';
EXEC sp_rename N'dbo.tipos_vuelo.nombre', N'nombre_tipo_vuelo', N'COLUMN';
EXEC sp_rename N'dbo.usuarios.activo', N'esta_activo', N'COLUMN';
EXEC sp_rename N'dbo.vuelos.codigo', N'codigo_vuelo', N'COLUMN';

CREATE TABLE #renombres_v28 (tabla sysname NOT NULL, anterior sysname NOT NULL, nuevo sysname NOT NULL);
INSERT INTO #renombres_v28(tabla,anterior,nuevo) VALUES
(N'aeronaves',N'activo',N'esta_activa'),(N'aeronaves',N'tipo',N'tipo_aeronave'),
(N'aeropuertos',N'activo',N'esta_activo'),(N'aeropuertos',N'nombre',N'nombre_aeropuerto'),(N'aeropuertos',N'tipo',N'tipo_aeropuerto'),
(N'coordinaciones_aa2000',N'observaciones',N'observaciones_coordinacion'),(N'correos_electronicos',N'tipo',N'tipo_correo_electronico'),
(N'documentos_vuelo',N'activo',N'esta_activo'),(N'estados_solicitud_sanitaria',N'codigo',N'codigo_estado_solicitud'),(N'estados_solicitud_sanitaria',N'nombre',N'nombre_estado_solicitud'),
(N'estados_vuelo',N'codigo',N'codigo_estado_vuelo'),(N'estados_vuelo',N'nombre',N'nombre_estado_vuelo'),(N'informacion_hangar',N'observaciones',N'observaciones_hangar'),
(N'informacion_medica_vuelo',N'observaciones',N'observaciones_medicas'),(N'instantaneas_clima',N'observaciones',N'observaciones_clima'),
(N'localidades',N'activo',N'esta_activa'),(N'localidades',N'nombre',N'nombre_localidad'),(N'motivos_cancelacion',N'activo',N'esta_activo'),
(N'motivos_cancelacion',N'codigo',N'codigo_motivo_cancelacion'),(N'motivos_cancelacion',N'descripcion',N'descripcion_motivo_cancelacion'),(N'motivos_cancelacion',N'nombre',N'nombre_motivo_cancelacion'),
(N'notificaciones',N'tipo',N'tipo_notificacion'),(N'obligaciones_informe_final',N'estado',N'estado_obligacion'),(N'personas',N'apellido',N'apellido_persona'),
(N'personas',N'nombre',N'nombre_persona'),(N'prioridades_vuelo',N'activo',N'esta_activa'),(N'prioridades_vuelo',N'codigo',N'codigo_prioridad_vuelo'),
(N'prioridades_vuelo',N'nombre',N'nombre_prioridad_vuelo'),(N'provincias',N'activo',N'esta_activa'),(N'provincias',N'nombre',N'nombre_provincia'),
(N'roles',N'activo',N'esta_activo'),(N'roles',N'codigo',N'codigo_rol'),(N'roles',N'descripcion',N'descripcion_rol'),(N'roles',N'nombre',N'nombre_rol'),
(N'roles_tripulacion',N'codigo',N'codigo_rol_tripulacion'),(N'roles_tripulacion',N'nombre',N'nombre_rol_tripulacion'),(N'rutas_vuelo',N'observaciones',N'observaciones_ruta'),
(N'telefonos',N'tipo',N'tipo_telefono'),(N'tipos_documento',N'codigo',N'codigo_tipo_documento'),(N'tipos_documento',N'nombre',N'nombre_tipo_documento'),
(N'tipos_vuelo',N'activo',N'esta_activo'),(N'tipos_vuelo',N'codigo',N'codigo_tipo_vuelo'),(N'tipos_vuelo',N'nombre',N'nombre_tipo_vuelo'),
(N'usuarios',N'activo',N'esta_activo'),(N'vuelos',N'codigo',N'codigo_vuelo');

DECLARE checks_a_recrear CURSOR LOCAL STATIC READ_ONLY FOR SELECT tabla,nombre,definicion FROM #checks_v28;
OPEN checks_a_recrear; FETCH NEXT FROM checks_a_recrear INTO @tabla,@nombre,@definicion;
WHILE @@FETCH_STATUS=0 BEGIN
  DECLARE renombres_check CURSOR LOCAL STATIC READ_ONLY FOR SELECT anterior,nuevo FROM #renombres_v28 WHERE tabla=@tabla;
  OPEN renombres_check; FETCH NEXT FROM renombres_check INTO @anterior,@nuevo;
  WHILE @@FETCH_STATUS=0 BEGIN
    -- Las expresiones del catálogo delimitan los identificadores con [].
    -- Sustituir sólo esa forma evita alterar valores como N'ACTIVO'.
    SET @definicion=REPLACE(@definicion,N'['+@anterior+N']',N'['+@nuevo+N']');
    FETCH NEXT FROM renombres_check INTO @anterior,@nuevo;
  END
  CLOSE renombres_check; DEALLOCATE renombres_check;
  SET @sql=N'ALTER TABLE dbo.'+QUOTENAME(@tabla)+N' ADD CONSTRAINT '+QUOTENAME(@nombre)+N' CHECK '+@definicion;
  EXEC sp_executesql @sql;
  FETCH NEXT FROM checks_a_recrear INTO @tabla,@nombre,@definicion;
END
CLOSE checks_a_recrear; DEALLOCATE checks_a_recrear;

