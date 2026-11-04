# Campos incompletos y llenado posterior (Parte 7)

[← Informe principal](../INFORME_COMPLETO_BASE_DATOS.md)

Se listan **todas las columnas que permiten NULL** (198 de 489). Clasificación: **D** opcional por diseño (131) · **E** pendiente de una etapa posterior (47) · **I** puede evidenciar información heredada o inconsistente (20). Las restantes columnas son NOT NULL y siempre reciben valor en el INSERT (a veces mediante DEFAULT).

**Cómo leerla:** «Valor al crear» es lo que contiene la columna inmediatamente después del INSERT; la última columna explica *por qué* puede estar vacía, *qué condición* la completa, *quién o qué proceso* lo hace y si algunos registros pueden permanecer vacíos para siempre.

| Tabla | Campo | Clase | Valor o momento inicial (al crear) | Por qué puede estar vacío · cuándo, quién o qué proceso lo completa |
|---|---|---|---|---|
| `personas` | `dni` | D (Opcional por diseño) | En el INSERT, si fue informado. | Opcional por diseño: un paciente puede ingresar sin DNI conocido y el administrador inicial no tiene. Si se desconoce, queda NULL hasta que un Administrador lo asigne por rectificación (`PUT /api/patients/{id}/dni` o `PUT /api/auth/users/{id}/dni`). |
| `personas` | `fecha_nacimiento` | D (Opcional por diseño) | En el INSERT, si fue informada. | Opcional: el alta de usuario no la exige y el DTS puede registrar un paciente sin ese dato. Se completa si un Administrador edita la persona; hay personas que permanecen sin ella legítimamente. |
| `usuarios` | `nombre_usuario` | E (Pendiente de una etapa posterior) | En la activación de la cuenta (UPDATE); en el bootstrap se inserta ya informado. | NULL mientras la cuenta está PENDIENTE_ACTIVACION: el titular todavía no eligió su usuario. Lo completa el propio titular al activar. Una cuenta desactivada conserva su usuario (no se libera). |
| `usuarios` | `hash_contrasena` | E (Pendiente de una etapa posterior) | En la activación (o en el bootstrap). | NULL mientras la cuenta no se activó. Lo completa la activación; no vuelve a NULL. |
| `usuarios` | `fecha_baja` | D (Opcional por diseño) | NULL al crear. | NULL mientras la cuenta nunca fue dada de baja o fue reactivada. Lo completa el Administrador al desactivar y lo vacía al reactivar. |
| `usuarios` | `id_usuario_baja` | D (Opcional por diseño) | NULL al crear. | NULL si la cuenta no está dada de baja. Lo completa el Administrador actuante al desactivar. |
| `usuarios` | `motivo_baja` | D (Opcional por diseño) | NULL al crear. | Opcional: el motivo puede omitirse (se normaliza a NULL si está en blanco). |
| `roles` | `descripcion_rol` | D (Opcional por diseño) | NULL. | Columna prevista pero sin uso: ninguna migración ni servicio la completa (hallazgo: campo nunca escrito). |
| `perfiles_comandante` | `numero_licencia_normalizada` | D (Opcional por diseño) | Se calcula con el INSERT. | Columna calculada: SQL Server la declara anulable por ser derivada, pero nunca queda vacía mientras `numero_licencia` tenga valor (que es NOT NULL). |
| `perfiles_comandante` | `id_provincias` | E (Pendiente de una etapa posterior) | NULL al crear el perfil. | Se desconoce al dar de alta. Lo completan Operaciones, el Administrador o, automáticamente, el primer vuelo finalizado. Un comandante puede permanecer sin ubicación (no será elegible para vuelos que la exijan). |
| `activaciones_cuenta` | `fecha_utilizacion` | E (Pendiente de una etapa posterior) | NULL al crear. | NULL mientras el código sigue abierto. Lo completa el titular (uso/venc./agotamiento) o el administrador (regeneración). No vuelve a NULL. *Nota:* el nombre sugiere «uso», pero también marca cierres sin uso. |
| `activaciones_cuenta` | `id_usuario_administrador_creador` | D (Opcional por diseño) | En el INSERT. | Opcional por diseño: sólo se completa cuando hay un actor humano; los registros migrados o automáticos podrían no tenerlo. |
| `correos_electronicos` | `fecha_baja` | D (Opcional por diseño) | NULL. | NULL mientras el contacto está vigente. Lo completa el titular al retirarlo (o la migración V49 para duplicados). |
| `correos_electronicos` | `id_usuario_baja` | D (Opcional por diseño) | NULL. | NULL si no está dado de baja o si la baja fue de migración. |
| `correos_electronicos` | `motivo_baja` | D (Opcional por diseño) | NULL. | NULL si el contacto está vigente. |
| `correos_electronicos` | `fecha_verificacion` | E (Pendiente de una etapa posterior) | NULL: todo correo nace sin verificar. | NULL = sin verificar. Lo completa el titular al ingresar el código correcto de 6 dígitos. Los correos preexistentes a V54 no se marcaron como verificados porque no había evidencia. |
| `telefonos` | `fecha_baja` | D (Opcional por diseño) | NULL. | NULL mientras el teléfono está vigente. |
| `telefonos` | `id_usuario_baja` | D (Opcional por diseño) | NULL. | NULL si vigente o baja de migración. |
| `telefonos` | `motivo_baja` | D (Opcional por diseño) | NULL. | NULL si vigente. |
| `telefonos` | `codigo_pais` | E (Pendiente de una etapa posterior) | En el INSERT de teléfonos nuevos. | NULL en los teléfonos anteriores a V54: se conservan tal cual y quedan «pendientes de validar» hasta que su titular los edite indicando el país. |
| `verificaciones_correo` | `fecha_envio` | E (Pendiente de una etapa posterior) | NULL. | NULL entre el INSERT y la respuesta del SMTP, o para siempre si el envío falló (en ese caso la fila se invalida con ENVIO_FALLIDO). |
| `verificaciones_correo` | `fecha_uso` | E (Pendiente de una etapa posterior) | NULL. | NULL mientras el código esté abierto o si se invalidó. |
| `verificaciones_correo` | `fecha_invalidacion` | E (Pendiente de una etapa posterior) | NULL. | NULL mientras el código esté abierto o si se usó. |
| `verificaciones_correo` | `motivo_invalidacion` | E (Pendiente de una etapa posterior) | NULL. | Sólo se completa cuando el código se invalida. |
| `vuelos` | `fecha_planificada_salida` | E (Pendiente de una etapa posterior) | NULL en un sanitario hasta que se fija el horario; en operativos, en el INSERT. | NULL en un sanitario hasta que Operaciones aprueba el horario (o el DTS acepta la contrapropuesta). Un sanitario rechazado o cancelado antes de aprobar puede permanecer sin fecha. |
| `vuelos` | `fecha_planificada_llegada` | E (Pendiente de una etapa posterior) | NULL en un sanitario hasta que el comandante planifica. | El comandante asignado la completa al guardar la planificación operativa; antes no puede iniciarse el vuelo. |
| `vuelos` | `fecha_salida_real` | E (Pendiente de una etapa posterior) | NULL. | NULL hasta el inicio; los vuelos cancelados o rechazados nunca la reciben. |
| `vuelos` | `fecha_llegada_real` | E (Pendiente de una etapa posterior) | NULL. | NULL hasta que Operaciones finaliza el vuelo. |
| `vuelos` | `fecha_cancelacion` | D (Opcional por diseño) | NULL. | NULL en todo vuelo no cancelado (la mayoría). La completa Operaciones (o el DTS sobre su solicitud o al rechazar una contrapropuesta). |
| `vuelos` | `motivo_cancelacion_personalizado` | D (Opcional por diseño) | NULL. | NULL salvo cancelaciones con motivo «OTRO». |
| `vuelos` | `id_aeronaves` | E (Pendiente de una etapa posterior) | NULL en un sanitario hasta asignar. | NULL hasta que Operaciones asigna recursos; un sanitario rechazado o cancelado sin asignar nunca la tiene. |
| `vuelos` | `id_usuario_comandante` | E (Pendiente de una etapa posterior) | NULL en un sanitario hasta asignar. | Se completa al asignar recursos. |
| `vuelos` | `id_aeropuerto_origen` | E (Pendiente de una etapa posterior) | NULL en un sanitario. | El comandante lo completa al guardar la planificación. |
| `vuelos` | `id_aeropuerto_destino` | E (Pendiente de una etapa posterior) | NULL en un sanitario. | Lo completa el comandante o Operaciones al planificar. |
| `vuelos` | `id_usuario_cancelador` | D (Opcional por diseño) | NULL. | NULL si el vuelo no fue cancelado. |
| `vuelos` | `id_motivos_cancelacion` | D (Opcional por diseño) | NULL. | NULL en vuelos no cancelados. |
| `vuelos` | `id_estados_vuelo` | E (Pendiente de una etapa posterior) | NULL en un sanitario recién solicitado; el estado inicial de un operativo es PENDIENTE_CONFIRMACION_COMANDANTE. | NULL mientras la solicitud sanitaria todavía no tiene recursos asignados (o fue rechazada). Lo completa «Asignar recursos» (PLANIFICADO) o la cancelación. |
| `vuelos_sanitarios` | `justificacion_extrema_urgencia` | D (Opcional por diseño) | En el INSERT, sólo si hay extrema urgencia. | NULL en toda solicitud que no es de extrema urgencia (lo habitual). |
| `vuelos_sanitarios` | `fecha_limite_traslado` | D (Opcional por diseño) | En el INSERT, sólo con urgencia. | NULL si no es extrema urgencia. |
| `vuelos_sanitarios` | `origen_solicitado_legacy` | I (Posible inconsistencia o dato heredado) | En la migración. | Columna heredada sin escritura por la aplicación; permanece NULL en solicitudes nuevas. Candidata a retirarse cuando se descarte el histórico. |
| `vuelos_sanitarios` | `destino_solicitado_legacy` | I (Posible inconsistencia o dato heredado) | En la migración. | Columna heredada sin escritura por la aplicación. |
| `vuelos_sanitarios` | `fecha_evaluacion` | E (Pendiente de una etapa posterior) | NULL. | NULL mientras Operaciones no respondió. Lo completa el operador que aprueba, contrapropone o rechaza. No se completa si el DTS cancela antes. |
| `vuelos_sanitarios` | `motivo_rechazo` | D (Opcional por diseño) | NULL. | NULL en toda solicitud no rechazada. |
| `vuelos_sanitarios` | `id_prioridades_vuelo` | D (Opcional por diseño) | En el INSERT. | Admite NULL por la historia (V5 la agregó como opcional), aunque el formulario actual siempre la informa. |
| `vuelos_sanitarios` | `id_localidad_origen` | D (Opcional por diseño) | En el INSERT. | Admite NULL por los datos migrados sin equivalencia oficial; el alta actual siempre la informa. |
| `vuelos_sanitarios` | `id_localidad_destino` | D (Opcional por diseño) | En el INSERT. | Idem origen. |
| `vuelos_sanitarios` | `id_usuario_evaluador` | E (Pendiente de una etapa posterior) | NULL. | NULL hasta la primera respuesta de Operaciones. |
| `informacion_medica_vuelo` | `diagnostico` | I (Posible inconsistencia o dato heredado) | En el INSERT. | La columna admite NULL pero el servicio lo exige: una carga manual en SQL podría dejarlo vacío. |
| `informacion_medica_vuelo` | `condicion_medica` | I (Posible inconsistencia o dato heredado) | En el INSERT. | Idem diagnóstico. |
| `informacion_medica_vuelo` | `observaciones_medicas` | D (Opcional por diseño) | En el INSERT. | Opcional por diseño; permanece NULL si el DTS no agrega observaciones. |
| `negociaciones_horario_vuelo` | `fecha_hora_propuesta` | D (Opcional por diseño) | En el INSERT. | NULL en tipos que no proponen horario (rechazos y aceptaciones de asignación). |
| `negociaciones_horario_vuelo` | `motivo_negociacion` | D (Opcional por diseño) | En el INSERT. | NULL en propuestas iniciales y aceptaciones. |
| `negociaciones_horario_vuelo` | `fecha_hora_llegada_propuesta` | D (Opcional por diseño) | En el INSERT. | NULL salvo COMANDANTE_PROPONE_HORARIO y CO_ACEPTA_PROPUESTA_COMANDANTE. |
| `negociaciones_horario_vuelo` | `id_usuario_actor` | D (Opcional por diseño) | En el INSERT. | Opcional en el esquema (V20 lo permitía por datos migrados); el código actual siempre lo informa. |
| `negociaciones_horario_vuelo` | `id_negociacion_respondida` | D (Opcional por diseño) | En el INSERT. | NULL en propuestas iniciales (DTS_PROPUESTA, COMANDANTE_PROPONE_HORARIO sin previa) y en aceptaciones de asignación. |
| `contactos_coordinacion_traslado` | `nombre_contacto` | D (Opcional por diseño) | En el INSERT. | NULL sólo si la relación es PACIENTE (se sabe quién es). |
| `contactos_coordinacion_traslado` | `observaciones_contacto` | D (Opcional por diseño) | En el INSERT. | Opcional. |
| `contactos_coordinacion_traslado` | `fecha_baja` | D (Opcional por diseño) | NULL. | NULL mientras el contacto está vigente. |
| `contactos_coordinacion_traslado` | `id_usuario_baja` | D (Opcional por diseño) | NULL. | NULL si vigente. |
| `contactos_coordinacion_traslado` | `motivo_baja` | D (Opcional por diseño) | NULL. | NULL si vigente. |
| `contactos_coordinacion_traslado` | `codigo_pais` | E (Pendiente de una etapa posterior) | En el INSERT. | NULL en contactos anteriores a V54 (conservados sin validar). |
| `vuelos_tripulantes` | `id_usuario_asignador` | D (Opcional por diseño) | En el INSERT. | Opcional en el esquema (V1); el código actual siempre lo informa. |
| `vuelos_tripulantes` | `fecha_baja` | D (Opcional por diseño) | NULL. | NULL mientras la asignación está vigente. |
| `vuelos_tripulantes` | `id_usuario_baja` | D (Opcional por diseño) | NULL. | NULL si vigente. |
| `vuelos_tripulantes` | `motivo_baja` | D (Opcional por diseño) | NULL. | NULL si vigente. |
| `instantaneas_clima` | `observaciones_clima` | D (Opcional por diseño) | En el INSERT. | Opcional; NULL si el comandante no agrega notas. |
| `instantaneas_clima` | `condiciones` | I (Posible inconsistencia o dato heredado) | En el INSERT. | Nullable en el esquema (V21 lo agregó como NULL para migrar datos); el servicio lo exige no vacío. |
| `instantaneas_clima` | `favorable` | I (Posible inconsistencia o dato heredado) | En el INSERT. | Nullable en el esquema; la API siempre lo informa. |
| `rutas_vuelo` | `altitud_pies` | D (Opcional por diseño) | En el INSERT. | Opcional: el comandante puede no informarla. |
| `rutas_vuelo` | `distancia_nm` | D (Opcional por diseño) | En el INSERT. | Opcional. |
| `rutas_vuelo` | `tiempo_estimado_minutos` | D (Opcional por diseño) | En el INSERT. | Opcional. |
| `rutas_vuelo` | `observaciones_ruta` | D (Opcional por diseño) | En el INSERT. | Opcional. |
| `rutas_vuelo` | `recorrido_planificado` | I (Posible inconsistencia o dato heredado) | En el INSERT. | La columna admite NULL (V37 la agregó sobre filas de V2) aunque el servicio lo exige. |
| `rutas_vuelo` | `id_aeropuerto_alternativo` | D (Opcional por diseño) | En el INSERT. | Opcional. |
| `rutas_vuelo` | `contexto_operativo` | I (Posible inconsistencia o dato heredado) | En el INSERT. | NULL en rutas anteriores a V37: se evalúan como «no registró las condiciones» y requieren revisión. |
| `rutas_vuelo` | `motivo_modificacion` | D (Opcional por diseño) | En el INSERT. | NULL en la primera versión o si la anterior no había sido presentada. |
| `rutas_vuelo` | `id_usuario_presenta` | E (Pendiente de una etapa posterior) | NULL. | NULL en BORRADOR; lo completa el comandante al presentar. |
| `rutas_vuelo` | `fecha_presentacion` | E (Pendiente de una etapa posterior) | NULL. | NULL en BORRADOR/SIN_REVISION. |
| `rutas_vuelo` | `id_usuario_revisor` | E (Pendiente de una etapa posterior) | NULL. | NULL mientras no hay decisión; se conserva al invalidar. |
| `rutas_vuelo` | `fecha_revision` | E (Pendiente de una etapa posterior) | NULL. | Idem. |
| `rutas_vuelo` | `observaciones_revision` | D (Opcional por diseño) | NULL. | Opcional en aprobaciones. |
| `rutas_vuelo` | `fecha_invalidacion` | E (Pendiente de una etapa posterior) | NULL. | NULL salvo REQUIERE_REVISION. |
| `rutas_vuelo` | `causa_invalidacion` | E (Pendiente de una etapa posterior) | NULL. | NULL salvo REQUIERE_REVISION. |
| `informacion_hangar` | `combustible_litros` | I (Posible inconsistencia o dato heredado) | NULL. | Columna sin escritura: nunca recibe valores desde la aplicación (hallazgo). |
| `informacion_hangar` | `observaciones_hangar` | D (Opcional por diseño) | En el INSERT. | Opcional. |
| `informacion_hangar` | `requiere_hangar` | I (Posible inconsistencia o dato heredado) | En el INSERT (V39 lo permite NULL). | NULL en versiones anteriores a V39: se interpretan «a revisar» (estado REQUIERE_REVISION). |
| `informacion_hangar` | `observaciones_comandante` | D (Opcional por diseño) | NULL. | NULL hasta que el comandante observe. |
| `informacion_hangar` | `id_aeronave_contexto` | D (Opcional por diseño) | En el INSERT. | NULL si el vuelo aún no tenía aeronave. |
| `informacion_hangar` | `id_origen_contexto` | D (Opcional por diseño) | En el INSERT. | NULL si no había origen planificado. |
| `informacion_hangar` | `id_comandante_contexto` | D (Opcional por diseño) | En el INSERT. | NULL si no había comandante. |
| `coordinaciones_aa2000` | `fecha_slot` | D (Opcional por diseño) | En el INSERT. | Opcional. |
| `coordinaciones_aa2000` | `contacto_aa2000` | D (Opcional por diseño) | En el INSERT. | NULL mientras no hubo comunicación. |
| `coordinaciones_aa2000` | `observaciones_coordinacion` | D (Opcional por diseño) | En el INSERT. | Opcional. |
| `coordinaciones_aa2000` | `id_aeropuerto_gestion` | I (Posible inconsistencia o dato heredado) | En el INSERT. | NULL en gestiones anteriores a V41 (históricos que no se asignan a un aeropuerto ficticio). |
| `coordinaciones_aa2000` | `finalidad_gestion` | I (Posible inconsistencia o dato heredado) | En el INSERT. | NULL en gestiones anteriores a V41. |
| `coordinaciones_aa2000` | `descripcion_gestion` | I (Posible inconsistencia o dato heredado) | En el INSERT. | NULL en gestiones anteriores a V41. |
| `coordinaciones_aa2000` | `canal_comunicacion` | E (Pendiente de una etapa posterior) | En el INSERT. | NULL hasta documentar la comunicación. |
| `coordinaciones_aa2000` | `fecha_comunicacion` | E (Pendiente de una etapa posterior) | En el INSERT. | NULL mientras no se comunicó. |
| `coordinaciones_aa2000` | `fecha_respuesta` | E (Pendiente de una etapa posterior) | En el INSERT. | NULL hasta que haya respuesta declarada. |
| `coordinaciones_aa2000` | `fuente_respuesta` | E (Pendiente de una etapa posterior) | En el INSERT. | NULL hasta que haya respuesta. |
| `coordinaciones_aa2000` | `referencia_externa` | D (Opcional por diseño) | En el INSERT. | Opcional. |
| `coordinaciones_aa2000` | `contexto_planificacion` | I (Posible inconsistencia o dato heredado) | En el INSERT. | NULL en versiones anteriores a V41 (se tratan como «requiere revisión»). |
| `coordinaciones_aa2000` | `motivo_cambio` | D (Opcional por diseño) | En la actualización. | NULL en la primera versión. |
| `bitacora_vuelos` | `valor_anterior` | I (Posible inconsistencia o dato heredado) | NULL. | Columna heredada sin escritura (hallazgo). |
| `bitacora_vuelos` | `valor_nuevo` | I (Posible inconsistencia o dato heredado) | NULL. | Columna heredada sin escritura. |
| `bitacora_vuelos` | `id_usuarios` | D (Opcional por diseño) | En el INSERT. | NULL sólo en filas históricas V1 (acciones del sistema). |
| `bitacora_vuelos` | `tipo_acontecimiento` | D (Opcional por diseño) | En el INSERT. | NULL en filas históricas V1. |
| `bitacora_vuelos` | `descripcion_operativa` | D (Opcional por diseño) | En el INSERT. | NULL en filas históricas V1. |
| `bitacora_vuelos` | `fecha_acontecimiento` | D (Opcional por diseño) | En el INSERT. | NULL en filas históricas V1. |
| `bitacora_vuelos` | `fecha_registro_operativo` | D (Opcional por diseño) | En el INSERT. | NULL en filas históricas. |
| `bitacora_vuelos` | `origen_acontecimiento` | D (Opcional por diseño) | En el INSERT. | NULL en filas históricas V1 (las únicas mutables). |
| `bitacora_vuelos` | `importancia` | D (Opcional por diseño) | En el INSERT. | NULL en filas históricas. |
| `bitacora_vuelos` | `id_entrada_corregida` | D (Opcional por diseño) | En el INSERT. | NULL salvo en correcciones. |
| `bitacora_vuelos` | `motivo_correccion` | D (Opcional por diseño) | En el INSERT. | NULL salvo en correcciones. |
| `informes_finales_vuelo` | `horas_vuelo` | D (Opcional por diseño) | En el INSERT. | Opcional: el comandante puede presentar sólo texto o PDF. |
| `informes_finales_vuelo` | `combustible_consumido_litros` | D (Opcional por diseño) | En el INSERT. | Opcional. |
| `informes_finales_vuelo` | `incidentes` | D (Opcional por diseño) | En el INSERT. | Opcional; NULL si no hubo. |
| `informes_finales_vuelo` | `resumen` | D (Opcional por diseño) | En el INSERT. | NULL si el informe es sólo PDF. |
| `informes_finales_vuelo` | `motivo_devolucion` | E (Pendiente de una etapa posterior) | NULL. | NULL salvo DEVUELTO. |
| `informes_finales_vuelo` | `fecha_revision` | E (Pendiente de una etapa posterior) | NULL. | NULL mientras está PRESENTADO. |
| `informes_finales_vuelo` | `id_usuario_revisor` | E (Pendiente de una etapa posterior) | NULL. | NULL mientras está PRESENTADO. |
| `informes_finales_vuelo` | `adjunto_nombre_original` | D (Opcional por diseño) | En el INSERT. | NULL si el informe no tiene PDF. |
| `informes_finales_vuelo` | `adjunto_ubicacion` | D (Opcional por diseño) | En el INSERT. | NULL si no hay PDF. |
| `informes_finales_vuelo` | `adjunto_tamanio_bytes` | D (Opcional por diseño) | En el INSERT. | NULL si no hay PDF. |
| `informes_finales_vuelo` | `adjunto_sha256` | D (Opcional por diseño) | En el INSERT. | NULL si no hay PDF. |
| `obligaciones_informe_final` | `fecha_prorroga` | D (Opcional por diseño) | NULL. | NULL si no se pidió prórroga. |
| `obligaciones_informe_final` | `fecha_presentacion` | E (Pendiente de una etapa posterior) | NULL. | NULL hasta la primera presentación. |
| `obligaciones_informe_final` | `fecha_devolucion` | E (Pendiente de una etapa posterior) | NULL. | NULL salvo si fue devuelta. |
| `obligaciones_informe_final` | `motivo_devolucion` | E (Pendiente de una etapa posterior) | NULL. | NULL salvo si fue devuelta. |
| `obligaciones_informe_final` | `fecha_aprobacion` | E (Pendiente de una etapa posterior) | NULL. | NULL hasta la aprobación. |
| `obligaciones_informe_final` | `id_informes_finales_vuelo` | E (Pendiente de una etapa posterior) | NULL. | NULL hasta que el comandante presenta. |
| `obligaciones_informe_final` | `id_usuario_devolvedor` | E (Pendiente de una etapa posterior) | NULL. | NULL salvo devolución. |
| `obligaciones_informe_final` | `id_usuario_aprobador` | E (Pendiente de una etapa posterior) | NULL. | NULL hasta la aprobación. |
| `obligaciones_informe_final` | `id_usuario_finalizador` | I (Posible inconsistencia o dato heredado) | En el INSERT. | NULL en obligaciones anteriores a V43 (se avisa a todo Operaciones). |
| `documentos_vuelo` | `fecha_baja` | D (Opcional por diseño) | NULL. | NULL mientras está activo. |
| `documentos_vuelo` | `id_usuario_baja` | D (Opcional por diseño) | NULL. | NULL mientras está activo. |
| `documentos_vuelo` | `motivo_baja` | D (Opcional por diseño) | NULL. | NULL mientras está activo. |
| `notificaciones` | `id_vuelos` | D (Opcional por diseño) | En el INSERT. | NULL en avisos no ligados a un vuelo (p. ej. vencimientos de habilitaciones). |
| `notificaciones` | `clave_evento` | D (Opcional por diseño) | En el INSERT. | NULL en las notificaciones creadas con `create` (sin deduplicación). |
| `eventos_auditoria` | `valores_anteriores` | D (Opcional por diseño) | En el INSERT. | NULL en creaciones. |
| `eventos_auditoria` | `valores_nuevos` | D (Opcional por diseño) | En el INSERT. | NULL en consultas o eliminaciones sin dato nuevo. |
| `eventos_auditoria` | `id_vuelos` | D (Opcional por diseño) | En el INSERT. | NULL en eventos no ligados a un vuelo (usuarios, aeronaves, habilitaciones…). |
| `eventos_auditoria` | `id_usuario_actor` | D (Opcional por diseño) | En el INSERT. | NULL en procesos automáticos (p. ej. barridos de vencimiento) o acciones sin sesión (activación). |
| `eventos_auditoria` | `entidad_id` | D (Opcional por diseño) | En el INSERT. | NULL en operaciones sin objeto único (p. ej. VIEW de listas). |
| `aeronaves` | `equipamiento_medico` | D (Opcional por diseño) | En el INSERT. | Opcional: aeronaves sin equipamiento. |
| `aeronaves` | `id_aeropuertos` | D (Opcional por diseño) | En el INSERT. | Admite NULL por historia (V18 agregó la columna), pero el alta actual la exige y la aeronave sin ubicación no se puede reactivar. |
| `aeropuertos` | `codigo_oaci` | D (Opcional por diseño) | En el INSERT. | Opcional: muchos aeródromos no tienen código OACI. |
| `aeropuertos` | `codigo_iata` | D (Opcional por diseño) | En el INSERT. | Opcional. |
| `aeropuertos` | `ciudad` | D (Opcional por diseño) | En el INSERT. | Opcional; coexiste con la localidad oficial. |
| `aeropuertos` | `provincia` | D (Opcional por diseño) | En el INSERT. | Duplica `id_provincias`. |
| `aeropuertos` | `latitud` | D (Opcional por diseño) | En el INSERT. | Opcional. |
| `aeropuertos` | `longitud` | D (Opcional por diseño) | En el INSERT. | Opcional. |
| `aeropuertos` | `codigo_oficial` | D (Opcional por diseño) | En el INSERT. | NULL en altas por el endpoint heredado. |
| `aeropuertos` | `tipo_aeropuerto` | D (Opcional por diseño) | En el INSERT. | Opcional. |
| `aeropuertos` | `id_provincias` | D (Opcional por diseño) | En el INSERT. | NULL en aeródromos sin provincia resoluble o altas heredadas. |
| `aeropuertos` | `id_localidades` | D (Opcional por diseño) | En el INSERT. | NULL cuando el nombre de ciudad no identifica una única localidad (se conserva para intervención administrativa, V20). |
| `motivos_cancelacion` | `descripcion_motivo_cancelacion` | D (Opcional por diseño) | En el INSERT. | Opcional; en las filas actuales está informada. |
| `clasificaciones_tripulacion` | `fecha_baja` | D (Opcional por diseño) | NULL. | NULL mientras está vigente. |
| `clasificaciones_tripulacion` | `id_usuario_baja` | D (Opcional por diseño) | NULL. | NULL si vigente. |
| `clasificaciones_tripulacion` | `motivo_baja` | D (Opcional por diseño) | NULL. | NULL si vigente. |
| `habilitaciones_profesionales` | `fecha_emision` | D (Opcional por diseño) | En el INSERT. | Opcional. |
| `habilitaciones_profesionales` | `fecha_vencimiento` | D (Opcional por diseño) | En el INSERT. | NULL si la credencial no vence (entonces `vencimiento_no_aplica`=1). Para verificar debe haber vencimiento o «no aplica». |
| `habilitaciones_profesionales` | `fecha_verificacion` | E (Pendiente de una etapa posterior) | NULL. | NULL mientras esté PENDIENTE sin decisión. |
| `habilitaciones_profesionales` | `id_usuario_verificador` | E (Pendiente de una etapa posterior) | NULL. | NULL mientras esté PENDIENTE. |
| `habilitaciones_profesionales` | `observaciones` | D (Opcional por diseño) | En el INSERT. | Opcional. |
| `habilitaciones_profesionales` | `categoria_aeronave` | D (Opcional por diseño) | En el INSERT. | Opcional. |
| `habilitaciones_profesionales` | `id_provincias_jurisdiccion` | D (Opcional por diseño) | En el INSERT. | Opcional (sólo si la política lo exige). |
| `habilitaciones_profesionales` | `restricciones` | D (Opcional por diseño) | En el INSERT. | Opcional. |
| `habilitaciones_profesionales` | `id_habilitacion_renovada` | D (Opcional por diseño) | En el INSERT de la renovación. | NULL en habilitaciones que no son renovación. |
| `documentos_habilitacion` | `hash_sha256` | I (Posible inconsistencia o dato heredado) | En el INSERT. | NULL en documentos heredados no regularizados: sin huella no se prueba integridad. |
| `documentos_habilitacion` | `tamano_bytes` | I (Posible inconsistencia o dato heredado) | En el INSERT. | NULL en documentos heredados no regularizados. |
| `documentos_habilitacion` | `id_documento_reemplazado` | D (Opcional por diseño) | En el INSERT. | NULL si no reemplaza a otro. |
| `documentos_habilitacion` | `fecha_analisis` | E (Pendiente de una etapa posterior) | NULL. | NULL mientras esté en cuarentena sin analizar. |
| `documentos_habilitacion` | `motor_analisis` | E (Pendiente de una etapa posterior) | NULL. | NULL hasta el primer análisis. |
| `documentos_habilitacion` | `detalle_analisis` | E (Pendiente de una etapa posterior) | NULL. | NULL hasta que exista detalle. |
| `documentos_habilitacion` | `fecha_baja` | D (Opcional por diseño) | NULL. | NULL mientras esté activo. |
| `documentos_habilitacion` | `id_usuario_baja` | D (Opcional por diseño) | NULL. | NULL si activo. |
| `documentos_habilitacion` | `motivo_baja` | D (Opcional por diseño) | NULL. | NULL si activo. |
| `documentos_habilitacion` | `motivo_bloqueo` | D (Opcional por diseño) | NULL. | NULL si no está bloqueado. |
| `documentos_habilitacion` | `hash_momento` | I (Posible inconsistencia o dato heredado) | CARGA al subir. | NULL si no hay huella. |
| `documentos_habilitacion` | `fecha_regularizacion` | D (Opcional por diseño) | NULL. | NULL salvo documentos heredados regularizados. |
| `documentos_habilitacion` | `id_usuario_regularizacion` | D (Opcional por diseño) | NULL. | Idem. |
| `decisiones_habilitacion` | `motivo` | D (Opcional por diseño) | En el INSERT. | Opcional. |
| `decisiones_habilitacion` | `id_documentos_habilitacion` | D (Opcional por diseño) | En el INSERT. | NULL en decisiones sin documento. |
| `consultas_externas_habilitacion` | `observaciones` | D (Opcional por diseño) | En el INSERT. | Opcional. |
| `consultas_externas_habilitacion` | `id_documentos_habilitacion` | D (Opcional por diseño) | En el INSERT. | Opcional. |
| `politicas_habilitacion` | `id_tipos_vuelo` | D (Opcional por diseño) | En el INSERT. | NULL = cualquier tipo de vuelo. |
| `politicas_habilitacion` | `categoria_aeronave` | D (Opcional por diseño) | En el INSERT. | NULL = cualquier categoría. |
| `politicas_habilitacion` | `fuente_referencia` | D (Opcional por diseño) | En el INSERT. | NULL en configuración interna. |
| `politicas_habilitacion` | `observaciones` | D (Opcional por diseño) | En el INSERT. | Opcional. |
| `politicas_habilitacion` | `id_usuario_baja` | D (Opcional por diseño) | NULL. | NULL mientras esté activa. |
| `politicas_habilitacion` | `fecha_baja` | D (Opcional por diseño) | NULL. | NULL mientras esté activa. |
| `politicas_habilitacion` | `motivo_baja` | D (Opcional por diseño) | NULL. | NULL mientras esté activa. |
| `politicas_habilitacion` | `referencia_aprobacion` | D (Opcional por diseño) | NULL. | NULL en altas individuales. |
| `politicas_habilitacion` | `lote_activacion` | D (Opcional por diseño) | NULL. | NULL en altas individuales. |
| `flyway_schema_history` | `version` | D (Opcional por diseño) | Al insertar. | NULL sólo en migraciones repetibles (no existen en este proyecto). |
| `flyway_schema_history` | `description` | D (Opcional por diseño) | Al insertar. | Flyway admite NULL; todas las filas del proyecto la tienen informada (se deriva del nombre del script). |
| `flyway_schema_history` | `checksum` | D (Opcional por diseño) | Al insertar. | NULL sólo en baseline/repetibles. |
