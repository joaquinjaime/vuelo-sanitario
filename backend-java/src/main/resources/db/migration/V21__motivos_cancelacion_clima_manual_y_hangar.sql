-- V21: catalogo de cancelaciones, clima manual y retiro del checklist de hangar.
-- Se preservan los datos existentes antes de retirar las columnas heredadas.
SET XACT_ABORT ON;
GO

CREATE TABLE motivos_cancelacion (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT pk_motivos_cancelacion PRIMARY KEY DEFAULT NEWID(),
    codigo NVARCHAR(80) NOT NULL CONSTRAINT uq_motivos_cancelacion_codigo UNIQUE,
    nombre NVARCHAR(200) NOT NULL,
    descripcion NVARCHAR(MAX) NULL,
    categoria NVARCHAR(40) NOT NULL,
    activo BIT NOT NULL CONSTRAINT df_motivos_cancelacion_activo DEFAULT 1,
    orden SMALLINT NOT NULL CONSTRAINT uq_motivos_cancelacion_orden UNIQUE
);
GO

INSERT INTO motivos_cancelacion (codigo, nombre, descripcion, categoria, orden) VALUES
(N'INESTABILIDAD_HEMODINAMICA_EXTREMA', N'Inestabilidad hemodinámica extrema', N'El paciente se descompensa severamente antes del despegue y no cumple con los criterios mínimos de estabilidad fisiológica para tolerar los cambios de altitud o presurización.', N'CLINICO', 1),
(N'FALLECIMIENTO_PREVIO_TRASLADO', N'Fallecimiento previo al traslado', N'El fallecimiento del paciente ocurre antes de abordar o completar la transferencia terrestre previa al vuelo.', N'CLINICO', 2),
(N'SIN_CAMA_RECEPTORA_DESTINO', N'Falta de cama receptora o cancelación en destino', N'La institución médica receptora informa que ya no dispone de cama, quirófano, terapia intensiva o especialista requerido.', N'CLINICO', 3),
(N'SIN_EQUIPO_MEDICO_A_BORDO', N'Falta de disponibilidad del equipo médico a bordo', N'Indisposición o falta de disponibilidad del médico aeroevacuador, enfermero u otro profesional requerido sin reemplazo disponible.', N'CLINICO', 4),
(N'EQUIPAMIENTO_BIOMEDICO_CRITICO', N'Falla o ausencia de equipamiento biomédico crítico', N'Falla o falta de equipamiento indispensable para realizar el traslado sanitario de manera segura.', N'CLINICO', 5),
(N'CONSENTIMIENTO_REVOCADO', N'Negativa o revocación del consentimiento', N'El paciente, tutor o representante legal revoca la autorización para realizar el traslado.', N'CLINICO', 6),
(N'SIN_AERONAVE_ASIGNADA', N'Falta de disponibilidad de aeronave asignada', N'No existen aeronaves aptas disponibles para realizar el traslado.', N'AERONAUTICO', 7),
(N'FALLA_TECNICA_NO_DIFERIBLE', N'Falla técnica o mecánica no diferible', N'Una falla detectada impide el despacho seguro de la aeronave.', N'AERONAUTICO', 8),
(N'SIN_TRIPULACION_MANDO', N'Falta de tripulación de mando', N'No existen pilotos habilitados o disponibles para realizar el vuelo.', N'AERONAUTICO', 9),
(N'LIMITE_SERVICIO_TRIPULACION', N'Vencimiento del tiempo máximo de servicio de la tripulación', N'La tripulación alcanzó su límite reglamentario de servicio o requiere descanso obligatorio.', N'AERONAUTICO', 10),
(N'LIMITE_PESO_AERONAVE', N'Superación de límites de peso de la aeronave', N'La configuración de combustible, equipamiento, paciente, acompañantes o carga supera los límites operativos correspondientes.', N'AERONAUTICO', 11),
(N'METEOROLOGIA_BAJO_MINIMOS', N'Meteorología bajo mínimos', N'Las condiciones meteorológicas en salida o destino no permiten realizar la operación de manera segura.', N'METEOROLOGICO', 12),
(N'SIN_ALTERNATIVA_VIABLE', N'Falta de aeródromo de alternativa viable', N'No existe un aeródromo alternativo que cumpla las condiciones necesarias para la operación.', N'METEOROLOGICO', 13),
(N'METEOROLOGIA_SEVERA_RUTA', N'Condiciones meteorológicas severas en ruta', N'Existen fenómenos meteorológicos en ruta que no pueden evitarse de manera segura.', N'METEOROLOGICO', 14),
(N'AERODROMO_INOPERATIVO', N'Cierre o inoperatividad del aeródromo o helipuerto', N'La infraestructura necesaria se encuentra cerrada, inhabilitada o fuera de servicio.', N'OPERATIVO_INFRAESTRUCTURA', 15),
(N'HORARIO_AERODROMO_SUPERADO', N'Horario de operación del aeródromo superado', N'El aeródromo no se encuentra disponible dentro del horario requerido para realizar la operación.', N'OPERATIVO_INFRAESTRUCTURA', 16),
(N'SIN_COMBUSTIBLE_AERONAUTICO', N'Falta de combustible aeronáutico', N'No existe disponibilidad del combustible requerido para completar la operación.', N'OPERATIVO_INFRAESTRUCTURA', 17),
(N'SIN_SERVICIOS_SSEI', N'Falta de servicios de salvamento y extinción de incendios', N'La categoría o disponibilidad del servicio requerido es insuficiente para la operación.', N'OPERATIVO_INFRAESTRUCTURA', 18),
(N'SIN_AMBULANCIA_CONEXION', N'Falta de ambulancia terrestre de conexión', N'No existe disponibilidad de transporte sanitario terrestre necesario para conectar hospital y aeropuerto.', N'OPERATIVO_INFRAESTRUCTURA', 19),
(N'AUTORIZACIONES_RECHAZADAS_DEMORADAS', N'Rechazo o demora de autorizaciones de sobrevuelo o aterrizaje', N'No se obtuvieron dentro del tiempo necesario los permisos requeridos para realizar la operación.', N'ADMINISTRATIVO_SEGURIDAD', 20),
(N'COBERTURA_FINANCIERA_SIN_AUTORIZAR', N'Problemas de cobertura financiera o autorización', N'No se obtuvo la autorización administrativa, financiera, de obra social, prepaga, aseguradora u organismo correspondiente.', N'ADMINISTRATIVO_SEGURIDAD', 21),
(N'RIESGO_SEGURIDAD_CONFLICTO', N'Riesgos de seguridad operacional o conflicto', N'Existen restricciones de seguridad, orden público, espacio aéreo o condiciones externas que impiden realizar la operación de manera segura.', N'ADMINISTRATIVO_SEGURIDAD', 22),
(N'OTRO', N'Otro motivo', N'Motivo de cancelación no contemplado dentro del catálogo.', N'OTRO', 23);
GO

ALTER TABLE vuelos ADD motivo_cancelacion_id UNIQUEIDENTIFIER NULL, motivo_cancelacion_personalizado NVARCHAR(MAX) NULL;
GO

-- Sólo se migra a un motivo concreto cuando coincide exactamente con el nombre del catálogo.
UPDATE vuelos SET motivo_cancelacion_id = (
    SELECT m.id FROM motivos_cancelacion m
    WHERE LTRIM(RTRIM(vuelos.motivo_cancelacion)) = m.nombre
)
WHERE NULLIF(LTRIM(RTRIM(motivo_cancelacion)), N'') IS NOT NULL;
UPDATE vuelos SET motivo_cancelacion_id = (SELECT id FROM motivos_cancelacion WHERE codigo = N'OTRO'),
             motivo_cancelacion_personalizado = motivo_cancelacion
WHERE NULLIF(LTRIM(RTRIM(motivo_cancelacion)), N'') IS NOT NULL AND motivo_cancelacion_id IS NULL;
GO

ALTER TABLE vuelos ADD CONSTRAINT fk_vuelos_motivo_cancelacion FOREIGN KEY (motivo_cancelacion_id) REFERENCES motivos_cancelacion(id);
CREATE INDEX ix_vuelos_motivo_cancelacion ON vuelos(motivo_cancelacion_id) WHERE motivo_cancelacion_id IS NOT NULL;
GO

DROP TRIGGER IF EXISTS dbo.trg_vuelos_validar_ciclo_vida;
GO
CREATE TRIGGER trg_vuelos_validar_ciclo_vida ON vuelos AFTER INSERT, UPDATE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1 FROM inserted i
        INNER JOIN estados_vuelo estado_actual ON estado_actual.id = i.estado_id
        LEFT JOIN deleted d ON d.id = i.id
        LEFT JOIN estados_vuelo estado_anterior ON estado_anterior.id = d.estado_id
        LEFT JOIN motivos_cancelacion motivo ON motivo.id = i.motivo_cancelacion_id
        WHERE (estado_actual.codigo = N'CANCELADO' AND
              (i.fecha_cancelacion IS NULL OR i.cancelado_por_usuario_id IS NULL OR i.motivo_cancelacion_id IS NULL
               OR (motivo.codigo = N'OTRO' AND NULLIF(LTRIM(RTRIM(i.motivo_cancelacion_personalizado)), N'') IS NULL)
               OR (motivo.codigo <> N'OTRO' AND i.motivo_cancelacion_personalizado IS NOT NULL)))
           OR (estado_actual.codigo <> N'CANCELADO' AND
              (i.fecha_cancelacion IS NOT NULL OR i.cancelado_por_usuario_id IS NOT NULL OR i.motivo_cancelacion_id IS NOT NULL OR i.motivo_cancelacion_personalizado IS NOT NULL))
           OR (estado_actual.codigo = N'CANCELADO' AND estado_anterior.codigo IN (N'EN_CURSO', N'FINALIZADO', N'COMPLETADO'))
    ) THROW 51000, 'La cancelación debe ser previa a la ejecución, con actor y motivo válido.', 1;
END;
GO

-- Ya validada y copiada la totalidad de los valores históricos, se retira la columna libre.
ALTER TABLE vuelos DROP COLUMN motivo_cancelacion;
GO

-- El JSON/API histórico queda preservado como texto de condiciones para que no se descarte información.
DECLARE @clima_check sysname, @clima_sql nvarchar(max);
DECLARE clima_checks CURSOR LOCAL FAST_FORWARD FOR SELECT name FROM sys.check_constraints WHERE parent_object_id = OBJECT_ID(N'dbo.instantaneas_clima');
OPEN clima_checks; FETCH NEXT FROM clima_checks INTO @clima_check;
WHILE @@FETCH_STATUS = 0 BEGIN SET @clima_sql=N'ALTER TABLE dbo.instantaneas_clima DROP CONSTRAINT '+QUOTENAME(@clima_check); EXEC sp_executesql @clima_sql; FETCH NEXT FROM clima_checks INTO @clima_check; END
CLOSE clima_checks; DEALLOCATE clima_checks;
ALTER TABLE instantaneas_clima ADD condiciones NVARCHAR(MAX) NULL, favorable BIT NULL;
GO
UPDATE instantaneas_clima SET condiciones = COALESCE(JSON_VALUE(datos_clima, N'$.condiciones'), JSON_VALUE(datos_clima, N'$.descripcion'), datos_clima, observaciones), favorable = apto_para_volar;
EXEC sp_rename N'dbo.instantaneas_clima.consultado_por_usuario_id', N'registrado_por_usuario_id', N'COLUMN';
EXEC sp_rename N'dbo.instantaneas_clima.fecha_consulta', N'fecha_registro', N'COLUMN';
DECLARE @clima_default sysname, @clima_default_sql nvarchar(max);
DECLARE clima_defaults CURSOR LOCAL FAST_FORWARD FOR
SELECT dc.name FROM sys.default_constraints dc
INNER JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
WHERE dc.parent_object_id = OBJECT_ID(N'dbo.instantaneas_clima')
  AND c.name IN (N'fuente', N'proveedor_api', N'datos_clima', N'apto_para_volar');
OPEN clima_defaults; FETCH NEXT FROM clima_defaults INTO @clima_default;
WHILE @@FETCH_STATUS = 0 BEGIN SET @clima_default_sql=N'ALTER TABLE dbo.instantaneas_clima DROP CONSTRAINT '+QUOTENAME(@clima_default); EXEC sp_executesql @clima_default_sql; FETCH NEXT FROM clima_defaults INTO @clima_default; END
CLOSE clima_defaults; DEALLOCATE clima_defaults;
ALTER TABLE instantaneas_clima DROP COLUMN fuente, proveedor_api, datos_clima, apto_para_volar;
GO

-- El checklist no contenía valores persistidos; se elimina junto con su CHECK sintáctico.
DECLARE @hangar_check sysname, @hangar_sql nvarchar(max);
DECLARE hangar_checks CURSOR LOCAL FAST_FORWARD FOR SELECT name FROM sys.check_constraints WHERE parent_object_id = OBJECT_ID(N'dbo.informacion_hangar');
OPEN hangar_checks; FETCH NEXT FROM hangar_checks INTO @hangar_check;
WHILE @@FETCH_STATUS = 0 BEGIN SET @hangar_sql=N'ALTER TABLE dbo.informacion_hangar DROP CONSTRAINT '+QUOTENAME(@hangar_check); EXEC sp_executesql @hangar_sql; FETCH NEXT FROM hangar_checks INTO @hangar_check; END
CLOSE hangar_checks; DEALLOCATE hangar_checks;
ALTER TABLE informacion_hangar DROP COLUMN checklist_preparacion;
GO
