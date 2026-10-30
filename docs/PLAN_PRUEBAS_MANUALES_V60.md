# Plan de pruebas manuales V60

Fecha de preparación: 2026-10-30. Este plan inicia todos los casos en **NO EJECUTADA**: no registra resultados ni presupone aprobaciones manuales.

## Alcance y preparación

Ejecutar en el entorno habitual publicado, con cuentas de prueba preexistentes de cada rol y datos sintéticos. No usar pacientes, documentos ni credenciales reales. Registrar por caso la hora, el usuario de prueba, el identificador de la solicitud/vuelo y toda evidencia (captura, respuesta de error o evento de auditoría), sin incluir JWT ni contraseñas.

Precondiciones comunes: frontend disponible, backend sano, sesión iniciada con el rol indicado y catálogos mínimos existentes. Para los casos que modifiquen una entidad, usar un identificador de prueba único y revertir sólo los datos creados por la prueba mediante las funciones normales de la aplicación.

### Preparación de datos de campaña

La persona Administradora debe crear exclusivamente desde el panel administrativo, y con datos ficticios, las cuentas DTS, Centro de Operaciones y Comandante. Usar identificadores de campaña únicos, correos bajo un dominio de prueba y contraseñas aleatorias fuertes almacenadas fuera del repositorio; no anotarlas en este documento, capturas, tickets ni datos de prueba. No crear usuarios mediante SQL ni reutilizar identidades de pacientes reales.

Antes del escenario integral, el Administrador debe confirmar en pantalla que existen dos aeropuertos activos, sus provincias/localidades activas, tipos de vuelo/prioridades, una aeronave ficticia activa con ubicación y un Comandante ficticio activo cuyo perfil sea compatible con esa ubicación. Si falta alguno, crearlo o configurarlo desde la interfaz administrativa y registrar su identificador sintético.

## Escenario integral de punta a punta

### MAN-E2E-01 — Vuelo sanitario completo de prueba

- Roles: Administrador, DTS, Centro de Operaciones y Comandante.
- Funcionalidad: ciclo completo desde altas ficticias hasta auditoría de cierre.
- Precondiciones: datos de campaña creados por la interfaz; paciente ficticio existente o creado por el flujo permitido; aeronave y comandante disponibles; ningún dato real seleccionado.
- Pasos: 1. El Administrador da de alta y verifica los tres usuarios de prueba y sus roles. 2. El DTS crea una solicitud sanitaria para el paciente ficticio. 3. Operaciones negocia el horario y la aprueba. 4. Operaciones asigna la aeronave, el comandante y la tripulación ficticios. 5. El Comandante planifica y presenta la ruta. 6. Operaciones aprueba la ruta. 7. Operaciones inicia y finaliza el vuelo por las transiciones permitidas. 8. El Comandante presenta el informe final dentro del flujo. 9. Operaciones revisa y aprueba el informe. 10. Se consulta el cierre del vuelo y la auditoría filtrada por el identificador de campaña.
- Resultado esperado: cada transición se habilita sólo después de su predecesora, conserva responsable/fecha/motivo y es visible para el rol autorizado; no hay asignaciones incompatibles, accesos entre roles ni eventos faltantes en auditoría; el vuelo e informe terminan en los estados de cierre aprobados por el sistema.
- Prioridad: Crítica.
- Estado: NO EJECUTADA.

## Casos DTS

### MAN-DTS-01 — Inicio de sesión y sesión

- Rol: DTS.
- Funcionalidad: autenticación y navegación autorizada.
- Precondiciones: cuenta DTS activa.
- Pasos: 1. Abrir la aplicación. 2. Iniciar sesión. 3. Recargar una vista protegida. 4. Cerrar sesión e intentar volver con la URL protegida.
- Resultado esperado: accede sólo a las vistas DTS; la sesión persiste tras recarga y, al cerrar sesión, la vista protegida exige autenticación.
- Prioridad: Alta.
- Estado: NO EJECUTADA.

### MAN-DTS-02 — Solicitud sanitaria con paciente existente

- Rol: DTS.
- Funcionalidad: creación de solicitud y selección de paciente.
- Precondiciones: paciente sintético existente y catálogos de origen/destino activos.
- Pasos: 1. Buscar y seleccionar el paciente. 2. Completar origen, destino, fecha y motivo. 3. Enviar. 4. Abrir el detalle creado.
- Resultado esperado: sólo se acepta una selección válida; se crea una solicitud trazable con el paciente, datos y estado inicial correctos.
- Prioridad: Alta.
- Estado: NO EJECUTADA.

### MAN-DTS-03 — Urgencia extrema y validaciones

- Rol: DTS.
- Funcionalidad: urgencia extrema y validación de formulario.
- Precondiciones: cuenta DTS activa.
- Pasos: 1. Intentar enviar datos obligatorios vacíos o una localidad escrita sin seleccionarla. 2. Corregirlos. 3. Marcar urgencia extrema y enviar.
- Resultado esperado: no se envía una selección inválida; los mensajes explican el campo a corregir y la solicitud válida queda identificada como urgente.
- Prioridad: Alta.
- Estado: NO EJECUTADA.

### MAN-DTS-04 — Negociación, estados y notificaciones

- Rol: DTS.
- Funcionalidad: propuesta de horario, consulta de estado y notificaciones.
- Precondiciones: solicitud DTS en negociación con una propuesta de Operaciones.
- Pasos: 1. Abrir detalle. 2. Aceptar o proponer otro horario con motivo. 3. Actualizar la pantalla. 4. Consultar notificaciones.
- Resultado esperado: se conserva el historial y el estado vigente; no se muestran acciones ajenas al DTS; la notificación refleja la transición sin datos de terceros.
- Prioridad: Alta.
- Estado: NO EJECUTADA.

## Casos Centro de Operaciones

### MAN-OPS-01 — Gestión, aprobación y rechazo de solicitudes

- Rol: Centro de Operaciones.
- Funcionalidad: revisión de solicitudes.
- Precondiciones: dos solicitudes sintéticas pendientes.
- Pasos: 1. Abrir cada solicitud. 2. Aprobar una con datos completos. 3. Rechazar la otra con motivo. 4. Recargar listados y detalles.
- Resultado esperado: cada transición válida queda visible, motivada y auditada; no se puede rechazar sin el dato obligatorio ni alterar solicitudes sin permiso.
- Prioridad: Alta.
- Estado: NO EJECUTADA.

### MAN-OPS-02 — Negociación y asignación de recursos

- Rol: Centro de Operaciones.
- Funcionalidad: horario, aeronave, comandante y tripulación.
- Precondiciones: solicitud aprobada, aeronave y tripulación de prueba disponibles y habilitadas.
- Pasos: 1. Proponer horario. 2. Asignar aeronave, comandante y tripulación. 3. Intentar una asignación que produzca conflicto. 4. Confirmar la asignación válida.
- Resultado esperado: se rechazan los conflictos de disponibilidad, estado o habilitación; la asignación válida persiste y se refleja en el detalle del vuelo.
- Prioridad: Alta.
- Estado: NO EJECUTADA.

### MAN-OPS-03 — Coordinaciones y rutas

- Rol: Centro de Operaciones.
- Funcionalidad: coordinaciones aeroportuarias y revisión de rutas.
- Precondiciones: vuelo planificado con aeropuertos válidos.
- Pasos: 1. Registrar una coordinación. 2. Consultar la ruta propuesta. 3. Aprobar o devolver para revisión con motivo. 4. Recargar el vuelo.
- Resultado esperado: la coordinación y la decisión de ruta quedan relacionadas con el vuelo, con estado, autor y motivo; las acciones no permitidas no se ofrecen.
- Prioridad: Alta.
- Estado: NO EJECUTADA.

### MAN-OPS-04 — Inicio, finalización e informe

- Rol: Centro de Operaciones.
- Funcionalidad: ciclo operativo e informes finales.
- Precondiciones: vuelo sintético listo para iniciar y, luego, finalizar.
- Pasos: 1. Iniciar el vuelo. 2. Intentar una transición inválida. 3. Finalizarlo. 4. Revisar la obligación e informe final asociado.
- Resultado esperado: sólo se permiten transiciones de estado válidas; el cierre crea o muestra la obligación correspondiente y conserva la trazabilidad.
- Prioridad: Alta.
- Estado: NO EJECUTADA.

## Casos Comandante

### MAN-CMD-01 — Vuelos asignados y planificación de ruta

- Rol: Comandante.
- Funcionalidad: consulta de asignaciones y ruta.
- Precondiciones: vuelo con comandante de prueba asignado.
- Pasos: 1. Iniciar sesión como comandante. 2. Abrir sus vuelos. 3. Cargar o editar la planificación permitida. 4. Enviar a revisión.
- Resultado esperado: sólo ve vuelos propios; la planificación valida sus datos, conserva versiones y queda en el estado de revisión esperado.
- Prioridad: Alta.
- Estado: NO EJECUTADA.

### MAN-CMD-02 — Gestión operativa y documentación

- Rol: Comandante.
- Funcionalidad: bitácora y documentos del vuelo.
- Precondiciones: vuelo asignado en estado que permita operación; PDF sintético válido.
- Pasos: 1. Registrar una novedad operativa. 2. Adjuntar un PDF permitido. 3. Consultar historial. 4. Intentar modificar contenido bloqueado o ajeno.
- Resultado esperado: se registra la novedad; el documento y sus versiones quedan asociados al vuelo; bloqueos, permisos y errores se explican sin exponer información sensible.
- Prioridad: Alta.
- Estado: NO EJECUTADA.

### MAN-CMD-03 — Informe final y plazo de 48 horas

- Rol: Comandante.
- Funcionalidad: cierre e informe final.
- Precondiciones: vuelo finalizado y asignado al comandante.
- Pasos: 1. Abrir obligación de informe. 2. Completar y enviar datos válidos. 3. Intentar datos incompletos. 4. Consultar el resultado desde el vuelo.
- Resultado esperado: se valida el contenido y responsable; el informe válido queda asociado y el estado/plazo se muestran correctamente; los datos incompletos no se guardan.
- Prioridad: Alta.
- Estado: NO EJECUTADA.

### MAN-CMD-04 — Restricciones y bloqueos

- Rol: Comandante.
- Funcionalidad: restricciones de habilitación, documentos y estado.
- Precondiciones: un vuelo con una restricción controlada o documento bloqueado de prueba.
- Pasos: 1. Consultar el bloqueo. 2. Intentar la acción restringida. 3. Consultar la explicación y, si corresponde, solicitar la acción permitida.
- Resultado esperado: el sistema impide la operación riesgosa, indica el motivo y no permite eludirlo mediante navegación directa.
- Prioridad: Alta.
- Estado: NO EJECUTADA.

## Casos Administrador

### MAN-ADM-01 — Usuarios, roles y bajas

- Rol: Administrador.
- Funcionalidad: administración de usuarios y permisos.
- Precondiciones: cuenta administrativa y usuario sintético no crítico.
- Pasos: 1. Crear o activar usuario de prueba. 2. Asignar rol permitido. 3. Verificar acceso con esa cuenta. 4. Dar de baja administrativa y volver a probar acceso.
- Resultado esperado: los cambios exigen datos válidos, se auditan y cambian los permisos de forma efectiva; una cuenta dada de baja no mantiene acceso útil.
- Prioridad: Alta.
- Estado: NO EJECUTADA.

### MAN-ADM-02 — Catálogos y geografía

- Rol: Administrador.
- Funcionalidad: provincias, localidades, aeropuertos, tipos y prioridades.
- Precondiciones: elemento de catálogo sintético que no esté en uso operativo.
- Pasos: 1. Crear o editar el elemento. 2. Buscarlo desde un formulario operativo. 3. Intentar retirarlo si tiene dependencia. 4. Consultar mensaje y estado.
- Resultado esperado: los catálogos activos se ofrecen dinámicamente; se preservan referencias históricas y se bloquean cambios incompatibles.
- Prioridad: Media.
- Estado: NO EJECUTADA.

### MAN-ADM-03 — Aeronaves, habilitaciones y políticas

- Rol: Administrador.
- Funcionalidad: recursos y políticas de habilitación.
- Precondiciones: aeronave y personal de prueba; no activar políticas reales sin decisión de negocio aprobada.
- Pasos: 1. Consultar aeronaves y habilitaciones. 2. Registrar una modificación no operativa permitida. 3. Revisar políticas existentes y su estado. 4. Intentar una activación sin requisitos completos.
- Resultado esperado: se muestran estado e historial; la activación incompleta se rechaza y no crea elegibilidad implícita.
- Prioridad: Alta.
- Estado: NO EJECUTADA.

### MAN-ADM-04 — Auditoría y configuración administrativa

- Rol: Administrador.
- Funcionalidad: consulta de auditoría y preparación.
- Precondiciones: existen acciones sintéticas recientes de los casos anteriores.
- Pasos: 1. Filtrar auditoría por entidad/fecha. 2. Abrir un evento. 3. Consultar preparación del sistema. 4. Intentar acceder con un rol no administrador en una sesión independiente.
- Resultado esperado: la auditoría es trazable e inmutable desde la interfaz; la información sensible se oculta y los controles administrativos devuelven acceso denegado a otros roles.
- Prioridad: Alta.
- Estado: NO EJECUTADA.

## Pruebas transversales

### MAN-TR-01 — Autorización entre roles

- Rol: DTS, Centro de Operaciones, Comandante y Administrador.
- Funcionalidad: control de acceso.
- Precondiciones: una sesión por rol y recursos de prueba conocidos.
- Pasos: 1. Intentar abrir URL y realizar acción administrativa, operativa y de otro titular desde cada rol. 2. Repetir tras recargar y con sesión cerrada.
- Resultado esperado: cada rol sólo accede a sus acciones y datos autorizados; no hay exposición de datos en respuestas de error.
- Prioridad: Alta.
- Estado: NO EJECUTADA.

### MAN-TR-02 — Validaciones y errores HTTP

- Rol: Todos.
- Funcionalidad: entradas inválidas, archivos y mensajes de error.
- Precondiciones: formularios disponibles.
- Pasos: 1. Enviar campos obligatorios vacíos, longitudes extremas y tipos de archivo incorrectos. 2. Forzar una operación duplicada y una versión desactualizada controlada.
- Resultado esperado: el frontend conserva datos seguros para corregir; el backend devuelve un error coherente (no 500), sin trazas ni secretos.
- Prioridad: Alta.
- Estado: NO EJECUTADA.

### MAN-TR-03 — Concurrencia e integridad de datos

- Rol: Centro de Operaciones y Comandante.
- Funcionalidad: edición concurrente de vuelo, recurso y documento.
- Precondiciones: dos sesiones de prueba autorizadas sobre el mismo recurso.
- Pasos: 1. Abrir el mismo recurso en ambas sesiones. 2. Confirmar un cambio desde la primera. 3. Guardar un cambio incompatible desde la segunda. 4. Recargar ambas vistas.
- Resultado esperado: no se pierde información ni se duplica asignación; el segundo actor recibe conflicto o bloqueo explícito y se muestra el estado vigente.
- Prioridad: Alta.
- Estado: NO EJECUTADA.

### MAN-TR-04 — Navegación, carga y experiencia de usuario

- Rol: Todos.
- Funcionalidad: navegación, recarga y estados de carga.
- Precondiciones: datos de prueba suficientes para listados y detalles.
- Pasos: 1. Navegar entre listados y detalles. 2. Cambiar selección mientras una acción termina. 3. Recargar. 4. Simular una desconexión breve del navegador y reintentar.
- Resultado esperado: los estados de carga/error son comprensibles; la pantalla no muestra el detalle de otro elemento ni queda en blanco; la sesión y las restricciones se respetan.
- Prioridad: Media.
- Estado: NO EJECUTADA.

## Cierre de ejecución

Para cada caso, registrar **APROBADA**, **FALLIDA**, **BLOQUEADA** o **NO EJECUTADA**, junto con evidencia y el identificador de los datos de prueba. Una falla de prioridad Alta, acceso no autorizado, fuga de información o corrupción de datos bloquea el inicio de operación hasta su análisis y corrección.
