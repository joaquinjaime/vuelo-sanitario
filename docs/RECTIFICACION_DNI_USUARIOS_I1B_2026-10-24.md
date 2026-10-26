# I-1b — Rectificación del DNI desde Administración de usuarios — 2026-10-24

Continuación de [RECTIFICACION_DNI_IDENTIDAD_2026-10-24.md](RECTIFICACION_DNI_IDENTIDAD_2026-10-24.md). **Sin migraciones nuevas** (la última sigue siendo V53). Flyway: habitual **V47** (sin tocar), E2E aislada **V53**. El ensayo de migraciones V47→V53 no se repitió: este incremento no agrega ni modifica ninguna migración.

## 1. Arquitectura: una única lógica de identidad

| Pieza | Responsabilidad |
|---|---|
| **`PersonIdentityService`** (nuevo, extraído de `PatientDirectoryService.rectifyDni`) | Todas las reglas de rectificación/asignación del DNI sobre `personas`: versión, cotejo, motivo, normalización y rango, igualdad con el actual, confirmación de la cuenta, DNI ocupado, escritura con el índice único y la versión como árbitros, y la auditoría. Dos entradas: `rectifyDni(Person, …)` y `rectifyUserDni(userId, …)` (la persona se resuelve siempre desde la cuenta). También es la única definición de `canonicalDni`. |
| `PatientDirectoryService.rectifyDni` | Delgado: resuelve la ficha y delega. La corrección de nombre y nacimiento y la búsqueda siguen donde estaban. |
| `PUT /api/auth/users/{id}/dni` (`AuthController`) | Sólo `ADMINISTRADOR`; el servidor resuelve la persona desde la cuenta (se rechaza cualquier `personId` suministrado: cuerpo estricto) y devuelve el `UserDetail` actualizado. |
| `PUT /api/patients/{id}/dni` | Sin cambios de contrato; mismas reglas porque es la misma implementación. |
| Frontend `dniRectification.jsx` | Un solo formulario (`DniRectification`) usado por **Pacientes > Identidad** y por **Usuarios > Detalle**: mismas validaciones, advertencias, confirmaciones, conflictos, estados de carga y prevención de doble envío. |

La extracción no cambió el comportamiento de I-1: los 12 + 9 tests de I-1 pasan sin modificar sus expectativas (sólo el constructor).

### Regla de auditoría compartida

Un único criterio para ambas entradas: el evento `RECTIFY_DNI` (o `ASSIGN_DNI`) cuelga de la **ficha de paciente si la persona la tiene** (`PATIENT_IDENTITY`, igual que en I-1, así no se rompe ningún historial ni consumidor) y, si no, de la **cuenta** (`USER`). No se cambió el nombre del tipo de entidad. El detalle de usuario muestra ambos: su historial consulta `USER`, `USER_ROLE` y, si la cuenta es también paciente, `PATIENT_IDENTITY` de su ficha (el detalle ahora informa `pacienteId` y `versionIdentidad`). El payload es el de I-1 más `usuarioId`: persona afectada, administrador (actor), fecha, motivo, `cotejoDocumental`, estado de la cuenta y **sólo las terminaciones** del DNI; ni códigos de activación, ni hashes, ni DNI completos (verificado por consulta SQL sobre todas las rectificaciones).

## 2. Activación de cuentas: análisis del mecanismo y de su relación con el DNI

| Pregunta | Hallazgo (verificado en código y en SQL Server real) |
|---|---|
| Relación del código con la cuenta | Un registro de `activaciones_cuenta` ligado al **usuario** (FK `id_usuarios`) con el hash BCrypt de 24 bytes aleatorios (192 bits). El código no depende del DNI. |
| Cómo se valida el DNI | Sólo para *localizar* la activación abierta (`findOpenByDni`: DNI canónico → persona → usuario → activación sin usar). Se exige exactamente un candidato y luego el código debe coincidir con el hash. |
| Vencimiento | 24 h (`fecha_expiracion`); vencido → 400. **Rectificar no lo extiende ni lo reinicia** (probado con el reloj +25 h). La recuperación es la regeneración de código existente. |
| Un solo uso | `fecha_utilizacion`; un segundo intento falla (409/400). |
| Límite de intentos | No existe. Con 192 bits de entropía y BCrypt, la fuerza bruta del código es inviable; el DNI no es secreto. |
| ¿Se puede activar una identidad equivocada? | No: el DNI sólo elige el candidato; sin el código correcto (ni con uno incorrecto o vacío) no se activa, aunque el DNI sea el corregido. |
| ¿Algún endpoint acepta el DNI anterior? | No. Tras rectificar, el DNI anterior da 404 en la activación, 0 resultados en la búsqueda administrativa y queda libre para el alta. |
| ¿La rectificación cambia el estado de activación? | No. La cuenta (estado, nombre de usuario, hash, versión de credenciales, roles) y su código quedan idénticos (instantánea SQL antes/después). |
| Autorización | La rectificación y la regeneración de código exigen `ADMINISTRADOR`; la activación es pública y depende del código. |

**Conclusión:** el mecanismo es seguro tal como está y se preservó; el código vigente sigue siendo válido y la persona activa con el DNI corregido. No se regeneraron códigos, no se creó un sistema paralelo ni se implementó ningún envío externo.

**Hallazgo preexistente (no corregido):** el endpoint público `POST /auth/activar-cuenta` responde de forma distinta según el estado del DNI (404 "DNI inexistente", 409 "La cuenta ya está activada", 400 "No hay un código de activación vigente", 400 "El código venció"): cualquiera, sin código, puede averiguar si un DNI pertenece a una cuenta y en qué estado. No lo introduce ni lo agrava la rectificación. No lo modifiqué porque esos mensajes son una decisión de producto deliberadamente cubierta por pruebas (p. ej. `reusedCodeReportsAnAlreadyActivatedAccount`) y unificarlos empeora la ayuda al usuario legítimo; queda como decisión pendiente (alternativa: respuesta uniforme "No se pudo activar la cuenta" más limitación de intentos por DNI/origen).

## 3. Reglas (las de I-1, sin cambios)

Sólo `ADMINISTRADOR`; motivo 10–500 caracteres; cotejo documental declarado (no se presenta como verificación automática); DNI normalizado de 7 a 12 dígitos y distinto del actual; DNI ocupado = 409 sin identificar a la otra persona y sin fusión; versión de identidad (V48) y `uq_personas_dni` como árbitros de la concurrencia; auditoría en la misma transacción (si falla, nada se aplica); **una cuenta exige siempre confirmación explícita** (toda cuenta, activa, pendiente o desactivada); el cambio no reactiva, no desactiva, no regenera ni invalida nada.

## 4. Escenarios verificados

| | Escenario | Evidencia |
|---|---|---|
| A | Persona con ficha y sin cuenta (flujo existente) | I-1 sin cambios: `e2e-identidad-dni*`, `PatientDniRectification*` |
| B | Cuenta sin ficha | `e2e-identidad-dni-usuarios` B; Chrome A; integración HTTP |
| C | Cuenta con ficha | `e2e-identidad-dni-usuarios` C; Chrome B (la ficha de Pacientes muestra el mismo DNI con su cuenta) |
| D | Cuenta pendiente | `e2e-identidad-dni-usuarios` D; Chrome C; integración con activación real |
| E | Cuenta desactivada | `e2e-identidad-dni-usuarios` E; Chrome D (sigue desactivada, historial de baja intacto) |
| F | DNI ocupado | 6 variantes (formatos equivalentes, cuenta activa, desactivada, paciente sin cuenta) |
| G | Concurrencia | 2 administradores; 6 rondas de dos cuentas hacia el mismo DNI; cuenta y ficha a la vez |

## 5. Pruebas

| Verificación | Resultado |
|---|---|
| Backend completo (mvn -o test) | **393 pruebas aprobadas** (379 + 6 de PersonIdentityServiceTest + 8 de UserDniRectificationIntegrationTest), 0 fallos |
| Frontend completo (vitest run) | **164 pruebas aprobadas** (159 + 5 en users.test.jsx), 13 archivos; vite build correcto |
| e2e-identidad-dni-usuarios.cjs (API real, SQL Server real) | 11 bloques aprobados |
| e2e-identidad-dni-usuarios-ui.cjs (Chrome real) | 6 bloques aprobados |
| **Suite Node completa en una única pasada** | **27/27 scripts aprobados** (los 25 anteriores + 2 nuevos): identidad, activación y usuarios (e2e-usuarios, e2e-usuarios-ui), solicitudes sanitarias, pacientes, contactos, auditoría, aeronaves, cierre y documentos |

Qué comprueban con SQL Server real:

* **Servicio (6) e integración HTTP con JWT y seguridad (8, H2):** matriz de roles (ADMINISTRADOR sí; DTS, Operaciones, Centro de Operaciones y comandante 403; anónimo 401); cuenta sin ficha (credenciales, roles y sesión intactos; no se crea ficha); cuenta con ficha (reflejo en ambos contextos, un evento bajo la ficha, versión compartida con la entrada de pacientes); cuenta desactivada (sigue desactivada y sin ingreso); cuenta pendiente (código sin tocar, DNI anterior 404, DNI correcto sin código 400, activación con el DNI corregido y una sola vez); DNI ocupado en tres formatos; formatos inválidos, igual al actual, motivo, cotejo, cuenta sin confirmar, `personId` suministrado, usuario inexistente y persona inconsistente; dos administradores simultáneos; reversión ante un fallo de auditoría.
* **E2E API (A–I):** permisos y 14 entradas inválidas sin efecto en SQL; usuario sin ficha (instantánea SQL de usuario, hash, estado, versión de credenciales, roles y persona idéntica antes y después; búsqueda con el DNI corregido); usuario con ficha y vuelo sanitario (misma persona, una sola ficha, vuelo conservado, un evento, y el camino inverso con la misma versión); pendiente (instantánea de la activación idéntica, activación con el DNI corregido, vencimiento a 24 h no extendido con el reloj +25 h y recuperación con la regeneración existente); desactivada; DNI ocupado en 6 variantes; **concurrencia real** (2 administradores; 6 rondas de dos cuentas hacia el mismo DNI decididas por `uq_personas_dni`; cuenta y ficha a la vez); atomicidad con un trigger temporal que fuerza el fallo de auditoría; sin códigos, tokens ni hashes en la auditoría; sin DNI duplicados ni no numéricos; la base habitual sigue en V47.
* **E2E Chrome (A–E):** el detalle de Usuarios ofrece "Rectificar DNI" con validaciones, DNI ocupado con lo escrito conservado, versión vencida por otro administrador y "Volver a cargar la cuenta", rectificación con DNI con puntos, historial administrativo con la entrada, la ficha de Pacientes mostrando el mismo DNI con su cuenta, advertencia y activación de cuenta pendiente, cuenta desactivada desde su pestaña, y el DTS sin acceso.

**Cómo leer estos resultados**

* La suite de 27 scripts se ejecutó **una vez, completa y sin repetir scripts**: 27/27. Las suites de backend y frontend se ejecutaron antes y por separado; no se repitió el ensayo de migraciones (no hay migraciones nuevas).
* Antes de esa pasada, los dos scripts nuevos pasaron en su primera ejecución individual (no hubo que corregirlos).
* **Estabilidad de la suite frontend:** al sumar las pruebas nuevas aparecieron fallas intermitentes en pruebas preexistentes de formularios con autocompletado (dts.test.jsx, transferContacts.test.jsx, main.test.jsx) en 4 de 6 ejecuciones completas, siempre una distinta y todas aprobadas en aislamiento. La causa es que el tiempo de espera por defecto de findBy*/waitFor (1 s) no alcanza con varios archivos jsdom en paralelo. Se agregó src/test-setup.js (asyncUtilTimeout de 5 s, solo un tope: las pruebas que pasan no esperan más) y vite.config.js lo registra; después, 3 ejecuciones completas consecutivas dieron 164/164 y la ejecución final también.
* La suite E2E tardó más que en el incremento anterior (p. ej. e2e-solicitudes 401 s frente a 223 s) por la carga de la máquina; ningún script falló.
* **No ejecutado:** los scripts Python (no hay Python en la máquina); un E2E de un cambio de DNI masivo o la fusión de identidades (fuera de alcance); el envío externo de códigos (no existe infraestructura).


## 6. Riesgos y pendientes

* La cuenta pendiente activa con el DNI corregido: si el DNI viejo ya se le comunicó, hay que avisarle.
* Fusión de identidades duplicadas: no implementada; hoy el DNI ocupado se rechaza. Se justificaría sólo si el negocio detecta duplicados reales.
* Instantánea histórica del nombre/DNI: no se agregó; el sistema muestra siempre el dato actual y ningún proceso exige conservar el anterior más allá de la terminación auditada.
* Enumeración de DNI en la activación pública (§2): decisión de producto pendiente.
* Un administrador sigue viendo el DNI completo en el detalle de la cuenta y de la ficha (preexistente).
* La falta de un límite de intentos de ingreso y de recuperación pública de contraseña (pendientes ya conocidos de `usuarios`).

## 6.1 Clasificación

Ver la matriz: con I-1 e I-1b toda persona del sistema (con cuenta, con ficha o con ambas) tiene su identidad creada, buscada, corregida y rectificada por un único camino seguro, concurrente y auditado, probado de extremo a extremo con SQL Server. `personas` y `pacientes` pasan a **FUNCIONALES**; sus necesidades remanentes (fusión de duplicados, instantánea histórica) no tienen una regla de negocio que las exija y se registran como decisiones pendientes, no como funcionalidad incompleta. `correos_electronicos` y `telefonos` **siguen parciales**: la rectificación no completa la gestión de contactos (ningún proceso los consume).

## 7. Próximo incremento: I-2, contactos operativos de la tripulación asignada

Evaluación (no implementada en esta ejecución). Hoy Operaciones asigna comandante y tripulación adicional (vuelos.id_usuario_comandante y vuelos_tripulantes), pero **nadie puede consultar cómo contactarlos**: los correos y teléfonos personales (correos_electronicos, telefonos; V49: valor normalizado, tipo PERSONAL/LABORAL, un principal vigente, versión, baja lógica) los mantiene cada persona en "Mi cuenta" y ningún proceso los usa.

| Aspecto | Propuesta |
|---|---|
| Qué necesita Centro de Operaciones | Para cada integrante asignado a un vuelo abierto (comandante y tripulación vigente): nombre, función, y su teléfono y correo **principales vigentes** con su tipo, para coordinar presentación, cambios de horario o ausencias. Nada de edición: el titular sigue siendo el único que modifica sus contactos. |
| Contactos que existen | Los de V49 por persona (varios, con tipo PERSONAL o LABORAL y un principal). Decisión de negocio previa: si Operaciones puede ver los **PERSONALES** o sólo los LABORALES (y, de no haberlos, cuál es el criterio); es dato personal de empleados. |
| Permisos | Sólo OPERACIONES y CENTRO_OPERACIONES, sobre vuelos que gestionan y mientras el vuelo no esté cerrado (mismos estados abiertos de hangar/documentos). El comandante no ve los de sus compañeros, el DTS no ve ninguno y ADMINISTRADOR no opera vuelos. |
| Integración | En el detalle del vuelo de Operaciones, junto a la tripulación (componente FlightCrew) y la asignación de comandante: una acción deliberada "Consultar contactos de la tripulación" (no se cargan al abrir el detalle), igual que los contactos de coordinación del traslado. |
| Tablas | vuelos, vuelos_tripulantes, usuarios, personas, correos_electronicos, telefonos, eventos_auditoria. Sin tablas nuevas previsibles. |
| Auditoría | Cada consulta deja un evento (operación VIEW, entidad con el vuelo, cantidad de personas y contactos devueltos, sin los valores) como ya hace TransferContactService; sin escrituras que auditar. Si más adelante se agregan avisos, sus envíos serían un incremento aparte. |
| Dependencias | V49 (modelo de contactos), asignación de tripulación (hecha), política de privacidad de los contactos PERSONALES, estados abiertos del vuelo. La plomería de "consulta contextual auditada" ya existe. |
| Por qué ahora | Es el primer consumidor real de correos_electronicos y telefonos (las dos tablas parciales que dependen de él), pertenece a la etapa de asignación y preparación del ciclo del vuelo y reutiliza casi todo lo ya construido. Requiere antes una decisión de privacidad, que conviene tomar con la operación. |
