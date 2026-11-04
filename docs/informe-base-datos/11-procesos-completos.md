
# Procesos completos del sistema, vistos desde la base de datos

Cada proceso sigue el orden **acción del usuario → solicitud al backend → validaciones → inserciones y actualizaciones → resultado**. Los nombres de tablas y campos son los reales. «T» indica una transacción (todo o nada).

## 1. Creación de usuarios por el Administrador

1. **Acción:** Administración → Usuarios → **Nuevo usuario** (formulario con nombre, apellido, DNI, nacimiento, roles, licencia, correos y teléfonos).
2. **Backend:** `POST /api/auth/users` → `AuthService.createPending` (T única).
3. **Validaciones:** rol ADMINISTRADOR; DNI sin cuenta previa (409 si hay cuenta activa o inactiva); si la persona existe sin cuenta, exige confirmación expresa (`personaExistenteId`) y nombres coincidentes; roles existentes; licencia obligatoria para COMANDANTE; al menos un correo y un teléfono con formato válido.
4. **Escrituras (T1):** `personas` (INSERT si es nueva) → `usuarios` (PENDIENTE_ACTIVACION; sin nombre de usuario ni contraseña) → `usuarios_roles` → `perfiles_comandante` (licencia, provincia NULL) → `correos_electronicos` y `telefonos` (el primero de cada uno es principal; correos sin verificar) → `activaciones_cuenta` (hash BCrypt del código, +10 min) → `eventos_auditoria` (USUARIO_CREADO).
5. **Resultado:** el administrador ve **una sola vez** el código de 6 dígitos y lo entrega al titular. Si cualquier paso falla no queda nada.

## 2. Verificación de correo y activación de cuenta

**2a. Activación (titular sin sesión).** Pantalla pública **Activar cuenta** (DNI + código + usuario + contraseña ≥ 12) → `POST /api/auth/activar-cuenta` → `AuthService.activate`: busca el código abierto del DNI; valida vigencia (10 min) y BCrypt; cuenta un intento fallido por error y cierra el código al 5.º (`activaciones_cuenta.intentos_fallidos`, `fecha_utilizacion`); si todo es correcto: UPDATE `usuarios` (`nombre_usuario`, `hash_contrasena`, `estado_cuenta`='ACTIVO'), UPDATE `activaciones_cuenta.fecha_utilizacion` y auditoría USUARIO_ACTIVADO. Los intentos fallidos se confirman aunque la operación responda 400 (`noRollbackFor`).

**2b. Verificación de un correo (titular autenticado).** Mi cuenta → Correos → solicitar verificación → `POST /api/auth/me/correos/{id}/verificacion` → `EmailVerificationService.issue`: (T3) valida límites (espera mínima, máximos por correo/usuario/origen en 24 h), invalida la verificación abierta anterior (UPDATE), inserta `verificaciones_correo` (HMAC del código, +10 min) y audita; **fuera de transacción** envía el correo por SMTP; (T4) marca `fecha_envio` o invalida con ENVIO_FALLIDO. Luego **Confirmar código** → `…/verificacion/confirmar`: compara el HMAC, cuenta intentos (máx. 5) y, si coincide, escribe `verificaciones_correo.fecha_uso` y `correos_electronicos.fecha_verificacion` en la misma transacción.

## 3. Modificación, desactivación y reactivación de usuarios

- **Modificar** (`PUT /api/auth/users/{id}`): bloquea la cuenta; sólo Administrador; no puede cambiar sus propios roles ni dejar al sistema sin administrador activo; no retira un rol con responsabilidades vigentes (vuelos, informes, solicitudes). Actualiza `personas` (nombre, apellido, nacimiento), borra y reinserta `usuarios_roles` si cambió el conjunto (y sube `usuarios.version_credenciales`), crea o actualiza `perfiles_comandante` y audita los cambios.
- **Desactivar** (`PATCH …/deactivate`): no a sí mismo, no al último administrador, no con responsabilidades operativas; UPDATE `usuarios` (`esta_activo`=0, `estado_cuenta`='DESACTIVADO', `fecha_baja`, `id_usuario_baja`, `motivo_baja`, `version_credenciales`+1); borra sus bloqueos documentales (`bloqueos_documento_vuelo`); audita.
- **Reactivar** (`PATCH …/reactivate`): reemplaza roles (DELETE+INSERT), genera una contraseña temporal (devuelta una vez), `debe_cambiar_contrasena`=1, limpia la baja; audita USUARIO_REACTIVADO y CONTRASENA_RESTABLECIDA.
- **Restablecer credenciales / regenerar código:** `hash_contrasena` y `version_credenciales`, o nuevo `activaciones_cuenta` para cuentas pendientes.

## 4. Creación de una solicitud de vuelo sanitario

**Acción:** DTS → «Nueva solicitud» → completa paciente, localidades, prioridad, motivo, fecha/hora, urgencia, datos médicos y contactos → **Crear solicitud**. **Backend:** `POST /api/flights` o `/with-patient` → `SanitaryRequestRegistrationService` (T única): primero valida los contactos; luego (si hace falta) `personas` + `pacientes`; luego `FlightService.create`: política de urgencia, diagnóstico y condición obligatorios, localidades distintas. **Escrituras:** `vuelos` (código «V-xxxxxxxx», tipo SANITARIO, sin estado) → `vuelos_sanitarios` (SOLICITADO) → `informacion_medica_vuelo` → `negociaciones_horario_vuelo` (DTS_PROPUESTA) → `contactos_coordinacion_traslado` (0–5) → `eventos_auditoria` (CREATE_SANITARY y, con paciente nuevo, PATIENT) → `notificaciones` a todo Operaciones. **Resultado:** la solicitud queda SOLICITADO y visible para Operaciones.

## 5. Revisión, aprobación o rechazo de solicitudes

Operaciones ve la solicitud (si es de extrema urgencia recibe además un aviso específico). **Aprobar** (`POST /api/flights/{id}/schedule/accept` o `/evaluation`): exige estado SOLICITADO y horario aún futuro; escribe `negociaciones_horario_vuelo` (CO_ACEPTA_PROPUESTA), `vuelos_sanitarios` (APROBADO, evaluador, fecha), `vuelos.fecha_planificada_salida` y re-evalúa la ruta; notifica al DTS. **Rechazar** (`…/schedule/reject`): exige motivo del catálogo; `negociaciones_horario_vuelo` (CO_RECHAZO_DIRECTO), `vuelos_sanitarios` (RECHAZADO + `motivo_rechazo`); el rechazo es definitivo y el vuelo queda sin estado. Todo con auditoría (APPROVE / REJECT).

## 6. Negociación y confirmación de horarios

- **Sanitarios:** Operaciones **contrapropone** (`…/schedule/counterproposal`: horario distinto, ≤ límite de urgencia, con motivo) → fila CO_CONTRAPROPUESTA que responde a la propuesta del DTS y estado PENDIENTE_RESPUESTA_DTS; una contrapropuesta posterior reemplaza a la anterior. El **DTS solicitante** responde (`…/schedule/response`): **acepta** (DTS_ACEPTA_CONTRAPROPUESTA → APROBADO y fija la salida) o **rechaza** (DTS_RECHAZA_CONTRAPROPUESTA → solicitud y vuelo CANCELADOS con motivo). Sólo se puede responder la propuesta vigente.
- **Operativos:** el comandante responde a la asignación: acepta (COMANDANTE_ACEPTA_ASIGNACION → PLANIFICADO), propone horario (COMANDANTE_PROPONE_HORARIO → PENDIENTE_RESPUESTA_OPERACIONES) o rechaza (COMANDANTE_RECHAZA_ASIGNACION → PENDIENTE_REPLANIFICACION). Operaciones responde a la propuesta (CO_ACEPTA/RECHAZA_PROPUESTA_COMANDANTE) o replanifica.
- **Tabla clave:** `negociaciones_horario_vuelo` (historial inmutable). Efectos en `vuelos` y `vuelos_sanitarios`.

## 7. Asignación de aeronaves y comandantes

Operaciones consulta aeronaves y comandantes disponibles y pulsa **Asignar recursos** (`POST /api/flights/{id}/resources`, T SERIALIZABLE). **Sanitario:** solicitud APROBADA y vuelo sin iniciar con fecha definitiva; aeronave activa, en la provincia de origen solicitada, libre en el intervalo y con capacidad; comandante elegible (clasificado y con habilitación suficiente según políticas) y en la provincia de origen. **Escribe:** `vuelos` (`id_aeronaves`, `id_usuario_comandante`, `id_estados_vuelo` = PLANIFICADO), `vuelos_tripulantes` (comandante; baja del anterior si cambió), re-evaluación de `rutas_vuelo`, `eventos_auditoria` y `notificaciones` (COMMANDER_ASSIGNED/UNASSIGNED). En **sanitarios el comandante no acepta ni rechaza** la asignación: el vuelo pasa directo a PLANIFICADO; la aceptación aplica sólo a vuelos operativos. Tripulación adicional: «Agregar», «Reemplazar», «Retirar» → `vuelos_tripulantes` (alta/baja lógica) con notificaciones.

## 8. Aceptación o rechazo de asignaciones (vuelos operativos)

Para un vuelo operativo creado por Operaciones (`POST /api/flights/operational`, estado PENDIENTE_CONFIRMACION_COMANDANTE), el comandante (`POST …/commander-assignment/response`) **acepta** (valida horario futuro y elegibilidad → PLANIFICADO), **propone** salida y llegada con motivo (→ PENDIENTE_RESPUESTA_OPERACIONES) o **rechaza** con motivo (→ PENDIENTE_REPLANIFICACION). Cada respuesta es una fila de `negociaciones_horario_vuelo`, un evento de auditoría y una notificación a Operaciones. Operaciones puede «Enviar nueva asignación» (`POST …/operational-replanning`).

## 9. Rutas: creación, presentación, aprobación y devolución

1. El comandante asignado planifica aeropuertos y horario (`vuelos`) y luego **Guardar ruta** (`PUT /api/flights/{id}/route`) → nueva fila `rutas_vuelo` (BORRADOR, versión n+1; la anterior deja de ser vigente).
2. **Presentar** (`POST …/route/submit` o «Guardar y presentar»): `estado_revision` = PENDIENTE_REVISION + presentador/fecha; notifica a Operaciones (ROUTE_PENDING_REVIEW).
3. Operaciones **aprueba** (`…/approve`) o **devuelve con observaciones** (`…/return`, ≥ 10 caracteres): APROBADA/DEVUELTA + revisor/fecha/observaciones; nadie revisa lo que presentó.
4. Si luego cambia aeronave, comandante, aeropuertos u horarios, `reassess` pasa la versión a REQUIERE_REVISION con fecha y causa, y notifica a ambos.
5. Para **iniciar** el vuelo la versión vigente debe estar APROBADA y coherente.

## 10. Inicio, ejecución y finalización de vuelos

- **Antes:** comandante registra clima (`instantaneas_clima`), Operaciones carga hangar (`informacion_hangar`) y coordinaciones (`coordinaciones_aa2000`); ambos pueden anotar novedades (`bitacora_vuelos`) y subir documentos.
- **Iniciar** (`POST …/start`, Operaciones): datos de planificación completos, comandante sin bloqueo, tripulación elegible hoy y el día del vuelo, aeronave activa en el origen, ruta aprobada. Escribe `vuelos` (`fecha_salida_real`, EN_CURSO), `bitacora_vuelos` (INICIO) y auditoría. Si falla por elegibilidad o ruta, el rechazo se audita en una transacción propia.
- **Finalizar** (`POST …/finish`): `vuelos` (`fecha_llegada_real`, FINALIZADO), `aeronaves.id_aeropuertos` = destino, `perfiles_comandante.id_provincias` = provincia de destino, `obligaciones_informe_final` (PENDIENTE, 48 h), `bitacora_vuelos` (FINALIZACION), notificaciones y auditoría, todo en una transacción.
- **Cancelar** (antes del inicio): ver proceso 5/6 y la ficha de `vuelos`.

## 11. Informes finales: presentación, revisión y aprobación

Comandante → «Presentar informe» (`POST /api/final-reports/{obligaciónId}/submit`): nueva fila `informes_finales_vuelo` (PRESENTADO, versión n+1, adjunto opcional), la anterior pasa a no vigente y la obligación a PRESENTADO. Puede pedir **prórroga** de 24 h una vez por ciclo. Operaciones **aprueba** (`…/review` aprobar: informe APROBADO, obligación APROBADO, **vuelo COMPLETADO**) o **devuelve** (informe DEVUELTO con motivo; obligación DEVUELTO con nuevo plazo de 48 h). Si el plazo vence, el comandante queda bloqueado para funciones operativas (calculado al consultar, notificado por el barrido).

## 12. Creación y administración de vuelos no sanitarios

Operaciones/Centro de Operaciones/Administrador → «Crear vuelo operativo» (`POST /api/flights/operational`): tipo ≠ SANITARIO, aeronave activa (origen = su ubicación), destino, comandante elegible en la provincia de origen, salida y llegada, sin solapamientos. Escribe `vuelos` (sin `vuelos_sanitarios`), `vuelos_tripulantes` (comandante), auditoría y notificación al comandante. Sigue el flujo del proceso 8; no participa el DTS ni hay solicitud, paciente ni datos médicos.

## 13. Administración de aeronaves

Administrador → «Nueva aeronave» (`POST /api/catalogs/aircraft`: `aeronaves` INSERT + auditoría); «Editar» (`PUT`: bloqueado si está en vuelo; capacidad ≥ tripulación asignada; equipamiento no retirable si un vuelo lo requiere); activar/desactivar (`POST …/active`: no con vuelos asignados); «Ubicación» (`POST …/location`, Admin u Operaciones). La ubicación cambia además al finalizar un vuelo. Disponibilidad: derivada de vuelos; no se persiste.

## 14. Administración de catálogos geográficos

Administrador → Geografía (`/api/admin/geography/…`): alta, edición y activación/desactivación de provincias, localidades y aeropuertos con bloqueo jerárquico, control de dependencias vigentes (vuelos abiertos, rutas, coordinaciones, aeronaves, comandantes) y auditoría (GEOGRAPHIC_*). Los datos iniciales vienen de las migraciones V16/V17/V26.

## 15. Gestión de documentos y versiones

Registrar documento (`POST /api/flights/{id}/documents/pdf`): `documentos_vuelo` + `versiones_documento_vuelo` v1 + archivo en disco. Nueva versión: adquirir bloqueo (`bloqueos_documento_vuelo`, 300 s) → «Guardar nueva versión» (v n+1, la anterior no vigente) → liberar bloqueo (DELETE). Retirar: UPDATE de baja lógica con motivo (y DELETE del bloqueo). Descarga autenticada por versión.

## 16. Generación de notificaciones

`NotificationService` crea filas en `notificaciones` dentro de la transacción de cada acción (solicitud, horarios, asignaciones, rutas, cierre, tripulación) y desde tres barridos programados. Deduplicación por (`id_usuarios`, `clave_evento`). El destinatario las lee con `POST /api/notifications/{id}/read` o «Marcar todas como leídas» (UPDATE `leido`).

## 17. Generación de auditorías y bitácoras

- **Auditoría técnica:** `AuditService.record` (MANDATORY) inserta en `eventos_auditoria` dentro de cada transacción auditada; inmutable. Consulta global (Administrador) y por vuelo.
- **Bitácora operativa:** `FlightLogService` inserta novedades manuales (comandante/Operaciones) y hitos automáticos (INICIO, FINALIZACION, CANCELACION) en `bitacora_vuelos`; las correcciones agregan filas enlazadas.
- **Historial de habilitaciones:** `decisiones_habilitacion` (inmutable).

## 18. Administración de habilitaciones

Administrador → Habilitaciones: clasifica funciones (`clasificaciones_tripulacion`), registra la habilitación (`habilitaciones_profesionales` + decisión REGISTRO), adjunta PDF (`documentos_habilitacion`: cuarentena → análisis ClamAV), registra consulta externa manual (`consultas_externas_habilitacion`) y un **segundo administrador** (≠ titular) verifica, rechaza, pide corrección o revoca. Modificar o subir evidencia nueva reinicia la revisión. Renovar crea una habilitación nueva enlazada. Retiro/bloqueo de documentos y solicitudes de rectificación/supresión quedan en `documentos_habilitacion` y en el historial.

## 19. Configuraciones y políticas operativas

Administrador → Políticas: define combinaciones de suficiencia (`politicas_habilitacion`), simula un lote (informe de errores, avisos e incompatibilidades con vuelos abiertos), y **activa** el lote con referencia de aprobación: dentro de una transacción da de baja las reemplazadas, inserta las nuevas con `lote_activacion` y audita CREDENTIAL_POLICY_BATCH. Otros parámetros (plazo de 48 h y prórroga de 24 h del informe, vencimiento de 10 min de los OTP, duración de 300 s del bloqueo documental, zona horaria de negocio) son **constantes del código o propiedades de configuración** (p. ej. `app.storage.document-lock-seconds`, `app.business-time-zone`), no filas de la base.

## 20. Procesos automáticos

| Proceso | Frecuencia | Tablas que escribe |
|---|---|---|
| `FinalReportDeadlineService` (avisos de vencimiento, vencido y bloqueo) | cada 60 s | `notificaciones`, `eventos_auditoria` |
| `CrewEligibilityMonitoringService` (revisión de elegibilidad de tripulantes) | cada hora | `notificaciones` |
| `CredentialExpiryNoticeService` (vencimiento de habilitaciones) | cada hora | `notificaciones` |
| `CredentialDocumentService` (reintento de análisis antimalware) | cada 5 min | `documentos_habilitacion`, `decisiones_habilitacion` |
| `BootstrapAdministrator` | al arrancar | `personas`, `usuarios`, `usuarios_roles`, `correos_electronicos` |
| Flyway | al arrancar / despliegue | `flyway_schema_history` y el esquema |

[← Informe principal](../INFORME_COMPLETO_BASE_DATOS.md)
