# Plan de cierre funcional — auditoría V41

Fecha: 2026-10-20. Alcance auditado: esquema `dbo` E2E en Flyway V41, 40 tablas de aplicación. La base habitual permanece en V32 y no fue modificada.

## Prioridad crítica

| Funcionalidad | Tablas | Problema concreto | Solución requerida | Dependencias | Prueba y aceptación |
|---|---|---|---|---|---|
| ~~Cierre de ejecución de vuelos~~ **CERRADO 2026-10-20** (V42, `docs/MATRIZ_COBERTURA_FUNCIONAL.md`) | `vuelos`, `vuelos_sanitarios`, `estados_vuelo`, `informes_finales_vuelo`, `obligaciones_informe_final`, `notificaciones`, `eventos_auditoria` | La evidencia está fragmentada: creación, planificación e informe existen, pero no hay E2E único que recorra inicio, finalización, presentación, devolución y cierre para vuelo sanitario y operativo. | Definir y hacer cumplir las transiciones terminales y la obligación de informe; exponerlas en cada pantalla responsable. | Reglas de `FlightService` y `FinalReportWorkflowService`. | Dos vuelos E2E completos; SQL verifica estado, informe, obligación, notificación y auditoría tras reinicio. Ninguna transición fuera de orden debe persistir. |
| Autorización documental contextual | `documentos_vuelo`, `versiones_documento_vuelo`, `bloqueos_documento_vuelo`, `tipos_documento` | Cerrado en esta ejecución: faltaba lista, alta e historial desde el vuelo. | Mantener E2E de regresión y no reintroducir controles por ID manual. | Flujo del vuelo y almacenamiento de PDF. | `e2e_documentos.py` y navegador; alta, versión, bloqueo, 403 ajeno, auditoría y reinicio. |

## Prioridad alta

| Funcionalidad | Tablas | Problema concreto | Solución requerida | Dependencias | Prueba y aceptación |
|---|---|---|---|---|---|
| Solicitud sanitaria completa | `pacientes`, `personas`, `informacion_medica_vuelo`, `vuelos_sanitarios`, `negociaciones_horario_vuelo`, `motivos_cancelacion` | No hay evidencia E2E de selección/alta de paciente, evaluación, negociación, cancelación y extremo urgente en una única trazabilidad. | Recorrer el flujo DTS→OPS→COM y mostrar errores de transición. | Catálogos geográficos, prioridades, autorizaciones. | E2E SQL/API/Chrome con trazabilidad por vuelo y denegación para solicitante ajeno. |
| ~~Administración de seguridad~~ **CERRADO 2026-10-22 (V47)** (usuarios, roles y activaciones; contactos, personas y perfil de comandante siguen parciales) | `usuarios`, `usuarios_roles`, `roles`, `activaciones_cuenta`, `personas`, `correos_electronicos`, `telefonos`, `perfiles_comandante` | Hay pruebas por servicio, pero no una evidencia persistida del ciclo alta→activación→cambio obligatorio→baja/reactivación y permisos efectivos. | Crear E2E de administración y revisar el estado de cambio obligatorio en todas las rutas. | JWT y `AuthService`. | API/Chrome/SQL: permisos de cada rol, baja sin perder datos y reactivación con contraseña temporal. |
| ~~Informe final~~ **CERRADO 2026-10-20** | `informes_finales_vuelo`, `obligaciones_informe_final`, `documentos_vuelo`, `notificaciones` | Carga, devolución, plazos y cierre no están corroborados conjuntamente en SQL Server. | Integrar el estado del informe en detalle de vuelo y cierre. | Proceso terminal del vuelo. | E2E con entrega, devolución, reentrega, plazo vencido y auditoría. |
| Catálogos operativos | `tipos_vuelo`, `estados_vuelo`, `estados_solicitud_sanitaria`, `prioridades_vuelo`, `motivos_cancelacion`, `roles_tripulacion` | Algunos selectores contienen valores fijos y no hay evidencia de administración o de que cada catálogo sea deliberadamente estático. | Sustituir valores fijos por consulta cuando corresponda, o documentar catálogo inmutable y validarlo en backend. | Formularios de vuelo y tripulación. | API y UI consumen el mismo catálogo; valores inactivos son rechazados. |

## Prioridad media

| Funcionalidad | Tablas | Problema concreto | Solución requerida | Dependencias | Prueba y aceptación |
|---|---|---|---|---|---|
| Contactos, pacientes y geografía | `provincias`, `localidades`, `aeropuertos`, `pacientes`, `personas`, `correos_electronicos`, `telefonos` | El alta está cubierta parcialmente; faltan cambios controlados y persistencia E2E de identidad. | Completar pantallas/endpoints que falten y validar unicidad/formato en servidor. | Administración y DTS. | E2E que actualiza y consulta sin duplicar identidades. |
| ~~Notificaciones y auditoría~~ **CERRADO 2026-10-22 (V46)** (notificaciones cerrada para el cierre de vuelos; consulta de auditoría por roles cerrada en V46, ver la matriz) | `notificaciones`, `eventos_auditoria` | Se generan en varios servicios, sin matriz de eventos obligatorios ni E2E transversal. | Enumerar eventos por transición y comprobar destinatario/lectura. | Todos los flujos críticos. | SQL y API muestran evento, actor, vuelo y destinatario correctos. |
| Compatibilidad V32→V41 | Migraciones V33–V41 | No se puede afirmar sobre datos históricos sin una copia restaurada de la base habitual. | Respaldar la base habitual, restaurar bajo otro nombre, ejecutar Flyway y preflight de duplicados. | Backup autorizado y espacio SQL Server. | Copia llega a V41 sin alterar original; informes de filas afectadas y conflictos resueltos explícitamente. |

## Prioridad baja

| Funcionalidad | Tablas | Problema concreto | Solución requerida | Dependencias | Prueba y aceptación |
|---|---|---|---|---|---|
| Presentación y observabilidad | todas las ya funcionales | Mensajes y cobertura visual no son uniformes. | Mejorar textos de error y refresco puntual sólo después de cerrar los flujos críticos. | Pruebas de interfaz existentes. | Navegador muestra error del servidor y datos persistidos sin recarga manual. |

## Estado tras el cierre de vuelos (2026-10-20)

Implementado: inicio/finalización en la interfaz de CO, obligación de informe idempotente, informe versionado con decisión por versión, devolución con reinicio de plazo, bloqueo real del comandante en servicios, barrido de avisos de plazo, notificaciones deduplicadas, panel de notificaciones y ficha con cierre administrativo. Pendiente recomendado: (1) E2E de cancelaciones y replanificaciones operativas, (2) administración de catálogos, (3) consulta de auditoría por roles, (4) validación V32→V42 sobre copia restaurada de la base habitual, (5) ejecutar de nuevo los E2E Python históricos cuando haya Python disponible.

## Ciclo previo a la planificación (V44, 2026-10-20)

Resuelto: máquina de estados de la solicitud sanitaria con CANCELADO distinto de RECHAZADO (servicio y triggers de SQL Server), negociación con propuestas identificadas, reemplazables y con respuesta única (obsoletas y vencidas rechazadas), rechazo del DTS que cancela con motivo, cancelación restringida a Operaciones y al DTS solicitante (el comandante rechaza asignaciones pero no cancela vuelos), avisos idempotentes a los responsables y sin datos clínicos, urgencias priorizadas y destacadas, asignación de recursos bloqueada en vuelos iniciados, respuestas concurrentes y replanificaciones sin superposición, auditoría de todas las decisiones y corrección del selector de motivos (el campo "OTRO" nunca aparecía en la interfaz).

Estado: 19 tablas funcionales y 21 parciales (ver la matriz; **superado por V45**: 21 y 19). Pendiente recomendado: (1) ~~administración y E2E de aeronaves y tripulación adicional~~ **CERRADO 2026-10-21 (V45)**, (2) ~~consulta de auditoría por roles~~ **CERRADO 2026-10-22 (V46)**, (3) ciclo administrativo de usuarios y contactos, (4) catálogos geográficos y de tipos de vuelo, (5) restaurar una copia de la base habitual para probar V32→V44 (requiere respaldo autorizado), (6) volver a ejecutar los E2E Python históricos cuando haya un entorno con Python, Chrome y Docker.

## Consolidación del cierre de vuelos (V43, 2026-10-20)

Resuelto: procedencia explícita de las decisiones históricas de informes (V43), informe de texto o PDF con almacenamiento privado, descarga autenticada y versiones conservadas, plazo de 48 h verificado con reloj controlado (sin modificar columnas), destinatarios de avisos por responsable de cierre con respaldo a la cola de Operaciones, inventario de endpoints de escritura del comandante con prueba que obliga a decidir su control de bloqueo, trigger de COMPLETADO coherente con la aprobación del informe y corrección de origen del trayecto `undefined → undefined`.

Pendiente: (1) restaurar una copia de la base habitual para probar V32→V43 completa (requiere respaldo autorizado), (2) volver a ejecutar los E2E Python cuando haya un entorno con Python, Chrome y Docker, (3) análisis antivirus de adjuntos si el negocio lo exige, (4) ciclo previo a la planificación (solicitud, negociación, cancelaciones), (5) administración de catálogos, (6) consulta de auditoría por roles.

## Procedimiento seguro V32→V43

1. Obtener un backup consistente de la base habitual con SQL Server, restaurarlo bajo un nombre aislado y con credenciales de prueba.
2. Ejecutar preflight sin escritura: contar duplicados de versión actual en `informacion_hangar`; revisar `coordinaciones_aa2000` por vuelo/versión, FKs nulas que V41 complete por grupo y tamaños de columnas V37–V41.
3. Ejecutar Flyway desde la aplicación contra la copia. V33 crea clasificación; V34 sólo inserta el estado ausente; V35/V36 agregan habilitaciones; V37 agrega columnas/ruta e índice filtrado; V38 agrega bitácora y trigger; V39 agrega contexto de hangar; V40 exige como máximo una versión vigente por vuelo; V41 agrupa coordinaciones existentes y reemplaza las restricciones por gestión; V43 agrega procedencia de la decisión (con estado HISTORICO_SIN_DECISION para lo no comprobable), adjunto PDF por versión, responsable de cierre y los triggers de aprobación/COMPLETADO; V42 agrega decisión por versión de informe (con reconstrucción desde las obligaciones y marca REEMPLAZADO para versiones previas sin decisión registrada), índice único de versión vigente (falla de forma segura si hay duplicados), clave de evento de notificaciones, índice de vencimientos y el trigger de ciclo terminal.
4. Comparar conteos, FKs huérfanas, índices filtrados, vuelos y usuarios antes/después; ejecutar pruebas de lectura y de los flujos nuevos contra la copia.
5. Sólo con informe de la copia, ventana aprobada y backup verificado se podrá planificar la actualización habitual. No aplicar migraciones manualmente ni sobre la base original.

## Administración de aeronaves y tripulación adicional (V45, 2026-10-21)

Resuelto: administración completa de aeronaves desde la interfaz del Administrador (alta con validaciones, edición administrativa, baja lógica y reactivación con reglas de uso, ubicación auditada, estado operativo y disponibilidad por intervalo, historial), cambio de aeronave del vuelo (sanitario y operativo) con las mismas validaciones que la asignación inicial, tripulación adicional con baja lógica e historial (V45), candidatos con motivo de no disponibilidad, capacidad de tripulación de la aeronave, avisos idempotentes y sin datos médicos, conflictos de concurrencia informados como 409, y E2E de API (SQL Server real, concurrencia, atomicidad) y de navegador (Chrome). Ruta, hangar y coordinaciones reutilizan su contexto (incluye la aeronave) para pasar a REQUIERE_REVISION sin perder versiones; los cambios de tripulación adicional no las invalidan (no forman parte de su contexto).

Estado: 21 tablas funcionales y 19 parciales (ver la matriz). Pendiente recomendado: (1) ~~consulta de auditoría por roles (`eventos_auditoria`)~~ **CERRADO 2026-10-22 (V46)**, (2) ciclo administrativo de usuarios y contactos, (3) catálogos geográficos y de tipos de vuelo, (4) paginación del listado de aeronaves, (5) restaurar una copia de la base habitual para probar V32→V45 (requiere respaldo autorizado), (6) volver a ejecutar los E2E Python históricos cuando haya un entorno con Python, Chrome y Docker.

## Consulta de auditoría por roles (V46, 2026-10-22)

Resuelto: sección **Auditoría** del Administrador (tabla paginada del servidor, filtros combinables por fechas, usuario, tipo, acción, vuelo y registro, detalle con valores anteriores/posteriores y acceso contextual) e historial contextual en el detalle de Operaciones, DTS (evolución de su solicitud) y Comandante; política de visibilidad por perfil aplicada en SQL y en el saneado de valores; eventos inmutables (entidad, trigger y ausencia de endpoints de escritura); auditoría obligatoriamente transaccional; fechas en UTC con el reloj de negocio y presentación en la zona configurada; 401 ante falta de credenciales.

Estado: 22 tablas funcionales y 18 parciales (ver la matriz). Pendiente recomendado: (1) ~~ciclo administrativo de usuarios~~ **CERRADO 2026-10-22 (V47)**; quedan los contactos, (2) catálogos geográficos y de tipos de vuelo, (3) pacientes y personas, (4) paginación del listado de aeronaves, (5) exportación y retención de la auditoría, (6) restaurar una copia de la base habitual para probar V32→V46 (requiere respaldo autorizado; no se ejecutó), (7) E2E Python históricos sin entorno.

## Ciclo administrativo de usuarios (V47, 2026-10-22)

Resuelto: unicidad de DNI y de nombre de usuario garantizada por SQL Server, DNI de pacientes canónico, asociación de una cuenta a una persona existente sólo con confirmación expresa, cambio de roles que cierra las sesiones, baja y cambio de rol bloqueados por responsabilidades operativas concretas (vuelos, informes finales y solicitudes que esperan respuesta) y serializados con las asignaciones, baja con responsable y motivo, liberación de bloqueos documentales, restablecimiento administrativo con contraseña generada de un solo uso, auditoría completa sin secretos, listado paginado/búsqueda/detalle/edición/historial en el panel y tres defectos de infraestructura (403 por contraseña temporal convertido en 401 por el punto de entrada, error falso tras cambiar la contraseña, fechas en zona de la JVM).

Estado: 26 tablas funcionales y 14 parciales (ver la matriz). Pendiente recomendado: (1) mantenimiento de contactos y E2E de `correos_electronicos`/`telefonos`, (2) corrección controlada del DNI con revisión de historiales, (3) prueba de la carrera de últimos administradores sobre una base descartable, (4) límite de intentos de ingreso y recuperación pública de acceso cuando exista infraestructura de correo, (5) catálogos geográficos y de tipos de vuelo, (6) pacientes y personas (acceso por `personId`), (7) restaurar una copia de la base habitual para probar V32→V47 (requiere respaldo autorizado), (8) E2E Python históricos.
