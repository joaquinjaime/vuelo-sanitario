-- Los IDs de los catálogos son técnicos; el código es la referencia estable.
INSERT INTO roles(codigo,nombre,activo,fecha_creacion) VALUES
 (N'DTS',N'Dirección de Tránsito Sanitario',1,SYSDATETIME()),
 (N'OPERACIONES',N'Centro de Operaciones',1,SYSDATETIME()),
 (N'CENTRO_OPERACIONES',N'Centro de Operaciones',1,SYSDATETIME()),
 (N'COMANDANTE',N'Comandante de Vuelo',1,SYSDATETIME()),
 (N'ADMINISTRADOR',N'Administrador',1,SYSDATETIME());
INSERT INTO roles_tripulacion(codigo,nombre) VALUES (N'COMANDANTE',N'Comandante'),(N'COPILOTO',N'Copiloto'),(N'MEDICO',N'Médico'),(N'ENFERMERO',N'Enfermero/a');
INSERT INTO estados_vuelo(codigo,nombre,orden) VALUES
 (N'PENDIENTE_CONFIRMACION_COMANDANTE',N'Pendiente de confirmación del comandante',1),(N'PENDIENTE_RESPUESTA_OPERACIONES',N'Pendiente de respuesta de Operaciones',2),(N'PLANIFICADO',N'Planificado',3),(N'EN_CURSO',N'En curso',4),(N'FINALIZADO',N'Finalizado',5),(N'COMPLETADO',N'Completado',6),(N'CANCELADO',N'Cancelado',7);
INSERT INTO prioridades_vuelo(codigo,nombre,orden,activo) VALUES (N'BAJA',N'Baja',1,1),(N'MEDIA',N'Media',2,1),(N'ALTA',N'Alta',3,1),(N'CRITICA',N'Crítica',4,1);
INSERT INTO tipos_documento(codigo,nombre) VALUES (N'AUTORIZACION',N'Autorización de vuelo'),(N'PARTE_MEDICO',N'Parte médico'),(N'PLAN_DE_VUELO',N'Plan de vuelo'),(N'OTRO',N'Otro documento');
INSERT INTO tipos_vuelo(codigo,nombre,activo) VALUES (N'SANITARIO',N'Sanitario',1),(N'REGRESO_BASE',N'Regreso a base',1),(N'REPOSICIONAMIENTO',N'Reposicionamiento',1),(N'TRASLADO_OPERATIVO',N'Traslado operativo',1),(N'ENTRENAMIENTO',N'Entrenamiento',1),(N'OTRO',N'Otro',1);
INSERT INTO estados_solicitud_sanitaria(codigo,nombre,orden) VALUES (N'SOLICITADO',N'Solicitado',1),(N'PENDIENTE_RESPUESTA_DTS',N'Pendiente de respuesta DTS',2),(N'APROBADO',N'Aprobado',3),(N'RECHAZADO',N'Rechazado',4);
INSERT INTO motivos_cancelacion(codigo,nombre,categoria,activo,orden) VALUES
 (N'INESTABILIDAD_HEMODINAMICA_EXTREMA',N'Inestabilidad hemodinámica extrema',N'CLINICO',1,1),(N'FALLECIMIENTO_PREVIO_TRASLADO',N'Fallecimiento previo al traslado',N'CLINICO',1,2),(N'SIN_CAMA_RECEPTORA_DESTINO',N'Falta de cama receptora en destino',N'CLINICO',1,3),(N'SIN_EQUIPO_MEDICO_A_BORDO',N'Falta de equipo médico a bordo',N'CLINICO',1,4),(N'EQUIPAMIENTO_BIOMEDICO_CRITICO',N'Equipamiento biomédico crítico',N'CLINICO',1,5),(N'CONSENTIMIENTO_REVOCADO',N'Consentimiento revocado',N'CLINICO',1,6),
 (N'SIN_AERONAVE_ASIGNADA',N'Falta de aeronave asignada',N'AERONAUTICO',1,7),(N'FALLA_TECNICA_NO_DIFERIBLE',N'Falla técnica no diferible',N'AERONAUTICO',1,8),(N'SIN_TRIPULACION_MANDO',N'Falta de tripulación de mando',N'AERONAUTICO',1,9),(N'LIMITE_SERVICIO_TRIPULACION',N'Límite de servicio de tripulación',N'AERONAUTICO',1,10),(N'LIMITE_PESO_AERONAVE',N'Límite de peso de aeronave',N'AERONAUTICO',1,11),
 (N'METEOROLOGIA_BAJO_MINIMOS',N'Meteorología bajo mínimos',N'METEOROLOGICO',1,12),(N'SIN_ALTERNATIVA_VIABLE',N'Sin alternativa viable',N'METEOROLOGICO',1,13),(N'METEOROLOGIA_SEVERA_RUTA',N'Meteorología severa en ruta',N'METEOROLOGICO',1,14),
 (N'AERODROMO_INOPERATIVO',N'Aeródromo inoperativo',N'OPERATIVO_INFRAESTRUCTURA',1,15),(N'HORARIO_AERODROMO_SUPERADO',N'Horario de aeródromo superado',N'OPERATIVO_INFRAESTRUCTURA',1,16),(N'SIN_COMBUSTIBLE_AERONAUTICO',N'Sin combustible aeronáutico',N'OPERATIVO_INFRAESTRUCTURA',1,17),(N'SIN_SERVICIOS_SSEI',N'Sin servicios SSEI',N'OPERATIVO_INFRAESTRUCTURA',1,18),(N'SIN_AMBULANCIA_CONEXION',N'Sin ambulancia de conexión',N'OPERATIVO_INFRAESTRUCTURA',1,19),
 (N'AUTORIZACIONES_RECHAZADAS_DEMORADAS',N'Autorizaciones rechazadas o demoradas',N'ADMINISTRATIVO_SEGURIDAD',1,20),(N'COBERTURA_FINANCIERA_SIN_AUTORIZAR',N'Cobertura financiera sin autorizar',N'ADMINISTRATIVO_SEGURIDAD',1,21),(N'RIESGO_SEGURIDAD_CONFLICTO',N'Riesgo de seguridad o conflicto',N'ADMINISTRATIVO_SEGURIDAD',1,22),(N'OTRO',N'Otro motivo',N'OTRO',1,23);
GO
