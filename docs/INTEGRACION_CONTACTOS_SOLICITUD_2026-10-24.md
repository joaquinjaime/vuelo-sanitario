# Contactos de coordinación de la solicitud sanitaria — 24 de octubre de 2026

Resuelve la pérdida silenciosa de `CreatePatient.telefono`, integra los contactos necesarios para coordinar un traslado dentro de la solicitud, la evaluación y el detalle del vuelo, revisa V49 con una corrección preventiva (V50), y recupera los dos E2E pendientes. Migraciones nuevas: **V50** y **V51**, aplicadas únicamente a la base aislada.

## 1. Diagnóstico de `CreatePatient.telefono`

| Pregunta | Hallazgo |
|---|---|
| Dónde se declara | `PatientDtos.CreatePatient`, sexto componente (`@Size(max=30) String telefono`). |
| Qué endpoints lo reciben | `POST /api/patients` (DTS, Operaciones, CO) y, anidado en `patient`, `POST /api/flights/with-patient` (DTS). |
| Qué servicios lo procesan | **Ninguno.** `PatientService.register` nunca lo leía; `SanitaryRequestRegistrationService` tampoco. |
| Qué formularios lo envían | **Ninguno.** El formulario DTS enviaba nombre, apellido, DNI y fecha de nacimiento. Sólo un cliente de API podía enviarlo. |
| Campos equivalentes | `personas.telefono` se eliminó en V11 (migrado a `telefonos`); la alta administrativa de usuarios ya captura `telefonos` de la persona; `coordinaciones_aa2000.contacto_aa2000` es el contacto del aeropuerto (otro significado). No existía ninguna entidad para terceros ni para el contacto de un traslado. |
| Comportamiento | El sistema respondía 200 y **descartaba el número sin avisar**: quien creía haberlo registrado no lo encontraba después. El resto de los campos desconocidos también se ignoraban. |

## 2. Semántica decidida

| Concepto | Pertenece a | Decisión |
|---|---|---|
| A. Contacto personal del paciente | `personas` → `telefonos`/`correos_electronicos` | **No lo captura DTS.** Es un dato compartido de la persona (puede ser también una cuenta) que su titular mantiene en "Mi cuenta"; DTS no es su titular y escribirlo sobreescribiría o crearía contactos compartidos sin autorización. Una persona sin cuenta sigue sin mantenedor: es una brecha documentada. |
| B. Responsable o tercero | La solicitud | Un familiar o un establecimiento no es una persona del sistema: se registra con su relación, nombre y teléfono **en la solicitud**, no como persona ni con la identidad del paciente. |
| C. Contacto operativo del vuelo | La solicitud | Es el medio con el que se coordina *ese* traslado y puede diferir del contacto habitual. Cambiarlo no altera datos compartidos. |

B y C comparten dueño y ciclo de vida (la solicitud), así que usan **una sola tabla nueva**, `contactos_coordinacion_traslado` (V51), con `relacion_contacto` ∈ {`PACIENTE`, `FAMILIAR_RESPONSABLE`, `ESTABLECIMIENTO_ORIGEN`, `ESTABLECIMIENTO_DESTINO`, `OTRO`}. `PACIENTE` significa "el número al que llamar al propio paciente *para este traslado*" (concepto C), no su contacto personal (A). Justificación de tabla nueva: ninguna existente representa un tercero ni un dato por vuelo; reutilizar `telefonos` exigiría crear personas ficticias o contaminar la identidad compartida.

Reglas: opcional (una urgencia no se bloquea por falta de teléfono; la política de hacerlo obligatorio queda como decisión pendiente); hasta **3 vigentes** por solicitud; el **primero es el principal**; el nombre es obligatorio salvo para `PACIENTE`; teléfono de 6–15 dígitos (mismo `ContactNormalizer` que los contactos personales); un teléfono no puede figurar dos veces en la misma solicitud ni haber dos contactos `PACIENTE` (**la ambigüedad se rechaza**, 400 `CONTACT_AMBIGUOUS`); indicaciones ≤ 200 caracteres (sin datos clínicos). No se marcan como verificados y no se envía ningún mensaje.

## 3. Contrato de API sin pérdida silenciosa

- `CreatePatient` **ya no declara `telefono`**. Los cuerpos de `CreatePatient`, `CreateFlight`, `CreateFlightWithPatient` y los contactos de coordinación llevan `@StrictJson`: un campo desconocido responde **400 `Campo no admitido: <campo>`** (`StrictJsonConfiguration` + manejador). El resto de la API conserva su comportamiento. Un cliente que aún envíe `telefono` recibe el error en lugar de perder el dato.
- `CreateFlight` y `CreateFlightWithPatient` aceptan `contactos` (opcional) y conservan los constructores anteriores.
- `SanitaryRequestRegistrationService` valida los contactos **antes** de escribir y los persiste en la misma transacción que la identidad, la ficha, el vuelo, la información médica, la negociación y la auditoría: un fallo en cualquier paso (incluido el vuelo, ya con la persona creada) no deja persona, ficha, vuelo ni contactos. `POST /api/flights` (paciente ya registrado) pasó a usar el mismo servicio; los tres escenarios de identidad (nueva, existente, preexistente sin ficha) no cambian y **ninguno modifica `telefonos`, `correos_electronicos`, `usuarios` ni credenciales**.

## 4. Acceso (reglas existentes, ninguna nueva para otros roles)

| Quién | Consulta | Modifica |
|---|---|---|
| DTS que solicitó el vuelo | Sí (no se audita su propia consulta) | Sí, mientras la coordinación está abierta |
| Operaciones / Centro de Operaciones | Sí, **desde el vuelo y a pedido**; cada consulta se audita (cantidad, sin números) | No |
| Otro DTS | No (403) | No |
| Comandante | No | No |
| Administrador | No (no coordina traslados) | No |

Coordinación abierta = el vuelo no está FINALIZADO/COMPLETADO/CANCELADO/RECHAZADO y la solicitud no está RECHAZADA ni CANCELADA. Cerrada, el listado devuelve `disponible=false` con el motivo y **sin números**; las filas se conservan. No existe directorio general ni búsqueda de contactos; el detalle y el listado general de vuelos no incluyen teléfonos; el comandante tampoco los ve (su necesidad real de contactarlos es una decisión pendiente).

Endpoints (`/api/flights/{id}/transfer-contacts`): `GET` (DTS solicitante, Operaciones, CO), `POST`, `PUT /{cid}` con `version`, `DELETE /{cid}` (baja lógica) y `POST /{cid}/principal` (sólo DTS solicitante). Un id de otra solicitud o inexistente responde 404.

Auditoría (`TRANSFER_CONTACT`, vinculada al vuelo; sólo ADMINISTRADOR la consulta): `CREATE`, `UPDATE`, `REMOVE`, `SET_PRIMARY` con la relación y el teléfono parcialmente oculto, y `VIEW` con la cantidad. Ni el nombre del contacto ni las indicaciones ni el número completo se guardan en la bitácora. Concurrencia: bloqueo de la fila del vuelo, versión por contacto, índices únicos filtrados y límite de 3 verificados bajo carrera.

## 5. Interfaz

- **DTS, formulario de solicitud:** sección "Contactos para coordinar el traslado (opcional)" con hasta 3 filas (relación, nombre, teléfono, indicaciones), validación previa, aviso de que pertenecen sólo a la solicitud, no son contacto personal ni verificado y no generan mensajes. La búsqueda paginada de pacientes se conserva.
- **DTS, "Mis solicitudes":** consulta y mantenimiento (editar con versión, principal, retirar, agregar) con el error del servidor visible tras releer el estado.
- **Centro de Operaciones, detalle de la solicitud sanitaria:** "Contactos de coordinación del traslado" con botón "Ver contactos de coordinación" (a pedido; avisa que la consulta se audita), enlaces `tel:`, sin edición.
- Comandante y Administración: sin cambios; `Mi cuenta`/`MyContacts` intactos.

## 6. Revisión de V49 y V50

V49 ya está aplicada en la base aislada y **no se modificó**. Se revisó contra los diez criterios del pedido, con una base descartable con datos ambiguos ([e2e-migracion-contactos.cjs](../scripts/e2e-migracion-contactos.cjs)):

| Criterio | Resultado |
|---|---|
| 1 No elimina datos | Correcto: sólo baja lógica (`DUPLICADO_MIGRACION`); mismo número de filas antes y después. |
| 2 Conserva referencias | Correcto: ningún id cambia; no hay FK entrantes. |
| 3 Principales consistentes | Correcto en los grupos duplicados: se conserva el principal aunque sea el posterior (`ORDER BY es_principal DESC`) y el retirado queda con `es_principal=0`. |
| 4 No deja personas sin principal | **Brecha:** V49 no corregía personas que ya tenían contactos y ningún principal (V11 lo permitía). → V50 promueve el contacto vigente más antiguo, sólo en esas personas. |
| 5 No afecta contactos válidos | Correcto: el hash de los contactos no involucrados es idéntico. |
| 6 Respeta restricciones | Correcto: los `CHECK` y los índices únicos rigen sobre el resultado. |
| 7 Trazabilidad | **Brecha:** la baja sólo constaba en la fila, sin evento en `eventos_auditoria`, a diferencia de toda baja posterior. → V50 registra un evento `REMOVE` (actor nulo) por cada baja de migración, de forma idempotente. |
| 8 Detección previa de casos ambiguos | **Brecha:** no había diagnóstico. → [diagnostico-contactos-previo-v49.cjs/.sql](../scripts/diagnostico-contactos-previo-v49.sql) (sólo lectura): lista cada grupo con la fila que se conservaría, la que se retiraría y `TIPOS_DISTINTOS` (se perdería la clasificación PERSONAL/LABORAL), personas sin principal, valores con formato dudoso y valores compartidos entre personas. |
| 9 Sin conflictos de unicidad al activarse | Correcto: las bajas ocurren antes de crear los índices; la comparación usa la misma intercalación (`SQL_Latin1_General_CP1_CI_AS`) que el índice. |
| 10 Datos reales | Base aislada: 0 duplicados, 0 personas sin principal. **Base habitual (V47, sólo lectura): 1 correo (administrador inicial) y 0 teléfonos; 0 bajas previstas, 0 personas sin principal.** |

Límite que no se puede corregir sin criterio humano: si dos duplicados tienen tipos distintos, V49 conserva uno y la clasificación del otro se pierde (queda en la fila retirada). El diagnóstico lo anticipa para decidir antes de migrar.

V50 no toca valores, tipos, cuentas, roles ni credenciales. **Ninguna migración (V48–V51) se aplicó a la base habitual.**

## 7. Pruebas (resultados reales)

- Backend `mvn test`: **328 pruebas, 0 fallas** (322 previas + `TransferContactIntegrationTest` 6). Cubre paciente nuevo con contactos, persona preexistente con cuenta y contactos personales propios (sin cambios en `telefonos` ni credenciales), paciente existente, campos desconocidos (incluido el antiguo `patient.telefono`), 7 variantes de datos inválidos o ambiguos, rollback tardío, consulta por rol (DTS solicitante, Operaciones, otro DTS, comandante, administrador, anónimo), auditoría de la consulta sin números, escrituras no autorizadas, identificadores de otra solicitud o inexistentes, mantenimiento con versión, límite y principal, cierre de la coordinación (rechazo, finalización, vuelo operativo) y concurrencia (6 altas idénticas → 1; 6 altas distintas → límite respetado).
- Frontend `vitest run`: **128 pruebas, 0 fallas** (120 previas + `transferContacts.test.jsx` 8); `vite build` correcto.
- [e2e-contactos-solicitud.cjs](../scripts/e2e-contactos-solicitud.cjs) (API real, SQL Server real): aprobado. V50/V51 aplicadas, alta atómica en las tres variantes de identidad con SQL tras cada paso, rechazo de campos desconocidos y de 7 payloads inválidos sin residuos (conteo de personas, fichas, vuelos, contactos y contactos personales idéntico), rollback con persona ya creada, consulta con auditoría, 403/401/404 por rol e identificador manipulado, detalle y listado general sin teléfonos, restricciones SQL (duplicado vigente, dos principales, nombre ausente, vuelo no sanitario, baja incompleta), **8 altas idénticas simultáneas → 1** y límite de 3 bajo carrera, cancelación de la solicitud, auditoría sin datos completos, hash de cuentas intacto, `DBCC CHECKCONSTRAINTS` y persistencia tras reiniciar.
- [e2e-contactos-solicitud-ui.cjs](../scripts/e2e-contactos-solicitud-ui.cjs) (Chrome real): aprobado. Búsqueda paginada del paciente, teléfono inválido sin envío, dos contactos con el paciente existente, paciente nuevo con contacto sin nombre, edición con versión, principal, baja lógica, ambigüedad rechazada por el servidor, recarga, consulta de Operaciones a pedido con auditoría y sin edición, solicitud sin contactos, comandante sin acceso y cuentas intactas.
- [e2e-migracion-contactos.cjs](../scripts/e2e-migracion-contactos.cjs): aprobado sobre una base descartable con datos ambiguos (V49 + V50 + V51, diagnóstico previo, idempotencia).
- **E2E recuperados.** `e2e-usuarios` ahora pasa sus **12 bloques** (incluidas las dos rondas de la carrera de últimos administradores) mediante [e2e-usuarios-aislado.cjs](../scripts/e2e-usuarios-aislado.cjs), que levanta una base y un backend descartables (con su propio volumen documental), detiene mientras tanto el backend y el frontend de trabajo —Docker dispone de ~3,4 GB— y los reinicia; no se eliminó ni desactivó ningún administrador existente y no se modificó ninguna aserción de negocio. Se actualizó una aserción obsoleta: ya no exige que la base habitual esté en V32, sino que conserve la versión que tenía al empezar (V47). `e2e-solicitudes-ui` opera con la búsqueda paginada y ahora comprueba que la búsqueda por nombre devuelve a dos homónimos, que se selecciona el correcto por la terminación del DNI, que el DNI completo no se muestra y que la solicitud queda asociada a ese paciente y no al homónimo.
- **Regresión completa** ([e2e-suite-completa.cjs](../scripts/e2e-suite-completa.cjs), 21 scripts Node: los 16 anteriores —con `e2e-usuarios` vía el escenario descartable— más los 4 de contactos y el de migración): **19 aprobados en la primera pasada**; los 2 que fallaron eran errores **nuevos y propios de este incremento** y se corrigieron: `e2e-paciente-solicitud` enviaba `identidadConfirmada` a `POST /flights` (que no lo define; el contrato estricto lo rechaza; el script ahora comprueba el rechazo y envía el cuerpo correcto) y `e2e-contactos` desbordaba `STRING_AGG` (8000 bytes) al crecer la base. Ambos se volvieron a ejecutar: **aprobados**. Resultado final: 21/21. Un fallo de infraestructura aparte: el motor de Docker dejó de responder unos minutos por memoria (se recuperó solo; el SQL Server aislado se reinició y la base quedó en V51 sin pérdida).
- Los E2E Python históricos siguen sin ejecutarse (no hay Python).

## 8. Limitaciones y decisiones pendientes

1. **Contacto obligatorio:** hoy es opcional; hacerlo obligatorio (o al menos uno para extrema urgencia) requiere una decisión operativa.
2. **Comandante:** no tiene acceso; si debe coordinar la recogida con estos contactos, definir cuándo y con qué auditoría.
3. **Retención:** los contactos de solicitudes cerradas se conservan ocultos; falta la política de retención o anonimización de datos personales de terceros.
4. **Contacto personal del paciente sin cuenta (A):** nadie lo mantiene; si el negocio lo requiere, definir quién lo registra y con qué verificación.
5. Sin verificación de los números, sin envío de mensajes ni llamadas desde el sistema, formato genérico de teléfono (6–15 dígitos).
6. La corrección administrativa de contactos personales ajenos y la rectificación de DNI siguen pendientes y separadas.
7. En H2 no se prueban los índices filtrados ni el detalle general del vuelo; se verifican con SQL Server real.

## 9. Archivos

Nuevos: `V50__correccion_preventiva_contactos_v49.sql`, `V51__contactos_coordinacion_traslado_sanitario.sql`, `domain/flight/TransferContact.java`, `repository/TransferContactRepository.java`, `service/TransferContactService.java`, `api/TransferContactController.java`, `api/dto/TransferContactDtos.java`, `api/dto/StrictJson.java`, `config/StrictJsonConfiguration.java`, `TransferContactIntegrationTest.java`, `frontend-react/src/transferContacts.jsx` y `.test.jsx`, `scripts/e2e-contactos-solicitud.cjs`, `scripts/e2e-contactos-solicitud-ui.cjs`, `scripts/e2e-migracion-contactos.cjs`, `scripts/diagnostico-contactos-previo-v49.sql/.cjs`, `scripts/e2e-usuarios-aislado.cjs`, este documento.

Modificados: `PatientDtos`, `FlightDtos`, `ApiExceptionHandler`, `AuditCatalog`, `FlightController`, `SanitaryRequestRegistrationService`, `main.jsx`, `styles.css`, `AdministratorAuthorizationTest`, `PatientServiceIdentityTest`, `scripts/e2e-solicitudes-ui.cjs`, `scripts/e2e-usuarios.cjs` (aserción de la base habitual), `scripts/e2e-paciente-solicitud.cjs`, `scripts/e2e-contactos.cjs` y la matriz. Nuevo también: `scripts/e2e-suite-completa.cjs`.
