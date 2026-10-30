# Contactos compartidos de la persona — 23 de octubre de 2026

Este incremento integra `correos_electronicos` y `telefonos` con la identidad compartida (`personas`), sin crear tablas ni estructuras paralelas. Migración nueva: **V49**, aplicada únicamente a la base aislada `vuelos_sanitarios_e2e`.

## 1. Estado inicial

| Aspecto | Hallazgo |
|---|---|
| Modelo (V11) | Cada contacto pertenece a `personas` (no a `usuarios`): `id_personas`, valor, tipo, `es_principal`, fechas. Un índice único filtrado garantiza un solo principal por persona. **No había unicidad del valor, baja lógica, versión ni marca de verificación.** |
| Datos existentes (base aislada) | 1 364 correos y 1 363 teléfonos, un principal por persona, sin duplicados. La base habitual (V47) tiene 1 correo (el administrador inicial) y 0 teléfonos. |
| Alta | Sólo ADMINISTRADOR, junto con la cuenta (`AuthService.createPending`): correo y teléfono obligatorios, con una persona preexistente sólo se agregan los que faltan sin disputar el principal. |
| Autoservicio (backend) | `POST/DELETE/principal` en `/api/auth/me/correos|telefonos`: sin edición, **borrado físico**, sin auditoría, sin control de duplicados en la misma persona, sin validación de formato del teléfono (3–30 caracteres cualquiera), tipo libre, la verificación del "último contacto" y el principal sin bloqueo (carreras), **retirar el principal dejaba a la persona sin principal**, y un identificador ajeno respondía 403 (revelaba que existía). |
| Autoservicio (interfaz) | **La pantalla "Mi cuenta" sólo existía en el panel de Administración.** DTS, Centro de Operaciones y Comandante no tenían dónde ver ni mantener sus contactos aunque el backend lo permitía. |
| Consulta administrativa | `GET /api/auth/users/{id}` ya devolvía los contactos y el panel los mostraba sin acciones (“los mantiene cada usuario desde Mi cuenta”). |
| Uso operativo | **Ningún proceso consume los contactos**: no hay envío de mensajes (las notificaciones son internas), no se usan para recuperar accesos, no figuran en vuelos ni solicitudes. Tampoco hay copias en vuelos cerrados: cambiar un contacto no puede alterar datos históricos. |
| Pacientes / DTS | `CreatePatient.telefono` existe en el DTO pero **se ignora en silencio**; el formulario DTS no lo envía. |

## 2. Política de acceso (decidida e implementada)

| Quién | Qué puede hacer | Fundamento |
|---|---|---|
| Cualquier usuario autenticado (DTS, Operaciones, Centro de Operaciones, Comandante, Administrador) | Ver, agregar, **editar**, marcar principal y **retirar** los contactos de **su propia persona**. | El titular conoce y mantiene sus datos; ya era la regla vigente. |
| ADMINISTRADOR sobre otra persona | **Sólo consulta** (detalle de la cuenta). No edita contactos ajenos. | No existe una regla que lo autorice; no se inventa. Véase §7. |
| DTS sobre pacientes | Ninguna operación sobre contactos de personas. | DTS no accede a datos personales de terceros más allá del flujo de solicitud. |
| Operaciones / Comandante sobre otras personas | Ninguna. | Sin regla definida. |

El servidor aplica la regla: no existe ninguna ruta que reciba el identificador de una persona. Todas las operaciones usan la persona del token; un identificador de contacto ajeno, retirado o inexistente responde **404 idéntico** (no revela existencia, también para ADMINISTRADOR).

## 3. Cambios realizados

### Base de datos — V49 (`V49__contactos_personales_baja_logica_y_unicidad.sql`)
- `direccion_normalizada` / `numero_normalizado` (correo en minúsculas; teléfono sin espacios, guiones, puntos ni paréntesis). El valor ingresado se conserva tal cual.
- `version_contacto` (control optimista), `fecha_baja`, `id_usuario_baja`, `motivo_baja` (baja lógica con responsable) y FK a `usuarios`.
- `CHECK`: un contacto vigente no tiene datos de baja; uno retirado tiene fecha y motivo, **no es principal** y, salvo la baja de la migración, responsable.
- Índices únicos filtrados `(id_personas, valor_normalizado) WHERE fecha_baja IS NULL`: **un mismo valor vigente por persona**. No se impone unicidad entre personas distintas: varias personas pueden compartir un teléfono y una restricción global revelaría si un valor pertenece a otra persona.
- Datos anteriores: no se borra ninguna fila. Si una persona tuviera dos contactos vigentes equivalentes, la migración da de baja el sobrante como `DUPLICADO_MIGRACION` (conserva el principal o el más antiguo). En la base aislada no hubo duplicados.
- No se modificó ninguna migración aplicada. No se crean tablas (siguen 40).

### Backend
- `PersonContactService` (nuevo): autoservicio con bloqueo pesimista de la fila de la persona (serializa operaciones sobre sus contactos sin tocar `version_identidad` ni la identidad), baja lógica, promoción automática del principal, “al menos un correo y un teléfono vigentes” (409 `LAST_CONTACT_REQUIRED`), duplicados normalizados (409 `CONTACT_DUPLICATE`), versión (409 `CONTACT_VERSION_CONFLICT`), formato (400 `CONTACT_INVALID`) y auditoría en la misma transacción.
- `ContactNormalizer` (nuevo, `domain.person`): reglas de formato únicas para altas administrativas y autoservicio. Correo: `x@dominio.tld`, ≤150. Teléfono: 6–15 dígitos con `+` inicial opcional (se admiten espacios, guiones, puntos y paréntesis). Tipo: `PERSONAL` o `LABORAL`. Máscaras para auditoría.
- `AuthController`: rutas `/me/correos|telefonos` delegadas al nuevo servicio; **nuevas** `PUT /me/correos/{id}` y `PUT /me/telefonos/{id}` (con `version`). `ContactView` incorpora `version`.
- `AuthService`: se retiran los seis métodos de contactos propios; el alta administrativa y el administrador inicial usan las mismas reglas y la misma normalización; todas las lecturas devuelven sólo contactos vigentes.
- Repositorios: consultas de contactos vigentes; `PersonRepository.lockById`.
- Auditoría: tipos `PERSON_EMAIL` y `PERSON_PHONE`; operaciones `CREATE`, `UPDATE`, `REMOVE`, `SET_PRIMARY`; sólo visibles para ADMINISTRADOR (la política por perfil excluye todo tipo no listado). Los valores se guardan **parcialmente ocultos** (`a***@dominio`, `*********234`); nunca contraseñas, hashes ni tokens. Guardar sin cambios, o marcar principal lo que ya es principal, no genera versión ni evento.

### Frontend
- `account.jsx` → `MyContacts`: lista con tipo y principal, agregar, editar, hacer principal y quitar (con confirmación), validación previa al envío, estado de carga, acciones deshabilitadas mientras se guarda, error visible y relectura del estado vigente ante conflicto. Indica a qué persona pertenecen los datos (nombre y DNI), que se comparten con otros registros de la misma persona (p. ej. ficha de paciente), que no cambian contraseña, roles ni vuelos, que quedan auditados y **que no se verifican** ni se usan para enviar mensajes o recuperar accesos.
- DTS, Centro de Operaciones y Comandante: nuevo acceso **Mi cuenta** (`#/mi-cuenta`, persiste al recargar) que reemplaza el panel operativo; Administración conserva su pantalla y reutiliza el mismo componente para los contactos.

## 4. Flujos integrados

1. Alta administrativa → contactos validados y normalizados, sin duplicados, el primero principal.
2. Activación → la persona ve sus contactos en **Mi cuenta** en cualquier área.
3. Mantenimiento por el titular → auditoría → consulta administrativa del historial (Auditoría, filtro por tipo `PERSON_EMAIL`/`PERSON_PHONE` o por actor).
4. Persona que también es paciente → comparte contactos; el mantenimiento no modifica la ficha ni la identidad.
5. Vuelos cerrados → sin cambios (ningún vuelo guarda copias de contactos).

## 5. Pruebas (resultados reales)

- Backend `mvn test`: **322 pruebas, 0 fallas** (311 previas + `ContactNormalizerTest` 4 + `PersonContactIntegrationTest` 7). La suite integrada (HTTP, JWT, H2) cubre: alta, edición, versión vencida, duplicados normalizados, formatos, tipo, principal único y promoción, último contacto, baja lógica y reuso del valor, aislamiento entre personas (incluido administrador y 401), respuesta idéntica para ajeno e inexistente, preservación de hash/versión de credenciales/roles/identidad/ficha de paciente y sesión vigente, auditoría enmascarada y visible sólo para administración, alta administrativa con las mismas reglas y 6 altas simultáneas → 1.
- Frontend `vitest run`: **120 pruebas, 0 fallas** (112 previas + `account.test.jsx` 7 + 1 en `main.test.jsx`); `vite build` correcto.
- [e2e-contactos.cjs](../scripts/e2e-contactos.cjs) (API real, SQL Server real): **aprobado**. Verifica V49 (columnas, índices filtrados, `CHECK`, sin duplicados ni personas sin principal), flujo completo de correos y teléfonos con SQL tras cada paso, rechazo por SQL Server de duplicado vigente / baja incompleta / baja con principal / motivo inventado, **concurrencia real** (8 altas idénticas → 1 y 7×409; 6 ediciones con la misma versión → 1 y 5×409; 2 retiros simultáneos con dos contactos → 1 y siempre queda uno; 3 cambios simultáneos de principal → 1 principal), 404 uniforme para los 6 verbos sobre contactos ajenos con tres perfiles (DTS, Comandante, Administrador), alta administrativa inválida sin residuos y deduplicación, auditoría (8 combinaciones tipo/operación, sin vuelo, sin valores completos ni credenciales, consulta administrativa y 403 al resto), hash de identidad/credenciales/roles/ficha de paciente idéntico, vuelos intactos, `DBCC CHECKCONSTRAINTS` limpio y persistencia tras reiniciar el backend.
- [e2e-contactos-ui.cjs](../scripts/e2e-contactos-ui.cjs) (Chrome real vía Playwright): **aprobado**. DTS (formato inválido sin escritura, alta, duplicado 409, edición con versión, conflicto entre dos sesiones, principal, baja lógica verificada en SQL, recarga), Comandante y Centro de Operaciones desde su área, y Administración (Mi cuenta y detalle de otra cuenta sin acciones sobre contactos).
- Regresión E2E sobre la imagen V49 (base aislada, 16 scripts): **14 terminaron con código 0** — `e2e-usuarios-ui`, `e2e-identidad-compartida` y `-ui`, `e2e-paciente-solicitud` y `-ui`, `e2e-patient-directory` y `-ui`, `e2e-auditoria` y `-ui`, `e2e-solicitudes`, `e2e-aeronaves-tripulacion` y `-ui`, `e2e-cierre` y `-ui`. **Dos fallaron por causas ajenas a este incremento y preexistentes:** `e2e-usuarios` exige que el bootstrap sea el único administrador activo para su carrera de "últimos administradores" (la base compartida tiene 32 más; falla en su aserción inicial de conteo, antes de ejecutar nada de contactos) y `e2e-solicitudes-ui` selecciona al paciente en un desplegable `Paciente` que el incremento anterior de búsqueda de pacientes reemplazó por una búsqueda explícita (el script no se actualizó entonces; no se modificó el formulario DTS en este incremento). Ambos quedan como deuda de pruebas; no se ocultaron ni se alteraron aserciones de negocio. Los E2E Python históricos siguen sin ejecutarse (no hay Python).

## 6. Estado de Flyway

| Base | Versión | Observación |
|---|---|---|
| Habitual `vuelos_sanitarios` | **V47** | Sólo se consultó en lectura. No se reconstruyó ni reinició su stack. V48 y V49 siguen **pendientes y sin autorización**. |
| Aislada `vuelos_sanitarios_e2e` | **V49** | V49 aplicada por Flyway al reconstruir únicamente `backend` y `frontend` del proyecto `vuelos-sanitarios-e2e`. |

La migración es compatible con una base con datos: no falla por duplicados (los retira con trazabilidad) y no exige intervención manual. Antes de aplicarla en la base habitual conviene un respaldo (procedimiento existente) y aplicar V48 y V49 juntas.

## 7. Limitaciones y decisiones pendientes (no inventadas)

1. **Corrección administrativa de contactos ajenos.** Hoy una cuenta pendiente de activación con un correo mal cargado no puede corregirse por el titular (aún no ingresa) ni por el administrador. Requiere definir quién la autoriza, con qué motivo y si aplica sólo a cuentas pendientes. Al no haber recuperación por correo, el riesgo de toma de cuenta es bajo, pero la regla no está definida.
2. **Uso operativo.** Ningún proceso consume los contactos. La necesidad real probable es que el Centro de Operaciones consulte el teléfono principal de la tripulación asignada a un vuelo; requiere decidir qué roles ven qué contactos de quién y si se registra en auditoría la consulta.
3. **Pacientes y DTS.** `CreatePatient.telefono` se ignora. El contacto de un paciente, de su responsable o de un tercero para coordinar el traslado no está modelado: un familiar no es una persona del sistema ni debe representarse con la identidad del paciente. Requiere definir el dato por solicitud/vuelo (y su historial) antes de implementarlo.
4. **Sin verificación ni canal de salida.** No hay mecanismo de verificación; ningún contacto se presenta como verificado. No se envían mensajes ni hay recuperación por correo o teléfono.
5. **Historial en el detalle de la cuenta.** El historial administrativo del detalle sólo trae `USER`/`USER_ROLE`; los eventos de contactos se consultan en la Auditoría global (filtro por tipo o actor).
6. **Formato de teléfono** genérico 6–15 dígitos; no aplica reglas por país. Los valores anteriores a V49 no se revalidan (se validan al editarlos).
7. `fecha_baja` usa la hora civil de negocio; `fecha_creacion`/`fecha_actualizacion` de los contactos mantienen el comportamiento previo de la JVM.
8. La unicidad y la serialización bajo concurrencia se prueban con SQL Server real (E2E); H2 no reproduce los índices filtrados.
9. **Rectificación de DNI**: sigue pendiente y separada (identidad sensible: autorización restringida, verificación, motivo, duplicados, relaciones con usuarios, pacientes e históricos, sin fusiones automáticas). No se habilitó edición de DNI.

## 8. Archivos

Nuevos: `V49__contactos_personales_baja_logica_y_unicidad.sql`, `domain/person/ContactNormalizer.java`, `service/PersonContactService.java`, `ContactNormalizerTest.java`, `PersonContactIntegrationTest.java`, `frontend-react/src/account.jsx`, `account.test.jsx`, `scripts/e2e-contactos.cjs`, `scripts/e2e-contactos-ui.cjs`, este documento.

Modificados: `EmailContact`, `PhoneContact`, `EmailContactRepository`, `PhoneContactRepository`, `PersonRepository`, `AuthController`, `AuthService`, `AuthDtos`, `AuditCatalog`, `main.jsx`, `styles.css`, `main.test.jsx`, `UserAdministrationServiceTest`, `AdministratorAuthorizationTest` (nuevo `@MockBean`), la matriz y las aserciones de versión mínima de Flyway en los E2E (`== 47/48` → `>= 47/48`; ninguna aserción de negocio cambió).

## 9. Próximo incremento recomendado

Documentación de vuelos (alta contextual, clasificación, versionado, bloqueo, historial e integración con el cierre) o, si se decide la política, **consulta operativa de contactos de la tripulación por el Centro de Operaciones** (punto 2 de §7), que sería el primer proceso que consume estos datos. La rectificación de DNI conviene tratarla como incremento propio una vez definida la política.

> Actualización 2026-10-24: los puntos 2 y 3 de §7 (uso operativo y contacto en la solicitud DTS) se resolvieron con otro modelo, el contacto de coordinación del traslado; véase [INTEGRACION_CONTACTOS_SOLICITUD_2026-10-24.md](INTEGRACION_CONTACTOS_SOLICITUD_2026-10-24.md). V49 fue revisada y complementada por V50.
