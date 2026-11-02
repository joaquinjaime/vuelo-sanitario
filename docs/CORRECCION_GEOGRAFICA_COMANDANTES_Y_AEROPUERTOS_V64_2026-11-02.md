# Corrección geográfica de comandantes y selección de aeropuertos (V64/V65)

Fecha: 2026-11-02 · Rama: `fix/asignacion-comandante-aeronave-ubicacion` · Migraciones: **V64** (SQL) y **V65** (Java) · Reemplaza las reglas por localidad de V63.

## 1. Auditoría previa (cómo funcionaba antes)

| Tema | Estado antes de este cambio |
|---|---|
| Ubicación del comandante | V63 guardaba **localidad + provincia** (`perfiles_comandante.id_localidades_actual`, FK compuesta localidad↔provincia, fecha y responsable). La interfaz pedía provincia, búsqueda de localidad y localidad. |
| Filtrado geográfico | Un comandante era elegible de forma ordinaria sólo si estaba registrado en **la misma localidad que `vuelos_sanitarios.id_localidad_origen`**, es decir, la localidad donde está el **paciente**. Estar en la misma provincia no alcanzaba. |
| Selección de aeropuertos | No había propuesta de aeropuertos de Centro de Operaciones (CO). Los aeropuertos del vuelo (`vuelos.id_aeropuerto_origen/destino`) los fijaba **sólo el comandante** en su planificación operativa (`POST /flights/{id}/operational-planning`), con los selectores **restringidos a la provincia de la localidad del paciente**. No había forma de elegir un aeropuerto de otra provincia ni de ver alternativas por cercanía. |
| Planificación de ruta | `FlightRouteService` (I-4): versiones de ruta presentadas por el comandante, revisión/aprobación de Operaciones, y `reassess` como único punto de invalidación cuando cambia el contexto del vuelo (aeropuertos, horarios, aeronave, comandante). **Se conserva sin cambios**. |
| Responsabilidades | CO acordaba el horario y asignaba comandante y aeronave; el comandante completaba aeropuertos y arribo en `PLANIFICADO` y presentaba la ruta. Como el aeropuerto aparecía recién después de asignar, CO no tenía el aeropuerto de salida cuando elegía al comandante y se usaba la localidad del paciente como sustituto. |
| Modelo de datos | **Ya estaban separadas** las dos ideas: la necesidad sanitaria vive en `vuelos_sanitarios` (`id_localidad_origen/destino`) y la ejecución aeronáutica en `vuelos` (`id_aeropuerto_origen/destino`). El error estaba en cómo se **interpretaban** (la localidad del paciente hacía de aeropuerto) y en que no existía estado de selección (propuesto/confirmado). |

## 2. Problemas encontrados

1. La ubicación operativa del comandante exigía una localidad que el negocio no necesita registrar.
2. La elegibilidad geográfica usaba la localidad del paciente como si fuera el aeropuerto de despegue (y exigía coincidencia de ciudad).
3. No existía el concepto de aeropuerto **propuesto** vs **confirmado**; CO no podía proponer aeropuertos y el comandante los elegía sin referencia.
4. Los aeropuertos elegibles estaban limitados a la provincia del paciente, sin considerar otra jurisdicción cuando se justifica ni cercanía.
5. Un aeropuerto sin provincia conocida habría producido una decisión geográfica errónea (no había un bloqueo con mensaje específico).
6. Una excepción geográfica no estaba atada a la jurisdicción de salida: si el aeropuerto cambiaba no había forma de saber si seguía valiendo.
7. Al finalizar un vuelo, la provincia del comandante se actualizaba sin registrar quién ni cuándo.

## 3. Reglas finales

* **Ubicación operativa del comandante** = **provincia o CABA** (`perfiles_comandante.id_provincias`) + fecha y responsable de la última actualización. Estados: `CONOCIDA` / `DESCONOCIDA` (provincia nula). **CABA y la Provincia de Buenos Aires son jurisdicciones distintas** (dos filas de `provincias`). No hay localidad. Se actualiza con `PUT /api/commanders/{id}/location` `{provinciaId|null, motivo}` (Administrador, CO y OPERACIONES; el comandante sólo consulta la propia).
* **Elegibilidad ordinaria**: el comandante está en la **misma jurisdicción que el aeropuerto de salida** y es apto (cuenta, clasificación, habilitación vigente, disponibilidad horaria, restricciones existentes). La localidad del paciente **nunca** se compara con la del comandante ni se toma como aeropuerto.
* **Jurisdicción de salida** (`FlightService.departure`): aeropuerto **CONFIRMADO** → su provincia (definitiva); aeropuerto **PROPUESTO** → su provincia (**preliminar**); sin aeropuerto → la provincia del paciente (**preliminar**). Un aeropuerto sin provincia conocida bloquea con `409 AIRPORT_PROVINCE_UNKNOWN` («No se pudo determinar la provincia del aeropuerto…»).
* **Candidatos preliminares**: `commander-candidates` devuelve `salida{provinciaId, aeropuertoId, fuente, preliminar}` y una `advertencia`. Una asignación basada en un aeropuerto preliminar queda auditada con `salidaPreliminar:true`; **no sustituye** la comprobación definitiva (se revalida al confirmar y al cambiar el aeropuerto).
* **Excepción geográfica**: sólo CENTRO_OPERACIONES (OPERACIONES recibe 403), motivo de al menos 15 caracteres, auditada. Se registra la **provincia de salida y el aeropuerto** para los que se autorizó (`excepciones_geograficas_comandante.id_provincia_salida/id_aeropuerto_salida`). Si el aeropuerto pasa a otra provincia la excepción **deja de cubrir** al comandante (se cierra como historial) y hace falta otra decisión explícita. Tipos nuevos: `UBICACION_DESCONOCIDA` y `OTRA_PROVINCIA`; los de V63 por localidad sólo se conservan como historial.
* **Estados de aeropuerto** (`vuelos.estado_aeropuerto_origen/destino`): `PROPUESTO` (CO) o `CONFIRMADO` (comandante). Los aeropuertos ya registrados hasta V63 y los de los vuelos operativos (origen = ubicación de la aeronave) quedan `CONFIRMADO`. Vista de la ficha: `PENDIENTE`, `PROPUESTO`, `CONFIRMADO`.
* **Un aeropuerto fuera de la provincia del paciente** (de origen para la salida, de destino para la llegada) se permite pero exige una **justificación operativa** (≥10 caracteres, auditada).
* **Selección asistida**: se ofrecen primero los aeropuertos activos de la jurisdicción del paciente y, sin impedirlo, los más cercanos de otras jurisdicciones o los que encuentre la búsqueda. El orden es por **distancia en línea recta aproximada** entre el centroide de la localidad (V65, dataset local `localidades-georef-2026-09-28.json`) y el aeropuerto. **No se calculan ni se muestran tiempos de traslado terrestre** (no hay datos ni servicio de ruteo, y no se agregó ninguno); el aviso lo dice expresamente. Se señalan la aeronave asignada en ese aeropuerto y si el comandante asignado está en esa jurisdicción.

## 4. Responsabilidades y dependencia CO ↔ comandante (solución adoptada)

El flujo real ya asignaba comandante y aeronave **antes** de que el comandante planificara. Se mantuvo ese orden y se resolvió la dependencia con propuesta + confirmación, sin una segunda planificación:

1. DTS registra la solicitud (localidad del paciente de origen y destino). **No se modifica nunca.**
2. CO acuerda el horario (el estado `APROBADO` habilita todo lo siguiente; los documentos siguen bloqueados antes del acuerdo).
3. CO consulta aeropuertos candidatos y **propone** (`PUT /flights/{id}/airports`) salida y/o llegada (quedan `PROPUESTO`). También puede asignar comandante con datos **preliminares** si todavía no propuso ninguno.
4. CO asigna comandante y aeronave (reserva → `PLANIFICADO`). La aeronave debe estar en la jurisdicción del aeropuerto de salida y, si ya hay aeropuerto, **en ese aeropuerto**.
5. El comandante revisa lo propuesto en su planificación existente (`POST /flights/{id}/operational-planning`): puede confirmarlo tal cual o elegir otros (se avisa a CO, queda auditado y la ruta vuelve a revisión). Al confirmar quedan `CONFIRMADO` y se **revalida** la jurisdicción contra su propia ubicación: no puede fijarse una salida fuera de su jurisdicción ni autorizarse una excepción.
6. El comandante presenta la ruta; Operaciones la aprueba (controles de I-4 intactos).
7. `start` exige aeropuertos **confirmados** (`409 AEROPUERTOS_SIN_CONFIRMAR`), ruta aprobada y el resto de las validaciones existentes.

### Cambio posterior de aeropuerto

`PUT /flights/{id}/airports` (sólo CO/OPERACIONES, con el horario acordado y antes del inicio) es transaccional y **no cancela asignaciones en silencio**:

* Si cambia la salida a otra jurisdicción y el comandante asignado ya no es elegible, se rechaza **todo el cambio** (`409 AIRPORT_CHANGE_REQUIRES_COMMANDER_REVALIDATION`: «La modificación del aeropuerto requiere volver a verificar la elegibilidad del comandante…»). Se resuelve en el mismo pedido con `nuevoComandanteId` (se valida contra la jurisdicción nueva; se avisa al desasignado y al nuevo y se recompone la tripulación) o con una `excepcionGeografica` justificada y autorizada por CO.
* Dentro de la misma jurisdicción no se desasigna a nadie. Una excepción válida para esa provincia se conserva.
* Cada aeropuerto cambiado vuelve a `PROPUESTO`; el comandante debe reconfirmar; la ruta presentada o aprobada pasa a `REQUIERE_REVISION`; se notifica (`AIRPORTS_PROPOSED`) y se audita (`SET_AIRPORTS`, con valores anteriores y nuevos). La ficha informa si la aeronave asignada ya no está en el aeropuerto de salida (se resuelve con el cambio de aeronave existente).

## 5. Modelo de datos

| Cambio | Detalle |
|---|---|
| **V64** `perfiles_comandante` | Se eliminan `id_localidades_actual`, su FK compuesta, índice y CHECK. Antes, **cada localidad previa se conserva en `eventos_auditoria`** (`COMMANDER_LOCATION_UPDATE`, JSON antes/después). Se agrega un CHECK: fecha y responsable van juntos. `id_provincias` (ya igual a la provincia de la localidad) es la ubicación vigente; no se pierde ningún usuario ni comandante. |
| **V64** `excepciones_geograficas_comandante` | `id_aeropuerto_salida`, `id_provincia_salida` (backfill con la provincia de la localidad de salida de V63), `id_localidad_salida` pasa a nullable, CHECK de tipos ampliado. |
| **V64** `vuelos` | `estado_aeropuerto_origen/destino` (`PROPUESTO`/`CONFIRMADO`, CHECK coherente con el aeropuerto), `id_usuario_aeropuertos`, `fecha_aeropuertos`. Los aeropuertos existentes quedan `CONFIRMADO` (eran los definitivos); no se inventan aeropuertos ni se modifican datos históricos. |
| **V64/V65** `localidades` | `latitud`, `longitud` (centroide aproximado, V65 desde el dataset local ya versionado; sin servicios externos). |
| Sin cambios | `vuelos_sanitarios.id_localidad_origen/destino`, `rutas_vuelo` (incluye aeropuerto alternativo), `aeropuertos`, `provincias`. No se crearon tablas duplicadas de provincias. |

Flyway no se modificó para migraciones anteriores (V63 queda intacta).

## 6. API

| Endpoint | Cambio |
|---|---|
| `PUT /api/commanders/{id}/location` | Body `{provinciaId|null, motivo}` (`@StrictJson`: una `localidadId` se rechaza con 400). `POST /api/catalogs/commanders/{id}/location` (contrato anterior) equivale a lo mismo y ahora también registra responsable y fecha. |
| `GET /api/commanders/locations` | Filas sin localidad; estados `CONOCIDA`/`DESCONOCIDA`. |
| `GET /api/flights/{id}/commander-candidates[?aeropuertoSalidaId=]` | `salida`, `advertencia`, `ordinarios`, `noElegiblesEnJurisdiccion`, `excepcionales`, `fueraDeJurisdiccion`. El parámetro opcional evalúa contra un aeropuerto hipotético (sólo lectura). |
| `GET /api/flights/{id}/airport-candidates?tipo=SALIDA\|LLEGADA&q=` | **Nuevo.** CO/OPERACIONES y el comandante asignado. |
| `PUT /api/flights/{id}/airports` | **Nuevo.** CO/OPERACIONES. `{origenId?, destinoId?, nuevoComandanteId?, excepcionGeografica?, justificacion?}`. |
| `POST /api/flights/{id}/operational-planning` | Los aeropuertos ya no se limitan a la provincia del paciente (con justificación fuera de ella); quedan `CONFIRMADO`. |
| `GET /api/flights/{id}` | Nuevo bloque `aeropuertos` (salida, llegada, estado, pendientes, advertencia de elegibilidad preliminar). |
| Códigos | `COMMANDER_OUTSIDE_DEPARTURE_JURISDICTION`, `AIRPORT_PROVINCE_UNKNOWN`, `AIRPORT_CHANGE_REQUIRES_COMMANDER_REVALIDATION`, `AIRPORT_OUTSIDE_PATIENT_PROVINCE_REASON_REQUIRED`, `AEROPUERTOS_SIN_CONFIRMAR`. |

## 7. Interfaz (React)

* `commanderLocations.jsx`: «Provincia / Jurisdicción» (23 provincias + CABA + «Ubicación desconocida»), última actualización y responsable; sin localidad.
* `airportPlanning.jsx` (nuevo): panel «Aeropuertos de salida y llegada» con **origen y destino del paciente** diferenciados de los aeropuertos, estado (Pendiente/Propuesto/Confirmado), datos pendientes, advertencia de elegibilidad preliminar, selector con distancias aproximadas, justificación fuera de la jurisdicción del paciente y resolución del comandante cuando el cambio lo deja inelegible; y la **planificación aeroportuaria del comandante** (reemplaza los selectores por provincia de `Cmd`).
* `resourceAssignment.jsx`: provincia/jurisdicción actual, **elegibilidad geográfica** (preliminar / en jurisdicción / excepción / fuera), candidatos por jurisdicción de salida.
* `negotiation.jsx`: «Origen del paciente / Destino del paciente» (no son aeropuertos). `flightStages.js`: sección `aeropuertos`.

## 8. Pruebas

Ver el detalle de resultados en el informe de entrega. Cobertura nueva: `CommanderGeographyTest`, `AirportCandidateServiceTest`, ampliación de `AircraftAssignmentFlightServiceTest`, `CommanderLocationServiceTest`, `ResourceAssignmentAuthorizationTest`; Vitest `airportPlanning`, `commanderLocations`, `resourceAssignment`; E2E reales contra SQL Server y Chrome: `e2e-jurisdiccion-aeropuertos` (escenarios A–I), `e2e-asignacion-recursos` y `-ui`, `e2e-perfiles-comandante`.

## 9. Límites conocidos

* La distancia es en línea recta sobre el centroide de la localidad (aproximada); no hay tiempos de traslado terrestre ni condiciones operativas del aeropuerto (pista, horarios, meteo) en el catálogo, por lo que la factibilidad operativa sigue siendo juicio del comandante y de CO.
* Una nueva ubicación del comandante posterior a la asignación no revalida automáticamente vuelos ya `PLANIFICADO` (sí lo hace al completar una reserva y ante cambios de aeropuerto).
* La migración de la base habitual no se ejecutó automáticamente: ver el procedimiento de despliegue del informe de entrega.
