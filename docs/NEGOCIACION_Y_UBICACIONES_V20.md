# Negociación de horarios y ubicaciones (V20)

## Modelo y transiciones

`fecha_solicitada` conserva la propuesta original de DTS. `fecha_planificada_salida` se escribe una sola vez al quedar aceptado el horario definitivo. La tabla `negociaciones_horario_vuelo` conserva cada hecho, su actor, motivo y fecha, y complementa a `eventos_auditoria`.

| Desde | Acción autorizada | Hacia |
|---|---|---|
| `SOLICITADO` | CO acepta horario DTS | `APROBADO` |
| `SOLICITADO` | CO contrapropone con motivo | `PENDIENTE_RESPUESTA_DTS` |
| `SOLICITADO` | CO rechaza con motivo | `CANCELADO` |
| `PENDIENTE_RESPUESTA_DTS` | DTS acepta | `APROBADO` |
| `PENDIENTE_RESPUESTA_DTS` | DTS rechaza con motivo | `CANCELADO` |
| `APROBADO` | CO asigna comandante y aeronave | `PLANIFICADO` |
| `PLANIFICADO` | Comandante completa aeropuertos y llegada | `PLANIFICADO` |
| `PLANIFICADO` | CO inicia | `EN_CURSO` |
| `EN_CURSO` | CO finaliza | `FINALIZADO` |

Las operaciones de transición bloquean el vuelo pesimistamente; una respuesta repetida ya no encuentra el estado permitido. No se pueden asignar recursos en `SOLICITADO` ni en `PENDIENTE_RESPUESTA_DTS`.

## Ubicaciones y catálogos

`perfiles_comandante.provincia_actual_id` es nullable para no inventar una ubicación para los registros existentes. Un comandante sin provincia no es asignable. `aeronaves.aeropuerto_actual_id` ya existía desde V18 y se mantiene nullable por el mismo motivo.

Al asignar, backend exige que la provincia actual del comandante y la provincia del aeropuerto actual de la aeronave coincidan con la provincia de la localidad de origen solicitada. Al finalizar, en una única transacción, actualiza comandante a la provincia del aeropuerto de destino y aeronave al aeropuerto de destino; ambos cambios quedan auditados.

Los endpoints manuales `POST /api/catalogs/commanders/{id}/location` y `POST /api/catalogs/aircraft/{id}/location` sólo permiten `ADMINISTRADOR`, `OPERACIONES` o `CENTRO_OPERACIONES` y registran el actor y los valores anterior/nuevo.

V20 completa `aeropuertos.localidad_id` sólo si `ciudad + provincia_id` encuentra exactamente una localidad oficial (comparación sin tildes). Las filas sin equivalencia o ambiguas conservan el texto histórico y no se eliminan columnas aún: es la condición segura necesaria antes de una migración destructiva. El problema de `localidad_id` nulo proviene de V15/V16: los aeródromos se cargaron con provincia referencial, pero no se asociaron contra el catálogo de localidades. Se requiere revisar las filas que continúen nulas y corregirlas con un identificador oficial antes de retirar `ciudad` y `provincia`.

## API y permisos

- CO: `/schedule/accept`, `/schedule/counterproposal`, `/schedule/reject`, disponibilidad y `/resources`.
- DTS propietario: `/schedule/response`; la pertenencia se valida en servicio, no sólo con JWT.
- Comandante asignado: `/operational-planning`; el backend filtra/valida aeropuertos por provincia de las localidades solicitadas. La salida se muestra fija y no forma parte del DTO de entrada.

Se generan notificaciones para contrapropuesta, respuesta de DTS, rechazo directo y asignación del comandante. Las acciones de propuesta, contrapropuesta, respuestas, rechazo, asignación y cambios de ubicación se registran además en `eventos_auditoria`.
