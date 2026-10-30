# I-2 — Contactos laborales de la tripulación para el Centro de Operaciones — 24 de octubre de 2026

Este incremento conecta `correos_electronicos` y `telefonos` con la asignación real de tripulación: Operaciones / Centro de Operaciones consulta, **de forma explícita, desde el detalle del vuelo**, los contactos de tipo `LABORAL` del comandante y de los tripulantes vigentes. **No hay migración ni tablas nuevas** (la base aislada sigue en Flyway V53 con 41 tablas; la habitual sigue en V47).

## 1. Estado inicial

| Aspecto | Hallazgo |
|---|---|
| Git | Rama `main`, commit base `e8fce25`, 119 entradas locales sin commit (modificadas y nuevas) al comenzar. Ningún commit, push, reset ni clean durante I-2. |
| Flyway | Habitual `vuelos_sanitarios` en **V47** (sólo lectura: 40 tablas de aplicación más `sysdiagrams`, 1 correo, 0 teléfonos, 0 tripulantes). Aislada `vuelos_sanitarios_e2e` en **V53** (41 tablas). |
| Contactos existentes | `correos_electronicos` y `telefonos` pertenecen a `personas`, con `tipo` (`PERSONAL`/`LABORAL`), principal, versión, baja lógica con responsable y normalización (V49–V50). "Mi cuenta" (`MyContacts`) ya permitía elegir el tipo. Ningún proceso consumía los contactos. |
| Roles | `OPERACIONES` y `CENTRO_OPERACIONES` son **dos roles distintos** en `roles`, tratados como un mismo perfil operativo en todo el código (`hasAnyRole('OPERACIONES','CENTRO_OPERACIONES')`). No se creó ningún rol. |

## 2. Diagnóstico del modelo

**Tripulación y personas.** `vuelos_tripulantes` (`FlightCrew`) relaciona `vuelos` ↔ `usuarios` (no `personas`) con la función (`roles_tripulacion`); la persona se alcanza por `usuarios.id_personas` (relación 1:1 única). La asignación vigente es la de `fecha_baja IS NULL`; retirar o reemplazar da de baja (quién, cuándo, motivo `RETIRO`/`REEMPLAZO`/`CAMBIO_COMANDANTE`) y conserva la fila. Un índice filtrado (V45) impide dos asignaciones vigentes de la misma cuenta en un vuelo.

**Comandante.** Está **dos veces** en el modelo: `vuelos.id_usuario_comandante` y una fila vigente en `vuelos_tripulantes` con función `COMANDANTE` (la crea `ensureCommanderCrew`; un cambio de comandante da de baja la anterior con `CAMBIO_COMANDANTE`). `CrewManagementService` ya contempla que el comandante pueda figurar sólo en el vuelo, así que la consulta trata ambas representaciones y **deduplica por cuenta**. No se crea ninguna asignación para resolver el listado.

**Contactos laborales.** Un contacto vigente es `fecha_baja IS NULL`; es laboral si `tipo_*='LABORAL'`. **El principal es único por persona y tipo de contacto (correo / teléfono), no por clasificación**: una persona puede tener como principal uno personal y ninguno laboral. Por eso no se supone un principal laboral. No existe un indicador separado de "autorizado para uso operativo": la clasificación `LABORAL` hecha por el titular **es** esa autorización, y por eso "Mi cuenta" ahora lo dice explícitamente.

**Acceso de Operaciones a un vuelo.** Operaciones puede gestionar todos los vuelos (`FlightAuthorizationService.mayRead`/`operationsStaff`); ADMINISTRADOR lee vuelos pero **no opera**. Los vuelos terminales son `FINALIZADO`, `COMPLETADO`, `CANCELADO` y `RECHAZADO` (`FlightStates.TERMINAL`); además una solicitud sanitaria puede estar `RECHAZADO`/`CANCELADO` con el vuelo aún abierto (misma regla que `TransferContactService`).

**Auditoría y cuentas inactivas.** `AuditService.record` es obligatorio dentro de la transacción de la operación; `VIEW` ya se usaba para la consulta de contactos de coordinación. Sólo ADMINISTRADOR ve los tipos de entidad que no están en la lista blanca de otros perfiles. Una cuenta con `esta_activo=0` o `estado_cuenta<>'ACTIVO'` no puede iniciar sesión; además, **no puede darse de baja a quien integra un vuelo abierto** (`UserResponsibilityService`), de modo que "tripulante asignado e inactivo" es un caso límite (p. ej. una cuenta pendiente asignada por datos preexistentes).

**Frontend.** `FlightCrew` (en `main.jsx`) ya lista la tripulación vigente en Centro de Operaciones (`canManage`) y, de sólo lectura, en el panel del comandante.

## 3. Política aplicada

* Sólo consultan `OPERACIONES` y `CENTRO_OPERACIONES`, verificado **por rol del token (`@PreAuthorize`) y otra vez contra los roles activos en la base**. DTS, comandante (incluido el propio comandante asignado), ADMINISTRADOR por su rol administrativo y anónimos no acceden. Quien tenga además un rol operativo sí accede (es Operaciones).
* El recurso es el vuelo. No existe ninguna ruta por `personaId`, por contacto ni por lista de personas: los parámetros extra (`personaId`, `userId`, `vueloId`, `crewId`) se ignoran.
* Sólo contactos `LABORAL` vigentes de personas con asignación vigente (comandante o tripulante). **Nunca** un personal como sustituto. Estado `SIN_CONTACTO_LABORAL` idéntico para quien sólo tiene personales y para quien no tiene ninguno (no se revela si posee contactos privados). Una cuenta no activa → `CUENTA_NO_ACTIVA`, sin contactos.
* Selección determinista, hasta 3 teléfonos y 3 correos por persona: el marcado principal primero y luego el más antiguo (`id`); `hayMasContactos` avisa si hay más. No se muestra "verificado": la interfaz declara que son datos declarados por su titular y no verificados.
* Vuelos `FINALIZADO`/`COMPLETADO`/`CANCELADO`/`RECHAZADO` y solicitudes rechazadas o canceladas: **409 `CREW_CONTACTS_CLOSED`**, sin datos y sin auditar. Los contactos no se eliminan al cerrar un vuelo (ni se copian al vuelo).

## 4. Implementación

### Backend
| Archivo | Cambio |
|---|---|
| `GET /api/flights/{id}/crew/contacts` en [FlightController.java](../backend-java/src/main/java/com/vuelossanitarios/backend/api/FlightController.java) | Un solo endpoint contextual junto a los de tripulación (`hasAnyRole('OPERACIONES','CENTRO_OPERACIONES')`). |
| [CrewContactService.java](../backend-java/src/main/java/com/vuelossanitarios/backend/service/CrewContactService.java) (nuevo) | Autoriza, valida estado, arma la lista (comandante primero, sin repetidos), consulta contactos por lote y audita. Sin estado propio. |
| [CrewContactDtos.java](../backend-java/src/main/java/com/vuelossanitarios/backend/api/dto/CrewContactDtos.java) (nuevo) | Respuesta mínima: `vueloId`, `vueloCodigo` y por tripulante `asignacionId`, `nombre`, `apellido`, `funcionCode`, `funcion`, `comandante`, `estado`, `telefonos[{valor,principal}]`, `correos[{valor,principal}]`, `hayMasContactos`. **Sin** DNI, usuario, roles, hashes, tokens, códigos, ids de persona/contacto ni contactos personales. |
| [CrewPersonRow.java](../backend-java/src/main/java/com/vuelossanitarios/backend/repository/CrewPersonRow.java) (nuevo) y consultas en `FlightCrewRepository`, `UserRepository`, `PhoneContactRepository`, `EmailContactRepository` | Proyección sin cargar `User`/`Person`. **Sin N+1:** la cantidad de sentencias no depende del tamaño de la tripulación (comprobado con estadísticas de Hibernate: una primera versión con entidades hacía una consulta adicional por persona —asociación `Person.commanderProfile` uno a uno inversa— y la prueba lo detectó). **No se agregaron índices:** el plan real en SQL Server (`SET SHOWPLAN_TEXT`, base aislada) usa `Index Seek` sobre `idx_telefonos_persona_id` (equivalente para correos) y `idx_vuelos_tripulantes_vuelo_id`, más un `Sort` trivial por persona; los volúmenes por vuelo son de unidades. |
| [AuditCatalog.java](../backend-java/src/main/java/com/vuelossanitarios/backend/service/AuditCatalog.java) | Etiqueta `FLIGHT_CREW_CONTACT` ("Contactos laborales de la tripulación") y campos `tripulantes`, `contactos`, `sinContactoLaboral`; la etiqueta de `VIEW` pasa a "Consulta de contactos" (la usan ahora dos tipos de entidad). |
| Pruebas | `@MockBean CrewContactService` en `AdministratorAuthorizationTest` y `CrewAndAircraftAssignmentAuthorizationTest` (el controlador recibe un servicio más). |

**Auditoría:** un evento por consulta autorizada, en la misma transacción: `tipo_entidad=FLIGHT_CREW_CONTACT`, `operacion=VIEW`, `id_vuelos`, `id_usuario_actor`, fecha UTC y `{"tripulantes":N,"contactos":M,"sinContactoLaboral":K}`. Ni valores completos, ni parciales, ni nombres. Visible sólo para ADMINISTRADOR (no figura en las listas blancas de los demás perfiles, tampoco en la línea de tiempo del vuelo de Operaciones). **Intentos denegados:** el sistema no audita ningún rechazo de autorización (403/401 de ningún endpoint) y registrar uno exigiría un mecanismo paralelo (`AuditService.record` es obligatorio dentro de una transacción de negocio), por lo que **no se implementó**; el rechazo no incluye datos. Queda como decisión pendiente (§8).

### Frontend
* [crewContacts.jsx](../frontend-react/src/crewContacts.jsx) (nuevo, `CrewContacts`) montado por `FlightCrew` sólo para Operaciones (`canManage`), con tripulación vigente y vuelo no terminal: botón **"Consultar contactos de la tripulación"**, estado de carga, tripulante + función, teléfono y correo separados, "No hay contacto laboral disponible.", cuenta no activa, aviso de "más contactos", errores (403/409/red) y **sin consulta automática**. Los datos viven sólo en el estado del componente y se descartan al ocultar, cambiar de vuelo, terminar el vuelo, ante cualquier error, **si cambia la tripulación** o **a los 5 minutos de mostrarse** (`CREW_CONTACTS_TTL_MS`; se avisa y hay que volver a consultar, de modo que no queden datos viejos presentados como vigentes si cambió un permiso o un contacto) (firma de las asignaciones vigentes; se avisa "La tripulación cambió" y el usuario decide si vuelve a consultar). Las respuestas tardías se ignoran. Nada se guarda en `localStorage`/`sessionStorage`.
* [account.jsx](../frontend-react/src/account.jsx) (`MyContacts`): el formulario ya permitía registrar contactos laborales; se agregó un texto fijo que distingue **Personal** (privado, nunca visible para Operaciones) de **Laboral** (el Centro de Operaciones podrá consultarlo mientras esté asignado a un vuelo abierto; cada consulta queda auditada; no se verifica), etiquetas de las opciones ("Personal (privado)", "Laboral (lo consulta Operaciones)") y un aviso junto al selector al agregar y al editar. No se reimplementó nada.
* Sin cambios en el listado general de vuelos ni apariencia general (tres reglas CSS para el panel).

## 5. Pruebas (resultados reales)

| Prueba | Resultado |
|---|---|
| Backend `mvn -o test` completo | **402 pruebas, 0 fallas** (393 previas + 9 de `CrewContactIntegrationTest`). |
| Frontend `vitest run` completo | **180 pruebas, 14 archivos, 0 fallas** (164 previas + 14 de `crewContacts.test.jsx` + 2 de `account.test.jsx`); `vite build` correcto. Una de tres ejecuciones completas perdió un archivo (`Failed to start forks worker … css-tree`, error de apertura de archivos de Windows ajeno al código) y no se cuenta; las otras dos corrieron los 14 archivos. |
| `e2e-contactos-tripulacion.cjs` (API real, SQL Server real) | **8 bloques aprobados.** |
| `e2e-contactos-tripulacion-ui.cjs` (Chrome real) | **8 bloques aprobados.** |
| Suite Node completa (`e2e-suite-completa.cjs`, **29 scripts**, una única pasada) | **29/29 aprobados** (≈ 59 min por la carga simultánea de otras ejecuciones al comienzo). Se ejecutó sobre la imagen aislada con el código de I-2; después se agregó el temporizador de 5 minutos del panel (sólo frontend), se reconstruyó únicamente el frontend aislado y se **repitieron individualmente** `e2e-contactos-tripulacion-ui` (8 bloques) y `e2e-aeronaves-tripulacion-ui` (6 bloques), más `vitest run` completo (180) y el build: esa repetición no equivale a una segunda pasada de la suite completa. |

**Backend (`CrewContactIntegrationTest`, HTTP + JWT + seguridad + H2):** Operaciones y Centro de Operaciones consultan; DTS, comandante, administrador, anónimo, vuelo inexistente y identificador no numérico; cuenta de Operaciones dada de baja; vuelos `FINALIZADO`/`COMPLETADO`/`CANCELADO`/`RECHAZADO` y solicitud rechazada → 409 sin evento; estados abiertos incluida la replanificación; tripulación vacía; comandante sólo en el vuelo (`asignacionId` nulo, sin asignación creada) y comandante con fila (una sola vez, también cuando figura dos veces); retirado y reemplazado ausentes, nuevo presente, contactos del retirado intactos; sólo personal, sólo laboral, ambos, ninguno, laboral retirado, laboral reclasificado, principal laboral primero, varios laborales con límite de 3 y `hayMasContactos`, resultado determinista; cuentas inactivas y pendientes; parámetros e identificadores manipulados; métodos de escritura y rutas por persona inexistentes; DTO sin DNI/usuario/hash/token/contacto personal y con `Cache-Control: no-store`; auditoría con cantidades y sin valores; cantidad de sentencias constante con 2 y 8 tripulantes.

**Frontend:** botón sólo para Operaciones y con tripulación y vuelo no terminal (ausente para el comandante y para `FINALIZADO`/`COMPLETADO`/`CANCELADO`/`RECHAZADO`); sin consulta al cargar; estado de carga con doble clic inocuo; visualización por tripulante con teléfono y correo separados; ausencia de contacto laboral; cuenta no activa; errores de permisos y vuelo cerrado con reintento; respuesta inválida; ocultar descarta y re-consulta pide datos nuevos; vencimiento del tiempo de exhibición (reloj simulado); cambio de tripulación descarta y avisa **sin consultar solo** (verificado además por mutación: sin la dependencia de la firma, la prueba falla); respuestas tardías tras cambiar de vuelo; vuelo que termina con datos en pantalla; ningún dato en el almacenamiento del navegador; en "Mi cuenta", la distinción personal/laboral y el tipo laboral enviado al servidor.

**E2E API (SQL Server real, base aislada V53):** fixtures con comandante (laboral), tripulante sólo personal, tripulante con ambos tipos y un principal laboral, y tripulante sin contactos vigentes. Verifica contra SQL que **todo contacto personal vigente de la tripulación está ausente y todo laboral vigente presente**, el comandante único aunque figure por las dos relaciones, el orden y el principal, la respuesta mínima y sin caché, 403/401 sin auditoría ni datos, ausencia de escritura y de rutas por persona, un evento `VIEW` por consulta (usuario, vuelo, `{"tripulantes":4,"contactos":5,"sinContactoLaboral":2}`) sin ningún valor, visible para administración y ausente de la línea de tiempo de Operaciones, reemplazo y retiro (contactos del retirado y 5 filas de historial intactas), alta/reclasificación/retiro de contactos reflejados al instante, identificadores y parámetros manipulados, vuelo cancelado y solicitud rechazada → 409 sin evento, solicitud abierta sin tripulación → lista vacía, baja de una cuenta asignada → 409, **cuentas, contactos de coordinación y vuelos sin cambios por las consultas**, 41 tablas sin cambio, ninguna migración nueva y `DBCC CHECKCONSTRAINTS` limpio.

**E2E Chrome:** el titular registra un teléfono LABORAL desde "Mi cuenta" (ve el aviso de quién lo consultará, verificado en SQL); Centro de Operaciones abre el vuelo y **no se pide ningún contacto hasta presionar**; ve comandante y tripulantes con sus contactos laborales y "No hay contacto laboral disponible." sin ningún contacto personal en toda la página; auditoría en SQL; sin almacenamiento local; ocultar limpia; retirar a un tripulante descarta los datos, avisa y no consulta solo, y la siguiente consulta ya no lo incluye; recargar no conserva nada; el comandante no ve el botón y el servidor lo rechaza; con el vuelo cancelado la consulta responde 409 y el panel lo informa sin datos ni evento.

## 6. Estado de las bases

| Base | Versión | Observación |
|---|---|---|
| Habitual | **V47** | Sólo lecturas. Sin migraciones, sin reinicios, sin pruebas con escritura, sin borrados. |
| Aislada E2E | **V53** | Se reconstruyeron sólo `backend` y `frontend` del proyecto E2E con el código de I-2; sin migraciones nuevas. Se crearon datos marcados de prueba. |

## 7. Matriz

Véase [MATRIZ_COBERTURA_FUNCIONAL.md](MATRIZ_COBERTURA_FUNCIONAL.md). `correos_electronicos` y `telefonos` pasan a **FUNCIONALES** (31 funcionales y 10 parciales de 41) porque ahora reúnen registro, validación, actualización autorizada, consulta operativa, auditoría, permisos, integridad y pruebas. Los límites que subsisten están en §8; no se crearon permisos de modificación de contactos ajenos.

## 8. Límites y decisiones pendientes

1. **Corrección de contactos ajenos:** sigue sin política (p. ej. cuenta pendiente con un correo mal cargado). Hoy sólo la corrige su titular.
2. **Sin verificación externa** de ningún contacto; ni envío automático de SMS, llamadas o correos.
3. **Un solo principal por persona y tipo de contacto**, compartido entre personales y laborales: un laboral sólo puede ser principal desplazando al personal. La consulta lo trata como una pista de orden, no como garantía.
4. **Adopción:** las cuentas se crean con contactos `PERSONAL` por omisión; hasta que el titular registre uno laboral, Operaciones verá "No hay contacto laboral disponible". No existe aún un recordatorio ni un pedido desde Operaciones.
5. **Intentos denegados** no se auditan (véase §4); requiere decidir si se justifica un mecanismo propio (y cómo evitar el ruido de sondeos).
6. **Formato de teléfono** genérico (6–15 dígitos), sin reglas por país.
7. **No se consulta en vuelos terminados:** la información histórica de quién tripuló sigue en `vuelos_tripulantes`, pero los contactos actuales ya no se muestran.

## 9. Deuda de seguridad detectada (fuera de alcance, no modificada)

`POST /api/auth/activar-cuenta` (pública, sin autenticación) responde distinto según el DNI: **404** "DNI inexistente", **409** "La cuenta ya está activada", **400** "No hay un código de activación vigente" y mensajes específicos para código vencido o incorrecto. Eso permite **enumerar DNI de cuentas** y su estado, sin límite de intentos. No expone contactos ni datos personales de la tripulación, por lo que no se consideró una vulnerabilidad directamente explotable que exija atención inmediata dentro de I-2. Requiere revisar juntos: respuestas uniformes, limitación de intentos por origen/DNI, protección de la activación (el código es la única barrera), compatibilidad con el frontend (`Login`/activación muestran estos mensajes) y las pruebas existentes (`AccountActivationIntegrationTest`, `e2e-usuarios*`, `e2e-identidad-compartida*`).

## 10. Próximo incremento — I-3, elegibilidad de la tripulación

Revisadas `perfiles_comandante`, `clasificaciones_tripulacion` y `roles_tripulacion` frente a la asignación (lectura de código; sin implementar):

* **Integradas hoy:** asignar tripulación y comandante exige cuenta activa, clasificación funcional **y** habilitación profesional `VERIFICADA` y vigente a la fecha de llegada (`CrewManagementService.qualified`); el comandante además exige licencia registrada, rol `COMANDANTE`, provincia actual igual a la de origen y sin informes finales vencidos; retirar una clasificación se bloquea si hay asignaciones vigentes.
* **Brechas probables:** (1) **revocar o dejar vencer una habilitación no revalida las asignaciones ya hechas** (`ProfessionalCredentialService.decide` no consulta `vuelos_tripulantes` ni vuelos abiertos) y nadie es alertado; (2) `roles_tripulacion` es un catálogo sólo de lectura sin administración, y `CrewManagementService.role()` repite la lista `COMANDANTE/COPILOTO/MEDICO/ENFERMERO` en código; (3) la clasificación `COMANDANTE` se exige en `availableCommanders` y al asignar, pero `perfiles_comandante` (licencia y provincia) se mantiene sin historial: el cambio de provincia actual (`/catalogs/commanders/{id}/location`) no queda registrado como asignación operativa ni se contrasta con vuelos futuros; (4) no hay revisión de aptitud antes de iniciar el vuelo (EN_CURSO) sobre la tripulación vigente.
* **Recomendación:** I-3 = revalidación de la elegibilidad de la tripulación y del comandante ante cambios de habilitación, clasificación, licencia o provincia (alerta y bloqueo del inicio), reutilizando `CrewManagementService.qualified` y las notificaciones existentes.

## 11. Archivos

Nuevos: `CrewContactService.java`, `CrewContactDtos.java`, `CrewPersonRow.java`, `CrewContactIntegrationTest.java`, `crewContacts.jsx`, `crewContacts.test.jsx`, `scripts/e2e-contactos-tripulacion.cjs`, `scripts/e2e-contactos-tripulacion-ui.cjs`, este documento.

Modificados por I-2: `FlightController`, `FlightCrewRepository`, `UserRepository`, `PhoneContactRepository`, `EmailContactRepository`, `AuditCatalog`, `AdministratorAuthorizationTest`, `CrewAndAircraftAssignmentAuthorizationTest`, `main.jsx` (monta el panel), `account.jsx`, `account.test.jsx`, `styles.css`, `scripts/e2e-suite-completa.cjs` (29 scripts) y la matriz.
