# Diseño pendiente de las cuatro tablas operativas

Relevamiento de `sys.columns`, claves foráneas, índices y restricciones en SQL Server E2E con Flyway V32. Son propuestas para implementar y validar; todavía no son funcionalidades existentes. No se eliminan datos ni tablas.

## `rutas_vuelo`

> Implementado y ampliado: la planificación versionada existe desde V37 y la revisión operativa de cada versión desde V55 (I-4); ver `REVISION_OPERATIVA_RUTAS_I4_2026-10-25.md`. Lo que sigue es la propuesta original.

- Datos: vuelo y usuario creador obligatorios, versión y marca de vigente, altitud en pies, distancia en millas náuticas, tiempo estimado en minutos, observaciones y fecha; los cuatro datos descriptivos son opcionales en el esquema. FK a `vuelos` y `usuarios`; `version > 0` y unicidad `(id_vuelos, version)`.
- Propuesta: el comandante asignado registra la ruta durante la planificación; Operaciones y lectores autorizados del vuelo consultan vigente e historial. Corregir creando una nueva versión, no sobrescribir ni borrar el historial. Validar magnitudes no negativas, al menos un dato significativo, límites y estado del vuelo; bloqueo transaccional de la fila del vuelo y control de versión.
- Interfaz: formulario e historial en planificación del comandante; lectura en Operaciones. Pruebas: permisos por vuelo, versiones, concurrencia, estados, integridad y persistencia SQL/reinicio.

## `informacion_hangar`

- Datos: vuelo, registrador, versión/vigencia, combustible en litros opcional, preparación completa, observaciones y fecha. FK a `vuelos` y `usuarios`; unicidad `(id_vuelos, version)`. No hay checklist en V32.
- Propuesta: Operaciones registra manualmente preparación y combustible antes del inicio; comandante asignado consulta. Una corrección genera una nueva versión. Validar combustible no negativo, estado del vuelo, registro completo y autorización; no afirmar que la preparación se verificó automáticamente.
- Interfaz: formulario y estado vigente/historial en Operaciones, lectura para comandante. Pruebas: restricciones, versionado, permisos, simultaneidad, persistencia y visualización.

## `coordinaciones_aa2000`

- Datos: vuelo, registrador, versión/vigencia, fecha del slot, contacto, estado (`PENDIENTE`, `CONFIRMADO`, `RECHAZADO`), observaciones y fecha de registro; FK a `vuelos` y `usuarios`, versión positiva y unicidad `(id_vuelos, version)`.
- Propuesta: Operaciones registra manualmente comunicaciones de coordinación antes de la operación, identifica contacto y detalle de la confirmación o rechazo, y corrige mediante nueva versión; comandante asignado consulta. El estado confirmado significa únicamente que un usuario registró una confirmación recibida: no hay conexión automática con AA2000. Validar estado, campos de respaldo y fase del vuelo.
- Interfaz: registro manual, estado e historial en Operaciones; consulta para comandante. Pruebas: validación, permisos, cambios y persistencia, sin simular una respuesta externa.

## `bitacora_vuelos`

- Datos: vuelo obligatorio, actor opcional, campo obligatorio, valor anterior/nuevo opcionales y fecha; FK a `vuelos` y `usuarios`. No se detectó escritura o consulta de aplicación. `eventos_auditoria` ya registra eventos y snapshots, por lo que el límite entre ambas estructuras debe definirse para evitar duplicidad incoherente.
- Propuesta: bitácora automática por campo de cambios operativos seleccionados, en la misma transacción que modifica el vuelo, con valores mínimos no clínicos; consulta cronológica por vuelo para Operaciones y lectores autorizados. No crear una pantalla de carga manual ni registrar secretos o datos clínicos. Conservar `eventos_auditoria` para trazabilidad de acciones; determinar y documentar exhaustivamente qué campos se registran y su política de retención antes de implementar.
- Interfaz: historial de cambios en detalle de vuelo, si se valida su necesidad. Pruebas: inserción automática, actor, rollback, visibilidad, privacidad e integridad; no borrar históricos existentes.

## Hallazgo transversal de integridad

En V32 E2E se observó unicidad por vuelo y número de versión para ruta, hangar y coordinación, pero **no apareció ningún índice filtrado** que asegure una sola fila vigente en esas tres tablas, pese a que V2 los había creado. Antes de activar versionado se deben inspeccionar datos existentes y la historia de migraciones; proponer una migración incremental que detecte conflictos y preserve datos, y pruebas concurrentes en SQL Server. No se debe eliminar ni elegir automáticamente una versión si hay conflictos históricos.
## Dependencias de tripulación detectadas

`roles_tripulacion` contiene COMANDANTE, COPILOTO, ENFERMERO y MEDICO; `usuarios_roles` sólo expresa roles de acceso, no habilitaciones para estas cuatro funciones. La tabla `vuelos_tripulantes` tiene unicidad por vuelo y usuario, pero el endpoint previo acepta una función del catálogo sin comprobar habilitación, actividad o conflictos de horario y no existe interfaz de gestión. El perfil de comandante y su licencia no acreditan automáticamente otra función. Tampoco alcanza con validar sólo la asignación: al reprogramar un vuelo, reasignar recursos o cambiar su horario se deben volver a validar los tripulantes existentes. La implementación debe incorporar una fuente explícita y administrable de habilitaciones, serializar los cambios por persona, validar ambos lados de la superposición y tratar coherentemente al comandante generado por el flujo de vuelo. Deben definirse también expiración y autoridad de otorgamiento antes de afirmar que una habilitación representa licencia profesional vigente. La gestión y su prueba SQL concurrente siguen pendientes.
