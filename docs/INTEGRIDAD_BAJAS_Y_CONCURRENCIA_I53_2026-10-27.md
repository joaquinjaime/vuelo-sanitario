# I-5.3 — Integridad de las bajas lógicas, concurrencia y tipos de vuelo (2026-10-27)

Este documento fija las reglas que implementa el cierre de I-5.3 y deja la evidencia verificable. La base habitual no se tocó (sigue en V47); toda la evidencia SQL proviene de la base aislada `vuelos_sanitarios_e2e` con Flyway **V56**.

## 1. Qué es una referencia histórica y qué una vigente

La baja de una provincia, localidad o aeropuerto es **lógica** (`esta_activo = 0`): la fila, su identificador y sus claves foráneas se conservan. Lo que cambia es qué referencias *impiden* esa baja. La clasificación vive en un único lugar, `GeographicDependencyService`, y la usan los listados administrativos, las bajas y los cambios de provincia.

| Entidad | Referencia **vigente** (bloquea la baja, 409) | Referencia **histórica** (se conserva, no bloquea) |
|---|---|---|
| Aeropuerto | aeronave **activa** ubicada allí · vuelo no terminal con el aeropuerto como origen o destino · **versión vigente** de la ruta de un vuelo no terminal con el aeropuerto como **alternativo** · coordinación AA2000 vigente de un vuelo no terminal | vuelos FINALIZADO/COMPLETADO/CANCELADO · versiones de ruta no vigentes o de vuelos cerrados · coordinaciones no vigentes o de vuelos cerrados · registros de hangar · aeronaves inactivas |
| Localidad | aeropuerto activo asociado · solicitud sanitaria **abierta** (SOLICITADO, PENDIENTE_RESPUESTA_DTS o APROBADO con vuelo no terminal) | aeropuertos inactivos · solicitudes cerradas (rechazadas, canceladas o con vuelo terminal) |
| Provincia | localidad activa · aeropuerto activo | localidades y aeropuertos inactivos · perfiles de comandante (`provincia_actual`) |

Decisiones explícitas:

* **Aeropuerto alternativo.** Sólo la versión *vigente* de una ruta de un vuelo abierto protege a su alternativo (esté pendiente, aprobada o devuelta). Una versión anterior es historia: si el comandante presenta una versión nueva sin ese alternativo, el aeropuerto puede darse de baja y la versión antigua sigue apuntando a él. Una baja nunca invalida en silencio una ruta: o se rechaza, o la ruta ya no lo usaba. Para datos anteriores al cambio, `FlightRouteService.causes` considera además la causa «el aeropuerto alternativo ya no está activo» y la ruta pasa a REQUIERE_REVISION (no se puede iniciar con ella).
* **Perfiles de comandante** y **registros de hangar** se conservan (no bloquean): describen una situación, no una operación abierta; el comandante sólo puede volar desde aeropuertos activos de todos modos.
* **Reactivación.** Reactivar una localidad exige su provincia activa; reactivar un aeropuerto exige provincia y localidad activas y consistentes (`409 GEOGRAPHIC_PARENT_INACTIVE`). El identificador no cambia.
* **Cambio de provincia** de una localidad o de un aeropuerto con referencias vigentes se rechaza (`409 GEOGRAPHIC_HAS_OPERATIONAL_REFERENCES`): reubicaría operaciones abiertas.
* Si ya existían inconsistencias (datos previos), no se corrigen eliminando información: la clasificación sólo informa y bloquea.
* Códigos de conflicto: `GEOGRAPHIC_HAS_ACTIVE_DEPENDENCIES` (jerarquía activa), `GEOGRAPHIC_HAS_OPERATIONAL_REFERENCES` (uso operativo vigente, con `vigentes`, `historicas` y los códigos de los vuelos abiertos), `GEOGRAPHIC_PARENT_INACTIVE`, `GEOGRAPHIC_STATE_UNCHANGED`.
* Auditoría: cada baja/reactivación/edición sigue registrando `GEOGRAPHIC_*` con `CREATE`/`UPDATE`/`SET_ACTIVE`; la baja deja además `referenciasHistoricasConservadas` con el detalle de lo que se preservó.

## 2. Frontend

La sección **Geografía** distingue tres situaciones por fila (campo `dependencias` de cada listado): *puede desactivarse* (botón habilitado), *baja bloqueada* (botón deshabilitado y el texto «Baja bloqueada por referencias vigentes: …» con el motivo real) y *inactiva con historia* («Inactivo; conserva referencias históricas: …»). Una baja rechazada por el servidor muestra el motivo y **no** informa éxito; recarga la fila para reflejar las dependencias actuales. El formulario de vuelo operativo recarga el catálogo de tipos y quita el seleccionado cuando el servidor responde `TIPO_VUELO_INACTIVO`/`TIPO_VUELO_INEXISTENTE`.

## 3. Concurrencia

Problema: «consultar que el aeropuerto está activo → otro proceso lo desactiva → continuar con una validación obsoleta». Solución sin bloqueos globales (V56 agrega sólo índices por las columnas que referencian aeropuertos):

* `AirportLocks.lockAll(ids…)` bloquea la fila del aeropuerto (`PESSIMISTIC_WRITE` → `updlock, holdlock, rowlock` en SQL Server), en **orden creciente de id**, y la **relee** antes de que el llamador valide su estado. Lo usan, antes de leer el estado y de escribir la referencia: la creación y la replanificación de vuelos operativos (destino), la planificación operativa del comandante (origen y destino), la finalización (la aeronave pasa al destino), el alta y el traslado de aeronaves, las coordinaciones AA2000 y la ruta del comandante (alternativo, también al aprobar). La creación de una solicitud sanitaria bloquea sus localidades del mismo modo.
* La baja administrativa bloquea la misma fila **antes** de contar las referencias vigentes. Resultado determinista: de dos operaciones incompatibles, la segunda observa lo confirmado por la primera — o la baja encuentra la referencia y responde 409, o el uso encuentra el aeropuerto inactivo y se rechaza (400).
* Orden de adquisición (evita bloqueos mutuos): operaciones de vuelo `vuelo → aeronave → aeropuertos (por id)`; administración geográfica `provincia → localidad → aeropuerto`; la reactivación toma primero al padre. Las lecturas de dependencias siguen índices (V56), de modo que no esperan por filas ajenas.
* Los fallos de concurrencia residuales (víctima de bloqueo mutuo, tiempo de espera) se traducen (`AirportLocks` es `@Repository`) a `ConcurrencyFailureException` → **409 `CONCURRENT_MODIFICATION`**, reintentable; nunca 500.
* Aeronave y vuelo ya se serializaban por bloqueo de fila (aeronave, vuelo, usuario): no se tocó. Las rutas siguen decidiéndose con la versión esperada (409 `VERSION_RUTA_DESACTUALIZADA`).

## 4. Tipos de vuelo

El catálogo sigue siendo controlado (no CRUD). Reglas verificadas: un tipo activo se usa; uno inactivo se rechaza en el backend con `409 TIPO_VUELO_INACTIVO` y uno inexistente con `400 TIPO_VUELO_INEXISTENTE` (antes un mensaje común); las consultas de vuelos no dependen de que su tipo siga activo; la replanificación no toca el tipo; `SANITARIO` sigue reservado al DTS. No existe un procedimiento de baja de tipos (cambio por SQL/migración), así que no hay carrera con administración.

## 5. Evidencia (ejecutada el 2026-10-27 sobre la base aislada, Flyway V57)

* **Backend:** `mvn test` 506 pruebas, 0 fallos (antes 488). Nuevas: `GeographicIntegrityIntegrationTest` (16: referencias históricas/vigentes, alternativo, jerarquía, tipos de vuelo, solicitudes y 5 carreras con hilos reales en H2), regresión de `CrewManagementService` y de la licencia duplicada. Verificación por mutación: sin `AirportLocks` las tres carreras fallan en la ronda 0.
* **Frontend:** 226 pruebas, 0 fallos (antes 211; `geography.test.jsx` y el rechazo de tipo inactivo en el formulario); `npm run build` correcto.
* **E2E reales (SQL Server):** suite de 41 scripts. Nuevos y aprobados: `e2e-geografia-integridad` (8 bloques: 8 rondas por escenario de destino/alternativo/ubicación con ambos órdenes y 4 de doble baja, un solo ganador, 0 líneas de bloqueo mutuo en el log; invariantes SQL sin vuelos, rutas ni aeronaves apuntando a aeropuertos inactivos), `e2e-sanitario-replanificacion-ui` (12 bloques en Chrome: D1–D5 recorrido sanitario, E1–E6 replanificación, E5b administración), `e2e-perfiles-comandante` (3). `e2e-solicitudes-ui`, que quedó interrumpido en el informe anterior, ahora termina aprobado. En la corrida completa fallaron 3 scripts; `e2e-contactos-tripulacion-ui` y `e2e-verificacion-contactos-ui` pasaron al repetirlos solos (el navegador se cerró bajo presión de memoria del equipo) y `e2e-contactos-tripulacion` tenía una aserción desactualizada («ninguna migración posterior a V55») que se corrigió a V57; repetido, 8 bloques aprobados.
* **Defectos reales encontrados y corregidos:** 500 en el panel de recursos de una solicitud sanitaria sin llegada planificada; unicidad de licencia perdida en V24/V27 (V57).
* **Entornos:** base habitual en V47 sin cambios (consulta de sólo lectura al final); base aislada en V57; release V55 y migraciones existentes sin modificar; sin push.
