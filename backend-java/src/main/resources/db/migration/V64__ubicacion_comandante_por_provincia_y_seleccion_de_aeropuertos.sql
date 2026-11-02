-- V64: corrección geográfica de la asignación de comandantes y selección de aeropuertos.
-- V63 registraba la ubicación operativa del comandante por localidad y exigía que coincidiera con la localidad del paciente. Ambas ideas eran erróneas:
--  * la ubicación operativa del comandante es sólo la provincia o la Ciudad Autónoma de Buenos Aires (jurisdicción), nunca una localidad;
--  * la localidad del paciente (necesidad sanitaria, vuelos_sanitarios.id_localidad_origen/destino) no es el aeropuerto del que despega la aeronave
--    (ejecución aeronáutica, vuelos.id_aeropuerto_origen/destino): la elegibilidad geográfica depende de la provincia del aeropuerto de salida.
-- No se borra ningún usuario, comandante ni vuelo. La localidad que algún comandante tenía registrada se conserva en la auditoría (eventos_auditoria)
-- antes de retirarla del modelo operativo; su provincia (id_provincias) ya coincidía con la de esa localidad y sigue siendo la ubicación vigente.

-- 1. Ubicación del comandante: sólo provincia/CABA (+ fecha y responsable de la última actualización).
INSERT INTO dbo.eventos_auditoria (tipo_entidad, operacion, valores_anteriores, valores_nuevos, fecha_ocurrencia, id_vuelos, id_usuario_actor, entidad_id)
SELECT N'COMMANDER_PROFILE', N'COMMANDER_LOCATION_UPDATE',
    (SELECT pc.id_provincias AS provinciaActualId, pr.nombre_provincia AS provinciaActual, l.id_localidades AS localidadActualId, l.nombre_localidad AS localidadActual FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER),
    (SELECT pc.id_provincias AS provinciaActualId, pr.nombre_provincia AS provinciaActual, CAST(NULL AS BIGINT) AS localidadActualId, CAST(NULL AS NVARCHAR(10)) AS localidadActual,
            N'V64: la ubicación operativa del comandante se registra sólo por provincia o CABA; se retira la localidad' AS motivo FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER),
    SYSUTCDATETIME(), NULL, NULL, pc.id_personas
FROM dbo.perfiles_comandante pc
INNER JOIN dbo.localidades l ON l.id_localidades = pc.id_localidades_actual
INNER JOIN dbo.provincias pr ON pr.id_provincias = pc.id_provincias
WHERE pc.id_localidades_actual IS NOT NULL;
GO

DROP INDEX ix_perfiles_comandante_localidad_actual ON dbo.perfiles_comandante;
ALTER TABLE dbo.perfiles_comandante DROP CONSTRAINT ck_perfiles_comandante_ubicacion;
ALTER TABLE dbo.perfiles_comandante DROP CONSTRAINT fk_perfiles_comandante_localidad_provincia;
GO
ALTER TABLE dbo.perfiles_comandante DROP COLUMN id_localidades_actual;
GO
-- La fecha y el responsable de la actualización van juntos (un comandante sin ubicación registrada puede no tener ninguno: ubicación desconocida).
ALTER TABLE dbo.perfiles_comandante ADD CONSTRAINT ck_perfiles_comandante_ubicacion_responsable CHECK (
    (fecha_ubicacion_actual IS NULL AND id_usuario_ubicacion IS NULL) OR (fecha_ubicacion_actual IS NOT NULL AND id_usuario_ubicacion IS NOT NULL));
GO

-- 2. Excepciones geográficas: ahora se evalúan contra la provincia del aeropuerto de salida (no contra una localidad). Las filas existentes se conservan
--    como historial: su "localidad de salida" era la localidad del paciente y su provincia pasa a ser la provincia de salida de entonces.
ALTER TABLE dbo.excepciones_geograficas_comandante ADD
    id_aeropuerto_salida BIGINT NULL,
    id_provincia_salida BIGINT NULL;
GO
UPDATE e SET id_provincia_salida = l.id_provincias
FROM dbo.excepciones_geograficas_comandante e INNER JOIN dbo.localidades l ON l.id_localidades = e.id_localidad_salida;
GO
ALTER TABLE dbo.excepciones_geograficas_comandante ALTER COLUMN id_localidad_salida BIGINT NULL;
ALTER TABLE dbo.excepciones_geograficas_comandante ALTER COLUMN id_provincia_salida BIGINT NOT NULL;
ALTER TABLE dbo.excepciones_geograficas_comandante ADD CONSTRAINT fk_excepcion_geografica_aeropuerto_salida FOREIGN KEY (id_aeropuerto_salida) REFERENCES dbo.aeropuertos (id_aeropuertos);
ALTER TABLE dbo.excepciones_geograficas_comandante ADD CONSTRAINT fk_excepcion_geografica_provincia_salida FOREIGN KEY (id_provincia_salida) REFERENCES dbo.provincias (id_provincias);
ALTER TABLE dbo.excepciones_geograficas_comandante DROP CONSTRAINT ck_excepcion_geografica_tipo;
-- Los tipos de V63 por localidad se mantienen sólo para las filas históricas; las excepciones nuevas son UBICACION_DESCONOCIDA u OTRA_PROVINCIA.
ALTER TABLE dbo.excepciones_geograficas_comandante ADD CONSTRAINT ck_excepcion_geografica_tipo CHECK (tipo_excepcion IN
    (N'UBICACION_DESCONOCIDA', N'OTRA_PROVINCIA', N'UBICACION_INCOMPLETA', N'LOCALIDAD_DESHABILITADA', N'OTRA_LOCALIDAD'));
GO
CREATE INDEX ix_excepcion_geografica_aeropuerto ON dbo.excepciones_geograficas_comandante (id_aeropuerto_salida) WHERE id_aeropuerto_salida IS NOT NULL;
CREATE INDEX ix_excepcion_geografica_provincia ON dbo.excepciones_geograficas_comandante (id_provincia_salida);
GO

-- 3. Aeropuertos del vuelo: estado de la selección. vuelos.id_aeropuerto_origen/destino ya eran la ejecución aeronáutica (el paciente se registra en
--    vuelos_sanitarios); falta saber si el aeropuerto fue sólo PROPUESTO (por Centro de Operaciones o por una nueva propuesta que el comandante debe
--    revisar) o está CONFIRMADO, y quién y cuándo lo fijó. Los aeropuertos ya registrados hasta V63 fueron los definitivos del vuelo: quedan CONFIRMADOS.
ALTER TABLE dbo.vuelos ADD
    estado_aeropuerto_origen NVARCHAR(12) NULL,
    estado_aeropuerto_destino NVARCHAR(12) NULL,
    id_usuario_aeropuertos BIGINT NULL,
    fecha_aeropuertos DATETIME2(3) NULL;
GO
UPDATE dbo.vuelos SET estado_aeropuerto_origen = N'CONFIRMADO' WHERE id_aeropuerto_origen IS NOT NULL;
UPDATE dbo.vuelos SET estado_aeropuerto_destino = N'CONFIRMADO' WHERE id_aeropuerto_destino IS NOT NULL;
GO
ALTER TABLE dbo.vuelos ADD CONSTRAINT fk_vuelos_usuario_aeropuertos FOREIGN KEY (id_usuario_aeropuertos) REFERENCES dbo.usuarios (id_usuarios);
ALTER TABLE dbo.vuelos ADD CONSTRAINT ck_vuelos_estado_aeropuerto_origen CHECK (
    (id_aeropuerto_origen IS NULL AND estado_aeropuerto_origen IS NULL) OR (id_aeropuerto_origen IS NOT NULL AND estado_aeropuerto_origen IN (N'PROPUESTO', N'CONFIRMADO')));
ALTER TABLE dbo.vuelos ADD CONSTRAINT ck_vuelos_estado_aeropuerto_destino CHECK (
    (id_aeropuerto_destino IS NULL AND estado_aeropuerto_destino IS NULL) OR (id_aeropuerto_destino IS NOT NULL AND estado_aeropuerto_destino IN (N'PROPUESTO', N'CONFIRMADO')));
GO
CREATE INDEX ix_vuelos_usuario_aeropuertos ON dbo.vuelos (id_usuario_aeropuertos) WHERE id_usuario_aeropuertos IS NOT NULL;
GO

-- 4. Coordenadas aproximadas (centroide) de la localidad: se cargan en V65 desde el dataset local versionado (no se consulta ningún servicio externo)
--    y sólo sirven para ordenar aeropuertos por distancia en línea recta, que no equivale a distancia ni a tiempo de traslado terrestre.
ALTER TABLE dbo.localidades ADD latitud DECIMAL(9,6) NULL, longitud DECIMAL(9,6) NULL;
GO
