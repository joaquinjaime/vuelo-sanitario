# Capítulo 1 — Identidad, cuentas y contactos

[← Informe principal](../INFORME_COMPLETO_BASE_DATOS.md) · [Índice de capítulos](../INFORME_COMPLETO_BASE_DATOS.md#3-índice-y-navegación)

Tablas de este capítulo: [`personas`](#1-tabla-personas), [`usuarios`](#2-tabla-usuarios), [`roles`](#3-tabla-roles), [`usuarios_roles`](#4-tabla-usuarios_roles), [`perfiles_comandante`](#5-tabla-perfiles_comandante), [`activaciones_cuenta`](#6-tabla-activaciones_cuenta), [`correos_electronicos`](#7-tabla-correos_electronicos), [`telefonos`](#8-tabla-telefonos), [`verificaciones_correo`](#9-tabla-verificaciones_correo), [`pacientes`](#10-tabla-pacientes).

Cada tabla sigue la estructura A–I del encargo: **A** identificación · **B** funcionalidad · **C** campo por campo · **D** creación de registros · **E** ejemplo funcional · **F** ciclo de vida · **G** relaciones · **H** restricciones y diseño · **I** evidencia. Convenciones y fuentes en [00-metodologia-y-convenciones.md](00-metodologia-y-convenciones.md).

---

## 1. Tabla `personas`

### A. Identificación de la tabla

| Atributo | Detalle |
|---|---|
| Nombre exacto y esquema | `dbo.personas` (esquema `dbo`) |
| Módulo funcional | 1. Identidad, cuentas y contactos |
| Tipo de tabla | Principal — entidad de identidad compartida (supertipo de usuario y paciente) |
| Migración que la creó | V4 (como `persons`, con id UNIQUEIDENTIFIER) |
| Migraciones posteriores que modificaron su estructura | V8 (renombre a `personas` y columnas al español), V11 (DNI único sólo si informado, retira `telefono`), V12/V13 (DNI canónico sólo dígitos), V24/V27 (id BIGINT IDENTITY `id_personas`), V28 (`nombre_persona`/`apellido_persona`), V47 (índice único filtrado de DNI), V48 (`version_identidad`) |
| Estado actual en el esquema | Vigente — 8 columnas, PK `id_personas`, 0 FK salientes, 6 FK entrantes, 1 índice(s) único(s), 1 CHECK, 0 trigger(s) (verificado contra `sys.*` de la base E2E en Flyway V62) |
| Tablas relacionadas | usuarios, pacientes, perfiles_comandante, correos_electronicos, telefonos, habilitaciones_profesionales |

### B. Funcionalidad y justificación

`personas` guarda **quién es** alguien: nombre, apellido, DNI y fecha de nacimiento. No dice qué hace esa persona en el sistema: eso lo dicen las tablas que la referencian. Una persona puede ser a la vez **titular de una cuenta** (`usuarios`), **paciente** (`pacientes`), **comandante** (`perfiles_comandante`) y titular de **habilitaciones profesionales** (`habilitaciones_profesionales`), y todas apuntan a la misma fila.

Resuelve un problema real del negocio: un médico que trabaja en el sistema puede, en otro momento, ser trasladado como paciente. Sin una identidad única habría dos filas con el mismo DNI, sin forma de saber que son la misma persona, y una corrección de apellido en un lado no llegaría al otro.

**Por qué es una tabla independiente.** Es el patrón *supertipo/subtipo*: los datos personales se normalizaron fuera de `usuarios` y `pacientes` en V4 («los atributos personales y clínicos dejan de duplicarse en los subtipos»). La razón está documentada en el encabezado de V4 y en `PersonIdentityService`. Los contactos (correo, teléfono) también se separaron en tablas propias porque una persona puede tener varios.

**Qué dejaría de funcionar sin ella.** No podría crearse ningún usuario ni paciente (ambos exigen `id_personas` NOT NULL); no habría DNI único por persona; las habilitaciones y los contactos no tendrían titular.

### C. Descripción campo por campo

#### `nombre_persona`

| Atributo | Detalle |
|---|---|
| Nombre | `nombre_persona` |
| Tipo de dato | `nvarchar(100)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Nombre de pila de la persona. |
| Justificación | Es el dato mínimo para identificar a alguien en listados, notificaciones y documentos; se separó de «apellido» para ordenar y buscar por cada uno. |
| Contenido | Texto de hasta 100 caracteres, recortado (`trim`). |
| Origen | Formulario de alta de usuario o de paciente (Administrador o DTS). |
| Momento inicial | En el INSERT de la persona. |
| Modificación | Edición de datos del usuario (Admin), reactivación de la cuenta, corrección de identidad del paciente (Admin). |
| Validaciones | Obligatorio en la API (`@NotBlank`, máx. 100); comparación de identidad ignora tildes y mayúsculas (`sameName`). |

#### `apellido_persona`

| Atributo | Detalle |
|---|---|
| Nombre | `apellido_persona` |
| Tipo de dato | `nvarchar(100)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Apellido de la persona. |
| Justificación | Complementa el nombre para identificar a la persona y para el control «mismo nombre y apellido» al vincular una cuenta a una persona existente. |
| Contenido | Texto de hasta 100 caracteres. |
| Origen | Formulario de alta (Admin/DTS); el bootstrap usa «Inicial». |
| Momento inicial | En el INSERT. |
| Modificación | Mismas operaciones que el nombre. |
| Validaciones | Obligatorio en la API (`@NotBlank`). |

#### `dni`

| Atributo | Detalle |
|---|---|
| Nombre | `dni` |
| Tipo de dato | `nvarchar(20)` |
| Nulabilidad | **Permite NULL.** Opcional por diseño: un paciente puede ingresar sin DNI conocido y el administrador inicial no tiene. Si se desconoce, queda NULL hasta que un Administrador lo asigne por rectificación (`PUT /api/patients/{id}/dni` o `PUT /api/auth/users/{id}/dni`). |
| Función | Documento Nacional de Identidad: clave natural de la persona. |
| Justificación | Es el identificador que ve el negocio para decidir si dos registros son la misma persona (búsqueda de pacientes, bloqueo de duplicados, activación de cuenta por DNI). |
| Contenido | Sólo dígitos, de 7 a 12 en una rectificación (p. ej. `20111222`). |
| Origen | Formulario (Admin/DTS); el sistema elimina puntos, espacios y guiones antes de guardar. |
| Momento inicial | En el INSERT, si fue informado. |
| Modificación | Sólo mediante la rectificación administrativa de DNI (`PersonIdentityService.rectifyDni`), con motivo, cotejo y versión. |
| Validaciones | Índice único `uq_personas_dni` filtrado `dni IS NOT NULL`; CHECK `ck_personas_dni_solo_digitos`; CHECK de sólo dígitos; unicidad por índice filtrado; el alta de usuario lo exige (`@NotBlank`) y el de paciente lo admite vacío. |

#### `fecha_nacimiento`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_nacimiento` |
| Tipo de dato | `date` |
| Nulabilidad | **Permite NULL.** Opcional: el alta de usuario no la exige y el DTS puede registrar un paciente sin ese dato. Se completa si un Administrador edita la persona; hay personas que permanecen sin ella legítimamente. |
| Función | Fecha de nacimiento de la persona. |
| Justificación | Sirve de dato de contraste de identidad (al vincular un paciente existente se compara) y para mostrar la edad en contextos clínicos. |
| Contenido | Fecha (DATE) sin hora. |
| Origen | Formulario (Admin/DTS). |
| Momento inicial | En el INSERT, si fue informada. |
| Modificación | Edición de usuario (Admin), reactivación (sólo si se envía una nueva), corrección de identidad de paciente. |
| Validaciones | Tipo DATE; sin CHECK de rango. |

#### `fecha_creacion`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_creacion` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Registra el instante en que la persona se incorporó al sistema. |
| Justificación | Permite ordenar cronológicamente, reconstruir el historial y aportar trazabilidad sin depender de la auditoría. |
| Contenido | Fecha y hora (DATETIME2) de la inserción. |
| Origen | Automático: DEFAULT `SYSDATETIME()` de SQL Server o `@CreationTimestamp` de Hibernate (según la entidad); el usuario nunca ingresa esta fecha. |
| Momento inicial | En el INSERT. |
| Modificación | Inmutable: ningún flujo la actualiza (`updatable=false` en la entidad). |
| Validaciones | DEFAULT sysdatetime() |

#### `fecha_actualizacion`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_actualizacion` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Instante de la última modificación de los datos de la persona. |
| Justificación | Permite detectar rápidamente qué identidades se corrigieron y cuándo. |
| Contenido | Fecha y hora; igual a `fecha_creacion` mientras no hubo cambios. |
| Origen | Automático: `@UpdateTimestamp` de Hibernate (y DEFAULT `SYSDATETIME()` en SQL). |
| Momento inicial | En el INSERT. |
| Modificación | Se actualiza en cada UPDATE de la fila (edición, rectificación de DNI). |
| Validaciones | DEFAULT sysdatetime() |

#### `id_personas`

| Atributo | Detalle |
|---|---|
| Nombre | `id_personas` |
| Tipo de dato | `bigint` — IDENTITY(1,1) |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Clave primaria de la tabla: identifica de forma única cada fila y es el valor que otras tablas, la API y la auditoría usan para referirse a ella. |
| Justificación | Un identificador técnico numérico, estable y sin significado de negocio evita depender de datos que pueden cambiar (nombres, códigos) y hace eficientes los JOIN y las claves foráneas (decisión V24/V27: «toda tabla de aplicación tiene su propio id_<tabla> BIGINT IDENTITY»). |
| Contenido | Número entero positivo correlativo (1, 2, 3…). No es visible en pantallas de usuario común; el administrador lo ve como identificador de persona en el detalle del paciente (`personaId`). |
| Origen | SQL Server, columna IDENTITY(1,1): se asigna en el propio INSERT. Hibernate lo declara `@GeneratedValue(strategy = IDENTITY)` y lo lee de vuelta tras insertar. |
| Momento inicial | En el INSERT; no existe fila sin identificador. |
| Modificación | Nunca cambia (inmutable; JPA lo declara `updatable=false`). |
| Validaciones | PRIMARY KEY; PRIMARY KEY (unicidad y NOT NULL); no se reutiliza al borrar filas. |

#### `version_identidad`

| Atributo | Detalle |
|---|---|
| Nombre | `version_identidad` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Contador de versión para control de concurrencia optimista. |
| Justificación | Una identidad puede corregirse desde dos pantallas distintas (usuarios y pacientes); la versión impide que una guarde datos leídos antes de que la otra cambiara la fila (V48). |
| Contenido | Entero ≥ 0 (BIGINT); 0 al crear. |
| Origen | Hibernate (`@Version`) y DEFAULT 0. |
| Momento inicial | En el INSERT (valor 0). |
| Modificación | Hibernate lo incrementa en cada UPDATE; la API devuelve la versión actual y exige recibirla (`version`) para editar o rectificar. |
| Validaciones | DEFAULT 0; Si el valor enviado difiere → 409 de versión desactualizada (`stale()`). |

### D. Momento en que se crea un registro

**Escenario 1: El Administrador da de alta un usuario cuya persona todavía no existe**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | Usuario con rol ADMINISTRADOR |
| Pantalla / componente y acción | Directorio de usuarios → botón «Nuevo usuario» / «Añadir usuario» (`UserDirectory` y `AdminDashboard` en `main.jsx`). Se completa el formulario y se envía. |
| Datos que aporta el usuario | Nombre, apellido, DNI, fecha de nacimiento (opcional), roles, licencia (si COMANDANTE), al menos un correo y un teléfono. |
| Endpoint | `POST /api/auth/users` (`AuthController.java`, anotado `@PreAuthorize("hasRole('ADMINISTRADOR')")`) |
| Servicio | `AuthService.createPending` (`@Transactional`) |
| Validaciones y condiciones | Nombre y apellido no vacíos; DNI se reduce a dígitos (`canonicalDni`) y no puede coincidir con una cuenta existente (409 `USER_DNI_ALREADY_EXISTS` / `INACTIVE_USER_WITH_DNI_EXISTS`); si ya hay una persona con ese DNI sin cuenta exige `personaExistenteId` y nombres coincidentes (si no, no se crea otra: se vincula a la existente). |
| Mecanismo que crea el registro | `persons.save(p)` seguido de `persons.flush()` (INSERT de Hibernate). |
| Columnas completadas y de dónde sale cada valor | `nombre_persona` y `apellido_persona` ← formulario (con `trim()`); `dni` ← formulario normalizado a dígitos; `fecha_nacimiento` ← formulario (puede ser NULL); `fecha_creacion`/`fecha_actualizacion` ← @CreationTimestamp/@UpdateTimestamp; `version_identidad` ← 0 (@Version); `id_personas` ← IDENTITY. |
| Columnas que quedan NULL o con valor predeterminado | `fecha_nacimiento` si no se informó. |
| Otros registros creados en la misma operación | En la misma transacción: `usuarios` (PENDIENTE_ACTIVACION), `usuarios_roles`, `perfiles_comandante` (si COMANDANTE), `correos_electronicos`, `telefonos`, `activaciones_cuenta` y un evento `USUARIO_CREADO` en `eventos_auditoria`. |
| Si la operación falla / atomicidad | Todo ocurre en una única transacción: cualquier excepción (p. ej. violación del índice único de DNI en un alta simultánea, que se traduce en 409) revierte la persona, la cuenta, los contactos y el código. |

**Escenario 2: El DTS registra una solicitud con un paciente nuevo**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | Usuario con rol DTS |
| Pantalla / componente y acción | Pantalla DTS → «Nueva solicitud» (`DTS` en `main.jsx`): se carga el paciente nuevo dentro del formulario de la solicitud. |
| Datos que aporta el usuario | Nombre, apellido, DNI (opcional) y fecha de nacimiento del paciente, junto con los datos del traslado. |
| Endpoint | `POST /api/flights/with-patient` (`FlightController.java`) |
| Servicio | `SanitaryRequestRegistrationService.createWithPatient` → `PatientService.registerForSanitaryRequest` |
| Validaciones y condiciones | Nombre y apellido obligatorios; si el DNI ya pertenece a una persona sólo se la vincula con la confirmación expresa de identidad del DTS (`identidadConfirmada`) y coincidencia de nombre/apellido/nacimiento; si no, 409 `PATIENT_IDENTITY_CONFLICT`. No se acepta un `personId` enviado por el cliente. |
| Mecanismo que crea el registro | `persons.saveAndFlush(person)` (sólo cuando el DNI no existía o no se informó). |
| Columnas completadas y de dónde sale cada valor | Igual que el escenario 1 pero `dni` puede quedar NULL si el DTS no lo conoce. |
| Columnas que quedan NULL o con valor predeterminado | `dni` y `fecha_nacimiento` si no se informaron. |
| Otros registros creados en la misma operación | `pacientes`, `vuelos`, `vuelos_sanitarios`, `informacion_medica_vuelo`, `negociaciones_horario_vuelo`, contactos de coordinación, evento de auditoría y notificaciones, todo en una transacción. |
| Si la operación falla / atomicidad | Atómico: si falla la creación del vuelo no queda ni la persona ni el paciente («un fallo en cualquier paso no deja ni ficha de paciente ni vuelo ni contacto»). |

**Escenario 3: Alta directa de paciente**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | DTS, Operaciones o Centro de Operaciones |
| Pantalla / componente y acción | No se pudo determinar con certeza a partir del código y el esquema analizados qué pantalla invoca este endpoint: el frontend (`patients.jsx`, `main.jsx`) sólo usa la búsqueda y el alta dentro de la solicitud. |
| Datos que aporta el usuario | Nombre, apellido, DNI, fecha de nacimiento. |
| Endpoint | `POST /api/patients` (`PatientController.java`) |
| Servicio | `PatientService.create` (sólo identidades realmente nuevas) |
| Validaciones y condiciones | Si el DNI ya existe responde 409 `PATIENT_IDENTITY_CONFLICT` (sin confirmación de identidad no se vincula). |
| Mecanismo que crea el registro | `persons.saveAndFlush`. |
| Columnas completadas y de dónde sale cada valor | Como el escenario 1. |
| Columnas que quedan NULL o con valor predeterminado | `dni`, `fecha_nacimiento` opcionales. |
| Otros registros creados en la misma operación | `pacientes` (1 fila). |
| Si la operación falla / atomicidad | Transacción propia; atómico. |

**Escenario 4: Administrador inicial del sistema (arranque)**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | Proceso automático (CommandLineRunner) al iniciar el backend |
| Pantalla / componente y acción | Ninguna. |
| Datos que aporta el usuario | Variables de entorno `app.bootstrap-admin.username/password/email`. |
| Endpoint | — |
| Servicio | `BootstrapAdministrator` → `AuthService.createBootstrapAdmin` |
| Validaciones y condiciones | Sólo se ejecuta si las tres propiedades están informadas y todavía no existe ningún usuario con rol ADMINISTRADOR. |
| Mecanismo que crea el registro | `persons.save(p)`. |
| Columnas completadas y de dónde sale cada valor | `nombre_persona` = «Administrador», `apellido_persona` = «Inicial»; resto automático. |
| Columnas que quedan NULL o con valor predeterminado | `dni` y `fecha_nacimiento` (por eso el DNI es único *sólo cuando está informado*). |
| Otros registros creados en la misma operación | `usuarios` (ACTIVO), `usuarios_roles` (ADMINISTRADOR) y `correos_electronicos` (principal). |
| Si la operación falla / atomicidad | Transacción propia; si falla el backend no crea al administrador. |

**Escenario 5: Migración histórica**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | Flyway (V4) |
| Pantalla / componente y acción | Ninguna. |
| Datos que aporta el usuario | Filas existentes de `users`/`patients`. |
| Endpoint | — |
| Servicio | Script SQL `V4__normalize_identity_clinical_data_and_versioning.sql` |
| Validaciones y condiciones | Un usuario y un paciente con el mismo DNI pasan a compartir la misma persona. |
| Mecanismo que crea el registro | `INSERT INTO persons … SELECT … FROM users` y `FROM patients`. |
| Columnas completadas y de dónde sale cada valor | Copia de nombre, apellido, DNI, teléfono y fecha de nacimiento. |
| Columnas que quedan NULL o con valor predeterminado | Según el dato de origen. |
| Otros registros creados en la misma operación | Actualiza `users.person_id` y `patients.person_id`. |
| Si la operación falla / atomicidad | Una migración Flyway se ejecuta en bloque; si falla no se aplica la versión. |

### E. Ejemplo funcional completo

**Situación (ficticia):** la administradora «Ana Pérez» da de alta al comandante «Luis Gómez».

1. Ana entra al área *Administración → Usuarios* y pulsa **Nuevo usuario**.
2. Completa: nombre «Luis», apellido «Gómez», DNI «20.111.222» (el sistema lo guarda como `20111222`), fecha de nacimiento 1980-05-14, rol COMANDANTE, licencia «ARG1234», un correo y un teléfono.
3. El navegador envía `POST /api/auth/users`. El backend valida, no encuentra otra persona con ese DNI y ejecuta el INSERT.
4. Fila resultante (representación simplificada):

| id_personas | nombre_persona | apellido_persona | dni | fecha_nacimiento | fecha_creacion | fecha_actualizacion | version_identidad |
|---|---|---|---|---|---|---|---|
| 101 | Luis | Gómez | 20111222 | 1980-05-14 | 2026-11-01 10:02:11 | 2026-11-01 10:02:11 | 0 |

5. En la misma transacción se crean `usuarios` (cuenta pendiente), `usuarios_roles`, `perfiles_comandante` (licencia `ARG1234`), un correo, un teléfono y `activaciones_cuenta` (código de 6 dígitos).
6. **Qué queda sin valor:** nada en `personas` salvo que no se hubiera informado la fecha de nacimiento. La cuenta aún no tiene nombre de usuario ni contraseña (están en `usuarios`).
7. **Después:** cuando Luis activa su cuenta no cambia `personas`; si Ana corrige luego su apellido, `fecha_actualizacion` cambia y `version_identidad` pasa a 1; si se rectifica su DNI, cambia `dni` y `version_identidad` vuelve a incrementarse. Al desactivar la cuenta la persona **se conserva** (no hay borrado).

### F. Ciclo de vida del registro

| Transición | Acción que la provoca | Actor | Campos modificados | Antes → después | Validaciones / efectos |
|---|---|---|---|---|---|
| Creación | Alta de usuario, de paciente o arranque | Admin / DTS / sistema | todos (INSERT) | — → fila nueva, `version_identidad`=0 | ver sección D |
| Edición de datos personales | «Guardar» en el detalle del usuario | Admin | `nombre_persona`, `apellido_persona`, `fecha_nacimiento`, `fecha_actualizacion`, `version_identidad` | valores previos → nuevos; versión n → n+1 | `PUT /api/auth/users/{id}` (`AuthService.updateUser`); sólo se audita si algo cambió (`USUARIO_ACTUALIZADO`) |
| Reactivación | «Reactivar» una cuenta desactivada | Admin | los mismos | idem | `AuthService.reactivateUser` puede corregir nombre, apellido y nacimiento |
| Corrección de identidad de paciente | «Mantenimiento de pacientes» | Admin | nombre, apellido, nacimiento | idem | `PUT /api/patients/{id}/identity`, control de versión optimista |
| Rectificación de DNI | Desde el detalle de usuario o de paciente | Admin | `dni`, `version_identidad` | DNI anterior → nuevo | `PersonIdentityService.rectifyDni`: versión vigente, cotejo documental declarado, motivo ≥ 10 caracteres, DNI de 7 a 12 dígitos, sin duplicado; no toca credenciales ni roles |
| Baja | **No existe**: la persona nunca se borra ni se desactiva (no tiene columna de estado) | — | — | — | La baja es lógica en `usuarios` (`esta_activo`/`estado_cuenta`) |

### G. Relaciones con otras tablas

**Clave primaria:** `id_personas`.

**Claves foráneas salientes:** ninguna (tabla raíz).

**Claves foráneas entrantes (tablas hijas):** `correos_electronicos`(id_personas), `habilitaciones_profesionales`(id_personas), `pacientes`(id_personas), `perfiles_comandante`(id_personas), `telefonos`(id_personas), `usuarios`(id_personas).

**Cardinalidades.** `personas` 1 — 0..1 `usuarios` (índice único sobre `usuarios.id_personas`), 1 — 0..1 `pacientes`, 1 — 0..1 `perfiles_comandante` (PK compuesta con la persona), 1 — N `correos_electronicos`, 1 — N `telefonos`, 1 — N `habilitaciones_profesionales`. Todas son obligatorias *desde el hijo*: no existe un usuario/paciente/contacto sin persona. No hay borrado en cascada: una persona con hijos no puede eliminarse (y la aplicación nunca lo intenta).

**Uso real:** el alta de usuarios resuelve el caso «persona ya conocida por otro módulo» pidiendo confirmación expresa antes de asociar la nueva cuenta a la persona existente (`PERSON_EXISTS_WITHOUT_ACCOUNT`); así nunca se fusionan identidades automáticamente.

### H. Restricciones y decisiones de diseño

**Índices (no PK):**

| Índice | Único | Columnas | Filtro | Incluye |
|---|---|---|---|---|
| `uq_personas_dni` | sí | dni | `dni IS NOT NULL` | — |

**Restricciones CHECK:** 

- `ck_personas_dni_solo_digitos`: `(dni IS NULL OR NOT dni like N'%^0-9%')`

**Triggers:** ninguno.

**DEFAULT / IDENTITY / nulabilidad:** ver la ficha de cada columna en la sección C (los DEFAULT figuran en «Validaciones»).

- **Índice único filtrado `uq_personas_dni`** (V47): el DNI es único sólo cuando está informado. Evita dos personas con el mismo DNI incluso con altas simultáneas, que antes dependían de una consulta previa en Java; los NULL no compiten (personas sin DNI, p. ej. el administrador inicial).
- **CHECK `ck_personas_dni_solo_digitos`** (V13): el DNI se guarda canónico (sólo dígitos), igual que lo calcula la capa Java; impide «20.111.222» vs «20111222» como dos identidades.
- **`version_identidad` (@Version, V48)**: control de concurrencia optimista; dos administradores que editan la misma identidad (desde usuarios y desde pacientes) no se pisan en silencio.
- **Observación:** la tabla no tiene baja lógica propia; es una decisión coherente (la identidad es un hecho), pero implica que el derecho de supresión de datos no está implementado a nivel de `personas` (no se pudo determinar con certeza a partir del código y el esquema analizados si existe un proceso externo).

### I. Evidencia de implementación

- [`V4 (creación)`](../../backend-java/src/main/resources/db/migration/V4__normalize_identity_clinical_data_and_versioning.sql#L6)
- [`V13 (DNI sólo dígitos)`](../../backend-java/src/main/resources/db/migration/V13__corregir_dni_solo_digitos.sql#L24)
- [`V47 (índice único)`](../../backend-java/src/main/resources/db/migration/V47__usuarios_unicidad_identidad_y_baja_administrativa.sql#L14)
- [`V48 (versión)`](../../backend-java/src/main/resources/db/migration/V48__version_optimista_identidad_personas.sql#L3)
- [`Entidad Person`](../../backend-java/src/main/java/com/vuelossanitarios/backend/domain/person/Person.java#L16)
- [`AuthService.createPending`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/AuthService.java#L29)
- [`PatientService.register`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/PatientService.java#L33)
- [`PersonIdentityService.rectifyDni`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/PersonIdentityService.java#L49)
- [`Bootstrap administrador`](../../backend-java/src/main/java/com/vuelossanitarios/backend/security/BootstrapAdministrator.java#L14)
- [`Formulario de usuarios (UI)`](../../frontend-react/src/users.jsx#L124)
- [`Prueba: UserAdministrationIntegrationTest`](../../backend-java/src/test/java/com/vuelossanitarios/backend/api/UserAdministrationIntegrationTest.java#L41)
- [`Prueba: PersonIdentityServiceTest`](../../backend-java/src/test/java/com/vuelossanitarios/backend/service/PersonIdentityServiceTest.java#L22)

---

## 2. Tabla `usuarios`

### A. Identificación de la tabla

| Atributo | Detalle |
|---|---|
| Nombre exacto y esquema | `dbo.usuarios` (esquema `dbo`) |
| Módulo funcional | 1. Identidad, cuentas y contactos |
| Tipo de tabla | Principal — cuenta de acceso y autenticación |
| Migración que la creó | V1 (como `users`, UNIQUEIDENTIFIER) |
| Migraciones posteriores que modificaron su estructura | V4 (datos personales a `personas`), V8 (renombre), V11 (estado_cuenta, debe_cambiar_contrasena; usuario y hash pasan a NULL), V12 (licencia a `perfiles_comandante`), V14 (nombre de usuario único sólo si informado), V19 (version_credenciales, fecha_baja), V24/V27/V28 (BIGINT IDENTITY, nombres), V47 (id_usuario_baja, motivo_baja, índice único de nombre) |
| Estado actual en el esquema | Vigente — 13 columnas, PK `id_usuarios`, 2 FK salientes, 48 FK entrantes, 2 índice(s) único(s), 2 CHECK, 0 trigger(s) (verificado contra `sys.*` de la base E2E en Flyway V62) |
| Tablas relacionadas | personas, usuarios_roles, activaciones_cuenta, y casi todas las tablas operativas (48 FK entrantes: quién creó, evaluó, asignó, firmó, revisó…) |

### B. Funcionalidad y justificación

`usuarios` representa la **cuenta con la que alguien entra al sistema**: nombre de usuario, contraseña (siempre BCrypt, nunca en claro), estado de la cuenta (pendiente de activación, activa, desactivada) y la información necesaria para invalidar sesiones. Es, además, la tabla más referenciada del esquema: cada acción con consecuencias (crear una solicitud, aprobar, asignar, cancelar, revisar un informe) guarda *quién* la hizo con una clave foránea a esta tabla.

El nombre real, el DNI y la fecha de nacimiento **no** están aquí, sino en `personas`: la cuenta es una *capacidad de acceso* de una persona.

**Por qué es una tabla independiente.** Separa autenticación (credenciales, estado, versión de sesión) de identidad (`personas`) y de permisos (`usuarios_roles`/`roles`). Así se puede desactivar una cuenta sin perder a la persona ni los vuelos, informes y auditorías que la citan (V19: «la cuenta se conserva para mantener vuelos, documentos y auditorías»).

**Qué dejaría de funcionar sin ella.** Nadie podría iniciar sesión; no habría autor para las acciones auditadas; las 48 tablas/columnas que referencian a un usuario perderían su referencia.

### C. Descripción campo por campo

#### `nombre_usuario`

| Atributo | Detalle |
|---|---|
| Nombre | `nombre_usuario` |
| Tipo de dato | `nvarchar(50)` |
| Nulabilidad | **Permite NULL.** NULL mientras la cuenta está PENDIENTE_ACTIVACION: el titular todavía no eligió su usuario. Lo completa el propio titular al activar. Una cuenta desactivada conserva su usuario (no se libera). |
| Función | Nombre con el que la persona inicia sesión. |
| Justificación | Separa el «alias de acceso» de los datos personales y permite rotar el modo de ingreso sin tocar la identidad. |
| Contenido | Texto de hasta 50 caracteres (p. ej. `lgomez`). |
| Origen | Lo elige el titular al activar la cuenta (`ActivateAccountRequest.username`). |
| Momento inicial | En la activación de la cuenta (UPDATE); en el bootstrap se inserta ya informado. |
| Modificación | No se modifica después (no existe pantalla de cambio de nombre de usuario). |
| Validaciones | Índice único `uq_usuarios_nombre_usuario` filtrado `nombre_usuario IS NOT NULL`; Único cuando está informado (`uq_usuarios_nombre_usuario`, índice filtrado); comparación sin distinguir mayúsculas según la colación. |

#### `hash_contrasena`

| Atributo | Detalle |
|---|---|
| Nombre | `hash_contrasena` |
| Tipo de dato | `nvarchar(255)` |
| Nulabilidad | **Permite NULL.** NULL mientras la cuenta no se activó. Lo completa la activación; no vuelve a NULL. |
| Función | Hash BCrypt de la contraseña. |
| Justificación | Nunca se guarda la contraseña en claro; BCrypt incluye sal y costo, por lo que una filtración de la tabla no revela contraseñas. |
| Contenido | Cadena de 60 caracteres que comienza con `$2a$` (no se reproduce ningún valor real en este informe). |
| Origen | `BCryptPasswordEncoder.encode(...)` en el backend (activación, cambio, restablecimiento, bootstrap). |
| Momento inicial | En la activación (o en el bootstrap). |
| Modificación | Cambio de contraseña propio; restablecimiento administrativo; reactivación (contraseña temporal). |
| Validaciones | Longitud mínima de la contraseña de 12 caracteres, validada por DTO antes de hashear. |

#### `esta_activo`

| Atributo | Detalle |
|---|---|
| Nombre | `esta_activo` |
| Tipo de dato | `bit` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Indicador de si la cuenta puede operar. |
| Justificación | Permite distinguir cuentas operativas de cuentas dadas de baja y conserva la cuenta sin borrarla (el índice `ix_usuarios_activo_estado` que V19 creó para filtrar por este campo ya no existe en el esquema vivo: ver hallazgos). |
| Contenido | 1 = activa, 0 = dada de baja. |
| Origen | Backend: 1 al crear; 0 al desactivar. |
| Momento inicial | En el INSERT (1). |
| Modificación | `deactivateUser` lo pone en 0; `reactivateUser` en 1. |
| Validaciones | DEFAULT 1; NOT NULL DEFAULT 1. |

#### `fecha_creacion`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_creacion` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Registra el instante en que la cuenta se incorporó al sistema. |
| Justificación | Permite ordenar cronológicamente, reconstruir el historial y aportar trazabilidad sin depender de la auditoría. |
| Contenido | Fecha y hora (DATETIME2) de la inserción. |
| Origen | Automático: DEFAULT `SYSDATETIME()` de SQL Server o `@CreationTimestamp` de Hibernate (según la entidad); el usuario nunca ingresa esta fecha. |
| Momento inicial | En el INSERT. |
| Modificación | Inmutable: ningún flujo la actualiza (`updatable=false` en la entidad). |
| Validaciones | DEFAULT sysdatetime() |

#### `fecha_actualizacion`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_actualizacion` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Último cambio de la fila de la cuenta. |
| Justificación | Trazabilidad mínima de modificaciones sin consultar la auditoría. |
| Contenido | Fecha y hora. |
| Origen | `@UpdateTimestamp`. |
| Momento inicial | En el INSERT. |
| Modificación | En cada UPDATE de la fila (activación, cambio de contraseña, baja…). |
| Validaciones | DEFAULT sysdatetime() |

#### `estado_cuenta`

| Atributo | Detalle |
|---|---|
| Nombre | `estado_cuenta` |
| Tipo de dato | `nvarchar(24)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Estado del ciclo de vida de la cuenta. |
| Justificación | Distingue una cuenta recién creada (aún sin credenciales) de una operativa o dada de baja, lo que cambia lo que el administrador puede hacer. |
| Contenido | PENDIENTE_ACTIVACION, ACTIVO o DESACTIVADO. |
| Origen | Backend según la acción. |
| Momento inicial | En el INSERT: PENDIENTE_ACTIVACION (alta administrativa) o ACTIVO (bootstrap/migración). |
| Modificación | PENDIENTE→ACTIVO (activación), ACTIVO→DESACTIVADO (baja), DESACTIVADO→ACTIVO (reactivación). No hay vuelta a PENDIENTE. |
| Validaciones | CHECK `ck_usuarios_estado_cuenta`; DEFAULT N'ACTIVO'; CHECK `ck_usuarios_estado_cuenta`; DEFAULT 'ACTIVO'. |

#### `debe_cambiar_contrasena`

| Atributo | Detalle |
|---|---|
| Nombre | `debe_cambiar_contrasena` |
| Tipo de dato | `bit` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Marca que obliga a cambiar la contraseña en el próximo ingreso. |
| Justificación | Las contraseñas temporales generadas por un administrador no deben seguir en uso. |
| Contenido | 0/1. |
| Origen | Backend. |
| Momento inicial | En el INSERT (0). |
| Modificación | 1 tras restablecimiento o reactivación; 0 tras el cambio voluntario u obligatorio. |
| Validaciones | DEFAULT 0; DEFAULT 0. |

#### `version_credenciales`

| Atributo | Detalle |
|---|---|
| Nombre | `version_credenciales` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Versión de las credenciales de la cuenta. |
| Justificación | El JWT incluye esta versión; incrementarla invalida de inmediato todas las sesiones previas (cambio de roles, de contraseña, baja). |
| Contenido | Entero ≥ 1. |
| Origen | Backend (`User.invalidateCredentials()`). |
| Momento inicial | En el INSERT (1, DEFAULT). |
| Modificación | Se incrementa en cada cambio de contraseña, de roles, restablecimiento, baja o reactivación. |
| Validaciones | CHECK `ck_usuarios_version_credenciales_positiva`; DEFAULT 1; CHECK `ck_usuarios_version_credenciales_positiva` (≥ 1). |

#### `fecha_baja`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_baja` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **Permite NULL.** NULL mientras la cuenta nunca fue dada de baja o fue reactivada. Lo completa el Administrador al desactivar y lo vacía al reactivar. |
| Función | Momento de la baja administrativa. |
| Justificación | Permite mostrar «desactivado el…» y auditar sin reconstruir desde eventos (V19/V47). |
| Contenido | Fecha y hora. |
| Origen | Backend (`deactivateUser`). |
| Momento inicial | NULL al crear. |
| Modificación | Se completa en la baja y vuelve a NULL en la reactivación. |
| Validaciones | Sin restricción declarada más allá del tipo y la nulabilidad. |

#### `id_usuarios`

| Atributo | Detalle |
|---|---|
| Nombre | `id_usuarios` |
| Tipo de dato | `bigint` — IDENTITY(1,1) |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Clave primaria de la tabla: identifica de forma única cada fila y es el valor que otras tablas, la API y la auditoría usan para referirse a ella. |
| Justificación | Un identificador técnico numérico, estable y sin significado de negocio evita depender de datos que pueden cambiar (nombres, códigos) y hace eficientes los JOIN y las claves foráneas (decisión V24/V27: «toda tabla de aplicación tiene su propio id_<tabla> BIGINT IDENTITY»). |
| Contenido | Número entero positivo correlativo (1, 2, 3…). El administrador lo ve como identificador del usuario en el detalle. |
| Origen | SQL Server, columna IDENTITY(1,1): se asigna en el propio INSERT. Hibernate lo declara `@GeneratedValue(strategy = IDENTITY)` y lo lee de vuelta tras insertar. |
| Momento inicial | En el INSERT; no existe fila sin identificador. |
| Modificación | Nunca cambia (inmutable; JPA lo declara `updatable=false`). |
| Validaciones | PRIMARY KEY; PRIMARY KEY (unicidad y NOT NULL); no se reutiliza al borrar filas. |

#### `id_personas`

| Atributo | Detalle |
|---|---|
| Nombre | `id_personas` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Referencia a la persona titular de la cuenta. |
| Justificación | Une la cuenta con la identidad (nombre, DNI) sin duplicarlos. |
| Contenido | Identificador de `personas`. |
| Origen | Backend: la persona creada o la existente confirmada por el administrador. |
| Momento inicial | En el INSERT. |
| Modificación | Nunca cambia. |
| Validaciones | FOREIGN KEY → `personas.id_personas` (borrado: NO ACTION); Índice único `uq_usuarios_5`; NOT NULL, FK y único (una persona, una cuenta). |

#### `id_usuario_baja`

| Atributo | Detalle |
|---|---|
| Nombre | `id_usuario_baja` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** NULL si la cuenta no está dada de baja. Lo completa el Administrador actuante al desactivar. |
| Función | Administrador que dio de baja la cuenta. |
| Justificación | Responsabilidad y trazabilidad de la baja en la propia fila (V47). |
| Contenido | Identificador de `usuarios`. |
| Origen | Backend: el usuario autenticado que ejecuta la baja. |
| Momento inicial | NULL al crear. |
| Modificación | Se completa en la baja; se limpia al reactivar. |
| Validaciones | FOREIGN KEY → `usuarios.id_usuarios` (borrado: NO ACTION); FK autorreferencia. |

#### `motivo_baja`

| Atributo | Detalle |
|---|---|
| Nombre | `motivo_baja` |
| Tipo de dato | `nvarchar(500)` |
| Nulabilidad | **Permite NULL.** Opcional: el motivo puede omitirse (se normaliza a NULL si está en blanco). |
| Función | Texto del motivo de la baja. |
| Justificación | Deja constancia de por qué se retiró el acceso. |
| Contenido | Hasta 500 caracteres. |
| Origen | Formulario «Desactivar cuenta». |
| Momento inicial | NULL al crear. |
| Modificación | Se completa en la baja (puede quedar vacío si el administrador no escribe motivo); se limpia al reactivar. |
| Validaciones | Sin restricción declarada más allá del tipo y la nulabilidad. |

### D. Momento en que se crea un registro

**Escenario 1: El Administrador crea una cuenta pendiente de activación**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | ADMINISTRADOR |
| Pantalla / componente y acción | «Nuevo usuario» / «Añadir usuario» (`users.jsx`, `AdminDashboard` en `main.jsx`). |
| Datos que aporta el usuario | Los del formulario de alta de usuario (ver `personas`). |
| Endpoint | `POST /api/auth/users` |
| Servicio | `AuthService.createPending` |
| Validaciones y condiciones | DNI sin cuenta previa; al menos un correo y un teléfono; licencia obligatoria si el rol es COMANDANTE y no la tiene; roles existentes; ADMINISTRADOR no puede combinarse con roles operativos (regla de negocio de `assignRoles`/V11). |
| Mecanismo que crea el registro | `users.save(u)` con `u.setPerson`, `setActivo(true)`, `setEstadoCuenta("PENDIENTE_ACTIVACION")`. |
| Columnas completadas y de dónde sale cada valor | `id_personas` ← persona creada o vinculada; `esta_activo`=1; `estado_cuenta`='PENDIENTE_ACTIVACION'; `fecha_creacion`/`fecha_actualizacion` ← Hibernate; `version_credenciales`=1 (DEFAULT); `debe_cambiar_contrasena`=0 (DEFAULT). |
| Columnas que quedan NULL o con valor predeterminado | `nombre_usuario`, `hash_contrasena`, `fecha_baja`, `id_usuario_baja`, `motivo_baja`. |
| Otros registros creados en la misma operación | `personas` (si era nueva), `usuarios_roles`, `perfiles_comandante`, `correos_electronicos`, `telefonos`, `activaciones_cuenta`, `eventos_auditoria`. |
| Si la operación falla / atomicidad | Una sola transacción: ante cualquier error no queda cuenta ni persona. |

**Escenario 2: Administrador inicial por configuración**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | Proceso de arranque |
| Pantalla / componente y acción | — |
| Datos que aporta el usuario | Propiedades de entorno. |
| Endpoint | — |
| Servicio | `AuthService.createBootstrapAdmin` |
| Validaciones y condiciones | Sólo si no existe ningún administrador. |
| Mecanismo que crea el registro | `users.save(u)`. |
| Columnas completadas y de dónde sale cada valor | `nombre_usuario` y `hash_contrasena` (BCrypt) ← propiedades; `estado_cuenta`='ACTIVO'; el resto por defecto. |
| Columnas que quedan NULL o con valor predeterminado | Campos de baja. |
| Otros registros creados en la misma operación | `personas`, `usuarios_roles`, `correos_electronicos`. |
| Si la operación falla / atomicidad | Transacción propia. |

**Escenario 3: Migración histórica**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | Flyway |
| Pantalla / componente y acción | — |
| Datos que aporta el usuario | — |
| Endpoint | — |
| Servicio | V1 creó la tabla; V4 y V11 migraron datos |
| Validaciones y condiciones | — |
| Mecanismo que crea el registro | Scripts SQL. |
| Columnas completadas y de dónde sale cada valor | — |
| Columnas que quedan NULL o con valor predeterminado | — |
| Otros registros creados en la misma operación | — |
| Si la operación falla / atomicidad | Todo o nada por migración. |

### E. Ejemplo funcional completo

**Situación (ficticia):** alta y activación de «lgomez».

1. La cuenta nace en `usuarios` al enviar el formulario del Administrador:

| id_usuarios | id_personas | nombre_usuario | hash_contrasena | esta_activo | estado_cuenta | debe_cambiar_contrasena | version_credenciales | fecha_baja |
|---|---|---|---|---|---|---|---|---|
| 55 | 101 | NULL | NULL | 1 | PENDIENTE_ACTIVACION | 0 | 1 | NULL |

2. Luis abre la pantalla pública **Activar cuenta**, ingresa su DNI, el código de 6 dígitos que le entregó el administrador, un nombre de usuario y una contraseña de 12 o más caracteres (`POST /api/auth/activar-cuenta`, [`Login`](../../frontend-react/src/main.jsx) línea 98).
3. `AuthService.activate` valida el código contra el hash BCrypt de `activaciones_cuenta` y completa **en la misma fila** (UPDATE): `nombre_usuario`='lgomez', `hash_contrasena`=BCrypt(...), `estado_cuenta`='ACTIVO', `debe_cambiar_contrasena`=0.
4. Luego ingresa (`POST /api/auth/login`): el backend compara la contraseña con BCrypt, genera un JWT que incluye `version_credenciales` y los roles.
5. Si el administrador **desactiva** la cuenta: `esta_activo`=0, `estado_cuenta`='DESACTIVADO', `fecha_baja`=ahora, `id_usuario_baja`=administrador, `motivo_baja`=texto, y `version_credenciales` se incrementa (2), con lo cual cualquier JWT emitido deja de ser aceptado.
6. Al **reactivar**: se genera una contraseña temporal (devuelta una sola vez), `debe_cambiar_contrasena`=1, se limpian los campos de baja y `version_credenciales` vuelve a incrementarse.

### F. Ciclo de vida del registro

| Transición | Acción | Actor | Campos modificados | Antes → después | Validaciones / efectos |
|---|---|---|---|---|---|
| Alta | Crear usuario | Admin | INSERT | — → PENDIENTE_ACTIVACION | ver D |
| Regenerar código | «Regenerar código de activación» | Admin | (en `activaciones_cuenta`) | — | sólo si PENDIENTE_ACTIVACION |
| Activación | «Activar cuenta» | Titular (público) | `nombre_usuario`, `hash_contrasena`, `estado_cuenta`, `debe_cambiar_contrasena` | NULL/NULL/PENDIENTE → usuario/hash/ACTIVO | código vigente, no agotado (máx. 5), usuario no repetido (409), contraseña ≥ 12; auditoría `USUARIO_ACTIVADO` |
| Cambio de roles/datos | «Guardar» en el detalle | Admin | (roles en `usuarios_roles`), `version_credenciales` +1 si cambian roles | v→v+1 | no puede editar sus propios roles; no quitar el último administrador; bloquea si hay responsabilidades operativas |
| Restablecer credenciales | «Restablecer credenciales» | Admin | `hash_contrasena`, `debe_cambiar_contrasena`=1, `version_credenciales` +1 | — | no sobre sí mismo; cuenta activa con usuario |
| Cambio de contraseña propio | «Mi cuenta → Cambiar contraseña» | Titular | `hash_contrasena`, `debe_cambiar_contrasena`=0, `version_credenciales` +1 | — | contraseña actual correcta, distinta de la nueva |
| Desactivación | «Desactivar cuenta» | Admin | `esta_activo`=0, `estado_cuenta`=DESACTIVADO, `fecha_baja`, `id_usuario_baja`, `motivo_baja`, `version_credenciales` +1 | ACTIVO → DESACTIVADO | no a sí mismo, no al último admin, sin responsabilidades vigentes (vuelos, informes, solicitudes); libera bloqueos documentales |
| Reactivación | «Reactivar» | Admin | `esta_activo`=1, `estado_cuenta`=ACTIVO, campos de baja a NULL, `hash_contrasena` nuevo, `debe_cambiar_contrasena`=1, `version_credenciales` +1 | DESACTIVADO → ACTIVO | cuenta con nombre de usuario (si estaba pendiente debe regenerarse el código) |
| Eliminación física | **No existe** | — | — | — | Las FK sin cascada lo impedirían |

### G. Relaciones con otras tablas

**Clave primaria:** `id_usuarios`.

**Claves foráneas salientes (tabla hija → padre):**

| Columna | Referencia | Borrado | Obligatoria |
|---|---|---|---|
| `id_personas` | `personas.id_personas` (`fk_usuarios_id_personas`) | NO ACTION | Obligatoria |
| `id_usuario_baja` | `usuarios.id_usuarios` (`fk_usuarios_usuario_baja`) | NO ACTION | Opcional (NULL) |

**Claves foráneas entrantes (tablas hijas):** `activaciones_cuenta`(id_usuario_administrador_creador), `activaciones_cuenta`(id_usuarios), `bitacora_vuelos`(id_usuarios), `bloqueos_documento_vuelo`(id_usuario_propietario), `clasificaciones_tripulacion`(id_usuario_clasificador), `clasificaciones_tripulacion`(id_usuarios), `clasificaciones_tripulacion`(id_usuario_baja), `consultas_externas_habilitacion`(id_usuario_responsable), `contactos_coordinacion_traslado`(id_usuario_alta), `contactos_coordinacion_traslado`(id_usuario_baja), `coordinaciones_aa2000`(id_usuario_registrador), `correos_electronicos`(id_usuario_baja), `decisiones_habilitacion`(id_usuarios), `documentos_habilitacion`(id_usuario_baja), `documentos_habilitacion`(id_usuario_cargador), `documentos_habilitacion`(id_usuario_regularizacion), `documentos_vuelo`(id_usuario_baja), `eventos_auditoria`(id_usuario_actor), `habilitaciones_profesionales`(id_usuario_verificador), `informacion_hangar`(id_comandante_contexto), `informacion_hangar`(id_usuario_registrador), `informes_finales_vuelo`(id_usuario_creador), `informes_finales_vuelo`(id_usuario_revisor), `instantaneas_clima`(id_usuario_registrador), `negociaciones_horario_vuelo`(id_usuario_actor), `notificaciones`(id_usuarios), `obligaciones_informe_final`(id_usuario_finalizador), `obligaciones_informe_final`(id_usuario_aprobador), `obligaciones_informe_final`(id_usuario_comandante), `obligaciones_informe_final`(id_usuario_devolvedor), `politicas_habilitacion`(id_usuario_alta), `politicas_habilitacion`(id_usuario_baja), `rutas_vuelo`(id_usuario_creador), `rutas_vuelo`(id_usuario_presenta), `rutas_vuelo`(id_usuario_revisor), `telefonos`(id_usuario_baja), `usuarios`(id_usuario_baja), `usuarios_roles`(id_usuarios), `verificaciones_correo`(id_usuario_solicitante), `versiones_documento_vuelo`(id_usuario_creador), `vuelos`(id_usuario_cancelador), `vuelos`(id_usuario_comandante), `vuelos`(id_usuario_creador), `vuelos_sanitarios`(id_usuario_evaluador), `vuelos_sanitarios`(id_usuario_solicitante), `vuelos_tripulantes`(id_usuario_asignador), `vuelos_tripulantes`(id_usuarios), `vuelos_tripulantes`(id_usuario_baja).

`usuarios` es la tabla central: **FK entrantes** desde casi todos los módulos (vuelos: creador/comandante/cancelador; solicitudes: solicitante/evaluador; tripulación, rutas, hangar, informes, documentos, contactos, habilitaciones, políticas, auditoría…). Cada relación significa «quién hizo o a quién corresponde». Las FK hacia usuarios son todas **NO ACTION** salvo `notificaciones` y `usuarios_roles` (CASCADE): la baja es lógica y la aplicación nunca borra usuarios, de modo que ese CASCADE no se ejerce en el uso normal.

Salientes: `id_personas` (obligatoria, única: una persona tiene como máximo una cuenta) y `id_usuario_baja` (autorreferencia opcional: el administrador que dio de baja).

### H. Restricciones y decisiones de diseño

**Índices (no PK):**

| Índice | Único | Columnas | Filtro | Incluye |
|---|---|---|---|---|
| `idx_usuarios_id_personas` | no | id_personas | — | — |
| `idx_usuarios_id_usuario_baja` | no | id_usuario_baja | `id_usuario_baja IS NOT NULL` | — |
| `idx_usuarios_persona_id` | no | id_personas | — | — |
| `uq_usuarios_5` | sí | id_personas | — | — |
| `uq_usuarios_nombre_usuario` | sí | nombre_usuario | `nombre_usuario IS NOT NULL` | — |

**Restricciones CHECK:** 

- `ck_usuarios_estado_cuenta`: `(estado_cuenta=N'DESACTIVADO' OR estado_cuenta=N'ACTIVO' OR estado_cuenta=N'PENDIENTE_ACTIVACION')`
- `ck_usuarios_version_credenciales_positiva`: `(version_credenciales>=(1))`

**Triggers:** ninguno.

**DEFAULT / IDENTITY / nulabilidad:** ver la ficha de cada columna en la sección C (los DEFAULT figuran en «Validaciones»).

- **`uq_usuarios_nombre_usuario` (índice único filtrado, V14/V47):** SQL Server trata los NULL como valores iguales en un UNIQUE normal; como las cuentas pendientes no tienen nombre de usuario, se filtra `WHERE nombre_usuario IS NOT NULL`.
- **`ck_usuarios_estado_cuenta`:** sólo PENDIENTE_ACTIVACION, ACTIVO, DESACTIVADO.
- **`version_credenciales` ≥ 1:** el JWT lleva la versión; subirla invalida todas las sesiones de esa cuenta sin lista negra de tokens.
- **Doble marca de estado (`esta_activo` y `estado_cuenta`):** *Observación:* son parcialmente redundantes (DESACTIVADO ⇔ esta_activo=0 en el código actual); el código exige ambas coherentes pero el esquema no tiene un CHECK que las ate.
- **Bloqueos de concurrencia:** las operaciones administrativas toman el bloqueo de la fila (`users.lockById`/`lockWithPersonAndRolesById`) y el recuento de administradores activos (`lockActiveAdministrators`) para no dejar al sistema sin administrador.

### I. Evidencia de implementación

- [`V1 (creación)`](../../backend-java/src/main/resources/db/migration/V1__init_sanitary_flights_schema.sql#L20)
- [`V11 (estado_cuenta)`](../../backend-java/src/main/resources/db/migration/V11__cuentas_contactos_y_activaciones.sql#L48)
- [`V19 (version_credenciales)`](../../backend-java/src/main/resources/db/migration/V19__baja_logica_usuarios_e_invalidez_credenciales.sql#L4)
- [`V47 (baja administrativa)`](../../backend-java/src/main/resources/db/migration/V47__usuarios_unicidad_identidad_y_baja_administrativa.sql#L19)
- [`Entidad User`](../../backend-java/src/main/java/com/vuelossanitarios/backend/domain/user/User.java#L90)
- [`AuthService.activate`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/AuthService.java#L53)
- [`AuthService.deactivateUser`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/AuthService.java#L90)
- [`AuthService.login`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/AuthService.java#L28)
- [`Endpoints`](../../backend-java/src/main/java/com/vuelossanitarios/backend/api/AuthController.java#L19)
- [`Pantalla de activación/login`](../../frontend-react/src/main.jsx#L73)
- [`Directorio de usuarios`](../../frontend-react/src/users.jsx#L109)
- [`Prueba: AccountActivationIntegrationTest`](../../backend-java/src/test/java/com/vuelossanitarios/backend/api/AccountActivationIntegrationTest.java#L45)
- [`Prueba: UserAdministrationServiceTest`](../../backend-java/src/test/java/com/vuelossanitarios/backend/service/UserAdministrationServiceTest.java#L24)

---

## 3. Tabla `roles`

### A. Identificación de la tabla

| Atributo | Detalle |
|---|---|
| Nombre exacto y esquema | `dbo.roles` (esquema `dbo`) |
| Módulo funcional | 1. Identidad, cuentas y contactos |
| Tipo de tabla | Catálogo — roles de acceso (autorización) |
| Migración que la creó | V1 |
| Migraciones posteriores que modificaron su estructura | V5 (ADMINISTRADOR), V12 (CENTRO_OPERACIONES), V8/V24/V27/V28 (nombres e identificadores), V25 (resiembra tras el corte V24) |
| Estado actual en el esquema | Vigente — 6 columnas, PK `id_roles`, 0 FK salientes, 1 FK entrantes, 1 índice(s) único(s), 0 CHECK, 0 trigger(s) (verificado contra `sys.*` de la base E2E en Flyway V62) |
| Tablas relacionadas | usuarios_roles |

### B. Funcionalidad y justificación

`roles` lista los **perfiles de acceso** que Spring Security usa en las anotaciones `@PreAuthorize`: DTS, OPERACIONES, CENTRO_OPERACIONES, COMANDANTE y ADMINISTRADOR. Cada fila define un código estable y un nombre legible. Qué puede hacer cada rol no está en la tabla sino en el código de los controladores.

Es un catálogo sembrado por migración: la aplicación no tiene pantalla ni endpoint para crear o editar roles.

**Por qué es una tabla independiente.** Es una tabla de catálogo para no escribir los nombres de rol sueltos en cada cuenta y poder asignar varios roles por usuario (relación N:M mediante `usuarios_roles`). Los IDs son técnicos; el `codigo_rol` es la referencia estable (comentario de V25).

**Qué dejaría de funcionar sin ella.** No se podrían asignar roles ni autorizar endpoints; el login no devolvería roles.

### C. Descripción campo por campo

#### `codigo_rol`

| Atributo | Detalle |
|---|---|
| Nombre | `codigo_rol` |
| Tipo de dato | `nvarchar(30)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Código estable del rol. |
| Justificación | Es lo que usan las reglas de autorización; el nombre visible puede cambiar sin afectar permisos. |
| Contenido | DTS, OPERACIONES, CENTRO_OPERACIONES, COMANDANTE o ADMINISTRADOR. |
| Origen | Migración (V1/V5/V12/V25). |
| Momento inicial | En el INSERT de la migración. |
| Modificación | No cambia. |
| Validaciones | Índice único `uq_roles_2`; UNIQUE (`uq_roles_2`). |

#### `nombre_rol`

| Atributo | Detalle |
|---|---|
| Nombre | `nombre_rol` |
| Tipo de dato | `nvarchar(100)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Nombre legible del rol para pantallas. |
| Justificación | Evita mostrar códigos técnicos al usuario. |
| Contenido | Texto. |
| Origen | Migración. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | Sin restricción declarada más allá del tipo y la nulabilidad. |

#### `descripcion_rol`

| Atributo | Detalle |
|---|---|
| Nombre | `descripcion_rol` |
| Tipo de dato | `nvarchar(max)` |
| Nulabilidad | **Permite NULL.** Columna prevista pero sin uso: ninguna migración ni servicio la completa (hallazgo: campo nunca escrito). |
| Función | Descripción libre del rol. |
| Justificación | Previsto para documentar el alcance de cada rol. |
| Contenido | NULL en todas las filas actuales. |
| Origen | Migración (no informada). |
| Momento inicial | NULL. |
| Modificación | No se modifica. |
| Validaciones | Sin restricción declarada más allá del tipo y la nulabilidad. |

#### `esta_activo`

| Atributo | Detalle |
|---|---|
| Nombre | `esta_activo` |
| Tipo de dato | `bit` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Indica si el rol está disponible para asignarse. |
| Justificación | Permite retirar un rol de las opciones sin borrar asignaciones históricas. |
| Contenido | 1 = disponible. |
| Origen | Migración (DEFAULT 1). |
| Momento inicial | En el INSERT. |
| Modificación | No se modifica por la aplicación. |
| Validaciones | DEFAULT 1; DEFAULT 1. |

#### `fecha_creacion`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_creacion` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Registra el instante en que el rol se incorporó al sistema. |
| Justificación | Permite ordenar cronológicamente, reconstruir el historial y aportar trazabilidad sin depender de la auditoría. |
| Contenido | Fecha y hora (DATETIME2) de la inserción. |
| Origen | Automático: DEFAULT `SYSDATETIME()` de SQL Server o `@CreationTimestamp` de Hibernate (según la entidad); el usuario nunca ingresa esta fecha. |
| Momento inicial | En el INSERT. |
| Modificación | Inmutable: ningún flujo la actualiza (`updatable=false` en la entidad). |
| Validaciones | DEFAULT sysdatetime() |

#### `id_roles`

| Atributo | Detalle |
|---|---|
| Nombre | `id_roles` |
| Tipo de dato | `bigint` — IDENTITY(1,1) |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Clave primaria de la tabla: identifica de forma única cada fila y es el valor que otras tablas, la API y la auditoría usan para referirse a ella. |
| Justificación | Un identificador técnico numérico, estable y sin significado de negocio evita depender de datos que pueden cambiar (nombres, códigos) y hace eficientes los JOIN y las claves foráneas (decisión V24/V27: «toda tabla de aplicación tiene su propio id_<tabla> BIGINT IDENTITY»). |
| Contenido | Número entero positivo correlativo (1, 2, 3…). No lo ingresa el usuario. |
| Origen | SQL Server, columna IDENTITY(1,1): se asigna en el propio INSERT. Hibernate lo declara `@GeneratedValue(strategy = IDENTITY)` y lo lee de vuelta tras insertar. |
| Momento inicial | En el INSERT; no existe fila sin identificador. |
| Modificación | Nunca cambia (inmutable; JPA lo declara `updatable=false`). |
| Validaciones | PRIMARY KEY; PRIMARY KEY (unicidad y NOT NULL); no se reutiliza al borrar filas. |

### D. Momento en que se crea un registro

**Escenario 1: Siembra por migración**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | Flyway |
| Pantalla / componente y acción | — |
| Datos que aporta el usuario | — |
| Endpoint | — |
| Servicio | `V1` (DTS, OPERACIONES, COMANDANTE), `V5` (ADMINISTRADOR), `V12` (CENTRO_OPERACIONES) y `V25` (resiembra completa tras el corte destructivo de V24) |
| Validaciones y condiciones | — |
| Mecanismo que crea el registro | `INSERT INTO roles(codigo,nombre,activo,fecha_creacion) VALUES …` |
| Columnas completadas y de dónde sale cada valor | Todas las columnas con valores fijos de la migración. |
| Columnas que quedan NULL o con valor predeterminado | `descripcion_rol` (V25 no la informa). |
| Otros registros creados en la misma operación | — |
| Si la operación falla / atomicidad | Todo o nada por migración. |

### E. Ejemplo funcional completo

**Situación:** el Administrador abre «Nuevo usuario». El desplegable de roles se llena con `GET /api/auth/roles` (`AuthService.roleOptions`), que lee las filas con `esta_activo=1` y devuelve `codigo_rol` y `nombre_rol`. Si elige DTS, se crea una fila en `usuarios_roles` que apunta al `id_roles` de «DTS».

Filas actuales (catálogo): DTS «Dirección de Tránsito Sanitario» · OPERACIONES «Centro de Operaciones» · CENTRO_OPERACIONES «Centro de Operaciones» · COMANDANTE «Comandante de Vuelo» · ADMINISTRADOR «Administrador».

### F. Ciclo de vida del registro

Las filas **no cambian** después de sembrarse: la aplicación no las actualiza ni las borra. Sólo una nueva migración puede agregar un rol o desactivarlo (`esta_activo`). Desactivar un rol lo oculta de `roleOptions` y de `roleCodes`, pero no tiene hoy un proceso que lo haga.

### G. Relaciones con otras tablas

**Clave primaria:** `id_roles`.

**Claves foráneas salientes:** ninguna (tabla raíz).

**Claves foráneas entrantes (tablas hijas):** `usuarios_roles`(id_roles).

`roles` 1 — N `usuarios_roles` (FK con CASCADE desde la tabla puente). No tiene FK salientes. *Observación:* existen dos roles con el mismo nombre visible «Centro de Operaciones» (`OPERACIONES` y `CENTRO_OPERACIONES`); el código los trata como equivalentes en las autorizaciones (`hasAnyRole('OPERACIONES','CENTRO_OPERACIONES')`). Es una duplicidad histórica (V12 agregó el segundo) — ver capítulo de hallazgos.

### H. Restricciones y decisiones de diseño

**Índices (no PK):**

| Índice | Único | Columnas | Filtro | Incluye |
|---|---|---|---|---|
| `uq_roles_2` | sí | codigo_rol | — | — |

**Restricciones CHECK:** ninguna.

**Triggers:** ninguno.

**DEFAULT / IDENTITY / nulabilidad:** ver la ficha de cada columna en la sección C (los DEFAULT figuran en «Validaciones»).

- **`codigo_rol` UNIQUE:** impide dos roles con el mismo código; el código es la clave de negocio que usa Spring Security (`ROLE_<codigo>`).
- Sin CHECK ni trigger propio; la exclusividad de ADMINISTRADOR respecto de los roles operativos se valida en Java (`AuthService`) — V11 la protegió con un trigger que V12 retiró.

### I. Evidencia de implementación

- [`V1 (creación y siembra)`](../../backend-java/src/main/resources/db/migration/V1__init_sanitary_flights_schema.sql#L10)
- [`V12 (CENTRO_OPERACIONES)`](../../backend-java/src/main/resources/db/migration/V12__perfiles_comandante_multirrol_y_dni_canonico.sql#L10)
- [`V25 (resiembra)`](../../backend-java/src/main/resources/db/migration/V25__resembrar_catalogos_basicos.sql#L2)
- [`Entidad Role`](../../backend-java/src/main/java/com/vuelossanitarios/backend/domain/user/Role.java#L11)
- [`Lectura en el alta`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/AuthService.java#L120)

**La aplicación no inserta filas en esta tabla** (ningún servicio llama a `roles.save`); sólo la lee (`RoleRepository`, `AuthService.assignRoles`/`roleOptions`). En la base habitual hay 5 filas.

---

## 4. Tabla `usuarios_roles`

### A. Identificación de la tabla

| Atributo | Detalle |
|---|---|
| Nombre exacto y esquema | `dbo.usuarios_roles` (esquema `dbo`) |
| Módulo funcional | 1. Identidad, cuentas y contactos |
| Tipo de tabla | Relación N:M (tabla puente) usuarios ↔ roles |
| Migración que la creó | V1 (como `user_roles` con PK compuesta) |
| Migraciones posteriores que modificaron su estructura | V8 (renombre), V24/V27 (id BIGINT IDENTITY propio `id_usuarios_roles`), V11/V12 (trigger de exclusividad creado y luego retirado) |
| Estado actual en el esquema | Vigente — 4 columnas, PK `id_usuarios_roles`, 2 FK salientes, 0 FK entrantes, 1 índice(s) único(s), 0 CHECK, 0 trigger(s) (verificado contra `sys.*` de la base E2E en Flyway V62) |
| Tablas relacionadas | usuarios, roles |

### B. Funcionalidad y justificación

Registra **qué roles tiene cada cuenta**. Un usuario puede tener varios roles (p. ej. COMANDANTE más DTS) salvo ADMINISTRADOR, que es exclusivo. Cuando el login arma el JWT, lee esta tabla para devolver los roles.

También determina qué endpoints puede invocar el usuario y a qué pantallas de trabajo accede (selector de área en el frontend).

**Por qué es una tabla independiente.** Es la forma estándar de modelar una relación muchos-a-muchos: ni `usuarios` ni `roles` pueden contener la lista sin repetir datos. Además guarda la fecha en que se asignó cada rol.

**Qué dejaría de funcionar sin ella.** Ningún usuario tendría permisos; todos los endpoints protegidos responderían 403.

### C. Descripción campo por campo

#### `fecha_asignacion`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_asignacion` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Momento en que el rol quedó asignado a la cuenta. |
| Justificación | Permite saber desde cuándo rige la asignación vigente. |
| Contenido | Fecha y hora. |
| Origen | Automático: @CreationTimestamp / DEFAULT SYSDATETIME(). |
| Momento inicial | En el INSERT. |
| Modificación | No se modifica; si cambian los roles se borra y reinserta (nueva fecha). |
| Validaciones | DEFAULT sysdatetime() |

#### `id_usuarios`

| Atributo | Detalle |
|---|---|
| Nombre | `id_usuarios` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Cuenta que recibe el rol. |
| Justificación | Vincula el permiso con la cuenta. |
| Contenido | Identificador de `usuarios`. |
| Origen | Backend: la cuenta que se está creando o editando. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `usuarios.id_usuarios` (borrado: **CASCADE**); Índice único `uq_usuarios_roles_id_usuarios_id_roles` sobre (id_usuarios, id_roles); NOT NULL, FK con CASCADE, parte del índice único. |

#### `id_roles`

| Atributo | Detalle |
|---|---|
| Nombre | `id_roles` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Rol asignado. |
| Justificación | Define las capacidades de la cuenta. |
| Contenido | Identificador de `roles` (se busca por código con `roles.findByCodigo`). |
| Origen | Backend, a partir de los códigos elegidos por el administrador. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `roles.id_roles` (borrado: **CASCADE**); Índice único `uq_usuarios_roles_id_usuarios_id_roles` sobre (id_usuarios, id_roles); NOT NULL, FK con CASCADE, parte del índice único. |

#### `id_usuarios_roles`

| Atributo | Detalle |
|---|---|
| Nombre | `id_usuarios_roles` |
| Tipo de dato | `bigint` — IDENTITY(1,1) |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Clave primaria de la tabla: identifica de forma única cada fila y es el valor que otras tablas, la API y la auditoría usan para referirse a ella. |
| Justificación | Un identificador técnico numérico, estable y sin significado de negocio evita depender de datos que pueden cambiar (nombres, códigos) y hace eficientes los JOIN y las claves foráneas (decisión V24/V27: «toda tabla de aplicación tiene su propio id_<tabla> BIGINT IDENTITY»). |
| Contenido | Número entero positivo correlativo (1, 2, 3…). No lo ingresa el usuario. |
| Origen | SQL Server, columna IDENTITY(1,1): se asigna en el propio INSERT. Hibernate lo declara `@GeneratedValue(strategy = IDENTITY)` y lo lee de vuelta tras insertar. |
| Momento inicial | En el INSERT; no existe fila sin identificador. |
| Modificación | Nunca cambia (inmutable; JPA lo declara `updatable=false`). |
| Validaciones | PRIMARY KEY; PRIMARY KEY (unicidad y NOT NULL); no se reutiliza al borrar filas. |

### D. Momento en que se crea un registro

**Escenario 1: Asignación de roles al crear la cuenta**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | ADMINISTRADOR |
| Pantalla / componente y acción | «Nuevo usuario» (selección de roles). |
| Datos que aporta el usuario | Conjunto de códigos de rol. |
| Endpoint | `POST /api/auth/users` |
| Servicio | `AuthService.assignRoles` (llamado por `createPending`) |
| Validaciones y condiciones | Cada código debe existir en `roles` (400 «Rol inexistente»). |
| Mecanismo que crea el registro | `userRoles.save(new UserRole(u, role))` por cada rol. |
| Columnas completadas y de dónde sale cada valor | `id_usuarios` y `id_roles` ← cuenta y rol; `fecha_asignacion` ← @CreationTimestamp / DEFAULT SYSDATETIME(). |
| Columnas que quedan NULL o con valor predeterminado | Ninguna. |
| Otros registros creados en la misma operación | Cuenta, persona, contactos y activación (misma transacción). |
| Si la operación falla / atomicidad | Atómico con el alta. |

**Escenario 2: Cambio de roles de un usuario existente o reactivación**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | ADMINISTRADOR |
| Pantalla / componente y acción | Detalle del usuario → «Guardar» / «Reactivar». |
| Datos que aporta el usuario | Nuevo conjunto de roles. |
| Endpoint | `PUT /api/auth/users/{id}` o `PATCH /api/auth/users/{id}/reactivate` |
| Servicio | `AuthService.updateUser` / `reactivateUser` |
| Validaciones y condiciones | No puede cambiar sus propios roles; no puede quitar ADMINISTRADOR al último administrador activo; no se retira un rol mientras haya responsabilidades vigentes (`UserResponsibilityService`); una cuenta desactivada sólo cambia roles al reactivarse. |
| Mecanismo que crea el registro | **DELETE + INSERT**: `userRoles.deleteAll(u.getUserRoles())` y luego `assignRoles` con el conjunto nuevo (sólo si el conjunto cambió). |
| Columnas completadas y de dónde sale cada valor | Como el escenario 1. |
| Columnas que quedan NULL o con valor predeterminado | Ninguna. |
| Otros registros creados en la misma operación | `usuarios.version_credenciales` +1 (invalida sesiones); eventos `USER_ROLE/UPDATE`, `ASSIGN_COMMANDER`/`REMOVE_COMMANDER` en auditoría. |
| Si la operación falla / atomicidad | Atómico; si falla se conservan los roles previos. |

**Escenario 3: Bootstrap del administrador**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | Arranque |
| Pantalla / componente y acción | — |
| Datos que aporta el usuario | — |
| Endpoint | — |
| Servicio | `createBootstrapAdmin` |
| Validaciones y condiciones | — |
| Mecanismo que crea el registro | `userRoles.save`. |
| Columnas completadas y de dónde sale cada valor | Rol ADMINISTRADOR. |
| Columnas que quedan NULL o con valor predeterminado | — |
| Otros registros creados en la misma operación | Cuenta y persona. |
| Si la operación falla / atomicidad | Transacción propia. |

### E. Ejemplo funcional completo

**Situación:** el Administrador convierte a «lgomez» (COMANDANTE) en COMANDANTE + DTS.

1. En el detalle del usuario marca el rol DTS y pulsa **Guardar** (`PUT /api/auth/users/55`).
2. El backend detecta que el conjunto cambió ({COMANDANTE} → {COMANDANTE, DTS}), **borra** las filas de `usuarios_roles` de la cuenta y **vuelve a insertar** las dos:

| id_usuarios_roles | id_usuarios | id_roles | fecha_asignacion |
|---|---|---|---|
| 301 | 55 | 4 (COMANDANTE) | 2026-11-01 11:00:00 |
| 302 | 55 | 1 (DTS) | 2026-11-01 11:00:00 |

3. Como cambiaron roles, `usuarios.version_credenciales` pasa de 1 a 2: su sesión anterior queda inválida y debe ingresar de nuevo.
4. Se registran en `eventos_auditoria` los eventos de cambio de rol.

### F. Ciclo de vida del registro

| Transición | Acción | Actor | Efecto en la tabla |
|---|---|---|---|
| Asignación | Alta, edición o reactivación con roles | Admin | INSERT de una fila por rol |
| Cambio | Edición de roles | Admin | DELETE de todas las filas de la cuenta + INSERT del conjunto nuevo (todas las filas son «nuevas», incluso las de roles que se mantienen: `fecha_asignacion` se reinicia — ver hallazgos) |
| Baja de usuario | Desactivar cuenta | Admin | **Las filas se conservan** (la cuenta sólo se marca DESACTIVADO) |
| Borrado físico | Sólo por CASCADE si se borrara el usuario o el rol | — | No ocurre en el uso normal |

### G. Relaciones con otras tablas

**Clave primaria:** `id_usuarios_roles`.

**Claves foráneas salientes (tabla hija → padre):**

| Columna | Referencia | Borrado | Obligatoria |
|---|---|---|---|
| `id_roles` | `roles.id_roles` (`fk_usuarios_roles_id_roles`) | **CASCADE** | Obligatoria |
| `id_usuarios` | `usuarios.id_usuarios` (`fk_usuarios_roles_id_usuarios`) | **CASCADE** | Obligatoria |

**Claves foráneas entrantes:** ninguna.

FK `id_usuarios` → `usuarios` y `id_roles` → `roles`, **ambas ON DELETE CASCADE**: si se eliminara el usuario o el rol, las asignaciones desaparecerían (sin historial). Ambas son obligatorias. La cardinalidad efectiva es N:M con unicidad (un rol una sola vez por usuario).

### H. Restricciones y decisiones de diseño

**Índices (no PK):**

| Índice | Único | Columnas | Filtro | Incluye |
|---|---|---|---|---|
| `idx_usuarios_roles_id_roles` | no | id_roles | — | — |
| `idx_usuarios_roles_id_usuarios` | no | id_usuarios | — | — |
| `idx_usuarios_roles_rol_id` | no | id_roles | — | — |
| `idx_usuarios_roles_usuario_id` | no | id_usuarios | — | — |
| `uq_usuarios_roles_id_usuarios_id_roles` | sí | id_usuarios, id_roles | — | — |

**Restricciones CHECK:** ninguna.

**Triggers:** ninguno.

**DEFAULT / IDENTITY / nulabilidad:** ver la ficha de cada columna en la sección C (los DEFAULT figuran en «Validaciones»).

- **Índice único (`id_usuarios`, `id_roles`):** impide asignar el mismo rol dos veces a la cuenta.
- **Id propio `id_usuarios_roles`:** desde V24 todas las tablas de aplicación tienen un IDENTITY; la unicidad compuesta se mantiene como índice.
- **Observación:** el cambio de roles se resuelve borrando y reinsertando; el historial de «quién tuvo qué rol» sólo sobrevive en `eventos_auditoria`.

### I. Evidencia de implementación

- [`V1 (user_roles)`](../../backend-java/src/main/resources/db/migration/V1__init_sanitary_flights_schema.sql#L37)
- [`Entidad UserRole`](../../backend-java/src/main/java/com/vuelossanitarios/backend/domain/user/UserRole.java#L21)
- [`AuthService.assignRoles`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/AuthService.java#L138)
- [`AuthService.updateUser`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/AuthService.java#L73)
- [`Detalle de usuario (UI)`](../../frontend-react/src/users.jsx#L42)
- [`Prueba: UserAdministrationIntegrationTest`](../../backend-java/src/test/java/com/vuelossanitarios/backend/api/UserAdministrationIntegrationTest.java#L41)

---

## 5. Tabla `perfiles_comandante`

### A. Identificación de la tabla

| Atributo | Detalle |
|---|---|
| Nombre exacto y esquema | `dbo.perfiles_comandante` (esquema `dbo`) |
| Módulo funcional | 1. Identidad, cuentas y contactos |
| Tipo de tabla | Subtipo 0..1 de personas — datos profesionales del comandante |
| Migración que la creó | V12 |
| Migraciones posteriores que modificaron su estructura | V20 (provincia actual), V24/V27 (renombres, ids), V57 (restablece el índice único de licencia perdido en V24) |
| Estado actual en el esquema | Vigente — 7 columnas, PK `id_perfiles_comandante`, 2 FK salientes, 0 FK entrantes, 2 índice(s) único(s), 1 CHECK, 0 trigger(s) (verificado contra `sys.*` de la base E2E en Flyway V62) |
| Tablas relacionadas | personas, provincias |

### B. Funcionalidad y justificación

Guarda lo que sólo tiene sentido para una persona con rol COMANDANTE: su **número de licencia aeronáutica** y la **provincia donde se encuentra actualmente**. La licencia identifica al piloto ante la autoridad; la provincia actual permite a Operaciones asignarle vuelos que despeguen cerca de donde está.

La provincia no es un dato histórico del perfil sino la *ubicación operativa vigente*: se actualiza sola cuando un vuelo finaliza en otro lugar.

**Por qué es una tabla independiente.** Un atributo exclusivo de un rol no debe ensuciar `personas` (V12: «Perfiles profesionales de comandante, multirrol y valores de identidad canónicos»). Al ser 0..1 por persona y colgar de `personas` (no de `usuarios`), el perfil sobrevive si la cuenta se desactiva y la licencia se mantiene si la persona vuelve a ser comandante.

**Qué dejaría de funcionar sin ella.** No se podría exigir licencia a los comandantes ni filtrar comandantes disponibles por provincia; fallarían la asignación de recursos, el alta operativa y la elegibilidad.

### C. Descripción campo por campo

#### `numero_licencia`

| Atributo | Detalle |
|---|---|
| Nombre | `numero_licencia` |
| Tipo de dato | `nvarchar(50)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Número de licencia aeronáutica del comandante. |
| Justificación | Es el dato regulatorio que acredita al piloto; el sistema lo exige para poder asignar el rol COMANDANTE. |
| Contenido | Texto alfanumérico en mayúsculas (p. ej. `ARG1234`). |
| Origen | Formulario de alta/edición de usuario (Admin). |
| Momento inicial | En el INSERT del perfil. |
| Modificación | Edición del usuario con una licencia distinta (auditada como `UPDATE_LICENSE`). |
| Validaciones | CHECK `ck_perfiles_comandante_licencia_alphanumerica`; CHECK alfanumérico (`ck_perfiles_comandante_licencia_alphanumerica`); se pasa a mayúsculas en Java. |

#### `numero_licencia_normalizada`

| Atributo | Detalle |
|---|---|
| Nombre | `numero_licencia_normalizada` |
| Tipo de dato | `nvarchar(50)` |
| Nulabilidad | **Permite NULL.** Columna calculada: SQL Server la declara anulable por ser derivada, pero nunca queda vacía mientras `numero_licencia` tenga valor (que es NOT NULL). |
| Función | Forma canónica de la licencia para comparar. |
| Justificación | Evita duplicados que sólo difieren en espacios o mayúsculas. |
| Contenido | `UPPER(LTRIM(RTRIM(numero_licencia)))`. |
| Origen | Calculada y persistida por SQL Server. |
| Momento inicial | Se calcula con el INSERT. |
| Modificación | Se recalcula sola si cambia la licencia. |
| Validaciones | Índice único `uq_perfiles_comandante_numero_licencia`; Columna calculada persistida: (upper(ltrim(rtrim([numero_licencia])))); Índice único `uq_perfiles_comandante_numero_licencia`. |

#### `fecha_creacion`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_creacion` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Registra el instante en que el perfil de comandante se incorporó al sistema. |
| Justificación | Permite ordenar cronológicamente, reconstruir el historial y aportar trazabilidad sin depender de la auditoría. |
| Contenido | Fecha y hora (DATETIME2) de la inserción. |
| Origen | Automático: DEFAULT `SYSDATETIME()` de SQL Server o `@CreationTimestamp` de Hibernate (según la entidad); el usuario nunca ingresa esta fecha. |
| Momento inicial | En el INSERT. |
| Modificación | Inmutable: ningún flujo la actualiza (`updatable=false` en la entidad). |
| Validaciones | DEFAULT sysdatetime() |

#### `fecha_actualizacion`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_actualizacion` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Último cambio del perfil (licencia o provincia). |
| Justificación | Trazabilidad de cuándo se movió o cambió. |
| Contenido | Fecha y hora. |
| Origen | `@UpdateTimestamp`. |
| Momento inicial | En el INSERT. |
| Modificación | En cada UPDATE (cambio de licencia o de provincia, manual o por fin de vuelo). |
| Validaciones | DEFAULT sysdatetime() |

#### `id_personas`

| Atributo | Detalle |
|---|---|
| Nombre | `id_personas` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Persona que es comandante. |
| Justificación | Cuelga de la identidad, no de la cuenta. |
| Contenido | Identificador de `personas`. |
| Origen | Backend. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `personas.id_personas` (borrado: NO ACTION); Índice único `uq_perfiles_comandante_id_personas`; NOT NULL, FK, única (0..1 perfil por persona). |

#### `id_provincias`

| Atributo | Detalle |
|---|---|
| Nombre | `id_provincias` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** Se desconoce al dar de alta. Lo completan Operaciones, el Administrador o, automáticamente, el primer vuelo finalizado. Un comandante puede permanecer sin ubicación (no será elegible para vuelos que la exijan). |
| Función | Provincia donde se encuentra hoy el comandante. |
| Justificación | Permite exigir que el comandante esté en la provincia de origen del traslado y mostrar candidatos por zona. |
| Contenido | Identificador de `provincias`. |
| Origen | Operaciones/Admin (manual) o `FlightService.finish` (automático al finalizar un vuelo). |
| Momento inicial | NULL al crear el perfil. |
| Modificación | Cambio manual de ubicación del comandante; actualización automática al finalizar un vuelo (provincia del aeropuerto de destino). |
| Validaciones | FOREIGN KEY → `provincias.id_provincias` (borrado: NO ACTION); FK a `provincias`; en la API sólo se acepta una provincia activa. |

#### `id_perfiles_comandante`

| Atributo | Detalle |
|---|---|
| Nombre | `id_perfiles_comandante` |
| Tipo de dato | `bigint` — IDENTITY(1,1) |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Clave primaria de la tabla: identifica de forma única cada fila y es el valor que otras tablas, la API y la auditoría usan para referirse a ella. |
| Justificación | Un identificador técnico numérico, estable y sin significado de negocio evita depender de datos que pueden cambiar (nombres, códigos) y hace eficientes los JOIN y las claves foráneas (decisión V24/V27: «toda tabla de aplicación tiene su propio id_<tabla> BIGINT IDENTITY»). |
| Contenido | Número entero positivo correlativo (1, 2, 3…). No lo ingresa el usuario. |
| Origen | SQL Server, columna IDENTITY(1,1): se asigna en el propio INSERT. Hibernate lo declara `@GeneratedValue(strategy = IDENTITY)` y lo lee de vuelta tras insertar. |
| Momento inicial | En el INSERT; no existe fila sin identificador. |
| Modificación | Nunca cambia (inmutable; JPA lo declara `updatable=false`). |
| Validaciones | PRIMARY KEY; PRIMARY KEY (unicidad y NOT NULL); no se reutiliza al borrar filas. |

### D. Momento en que se crea un registro

**Escenario 1: Alta de un usuario con rol COMANDANTE (o agregado de ese rol a una persona sin perfil)**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | ADMINISTRADOR |
| Pantalla / componente y acción | «Nuevo usuario» o detalle del usuario con el rol COMANDANTE marcado y el campo «Licencia aeronáutica» completo. |
| Datos que aporta el usuario | Número de licencia (alfanumérico). |
| Endpoint | `POST /api/auth/users` o `PUT /api/auth/users/{id}` / `PATCH …/reactivate` |
| Servicio | `AuthService.ensureCommanderProfile` |
| Validaciones y condiciones | Licencia obligatoria si la persona no tiene perfil; sólo letras y números (se pasa a mayúsculas); no puede existir ya (409 «La licencia aeronáutica ya existe»), garantizado además por el índice único (V57) ante altas simultáneas. |
| Mecanismo que crea el registro | `commanderProfiles.saveAndFlush(profile)`. |
| Columnas completadas y de dónde sale cada valor | `id_personas` ← persona; `numero_licencia` ← formulario en mayúsculas; `numero_licencia_normalizada` ← calculada por SQL Server; fechas ← Hibernate. |
| Columnas que quedan NULL o con valor predeterminado | `id_provincias` (provincia actual). |
| Otros registros creados en la misma operación | Evento `COMMANDER_PROFILE/CREATE` en auditoría. |
| Si la operación falla / atomicidad | Dentro de la transacción del alta/edición. |

### E. Ejemplo funcional completo

**Situación:** alta de «Luis Gómez» como COMANDANTE con licencia «arg1234».

1. El Administrador marca COMANDANTE y escribe la licencia en «Nuevo usuario».
2. El backend la convierte a mayúsculas, verifica que no exista y guarda:

| id_perfiles_comandante | id_personas | numero_licencia | numero_licencia_normalizada | id_provincias |
|---|---|---|---|---|
| 12 | 101 | ARG1234 | ARG1234 | NULL |

3. Hasta que alguien fije su provincia, no podrá ser asignado a vuelos con exigencia de ubicación. Operaciones o el Administrador usan «Ubicación» del comandante (`POST /api/catalogs/commanders/{id}/location`): `id_provincias` pasa a la provincia elegida y se audita `MANUAL_LOCATION_CHANGE`.
4. Al finalizar un vuelo cuyo destino está en otra provincia, `FlightService.finish` actualiza automáticamente `id_provincias` a la provincia del aeropuerto de destino.

### F. Ciclo de vida del registro

| Transición | Acción | Actor | Campos | Efecto |
|---|---|---|---|---|
| Creación | Rol COMANDANTE + licencia | Admin | todos | INSERT |
| Cambio de licencia | Edición con licencia distinta | Admin | `numero_licencia`, `fecha_actualizacion` | auditoría `UPDATE_LICENSE` |
| Cambio manual de ubicación | «Ubicación del comandante» | Admin / Operaciones / Centro de Operaciones | `id_provincias` | auditoría `MANUAL_LOCATION_CHANGE` |
| Cambio automático de ubicación | Finalizar vuelo | Operaciones (acción `finish`) | `id_provincias` | misma transacción que el cierre del vuelo |
| Pérdida del rol | Quitar COMANDANTE | Admin | **la fila se conserva** (no se borra al quitar el rol) | el perfil queda inactivo por no tener rol |

### G. Relaciones con otras tablas

**Clave primaria:** `id_perfiles_comandante`.

**Claves foráneas salientes (tabla hija → padre):**

| Columna | Referencia | Borrado | Obligatoria |
|---|---|---|---|
| `id_personas` | `personas.id_personas` (`fk_perfiles_comandante_id_personas`) | NO ACTION | Obligatoria |
| `id_provincias` | `provincias.id_provincias` (`fk_perfiles_comandante_id_provincias`) | NO ACTION | Opcional (NULL) |

**Claves foráneas entrantes:** ninguna.

`perfiles_comandante` comparte clave con la persona (1:0..1, FK `id_personas` única) y apunta opcionalmente a `provincias`. No hay cascada. Se usa en: filtros de comandantes disponibles, validación de «el comandante debe encontrarse en la provincia de origen» al asignar o crear un vuelo operativo, y actualización automática al finalizar.

### H. Restricciones y decisiones de diseño

**Índices (no PK):**

| Índice | Único | Columnas | Filtro | Incluye |
|---|---|---|---|---|
| `idx_perfiles_comandante_id_personas` | no | id_personas | — | — |
| `idx_perfiles_comandante_id_provincias` | no | id_provincias | — | — |
| `idx_perfiles_comandante_persona_id` | no | id_personas | — | — |
| `idx_perfiles_comandante_provincia_actual_id` | no | id_provincias | — | — |
| `uq_perfiles_comandante_id_personas` | sí | id_personas | — | — |
| `uq_perfiles_comandante_numero_licencia` | sí | numero_licencia_normalizada | — | — |

**Restricciones CHECK:** 

- `ck_perfiles_comandante_licencia_alphanumerica`: `(NOT numero_licencia like N'%^0-9A-Za-z%')`

**Triggers:** ninguno.

**DEFAULT / IDENTITY / nulabilidad:** ver la ficha de cada columna en la sección C (los DEFAULT figuran en «Validaciones»).

- **`uq_perfiles_comandante_numero_licencia` (V57):** índice único sobre la columna calculada *normalizada*; V24 había perdido la garantía y dependía sólo de una consulta en Java que dos altas simultáneas podían superar.
- **Columna calculada persistida `numero_licencia_normalizada`** = `UPPER(LTRIM(RTRIM(numero_licencia)))`: la base compara siempre la forma canónica sin que el código tenga que recordarlo.
- **CHECK alfanumérico** en `numero_licencia`.
- La provincia es opcional porque se conoce *después* del alta.

### I. Evidencia de implementación

- [`V12 (creación)`](../../backend-java/src/main/resources/db/migration/V12__perfiles_comandante_multirrol_y_dni_canonico.sql#L13)
- [`V20 (provincia actual)`](../../backend-java/src/main/resources/db/migration/V20__negociacion_horaria_ubicaciones_y_normalizacion_aeropuertos.sql#L41)
- [`V57 (licencia única)`](../../backend-java/src/main/resources/db/migration/V57__licencia_comandante_unica.sql#L9)
- [`Entidad CommanderProfile`](../../backend-java/src/main/java/com/vuelossanitarios/backend/domain/person/CommanderProfile.java#L7)
- [`AuthService.ensureCommanderProfile`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/AuthService.java#L141)
- [`Ubicación manual del comandante`](../../backend-java/src/main/java/com/vuelossanitarios/backend/api/CatalogController.java#L43)
- [`Ubicación automática al finalizar`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/FlightService.java#L205)
- [`Prueba: e2e-perfiles-comandante`](../../scripts/e2e-perfiles-comandante.cjs#L1)

---

## 6. Tabla `activaciones_cuenta`

### A. Identificación de la tabla

| Atributo | Detalle |
|---|---|
| Nombre exacto y esquema | `dbo.activaciones_cuenta` (esquema `dbo`) |
| Módulo funcional | 1. Identidad, cuentas y contactos |
| Tipo de tabla | Auxiliar — códigos de un solo uso para activar cuentas |
| Migración que la creó | V11 |
| Migraciones posteriores que modificaron su estructura | V24/V27 (ids), V62 (codigo_numerico, intentos_fallidos, vigencia de 10 minutos) |
| Estado actual en el esquema | Vigente — 9 columnas, PK `id_activaciones_cuenta`, 2 FK salientes, 0 FK entrantes, 1 índice(s) único(s), 0 CHECK, 0 trigger(s) (verificado contra `sys.*` de la base E2E en Flyway V62) |
| Tablas relacionadas | usuarios |

### B. Funcionalidad y justificación

Cada fila es un **código de activación**: el Administrador crea una cuenta sin contraseña y entrega al titular un código de 6 dígitos; el titular lo ingresa junto a su DNI para elegir usuario y contraseña. La tabla guarda el *hash* del código (nunca el código), su vencimiento, cuántos intentos fallidos lleva y cuándo se usó o se cerró.

Permite que el administrador no conozca nunca la contraseña del titular y que un código expire, se agote o sea reemplazado por otro.

**Por qué es una tabla independiente.** El código es un hecho transitorio con su propio ciclo (vigente → usado/vencido/agotado/reemplazado) y puede haber varios históricos por usuario; guardarlo en `usuarios` obligaría a sobrescribir y perder el historial. Sólo puede haber **uno abierto por usuario** (índice filtrado).

**Qué dejaría de funcionar sin ella.** Las cuentas pendientes no podrían activarse; la pantalla «Activar cuenta» no tendría contra qué validar.

### C. Descripción campo por campo

#### `token_hash`

| Atributo | Detalle |
|---|---|
| Nombre | `token_hash` |
| Tipo de dato | `nvarchar(255)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Hash BCrypt del código de activación. |
| Justificación | Si la tabla se filtrara no se podría activar una cuenta ajena; sólo quien conoce el código lo puede verificar. |
| Contenido | Cadena BCrypt (no se reproduce ninguno). |
| Origen | `encoder.encode(code)` en el backend. |
| Momento inicial | En el INSERT. |
| Modificación | Nunca cambia. |
| Validaciones | NOT NULL; el código vive sólo en la respuesta al administrador. |

#### `fecha_creacion`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_creacion` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Instante de emisión del código. |
| Justificación | Base del vencimiento y de la ventana de validez. |
| Contenido | Fecha y hora (hora de negocio). |
| Origen | Backend (`now()` con el reloj ajustable). |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | DEFAULT sysdatetime(); Condiciona el CHECK de fechas. |

#### `fecha_expiracion`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_expiracion` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Instante límite de uso. |
| Justificación | Limita la ventana de ataque sobre el código de 6 dígitos. |
| Contenido | Creación + 10 minutos (códigos nuevos). |
| Origen | Backend. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | CHECK `ck_activaciones_cuenta_fechas` exige la igualdad exacta con la creación + 10 min (o + 24 h si es legado). |

#### `fecha_utilizacion`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_utilizacion` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **Permite NULL.** NULL mientras el código sigue abierto. Lo completa el titular (uso/venc./agotamiento) o el administrador (regeneración). No vuelve a NULL. *Nota:* el nombre sugiere «uso», pero también marca cierres sin uso. |
| Función | Cierre del código: usado, vencido, agotado o reemplazado. |
| Justificación | Distingue códigos abiertos de cerrados y permite el índice de «uno abierto por cuenta». |
| Contenido | Fecha y hora de cierre. |
| Origen | Backend. |
| Momento inicial | NULL al crear. |
| Modificación | Se completa al activarse, al vencer, agotarse o regenerarse. |
| Validaciones | Su nulidad define el índice único filtrado. |

#### `id_activaciones_cuenta`

| Atributo | Detalle |
|---|---|
| Nombre | `id_activaciones_cuenta` |
| Tipo de dato | `bigint` — IDENTITY(1,1) |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Clave primaria de la tabla: identifica de forma única cada fila y es el valor que otras tablas, la API y la auditoría usan para referirse a ella. |
| Justificación | Un identificador técnico numérico, estable y sin significado de negocio evita depender de datos que pueden cambiar (nombres, códigos) y hace eficientes los JOIN y las claves foráneas (decisión V24/V27: «toda tabla de aplicación tiene su propio id_<tabla> BIGINT IDENTITY»). |
| Contenido | Número entero positivo correlativo (1, 2, 3…). No lo ingresa el usuario. |
| Origen | SQL Server, columna IDENTITY(1,1): se asigna en el propio INSERT. Hibernate lo declara `@GeneratedValue(strategy = IDENTITY)` y lo lee de vuelta tras insertar. |
| Momento inicial | En el INSERT; no existe fila sin identificador. |
| Modificación | Nunca cambia (inmutable; JPA lo declara `updatable=false`). |
| Validaciones | PRIMARY KEY; PRIMARY KEY (unicidad y NOT NULL); no se reutiliza al borrar filas. |

#### `id_usuarios`

| Atributo | Detalle |
|---|---|
| Nombre | `id_usuarios` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Cuenta que se activará con este código. |
| Justificación | Liga el código con la cuenta pendiente. |
| Contenido | Identificador de `usuarios`. |
| Origen | Backend. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `usuarios.id_usuarios` (borrado: NO ACTION); Índice único `uq_activaciones_cuenta_usuario_vigente` filtrado `fecha_utilizacion IS NULL`; NOT NULL, FK. |

#### `id_usuario_administrador_creador`

| Atributo | Detalle |
|---|---|
| Nombre | `id_usuario_administrador_creador` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** Opcional por diseño: sólo se completa cuando hay un actor humano; los registros migrados o automáticos podrían no tenerlo. |
| Función | Administrador que emitió el código. |
| Justificación | Responsabilidad de quién entregó el acceso. |
| Contenido | Identificador de `usuarios`. |
| Origen | Backend: el administrador autenticado. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `usuarios.id_usuarios` (borrado: NO ACTION); FK opcional. |

#### `codigo_numerico`

| Atributo | Detalle |
|---|---|
| Nombre | `codigo_numerico` |
| Tipo de dato | `bit` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Indica si el código es el OTP decimal de 6 dígitos (1) o un código antiguo alfanumérico (0, legado). |
| Justificación | Permite que los códigos entregados antes de V62 sigan válidos con sus 24 h originales. |
| Contenido | 0/1. |
| Origen | Backend (siempre 1 para códigos nuevos); migración V62 deja 0 en los existentes. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | DEFAULT 0; Condiciona el CHECK de fechas; DEFAULT 0. |

#### `intentos_fallidos`

| Atributo | Detalle |
|---|---|
| Nombre | `intentos_fallidos` |
| Tipo de dato | `int` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Cantidad de códigos erróneos ingresados. |
| Justificación | Frena ataques de fuerza bruta: al 5.º error el código queda cerrado. |
| Contenido | Entero 0–5. |
| Origen | Backend (`activate`). |
| Momento inicial | 0 en el INSERT. |
| Modificación | +1 en cada error. |
| Validaciones | DEFAULT 0; CHECK entre 0 y 5; DEFAULT 0. |

### D. Momento en que se crea un registro

**Escenario 1: Alta de un usuario (genera el primer código)**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | ADMINISTRADOR |
| Pantalla / componente y acción | «Nuevo usuario»; el código se muestra una sola vez en un aviso («Copiar» / «Cerrar aviso»). |
| Datos que aporta el usuario | — |
| Endpoint | `POST /api/auth/users` |
| Servicio | `AuthService.newActivation` (desde `createPending`) |
| Validaciones y condiciones | Se genera con `SecureRandom` (6 dígitos con ceros a la izquierda). |
| Mecanismo que crea el registro | `activations.save(a)`. |
| Columnas completadas y de dónde sale cada valor | `id_usuarios` ← cuenta; `token_hash` ← BCrypt(código); `codigo_numerico`=1; `intentos_fallidos`=0; `fecha_creacion` ← backend (reloj de negocio); `fecha_expiracion` = creación + 10 min; `id_usuario_administrador_creador` ← administrador. |
| Columnas que quedan NULL o con valor predeterminado | `fecha_utilizacion`. |
| Otros registros creados en la misma operación | Cuenta, persona y contactos (misma transacción). |
| Si la operación falla / atomicidad | Atómico con el alta. |

**Escenario 2: Regeneración del código**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | ADMINISTRADOR |
| Pantalla / componente y acción | Detalle del usuario → «Regenerar código de activación». |
| Datos que aporta el usuario | — |
| Endpoint | `POST /api/auth/users/{id}/activation-code` |
| Servicio | `AuthService.regenerate` |
| Validaciones y condiciones | La cuenta debe estar PENDIENTE_ACTIVACION. Primero cierra (UPDATE `fecha_utilizacion`) los códigos abiertos. |
| Mecanismo que crea el registro | UPDATE de los abiertos + `activations.save` del nuevo. |
| Columnas completadas y de dónde sale cada valor | Como el escenario 1. |
| Columnas que quedan NULL o con valor predeterminado | `fecha_utilizacion`. |
| Otros registros creados en la misma operación | Evento `CODIGO_ACTIVACION_REGENERADO`. |
| Si la operación falla / atomicidad | Atómico. |

**Escenario 3: Migración**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | Flyway V62 |
| Pantalla / componente y acción | — |
| Datos que aporta el usuario | — |
| Endpoint | — |
| Servicio | V62 |
| Validaciones y condiciones | — |
| Mecanismo que crea el registro | ALTER TABLE: marca los códigos previos como legados (`codigo_numerico`=0, 24 horas). |
| Columnas completadas y de dónde sale cada valor | — |
| Columnas que quedan NULL o con valor predeterminado | — |
| Otros registros creados en la misma operación | — |
| Si la operación falla / atomicidad | — |

### E. Ejemplo funcional completo

**Situación (ficticia):** alta de Luis y activación.

| id_activaciones_cuenta | id_usuarios | token_hash | codigo_numerico | intentos_fallidos | fecha_creacion | fecha_expiracion | fecha_utilizacion |
|---|---|---|---|---|---|---|---|
| 77 | 55 | (hash BCrypt) | 1 | 0 | 10:02:11 | 10:12:11 | NULL |

1. Luis se equivoca dos veces: `intentos_fallidos` = 2 (cada error se confirma aunque la operación responda 400, por `noRollbackFor=ApiException`).
2. Acierta a las 10:09: el backend actualiza `fecha_utilizacion` = 10:09 y activa la cuenta (UPDATE en `usuarios`).
3. Si hubiera fallado cinco veces, `fecha_utilizacion` se completaría igual (cierre por agotamiento) y el administrador debería regenerar el código. Si pasan los 10 minutos, el primer intento posterior cierra el código como vencido.

### F. Ciclo de vida del registro

| Transición | Acción | Actor | Campos | Efecto |
|---|---|---|---|---|
| Emisión | Alta o regeneración | Admin | INSERT | código abierto (`fecha_utilizacion` NULL) |
| Intento fallido | Código incorrecto | Titular | `intentos_fallidos` +1 | al 5.º queda cerrado |
| Uso | Código correcto | Titular | `fecha_utilizacion` | cuenta pasa a ACTIVO |
| Vencimiento | Intento tras 10 min | Titular | `fecha_utilizacion` | cerrado, se pide uno nuevo |
| Reemplazo | Regeneración | Admin | `fecha_utilizacion` del anterior | sólo uno abierto |
| Borrado | No existe | — | — | las filas se conservan |

### G. Relaciones con otras tablas

**Clave primaria:** `id_activaciones_cuenta`.

**Claves foráneas salientes (tabla hija → padre):**

| Columna | Referencia | Borrado | Obligatoria |
|---|---|---|---|
| `id_usuario_administrador_creador` | `usuarios.id_usuarios` (`fk_activaciones_cuenta_id_usuario_administrador_creador`) | NO ACTION | Opcional (NULL) |
| `id_usuarios` | `usuarios.id_usuarios` (`fk_activaciones_cuenta_id_usuarios`) | NO ACTION | Obligatoria |

**Claves foráneas entrantes:** ninguna.

FK `id_usuarios` → `usuarios` (obligatoria) y `id_usuario_administrador_creador` → `usuarios` (opcional). Una cuenta puede tener muchos códigos históricos pero uno solo abierto.

### H. Restricciones y decisiones de diseño

**Índices (no PK):**

| Índice | Único | Columnas | Filtro | Incluye |
|---|---|---|---|---|
| `idx_activaciones_cuenta_administrador_creador_id` | no | id_usuario_administrador_creador | — | — |
| `idx_activaciones_cuenta_id_usuario_administrador_creador` | no | id_usuario_administrador_creador | — | — |
| `idx_activaciones_cuenta_id_usuarios` | no | id_usuarios | — | — |
| `idx_activaciones_cuenta_usuario_id` | no | id_usuarios | — | — |
| `uq_activaciones_cuenta_usuario_vigente` | sí | id_usuarios | `fecha_utilizacion IS NULL` | — |

**Restricciones CHECK:** ninguna.

**Triggers:** ninguno.

**DEFAULT / IDENTITY / nulabilidad:** ver la ficha de cada columna en la sección C (los DEFAULT figuran en «Validaciones»).

- **`uq_activaciones_cuenta_usuario_vigente`** (índice único filtrado `WHERE fecha_utilizacion IS NULL`): garantiza un único código abierto por cuenta incluso con regeneraciones simultáneas.
- **`ck_activaciones_cuenta_fechas`:** los códigos nuevos vencen exactamente 10 min después de la creación; los legados, 24 h.
- **`ck_activaciones_cuenta_intentos`:** 0 a 5 intentos.
- El código se guarda con BCrypt, no con HMAC como los de correo: ambos mecanismos coexisten (observación).

### I. Evidencia de implementación

- [`V11 (creación)`](../../backend-java/src/main/resources/db/migration/V11__cuentas_contactos_y_activaciones.sql#L83)
- [`V62 (OTP de 6 dígitos)`](../../backend-java/src/main/resources/db/migration/V62__otp_decimal_seis_digitos_activacion_cuenta.sql#L4)
- [`Entidad AccountActivation`](../../backend-java/src/main/java/com/vuelossanitarios/backend/domain/user/AccountActivation.java#L7)
- [`AuthService.newActivation`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/AuthService.java#L137)
- [`AuthService.activate`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/AuthService.java#L53)
- [`Endpoint de activación`](../../backend-java/src/main/java/com/vuelossanitarios/backend/api/AuthController.java#L19)
- [`Pantalla de activación`](../../frontend-react/src/main.jsx#L116)
- [`Prueba: AccountActivationIntegrationTest`](../../backend-java/src/test/java/com/vuelossanitarios/backend/api/AccountActivationIntegrationTest.java#L45)

---

## 7. Tabla `correos_electronicos`

### A. Identificación de la tabla

| Atributo | Detalle |
|---|---|
| Nombre exacto y esquema | `dbo.correos_electronicos` (esquema `dbo`) |
| Módulo funcional | 1. Identidad, cuentas y contactos |
| Tipo de tabla | Dependiente de personas — contactos de correo con baja lógica |
| Migración que la creó | V11 |
| Migraciones posteriores que modificaron su estructura | V8/V24/V27/V28 (renombres), V49 (normalizado, versión, baja lógica, unicidad vigente), V50 (corrección de principales), V54 (fecha_verificacion) |
| Estado actual en el esquema | Vigente — 13 columnas, PK `id_correos_electronicos`, 2 FK salientes, 1 FK entrantes, 2 índice(s) único(s), 2 CHECK, 0 trigger(s) (verificado contra `sys.*` de la base E2E en Flyway V62) |
| Tablas relacionadas | personas, usuarios (baja), verificaciones_correo |

### B. Funcionalidad y justificación

Almacena las **direcciones de correo de cada persona** (una persona puede tener varias; una es la principal). Se usan para identificar un contacto y, desde V54, para verificar que la dirección pertenece realmente a su titular mediante un código de 6 dígitos (`verificaciones_correo`). El titular las gestiona desde «Mi cuenta».

Un correo retirado se conserva como histórico (baja lógica) con quién lo retiró y por qué.

**Por qué es una tabla independiente.** Separar los correos de `personas` permite varias direcciones por persona, un principal único, historial de bajas y verificación por correo (V11/V49). Los datos de contacto son de la *persona* y no de la cuenta: si el titular también es paciente, comparte sus contactos.

**Qué dejaría de funcionar sin ella.** No habría datos de contacto; no podrían verificarse correos ni elegirse el principal; el administrador no podría registrar al menos un correo por usuario.

### C. Descripción campo por campo

#### `direccion`

| Atributo | Detalle |
|---|---|
| Nombre | `direccion` |
| Tipo de dato | `nvarchar(150)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Dirección de correo tal como la ingresó la persona. |
| Justificación | Se conserva la grafía original para mostrarla; la comparación usa la normalizada. |
| Contenido | Texto de hasta 150 caracteres. |
| Origen | Formulario de «Nuevo usuario» o «Mi cuenta». |
| Momento inicial | En el INSERT. |
| Modificación | «Editar» (si no está verificado). |
| Validaciones | CHECK `ck_correos_electronicos_direccion`; CHECK de longitud útil (> 2 caracteres); validación de formato y de longitud máxima de 150 caracteres en Java (`ContactNormalizer.MAX_EMAIL_LENGTH`; el DTO admite 170 pero el servicio lo rechaza antes de llegar a la columna). |

#### `tipo_correo_electronico`

| Atributo | Detalle |
|---|---|
| Nombre | `tipo_correo_electronico` |
| Tipo de dato | `nvarchar(30)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Clasificación del correo (PERSONAL o LABORAL). |
| Justificación | Distingue el uso del contacto. |
| Contenido | PERSONAL o LABORAL. |
| Origen | Formulario. |
| Momento inicial | En el INSERT (por defecto PERSONAL). |
| Modificación | «Editar». |
| Validaciones | DEFAULT N'PERSONAL'; Validado en Java (`contactType`); DEFAULT 'PERSONAL'. |

#### `es_principal`

| Atributo | Detalle |
|---|---|
| Nombre | `es_principal` |
| Tipo de dato | `bit` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Marca el correo principal de la persona. |
| Justificación | Cuando hay varios, uno solo es el canal preferente de contacto. |
| Contenido | 0/1. |
| Origen | Backend: el primero cargado es principal. |
| Momento inicial | En el INSERT. |
| Modificación | «Hacer principal»; al retirar el principal se promueve otro (preferentemente verificado). |
| Validaciones | CHECK `ck_correos_electronicos_baja`; DEFAULT 0; Índice único filtrado; CHECK de baja (un dado de baja no es principal). |

#### `fecha_creacion`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_creacion` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Registra el instante en que el correo se incorporó al sistema. |
| Justificación | Permite ordenar cronológicamente, reconstruir el historial y aportar trazabilidad sin depender de la auditoría. |
| Contenido | Fecha y hora (DATETIME2) de la inserción. |
| Origen | Automático: DEFAULT `SYSDATETIME()` de SQL Server o `@CreationTimestamp` de Hibernate (según la entidad); el usuario nunca ingresa esta fecha. |
| Momento inicial | En el INSERT. |
| Modificación | Inmutable: ningún flujo la actualiza (`updatable=false` en la entidad). |
| Validaciones | DEFAULT sysdatetime() |

#### `fecha_actualizacion`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_actualizacion` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Último cambio del contacto. |
| Justificación | Trazabilidad de ediciones. |
| Contenido | Fecha y hora. |
| Origen | `@PrePersist/@PreUpdate` de la entidad. |
| Momento inicial | En el INSERT. |
| Modificación | En cada UPDATE. |
| Validaciones | DEFAULT sysdatetime() |

#### `id_correos_electronicos`

| Atributo | Detalle |
|---|---|
| Nombre | `id_correos_electronicos` |
| Tipo de dato | `bigint` — IDENTITY(1,1) |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Clave primaria de la tabla: identifica de forma única cada fila y es el valor que otras tablas, la API y la auditoría usan para referirse a ella. |
| Justificación | Un identificador técnico numérico, estable y sin significado de negocio evita depender de datos que pueden cambiar (nombres, códigos) y hace eficientes los JOIN y las claves foráneas (decisión V24/V27: «toda tabla de aplicación tiene su propio id_<tabla> BIGINT IDENTITY»). |
| Contenido | Número entero positivo correlativo (1, 2, 3…). No lo ingresa el usuario. |
| Origen | SQL Server, columna IDENTITY(1,1): se asigna en el propio INSERT. Hibernate lo declara `@GeneratedValue(strategy = IDENTITY)` y lo lee de vuelta tras insertar. |
| Momento inicial | En el INSERT; no existe fila sin identificador. |
| Modificación | Nunca cambia (inmutable; JPA lo declara `updatable=false`). |
| Validaciones | PRIMARY KEY; PRIMARY KEY (unicidad y NOT NULL); no se reutiliza al borrar filas. |

#### `id_personas`

| Atributo | Detalle |
|---|---|
| Nombre | `id_personas` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Persona titular del correo. |
| Justificación | Los contactos pertenecen a la identidad, no a la cuenta. |
| Contenido | Identificador de `personas`. |
| Origen | Backend: la persona de la cuenta autenticada o creada. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `personas.id_personas` (borrado: NO ACTION); Índice único `uq_correos_electronicos_principal_por_persona` filtrado `es_principal=(1)`; Índice único `uq_correos_electronicos_vigente_por_persona` sobre (id_personas, direccion_normalizada) filtrado `fecha_baja IS NULL`; NOT NULL, FK. |

#### `direccion_normalizada`

| Atributo | Detalle |
|---|---|
| Nombre | `direccion_normalizada` |
| Tipo de dato | `nvarchar(150)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Forma canónica (minúsculas, sin espacios) para comparar. |
| Justificación | Impide duplicados que sólo difieren en mayúsculas; sirve de huella para saber si un código de verificación sigue correspondiendo a la dirección. |
| Contenido | `luis.gomez@example.org`. |
| Origen | `EmailContact.setDireccion` → `ContactNormalizer.email`. |
| Momento inicial | En el INSERT. |
| Modificación | Se recalcula si cambia la dirección. |
| Validaciones | Índice único `uq_correos_electronicos_vigente_por_persona` sobre (id_personas, direccion_normalizada) filtrado `fecha_baja IS NULL`; Parte del índice único vigente. Poblada por V49 en la migración. |

#### `version_contacto`

| Atributo | Detalle |
|---|---|
| Nombre | `version_contacto` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Contador de edición del contacto. |
| Justificación | Control de concurrencia optimista: si dos pestañas editan el mismo contacto, la segunda recibe 409. |
| Contenido | Entero. |
| Origen | Hibernate (`@Version`). |
| Momento inicial | 0 en el INSERT. |
| Modificación | +1 en cada UPDATE. |
| Validaciones | DEFAULT 0; La API exige enviar la versión vigente. |

#### `fecha_baja`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_baja` |
| Tipo de dato | `datetime2(7)` |
| Nulabilidad | **Permite NULL.** NULL mientras el contacto está vigente. Lo completa el titular al retirarlo (o la migración V49 para duplicados). |
| Función | Momento del retiro del contacto. |
| Justificación | Baja lógica: el valor deja de estar vigente pero se conserva. |
| Contenido | Fecha y hora. |
| Origen | Backend (`darDeBaja`). |
| Momento inicial | NULL. |
| Modificación | Al retirarlo. |
| Validaciones | CHECK `ck_correos_electronicos_baja`; CHECK de baja. |

#### `id_usuario_baja`

| Atributo | Detalle |
|---|---|
| Nombre | `id_usuario_baja` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** NULL si no está dado de baja o si la baja fue de migración. |
| Función | Usuario que retiró el contacto. |
| Justificación | Responsabilidad del retiro. |
| Contenido | Identificador de `usuarios`. |
| Origen | Backend (usuario autenticado). |
| Momento inicial | NULL. |
| Modificación | Al retirarlo. |
| Validaciones | FOREIGN KEY → `usuarios.id_usuarios` (borrado: NO ACTION); CHECK `ck_correos_electronicos_baja`; CHECK: obligatorio si el motivo es RETIRO; NULL para DUPLICADO_MIGRACION. |

#### `motivo_baja`

| Atributo | Detalle |
|---|---|
| Nombre | `motivo_baja` |
| Tipo de dato | `nvarchar(30)` |
| Nulabilidad | **Permite NULL.** NULL si el contacto está vigente. |
| Función | Causa de la baja. |
| Justificación | Distingue retiro voluntario de limpieza de migración. |
| Contenido | RETIRO o DUPLICADO_MIGRACION. |
| Origen | Backend/migración. |
| Momento inicial | NULL. |
| Modificación | Al darlo de baja. |
| Validaciones | CHECK `ck_correos_electronicos_baja`; CHECK `ck_correos_electronicos_baja`. |

#### `fecha_verificacion`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_verificacion` |
| Tipo de dato | `datetime2(7)` |
| Nulabilidad | **Permite NULL.** NULL = sin verificar. Lo completa el titular al ingresar el código correcto de 6 dígitos. Los correos preexistentes a V54 no se marcaron como verificados porque no había evidencia. |
| Función | Instante en que el titular confirmó el código recibido en esa dirección. |
| Justificación | Prueba que alguien con acceso al buzón confirmó; habilita hacerlo principal. |
| Contenido | Fecha y hora. |
| Origen | `EmailVerificationService.confirmInTransaction`. |
| Momento inicial | NULL: todo correo nace sin verificar. |
| Modificación | Se completa al confirmar el código (no se vuelve a NULL salvo que el contacto se cambie de dirección, caso que exige crear otro). |
| Validaciones | — |

### D. Momento en que se crea un registro

**Escenario 1: El Administrador crea el usuario con sus correos**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | ADMINISTRADOR |
| Pantalla / componente y acción | «Nuevo usuario» (lista de correos). |
| Datos que aporta el usuario | Dirección y tipo (PERSONAL/LABORAL) de uno o más correos. |
| Endpoint | `POST /api/auth/users` |
| Servicio | `AuthService.saveContacts` |
| Validaciones y condiciones | Formato válido (`ContactNormalizer.emailProblem`); no repetir en la misma persona; si la persona ya existía sólo se agregan los que no tenía y sin disputar su principal. |
| Mecanismo que crea el registro | `emails.save(e)`. |
| Columnas completadas y de dónde sale cada valor | `id_personas`; `direccion` (como se ingresó); `direccion_normalizada` (minúsculas, calculada por `setDireccion`); `tipo_correo_electronico`; `es_principal` = verdadero para el primero; `version_contacto`=0; fechas por `@PrePersist`. |
| Columnas que quedan NULL o con valor predeterminado | `fecha_verificacion`, `fecha_baja`, `id_usuario_baja`, `motivo_baja` (el correo nace sin verificar). |
| Otros registros creados en la misma operación | Persona, cuenta, activación… |
| Si la operación falla / atomicidad | Atómico con el alta. |

**Escenario 2: El titular agrega un correo desde «Mi cuenta»**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | Cualquier usuario autenticado, sobre su propia persona |
| Pantalla / componente y acción | Mi cuenta → Correos → «Agregar» ([`MyContacts`](../../frontend-react/src/account.jsx)) |
| Datos que aporta el usuario | Dirección y tipo. |
| Endpoint | `POST /api/auth/me/correos` |
| Servicio | `PersonContactService.addEmail` |
| Validaciones y condiciones | Bloquea la fila de la persona; no repetir un valor vigente; es principal sólo si no hay otros vigentes. |
| Mecanismo que crea el registro | `emails.saveAndFlush(e)`. |
| Columnas completadas y de dónde sale cada valor | Como el escenario 1. |
| Columnas que quedan NULL o con valor predeterminado | Verificación y baja. |
| Otros registros creados en la misma operación | Evento `PERSON_EMAIL/CREATE` con la dirección enmascarada. |
| Si la operación falla / atomicidad | Transacción propia. |

**Escenario 3: Administrador inicial**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | Arranque |
| Pantalla / componente y acción | — |
| Datos que aporta el usuario | — |
| Endpoint | — |
| Servicio | `createBootstrapAdmin` |
| Validaciones y condiciones | — |
| Mecanismo que crea el registro | `emails.save(e)` con `setPrincipal(true)`. |
| Columnas completadas y de dónde sale cada valor | dirección ← propiedad de entorno. |
| Columnas que quedan NULL o con valor predeterminado | Idem. |
| Otros registros creados en la misma operación | — |
| Si la operación falla / atomicidad | Propia. |

**Escenario 4: Migración**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | Flyway V11/V49 |
| Pantalla / componente y acción | — |
| Datos que aporta el usuario | — |
| Endpoint | — |
| Servicio | V11 copió `usuarios.correo_electronico`; V49 normalizó |
| Validaciones y condiciones | — |
| Mecanismo que crea el registro | INSERT…SELECT. |
| Columnas completadas y de dónde sale cada valor | — |
| Columnas que quedan NULL o con valor predeterminado | — |
| Otros registros creados en la misma operación | — |
| Si la operación falla / atomicidad | Todo o nada. |

### E. Ejemplo funcional completo

**Situación (ficticia):** Luis agrega y verifica un segundo correo.

1. En *Mi cuenta → Correos* escribe `luis.gomez@example.org`, tipo LABORAL y pulsa **Agregar** (`POST /api/auth/me/correos`).
2. Se inserta:

| id_correos_electronicos | id_personas | direccion | direccion_normalizada | tipo | es_principal | version_contacto | fecha_verificacion | fecha_baja |
|---|---|---|---|---|---|---|---|---|
| 9001 | 101 | Luis.Gomez@Example.org | luis.gomez@example.org | LABORAL | 0 | 0 | NULL | NULL |

3. Pide el código (`POST …/verificacion`): se crea una fila en `verificaciones_correo` y se envía el correo. Ingresa los 6 dígitos (`…/verificacion/confirmar`): `fecha_verificacion` queda con la fecha; **recién ahora** puede hacerlo principal (`POST …/principal`).
4. Si lo retira (`DELETE`), se completa `fecha_baja`, `id_usuario_baja` y `motivo_baja`='RETIRO', `es_principal`=0, y otro correo pasa a principal si correspondía. La fila no se borra.

### F. Ciclo de vida del registro

| Transición | Acción | Actor | Campos | Validaciones / efectos |
|---|---|---|---|---|
| Alta | Agregar/crear usuario | Admin / titular | INSERT | nace sin verificar |
| Edición | «Editar» | Titular | `direccion`, `direccion_normalizada`, `tipo_correo_electronico`, `version_contacto`, `fecha_actualizacion` | un correo verificado no se reemplaza en el lugar; cambiar la dirección invalida el código abierto |
| Verificación | «Confirmar código» | Titular | `fecha_verificacion` | código correcto, vigente, ≤ 5 intentos |
| Hacerlo principal | «Hacer principal» | Titular | `es_principal` (dos filas) | sólo si está verificado |
| Baja lógica | «Quitar» | Titular | `fecha_baja`, `id_usuario_baja`, `motivo_baja`='RETIRO', `es_principal`=0 | siempre debe quedar ≥ 1 correo vigente; no retirar el único verificado |
| Baja de migración | V49 | Migración | `motivo_baja`='DUPLICADO_MIGRACION', sin usuario | duplicados vigentes de una persona |

### G. Relaciones con otras tablas

**Clave primaria:** `id_correos_electronicos`.

**Claves foráneas salientes (tabla hija → padre):**

| Columna | Referencia | Borrado | Obligatoria |
|---|---|---|---|
| `id_personas` | `personas.id_personas` (`fk_correos_electronicos_id_personas`) | NO ACTION | Obligatoria |
| `id_usuario_baja` | `usuarios.id_usuarios` (`fk_correos_electronicos_usuario_baja`) | NO ACTION | Opcional (NULL) |

**Claves foráneas entrantes (tablas hijas):** `verificaciones_correo`(id_correos_electronicos).

FK `id_personas` (obligatoria) y `id_usuario_baja` (opcional) → `usuarios`. La FK entrante desde `verificaciones_correo` liga cada código con el correo exacto. Un contacto retirado sigue referenciando a su persona.

### H. Restricciones y decisiones de diseño

**Índices (no PK):**

| Índice | Único | Columnas | Filtro | Incluye |
|---|---|---|---|---|
| `idx_correos_electronicos_id_personas` | no | id_personas | — | — |
| `idx_correos_electronicos_id_usuario_baja` | no | id_usuario_baja | `id_usuario_baja IS NOT NULL` | — |
| `idx_correos_electronicos_persona_id` | no | id_personas | — | — |
| `uq_correos_electronicos_principal_por_persona` | sí | id_personas | `es_principal=(1)` | — |
| `uq_correos_electronicos_vigente_por_persona` | sí | id_personas, direccion_normalizada | `fecha_baja IS NULL` | — |

**Restricciones CHECK:** 

- `ck_correos_electronicos_baja`: `(fecha_baja IS NULL AND id_usuario_baja IS NULL AND motivo_baja IS NULL OR fecha_baja IS NOT NULL AND es_principal=(0) AND (motivo_baja=N'RETIRO' AND id_usuario_baja IS NOT NULL OR motivo_baja=N'DUPLICADO_MIGRACION' AND id_usuario_baja IS NULL))`
- `ck_correos_electronicos_direccion`: `(len(ltrim(rtrim(direccion)))>(2))`

**Triggers:** ninguno.

**DEFAULT / IDENTITY / nulabilidad:** ver la ficha de cada columna en la sección C (los DEFAULT figuran en «Validaciones»).

- **`uq_correos_electronicos_vigente_por_persona` (V49):** un mismo valor normalizado vigente una sola vez por persona. No se impone entre personas (varias pueden compartir un correo; una restricción global revelaría si un valor ya pertenece a otra persona).
- **`uq_correos_electronicos_principal_por_persona`:** a lo sumo un principal por persona (V11); V50 promovió uno en las personas que tenían contactos pero ninguno principal.
- **CHECK `ck_correos_electronicos_baja`:** coherencia de baja (fecha+motivo+actor; el principal no puede estar de baja).
- **`version_contacto` (@Version):** detecta ediciones simultáneas.

### I. Evidencia de implementación

- [`V11 (creación)`](../../backend-java/src/main/resources/db/migration/V11__cuentas_contactos_y_activaciones.sql#L2)
- [`V49 (baja lógica y unicidad)`](../../backend-java/src/main/resources/db/migration/V49__contactos_personales_baja_logica_y_unicidad.sql#L72)
- [`V54 (verificación)`](../../backend-java/src/main/resources/db/migration/V54__verificacion_correos_y_telefonos_internacionales.sql#L2)
- [`Entidad EmailContact`](../../backend-java/src/main/java/com/vuelossanitarios/backend/domain/person/EmailContact.java#L8)
- [`PersonContactService.addEmail`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/PersonContactService.java#L53)
- [`AuthService.saveContacts`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/AuthService.java#L163)
- [`Endpoints /me/correos`](../../backend-java/src/main/java/com/vuelossanitarios/backend/api/AuthController.java#L24)
- [`Pantalla Mi cuenta`](../../frontend-react/src/account.jsx#L153)
- [`Prueba: PersonContactIntegrationTest`](../../backend-java/src/test/java/com/vuelossanitarios/backend/api/PersonContactIntegrationTest.java#L46)

---

## 8. Tabla `telefonos`

### A. Identificación de la tabla

| Atributo | Detalle |
|---|---|
| Nombre exacto y esquema | `dbo.telefonos` (esquema `dbo`) |
| Módulo funcional | 1. Identidad, cuentas y contactos |
| Tipo de tabla | Dependiente de personas — contactos telefónicos con baja lógica |
| Migración que la creó | V11 |
| Migraciones posteriores que modificaron su estructura | V8/V24/V27/V28 (renombres), V49 (normalizado, versión, baja lógica), V54 (codigo_pais y formato E.164) |
| Estado actual en el esquema | Vigente — 13 columnas, PK `id_telefonos`, 2 FK salientes, 0 FK entrantes, 2 índice(s) único(s), 3 CHECK, 0 trigger(s) (verificado contra `sys.*` de la base E2E en Flyway V62) |
| Tablas relacionadas | personas, usuarios (baja) |

### B. Funcionalidad y justificación

Guarda los **teléfonos de una persona** (cuenta o paciente): número tal como se muestra, su forma internacional canónica (E.164), el país con cuyas reglas se validó y si es el principal. Los teléfonos de un *traslado sanitario* (familiares, establecimientos) no van aquí sino en `contactos_coordinacion_traslado`.

Validar el formato no equivale a verificar la línea: no hay verificación por SMS.

**Por qué es una tabla independiente.** Igual que los correos: varios por persona, un principal, baja lógica y unicidad vigente. Se separó de `personas` en V11.

**Qué dejaría de funcionar sin ella.** No habría contacto telefónico de usuarios; el alta de usuarios (que exige al menos un teléfono) no podría completarse.

### C. Descripción campo por campo

#### `numero`

| Atributo | Detalle |
|---|---|
| Nombre | `numero` |
| Tipo de dato | `nvarchar(30)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Número en formato internacional legible. |
| Justificación | Es lo que ve la persona. |
| Contenido | p. ej. `+54 381 555-1234`. |
| Origen | `PhoneNumbers.parse` (internacional). |
| Momento inicial | En el INSERT. |
| Modificación | «Editar». |
| Validaciones | CHECK `ck_telefonos_numero`; CHECK de longitud útil; validación por país. |

#### `tipo_telefono`

| Atributo | Detalle |
|---|---|
| Nombre | `tipo_telefono` |
| Tipo de dato | `nvarchar(30)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Uso del teléfono (PERSONAL/LABORAL). |
| Justificación | Distinguir canales. |
| Contenido | PERSONAL o LABORAL. |
| Origen | Formulario. |
| Momento inicial | En el INSERT (DEFAULT 'PERSONAL'). |
| Modificación | «Editar». |
| Validaciones | DEFAULT N'PERSONAL'; Validado en Java. |

#### `es_principal`

| Atributo | Detalle |
|---|---|
| Nombre | `es_principal` |
| Tipo de dato | `bit` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Teléfono principal de la persona. |
| Justificación | Un canal preferente único. |
| Contenido | 0/1. |
| Origen | Backend. |
| Momento inicial | En el INSERT. |
| Modificación | «Hacer principal»; promoción al retirar el principal. |
| Validaciones | CHECK `ck_telefonos_baja`; DEFAULT 0; Índice único filtrado. |

#### `fecha_creacion`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_creacion` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Registra el instante en que el teléfono se incorporó al sistema. |
| Justificación | Permite ordenar cronológicamente, reconstruir el historial y aportar trazabilidad sin depender de la auditoría. |
| Contenido | Fecha y hora (DATETIME2) de la inserción. |
| Origen | Automático: DEFAULT `SYSDATETIME()` de SQL Server o `@CreationTimestamp` de Hibernate (según la entidad); el usuario nunca ingresa esta fecha. |
| Momento inicial | En el INSERT. |
| Modificación | Inmutable: ningún flujo la actualiza (`updatable=false` en la entidad). |
| Validaciones | DEFAULT sysdatetime() |

#### `fecha_actualizacion`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_actualizacion` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Último cambio del contacto. |
| Justificación | Trazabilidad. |
| Contenido | Fecha y hora. |
| Origen | `@PrePersist/@PreUpdate`. |
| Momento inicial | En el INSERT. |
| Modificación | En cada UPDATE. |
| Validaciones | DEFAULT sysdatetime() |

#### `id_telefonos`

| Atributo | Detalle |
|---|---|
| Nombre | `id_telefonos` |
| Tipo de dato | `bigint` — IDENTITY(1,1) |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Clave primaria de la tabla: identifica de forma única cada fila y es el valor que otras tablas, la API y la auditoría usan para referirse a ella. |
| Justificación | Un identificador técnico numérico, estable y sin significado de negocio evita depender de datos que pueden cambiar (nombres, códigos) y hace eficientes los JOIN y las claves foráneas (decisión V24/V27: «toda tabla de aplicación tiene su propio id_<tabla> BIGINT IDENTITY»). |
| Contenido | Número entero positivo correlativo (1, 2, 3…). No lo ingresa el usuario. |
| Origen | SQL Server, columna IDENTITY(1,1): se asigna en el propio INSERT. Hibernate lo declara `@GeneratedValue(strategy = IDENTITY)` y lo lee de vuelta tras insertar. |
| Momento inicial | En el INSERT; no existe fila sin identificador. |
| Modificación | Nunca cambia (inmutable; JPA lo declara `updatable=false`). |
| Validaciones | PRIMARY KEY; PRIMARY KEY (unicidad y NOT NULL); no se reutiliza al borrar filas. |

#### `id_personas`

| Atributo | Detalle |
|---|---|
| Nombre | `id_personas` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Persona titular. |
| Justificación | Los contactos pertenecen a la persona. |
| Contenido | Identificador de `personas`. |
| Origen | Backend. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `personas.id_personas` (borrado: NO ACTION); Índice único `uq_telefonos_principal_por_persona` filtrado `es_principal=(1)`; Índice único `uq_telefonos_vigente_por_persona` sobre (id_personas, numero_normalizado) filtrado `fecha_baja IS NULL`; NOT NULL, FK. |

#### `numero_normalizado`

| Atributo | Detalle |
|---|---|
| Nombre | `numero_normalizado` |
| Tipo de dato | `nvarchar(30)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Número en E.164 (+, país y dígitos). |
| Justificación | Dos grafías del mismo número chocan con el índice único vigente. |
| Contenido | p. ej. `+543815551234`. |
| Origen | `PhoneNumbers.parse`. |
| Momento inicial | En el INSERT. |
| Modificación | Se recalcula al editar. |
| Validaciones | Índice único `uq_telefonos_vigente_por_persona` sobre (id_personas, numero_normalizado) filtrado `fecha_baja IS NULL`; CHECK `ck_telefonos_validacion_internacional`; CHECK de formato E.164 cuando hay país; parte del índice único vigente. |

#### `version_contacto`

| Atributo | Detalle |
|---|---|
| Nombre | `version_contacto` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Contador de edición. |
| Justificación | Control de concurrencia optimista. |
| Contenido | Entero. |
| Origen | Hibernate (`@Version`). |
| Momento inicial | 0. |
| Modificación | +1 por UPDATE. |
| Validaciones | DEFAULT 0; La API exige la versión vigente. |

#### `fecha_baja`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_baja` |
| Tipo de dato | `datetime2(7)` |
| Nulabilidad | **Permite NULL.** NULL mientras el teléfono está vigente. |
| Función | Momento del retiro. |
| Justificación | Baja lógica. |
| Contenido | Fecha y hora. |
| Origen | `darDeBaja`. |
| Momento inicial | NULL. |
| Modificación | Al retirar. |
| Validaciones | CHECK `ck_telefonos_baja`; CHECK de baja. |

#### `id_usuario_baja`

| Atributo | Detalle |
|---|---|
| Nombre | `id_usuario_baja` |
| Tipo de dato | `bigint` |
| Nulabilidad | **Permite NULL.** NULL si vigente o baja de migración. |
| Función | Usuario que retiró el contacto. |
| Justificación | Responsabilidad. |
| Contenido | Identificador de `usuarios`. |
| Origen | Backend. |
| Momento inicial | NULL. |
| Modificación | Al retirar. |
| Validaciones | FOREIGN KEY → `usuarios.id_usuarios` (borrado: NO ACTION); CHECK `ck_telefonos_baja`; CHECK: obligatorio si RETIRO. |

#### `motivo_baja`

| Atributo | Detalle |
|---|---|
| Nombre | `motivo_baja` |
| Tipo de dato | `nvarchar(30)` |
| Nulabilidad | **Permite NULL.** NULL si vigente. |
| Función | Causa de la baja. |
| Justificación | Distinguir retiro y limpieza. |
| Contenido | RETIRO o DUPLICADO_MIGRACION. |
| Origen | Backend/migración. |
| Momento inicial | NULL. |
| Modificación | Al dar de baja. |
| Validaciones | CHECK `ck_telefonos_baja`; CHECK `ck_telefonos_baja`. |

#### `codigo_pais`

| Atributo | Detalle |
|---|---|
| Nombre | `codigo_pais` |
| Tipo de dato | `varchar(2)` |
| Nulabilidad | **Permite NULL.** NULL en los teléfonos anteriores a V54: se conservan tal cual y quedan «pendientes de validar» hasta que su titular los edite indicando el país. |
| Función | País (ISO 3166-1 alfa-2) con cuyas reglas se validó el número. |
| Justificación | El mismo «3815551234» no identifica un país; sin el país no puede validarse de forma confiable. |
| Contenido | Dos letras mayúsculas (p. ej. AR). |
| Origen | El usuario elige el país en el formulario. |
| Momento inicial | En el INSERT de teléfonos nuevos. |
| Modificación | Al editar el teléfono. |
| Validaciones | CHECK `ck_telefonos_validacion_internacional`; CHECK de formato. |

### D. Momento en que se crea un registro

**Escenario 1: Alta de usuario con teléfonos**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | ADMINISTRADOR |
| Pantalla / componente y acción | «Nuevo usuario» (lista de teléfonos con país). |
| Datos que aporta el usuario | Número, país (código ISO de 2 letras) y tipo. |
| Endpoint | `POST /api/auth/users` |
| Servicio | `AuthService.saveContacts` + `PhoneNumbers.parse` |
| Validaciones y condiciones | Número válido según las reglas del país (librería de numeración); error 400 `CONTACT_INVALID` con el motivo. |
| Mecanismo que crea el registro | `phones.save(ph)`. |
| Columnas completadas y de dónde sale cada valor | `id_personas`; `numero` ← formato internacional; `numero_normalizado` ← E.164 (+54…); `codigo_pais` ← región validada; `tipo_telefono`; `es_principal` (primero); `version_contacto`=0; fechas. |
| Columnas que quedan NULL o con valor predeterminado | `fecha_baja`, `id_usuario_baja`, `motivo_baja`. |
| Otros registros creados en la misma operación | Cuenta, persona, correos, activación. |
| Si la operación falla / atomicidad | Atómico con el alta. |

**Escenario 2: El titular agrega un teléfono**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | Usuario autenticado sobre su persona |
| Pantalla / componente y acción | Mi cuenta → Teléfonos → «Agregar». |
| Datos que aporta el usuario | Número, país, tipo. |
| Endpoint | `POST /api/auth/me/telefonos` |
| Servicio | `PersonContactService.addPhone` |
| Validaciones y condiciones | Como arriba + sin duplicado vigente (E.164). |
| Mecanismo que crea el registro | `phones.saveAndFlush`. |
| Columnas completadas y de dónde sale cada valor | Idem. |
| Columnas que quedan NULL o con valor predeterminado | Baja. |
| Otros registros creados en la misma operación | Auditoría `PERSON_PHONE/CREATE` (número enmascarado). |
| Si la operación falla / atomicidad | Propia. |

**Escenario 3: Migración**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | Flyway V11/V49 |
| Pantalla / componente y acción | — |
| Datos que aporta el usuario | — |
| Endpoint | — |
| Servicio | V11 copió `personas.telefono` |
| Validaciones y condiciones | — |
| Mecanismo que crea el registro | INSERT…SELECT. |
| Columnas completadas y de dónde sale cada valor | — |
| Columnas que quedan NULL o con valor predeterminado | `codigo_pais` NULL en datos previos a V54. |
| Otros registros creados en la misma operación | — |
| Si la operación falla / atomicidad | — |

### E. Ejemplo funcional completo

**Situación:** Luis agrega «+54 381 555-1234» (Argentina).

| id_telefonos | id_personas | numero | numero_normalizado | codigo_pais | tipo_telefono | es_principal | version_contacto | fecha_baja |
|---|---|---|---|---|---|---|---|---|
| 8001 | 101 | +54 381 555-1234 | +543815551234 | AR | PERSONAL | 1 | 0 | NULL |

Al editarlo con otro país o formato se revalida y se incrementa `version_contacto`; al retirarlo se completan los tres campos de baja (nunca el último vigente: siempre debe quedar al menos un teléfono).

### F. Ciclo de vida del registro

| Transición | Acción | Actor | Campos | Efecto |
|---|---|---|---|---|
| Alta | Agregar / crear usuario | Admin / titular | INSERT | — |
| Edición | «Editar» | Titular | `numero`, `numero_normalizado`, `codigo_pais`, `tipo_telefono`, `version_contacto` | revalida con el país |
| Principal | «Hacer principal» | Titular | `es_principal` | intercambio atómico |
| Baja | «Quitar» | Titular | baja lógica | no el último vigente |

### G. Relaciones con otras tablas

**Clave primaria:** `id_telefonos`.

**Claves foráneas salientes (tabla hija → padre):**

| Columna | Referencia | Borrado | Obligatoria |
|---|---|---|---|
| `id_personas` | `personas.id_personas` (`fk_telefonos_id_personas`) | NO ACTION | Obligatoria |
| `id_usuario_baja` | `usuarios.id_usuarios` (`fk_telefonos_usuario_baja`) | NO ACTION | Opcional (NULL) |

**Claves foráneas entrantes:** ninguna.

FK `id_personas` obligatoria, `id_usuario_baja` opcional (→ `usuarios`). Sin cascada.

### H. Restricciones y decisiones de diseño

**Índices (no PK):**

| Índice | Único | Columnas | Filtro | Incluye |
|---|---|---|---|---|
| `idx_telefonos_id_personas` | no | id_personas | — | — |
| `idx_telefonos_id_usuario_baja` | no | id_usuario_baja | `id_usuario_baja IS NOT NULL` | — |
| `idx_telefonos_persona_id` | no | id_personas | — | — |
| `uq_telefonos_principal_por_persona` | sí | id_personas | `es_principal=(1)` | — |
| `uq_telefonos_vigente_por_persona` | sí | id_personas, numero_normalizado | `fecha_baja IS NULL` | — |

**Restricciones CHECK:** 

- `ck_telefonos_baja`: `(fecha_baja IS NULL AND id_usuario_baja IS NULL AND motivo_baja IS NULL OR fecha_baja IS NOT NULL AND es_principal=(0) AND (motivo_baja=N'RETIRO' AND id_usuario_baja IS NOT NULL OR motivo_baja=N'DUPLICADO_MIGRACION' AND id_usuario_baja IS NULL))`
- `ck_telefonos_numero`: `(len(ltrim(rtrim(numero)))>(2))`
- `ck_telefonos_validacion_internacional`: `(codigo_pais IS NULL OR len(codigo_pais)=(2) AND NOT (codigo_pais) collate Latin1_General_BIN2 like N'%^A-Z%' AND numero_normalizado like N'+1-9%' AND NOT substring(numero_normalizado,(2),(30)) like N'%^0-9%' AND (len(numero_normalizado)>=(8) AND len(numero_normalizado)<=(16)))`

**Triggers:** ninguno.

**DEFAULT / IDENTITY / nulabilidad:** ver la ficha de cada columna en la sección C (los DEFAULT figuran en «Validaciones»).

- Unicidad vigente y principal únicos (V49/V11), igual que los correos.
- **CHECK `ck_telefonos_validacion_internacional` (V54):** país en mayúsculas ASCII y número E.164 coherente cuando hay país; un teléfono sin país es un dato anterior pendiente de validar (no se adivina el país).
- **Observación:** no existe verificación por SMS; la validación es sólo de formato.

### I. Evidencia de implementación

- [`V11 (creación)`](../../backend-java/src/main/resources/db/migration/V11__cuentas_contactos_y_activaciones.sql#L13)
- [`V54 (E.164)`](../../backend-java/src/main/resources/db/migration/V54__verificacion_correos_y_telefonos_internacionales.sql#L19)
- [`Entidad PhoneContact`](../../backend-java/src/main/java/com/vuelossanitarios/backend/domain/person/PhoneContact.java#L8)
- [`PersonContactService.addPhone`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/PersonContactService.java#L109)
- [`Validación de números`](../../backend-java/src/main/java/com/vuelossanitarios/backend/domain/person/PhoneNumbers.java#L53)
- [`Pantalla Mi cuenta`](../../frontend-react/src/account.jsx#L153)
- [`Prueba: PhoneInternationalIntegrationTest`](../../backend-java/src/test/java/com/vuelossanitarios/backend/api/PhoneInternationalIntegrationTest.java#L47)

---

## 9. Tabla `verificaciones_correo`

### A. Identificación de la tabla

| Atributo | Detalle |
|---|---|
| Nombre exacto y esquema | `dbo.verificaciones_correo` (esquema `dbo`) |
| Módulo funcional | 1. Identidad, cuentas y contactos |
| Tipo de tabla | Auxiliar — OTP de verificación de correo (persistente) |
| Migración que la creó | V54 |
| Migraciones posteriores que modificaron su estructura | V61 (OTP decimal, origen_huella, máximo 5 intentos) |
| Estado actual en el esquema | Vigente — 13 columnas, PK `id_verificaciones_correo`, 2 FK salientes, 0 FK entrantes, 1 índice(s) único(s), 3 CHECK, 0 trigger(s) (verificado contra `sys.*` de la base E2E en Flyway V62) |
| Tablas relacionadas | correos_electronicos, usuarios |

### B. Funcionalidad y justificación

Cada fila es **un código de un solo uso** enviado a una dirección de correo para demostrar que su titular tiene acceso a ella. Guarda sólo el HMAC del código, la dirección a la que se envió, cuándo se creó, venció, se envió, se usó o se invalidó (y por qué), cuántos intentos erróneos hubo y una huella del origen de red para limitar abusos.

Sobrevive a un reinicio del backend (por eso es una tabla y no memoria).

**Por qué es una tabla independiente.** Un correo tiene muchas verificaciones a lo largo del tiempo (reenvíos, vencimientos) pero una sola abierta; guardarlas aparte conserva el historial y permite aplicar límites de envío por correo, usuario y origen.

**Qué dejaría de funcionar sin ella.** No podrían verificarse correos ni habilitarse un correo como principal; los límites de reenvío serían imposibles de aplicar entre reinicios.

### C. Descripción campo por campo

#### `id_verificaciones_correo`

| Atributo | Detalle |
|---|---|
| Nombre | `id_verificaciones_correo` |
| Tipo de dato | `bigint` — IDENTITY(1,1) |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Clave primaria de la tabla: identifica de forma única cada fila y es el valor que otras tablas, la API y la auditoría usan para referirse a ella. |
| Justificación | Un identificador técnico numérico, estable y sin significado de negocio evita depender de datos que pueden cambiar (nombres, códigos) y hace eficientes los JOIN y las claves foráneas (decisión V24/V27: «toda tabla de aplicación tiene su propio id_<tabla> BIGINT IDENTITY»). |
| Contenido | Número entero positivo correlativo (1, 2, 3…). No lo ingresa el usuario. |
| Origen | SQL Server, columna IDENTITY(1,1): se asigna en el propio INSERT. Hibernate lo declara `@GeneratedValue(strategy = IDENTITY)` y lo lee de vuelta tras insertar. |
| Momento inicial | En el INSERT; no existe fila sin identificador. |
| Modificación | Nunca cambia (inmutable; JPA lo declara `updatable=false`). |
| Validaciones | PRIMARY KEY; PRIMARY KEY (unicidad y NOT NULL); no se reutiliza al borrar filas. |

#### `id_correos_electronicos`

| Atributo | Detalle |
|---|---|
| Nombre | `id_correos_electronicos` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Correo que se está verificando. |
| Justificación | Liga el código con el contacto exacto. |
| Contenido | Identificador de `correos_electronicos`. |
| Origen | Backend. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `correos_electronicos.id_correos_electronicos` (borrado: NO ACTION); Índice único `uq_verificaciones_correo_abierta` filtrado `fecha_uso IS NULL AND fecha_invalidacion IS NULL`; NOT NULL, FK. |

#### `direccion_normalizada`

| Atributo | Detalle |
|---|---|
| Nombre | `direccion_normalizada` |
| Tipo de dato | `nvarchar(150)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Dirección a la que se envió el código. |
| Justificación | Si el correo cambia, el código deja de servir; guardar la dirección permite detectarlo. |
| Contenido | Correo en minúsculas. |
| Origen | Copia de `correos_electronicos.direccion_normalizada`. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | NOT NULL. |

#### `codigo_hash`

| Atributo | Detalle |
|---|---|
| Nombre | `codigo_hash` |
| Tipo de dato | `varchar(64)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | HMAC del código enviado. |
| Justificación | El código no se almacena; el HMAC está ligado al id del correo y a la dirección, de modo que no sirve para otro contacto. |
| Contenido | 64 caracteres hexadecimales. |
| Origen | `EmailVerificationService.hash`. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | NOT NULL; comparación en tiempo constante. |

#### `intentos_fallidos`

| Atributo | Detalle |
|---|---|
| Nombre | `intentos_fallidos` |
| Tipo de dato | `tinyint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Cantidad de códigos erróneos. |
| Justificación | Frena la adivinación del OTP de 6 dígitos. |
| Contenido | 0 a 5. |
| Origen | Backend. |
| Momento inicial | 0. |
| Modificación | +1 por error. |
| Validaciones | CHECK `ck_verificaciones_correo_intentos`; DEFAULT 0; CHECK ≤ 5 salvo filas cerradas; DEFAULT 0. |

#### `fecha_creacion`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_creacion` |
| Tipo de dato | `datetime2(7)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Instante de emisión. |
| Justificación | Base del vencimiento y de los límites de envío. |
| Contenido | Fecha y hora (hora de negocio). |
| Origen | Backend. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | CHECK `ck_verificaciones_correo_vigencia`; — |

#### `fecha_vencimiento`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_vencimiento` |
| Tipo de dato | `datetime2(7)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Instante límite de validez. |
| Justificación | Limita la ventana del OTP (10 minutos). |
| Contenido | Creación + 10 min. |
| Origen | Backend. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | CHECK `ck_verificaciones_correo_vigencia`; CHECK vencimiento > creación. |

#### `fecha_envio`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_envio` |
| Tipo de dato | `datetime2(7)` |
| Nulabilidad | **Permite NULL.** NULL entre el INSERT y la respuesta del SMTP, o para siempre si el envío falló (en ese caso la fila se invalida con ENVIO_FALLIDO). |
| Función | Momento en que el servidor SMTP aceptó el mensaje. |
| Justificación | Distingue «aceptado por SMTP» de «no enviado»; no prueba la entrega. |
| Contenido | Fecha y hora. |
| Origen | Backend tras el envío. |
| Momento inicial | NULL. |
| Modificación | Se completa tras enviar (segunda transacción). |
| Validaciones | — |

#### `fecha_uso`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_uso` |
| Tipo de dato | `datetime2(7)` |
| Nulabilidad | **Permite NULL.** NULL mientras el código esté abierto o si se invalidó. |
| Función | Momento en que se ingresó el código correcto. |
| Justificación | Cierra la verificación con éxito. |
| Contenido | Fecha y hora. |
| Origen | Backend. |
| Momento inicial | NULL. |
| Modificación | Al confirmar. |
| Validaciones | CHECK `ck_verificaciones_correo_cierre`; CHECK de cierre: no coexiste con invalidación. |

#### `fecha_invalidacion`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_invalidacion` |
| Tipo de dato | `datetime2(7)` |
| Nulabilidad | **Permite NULL.** NULL mientras el código esté abierto o si se usó. |
| Función | Momento en que el código se anuló sin usarse. |
| Justificación | Permite cerrar códigos sin borrarlos. |
| Contenido | Fecha y hora. |
| Origen | Backend. |
| Momento inicial | NULL. |
| Modificación | Al reemplazar, vencer, agotar, cambiar o retirar el correo, o fallar el envío. |
| Validaciones | CHECK `ck_verificaciones_correo_cierre`; CHECK `ck_verificaciones_correo_intentos`; CHECK `ck_verificaciones_correo_cierre`. |

#### `motivo_invalidacion`

| Atributo | Detalle |
|---|---|
| Nombre | `motivo_invalidacion` |
| Tipo de dato | `nvarchar(30)` |
| Nulabilidad | **Permite NULL.** Sólo se completa cuando el código se invalida. |
| Función | Causa de la anulación. |
| Justificación | Auditoría y diagnóstico (p. ej. envío fallido). |
| Contenido | REEMPLAZADO, VENCIDO, AGOTADO, CORREO_MODIFICADO, CORREO_RETIRADO, ENVIO_FALLIDO o CORREO_VERIFICADO. |
| Origen | Backend. |
| Momento inicial | NULL. |
| Modificación | Junto con `fecha_invalidacion`. |
| Validaciones | CHECK `ck_verificaciones_correo_cierre`; CHECK de conjunto cerrado. |

#### `id_usuario_solicitante`

| Atributo | Detalle |
|---|---|
| Nombre | `id_usuario_solicitante` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Usuario que pidió el código. |
| Justificación | Límites por usuario y trazabilidad. |
| Contenido | Identificador de `usuarios`. |
| Origen | Backend. |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `usuarios.id_usuarios` (borrado: NO ACTION); NOT NULL, FK; índice por (usuario, fecha). |

#### `origen_huella`

| Atributo | Detalle |
|---|---|
| Nombre | `origen_huella` |
| Tipo de dato | `varchar(64)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Huella HMAC del origen de red directo. |
| Justificación | Permite limitar envíos por origen sin guardar la IP en claro ni confiar en cabeceras falsificables (V61). |
| Contenido | 64 caracteres hexadecimales o «LEGACY» para filas anteriores. |
| Origen | Backend (`originFingerprint`). |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | DEFAULT 'LEGACY'; DEFAULT 'LEGACY'. |

### D. Momento en que se crea un registro

**Escenario 1: El titular pide el código de verificación**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | Usuario autenticado, sobre un correo propio |
| Pantalla / componente y acción | Mi cuenta → Correos → solicitar verificación (botón de verificación/reenvío) en [`account.jsx`](../../frontend-react/src/account.jsx). |
| Datos que aporta el usuario | El correo elegido. |
| Endpoint | `POST /api/auth/me/correos/{id}/verificacion` |
| Servicio | `EmailVerificationService.issue` → `prepare` (transacción) y envío SMTP **fuera** de la transacción |
| Validaciones y condiciones | Correo propio, vigente y no verificado; SMTP configurado; límites: espera mínima entre reenvíos y máximos por correo, por usuario y por origen en 24 h; se reemplaza (invalida) el código abierto anterior. |
| Mecanismo que crea el registro | `verifications.saveAndFlush(v)`. |
| Columnas completadas y de dónde sale cada valor | `id_correos_electronicos`; `direccion_normalizada` ← la del correo en ese momento; `codigo_hash` ← HMAC de (correo, dirección, código); `intentos_fallidos`=0; `fecha_creacion` ← reloj de negocio; `fecha_vencimiento` = +10 min; `id_usuario_solicitante` ← usuario; `origen_huella` ← HMAC del origen de red directo. |
| Columnas que quedan NULL o con valor predeterminado | `fecha_envio`, `fecha_uso`, `fecha_invalidacion`, `motivo_invalidacion` (`fecha_envio` se completa tras enviar). |
| Otros registros creados en la misma operación | Eventos `VERIFY_REQUEST`/`VERIFY_RESEND` en auditoría; si hubo uno abierto, se lo invalida (UPDATE). |
| Si la operación falla / atomicidad | La fila se confirma antes del envío; si el envío falla se invalida con motivo `ENVIO_FALLIDO` en una segunda transacción, para no dejar un código que nadie recibió. |

### E. Ejemplo funcional completo

**Situación:** Luis verifica `luis.gomez@example.org` (correo 9001).

1. «Verificar» → fila nueva:

| id_verificaciones_correo | id_correos_electronicos | direccion_normalizada | intentos_fallidos | fecha_creacion | fecha_vencimiento | fecha_envio | fecha_uso | fecha_invalidacion | motivo_invalidacion |
|---|---|---|---|---|---|---|---|---|---|
| 500 | 9001 | luis.gomez@example.org | 0 | 11:00:00 | 11:10:00 | NULL → 11:00:02 | NULL | NULL | NULL |

2. Luis tipea un código erróneo: `intentos_fallidos`=1 (máximo 5; al 5.º se invalida con motivo AGOTADO).
3. Ingresa el correcto: `fecha_uso`=11:04 y, **en la misma transacción**, `correos_electronicos.fecha_verificacion`=11:04.
4. Si hubiera pedido otro código antes de usarlo, el anterior queda invalidado con motivo REEMPLAZADO.

### F. Ciclo de vida del registro

| Transición | Acción | Actor | Campos | Efecto |
|---|---|---|---|---|
| Emisión | Solicitar | Titular | INSERT | una abierta por correo |
| Envío | SMTP acepta | Sistema | `fecha_envio` | — |
| Intento fallido | Código erróneo | Titular | `intentos_fallidos` +1 | al 5.º → AGOTADO |
| Uso | Código correcto | Titular | `fecha_uso` | marca el correo como verificado |
| Invalidación | Reemplazo, vencimiento, agotamiento, cambio o retiro del correo, falla de envío | Sistema / titular | `fecha_invalidacion`, `motivo_invalidacion` | cierra la verificación |

### G. Relaciones con otras tablas

**Clave primaria:** `id_verificaciones_correo`.

**Claves foráneas salientes (tabla hija → padre):**

| Columna | Referencia | Borrado | Obligatoria |
|---|---|---|---|
| `id_correos_electronicos` | `correos_electronicos.id_correos_electronicos` (`fk_verificaciones_correo_correo`) | NO ACTION | Obligatoria |
| `id_usuario_solicitante` | `usuarios.id_usuarios` (`fk_verificaciones_correo_solicitante`) | NO ACTION | Obligatoria |

**Claves foráneas entrantes:** ninguna.

FK `id_correos_electronicos` → `correos_electronicos` (obligatoria, sin cascada) y `id_usuario_solicitante` → `usuarios` (obligatoria). Una verificación pertenece a un correo exacto y a una dirección concreta: si el correo cambia, el código deja de servir.

### H. Restricciones y decisiones de diseño

**Índices (no PK):**

| Índice | Único | Columnas | Filtro | Incluye |
|---|---|---|---|---|
| `idx_verificaciones_correo_correo_fecha` | no | id_correos_electronicos, fecha_creacion | — | — |
| `idx_verificaciones_correo_id_usuario_solicitante` | no | id_usuario_solicitante, fecha_creacion | — | — |
| `idx_verificaciones_correo_origen_fecha` | no | origen_huella, fecha_creacion | — | — |
| `uq_verificaciones_correo_abierta` | sí | id_correos_electronicos | `fecha_uso IS NULL AND fecha_invalidacion IS NULL` | — |

**Restricciones CHECK:** 

- `ck_verificaciones_correo_cierre`: `(fecha_invalidacion IS NULL AND motivo_invalidacion IS NULL OR fecha_invalidacion IS NOT NULL AND fecha_uso IS NULL AND (motivo_invalidacion=N'CORREO_VERIFICADO' OR motivo_invalidacion=N'ENVIO_FALLIDO' OR motivo_invalidacion=N'CORREO_RETIRADO' OR motivo_invalidacion=N'CORREO_MODIFICADO' OR motivo_invalidacion=N'AGOTADO' OR motivo_invalidacion=N'VENCIDO' OR motivo_invalidacion=N'REEMPLAZADO'))`
- `ck_verificaciones_correo_intentos`: `(intentos_fallidos<=(5) OR fecha_invalidacion IS NOT NULL)`
- `ck_verificaciones_correo_vigencia`: `(fecha_vencimiento>fecha_creacion)`

**Triggers:** ninguno.

**DEFAULT / IDENTITY / nulabilidad:** ver la ficha de cada columna en la sección C (los DEFAULT figuran en «Validaciones»).

- **`uq_verificaciones_correo_abierta`:** a lo sumo una verificación abierta (sin usar ni invalidar) por correo.
- **`ck_verificaciones_correo_cierre`:** una fila invalidada tiene fecha+motivo y no puede estar usada; el motivo pertenece a un conjunto cerrado.
- **`ck_verificaciones_correo_intentos` (V61):** ≤ 5 intentos salvo filas ya cerradas.
- **`ck_verificaciones_correo_vigencia`:** el vencimiento es posterior a la creación.
- **Sólo HMAC del código y de la IP:** nunca el código ni la dirección de red en claro (V61).

### I. Evidencia de implementación

- [`V54 (creación)`](../../backend-java/src/main/resources/db/migration/V54__verificacion_correos_y_telefonos_internacionales.sql#L31)
- [`V61 (OTP de 6 dígitos)`](../../backend-java/src/main/resources/db/migration/V61__otp_decimal_seis_digitos_verificacion_correo.sql#L10)
- [`Entidad EmailVerification`](../../backend-java/src/main/java/com/vuelossanitarios/backend/domain/person/EmailVerification.java#L11)
- [`EmailVerificationService.prepare`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/EmailVerificationService.java#L117)
- [`EmailVerificationService.confirm`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/EmailVerificationService.java#L166)
- [`Endpoint de verificación`](../../backend-java/src/main/java/com/vuelossanitarios/backend/api/AuthController.java#L28)
- [`Pantalla`](../../frontend-react/src/account.jsx#L128)
- [`Prueba: EmailVerificationIntegrationTest`](../../backend-java/src/test/java/com/vuelossanitarios/backend/api/EmailVerificationIntegrationTest.java#L49)

---

## 10. Tabla `pacientes`

### A. Identificación de la tabla

| Atributo | Detalle |
|---|---|
| Nombre exacto y esquema | `dbo.pacientes` (esquema `dbo`) |
| Módulo funcional | 1. Identidad, cuentas y contactos |
| Tipo de tabla | Subtipo 0..1 de personas — ficha de paciente |
| Migración que la creó | V1 (como `patients`) |
| Migraciones posteriores que modificaron su estructura | V4 (datos personales y clínicos salen de la tabla), V8/V24/V27 (renombres e ids) |
| Estado actual en el esquema | Vigente — 4 columnas, PK `id_pacientes`, 1 FK salientes, 1 FK entrantes, 1 índice(s) único(s), 0 CHECK, 0 trigger(s) (verificado contra `sys.*` de la base E2E en Flyway V62) |
| Tablas relacionadas | personas, vuelos_sanitarios |

### B. Funcionalidad y justificación

Marca que una persona es **paciente** del sistema: es la ficha que una solicitud sanitaria referencia. No contiene datos personales (están en `personas`) ni clínicos (están **por traslado** en `informacion_medica_vuelo`): sólo la pertenencia y las fechas.

Un mismo paciente puede tener muchas solicitudes a lo largo del tiempo; el diagnóstico de cada traslado es distinto y por eso no vive aquí.

**Por qué es una tabla independiente.** V4 invirtió el modelo anterior (en que el paciente guardaba diagnóstico y condición): el estado clínico es un hecho de cada vuelo, no una propiedad permanente del paciente. La ficha quedó mínima y colgada de la identidad compartida.

**Qué dejaría de funcionar sin ella.** No podrían registrarse solicitudes sanitarias (`vuelos_sanitarios.id_pacientes` es obligatoria) ni buscarse pacientes para reutilizarlos.

### C. Descripción campo por campo

#### `fecha_creacion`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_creacion` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Registra el instante en que la ficha de paciente se incorporó al sistema. |
| Justificación | Permite ordenar cronológicamente, reconstruir el historial y aportar trazabilidad sin depender de la auditoría. |
| Contenido | Fecha y hora (DATETIME2) de la inserción. |
| Origen | Automático: DEFAULT `SYSDATETIME()` de SQL Server o `@CreationTimestamp` de Hibernate (según la entidad); el usuario nunca ingresa esta fecha. |
| Momento inicial | En el INSERT. |
| Modificación | Inmutable: ningún flujo la actualiza (`updatable=false` en la entidad). |
| Validaciones | DEFAULT sysdatetime() |

#### `fecha_actualizacion`

| Atributo | Detalle |
|---|---|
| Nombre | `fecha_actualizacion` |
| Tipo de dato | `datetime2(3)` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Instante de la última modificación de la ficha. |
| Justificación | Previsto para detectar cambios de la ficha. |
| Contenido | Igual a la fecha de creación. |
| Origen | `@UpdateTimestamp`. |
| Momento inicial | En el INSERT. |
| Modificación | Ningún flujo actual modifica la ficha, por lo que no cambia. |
| Validaciones | DEFAULT sysdatetime(); — |

#### `id_pacientes`

| Atributo | Detalle |
|---|---|
| Nombre | `id_pacientes` |
| Tipo de dato | `bigint` — IDENTITY(1,1) |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Clave primaria de la tabla: identifica de forma única cada fila y es el valor que otras tablas, la API y la auditoría usan para referirse a ella. |
| Justificación | Un identificador técnico numérico, estable y sin significado de negocio evita depender de datos que pueden cambiar (nombres, códigos) y hace eficientes los JOIN y las claves foráneas (decisión V24/V27: «toda tabla de aplicación tiene su propio id_<tabla> BIGINT IDENTITY»). |
| Contenido | Número entero positivo correlativo (1, 2, 3…). El DTS lo maneja como identificador de paciente en la búsqueda y en la solicitud (`patientId`). |
| Origen | SQL Server, columna IDENTITY(1,1): se asigna en el propio INSERT. Hibernate lo declara `@GeneratedValue(strategy = IDENTITY)` y lo lee de vuelta tras insertar. |
| Momento inicial | En el INSERT; no existe fila sin identificador. |
| Modificación | Nunca cambia (inmutable; JPA lo declara `updatable=false`). |
| Validaciones | PRIMARY KEY; PRIMARY KEY (unicidad y NOT NULL); no se reutiliza al borrar filas. |

#### `id_personas`

| Atributo | Detalle |
|---|---|
| Nombre | `id_personas` |
| Tipo de dato | `bigint` |
| Nulabilidad | **NOT NULL.** El valor es siempre necesario para que la fila sea válida (ver «Origen»). |
| Función | Persona que es paciente. |
| Justificación | Comparte nombre, DNI y contactos con la identidad única. |
| Contenido | Identificador de `personas`. |
| Origen | Backend (persona creada o vinculada tras confirmación). |
| Momento inicial | En el INSERT. |
| Modificación | No cambia. |
| Validaciones | FOREIGN KEY → `personas.id_personas` (borrado: NO ACTION); Índice único `uq_pacientes_2`; NOT NULL, FK, única (`uq_pacientes_2`). |

### D. Momento en que se crea un registro

**Escenario 1: Solicitud sanitaria con paciente nuevo (o persona existente confirmada)**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | DTS |
| Pantalla / componente y acción | «Nueva solicitud» → datos del paciente ([`DTS`](../../frontend-react/src/main.jsx)) |
| Datos que aporta el usuario | Nombre, apellido, DNI, nacimiento y confirmación de identidad si el DNI ya existe. |
| Endpoint | `POST /api/flights/with-patient` |
| Servicio | `SanitaryRequestRegistrationService.createWithPatient` → `PatientService.registerForSanitaryRequest` |
| Validaciones y condiciones | Si la persona ya es paciente → 409 (no se duplica la ficha); si existe como persona sólo se vincula con la atestación del DTS y datos coincidentes. |
| Mecanismo que crea el registro | `patients.saveAndFlush(patient)`. |
| Columnas completadas y de dónde sale cada valor | `id_personas` ← persona creada o vinculada; fechas ← Hibernate. |
| Columnas que quedan NULL o con valor predeterminado | Ninguna. |
| Otros registros creados en la misma operación | Persona (si no existía), vuelo, solicitud sanitaria, datos médicos, etc. |
| Si la operación falla / atomicidad | Atómico con toda la solicitud. |

**Escenario 2: Alta directa de paciente**

| Aspecto | Detalle |
|---|---|
| Actor o proceso que inicia | DTS / Operaciones / Centro de Operaciones |
| Pantalla / componente y acción | No se pudo determinar con certeza a partir del código y el esquema analizados qué pantalla invoca este endpoint. |
| Datos que aporta el usuario | Datos de identidad. |
| Endpoint | `POST /api/patients` |
| Servicio | `PatientService.create` |
| Validaciones y condiciones | Sólo identidades realmente nuevas. |
| Mecanismo que crea el registro | `patients.saveAndFlush`. |
| Columnas completadas y de dónde sale cada valor | Idem. |
| Columnas que quedan NULL o con valor predeterminado | — |
| Otros registros creados en la misma operación | Persona. |
| Si la operación falla / atomicidad | Propia. |

### E. Ejemplo funcional completo

**Situación (ficticia):** el DTS «Marta Ruiz» solicita un traslado para «Juan Díaz» (DNI 30111222, no registrado).

1. En *Nueva solicitud* completa los datos del paciente y del traslado y envía.
2. Se crea la persona (`id_personas`=202) y la ficha:

| id_pacientes | id_personas | fecha_creacion | fecha_actualizacion |
|---|---|---|---|
| 40 | 202 | 2026-11-01 09:30:00 | 2026-11-01 09:30:00 |

3. En el próximo traslado de Juan el DTS lo **busca** (`GET /api/patients/search`, roles DTS y ADMINISTRADOR) y reutiliza la ficha; no se crea otra.
4. Si el Administrador corrige el apellido en *Mantenimiento de pacientes*, cambia `personas`, no esta tabla.

### F. Ciclo de vida del registro

La fila **no se modifica ni se elimina**: no hay endpoint que la actualice (`fecha_actualizacion` tiene @UpdateTimestamp, pero la ficha no tiene atributos propios que cambiar, por lo que permanece igual a la fecha de creación). Una persona que deja de ser atendida simplemente deja de aparecer en nuevas solicitudes. No existe baja lógica de pacientes.

### G. Relaciones con otras tablas

**Clave primaria:** `id_pacientes`.

**Claves foráneas salientes (tabla hija → padre):**

| Columna | Referencia | Borrado | Obligatoria |
|---|---|---|---|
| `id_personas` | `personas.id_personas` (`fk_pacientes_id_personas`) | NO ACTION | Obligatoria |

**Claves foráneas entrantes (tablas hijas):** `vuelos_sanitarios`(id_pacientes).

FK `id_personas` → `personas` (obligatoria, única: una ficha por persona). FK entrante desde `vuelos_sanitarios.id_pacientes` (una solicitud pertenece a un único paciente). Sin cascada.

### H. Restricciones y decisiones de diseño

**Índices (no PK):**

| Índice | Único | Columnas | Filtro | Incluye |
|---|---|---|---|---|
| `idx_pacientes_id_personas` | no | id_personas | — | — |
| `idx_pacientes_persona_id` | no | id_personas | — | — |
| `uq_pacientes_2` | sí | id_personas | — | — |

**Restricciones CHECK:** ninguna.

**Triggers:** ninguno.

**DEFAULT / IDENTITY / nulabilidad:** ver la ficha de cada columna en la sección C (los DEFAULT figuran en «Validaciones»).

- **Unicidad por persona:** evita dos fichas para la misma identidad.
- **Tabla casi vacía a propósito:** la privacidad clínica se resuelve por vuelo (`informacion_medica_vuelo`), limitando el alcance del dato.
- **Observación:** `fecha_actualizacion` nunca difiere de `fecha_creacion` (no hay actualizaciones); es un campo sin utilidad actual.

### I. Evidencia de implementación

- [`V1 (patients)`](../../backend-java/src/main/resources/db/migration/V1__init_sanitary_flights_schema.sql#L105)
- [`V4 (normalización)`](../../backend-java/src/main/resources/db/migration/V4__normalize_identity_clinical_data_and_versioning.sql#L40)
- [`Entidad Patient`](../../backend-java/src/main/java/com/vuelossanitarios/backend/domain/patient/Patient.java#L16)
- [`PatientService.register`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/PatientService.java#L33)
- [`Búsqueda y mantenimiento`](../../backend-java/src/main/java/com/vuelossanitarios/backend/service/PatientDirectoryService.java#L42)
- [`Endpoints de pacientes`](../../backend-java/src/main/java/com/vuelossanitarios/backend/api/PatientController.java#L19)
- [`Búsqueda (UI)`](../../frontend-react/src/patients.jsx#L7)
- [`Prueba: PatientServiceIdentityTest`](../../backend-java/src/test/java/com/vuelossanitarios/backend/service/PatientServiceIdentityTest.java#L17)
