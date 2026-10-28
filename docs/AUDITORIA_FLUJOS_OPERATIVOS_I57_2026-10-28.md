# Auditoría final de flujos operativos (I-5.7, fase 6)

Fecha: 2026-10-28. Alcance: DTS, Centro de Operaciones, Comandante y Administrador, vuelos sanitarios y no sanitarios, transiciones de estado y cambios simultáneos. No se modificó ninguna funcionalidad que ya funcionaba salvo el defecto real descrito en §1.

## 1. Defecto real hallado: respuestas tardías que pisaban datos más nuevos

I-5.6 corrigió ese defecto sólo en el panel de tripulación (`FlightCrew`: guarda `latest` + refresco periódico). Esta auditoría revisó **todas** las consultas de detalle de la interfaz que dependen de un vuelo o de una acción previa y encontró el mismo patrón sin protección —`setX(await api(...))` sin comprobar que la respuesta sigue siendo la última pedida— en:

| Pantalla | Consulta | Riesgo concreto |
|---|---|---|
| Panel del **comandante** (`Cmd`) | detalle del vuelo tras aceptar/rechazar la asignación y tras guardar la planificación | La carga inicial, el refresco posterior a **aceptar** y el guardado eran tres consultas independientes: si la anterior llegaba después, devolvía el estado «pendiente de confirmación» y **reaparecían los botones de aceptar/rechazar** sobre una asignación ya aceptada. |
| Respuestas del DTS (`DtsResponses`) y Centro de Operaciones (`Ops`) | detalle del vuelo seleccionado | Al cambiar rápido de solicitud, la respuesta del vuelo anterior podía mostrarse bajo la selección nueva **mientras las acciones se aplicaban al vuelo nuevo** (`id`): el operador veía datos de un vuelo y actuaba sobre otro. |
| Hangar, gestión aeroportuaria (AA2000), bitácora de vuelo | lectura por `flightId` / página | Respuesta de otro vuelo o de una página anterior sobre la actual. |
| Ruta del vuelo (`flightRoute`) | lectura de versiones | Ídem. |
| Clasificaciones por persona (Usuarios) | historial por usuario | Ídem. |

**Corrección** (el mismo idioma que `FlightCrew`: contador `latest` + `mine`): cada consulta numera su solicitud y sólo la última aplica su respuesta (y sólo la última informa su error); cambiar de vuelo invalida las pendientes. En el panel del comandante, carga inicial, refresco tras aceptar/rechazar y guardado comparten una sola función.

**Prueba con control negativo** (`staleResponses.test.jsx`, promesas diferidas controladas a mano): contra el `main.jsx` anterior **fallan 3 de 4** (refresco tardío tras aceptar, hangar, bitácora); contra el corregido pasan las 4. El caso «cambiar de vuelo» del panel del comandante ya estaba protegido por el `active` del efecto y pasa en ambas versiones.

**Qué NO se cambió:** las pantallas con carga única al abrir (informes finales, listados) y los flujos con `done()`/`reload()` ya ordenados. No existe actualización automática (ni sondeo ni WebSocket) del tablero general: un cambio de otra persona se ve al refrescar o al ejecutar una acción; el panel de tripulación se refresca solo cada 15 s y al volver a la pestaña. Es una limitación conocida y documentada, no un defecto de consistencia.

## 2. Mapa de flujos y evidencia

| Rol | Flujos auditados | Evidencia (suite E2E real: API, SQL Server, Chrome) |
|---|---|---|
| **DTS** | Alta de paciente y solicitud sanitaria, prioridades, urgencia extrema, negociación y aprobación de horarios, contactos del traslado | `e2e-solicitudes(-ui)`, `e2e-paciente-solicitud(-ui)`, `e2e-patient-directory(-ui)`, `e2e-contactos-solicitud(-ui)` |
| **Centro de Operaciones** | Evaluación de solicitudes, coordinación y asignación de aeronave y comandante, planificación operativa, revisión de rutas, inicio, finalización, cancelación, replanificación; vuelos operativos | `e2e-solicitudes`, `e2e-aeronaves-tripulacion(-ui)`, `e2e-elegibilidad-tripulacion(-ui)`, `e2e-rutas-revision(-ui)`, `e2e-rutas-estabilizacion`, `e2e-cierre(-ui)`, `e2e-i53-operativo-ui`, `e2e-sanitario-replanificacion-ui`, `e2e-contactos-tripulacion(-ui)` |
| **Comandante** | Aceptación y rechazo de asignaciones, ruta, clima, tripulación, documentos, planificación e informes finales | `e2e-sanitario-replanificacion-ui`, `e2e-rutas-revision-ui`, `e2e-cierre(-ui)`, `e2e-documentos(-integracion-ui)`, `e2e-tripulacion-actualizacion-ui`, `e2e-perfiles-comandante`; vitest `main.test.jsx`, `crewRefresh.test.jsx`, `staleResponses.test.jsx` |
| **Administrador** | Usuarios, bajas y reactivaciones, catálogos, personas, tripulación, habilitaciones, documentos, auditoría, políticas | `e2e-usuarios(-aislado,-ui)`, `e2e-identidad-*`, `e2e-geografia-*`, `e2e-roles-clasificaciones(-ui)`, `e2e-habilitaciones(-vuelos,-ui)`, `e2e-politicas-documentos-v60`, `e2e-politicas-documentos-ui`, `e2e-auditoria(-ui)` |

## 3. Vuelos sanitarios y no sanitarios: diferencias comprobadas

| Aspecto | Sanitario (`SANITARIO`) | No sanitario (`REGRESO_BASE`, `REPOSICIONAMIENTO`, `TRASLADO_OPERATIVO`, `ENTRENAMIENTO`, `OTRO`) |
|---|---|---|
| Origen | Solicitud del DTS con paciente, prioridad y urgencia | Alta directa del Centro de Operaciones (`POST /flights/operational`) con motivo, aeronave, comandante y destino |
| Horario | Negociación de horario entre DTS y Operaciones hasta la aprobación (propuestas y contrapropuestas) | Fijado por Operaciones |
| Asignación del comandante | Operaciones asigna recursos; el vuelo queda `PLANIFICADO` (el comandante no «acepta» un sanitario) | El comandante **acepta o rechaza** (`PENDIENTE_CONFIRMACION_COMANDANTE`); un rechazo vuelve a Operaciones para replanificar |
| Datos clínicos | Acotados a DTS y Operaciones; nunca en avisos | No existen |
| Documentos | Admite el parte médico (`solo_vuelo_sanitario`) | No lo admite |
| Política de suficiencia | Evalúa con el tipo `SANITARIO` | Evalúa con su propio tipo de vuelo: una política limitada a `SANITARIO` no habilita en operativos |
| Ruta, tripulación, informe final de 48 h, auditoría | Mismas reglas | Mismas reglas |

## 4. Transiciones y concurrencia: dónde está cubierta

* Estados y transiciones de vuelo y solicitud: máquina de estados con triggers SQL (`estados_vuelo`, `estados_solicitud_sanitaria`) y servicios; probadas en `e2e-solicitudes`, `e2e-cierre`, `e2e-rutas-*`.
* Cambios simultáneos reales sobre SQL Server (no simulados): `e2e-geografia-integridad` (bajas/altas de provincia, localidad, aeropuerto con carreras en ambos órdenes, `AirportLocks`), `e2e-elegibilidad-tripulacion`, `e2e-roles-clasificaciones` (retiro de clasificación frente a asignación), `e2e-aeronaves-tripulacion`, `e2e-documentos` (leases y versiones), `e2e-habilitaciones*` (revisión frente a edición, bloqueo por titular), y, en I-5.7, el bloqueo por función de la política (`CrewRoleRepository.lockByCodes`).
* La interfaz ya no puede mostrar una respuesta antigua sobre una más nueva (§1).

## 5. Qué queda fuera o es limitación declarada

* Sin actualización automática del tablero general (§1).
* La suite no ejecuta usuarios humanos reales ni navegadores distintos de Chrome.
* El tablero muestra todos los vuelos al cargar; con volúmenes de miles de vuelos abiertos (la base de pruebas tiene más de 2.000) los selectores se vuelven pesados, pero no se verificó con volúmenes reales de producción.
