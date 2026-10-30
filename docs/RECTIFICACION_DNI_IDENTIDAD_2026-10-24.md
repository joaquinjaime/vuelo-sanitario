# I-1 — Rectificación controlada del DNI de una identidad compartida — 2026-10-24

Alcance: `personas` y `pacientes` (con sus vínculos a `usuarios`, `vuelos_sanitarios` y auditoría). **Sin migraciones nuevas:** la última migración real sigue siendo V53. Flyway: habitual **V47** (sin tocar), E2E aislada **V53**.

## 1. Diagnóstico del uso del DNI

`personas.dni` es la única columna de DNI de todo el esquema (`NVARCHAR(40)`, nulo permitido). La integridad ya estaba en SQL Server: índice único filtrado `uq_personas_dni` (`dni IS NOT NULL`) y `ck_personas_dni_solo_digitos` (sólo dígitos). `personas.version_identidad` (V48, `@Version`) detecta cambios simultáneos entre la corrección de pacientes y la administración de usuarios.

| Lugar | Cómo usa el DNI | Efecto de rectificarlo |
|---|---|---|
| Referencias a la persona | 6 claves foráneas a `id_personas` (`pacientes`, `usuarios`, `correos_electronicos`, `telefonos`, `perfiles_comandante`, `habilitaciones_profesionales`) | Ninguno: se rectifica el atributo, nunca la clave |
| `vuelos_sanitarios` | Apunta a la ficha (`id_pacientes`), nunca al DNI | Ninguno: el vuelo conserva su ficha |
| Inicio de sesión / JWT | Por **nombre de usuario**; el JWT lleva el id de usuario y el nombre | Ninguno: no se invalida ninguna sesión ni credencial |
| Recuperación de cuenta | No existe una recuperación pública | — |
| **Activación de cuenta** (`/auth/activar-cuenta`) | **El DNI + el código de un solo uso localizan la activación** (`findOpenByDni`) | Sólo afecta a cuentas `PENDIENTE_ACTIVACION`: ver §3 |
| Alta de usuarios / pacientes | Búsqueda exacta por DNI canónico; conflictos `USER_DNI_ALREADY_EXISTS`, `PERSON_EXISTS_WITHOUT_ACCOUNT` | Usan siempre el DNI vigente |
| Búsqueda de pacientes | DNI exacto (`findWithPersonByDni`) | La búsqueda usa la identidad corregida |
| Detalle del vuelo | `PatientDetail.dni` se lee de `personas` en cada consulta | Muestra el DNI corregido (dato actual, no instantánea) |
| Auditoría existente | Ningún evento guarda un DNI (consulta SQL: 0 eventos con "dni"); el sanitizador de auditoría oculta cualquier clave con "dni" | — |
| Documentos e informes | Ninguna tabla guarda un DNI propio; los PDF son archivos opacos cargados por personas | No se reescriben documentos emitidos |
| Normalización | Tres implementaciones equivalentes (dígitos) en `AuthService`, `PatientService` y `PatientDirectoryService`; la de búsqueda exige 7–12 dígitos | Se reutiliza la del servicio de pacientes y su rango |

Conclusión sobre cuentas: cambiar el DNI de una persona con cuenta **no** toca contraseña, roles, estado, sesiones ni credenciales; el único mecanismo que lo consume es la activación de una cuenta aún no activada.

## 2. Política implementada

* **Permisos:** sólo `ADMINISTRADOR` (`PUT /api/patients/{id}/dni`). DTS, Centro de Operaciones, Operaciones, comandante y sesiones anónimas reciben 403/401. No se amplió ningún permiso ni se tocaron los endpoints de autoservicio ni el registro de solicitudes.
* **Motivo y cotejo:** motivo obligatorio (10–500 caracteres) y `cotejoDocumental=true`, la declaración expresa del administrador; queda registrada con su autor y fecha en el evento de auditoría. No se presenta como verificación con organismos oficiales ni se integra ningún servicio externo.
* **DNI nuevo:** se normaliza como el resto del sistema (`40.111.222`, ` 40-111-222 ` → `40111222`), 7 a 12 dígitos, distinto del actual (en cualquier formato equivalente).
* **DNI ocupado:** 409 `DNI_ALREADY_REGISTERED`; no identifica a la otra persona; no hay fusión, reasignación, eliminación, transferencia ni modificación de claves. La fusión queda como procedimiento independiente (no implementado).
* **Alta de identificador:** si la persona no tenía DNI, la misma operación es una asignación (`ASSIGN_DNI`) con las mismas exigencias; no crea fichas ni personas.
* **Persona con cuenta:** la interfaz y el servidor exigen una confirmación explícita (`confirmaCuenta`) y el evento guarda el estado de la cuenta. No se modifican credenciales, roles, estado ni versión de credenciales.
* **Cuenta pendiente de activación:** se permite (es el caso más común de un DNI mal cargado al crear una cuenta) y se documenta su consecuencia: **la cuenta y su código de activación no se tocan**; el DNI anterior deja de activar (404 "DNI inexistente") y la persona activa su cuenta con el DNI corregido y el mismo código. La alternativa (bloquear) dejaba sin remedio un error que hoy no tiene ninguna vía; se verificó el comportamiento completo en SQL Server real (E2E, bloque F).
* **Historial de vuelos:** la persona conserva ficha, vuelos y relaciones. El DNI mostrado es siempre el actual; no existe ninguna copia persistida del DNI que haya que reescribir.

## 3. Backend

* `PatientDirectoryService.rectifyDni` (junto a la corrección de nombre/nacimiento existente; no hay un servicio paralelo): valida versión, cotejo, motivo, formato/rango, igualdad con el actual y confirmación de cuenta; consulta el DNI ocupado; asigna `personas.dni` y fuerza `flush`. Un `DataIntegrityViolationException` (índice único: DNI tomado entre la consulta y la escritura) se traduce a 409 `DNI_ALREADY_REGISTERED`, y un `OptimisticLockingFailureException` (`@Version`) a 409 `PATIENT_STALE_IDENTITY`. Todo ocurre en una transacción.
* `RectifyDni` (`@StrictJson`: un campo desconocido es 400), `PatientIdentityDetail.cuentaEstado` (estado de la cuenta, nunca credenciales), `PatientCorrectionEvent.operacion` y consulta de historial ampliada a `RECTIFY_DNI`/`ASSIGN_DNI`.
* No se modifican identificadores, claves foráneas, vuelos, fichas ni documentos.

## 4. Auditoría

Evento `PATIENT_IDENTITY` / `RECTIFY_DNI` (o `ASSIGN_DNI`), sin vuelo, en la misma transacción, con el administrador como actor. Antes: `{"terminacionAnterior":"1222"}`; después: terminación nueva, `personaId`, `cotejoDocumental`, `motivo` y, si corresponde, `cuentaEstado`. **Sólo se guardan los últimos 4 dígitos**: los eventos generales no son un repositorio de DNI (se comprobó que ni la tabla ni la consulta administrativa los contienen). Sólo el ADMINISTRADOR ve este tipo de entidad (lista blanca de la política de auditoría). El historial de la ficha lo muestra enmascarado (`••••1222 → ••••2333`).

## 5. Concurrencia

* `version_identidad` (V48): dos administradores con la misma versión → uno prevalece y el otro recibe 409 `PATIENT_STALE_IDENTITY`; lo mismo contra una corrección de nombre simultánea.
* `uq_personas_dni`: dos fichas distintas que compiten por el mismo DNI → una prevalece y la otra recibe 409 `DNI_ALREADY_REGISTERED`, sin modificarse ni auditarse (6 rondas reales en SQL Server). La consulta previa sólo mejora el mensaje; decide el índice.
* Un fallo de auditoría revierte todo (probado con un trigger temporal en SQL Server real y con un doble en H2).

## 6. Frontend

Integrado en **Pacientes > Identidad de pacientes** (`patients.jsx`), sin pantalla nueva: botón "Rectificar DNI" ("Asignar DNI" si falta), DNI actual, DNI nuevo, advertencia de identidad compartida y de no fusión, motivo, declaración de cotejo, y —si hay cuenta— su estado, una advertencia sobre credenciales/sesiones (con la consecuencia para la activación pendiente) y una confirmación propia. Validaciones previas con las reglas del servidor (`dniProblem`); el botón se habilita sólo con todo completo; envío único; errores de duplicado/versión/autorización visibles conservando lo escrito; "Volver a cargar la ficha" ante una versión vencida; al terminar se actualizan la identidad mostrada, el historial y la búsqueda. El DTS no tiene la acción (usa sólo la búsqueda y selección).

## 7. Pruebas

| Verificación | Resultado |
|---|---|
| Backend completo (`mvn -o test`) | **379 pruebas aprobadas** (358 + 12 en `PatientDniRectificationServiceTest` + 9 en `PatientDniRectificationIntegrationTest`), 0 fallos |
| Frontend completo (`vitest run`) | **159 pruebas aprobadas** (150 + 9 en `patients.test.jsx`), 13 archivos; `vite build` correcto |
| `e2e-identidad-dni.cjs` (API real, SQL Server real) | 13 bloques aprobados |
| `e2e-identidad-dni-ui.cjs` (Chrome real) | 5 bloques aprobados |
| **Suite Node completa en una única pasada** | **25/25 scripts aprobados** (los 23 anteriores + 2 nuevos), incluidos identidad compartida, registro de pacientes, selección paginada, solicitudes y usuarios |

Lo que cubren, con SQL Server real:

* **Servicio (12) e integración HTTP con JWT y seguridad (9, H2):** rectificación sin cuenta (auditoría sólo con terminaciones), asignación de un DNI ausente, formatos equivalentes, formatos y rangos inválidos, igual al actual, cotejo ausente o falso, motivo vacío/corto/largo/con caracteres de control, DNI ocupado (no identifica a la otra persona), conflicto de versión (previo y durante la escritura), persona con cuenta (confirmación; credenciales, roles, sesión e ingreso intactos), paciente inexistente, matriz de roles (ADMINISTRADOR sí; DTS, Operaciones, Centro de Operaciones, comandante 403; anónimo 401), cuerpo estricto, dos administradores simultáneos (1 éxito y 1 conflicto) y reversión completa ante un fallo de auditoría.
* **E2E API (A–K):** permisos y ausencia de efectos en SQL; 8 formatos inválidos, 3 equivalentes al actual, cotejo/motivo/campo desconocido/cuerpo ausente/paciente inexistente/versión vencida sin modificar ni auditar; **paciente sin cuenta con vuelo sanitario**: misma persona, misma ficha, mismo vuelo, nombre y nacimiento intactos, ningún alta o baja de personas ni fichas, DNI normalizado, búsqueda con la identidad corregida y evento con sólo terminaciones (también en la consulta de auditoría); **DNI ocupado** en 5 variantes (incluidos los DNI de las personas con cuenta) sin ningún cambio; **cuenta activa** (usuario, hash, estado, versión de credenciales y roles idénticos; sesión e ingreso siguen funcionando); **cuenta pendiente de activación** (cuenta y código idénticos, el DNI anterior ya no activa y el corregido sí); asignación; **concurrencia real** (2 administradores con la misma versión; 6 rondas de dos fichas hacia el mismo DNI decididas por `uq_personas_dni`; rectificación contra corrección de nombre); **atomicidad** con un trigger temporal que fuerza el fallo de auditoría; las restricciones de SQL Server rechazan por sí solas un DNI repetido o no numérico; la base habitual sigue en V47.
* **E2E Chrome (A–D):** el botón sólo se habilita con todo completo; mensajes de formato/igualdad; DNI de otra persona = conflicto sin cambios y con lo escrito conservado; versión vencida por otro administrador → rechazo sin pisar, "Volver a cargar la ficha" y rectificación con el DNI escrito con puntos; historial enmascarado; persona con cuenta (advertencia, confirmación, credenciales intactas en SQL); el DTS no ve la acción.

**Cómo leer estos resultados**

* La suite de 25 scripts se ejecutó **una vez, completa y sin repetir scripts**: 25/25. La suite backend y la de frontend se ejecutaron antes y por separado (no coincidieron con los E2E); el ensayo de migraciones se hizo antes de la regresión, no durante.
* Antes de esa pasada, los dos scripts nuevos se iteraron individualmente mientras se escribían (una aserción propia `null` frente a `undefined`, dos nombres de columna de `activaciones_cuenta` y una corrección de nombre sin cambios en el escenario de versión vencida); esas ejecuciones no cuentan como la regresión.
* **Falla transitoria de frontend:** en la primera ejecución completa de vitest posterior a la suite backend, `transferContacts.test.jsx` ("solicitud ... paciente nuevo") falló una vez bajo la carga del arranque de la JVM; pasó aislada dos veces y en dos ejecuciones completas posteriores (159/159). No está relacionada con este cambio, pero se registra: es una prueba sensible a la carga.
* **Corrección durante el trabajo:** un patrón de ensayo propio (`doThrow` sobre el proxy de `AuditService`) exigió declararse dentro de una transacción; no es un cambio de producción.
* **No ejecutado:** los scripts Python (no hay Python en la máquina); un E2E de aplicación de V48–V53 sobre datos productivos reales (la base habitual casi no tiene datos; ver §8); el procedimiento de fusión de identidades (fuera de alcance).
* Quedan en la instancia SQL E2E bases de ejecuciones históricas anteriores (`vuelos_migracion_cie327f1c`, `vuelos_sanitarios_e2e_*`, `vuelos_sanitarios_reconstruccion_v32`); no son de este incremento y no se tocaron.

## 8. Ensayo de migraciones sobre una copia del estado habitual (V47 → V53)

Realizado, no destructivo y sin una segunda instancia de SQL Server:

1. Preflight: base habitual `ONLINE`, `FULL`, Flyway V47 (consultas de sólo lectura); Docker con memoria libre (≈1,3 GB de 3,4 GB).
2. Respaldo `COPY_ONLY, CHECKSUM, COMPRESSION` de `vuelos_sanitarios` (1 754 páginas, 3 776 512 bytes, SHA-256 `eeebdadc…2f90`) escrito en `/tmp` del contenedor habitual; `RESTORE VERIFYONLY WITH CHECKSUM` correcto. Es la única escritura en el contenedor habitual (un archivo temporal; la base no se modificó) y se eliminó al terminar.
3. Copia al SQL E2E existente y restauración con otro nombre (`vuelos_ensayo_v47_20261024_141505`): `ONLINE`, V47, 40 tablas, `DBCC CHECKDB` sin errores.
4. **Hallazgo operativo:** una validación de Flyway que sólo ve archivos SQL falla con "applied migration not resolved locally: 16, 17, 26": V16, V17 y V26 son **migraciones Java** (`db.migration`). Un ejecutor de migraciones debe usar el classpath de la aplicación (`classpath:db/migration`, con `target/classes`), no sólo la carpeta de SQL. Con el classpath correcto, `validate` aceptó las **53 migraciones** (los checksums de V1–V47 coinciden con el historial real de la base habitual) y `migrate` aplicó **V48–V53 (6 migraciones)** sin fallos, con un contenedor Java descartable de 320 MB y el ejecutor ya existente (`scripts/FlywayMigrationRunner.java`).
5. Verificación posterior: Flyway V53 (53 filas, 0 fallidas); `DBCC CHECKDB` y `DBCC CHECKCONSTRAINTS WITH ALL_CONSTRAINTS` sin errores; 0 restricciones o claves foráneas no confiables o deshabilitadas; **conteos de las 40 tablas preexistentes idénticos**, y checksums de datos idénticos salvo `correos_electronicos` (V49 agregó columnas, la fila conserva sus valores originales: correo, tipo, principal y fechas); tabla nueva `contactos_coordinacion_traslado` (V51) con 0 filas.
6. Huella de esquema (`scripts/schema-fingerprint.sql`) comparada con la base E2E: **idéntica** salvo (a) los sufijos aleatorios de constraints con nombre automático y (b) los objetos de diagramas de SSMS (`sysdiagrams`, `fn_diagramobjects`, `sp_*diagram`) que sólo existen en la habitual.
7. Limpieza: la base de ensayo se eliminó (sus archivos desaparecieron del SQL E2E) y se retiraron las copias temporales del respaldo (host, SQL E2E y contenedor habitual). La base habitual siguió `ONLINE` en V47 durante todo el proceso.

**Alcance y riesgos:** la base habitual casi no tiene datos (1 usuario, 1 persona, 1 correo, catálogos): el ensayo demuestra restauración, validación de checksums y migración del estado real, pero **no** ejercita los rellenos de V48–V53 sobre pacientes, vuelos, documentos ni contactos reales (los cubren los scripts sintéticos `e2e-migracion-contactos` y los E2E de cada dominio). No es una autorización: aplicar V48–V53 en la base habitual sigue requiriendo la ventana, el respaldo FULL inmediato previo, la detención de backend/frontend y la autorización expresa. Persiste la limitación ya documentada de custodia local de los respaldos.

## 9. Riesgos y brechas pendientes

* **Cuentas pendientes:** la persona debe activar con el DNI corregido; si la comunicación del DNI viejo ya se entregó, hay que avisarle. No se regenera el código (decisión explícita).
* **Fusión de identidades** (mismo DNI en dos personas): no implementada; hoy se rechaza y se deja para un procedimiento con reglas propias.
* **Personas sin ficha de paciente** (p. ej. personal con cuenta que nunca fue paciente): la rectificación se ofrece desde la ficha de paciente, así que su DNI sigue sin corrección desde la interfaz (extensión recomendada, I-1b, sobre el detalle de usuario reutilizando el mismo servicio).
* El nombre mostrado en vuelos históricos es el actual (no una instantánea); tampoco hay instantánea del DNI anterior más allá de su terminación en la auditoría.
* El administrador ya veía el DNI completo en el detalle de la ficha y de la cuenta (preexistente); la rectificación no lo amplía.
* No cambia la gestión de contactos compartidos (`correos_electronicos`, `telefonos`): siguen sin ser consumidos por ningún proceso.

## 10. Clasificación

`personas` y `pacientes` **siguen PARCIALMENTE FUNCIONALES**: el DNI ya puede rectificarse de forma segura para pacientes (con o sin cuenta), pero persisten necesidades relevantes sin resolver (rectificación para personas sin ficha, fusión de duplicados, instantánea histórica del nombre, contactos de paciente). El recuento de la matriz se mantiene en **27 funcionales y 14 parciales**.
