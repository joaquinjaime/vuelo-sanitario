# I-4 Gestión de rutas de vuelo y revisión operativa (V55) — 2026-10-25

Este documento describe lo implementado y comprobado. La aprobación de una ruta es una revisión **interna** de Operaciones: no es una autorización aeronáutica ni sustituye ninguna autorización externa.

## 1. Diagnóstico previo a la implementación

| Pregunta | Estado encontrado (V37–V54) |
|---|---|
| Creación | `PUT /api/flights/{id}/route` del comandante asignado, sólo con el vuelo `PLANIFICADO` y con origen, destino y horarios definidos. |
| Campos | Recorrido (texto ordenado), aeropuerto alternativo (opcional, activo y distinto del destino), altitud, distancia, tiempo estimado y observaciones (opcionales). Origen, destino y horarios son datos de `vuelos`, no de la ruta. |
| Versionado | Cada guardado crea una fila en `rutas_vuelo` (`version`, `es_version_actual`, índice único filtrado de la vigente) con la versión esperada como control optimista y el vuelo bloqueado. |
| `REQUIERE_REVISION` | Derivado en lectura: el contexto operativo guardado en la versión (`contexto_operativo` = origen, destino, salida, llegada, aeronave y comandante) ya no coincidía con el del vuelo. No se persistía, no se auditaba y no existía decisión alguna. |
| Aprobación real | **No existía.** La ruta no tenía aprobación, revisor, devolución ni efecto sobre el inicio (decisión documentada de V37: "la planificación de rutas no bloquea el inicio"). |
| Inicio sin ruta | `FlightService.start` no consultaba la ruta. |
| Reutilizable | `rutas_vuelo` y su versionado, el bloqueo `flights.lockById`, el contexto operativo, `AuditService`, `ApiException` con código, `CommanderReportAccessService`, el patrón de auditoría del inicio rechazado y el componente `FlightRoute`. |

**Diferencia con el comportamiento previo, aprobada expresamente en el pedido I-4:** el inicio de un vuelo exige ahora una ruta aprobada. Reemplaza la decisión de V37 de no bloquear el inicio. El resto de las comprobaciones de inicio (comandante, tripulación, aeronave, ubicación) se conserva y se evalúa antes.

## 2. Modelo de estados (una máquina pequeña, por versión)

El estado de revisión pertenece a **cada versión** (`rutas_vuelo.estado_revision`); no se agregaron estados generales de vuelo ni tablas.

| Estado | Significado | Quién lo produce |
|---|---|---|
| `BORRADOR` | Versión guardada y todavía no presentada. | Comandante asignado (`PUT`). |
| `PENDIENTE_REVISION` | Presentada a Operaciones, sin decisión. | Comandante (`submit` o `PUT` con `presentar`). |
| `APROBADA` | Aprobada para esta versión y para el contexto con que se planificó. | Operaciones (`approve`). |
| `DEVUELTA` | Devuelta con observaciones obligatorias. | Operaciones (`return`). |
| `REQUIERE_REVISION` | Estaba presentada o aprobada y un cambio material del vuelo invalidó esa decisión; se conservan revisor y fecha. | El sistema (`reassess`). |
| `SIN_REVISION` | Versión que nunca recibió una decisión (reemplazada sin decidir, o anterior a este procedimiento). | El sistema. |

Transiciones permitidas:

```
(nada) --PUT--> BORRADOR --submit / PUT presentar--> PENDIENTE_REVISION --approve--> APROBADA
                                                          |--return--> DEVUELTA
PENDIENTE_REVISION | APROBADA --cambio material del vuelo--> REQUIERE_REVISION
cualquier versión vigente --PUT (nueva versión BORRADOR)--> la anterior conserva su estado,
        salvo BORRADOR / PENDIENTE_REVISION, que pasan a SIN_REVISION
```

El **estado efectivo** que ven la ficha, la cola de Operaciones, la aprobación y el inicio lo calcula un único método (`FlightRouteService.assess`): compara además el contexto de la versión con el del vuelo, de modo que una aprobación obsoleta nunca se considera vigente aunque un camino hubiera omitido la invalidación. Un borrador o una devolución no cambian de estado por un cambio del vuelo.

## 3. Reglas

* **Planificación.** Sólo el comandante asignado, con el vuelo `PLANIFICADO`, el vuelo completo (aeropuertos y horarios) y sin bloqueo por informe vencido. Cada modificación efectiva crea una versión nueva; guardar sin cambios sobre un borrador, una pendiente o una aprobada se rechaza (`RUTA_SIN_CAMBIOS`). Desde una devuelta o una invalidada se admite guardar datos idénticos (es la respuesta del comandante). Si la versión anterior ya había sido presentada, el **motivo de la modificación** es obligatorio (`MOTIVO_MODIFICACION_REQUERIDO`, al menos 8 caracteres con contenido).
* **Validación de datos.** Recorrido obligatorio; alternativo existente, activo y distinto del destino; altitud ≥ 0, distancia > 0 y tiempo ≥ 1 minuto con la precisión de la columna; campos opcionales omitibles; cuerpo con campos estrictos (un campo desconocido es 400). El origen y el destino son los del vuelo. **No se agregó ninguna regla aeronáutica** (altitudes mínimas o máximas, distancias, autonomía, combustible, espacio aéreo): ver §9.
* **Presentación.** Sólo el comandante asignado, sobre la versión vigente en `BORRADOR` y consistente con el vuelo. Una versión cuyo contexto ya cambió debe guardarse de nuevo.
* **Aprobación.** Sólo Operaciones (`OPERACIONES` o `CENTRO_OPERACIONES`; el administrador no), con el vuelo `PLANIFICADO`, la versión vigente en `PENDIENTE_REVISION`, el contexto coherente y el alternativo todavía activo. Se registra revisor, fecha, versión y un comentario opcional. Quien creó o presentó la versión, o el comandante del vuelo —aunque reúna también el rol de Operaciones—, no puede aprobarla ni devolverla (`AUTOREVISION_RUTA_NO_PERMITIDA`, 403).
* **Devolución.** El motivo es obligatorio y significativo (al menos 10 caracteres, letras suficientes y variedad; `MOTIVO_DEVOLUCION_INVALIDO`). No cancela el vuelo, no elimina la ruta ni aprobaciones históricas y no tiene relación con el rechazo de una solicitud sanitaria. El comandante corrige creando una versión nueva con el motivo de la modificación.
* **Una aprobación pertenece a una versión.** La versión nueva nace en `BORRADOR` y no hereda nada; la aprobación de la anterior se conserva en su fila (`APROBADA`, o `REQUIERE_REVISION` con su revisor y fecha si fue invalidada).
* **Versión esperada.** `approve`, `return`, `submit` y `PUT` envían la versión que el usuario vio; si la vigente es otra, 409 `VERSION_RUTA_DESACTUALIZADA`. Una transición que no corresponde al estado actual (por ejemplo aprobar dos veces) es 409 `TRANSICION_RUTA_NO_PERMITIDA`.

## 4. Invalidación por cambios del vuelo

La política es una sola: lo que cambia las condiciones bajo las que se planificó la ruta es **material**; el resto es **administrativo**. El contexto de la versión (`contexto_operativo`) está formado por:

| Condición | Cambio material | Causa que se muestra |
|---|---|---|
| Aeropuerto de origen | Sí | "cambió el aeropuerto de origen" |
| Aeropuerto de destino | Sí | "cambió el aeropuerto de destino" |
| Horario de salida | Sí | "cambió el horario de salida" |
| Horario de llegada | Sí | "cambió el horario de llegada" |
| Aeronave | Sí (decisión explícita: el modelo no relaciona la ruta con prestaciones de la aeronave, pero la ruta se planificó para una aeronave; el comportamiento previo ya lo consideraba parte del contexto) | "cambió la aeronave" |
| Comandante asignado | Sí (la ruta la presenta el comandante asignado; el nuevo debe confirmarla o corregirla) | "cambió el comandante asignado" |
| Aeropuerto alternativo | Es un dato de la propia ruta: cambiarlo crea una versión nueva. Si pasa a coincidir con el destino del vuelo, la versión deja de ser consistente | "el aeropuerto alternativo coincide con el destino" |
| Tripulación adicional, documentos, hangar, clima, bitácora, coordinaciones AA2000, contactos, datos del paciente | **No** (administrativos) | — |

Todos los caminos que modifican esas condiciones (`replanOperational`, aceptación de la propuesta del comandante, `assign`, `changeAircraft`, `configureOperationalPlanning` y la fijación del horario sanitario) llaman a `FlightRouteService.reassess` dentro de su propia transacción: una versión `PENDIENTE_REVISION` o `APROBADA` cuyo contexto ya no coincide pasa a `REQUIERE_REVISION` (`fecha_invalidacion`, `causa_invalidacion`) y se audita `INVALIDATE`. La lógica no está en controladores ni en React. La revisión de la ruta y la del hangar son independientes: cada una conserva su propio estado.

## 5. Validación del inicio

`FlightService.start` agrega `FlightRouteService.requireApprovedForStart` **después** de las comprobaciones existentes (comandante, bloqueo por informes, tripulación vigente, ubicación de la aeronave) y bajo el bloqueo del vuelo. Rechaza con 409 y código estructurado:

| Código | Situación |
|---|---|
| `RUTA_NO_DEFINIDA` | No hay ruta. |
| `RUTA_NO_PRESENTADA` | La vigente es un borrador (o una versión histórica sin decisión). |
| `RUTA_PENDIENTE_REVISION` | Presentada, sin decisión. |
| `RUTA_DEVUELTA` | Devuelta con observaciones (se informan en el mensaje). |
| `RUTA_REQUIERE_REVISION` | Invalidada o inconsistente con el vuelo (se informa la causa). |
| `VERSION_RUTA_DESACTUALIZADA` | Se decidió, presentó o guardó sobre una versión que ya no es la vigente (409 en `PUT`, `submit`, `approve`, `return`). |

Cada inicio rechazado por la ruta se audita (`FLIGHT_ROUTE` / `START_REJECTED`) en una transacción propia, porque la del inicio se revierte. Una incidencia durante un vuelo ya iniciado no bloquea bitácora, informe final ni finalización; el proceso no se aplica retroactivamente a vuelos `EN_CURSO` o `FINALIZADO`.

## 6. Concurrencia

Presentar, decidir, modificar la ruta y todas las operaciones que cambian el contexto o inician el vuelo bloquean primero la **misma fila del vuelo** (`FlightRepository.lockById`, escritura pesimista): se serializan. La versión esperada descarta decisiones sobre una versión que dejó de ser la vigente. El índice único filtrado y las restricciones de V55 son la última defensa. Comprobado en SQL Server real con desfases de arranque en ambos órdenes (decidir vs. modificar, dos aprobaciones, iniciar vs. cambio de aeronave) y en H2 con transacciones independientes.

## 7. Permisos (aplicados en el backend)

| Acción | COMANDANTE asignado | COMANDANTE ajeno | OPERACIONES / CENTRO_OPERACIONES | DTS | ADMINISTRADOR |
|---|---|---|---|---|---|
| Consultar ruta e historial (`GET`) | Sí | 403 | Sí | Sí, sólo de su solicitud | Sí |
| Guardar / presentar (`PUT`, `submit`) | Sí | 403 | 403 | 403 | 403 |
| Aprobar / devolver (`approve`, `return`) | 403 | 403 | Sí, salvo su propia ruta | 403 | 403 |
| Cola de revisión (`GET /api/flights/route-statuses`) | 403 | 403 | Sí | 403 | Sí |

`PUT` y `submit` figuran en `CommanderWriteEndpointsGuardTest`: un comandante con informe vencido recibe 403 `COMANDANTE_BLOQUEADO`.

## 8. Persistencia (V55) y datos históricos

V55 no crea tablas. Agrega a `rutas_vuelo`: `estado_revision` (NOT NULL), `motivo_modificacion`, `id_usuario_presenta`, `fecha_presentacion`, `id_usuario_revisor`, `fecha_revision`, `observaciones_revision`, `fecha_invalidacion`, `causa_invalidacion`; seis restricciones CHECK (estado válido; presentación, decisión, devolución con observaciones, invalidación con causa; revisor distinto de quien presentó) y el índice filtrado `idx_rutas_vuelo_estado_revision_actual (estado_revision, id_vuelos) WHERE es_version_actual = 1`. La relación con la versión anterior es `version - 1` del mismo vuelo (consecutiva por construcción, con unicidad `(id_vuelos, version)`).

**Rutas existentes (estrategia explícita, sin falsificar aprobaciones).** Ninguna ruta anterior se marca aprobada ni presentada. La versión vigente de un vuelo que todavía no inició queda `BORRADOR`: el comandante debe presentarla y Operaciones aprobarla antes del inicio. Las demás versiones y las de vuelos `EN_CURSO`, `FINALIZADO`, `COMPLETADO` o `CANCELADO` quedan `SIN_REVISION` y se conservan íntegras. En la base E2E (V54 → V55) las 86 rutas existentes quedaron: 23 `BORRADOR` y 63 `SIN_REVISION`. Consecuencia operativa: **todo vuelo `PLANIFICADO` pendiente de iniciar necesitará una ruta aprobada**, incluidos los que ya la tenían como borrador.

## 9. API

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `GET /api/flights/{id}/route` | — | `estado` (efectivo), `editable`, `versionVigente`, `causas`, `requiereMotivo`, `puedePresentar`, `puedeRevisar`, `inicio {aplica, permitido, codigo, mensaje}`, `versiones[]` (estado, autor, fechas, motivo de la modificación, presentación, decisión, observaciones, invalidación y condiciones del vuelo con que se planificó) |
| `PUT /api/flights/{id}/route` | `version`, `recorrido`, `alternativoId?`, `altitudPies?`, `distanciaNm?`, `tiempoEstimadoMinutos?`, `observaciones?`, `motivoModificacion?`, `presentar?` | Ficha actualizada |
| `POST /api/flights/{id}/route/submit` | `version` | Ficha |
| `POST /api/flights/{id}/route/approve` | `version`, `comentario?` | Ficha |
| `POST /api/flights/{id}/route/return` | `version`, `motivo` | Ficha |
| `GET /api/flights/route-statuses` | — | `[{flightId, estado, version, bloqueaInicio}]` (Operaciones y administrador) |

Errores de negocio: `{error, code, ...}`. Códigos: `RUTA_NO_DEFINIDA`, `RUTA_NO_PRESENTADA`, `RUTA_PENDIENTE_REVISION`, `RUTA_DEVUELTA`, `RUTA_REQUIERE_REVISION`, `VERSION_RUTA_DESACTUALIZADA`, `TRANSICION_RUTA_NO_PERMITIDA`, `AUTOREVISION_RUTA_NO_PERMITIDA`, `MOTIVO_DEVOLUCION_INVALIDO`, `MOTIVO_MODIFICACION_REQUERIDO`, `RUTA_SIN_CAMBIOS`.

## 10. Auditoría

Entidad `FLIGHT_ROUTE` (visible para Operaciones, comandante actual y administrador; no para el DTS), `entidad_id` = versión: `CREATE` / `UPDATE` (nueva versión), `SUBMIT`, `APPROVE`, `RETURN`, `INVALIDATE` (con causa, estado anterior y posterior) y `START_REJECTED` (código y versión). Todas excepto `START_REJECTED` se confirman o se revierten con la operación; consultar o refrescar no audita.

## 11. Interfaz

`flightRoute.jsx` (el componente `FlightRoute` pasó de `main.jsx` a este módulo y se reexporta): el comandante guarda como borrador, guarda y presenta, o presenta, ve las observaciones de Operaciones y la causa de la nueva revisión, y completa el motivo de la modificación cuando corresponde; Operaciones ve la cola "Rutas pendientes de revisión" y, en el detalle del vuelo, aprueba (comentario opcional) o devuelve (motivo validado); el historial pliega las versiones anteriores sin perder la vigente; el selector de Operaciones muestra el estado de ruta de cada vuelo. Los botones se muestran según lo que informa el servidor (`editable`, `puedePresentar`, `puedeRevisar`), se deshabilitan mientras se envía, y un conflicto 409 muestra el mensaje y recarga lo vigente. Ocultar un botón no sustituye las verificaciones del servidor.

## 12. Pendientes y decisiones de negocio abiertas

* No se definieron reglas aeronáuticas (altitudes, distancias, autonomía, combustible, espacio aéreo, meteorología): la ruta sólo valida coherencia, tipos, rangos estructurales y relaciones del modelo.
* **Extrema urgencia.** El inicio de un vuelo sanitario de extrema urgencia exige igualmente la ruta aprobada; no se inventó una excepción. Si el negocio la requiere (por ejemplo una aprobación abreviada o una dispensa auditada), debe definirse.
* No hay avisos (notificaciones) al presentar, aprobar, devolver o invalidar: Operaciones usa la cola de pendientes y el comandante ve el estado al abrir el vuelo. Se evitó cambiar los conteos de notificaciones de los flujos existentes.
* El cambio de comandante y de aeronave se trata siempre como material; si el negocio decide que alguno no afecta la ruta, basta quitar su posición del contexto.
* La validación de V55 sobre una restauración de la base habitual y el despliegue en ella (hoy en V47) quedan pendientes de autorización.
* Cobertura de `rutas_vuelo`: las tres brechas que quedaban (ruta anterior a V37 con contexto ausente, dos creaciones iniciales simultáneas y límites numéricos en SQL Server) se cerraron en I-4.1 (`ESTABILIZACION_RUTAS_Y_ENSAYO_V47_V55_I41_2026-10-25.md`), que además corrigió el truncamiento de `1.5` minutos a 1 y un error interno ante un contexto ilegible. La actualización de la base habitual a V55 sigue pendiente de autorización (`PROCEDIMIENTO_ACTUALIZACION_V47_V55.md`).

## 13. Evidencia de pruebas

| Alcance | Resultado |
|---|---|
| Maven (`mvn -o test`) | 477 pruebas, 0 fallos (440 antes de I-4): `FlightRouteServiceTest` 29, `FlightRouteAuthorizationTest` 6 (matriz de roles, campos estrictos, errores estructurados), `FlightRouteReviewIntegrationTest` 8 (ciclo con servicios reales, invalidación por `changeAircraft`, carreras con transacciones independientes en H2) y las pruebas existentes actualizadas por el nuevo constructor |
| Vitest | 210 pruebas, 0 fallos (198 antes): `flightRoute.test.jsx` 12 (estados, formularios y validaciones, historial, aprobación, devolución, conflicto 409, envío doble, controles por permiso, cola) |
| Build del frontend | `vite build` correcto |
| `e2e-rutas-revision.cjs` (SQL Server real, Flyway V55) | 12 bloques: migración V55 sin aprobaciones inventadas, ciclo sanitario completo con SQL de versiones/decisiones/actores/fechas/observaciones y 20 eventos de auditoría en orden, ciclo operativo, matriz de permisos, autorrevisión con doble rol, 6 restricciones CHECK e índice único, tres carreras reales (8 rondas con desfases en ambos órdenes, 3 rondas de doble aprobación, 8 de iniciar vs. cambiar la aeronave) y persistencia tras reiniciar el backend |
| `e2e-rutas-revision-ui.cjs` (Chrome) | 10 bloques: el recorrido de 17 pasos completo para un vuelo operativo y para uno sanitario |
| Suite Node completa | 36 scripts; 32 aprobaron en la primera pasada y 4 requirieron actualizar expectativas del incremento anterior (ver la matriz) y aprobaron al repetirse |

No se ejecutaron los E2E Python históricos (no hay Python).
