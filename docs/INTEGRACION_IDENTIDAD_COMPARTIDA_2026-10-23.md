# Identidad compartida en la solicitud sanitaria — 2026-10-23

## Problema inicial y diseño observado

`personas` contiene la identidad; `pacientes` y `usuarios` tienen relaciones independientes, una a una, con `personas`. La ficha de paciente no representa una cuenta. V47 mantiene `uq_personas_dni` filtrado para DNI no nulo; SQL Server también impone unicidad sobre `pacientes.id_personas`. El DNI se guarda sólo con dígitos ASCII. Antes de este incremento, `POST /flights/with-patient` rechazaba una persona existente por DNI y `POST /patients` aceptaba un `personId` elegido por el cliente: permitía saltar la comprobación de identidad. El formulario DTS ofrecía la ruta de paciente nuevo y la selección de fichas existentes, pero no resolvía una identidad compartida.

La administración de cuentas puede asociar una persona sin cuenta con confirmación administrativa. Ese contrato revela datos de cuentas y no corresponde a DTS. No existía prueba automática de identidad ni evidencia de cotejo documental. Por ello se eligió una **declaración humana auditada**: DTS, rol ya autorizado para registrar solicitudes sanitarias, coteja el documento presentado y marca una confirmación explícita en el formulario. La declaración no se presenta como verificación automática del DNI. Esta política fue confirmada expresamente por el usuario durante la implementación.

## Reglas de autorización y privacidad

- `POST /api/flights/with-patient` continúa limitado a DTS. `POST /api/flights` conserva la reutilización de fichas existentes. No se expone búsqueda de usuarios a DTS.
- Un `personId` entrante se rechaza tanto en la ruta atómica como en `POST /api/patients`. La selección legítima de paciente existente usa su `patientId`, no el identificador de persona.
- Con DNI, el backend exige `identidadConfirmada=true` antes de consultar la identidad; una petición sin declaración da la misma respuesta exista o no ese DNI. Sólo admite dígitos, puntos, guiones y espacios; después busca mediante coincidencia exacta del valor canónico. Si existe y todavía no es paciente, exige nombre y apellido concordantes al ignorar acentos, mayúsculas y espacios repetidos, y la misma fecha de nacimiento cuando ya consta una. Si la fecha existente es nula, no se inventa que estaba verificada. Si hay contradicción o ya existe ficha, responde un conflicto genérico sin indicar si la persona tiene cuenta. La ficha existente se reutiliza por la ruta de selección, sin crear duplicados.
- Si el DNI no existe, se conserva el alta atómica anterior. Si se omite el DNI, el modelo permite una persona nueva sin enlace automático. Los datos de `personas` y `usuarios` preexistentes no se actualizan.
- La auditoría `PATIENT / LINK_EXISTING_PERSON_WITH_REQUEST` conserva el actor DTS, paciente y vuelo y un booleano de declaración. No almacena DNI, nombre, contraseña, roles ni datos clínicos. La auditoría revierte con la operación.

## Mapa del proceso

| Escenario | Entrada DTS | Backend | Relaciones y resultado |
|---|---|---|---|
| Persona nueva | Identidad y solicitud; cotejo declarado si se ingresó DNI | `PatientService` crea `personas` y `pacientes`; `FlightService` crea solicitud | `personas` → `pacientes` → `vuelos_sanitarios`; un solo commit |
| Paciente existente | Selecciona ficha | `POST /api/flights` | Reutiliza `pacientes`; sin nuevas filas de identidad |
| Persona existente sin ficha, con o sin cuenta | Ingresa identidad y confirma cotejo | `PatientService` bloquea la fila de `personas`, compara, crea sólo `pacientes`; `FlightService` crea solicitud | Misma persona; `usuarios` permanece independiente e intacto |
| Datos contradictorios o vuelo inválido | Corrige el formulario | Conflicto genérico o validación del vuelo | Sin nueva ficha tras rollback |

La fila de persona se bloquea durante el enlace con `PESSIMISTIC_WRITE`, se comprueba si ya existe ficha y se hace `saveAndFlush` dentro de la transacción externa. La restricción única de `pacientes.id_personas` protege además las carreras. Para una persona nueva, `uq_personas_dni` cierra las altas simultáneas. No se agregó migración: el modelo relacional y las restricciones necesarias ya existían.

## Componentes y contratos modificados

- Backend: `PatientService`, `PersonRepository`, `SanitaryRequestRegistrationService`, `FlightDtos.CreateFlightWithPatient`, `AuditCatalog`; `POST /api/patients` queda limitado a crear una identidad realmente nueva.
- Frontend: `DTS` en `frontend-react/src/main.jsx` pide la declaración de cotejo junto al DNI, impide un envío sin ella, bloquea envíos duplicados y conserva los campos tras un conflicto recuperable. No se añadió pantalla administrativa.
- Pruebas: `PatientServiceIdentityTest`, `frontend-react/src/dts.test.jsx`, `scripts/e2e-identidad-compartida.cjs`, `scripts/e2e-identidad-compartida-ui.cjs`; se actualizaron las pruebas E2E del alta atómica anterior.

## Evidencia ejecutada

- Backend completo: **309 pruebas, 0 fallas, 0 errores, 0 omitidas** (`mvn -q test`, Surefire). Casos nuevos: ID manipulado, DNI con formato, cotejo ausente sin consultar identidad, nombres y fecha contradictorios, ficha duplicada y ausencia de DNI.
- Frontend completo: **107 pruebas en 9 archivos, 0 fallas** (`npm test -- --no-file-parallelism --maxWorkers=1`). La prueba DTS específica cubre declaración, reinicio del cotejo al editar identidad, conservación del formulario y doble envío.
- API E2E sobre SQL Server aislado V47: `e2e-identidad-compartida.cjs` aprobó persona con y sin cuenta, conflicto indistinguible por cuenta, 401/403, ID manipulado, rollback de ficha ante vuelo inválido, reutilización, una sola ficha en dos peticiones concurrentes, auditoría sin DNI y preservación de hash, roles, estado y versión de credenciales. `e2e-paciente-solicitud.cjs` volvió a aprobar los escenarios anteriores.
- Chrome E2E: `e2e-identidad-compartida-ui.cjs` aprobó el formulario DTS para persona con cuenta; `e2e-paciente-solicitud-ui.cjs` volvió a aprobar persona nueva. Las relaciones y la ausencia de duplicación se comprobaron directamente en SQL Server.

## Límites y próximo incremento

La declaración de DTS acredita que el actor afirmó haber cotejado el documento; el sistema no verifica el documento con un registro externo ni conserva una copia. Si faltan o contradicen datos preexistentes, el enlace queda bloqueado hasta la corrección autorizada. El listado completo de pacientes dificulta la selección y puede mostrar más identidades de las necesarias. El siguiente incremento recomendado es **búsqueda paginada y mantenimiento autorizado de pacientes**, con corrección auditada de `personas` y conservación de las referencias de `pacientes`, `usuarios` y vuelos. Después corresponde integrar documentación del vuelo, catálogos operativos y contactos según la matriz.

No se ejecutaron escrituras ni migraciones en la base habitual. No hubo commit ni push.
