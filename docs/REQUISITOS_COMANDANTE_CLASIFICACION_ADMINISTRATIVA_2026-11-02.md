# Requisitos del comandante: clasificación administrativa, habilitación y cómo regularizarlos (2026-11-02)

Origen: el comandante *Lopez, Maria* (usuario `maria123`, licencia `ARG0000`) estaba registrada en Tucumán y aun así aparecía en «En la jurisdicción, pero no disponibles» con el motivo «Falta la clasificación administrativa para esta función».

## Diagnóstico (comprobado contra el código y la base habitual)

| Pregunta | Respuesta |
|---|---|
| ¿Qué es la clasificación administrativa? | Un registro que dice qué **función de tripulación** (COMANDANTE, COPILOTO, MEDICO, ENFERMERO) puede cumplir una persona. Es distinta del **rol de acceso** (qué puede hacer en la aplicación), de la **licencia** del perfil de comandante y de la **habilitación profesional** (documento verificado manualmente). Tampoco es la provincia operativa. |
| ¿Dónde se guarda? | Tabla `clasificaciones_tripulacion` (V58): `id_usuarios`, `id_roles_tripulacion`, quién clasificó y cuándo, y —si se retira— `fecha_baja`, `id_usuario_baja`, `motivo_baja`. Vigente = `fecha_baja IS NULL`. |
| ¿Quién la valida? | `CrewManagementService.evaluateOn` (única decisión para seleccionar, asignar, replanificar, consultar e iniciar). Exige, para COMANDANTE: cuenta activa, clasificación vigente, rol de acceso COMANDANTE, licencia registrada, sin informes finales vencidos, habilitación profesional verificada y vigente y, con vuelo, que no tenga otro vuelo superpuesto. Las reglas por función están en `CrewManagementService.RULES`. |
| ¿Quién la otorga, actualiza o revoca? | Sólo ADMINISTRADOR (`/api/crew-qualifications`, 403 para los demás roles, incluido el propio comandante y Centro de Operaciones). Clasificar es idempotente y auditado (`CREW_QUALIFICATION`/`CREATE`); retirar exige que no haya vuelos activos en esa función y conserva el historial. |
| ¿Había una interfaz? | Sí: Administración → Usuarios → «Clasificación administrativa de tripulación» (más «Habilitaciones profesionales» debajo y la pantalla «Habilitaciones» para las políticas). |
| ¿Por qué Lopez, Maria no cumple? | En la base habitual `clasificaciones_tripulacion` está **vacía** (ninguna persona está clasificada) y `habilitaciones_profesionales` también (0 filas). Maria tiene rol COMANDANTE, licencia `ARG0000` y ubicación Tucumán, pero nadie le registró la clasificación ni la habilitación. **Además, `politicas_habilitacion` está vacía** (0 filas): mientras no exista una política de suficiencia activa para COMANDANTE, nadie es elegible aunque tenga clasificación y habilitación verificada (`POLITICA_HABILITACION_NO_CONFIGURADA`). Esa política es una decisión de la organización pendiente desde I-5.8 (`docs/DECISION_POLITICAS_PROFESIONALES_I58_2026-10-28.md`, D1); este cambio no la inventa ni la carga. |
| ¿Defecto o configuración? | **Datos faltantes (configuración incompleta), no un defecto de la lógica de elegibilidad.** Las validaciones eran correctas. Sí había dos defectos de **explicación y administración**: (1) la evaluación se detenía en el primer faltante —tras clasificar a Maria habría aparecido otro bloqueo por la habilitación— y el mensaje no decía quién ni cómo resolverlo; (2) el administrador no tenía una vista de «qué le falta a cada comandante». |

La confirmación del aeropuerto **no** interviene: la evaluación del comandante se hace con la jurisdicción de salida prevista (aeropuerto propuesto o provincia del paciente) y se revalida al confirmar o cambiar el aeropuerto (V64). No hay dependencia circular: CO puede reservar al comandante con el aeropuerto sólo propuesto y el comandante lo confirma después.

## Cambios

Backend (sin migraciones: no cambia el modelo de datos):
- `CrewManagementService.requirements(...)`: lista **todos** los requisitos (cuenta, rol de acceso, licencia, clasificación, política de suficiencia definida, habilitación, informes finales, disponibilidad) con estado preciso, quién lo resuelve y el procedimiento. `evaluateOn` sigue siendo la decisión; una prueba comprueba que ambos coinciden siempre.
- Clasificación con causa precisa: `NO_REGISTRADA`, `RETIRADA` (con fecha y motivo), `OTRA_FUNCION` (clasificado sólo para otras funciones). El código de error sigue siendo `CLASIFICACION_INCOMPATIBLE`.
- `GET /api/crew-qualifications/{userId}/requirements?role=COMANDANTE` y `GET /api/crew-qualifications/requirements/commanders?q=&pendientes=true&size=100` (sólo ADMINISTRADOR).
- `GET /api/flights/{id}/commander-candidates`: cada comandante no elegible trae `requisitosFaltantes`.
- `UserRepository.findActiveCommanderAccounts`.

Frontend:
- `crewRequirements.jsx`: `RequirementList`, `UserRequirements` («Requisitos para operar» de la persona seleccionada) y `PendingCommanders` («Comandantes con requisitos pendientes», con búsqueda y botón «Gestionar»), integrados en Administración → Usuarios.
- Asignación de recursos de CO: los comandantes bloqueados muestran cada requisito pendiente, quién lo resuelve y el procedimiento.

## Procedimiento legítimo para habilitar a un comandante (ej. Lopez, Maria)

Lo hace un **administrador** (CO no puede otorgar nada de esto):
0. **Una sola vez para toda la función:** la organización decide y un administrador carga la política de suficiencia de COMANDANTE (Administración → Habilitaciones → Políticas; ver el documento de decisión D1). Sin ella el requisito «Política de suficiencia de habilitación definida» queda pendiente para todos los comandantes.
1. Administración → **Usuarios** → «Comandantes con requisitos pendientes» → buscar `maria123` → **Gestionar**. «Requisitos para operar» muestra qué falta.
2. «Clasificación administrativa de tripulación» → **Clasificar como Comandante**.
3. En la misma pantalla, «Habilitaciones profesionales» → **Nueva habilitación** (función Comandante, tipo, número, organismo, vencimiento), adjuntar el documento respaldatorio y **verificarla** (revisión manual). El tipo de habilitación debe ser uno de los aceptados por la política del paso 0.
4. **Actualizar requisitos**: debe decir «Cumple todos los requisitos para Comandante». Centro de Operaciones ya puede seleccionarla (basta con actualizar la página del vuelo).

No se crearon clasificaciones ni habilitaciones automáticamente: la base habitual no se modificó con datos de Maria.

## Pruebas

- Unitarias: `CrewRequirementsTest` (8), `RequirementList`/`UserRequirements`/`PendingCommanders` (6) y el caso de CO en `resourceAssignment.test.jsx`.
- E2E API `e2e-requisitos-comandante.cjs` (9 bloques: pruebas 1 a 7 del pedido + permisos + regresión del cambio de aeropuerto) y E2E Chrome `e2e-requisitos-comandante-ui.cjs` (3 bloques). Ambos están en la suite completa.
