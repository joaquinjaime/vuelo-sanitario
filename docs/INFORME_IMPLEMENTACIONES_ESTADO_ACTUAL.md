# INFORME DE IMPLEMENTACIONES Y ESTADO ACTUAL — Sistema Vuelos Sanitarios

> Auditoría documental del **estado real del código** (no de la documentación previa). Rama `codex/auditoria-ux-vuelos`, commit `ef9bb09` («Mejora la consulta y edición del detalle operativo de vuelos», 2026-11-03). Última migración Flyway del repositorio y de la base habitual: **V66**. Modo: **solo lectura** — no se modificó código, migraciones, configuración, dependencias ni datos; sólo se crearon los dos informes de `docs/`. Complementa a [`INFORME_COMPLETO_BASE_DATOS.md`](INFORME_COMPLETO_BASE_DATOS.md) (50 tablas, 534 columnas).

> Revalidación al 2026-11-03 en [la auditoría de ambos informes](AUDITORIA_DOCUMENTACION_ESTADO_ACTUAL.md). Las cifras de pruebas de §9 corresponden al informe original. La revalidación contrastó el código y el catálogo SQL y dejó la ejecución de las suites fuera de su alcance.

## Índice

1. Resumen ejecutivo · 2. Estado del repositorio · 3. Arquitectura actual · 4. Inventario de funcionalidades (40) · 5. Modificaciones recientes · 6. Procesos completos y transiciones · 7. Responsabilidades y matriz de permisos · 8. Reglas de negocio consolidadas · 9. Estado de calidad · 10. Problemas detectados · 11. Conclusiones · Anexo A (cobertura de la investigación) · Anexo B (limitaciones)

---

## 1. Resumen ejecutivo

**Qué problema resuelve.** Gestiona el ciclo completo de un **traslado aéreo sanitario**: un usuario con rol **DTS** (la interfaz lo rotula «Dirección de Tránsito Sanitario») solicita el vuelo para un paciente; el Centro de Operaciones (CO) evalúa y **negocia el horario** con el DTS; acordado el horario, se asignan **aeronave, comandante y copiloto**, se proponen y confirman los **aeropuertos**, el DTS asigna su **personal sanitario**, el comandante **planifica** (clima, ruta, hangar, coordinaciones), Operaciones **inicia y finaliza** el vuelo y el comandante presenta un **informe final** que Operaciones aprueba para completar el proceso. Con el mismo motor se crean **vuelos no sanitarios** (reposicionamiento, entrenamiento, regreso a base, traslado operativo…) que no pasan por DTS ni paciente.

**Tipos de vuelo** (catálogo `tipos_vuelo`): SANITARIO, REGRESO_BASE, REPOSICIONAMIENTO, TRASLADO_OPERATIVO, ENTRENAMIENTO y OTRO.

**Roles** (catálogo `roles`): `ADMINISTRADOR`, `DTS`, `CENTRO_OPERACIONES` («CO») y `COMANDANTE`; existe además `OPERACIONES`, un quinto rol que **coexiste con CO** y recibe los mismos permisos salvo la autorización de excepciones geográficas (ver §10).

**Operaciones principales.** Administración de usuarios, aeronaves, geografía y pacientes; solicitud y negociación de horarios; asignación de recursos con regla geográfica; planificación por el comandante con revisión de ruta; gestión documental con versiones y bloqueo de edición; ejecución; informe final con plazos; notificaciones; auditoría.

**Organización actual.** Backend Spring Boot (Java 21) con 20 controladores REST, 45 clases de servicio y 41 entidades JPA sobre SQL Server 2022 (50 tablas); frontend React + Vite con **React Router** (rutas reales, pestañas con URL propia, carga diferida y tableros por rol). Despliegue local con Docker Compose.

**Cambios más importantes de las últimas implementaciones** (todos posteriores al informe de BD V62; detalle en §5):

| # | Cambio | Evidencia principal |
|---|---|---|
| 1 | **OTP de 6 dígitos** para activar cuentas y verificar correos (V61, V62): 10 minutos, 5 intentos. | `8274062`, `01497e5`, `6126e5d`, `c414065`, `4460a64` |
| 2 | **Rediseño de los espacios de trabajo por rol** y, luego, **reestructuración integral del frontend**: de una página larga con `#hash` a SPA con rutas, layout persistente, pantallas por módulo y pestañas por etapa. | `2ae32fc`, `6d2fa45`, `c6abc93` |
| 3 | **Ubicación operativa del comandante** y **asignación por reserva** (V63), corregida a **jurisdicción de salida (provincia/CABA)** con **selección de aeropuertos propuesto/confirmado** (V64/V65). | `0257f32`, `99a786a`, `a51bb26`, `6623b00`, `41e7e53` |
| 4 | **Simplificación de la tripulación (V66)**: el comandante deja de depender de clasificaciones, políticas y habilitaciones; el copiloto es otro comandante; el **personal sanitario** pasa a ser un registro del DTS sin cuenta; se retiran el flujo de habilitaciones y el antivirus. | `b1c9d02` (intermedio, luego retirado), `d3aab49`, `cadceab`, `090cdfe` |
| 5 | **Gestión por etapas** (compuertas «horario acordado» para documentos, hangar, coordinaciones y bitácora) y **UX del detalle operativo** (consulta primero, edición explícita, protección de borradores). | `DocumentScheduleGate`, `PreparationStageGate`, `ef9bb09` |

**Diferencia entre lo anterior y lo reciente.** Hasta V62 el sistema ya tenía el circuito sanitario, la negociación, la ruta, el informe final y la gestión documental (V1–V60, ver historial en §2). Lo **nuevo** es la geografía operativa por jurisdicción, el personal sanitario sin cuenta, el copiloto como comandante y la reestructuración del frontend. Lo **retirado** es todo el modelo de clasificaciones/habilitaciones/políticas/antivirus (V33–V60). Cuando no hay evidencia de una fecha (p. ej. cuándo apareció una regla puntual) no se la inventa: se cita el commit más antiguo que la contiene.

**Estado de calidad en este commit (verificado en esta auditoría).** Backend: `mvn -o test` → **646 pruebas, 0 fallos, 0 errores** (BUILD SUCCESS, 2026-11-03). Frontend: `vitest run` → **357 pruebas, 0 fallos**; `vite build` → compila. Las pruebas de backend corren sobre H2 en modo SQL Server, de modo que **no ejercitan los triggers ni los CHECK de SQL Server** (los cubren los scripts E2E, cuya última corrida registrada es anterior a V66: 41/58 OK, ver §9).

**Problemas principales** (§10): (a) el rol `OPERACIONES` (a diferencia de `CENTRO_OPERACIONES`) no puede autorizar excepciones geográficas, de modo que una asignación excepcional depende de que exista un usuario CO; (b) el copiloto asignado no puede abrir «su» vuelo; (c) `POST /api/flights/operational` admite `ADMINISTRADOR` pero el menú sólo se lo ofrece a Operaciones; (d) documentación y configuración residual obsoleta (README «hasta V47», variables antimalware en Compose, Javadoc que aún habla de habilitaciones, script Python de habilitaciones); (e) la última corrida E2E registrada falló en 17 de 58 scripts y es anterior a V66; (f) `HealthStaffService` no valida la capacidad de la aeronave.

---

## 2. Estado del repositorio

| Concepto | Valor | Cómo se obtuvo |
|---|---|---|
| Rama actual | `codex/auditoria-ux-vuelos` | `git branch` |
| Último commit | `ef9bb09b2e06f836ffea83d05aceb14875c9025d` — 2026-11-03 03:52 (-03) | `git log` |
| Cambios sin confirmar | Ninguno sobre archivos versionados. Sin seguimiento (`??`): `docs/INFORME_COMPLETO_BASE_DATOS.md`, `docs/informe-base-datos/`, `docs/taller-iii-entrega/`, `tmp/` (documentación y material de otras tareas; este informe y el de BD se agregan a esa lista) | `git status` |
| Remoto | `origin` → `github.com/joaquinjaime/vuelo-sanitario` | `git remote -v` |
| Migración más reciente (repositorio) | **V66** `simplificacion_tripulacion_y_personal_sanitario` (62 SQL + 4 Java: V16, V17, V26, V65) | `db/migration` |
| Migración aplicada en la base habitual | **V66** (instalada 2026-11-02 19:35), 66 filas en `flyway_schema_history`, todas `success` | Consulta de sólo lectura |
| Versión de la aplicación | Spring Boot 3.4.5 / artefacto `backend`; el frontend declara `0.1.0`. **No hay un número de versión de producto**: la versión efectiva es el número de migración (V66) y el commit | `pom.xml`, `package.json` |

### Ramas y relación con `main`

| Rama | Commit | Adelante de `main` | Atrás de `main` | Observación |
|---|---|---|---|---|
| `main` (local) | `21d42e3` (2026-10-30) | — | — | **Desactualizada**: no contiene nada posterior a V60 |
| `origin/main` | `01497e5` (2026-10-31) | 2 | 0 | Sólo el OTP de 6 dígitos |
| `codex/auditoria-ux-vuelos` (**actual**) | `ef9bb09` (2026-11-03) | 18 | 0 | Contiene todo lo reciente; `origin/main` es ancestro |
| `feat/frontend-reestructuracion` | `c6abc93` | 17 | 0 | Antecesora de la actual |
| `fix/asignacion-comandante-aeronave-ubicacion` | `090cdfe` | 15 | 0 | Trabajo V63–V66; según la memoria del proyecto se publicó sin PR (no hay `gh`/token) |
| `codex/ux-ui-redesign` | `2ae32fc` | 6 | 0 | Rediseño de espacios de trabajo |
| `codex/fix-user-creation-runtime` | `6126e5d` | 5 | 0 | Endurecimiento del alta y OTP de activación |
| `codex/verificacion-email-otp-6-digitos` | `8274062` | 1 | 0 | OTP de verificación |
| `release/v55-integracion`, `feature/completitud-funcional-post-v55` | `7cc9873`, `7a76707` | 0 | 43 / 2 | Históricas, ya contenidas |
| `backup/version-anterior-pre-docker`, `feature/integracion-funcional-v41` | — | — | — | Respaldos históricos |

**Conclusión sobre ramas.** `main` **no** contiene las implementaciones recientes: todo el trabajo V61–V66 y el frontend reestructurado están sólo en la rama actual y sus antecesoras (que no se integraron a `main`; no se ejecutaron merges ni PR). No se pudo consultar GitHub (sin acceso autorizado), por lo que no se sabe si existen PR abiertos.

### Historial reciente (los 25 últimos commits)

| Fecha | Commit | Resumen |
|---|---|---|
| 2026-11-03 | `ef9bb09` | Mejora la consulta y edición del detalle operativo de vuelos (34 archivos, +918/−186) |
| 2026-11-02 | `c6abc93` | Pantallas por etapas, tableros por rol, carga diferida y documentación de la reestructuración |
| 2026-11-02 | `6d2fa45` | Navegación por rutas, layout persistente y pantallas dedicadas por módulo |
| 2026-11-02 | `090cdfe` | E2E de la simplificación de tripulación; retiro de los scripts del modelo de habilitaciones |
| 2026-11-02 | `cadceab` | Frontend: personal sanitario del DTS, copiloto en la asignación, retiro de habilitaciones |
| 2026-11-02 | `d3aab49` | **Backend V66**: tripulación simplificada |
| 2026-11-02 | `b1c9d02` | Requisitos del comandante explicados y administrables (clasificación, política y habilitación) — **luego retirado por V66** |
| 2026-11-02 | `41e7e53`, `a51bb26` | V64/V65: ubicación por provincia/CABA y selección de aeropuertos |
| 2026-11-02 | `6623b00`, `99a786a`, `0257f32` | V63: ubicación operativa, panel de asignación de recursos, elegibilidad por localidad |
| 2026-11-01 | `2ae32fc` | Rediseño de espacios de trabajo y navegación |
| 2026-11-01/10-31 | `6126e5d`, `c414065`, `4460a64`, `01497e5`, `8274062` | OTP de 6 dígitos y endurecimiento del alta de usuarios |
| 2026-10-30 | `21d42e3` … `e9dcf76` | Documentación de V60 y plan de pruebas manuales |
| 2026-10-28/29 | `3ef9cbe` … `a057bed` | V59–V60: políticas, habilitaciones, antivirus, certificación (I-5.6 a I-5.8) — **retirado en V66** |

### Historial de migraciones (agrupado)

| Rango | Contenido | Estado actual |
|---|---|---|
| V1–V7 | Esquema inicial, planificación, cancelación, normalización de identidad, urgencia extrema, informes finales (en inglés) | Vigente (renombrado en V8) |
| V8–V32 | Esquema en español; cuentas y activaciones; catálogos geográficos; negociación horaria; documentos PDF versionados; identificadores numéricos; separación sanitario/operativo | Vigente |
| V33–V36, V58–V60 | Clasificaciones y habilitaciones profesionales, políticas, antivirus | **Retirado del flujo en V66** (tablas conservadas como historial) |
| V37–V47 | Ruta, bitácora, hangar, coordinaciones, cierre e informes, tripulación con historial, auditoría inmutable, unicidad de identidad | Vigente |
| V48–V57 | Versión optimista de identidad, contactos, verificación de correos y teléfonos internacionales, revisión de rutas, licencia única | Vigente |
| V61–V62 | OTP decimal de 6 dígitos | Vigente |
| V63–V65 | Ubicación del comandante, excepciones geográficas, aeropuertos propuestos/confirmados, coordenadas | Vigente (V63 parcialmente reemplazado por V64) |
| V66 | Personal sanitario sin cuenta; copiloto como comandante; retiro de habilitaciones | Vigente |

---

## 3. Arquitectura actual

### 3.1 Backend

| Capa | Contenido (verificado) | Ruta |
|---|---|---|
| API | 20 controladores REST (`/api/...`), `ApiExceptionHandler`, DTO con `@StrictJson` (campo desconocido → 400) | `backend-java/src/main/java/com/vuelossanitarios/backend/api` |
| Servicios | 45 clases en `service/` (servicios, reglas y compuertas); los métodos públicos son `@Transactional`; la auditoría exige transacción previa | `.../service` |
| Dominio | 41 entidades JPA mapeadas a 41 tablas (+ `flyway_schema_history`, `sysdiagrams`, y 6 tablas históricas **sin entidad**) | `.../domain` |
| Repositorios | Spring Data JPA, consultas con bloqueo (`lockById`) para serializar asignaciones | `.../repository` |
| Seguridad | JWT sin estado (`JwtAuthenticationFilter`), BCrypt, `@EnableMethodSecurity` con `@PreAuthorize` por endpoint; sólo `/api/auth/login`, `/api/auth/activar-cuenta` y `/actuator/health` son públicos | `.../security` |
| Configuración | Reloj de negocio ajustable (`AdjustableClock`), zona `America/Argentina/Tucuman`, `@Scheduled` (2 barridos), cuenta de migración separada | `.../config` |
| Migraciones | 62 SQL + 4 Java (V16, V17, V26 siembra geográfica; V65 coordenadas) | `db/migration` y `src/main/java/db/migration` |

**Procesos programados** (`@Scheduled`, los únicos): `FinalReportDeadlineService.sweep` (cada 60 s) y `CrewEligibilityMonitoringService.sweep` (cada hora).

**Perfil de pruebas aislado.** `E2eControlController` (`/api/e2e/*`, reloj ajustable y barridos a demanda) sólo existe con el perfil Spring `e2e` **y** `app.e2e-controls.enabled=true`; con el flag sin el perfil la aplicación se niega a arrancar (`BusinessTimeConfiguration`).

### 3.2 Frontend

| Elemento | Detalle |
|---|---|
| Stack | React (latest) + Vite + `react-router-dom` 7.18.4 + `libphonenumber-js`; pruebas con Vitest + Testing Library |
| Entrada | `src/main.jsx` → `app/App.jsx` (proveedores de tema, avisos, sesión y datos operativos + `createBrowserRouter(routes)` y `RouterProvider`) |
| Rutas | `app/AppRoutes.jsx` (carga diferida por pantalla); prefijo `/app` |
| Control de acceso | `app/navigation.js` es el **único** mapa de áreas (`ADMIN`, `DTS`, `OPERACIONES`, `COMANDANTE`), módulos del menú y acceso por ruta; `guards.jsx` aplica `RequireAuth`, `RequireWorkspace`, 403/404 y redirección de enlaces `#/…` antiguos. **La autorización real es la del servidor.** |
| Estructura | `features/{account,admin,aircraft,audit,auth,catalogs,dashboard,flights,health-staff,notifications,patients,reports,users}`, `components/{forms,ui}`, `hooks`, `services/api.js`, `utils` (148 archivos) |
| Detalle de vuelo | `features/flights/detail/FlightDetailPage.jsx` con pestañas por URL (`/app/solicitudes/:id/:tab?`, `/app/vuelos/:id/:tab?`) definidas por `flightTabs.js` y `flightStages.js` a partir del **estado real** del vuelo |

**Mapa de navegación por área (menú lateral):**

| Área | Módulos |
|---|---|
| ADMIN | Inicio · Usuarios · Aeronaves · Geografía · Ubicación de comandantes · Pacientes · Auditoría |
| DTS | Inicio · Mis solicitudes · Nueva solicitud · Personal sanitario · Notificaciones |
| OPERACIONES (CO y Operaciones) | Inicio · Solicitudes · Vuelos · Informes finales · Comandantes · Notificaciones |
| COMANDANTE | Inicio · Mis vuelos · Informes finales · Notificaciones |

Comunes a todas: «Mi cuenta» (contactos y contraseña). Un usuario con varios roles elige su **área de trabajo** (`WorkspaceSelector`).

### 3.3 Datos e infraestructura

SQL Server 2022 (Docker), Flyway (cuenta de migración con `db_owner` separada de la cuenta de la aplicación, de sólo datos; `ReadinessService` lo verifica), PDFs en un volumen privado (`DocumentStorage`, con huella SHA-256), SMTP para correos (Mailpit en los entornos de prueba), Nginx como proxy del frontend. `docker-compose*.yml` (8 archivos: base, e2e, e2e-ui, e2e-validation, e2e shared-sql, prod, release y clamav-standalone) y 113 scripts en `scripts/`.


## 4. Inventario de funcionalidades

Se documentan **40 funcionalidades**, agrupadas en seguridad y cuentas (F01–F06), catálogos y pacientes (F07–F10), solicitud y negociación (F11–F15), planificación (F16–F28), ejecución y cierre (F29–F31), transversales (F32–F39) y lo retirado (F40). Cada ficha cubre los 15 aspectos pedidos agrupados así: *nombre* (título), *objetivo* y *problema* (fila 1), *roles* y *acciones* (fila 2), *funcionamiento* (fila 3), *reglas, restricciones y estados* (fila 4), *efectos* y *datos que crea o modifica* (fila 5), *servicios y endpoints* (fila 6), *componentes del frontend* (fila 7), *estado real* (fila 8) y *evidencia* (fila 9). Rutas relativas al repositorio.

**Escala de «Estado real»:** *Implementado; cubierto por pruebas automáticas que pasan en este commit* = existe código y pruebas (H2 en el backend, Vitest en el frontend) ejecutadas en esta auditoría; *cobertura automática parcial*; *sin verificación de ejecución propia* = sólo lectura del código. **Ninguna** funcionalidad se verificó contra SQL Server en esta auditoría (ver §9).
### F01 · Autenticación y sesión

| Aspecto | Detalle |
|---|---|
| Objetivo y problema que resuelve | Identificar al usuario, emitir el token y decidir su área de trabajo. |
| Roles y acciones | Todos los roles. Acción: ingresar, cerrar sesión, cambiar de área si tiene varios roles. |
| Funcionamiento paso a paso | `POST /api/auth/login` (público) → `AuthService.login` busca al usuario con sus roles y rechaza —con un mismo mensaje— cuenta inactiva, estado distinto de ACTIVO, sin contraseña o contraseña incorrecta; emite un JWT con id, usuario, bandera de cambio obligatorio, roles y **versión de credenciales**. `JwtAuthenticationFilter` valida cada petición. |
| Reglas de negocio, restricciones y estados | La baja, el cambio de roles y el cambio de contraseña incrementan `usuarios.version_credenciales`, lo que invalida los tokens anteriores. Con `debe_cambiar_contrasena` el frontend fuerza `/cambiar-contrasena`. El inicio de sesión es de sólo lectura: **no deja registro** (ver §10). |
| Efectos sobre otras funciones y datos que crea o modifica | Lee `usuarios` y `usuarios_roles`; no escribe. |
| Servicios y endpoints | [`AuthController`](../backend-java/src/main/java/com/vuelossanitarios/backend/api/AuthController.java); [`AuthService`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/AuthService.java); seguridad en [`security/`](../backend-java/src/main/java/com/vuelossanitarios/backend/security). |
| Componentes del frontend | [`LoginPage.jsx`](../frontend-react/src/features/auth/LoginPage.jsx), [`SessionProvider.jsx`](../frontend-react/src/app/providers/SessionProvider.jsx), [`WorkspaceSelector.jsx`](../frontend-react/src/features/auth/WorkspaceSelector.jsx), [`guards.jsx`](../frontend-react/src/app/guards.jsx). |
| Estado real de implementación | Implementado; cubierto por pruebas automáticas que pasan en este commit (`AuthServiceTest`, `JwtServiceTest`, `JwtAuthenticationFilterTest`, `LoginPage.activation.test`). |
| Evidencia en el código | `backend-java/src/main/java/com/vuelossanitarios/backend/security/SecurityConfig.java`; `backend-java/src/main/java/com/vuelossanitarios/backend/service/AuthService.java`. |

### F02 · Activación de cuenta con código de 6 dígitos (OTP)

| Aspecto | Detalle |
|---|---|
| Objetivo y problema que resuelve | Que el titular active su cuenta sin que el administrador conozca su contraseña. |
| Roles y acciones | Titular (sin sesión). Acción: ingresar DNI, código, nombre de usuario y contraseña. |
| Funcionamiento paso a paso | Pantalla pública «Activar cuenta» → `POST /api/auth/activar-cuenta` → `AuthService.activate` (`noRollbackFor=ApiException` para que el contador de intentos se confirme aunque la respuesta sea 400): busca el código abierto del DNI, valida vigencia y BCrypt, fija `nombre_usuario`, `hash_contrasena` y `estado_cuenta=ACTIVO`. |
| Reglas de negocio, restricciones y estados | Código decimal de **6 dígitos**, **10 minutos**, **5 intentos** (se cierra al quinto: `ACTIVATION_CODE_ATTEMPTS_EXHAUSTED`); vencido: `ACTIVATION_CODE_EXPIRED`; incorrecto: `ACTIVATION_CODE_INVALID` con intentos restantes. Los códigos creados antes de V62 conservan su formato alfanumérico y 24 h (`codigo_numerico=0`). Contraseña de 12 o más caracteres. Estados de cuenta: PENDIENTE_ACTIVACION → ACTIVO. |
| Efectos sobre otras funciones y datos que crea o modifica | Actualiza `usuarios` y `activaciones_cuenta` (uso o intentos fallidos); audita `USUARIO_ACTIVADO`. |
| Servicios y endpoints | [`AuthController`](../backend-java/src/main/java/com/vuelossanitarios/backend/api/AuthController.java); [`AuthService`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/AuthService.java) (`activate`, `newActivation`, `decimalActivationCode`). |
| Componentes del frontend | [`LoginPage.jsx`](../frontend-react/src/features/auth/LoginPage.jsx) (modo activación). |
| Estado real de implementación | Implementado; cubierto por pruebas automáticas que pasan en este commit (`AccountActivationIntegrationTest`, `LoginPage.activation.test`). |
| Evidencia en el código | V61/V62; commits `6126e5d`, `c414065`, `01497e5`. |

### F03 · Contraseñas: cambio propio, temporal y restablecimiento

| Aspecto | Detalle |
|---|---|
| Objetivo y problema que resuelve | Mantener credenciales sin exponer hashes. |
| Roles y acciones | Titular (cambio propio); Administrador (temporal y restablecimiento). |
| Funcionamiento paso a paso | `POST /api/auth/me/password` (propio); `POST /api/auth/users/{id}/temporary-password` y `…/credential-reset` (Administrador): la contraseña temporal se **muestra una vez** y obliga a cambiarla en el siguiente ingreso. |
| Reglas de negocio, restricciones y estados | La cuenta debe estar activa y con usuario. Todo cambio invalida los tokens anteriores. Contraseñas con confirmación coincidente. |
| Efectos sobre otras funciones y datos que crea o modifica | Actualiza `usuarios` (hash, bandera de cambio, versión de credenciales); audita `CONTRASENA_CAMBIADA` / `CONTRASENA_RESTABLECIDA`. |
| Servicios y endpoints | [`AuthController`](../backend-java/src/main/java/com/vuelossanitarios/backend/api/AuthController.java); [`AuthService`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/AuthService.java). |
| Componentes del frontend | [`PasswordChangePage.jsx`](../frontend-react/src/features/auth/PasswordChangePage.jsx), [`MyAccountPage.jsx`](../frontend-react/src/features/account/MyAccountPage.jsx), [`UserDetailPage.jsx`](../frontend-react/src/features/users/UserDetailPage.jsx). |
| Estado real de implementación | Implementado; cubierto por pruebas automáticas que pasan en este commit (`AuthServiceTest`, `UserAdministrationIntegrationTest`). |
| Evidencia en el código | `AuthService.changePassword`, `setTemporaryPassword`. |

### F04 · Gestión de usuarios (Administrador)

| Aspecto | Detalle |
|---|---|
| Objetivo y problema que resuelve | Dar de alta, modificar, desactivar y reactivar cuentas con control de responsabilidades. |
| Roles y acciones | Administrador (único). Acciones: crear, editar datos y roles, asignar licencia y provincia, regenerar código de activación, desactivar/reactivar, rectificar DNI. |
| Funcionamiento paso a paso | «Nuevo usuario» (`/app/usuarios/nuevo`) → `POST /api/auth/users` → `AuthService.createPending`: crea (o reutiliza, con confirmación expresa `personaExistenteId`) la persona, el usuario PENDIENTE_ACTIVACION sin credenciales, sus roles, el perfil de comandante si corresponde (licencia y, opcionalmente, provincia/CABA), al menos un correo y un teléfono, y el código de activación (que se muestra **una sola vez**). Todo en una transacción. |
| Reglas de negocio, restricciones y estados | DNI único (409 si ya hay cuenta); licencia obligatoria y única para COMANDANTE; el administrador no puede cambiar sus propios roles, desactivarse ni dejar al sistema sin administrador activo; no se retira un rol ni se desactiva a quien tenga responsabilidades vigentes (`UserResponsibilityService`: vuelos, informes, solicitudes). Reactivar genera contraseña temporal. Al cambiar roles se **borran y reinsertan** las filas de `usuarios_roles` (A6 del informe de BD). |
| Efectos sobre otras funciones y datos que crea o modifica | Escribe `personas`, `usuarios`, `usuarios_roles`, `perfiles_comandante`, `correos_electronicos`, `telefonos`, `activaciones_cuenta`, `eventos_auditoria`; en la baja libera los bloqueos documentales del usuario. |
| Servicios y endpoints | [`AuthController`](../backend-java/src/main/java/com/vuelossanitarios/backend/api/AuthController.java) (`/api/auth/users…`, `/api/auth/roles`); [`AuthService`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/AuthService.java), [`UserResponsibilityService`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/UserResponsibilityService.java), [`PersonIdentityService`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/PersonIdentityService.java); arranque: `security/BootstrapAdministrator` (administrador inicial por variables de entorno). |
| Componentes del frontend | [`UsersListPage.jsx`](../frontend-react/src/features/users/UsersListPage.jsx), [`UserCreatePage.jsx`](../frontend-react/src/features/users/UserCreatePage.jsx), [`UserDetailPage.jsx`](../frontend-react/src/features/users/UserDetailPage.jsx), [`DniRectification.jsx`](../frontend-react/src/components/forms/DniRectification.jsx). |
| Estado real de implementación | Implementado; cubierto por pruebas automáticas que pasan en este commit (`UserAdministrationServiceTest`, `UserAdministrationIntegrationTest`, `UserDniRectificationIntegrationTest`, `users.test`). |
| Evidencia en el código | Proceso 8.1/8.3 del informe de BD. |

### F05 · Mi cuenta: correos y teléfonos, verificación de correo

| Aspecto | Detalle |
|---|---|
| Objetivo y problema que resuelve | Mantener contactos personales válidos y verificados. |
| Roles y acciones | Cualquier usuario autenticado sobre su propia cuenta. |
| Funcionamiento paso a paso | «Mi cuenta» (`/app/mi-cuenta`): agregar/editar/quitar/marcar principal correos y teléfonos; «Solicitar verificación» envía un código por SMTP y «Confirmar» lo valida (`EmailVerificationService`). |
| Reglas de negocio, restricciones y estados | Teléfonos en formato internacional (libphonenumber, país obligatorio). Los correos nacen **sin verificar** y no pueden ser principales hasta verificarse. Código de 6 dígitos, 10 min, 5 intentos, espera mínima entre envíos y máximos por correo/usuario/origen en 24 h; el código se guarda como HMAC. Baja lógica con motivo; versión optimista (`version_contacto`). |
| Efectos sobre otras funciones y datos que crea o modifica | Escribe `correos_electronicos`, `telefonos`, `verificaciones_correo`, `eventos_auditoria`. El envío SMTP ocurre fuera de la transacción de alta y su resultado se registra aparte. |
| Servicios y endpoints | [`AuthController`](../backend-java/src/main/java/com/vuelossanitarios/backend/api/AuthController.java) (`/api/auth/me/…`); [`PersonContactService`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/PersonContactService.java), [`EmailVerificationService`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/EmailVerificationService.java). |
| Componentes del frontend | [`MyAccountPage.jsx`](../frontend-react/src/features/account/MyAccountPage.jsx), [`MyContacts.jsx`](../frontend-react/src/features/account/MyContacts.jsx), [`PhoneField.jsx`](../frontend-react/src/components/forms/PhoneField.jsx). |
| Estado real de implementación | Implementado; cubierto por pruebas automáticas que pasan en este commit (`EmailVerificationIntegrationTest`, `PersonContactIntegrationTest`, `PhoneInternationalIntegrationTest`, `MyContacts.test`). |
| Evidencia en el código | V11, V49, V54, V61. |

### F06 · Perfil de comandante y ubicación operativa

| Aspecto | Detalle |
|---|---|
| Objetivo y problema que resuelve | Saber dónde está cada comandante para respetar la regla geográfica de la asignación. |
| Roles y acciones | Administrador, Operaciones y Centro de Operaciones fijan la ubicación; el comandante sólo la consulta. |
| Funcionamiento paso a paso | «Ubicación de comandantes» (`/app/comandantes`) lista comandantes activos (filtros por texto, provincia y estado CONOCIDA/DESCONOCIDA) y permite «Actualizar ubicación» → `PUT /api/commanders/{id}/location` → `CommanderLocationService.update` (bloquea la cuenta, valida provincia activa, audita con el valor anterior). También se fija al dar de alta y, **automáticamente**, al finalizar un vuelo (comandante y copiloto pasan a la jurisdicción del aeropuerto de llegada). |
| Reglas de negocio, restricciones y estados | Sólo **provincia o CABA** (CABA es distinta de la provincia de Buenos Aires); **no se registra localidad** (V64). Ubicación desconocida (NULL) ⇒ el comandante sólo puede asignarse por excepción. El comandante no puede declararla: la regla no depende de lo que él afirme. |
| Efectos sobre otras funciones y datos que crea o modifica | Actualiza `perfiles_comandante` (`id_provincias`, `fecha_ubicacion_actual`, `id_usuario_ubicacion`); audita `COMMANDER_LOCATION_UPDATE`. Alimenta la elegibilidad y el itinerario. |
| Servicios y endpoints | [`CommanderLocationController`](../backend-java/src/main/java/com/vuelossanitarios/backend/api/CommanderLocationController.java); [`CommanderLocationService`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/CommanderLocationService.java); endpoint heredado `POST /api/catalogs/commanders/{id}/location` (también vigente). |
| Componentes del frontend | [`commanderLocations.jsx`](../frontend-react/src/features/catalogs/commanderLocations.jsx), [`AdminPages.jsx`](../frontend-react/src/features/admin/AdminPages.jsx). |
| Estado real de implementación | Implementado; cubierto por pruebas automáticas que pasan en este commit (`CommanderLocationServiceTest`, `commanderLocations.test`). |
| Evidencia en el código | V63/V64; commits `0257f32`, `99a786a`, `a51bb26`. |

### F07 · Aeronaves

| Aspecto | Detalle |
|---|---|
| Objetivo y problema que resuelve | Administrar la flota y su ubicación. |
| Roles y acciones | Administrador (alta, edición, activación); Administrador y Operaciones (ubicación y consulta de disponibilidad); todos los roles ven el listado. |
| Funcionamiento paso a paso | «Aeronaves» (`/app/aeronaves`, `/nueva`, `/:id`, `/:id/editar`): crear, editar, activar/desactivar, mover de aeropuerto, ver vuelos y historial. |
| Reglas de negocio, restricciones y estados | Matrícula única; capacidad de tripulación ≥ la asignada; la edición se rechaza si está en vuelo; el equipamiento no puede retirarse si un vuelo lo requiere; no se desactiva con vuelos asignados; el estado activo y la ubicación se cambian con operaciones propias. La disponibilidad se **calcula** a partir de los vuelos (no se guarda). |
| Efectos sobre otras funciones y datos que crea o modifica | Escribe `aeronaves` y `eventos_auditoria`. Condiciona la asignación de recursos y el inicio del vuelo. |
| Servicios y endpoints | [`CatalogController`](../backend-java/src/main/java/com/vuelossanitarios/backend/api/CatalogController.java) (`/api/catalogs/aircraft…`); [`AircraftAdminService`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/AircraftAdminService.java). |
| Componentes del frontend | [`AircraftListPage.jsx`](../frontend-react/src/features/aircraft/AircraftListPage.jsx), [`AircraftFormPage.jsx`](../frontend-react/src/features/aircraft/AircraftFormPage.jsx), [`AircraftDetailPage.jsx`](../frontend-react/src/features/aircraft/AircraftDetailPage.jsx). |
| Estado real de implementación | Implementado; cubierto por pruebas automáticas que pasan en este commit (`AircraftAdminServiceTest`, `AircraftAdministrationIntegrationTest`, `AircraftCatalogIntegrationTest`, `AircraftPages.test`). |
| Evidencia en el código | V18, V24; sin cambios de servicio desde V62. |

### F08 · Catálogo geográfico (provincias, localidades, aeropuertos)

| Aspecto | Detalle |
|---|---|
| Objetivo y problema que resuelve | Mantener el catálogo del que dependen las jurisdicciones y los aeropuertos. |
| Roles y acciones | Administrador. |
| Funcionamiento paso a paso | «Geografía» (`/app/geografia`): alta, edición y activación/desactivación con control de dependencias (`GeographicDependencyService`) y bloqueo jerárquico. |
| Reglas de negocio, restricciones y estados | No se deshabilita lo que tiene dependencias vigentes (vuelos abiertos, rutas, coordinaciones, aeronaves, comandantes). Un aeropuerto **sin provincia conocida** no puede usarse en decisiones geográficas (`AIRPORT_PROVINCE_UNKNOWN`). Datos iniciales por migración (V16, V17, V26; coordenadas V65). |
| Efectos sobre otras funciones y datos que crea o modifica | Escribe `provincias`, `localidades`, `aeropuertos`, `eventos_auditoria`. |
| Servicios y endpoints | [`GeographicCatalogAdminController`](../backend-java/src/main/java/com/vuelossanitarios/backend/api/GeographicCatalogAdminController.java) (`/api/admin/geography/*`); [`GeographicCatalogService`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/GeographicCatalogService.java), [`GeographicDependencyService`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/GeographicDependencyService.java), [`AirportLocks`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/AirportLocks.java). |
| Componentes del frontend | [`geography.jsx`](../frontend-react/src/features/catalogs/geography.jsx), [`AdminPages.jsx`](../frontend-react/src/features/admin/AdminPages.jsx). |
| Estado real de implementación | Implementado; cubierto por pruebas automáticas que pasan en este commit (`GeographicIntegrityIntegrationTest`, `GeographicCatalogDatasetTest`, `geography.test`). Persiste un alta heredada incompleta (`POST /api/catalogs/airports`, §10). |
| Evidencia en el código | V15, V16/V17/V26, V56, V65. |

### F09 · Catálogos de consulta

| Aspecto | Detalle |
|---|---|
| Objetivo y problema que resuelve | Alimentar selectores (prioridades, motivos de cancelación, tipos de vuelo y de documento, funciones de tripulación, provincias, localidades, aeropuertos). |
| Roles y acciones | Según el catálogo, DTS, Operaciones, Comandante y/o Administrador (sólo lectura). |
| Funcionamiento paso a paso | `GET /api/catalogs/*` (p. ej. `flight-types?operationalOnly=true` para el alta operativa). |
| Reglas de negocio, restricciones y estados | Sólo lectura; los catálogos de estados, prioridades, tipos y motivos cambian únicamente por migración. |
| Efectos sobre otras funciones y datos que crea o modifica | Ninguna escritura. |
| Servicios y endpoints | [`CatalogController`](../backend-java/src/main/java/com/vuelossanitarios/backend/api/CatalogController.java). |
| Componentes del frontend | Selectores de `NewRequestForm`, `OperationalFlightForm`, `CancelFlightDialog`, etc. |
| Estado real de implementación | Implementado; sin verificación de ejecución propia |
| Evidencia en el código | V1, V21, V23, V25. |

### F10 · Pacientes

| Aspecto | Detalle |
|---|---|
| Objetivo y problema que resuelve | Reutilizar la identidad del paciente entre solicitudes y corregir errores de identidad. |
| Roles y acciones | DTS y Administrador buscan; Administrador consulta el detalle, corrige identidad/DNI y ve el historial de correcciones; `POST /api/patients` lo permiten DTS, Operaciones y CO. |
| Funcionamiento paso a paso | «Pacientes» (`/app/pacientes`, Administrador); en «Nueva solicitud» el DTS busca por DNI, nombre y apellido (nunca hay un listado sin filtro) o registra al paciente junto con la solicitud. |
| Reglas de negocio, restricciones y estados | Rectificación de DNI sólo del Administrador, con motivo, cotejo documental declarado y versión de la identidad (control optimista); las identidades compartidas con usuarios se corrigen en conjunto. |
| Efectos sobre otras funciones y datos que crea o modifica | Escribe `personas`, `pacientes`, `eventos_auditoria`. |
| Servicios y endpoints | [`PatientController`](../backend-java/src/main/java/com/vuelossanitarios/backend/api/PatientController.java); [`PatientService`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/PatientService.java), [`PatientDirectoryService`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/PatientDirectoryService.java), [`PersonIdentityService`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/PersonIdentityService.java). |
| Componentes del frontend | [`patients.jsx`](../frontend-react/src/features/patients/patients.jsx), [`NewRequestForm.jsx`](../frontend-react/src/features/flights/components/NewRequestForm.jsx). |
| Estado real de implementación | Implementado; cubierto por pruebas automáticas que pasan en este commit (`PatientServiceIdentityTest`, `PatientDniRectificationIntegrationTest`, `patients.test`). Ninguna pantalla invoca el alta directa `POST /api/patients`. |
| Evidencia en el código | V4, V47, V48. |

### F11 · Solicitud de vuelo sanitario

| Aspecto | Detalle |
|---|---|
| Objetivo y problema que resuelve | Que el DTS pida un traslado con los datos mínimos para que Operaciones lo evalúe. |
| Roles y acciones | DTS crea. Operaciones, Administrador y el DTS solicitante consultan. |
| Funcionamiento paso a paso | «Nueva solicitud» (`/app/solicitudes/nueva`): paciente (existente o nuevo), localidad de origen y destino, prioridad, motivo, fecha y hora solicitadas, extrema urgencia (justificación y límite), datos médicos y hasta cinco contactos de coordinación → `POST /api/flights` o `/with-patient` → `SanitaryRequestRegistrationService` → `FlightService.create` (una transacción). |
| Reglas de negocio, restricciones y estados | `FlightUrgencyPolicy`: no se admite el pasado; un vuelo ordinario sólo para pasado mañana o después; la extrema urgencia exige justificación y un límite ≥ la fecha solicitada. Diagnóstico y condición médica obligatorios; localidades activas y distintas. Estados: la solicitud nace SOLICITADO y el vuelo sin estado. |
| Efectos sobre otras funciones y datos que crea o modifica | Escribe `vuelos`, `vuelos_sanitarios`, `informacion_medica_vuelo`, `negociaciones_horario_vuelo` (DTS_PROPUESTA), `contactos_coordinacion_traslado`, `personas`/`pacientes` si el paciente es nuevo, `notificaciones` (a Operaciones; extra si hay extrema urgencia) y `eventos_auditoria`. |
| Servicios y endpoints | [`FlightController`](../backend-java/src/main/java/com/vuelossanitarios/backend/api/FlightController.java), [`PatientController`](../backend-java/src/main/java/com/vuelossanitarios/backend/api/PatientController.java); [`FlightService`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/FlightService.java), [`FlightUrgencyPolicy`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/FlightUrgencyPolicy.java), [`SanitaryRequestRegistrationService`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/SanitaryRequestRegistrationService.java). |
| Componentes del frontend | [`NewRequestPage.jsx`](../frontend-react/src/features/flights/pages/NewRequestPage.jsx), [`NewRequestForm.jsx`](../frontend-react/src/features/flights/components/NewRequestForm.jsx), [`Urgency.jsx`](../frontend-react/src/features/flights/components/Urgency.jsx). |
| Estado real de implementación | Implementado; cubierto por pruebas automáticas que pasan en este commit (`FlightUrgencyPolicyTest`, `RequestNegotiationServiceTest`, `requests.test`, `dts.test`). |
| Evidencia en el código | V4–V7, V23, V44, V51. |

### F12 · Contactos de coordinación del traslado

| Aspecto | Detalle |
|---|---|
| Objetivo y problema que resuelve | Tener a quién llamar (familiar, clínica de origen/destino) sin crear usuarios. |
| Roles y acciones | DTS solicitante agrega, edita, retira y marca principal; Operaciones y DTS consultan. |
| Funcionamiento paso a paso | Detalle de la solicitud → «Personal y contactos» → contactos del traslado. |
| Reglas de negocio, restricciones y estados | Hasta 5 contactos; teléfono normalizado (6 a 16 dígitos); relación del conjunto {PACIENTE, FAMILIAR_RESPONSABLE, ESTABLECIMIENTO_ORIGEN, ESTABLECIMIENTO_DESTINO, OTRO}; un solo principal; baja lógica. |
| Efectos sobre otras funciones y datos que crea o modifica | Escribe `contactos_coordinacion_traslado` y auditoría. |
| Servicios y endpoints | [`TransferContactController`](../backend-java/src/main/java/com/vuelossanitarios/backend/api/TransferContactController.java); [`TransferContactService`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/TransferContactService.java). |
| Componentes del frontend | [`transferContacts.jsx`](../frontend-react/src/features/flights/transferContacts.jsx). |
| Estado real de implementación | Implementado; cubierto por pruebas automáticas que pasan en este commit (`TransferContactIntegrationTest`, `transferContacts.test`). |
| Evidencia en el código | V51. |

### F13 · Evaluación y negociación del horario

| Aspecto | Detalle |
|---|---|
| Objetivo y problema que resuelve | Que DTS y Operaciones acuerden la salida antes de comprometer recursos. |
| Roles y acciones | Operaciones/CO: aprobar, contraproponer, rechazar. DTS solicitante: aceptar o rechazar la contrapropuesta. |
| Funcionamiento paso a paso | Pestaña «Negociación»: **aprobar** (`POST /api/flights/{id}/schedule/accept`) fija la salida solicitada; **contraproponer** (`…/counterproposal`) con otro horario y motivo; **rechazar** (`…/schedule/reject`) con motivo del catálogo; el DTS responde con `…/schedule/response`. |
| Reglas de negocio, restricciones y estados | Aprobar exige SOLICITADO y horario futuro; una contraproposición exige horario distinto, futuro y ≤ al límite de urgencia; una nueva contrapropuesta reemplaza a la anterior mientras el DTS no respondió; sólo se puede responder la propuesta vigente; el rechazo es **definitivo**; si el DTS rechaza la contrapropuesta la solicitud queda CANCELADA. **Estados de la solicitud:** SOLICITADO → (APROBADO \| PENDIENTE_RESPUESTA_DTS → APROBADO/CANCELADO \| RECHAZADO). |
| Efectos sobre otras funciones y datos que crea o modifica | Escribe `negociaciones_horario_vuelo` (historial inmutable por convención), `vuelos_sanitarios` (estado, evaluador, fecha), `vuelos.fecha_planificada_salida`, `notificaciones`, `eventos_auditoria`; reevalúa la ruta. **Habilita** las etapas posteriores (documentos, preparación, recursos). |
| Servicios y endpoints | [`FlightController`](../backend-java/src/main/java/com/vuelossanitarios/backend/api/FlightController.java); [`FlightService`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/FlightService.java) (`acceptRequestedSchedule`, `counterproposal`, `respondToCounterproposal`, `rejectDirectly`). |
| Componentes del frontend | [`NegotiationTab.jsx`](../frontend-react/src/features/flights/tabs/NegotiationTab.jsx), [`negotiation.jsx`](../frontend-react/src/features/flights/negotiation.jsx), [`DtsScheduleResponse.jsx`](../frontend-react/src/features/flights/components/DtsScheduleResponse.jsx), [`requestInbox.jsx`](../frontend-react/src/features/flights/requestInbox.jsx). |
| Estado real de implementación | Implementado; cubierto por pruebas automáticas que pasan en este commit (`RequestNegotiationServiceTest`, `requestInbox.test`, `dts-stage.test`). |
| Evidencia en el código | V20, V29, V44. |

### F14 · Cancelación de solicitudes y vuelos

| Aspecto | Detalle |
|---|---|
| Objetivo y problema que resuelve | Cerrar un vuelo antes de su ejecución dejando constancia y liberando recursos. |
| Roles y acciones | Operaciones/CO cancelan cualquier vuelo; el DTS sólo su propia solicitud; el comandante **no** cancela (rechaza asignaciones). |
| Funcionamiento paso a paso | «Cancelar» en el detalle (`CancelFlightDialog`) → `POST /api/flights/{id}/cancel` con motivo del catálogo (el motivo OTRO exige texto). |
| Reglas de negocio, restricciones y estados | Cancelable: solicitud SOLICITADO/PENDIENTE_RESPUESTA_DTS/APROBADO con el vuelo sin estado o PLANIFICADO; vuelo operativo en estados pendientes o PLANIFICADO. Una solicitud RECHAZADA no se cancela. La solicitud se cancela **antes** que el vuelo (lo exige un trigger). Los recursos quedan libres porque CANCELADO no cuenta como compromiso. |
| Efectos sobre otras funciones y datos que crea o modifica | Actualiza `vuelos_sanitarios` y `vuelos` (fecha, actor y motivo de cancelación), `bitacora_vuelos` (hito), `notificaciones` y auditoría; revalida los itinerarios de la tripulación liberada. |
| Servicios y endpoints | [`FlightController`](../backend-java/src/main/java/com/vuelossanitarios/backend/api/FlightController.java); [`FlightService`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/FlightService.java) (`cancel`, `cancelFlight`). |
| Componentes del frontend | [`CancelFlightDialog.jsx`](../frontend-react/src/features/flights/detail/CancelFlightDialog.jsx), [`CancellationNote.jsx`](../frontend-react/src/features/flights/components/CancellationNote.jsx). |
| Estado real de implementación | Implementado; cubierto por pruebas automáticas que pasan en este commit (`OperationalFlightServiceTest`, `FlightClosureServiceTest`, `FlightDetailPage.test`). |
| Evidencia en el código | V2, V3, V21, V30, V44. |

### F15 · Gestión por etapas (compuertas de horario acordado)

| Aspecto | Detalle |
|---|---|
| Objetivo y problema que resuelve | Evitar que se cargue documentación o preparación mientras el horario sigue en negociación. |
| Roles y acciones | Todos los roles que operan sobre el vuelo. |
| Funcionamiento paso a paso | El servidor evalúa el estado de la solicitud en cada operación (no lo copia): `DocumentScheduleGate` (documentos) y `PreparationStageGate` (hangar, coordinaciones aeroportuarias y bitácora manual). El frontend deriva la **etapa** (`flightStage`) y muestra sólo las pestañas/secciones que corresponden (`visibleSections`, `tabsFor`). |
| Reglas de negocio, restricciones y estados | Etapas: NEGOCIACION (SOLICITADO, PENDIENTE_RESPUESTA_DTS) → ACORDADO (APROBADO) → PREPARACION (PLANIFICADO y pendientes operativos) → EJECUCION (EN_CURSO) → CIERRE (FINALIZADO/COMPLETADO) → CERRADA (RECHAZADO/CANCELADO; un cancelado tras acuerdo conserva su historial). Las operaciones fuera de etapa responden **409** (`DOCUMENTS_LOCKED_SCHEDULE_NOT_AGREED`, `SCHEDULE_NOT_AGREED`). |
| Efectos sobre otras funciones y datos que crea o modifica | No escribe. Si la negociación se reabre, la documentación vuelve a bloquearse sola sin alterar versiones. |
| Servicios y endpoints | [`DocumentScheduleGate`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/DocumentScheduleGate.java), [`PreparationStageGate`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/PreparationStageGate.java). |
| Componentes del frontend | [`flightStages.js`](../frontend-react/src/features/flights/flightStages.js), [`flightTabs.js`](../frontend-react/src/features/flights/detail/flightTabs.js), [`nextStep.js`](../frontend-react/src/features/flights/detail/nextStep.js). |
| Estado real de implementación | Implementado; cubierto por pruebas automáticas que pasan en este commit (`DocumentScheduleGateTest`, `SanitaryDocumentGateIntegrationTest`, `flightStages.test`, `FlightDetailPage.test`). |
| Evidencia en el código | Doc. `SOLICITUDES_Y_BLOQUEO_DOCUMENTAL_HORARIO_2026-11-01.md`; `DETALLE_POR_ETAPAS_SOLICITUDES_SANITARIAS_2026-11-02.md`. |

### F16 · Aeropuertos de salida y llegada (propuesto / confirmado)

| Aspecto | Detalle |
|---|---|
| Objetivo y problema que resuelve | Distinguir la necesidad sanitaria (localidad del paciente) de la ejecución aeronáutica (aeropuerto) y exigir la confirmación del comandante. |
| Roles y acciones | Operaciones/CO proponen o cambian (con horario acordado, vuelo APROBADO o PLANIFICADO); el comandante asignado confirma o ajusta en PLANIFICADO. |
| Funcionamiento paso a paso | `GET …/airport-candidates?tipo=SALIDA\|LLEGADA` (`AirportCandidateService`): primero los aeropuertos activos de la misma provincia/CABA que la localidad del paciente, luego los más cercanos de otras jurisdicciones o los que halle la búsqueda; el orden es por **distancia en línea recta** entre el centroide de la localidad y el aeropuerto (aproximación declarada; no es tiempo de traslado). `PUT /api/flights/{id}/airports` (propone: estado PROPUESTO) y `POST …/operational-planning` (el comandante confirma: CONFIRMADO). |
| Reglas de negocio, restricciones y estados | Un aeropuerto de otra provincia que la del paciente exige justificación (≥ 10 caracteres). Si el cambio deja al comandante fuera de la nueva jurisdicción se exige **otro comandante** o una **excepción**; si no, se rechaza todo el cambio. Una ruta presentada o aprobada pasa a REQUIERE_REVISION. El **inicio** del vuelo sanitario exige ambos aeropuertos CONFIRMADOS (`AEROPUERTOS_SIN_CONFIRMAR`). |
| Efectos sobre otras funciones y datos que crea o modifica | Escribe `vuelos` (aeropuertos, estados, `id_usuario_aeropuertos`, `fecha_aeropuertos`), `rutas_vuelo` (reevaluación), `notificaciones` (AIRPORTS_PROPOSED / AIRPORTS_CHANGED_BY_COMMANDER) y auditoría (SET_AIRPORTS / OPERATIONAL_PLANNING). |
| Servicios y endpoints | [`AirportPlanningController`](../backend-java/src/main/java/com/vuelossanitarios/backend/api/AirportPlanningController.java), [`FlightController`](../backend-java/src/main/java/com/vuelossanitarios/backend/api/FlightController.java); [`AirportCandidateService`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/AirportCandidateService.java), [`FlightService`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/FlightService.java) (`setAirports`, `configureOperationalPlanning`). |
| Componentes del frontend | [`airportPlanning.jsx`](../frontend-react/src/features/flights/airportPlanning.jsx), [`OperationalAirportSelector.jsx`](../frontend-react/src/features/flights/components/OperationalAirportSelector.jsx), [`PlanningTab.jsx`](../frontend-react/src/features/flights/tabs/PlanningTab.jsx). |
| Estado real de implementación | Implementado; cubierto por pruebas automáticas que pasan en este commit (`AirportCandidateServiceTest`, `airportPlanning.test`, `ResourceAssignmentAuthorizationTest`). |
| Evidencia en el código | V64/V65; commit `a51bb26`; doc. `CORRECCION_GEOGRAFICA_COMANDANTES_Y_AEROPUERTOS_V64_2026-11-02.md`. |

### F17 · Asignación de comandante y aeronave (reserva, regla geográfica y excepción)

| Aspecto | Detalle |
|---|---|
| Objetivo y problema que resuelve | Comprometer los recursos del vuelo respetando disponibilidad, capacidad y jurisdicción. |
| Roles y acciones | Operaciones/CO eligen; **sólo CO autoriza una excepción geográfica**. |
| Funcionamiento paso a paso | Pestaña «Planificación»: `GET …/commander-candidates` (ordinarios, no aptos con su causa y candidatos a excepción), `GET …/aircraft-candidates`; `PUT …/commander`, `PUT …/assigned-aircraft` o `POST …/resources` (ambos). Con uno solo elegido la elección queda **reservada** (el vuelo sigue APROBADO y el comandante no lo ve); al completarse el par el vuelo pasa a **PLANIFICADO** (`completeAssignment`). |
| Reglas de negocio, restricciones y estados | Elegibilidad (`CrewManagementService.evaluate`): cuenta activa, rol COMANDANTE con licencia registrada, sin informes finales vencidos (sólo el principal) y sin otro vuelo superpuesto (CONFLICTO u horario INDETERMINADO). Geografía (`CommanderGeography`): la jurisdicción (provincia/CABA) del comandante —su ubicación registrada o, según su itinerario, la de llegada de su vuelo anterior— debe ser la del **aeropuerto de salida** (preliminar con la provincia de la localidad de origen solicitada mientras no haya aeropuerto). Fuera de ella: excepción con justificación ≥ 15 caracteres, sólo CO. Aeronave: activa, fuera de vuelo, sin vuelo comprometido en el horario, con capacidad para comandante + copiloto + personal sanitario y ubicada en la jurisdicción de salida y, si el vuelo ya tiene aeropuerto de salida, en ese aeropuerto exacto. Aislamiento SERIALIZABLE y bloqueo de aeronave y personas. |
| Efectos sobre otras funciones y datos que crea o modifica | Escribe `vuelos`, `vuelos_tripulantes` (alta del comandante; baja `CAMBIO_COMANDANTE` del anterior), `excepciones_geograficas_comandante`, `rutas_vuelo` (reevaluación), `notificaciones` (COMMANDER_ASSIGNED / UNASSIGNED) y auditoría (`ASSIGN_RESOURCES`, `ASSIGN_FLIGHT_COMMANDER`, `ASSIGN_FLIGHT_AIRCRAFT`, `COMMANDER_GEOGRAPHIC_EXCEPTION`). |
| Servicios y endpoints | [`FlightController`](../backend-java/src/main/java/com/vuelossanitarios/backend/api/FlightController.java); [`FlightService`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/FlightService.java), [`CrewManagementService`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/CrewManagementService.java), [`CommanderGeography`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/CommanderGeography.java). |
| Componentes del frontend | [`resourceAssignment.jsx`](../frontend-react/src/features/flights/resourceAssignment.jsx), [`crewRequirements.jsx`](../frontend-react/src/features/flights/crewRequirements.jsx), [`CommanderAssignment.jsx`](../frontend-react/src/features/flights/components/CommanderAssignment.jsx). |
| Estado real de implementación | Implementado; cubierto por pruebas automáticas que pasan en este commit (`CrewManagementServiceTest`, `CrewEligibilityTest`, `CommanderGeographyTest`, `AircraftAssignmentFlightServiceTest`, `AircraftCrewConcurrencyIntegrationTest`, `resourceAssignment.test`). |
| Evidencia en el código | V63/V64/V66; commits `0257f32`, `99a786a`, `a51bb26`, `d3aab49`. |

### F18 · Copiloto

| Aspecto | Detalle |
|---|---|
| Objetivo y problema que resuelve | Sumar un segundo piloto sin crear otro tipo de usuario. |
| Roles y acciones | Operaciones/CO asignan, cambian o retiran. |
| Funcionamiento paso a paso | Sección «Copiloto» de la planificación: «Seleccionar/Cambiar copiloto» (`POST /api/flights/{id}/crew` con `COPILOTO`; `PUT …/crew/{crewId}`; `DELETE`). El copiloto es **otro usuario COMANDANTE** distinto del principal. |
| Reglas de negocio, restricciones y estados | Cuenta activa, rol COMANDANTE, licencia registrada, disponibilidad y misma regla de jurisdicción (incluida la excepción, con función COPILOTO). El bloqueo por informes finales vencidos corresponde al comandante principal; no puede ser a la vez el comandante principal (`COPILOT_IS_COMMANDER`); cuenta para la capacidad de la aeronave. Recibe la notificación `CREW_ASSIGNED` («no recibe tareas del comandante principal»); **no tiene acceso de lectura al vuelo** (§10). |
| Efectos sobre otras funciones y datos que crea o modifica | Escribe `vuelos_tripulantes`, `excepciones_geograficas_comandante`, `notificaciones`, auditoría; revalida itinerarios. |
| Servicios y endpoints | [`FlightController`](../backend-java/src/main/java/com/vuelossanitarios/backend/api/FlightController.java); [`FlightService`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/FlightService.java) (`assignCopilot`, `replaceCopilot`, `removeCrew`), [`CrewManagementService`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/CrewManagementService.java). |
| Componentes del frontend | [`resourceAssignment.jsx`](../frontend-react/src/features/flights/resourceAssignment.jsx), [`FlightCrew.jsx`](../frontend-react/src/features/flights/components/FlightCrew.jsx), [`TeamTab.jsx`](../frontend-react/src/features/flights/tabs/TeamTab.jsx). |
| Estado real de implementación | Implementado; cubierto por pruebas automáticas que pasan en este commit (`CrewManagementServiceTest`, `CrewCompatibilityTest`, `copilot.test`). |
| Evidencia en el código | V45, V66. |

### F19 · Catálogo de personal sanitario del DTS

| Aspecto | Detalle |
|---|---|
| Objetivo y problema que resuelve | Que cada DTS administre sus médicos y enfermeros sin darles cuenta. |
| Roles y acciones | DTS (cada uno sólo el suyo). |
| Funcionamiento paso a paso | «Personal sanitario» (`/app/personal-sanitario`): «Registrar profesional», «Editar», «Desactivar/Reactivar». |
| Reglas de negocio, restricciones y estados | DNI de 6 a 10 dígitos; la identidad existente se reutiliza sólo si nombre y apellido coinciden; una persona una vez por catálogo; matrícula única por tipo dentro del catálogo; control de versión (`STAFF_STALE`); el DTS puede cambiar el tipo o desactivar al profesional si no tiene participaciones vigentes en vuelos abiertos (`STAFF_IN_USE` en caso contrario); no se edita una identidad compartida con usuarios, pacientes u otro profesional. La matrícula es el **único dato de credencial sanitaria declarado**. |
| Efectos sobre otras funciones y datos que crea o modifica | Escribe `personas` (si es nueva), `personal_sanitario` y auditoría `HEALTH_STAFF`. |
| Servicios y endpoints | [`HealthStaffController`](../backend-java/src/main/java/com/vuelossanitarios/backend/api/HealthStaffController.java); [`HealthStaffService`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/HealthStaffService.java). |
| Componentes del frontend | [`healthStaff.jsx (HealthStaffCatalog)`](../frontend-react/src/features/health-staff/healthStaff.jsx). |
| Estado real de implementación | Implementado; cubierto por pruebas automáticas que pasan en este commit (`HealthStaffServiceTest`, `healthStaff.test`). |
| Evidencia en el código | V66; commits `d3aab49`, `cadceab`. |

### F20 · Personal sanitario del vuelo

| Aspecto | Detalle |
|---|---|
| Objetivo y problema que resuelve | Indicar quién acompaña al paciente en cada traslado. |
| Roles y acciones | DTS solicitante asigna, sustituye y retira; lo ven DTS, Operaciones, Administración y el comandante (la respuesta del vuelo omite el DNI para todos; el catálogo del DTS dueño sí lo muestra). |
| Funcionamiento paso a paso | Detalle de la solicitud → «Personal y contactos» → «Agregar profesional» → «Asignar al vuelo»; «Sustituir» y «Retirar». |
| Reglas de negocio, restricciones y estados | Sólo con la solicitud APROBADA (horario acordado) y el vuelo sin iniciar; profesional del propio catálogo, activo, no repetido y sin otro vuelo superpuesto. Retirar o sustituir **da de baja** (RETIRO/REEMPLAZO) y conserva el historial. **No se compara con la capacidad de la aeronave** al agregar (§10). |
| Efectos sobre otras funciones y datos que crea o modifica | Escribe `vuelos_personal_sanitario` y auditoría `FLIGHT_HEALTH_STAFF`; cuenta en la capacidad al asignar aeronave/comandante/copiloto. |
| Servicios y endpoints | [`HealthStaffController`](../backend-java/src/main/java/com/vuelossanitarios/backend/api/HealthStaffController.java); [`HealthStaffService`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/HealthStaffService.java). |
| Componentes del frontend | [`healthStaff.jsx (FlightHealthStaff)`](../frontend-react/src/features/health-staff/healthStaff.jsx), [`TeamTab.jsx`](../frontend-react/src/features/flights/tabs/TeamTab.jsx). |
| Estado real de implementación | Implementado; cubierto por pruebas automáticas que pasan en este commit (`HealthStaffServiceTest`, `healthStaff.test`). |
| Evidencia en el código | V66. |

### F21 · Itinerario de la tripulación y revalidación

| Aspecto | Detalle |
|---|---|
| Objetivo y problema que resuelve | Deducir dónde estará una persona al despegar sin tocar su ubicación registrada y avisar si un cambio deja incoherente un vuelo posterior. |
| Roles y acciones | Sistema (dentro de las acciones de Operaciones y en un barrido horario). |
| Funcionamiento paso a paso | `CrewItineraryService.positionAt/projectionsAt` calculan la ubicación prevista a partir de los vuelos abiertos de la persona; `revalidate` revisa sus vuelos posteriores tras asignar, cambiar aeropuertos, retirar o cancelar; `CrewEligibilityMonitoringService.sweep` repite la revisión cada hora. |
| Reglas de negocio, restricciones y estados | La ubicación real sólo cambia cuando un vuelo **termina de verdad**. El sistema **nunca quita a nadie en silencio**: avisa a Operaciones una sola vez por situación (clave de deduplicación) y audita `ITINERARY_REVIEW_REQUIRED`/`ELIGIBILITY_REVIEW_REQUIRED`. |
| Efectos sobre otras funciones y datos que crea o modifica | Escribe `notificaciones` (CREW_ITINERARY_REVIEW, CREW_ELIGIBILITY_REVIEW) y `eventos_auditoria`. |
| Servicios y endpoints | [`CrewItineraryService`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/CrewItineraryService.java), [`CrewEligibilityMonitoringService`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/CrewEligibilityMonitoringService.java). |
| Componentes del frontend | Estado «ITINERARIO_INCOHERENTE» visible en la tripulación (`FlightCrew`). |
| Estado real de implementación | Implementado; cubierto por pruebas automáticas que pasan en este commit (`CrewItineraryServiceTest`, `CrewEligibilityTest`). |
| Evidencia en el código | V66; commit `d3aab49`. |

### F22 · Vuelos no sanitarios (operativos)

| Aspecto | Detalle |
|---|---|
| Objetivo y problema que resuelve | Programar reposicionamientos, entrenamientos, regresos a base y traslados operativos sin DTS ni paciente. |
| Roles y acciones | Operaciones/CO/Administrador (backend) crean; el menú sólo lo ofrece al área Operaciones; el comandante asignado responde; Operaciones responde a su propuesta y replanifica. |
| Funcionamiento paso a paso | «Nuevo vuelo» (`/app/vuelos/nuevo`) → `POST /api/flights/operational` (SERIALIZABLE): tipo ≠ SANITARIO, aeronave activa (el **origen es su ubicación actual**), destino, comandante, salida y llegada. |
| Reglas de negocio, restricciones y estados | Llegada posterior a la salida; destino activo y ≠ origen; comandante elegible y ubicado, según su itinerario, en la provincia del aeropuerto de origen; sin solapamientos de aeronave ni de tripulación. **Estados:** PENDIENTE_CONFIRMACION_COMANDANTE → (PLANIFICADO \| PENDIENTE_RESPUESTA_OPERACIONES \| PENDIENTE_REPLANIFICACION) → EN_CURSO → FINALIZADO → COMPLETADO (o CANCELADO). |
| Efectos sobre otras funciones y datos que crea o modifica | Escribe `vuelos`, `vuelos_tripulantes`, `negociaciones_horario_vuelo`, `notificaciones`, auditoría. |
| Servicios y endpoints | [`FlightController`](../backend-java/src/main/java/com/vuelossanitarios/backend/api/FlightController.java); [`FlightService`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/FlightService.java) (`createOperational`, `respondToOperationalAssignment`, `respondToCommanderProposal`, `replanOperational`). |
| Componentes del frontend | [`NewOperationalFlightPage.jsx`](../frontend-react/src/features/flights/pages/NewOperationalFlightPage.jsx), [`OperationalFlightForm.jsx`](../frontend-react/src/features/flights/components/OperationalFlightForm.jsx), [`OperationalReplanning.jsx`](../frontend-react/src/features/flights/components/OperationalReplanning.jsx), [`CommanderProposalResponse.jsx`](../frontend-react/src/features/flights/components/CommanderProposalResponse.jsx). |
| Estado real de implementación | Implementado; cubierto por pruebas automáticas que pasan en este commit (`OperationalFlightServiceTest`, `operationalFlightForm.test`). |
| Evidencia en el código | V23, V34, V44. |

### F23 · Clima

| Aspecto | Detalle |
|---|---|
| Objetivo y problema que resuelve | Dejar registrado el pronóstico considerado por el comandante. |
| Roles y acciones | Comandante asignado registra (vuelo PLANIFICADO); todos con acceso lo consultan. |
| Funcionamiento paso a paso | `POST /api/flights/{id}/weather` (condiciones, favorable/no, observaciones); cada registro es una instantánea histórica. |
| Reglas de negocio, restricciones y estados | Condiciones obligatorias; sólo con el vuelo PLANIFICADO; un comandante con informe final vencido no puede escribir. |
| Efectos sobre otras funciones y datos que crea o modifica | Escribe `instantaneas_clima` y auditoría. |
| Servicios y endpoints | [`FlightController`](../backend-java/src/main/java/com/vuelossanitarios/backend/api/FlightController.java); [`FlightService`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/FlightService.java) (`registerWeather`). |
| Componentes del frontend | [`WeatherLog.jsx`](../frontend-react/src/features/flights/components/WeatherLog.jsx). |
| Estado real de implementación | Implementado; cobertura automática parcial (`CommanderWriteEndpointsGuardTest`; sin prueba funcional propia del servicio). |
| Evidencia en el código | V2, V21. |

### F24 · Ruta del vuelo (planificación y revisión)

| Aspecto | Detalle |
|---|---|
| Objetivo y problema que resuelve | Que el comandante proponga la ruta y Operaciones la apruebe antes del inicio. |
| Roles y acciones | Comandante asignado: guardar y presentar; Operaciones/CO: aprobar o devolver (nunca quien la presentó); todos con acceso consultan. |
| Funcionamiento paso a paso | `PUT /api/flights/{id}/route` (nueva versión BORRADOR), `POST …/submit`, `…/approve`, `…/return` (observaciones ≥ 10 caracteres). Cualquier cambio material del vuelo (aeronave, comandante, aeropuertos, horarios) invalida la versión vigente (`reassess` → REQUIERE_REVISION). |
| Reglas de negocio, restricciones y estados | Estados: BORRADOR → PENDIENTE_REVISION → APROBADA \| DEVUELTA; REQUIERE_REVISION. Primero deben estar definidos aeropuertos y horarios; versión desactualizada ⇒ 409; autorrevisión prohibida (`AUTOREVISION_RUTA_NO_PERMITIDA`). El **inicio** del vuelo exige ruta APROBADA y vigente (`RUTA_*`). |
| Efectos sobre otras funciones y datos que crea o modifica | Escribe `rutas_vuelo` (versionada), `notificaciones` (ROUTE_PENDING_REVIEW, ROUTE_APPROVED…), auditoría. |
| Servicios y endpoints | [`FlightRouteController`](../backend-java/src/main/java/com/vuelossanitarios/backend/api/FlightRouteController.java), [`FlightRouteStatusController`](../backend-java/src/main/java/com/vuelossanitarios/backend/api/FlightRouteStatusController.java); [`FlightRouteService`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/FlightRouteService.java). |
| Componentes del frontend | [`flightRoute.jsx`](../frontend-react/src/features/flights/flightRoute.jsx), [`useRouteStatuses.js`](../frontend-react/src/features/flights/useRouteStatuses.js). |
| Estado real de implementación | Implementado; cubierto por pruebas automáticas que pasan en este commit (`FlightRouteServiceTest`, `FlightRouteReviewIntegrationTest`, `FlightRouteAuthorizationTest`, `flightRoute.test`). |
| Evidencia en el código | V37, V55; sin cambios de servicio desde V62. |

### F25 · Preparación en hangar

| Aspecto | Detalle |
|---|---|
| Objetivo y problema que resuelve | Registrar si el vuelo requiere hangar y si la preparación está completa. |
| Roles y acciones | Operaciones/CO guardan; el comandante agrega su observación; Administrador consulta. |
| Funcionamiento paso a paso | `PUT /api/flights/{id}/hangar` y `…/hangar/commander-observation`; versionado por fila con contexto (aeronave, origen, comandante) y detección de contexto desactualizado. |
| Reglas de negocio, restricciones y estados | Sólo desde que el horario está acordado (`SCHEDULE_NOT_AGREED`); la versión enviada debe ser la vigente; «preparación completa» exige hangar requerido, aeronave y origen y aeronave confirmada en el origen; no con el vuelo en curso. |
| Efectos sobre otras funciones y datos que crea o modifica | Escribe `informacion_hangar` (nueva versión) y auditoría. |
| Servicios y endpoints | [`HangarInfoController`](../backend-java/src/main/java/com/vuelossanitarios/backend/api/HangarInfoController.java); [`HangarInfoService`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/HangarInfoService.java). |
| Componentes del frontend | [`HangarInfo.jsx`](../frontend-react/src/features/flights/components/HangarInfo.jsx). |
| Estado real de implementación | Implementado; cubierto por pruebas automáticas que pasan en este commit (`HangarInfoServiceTest`, `components.test`). |
| Evidencia en el código | V39, V40. |

### F26 · Coordinaciones aeroportuarias

| Aspecto | Detalle |
|---|---|
| Objetivo y problema que resuelve | Registrar las gestiones con el operador aeroportuario por grupo. |
| Roles y acciones | Operaciones/CO registran; comandante, Operaciones y Administrador consultan. |
| Funcionamiento paso a paso | `PUT /api/flights/{id}/airport-coordinations/{group}` (versión por grupo). |
| Reglas de negocio, restricciones y estados | Sólo con horario acordado; transiciones de estado definidas por el servicio; la modificación lleva la versión consultada. |
| Efectos sobre otras funciones y datos que crea o modifica | Escribe `coordinaciones_aa2000` (versionada) y auditoría. |
| Servicios y endpoints | [`Aa2000CoordinationController`](../backend-java/src/main/java/com/vuelossanitarios/backend/api/Aa2000CoordinationController.java); [`Aa2000CoordinationService`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/Aa2000CoordinationService.java). |
| Componentes del frontend | [`AirportCoordinations.jsx`](../frontend-react/src/features/flights/components/AirportCoordinations.jsx). |
| Estado real de implementación | Implementado; cubierto por pruebas automáticas que pasan en este commit (`Aa2000CoordinationServiceTest`, `components.test`). |
| Evidencia en el código | V41. |

### F27 · Bitácora operativa

| Aspecto | Detalle |
|---|---|
| Objetivo y problema que resuelve | Dejar un registro cronológico, inmutable y corregible por entradas nuevas. |
| Roles y acciones | Operaciones y Comandante escriben; Administrador consulta. |
| Funcionamiento paso a paso | `POST /api/flights/{id}/log` (novedad manual) y `GET` paginado; los hitos INICIO, FINALIZACION y CANCELACION se generan solos. |
| Reglas de negocio, restricciones y estados | Inmutable por trigger (UPDATE/DELETE prohibidos); una corrección es una entrada nueva enlazada con motivo; la entrada manual de Operaciones se bloquea mientras la solicitud está en negociación. |
| Efectos sobre otras funciones y datos que crea o modifica | Escribe `bitacora_vuelos`. |
| Servicios y endpoints | [`FlightLogController`](../backend-java/src/main/java/com/vuelossanitarios/backend/api/FlightLogController.java); [`FlightLogService`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/FlightLogService.java). |
| Componentes del frontend | [`FlightLog.jsx`](../frontend-react/src/features/flights/components/FlightLog.jsx). |
| Estado real de implementación | Implementado; cubierto por pruebas automáticas que pasan en este commit (`FlightLogServiceTest`, `components.test`). |
| Evidencia en el código | V38. |

### F28 · Documentos de vuelo (PDF, versiones y bloqueo de edición)

| Aspecto | Detalle |
|---|---|
| Objetivo y problema que resuelve | Gestionar documentación con trazabilidad y sin ediciones simultáneas. |
| Roles y acciones | Comandante y Operaciones suben, versionan, bloquean y retiran; DTS, Operaciones y Comandante consultan y descargan (el **Administrador no** accede). |
| Funcionamiento paso a paso | Pestaña «Documentos»: `POST …/documents/pdf` (documento + versión 1), `POST /api/documents/{id}/versions/pdf`, `…/lock` (arrendamiento de 300 s configurable), `…/deactivate`, descarga autenticada por versión. |
| Reglas de negocio, restricciones y estados | Sólo PDF, tipo compatible con el tipo de vuelo; en sanitarios sólo con horario acordado (`DOCUMENTS_LOCKED_SCHEDULE_NOT_AGREED`); los vuelos cerrados rechazan escrituras; los documentos retirados los ven sólo Operaciones y el comandante del vuelo; la baja es lógica con motivo. |
| Efectos sobre otras funciones y datos que crea o modifica | Escribe `documentos_vuelo`, `versiones_documento_vuelo`, `bloqueos_documento_vuelo` y el archivo en el volumen privado (huella SHA-256). |
| Servicios y endpoints | [`DocumentController`](../backend-java/src/main/java/com/vuelossanitarios/backend/api/DocumentController.java); [`DocumentService`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/DocumentService.java), [`DocumentStorage`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/DocumentStorage.java), [`DocumentScheduleGate`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/DocumentScheduleGate.java). |
| Componentes del frontend | [`documents.jsx`](../frontend-react/src/features/flights/documents.jsx), [`DocumentsTab.jsx`](../frontend-react/src/features/flights/tabs/DocumentsTab.jsx). |
| Estado real de implementación | Implementado; cubierto por pruebas automáticas que pasan en este commit (`DocumentServiceTest`, `DocumentStorageTest`, `DocumentAuthorizationTest`, `documents.test`). |
| Evidencia en el código | V22, V31, V52, V53. |

### F29 · Inicio del vuelo

| Aspecto | Detalle |
|---|---|
| Objetivo y problema que resuelve | Pasar de planificado a en curso sólo cuando todo está en orden. |
| Roles y acciones | Operaciones/CO. |
| Funcionamiento paso a paso | «Iniciar vuelo» → `POST /api/flights/{id}/start` → `FlightService.start`. |
| Reglas de negocio, restricciones y estados | Estado PLANIFICADO; aeronave, origen, destino y horarios completos; comandante asignado y sin informes vencidos; (sanitarios) aeropuertos CONFIRMADOS; tripulación con cuenta vigente elegible (cuenta, perfil, informes del principal, disponibilidad); aeronave en el aeropuerto de origen; ruta APROBADA. El inicio omite el recuento de plazas de tripulación. Si falla por elegibilidad o ruta, el rechazo se audita en transacción propia. |
| Efectos sobre otras funciones y datos que crea o modifica | Escribe `vuelos` (`fecha_salida_real`, EN_CURSO), `bitacora_vuelos` (INICIO) y auditoría. |
| Servicios y endpoints | [`FlightController`](../backend-java/src/main/java/com/vuelossanitarios/backend/api/FlightController.java); [`FlightService`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/FlightService.java) (`start`). |
| Componentes del frontend | [`OperationTab.jsx`](../frontend-react/src/features/flights/tabs/OperationTab.jsx). |
| Estado real de implementación | Implementado; cubierto por pruebas automáticas que pasan en este commit (`CrewEligibilityTest`, `FlightRouteReviewIntegrationTest`, `FlightDetailPage.test`). |
| Evidencia en el código | V3, V42. |

### F30 · Finalización del vuelo

| Aspecto | Detalle |
|---|---|
| Objetivo y problema que resuelve | Cerrar la ejecución, reubicar recursos y abrir la obligación del informe. |
| Roles y acciones | Operaciones/CO. |
| Funcionamiento paso a paso | «Finalizar vuelo» → `POST /api/flights/{id}/finish`. |
| Reglas de negocio, restricciones y estados | Sólo desde EN_CURSO; aeronave activa y con ubicación. En una sola transacción: llegada real, FINALIZADO, la **aeronave pasa al aeropuerto de destino**, **comandante y copiloto pasan a la jurisdicción del aeropuerto de llegada**, se crea la obligación de informe (48 h) y la bitácora/auditoría. |
| Efectos sobre otras funciones y datos que crea o modifica | Escribe `vuelos`, `aeronaves`, `perfiles_comandante`, `obligaciones_informe_final`, `bitacora_vuelos`, `notificaciones`, auditoría. |
| Servicios y endpoints | [`FlightController`](../backend-java/src/main/java/com/vuelossanitarios/backend/api/FlightController.java); [`FlightService`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/FlightService.java) (`finish`, `relocateAfterFinish`), [`FinalReportWorkflowService`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/FinalReportWorkflowService.java). |
| Componentes del frontend | [`OperationTab.jsx`](../frontend-react/src/features/flights/tabs/OperationTab.jsx). |
| Estado real de implementación | Implementado; cubierto por pruebas automáticas que pasan en este commit (`FlightClosureServiceTest`, `ClosureTimelineTest`). |
| Evidencia en el código | V7, V42, V43. |

### F31 · Informe final y obligación del comandante

| Aspecto | Detalle |
|---|---|
| Objetivo y problema que resuelve | Garantizar que cada vuelo finalizado se cierre con un informe revisado. |
| Roles y acciones | Comandante: presentar y pedir prórroga; Operaciones/CO: aprobar o devolver; Administrador: consultar. |
| Funcionamiento paso a paso | `/app/informes`: `POST /api/final-reports/{id}/submit` (texto y/o PDF; nueva versión), `…/extension` (prórroga de 24 h, una vez por ciclo), `…/review` (aprobar ⇒ vuelo COMPLETADO; devolver con motivo ⇒ nuevo plazo de 48 h). |
| Reglas de negocio, restricciones y estados | Sólo con el vuelo FINALIZADO y comandante asignado; no se presenta un informe ya presentado ni se versiona uno aprobado. Con el plazo vencido el comandante queda **bloqueado para funciones operativas** (calculado al consultar y avisado por el barrido). Triggers: la obligación sólo se aprueba con vuelo FINALIZADO/COMPLETADO e informe aprobado. |
| Efectos sobre otras funciones y datos que crea o modifica | Escribe `informes_finales_vuelo` (versionado), `obligaciones_informe_final`, `vuelos` (COMPLETADO), `notificaciones` y auditoría. |
| Servicios y endpoints | [`FinalReportController`](../backend-java/src/main/java/com/vuelossanitarios/backend/api/FinalReportController.java); [`FinalReportWorkflowService`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/FinalReportWorkflowService.java), [`FinalReportDeadlineService`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/FinalReportDeadlineService.java), [`CommanderReportAccessService`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/CommanderReportAccessService.java), [`ReportAttachmentService`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/ReportAttachmentService.java). |
| Componentes del frontend | [`ReportsPage.jsx`](../frontend-react/src/features/reports/ReportsPage.jsx), [`closure.jsx`](../frontend-react/src/features/reports/closure.jsx). |
| Estado real de implementación | Implementado; cubierto por pruebas automáticas que pasan en este commit (`FinalReportWorkflowServiceTest`, `FinalReportDeadlineServiceTest`, `CommanderReportAccessServiceTest`, `ReportAttachmentServiceTest`, `closure.test`). |
| Evidencia en el código | V7, V42–V44. |

### F32 · Notificaciones

| Aspecto | Detalle |
|---|---|
| Objetivo y problema que resuelve | Avisar a cada usuario de lo que requiere su atención, sin duplicados. |
| Roles y acciones | DTS, Operaciones/CO y Comandante leen y marcan como leídas (el Administrador no tiene bandeja). |
| Funcionamiento paso a paso | `/app/notificaciones`; `GET /api/notifications`, `POST …/{id}/read`, `…/read-all`; contadores en el menú. |
| Reglas de negocio, restricciones y estados | Deduplicación por (usuario, `clave_evento`); los avisos de gestión van al responsable (evaluador de la solicitud o creador del vuelo) y, si no hay uno elegible, a la cola compartida de Operaciones. |
| Efectos sobre otras funciones y datos que crea o modifica | Escribe `notificaciones` (desde todos los servicios, dentro de la transacción de cada acción). |
| Servicios y endpoints | [`NotificationController`](../backend-java/src/main/java/com/vuelossanitarios/backend/api/NotificationController.java); [`NotificationService`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/NotificationService.java). |
| Componentes del frontend | [`NotificationsPage.jsx`](../frontend-react/src/features/notifications/NotificationsPage.jsx), [`AttentionList.jsx`](../frontend-react/src/features/dashboard/AttentionList.jsx). |
| Estado real de implementación | Implementado; cobertura automática parcial (cubierta indirectamente por las pruebas de cada flujo). |
| Evidencia en el código | V1, V6, V44. |

### F33 · Auditoría y trazabilidad

| Aspecto | Detalle |
|---|---|
| Objetivo y problema que resuelve | Reconstruir quién hizo qué, cuándo y con qué valores. |
| Roles y acciones | Administrador consulta todo; Operaciones, Comandante y DTS ven la evolución del vuelo con campos filtrados por audiencia. |
| Funcionamiento paso a paso | `GET /api/audit` (Administrador, con filtros y actores), `GET /api/audit/flights/{id}` y `…/events/{id}`; `AuditService.record` exige transacción previa (`MANDATORY`). |
| Reglas de negocio, restricciones y estados | Inmutable por trigger; `AuditAccessPolicy` define qué tipos de evento y qué campos ve cada audiencia (el DTS no ve al personal que opera); `AuditSanitizer` sanea los valores registrados. |
| Efectos sobre otras funciones y datos que crea o modifica | Escribe `eventos_auditoria` (sin FK en `entidad_id`). |
| Servicios y endpoints | [`AuditController`](../backend-java/src/main/java/com/vuelossanitarios/backend/api/AuditController.java); [`AuditService`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/AuditService.java), [`AuditQueryService`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/AuditQueryService.java), [`AuditAccessPolicy`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/AuditAccessPolicy.java), [`AuditCatalog`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/AuditCatalog.java). |
| Componentes del frontend | [`audit.jsx`](../frontend-react/src/features/audit/audit.jsx), [`HistoryTab.jsx`](../frontend-react/src/features/flights/tabs/HistoryTab.jsx). |
| Estado real de implementación | Implementado; cubierto por pruebas automáticas que pasan en este commit (`AuditQueryIntegrationTest`, `AuditSanitizerTest`, `audit.test`). |
| Evidencia en el código | V46. |

### F34 · Contactos laborales de la tripulación

| Aspecto | Detalle |
|---|---|
| Objetivo y problema que resuelve | Que Operaciones pueda localizar a la tripulación de un vuelo. |
| Roles y acciones | Operaciones/CO. |
| Funcionamiento paso a paso | `GET /api/flights/{id}/crew/contacts` («Tripulación y contactos»). |
| Reglas de negocio, restricciones y estados | Sólo contactos de tipo LABORAL; se rechaza con 409 `CREW_CONTACTS_CLOSED` si el vuelo está cerrado; cada consulta se audita (`FLIGHT_CREW_CONTACT/VIEW`). |
| Efectos sobre otras funciones y datos que crea o modifica | Escribe sólo auditoría. |
| Servicios y endpoints | [`FlightController`](../backend-java/src/main/java/com/vuelossanitarios/backend/api/FlightController.java); [`CrewContactService`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/CrewContactService.java). |
| Componentes del frontend | [`crewContacts.jsx`](../frontend-react/src/features/flights/crewContacts.jsx). |
| Estado real de implementación | Implementado; cubierto por pruebas automáticas que pasan en este commit (`CrewContactIntegrationTest`, `crewContacts.test`). |
| Evidencia en el código | V49–V51. |

### F35 · Procesos programados

| Aspecto | Detalle |
|---|---|
| Objetivo y problema que resuelve | Mantener plazos y coherencia sin intervención. |
| Roles y acciones | Sistema. |
| Funcionamiento paso a paso | `FinalReportDeadlineService.sweep` (60 s): avisos de vencimiento próximo, vencido y bloqueo del comandante. `CrewEligibilityMonitoringService.sweep` (1 h): elegibilidad e itinerario de comandante y copiloto de los vuelos abiertos. |
| Reglas de negocio, restricciones y estados | Cada situación se avisa una sola vez y nunca modifica asignaciones. |
| Efectos sobre otras funciones y datos que crea o modifica | Escribe `notificaciones` y `eventos_auditoria`. |
| Servicios y endpoints | [`FinalReportDeadlineService`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/FinalReportDeadlineService.java), [`CrewEligibilityMonitoringService`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/CrewEligibilityMonitoringService.java). |
| Componentes del frontend | Notificaciones. |
| Estado real de implementación | Implementado; cubierto por pruebas automáticas que pasan en este commit (`FinalReportDeadlineServiceTest`, `CrewEligibilityTest`). |
| Evidencia en el código | V42, V66. |

### F36 · Preparación para producción (readiness) y controles de pruebas

| Aspecto | Detalle |
|---|---|
| Objetivo y problema que resuelve | Verificar que el despliegue cumple condiciones de seguridad y habilitar pruebas con reloj ajustable. |
| Roles y acciones | Administrador. |
| Funcionamiento paso a paso | `GET /api/admin/readiness` (almacenamiento privado de documentos, privilegios de la cuenta SQL —no debe ser `db_owner` ni poder alterar el esquema— y versión de migración de Flyway). `E2eControlController` (`/api/e2e/*`) sólo con perfil `e2e` + `app.e2e-controls.enabled=true`. |
| Reglas de negocio, restricciones y estados | Los controles E2E no existen en producción; el arranque falla si se activa el flag sin el perfil. |
| Efectos sobre otras funciones y datos que crea o modifica | No escribe datos de negocio. |
| Servicios y endpoints | [`ReadinessController`](../backend-java/src/main/java/com/vuelossanitarios/backend/api/ReadinessController.java), [`E2eControlController`](../backend-java/src/main/java/com/vuelossanitarios/backend/api/E2eControlController.java); [`ReadinessService`](../backend-java/src/main/java/com/vuelossanitarios/backend/service/ReadinessService.java). |
| Componentes del frontend | Ninguna pantalla lo consume (se consulta por API). |
| Estado real de implementación | Implementado; cobertura automática parcial (`MigrationAccountConfigTest`, `AdjustableClockTest`). |
| Evidencia en el código | V47, comandos I-5.8. |

### F37 · Tableros por rol y «próximo paso»

| Aspecto | Detalle |
|---|---|
| Objetivo y problema que resuelve | Mostrar a cada rol lo que debe atender. |
| Roles y acciones | Todos. |
| Funcionamiento paso a paso | `/app/inicio`: `AdminDashboard`, `DtsDashboard`, `OperationsDashboard`, `CommanderDashboard`; el resumen de cada vuelo calcula el «próximo paso» según la etapa y el área (`nextStep.js`). |
| Reglas de negocio, restricciones y estados | Se alimentan de los listados del servidor (`GET /api/flights`, orden: extrema urgencia abierta primero por horario límite). |
| Efectos sobre otras funciones y datos que crea o modifica | Sólo lectura. |
| Servicios y endpoints | [`FlightController`](../backend-java/src/main/java/com/vuelossanitarios/backend/api/FlightController.java) (`list`). |
| Componentes del frontend | [`DashboardPage.jsx`](../frontend-react/src/features/dashboard/DashboardPage.jsx), [`nextStep.js`](../frontend-react/src/features/flights/detail/nextStep.js), [`attention.js`](../frontend-react/src/features/dashboard/attention.js). |
| Estado real de implementación | Implementado; cubierto por pruebas automáticas que pasan en este commit (`AppRoutes.test`, `FlightDetailPage.test`). |
| Evidencia en el código | Commits `2ae32fc`, `c6abc93`. |

### F38 · Navegación, áreas de trabajo y control de acceso en el cliente

| Aspecto | Detalle |
|---|---|
| Objetivo y problema que resuelve | Una definición única del menú y del acceso por ruta. |
| Roles y acciones | Todos. |
| Funcionamiento paso a paso | `navigation.js` (áreas, módulos, `ROUTE_ACCESS`), `guards.jsx` (`RequireAuth`, `RequireWorkspace`, 403/404, redirección de enlaces `#/…`), `AppLayout` (barra lateral y superior, avisos, tema claro/oscuro). |
| Reglas de negocio, restricciones y estados | Una URL de otra área abre la pantalla correcta si el usuario también tiene esa área; si no, muestra «sin permiso». **No sustituye** la autorización del servidor. |
| Efectos sobre otras funciones y datos que crea o modifica | Sólo lectura/estado local. |
| Servicios y endpoints | — |
| Componentes del frontend | [`navigation.js`](../frontend-react/src/app/navigation.js), [`guards.jsx`](../frontend-react/src/app/guards.jsx), [`AppLayout.jsx`](../frontend-react/src/app/layouts/AppLayout.jsx), [`AppRoutes.jsx`](../frontend-react/src/app/AppRoutes.jsx). |
| Estado real de implementación | Implementado; cubierto por pruebas automáticas que pasan en este commit (`AppRoutes.test`, `workspace.test`). |
| Evidencia en el código | Commits `6d2fa45`, `c6abc93`; doc. `REESTRUCTURACION_FRONTEND_NAVEGACION_2026-11-02.md`. |

### F39 · Detalle de solicitud/vuelo: consulta primero, edición explícita

| Aspecto | Detalle |
|---|---|
| Objetivo y problema que resuelve | Reducir formularios abiertos y evitar pérdidas de borradores. |
| Roles y acciones | Operaciones, Comandante y DTS según la etapa. |
| Funcionamiento paso a paso | Paneles contraídos con resumen de la API; acciones explícitas de alta, modificación o revisión; confirmación al cerrar un panel con cambios; protección del enrutador y del navegador ante salidas con formularios abiertos (`useFlightDraftGuard`). |
| Reglas de negocio, restricciones y estados | El acceso a una pestaña ajena al área se redirige al detalle; un informe final vencido se informa al comandante pero el backend sigue validando. |
| Efectos sobre otras funciones y datos que crea o modifica | Sólo presentación (no cambia contratos de la API). |
| Servicios y endpoints | — |
| Componentes del frontend | [`FlightDetailPage.jsx`](../frontend-react/src/features/flights/detail/FlightDetailPage.jsx), [`PlanningTab.jsx`](../frontend-react/src/features/flights/tabs/PlanningTab.jsx), [`useFlightDraftGuard.js`](../frontend-react/src/features/flights/detail/useFlightDraftGuard.js), [`PlanningPanel.jsx`](../frontend-react/src/features/flights/components/PlanningPanel.jsx). |
| Estado real de implementación | Implementado; cubierto por pruebas automáticas que pasan en este commit (`FlightDetailPage.test`, `components.test`, `staleResponses.test`). |
| Evidencia en el código | Commit `ef9bb09`; doc. `AUDITORIA_UX_DETALLE_VUELOS.md`. |

### F40 · (RETIRADO en V66) Clasificaciones, habilitaciones, políticas y antivirus

| Aspecto | Detalle |
|---|---|
| Objetivo y problema que resuelve | Hasta V65: exigir clasificación y habilitación verificada y vigente para tripular, con políticas de suficiencia, PDF de respaldo y análisis antimalware. |
| Roles y acciones | Hasta V65: Administrador. |
| Funcionamiento paso a paso | **Ya no existe en el código**: se eliminaron controladores (`CrewQualificationController`, `ProfessionalCredentialController`), servicios (`ProfessionalCredentialService`, `CredentialPolicyService`, `CredentialSufficiency`, `CredentialDocumentService`, `LegacyDocumentService`, `ClamdMalwareScanner`, `PdfInspector`…), entidades, repositorios y la pantalla. |
| Reglas de negocio, restricciones y estados | La elegibilidad actual es la de la funcionalidad «Asignación» (cuenta, licencia declarada, informes, disponibilidad, jurisdicción). La licencia y la matrícula son datos **declarados, no verificados**. |
| Efectos sobre otras funciones y datos que crea o modifica | Las seis tablas se conservan como historial (con triggers de inmutabilidad); ya no se leen ni escriben. |
| Servicios y endpoints | — |
| Componentes del frontend | — |
| Estado real de implementación | Retirado deliberadamente (documentado en `docs/SIMPLIFICACION_TRIPULACION_Y_PERSONAL_SANITARIO_V66_2026-11-02.md`). Quedan residuos: variables `APP_ANTIMALWARE_*` y servicio `clamav` en Compose, `scripts/e2e_habilitaciones.py` y Javadoc (§10). |
| Evidencia en el código | V66; commit `d3aab49`. |


---

## 5. Modificaciones recientes y nuevas implementaciones

> La columna «Verificación» no toma como prueba el mensaje de un commit: indica qué se comprobó **en este commit** (pruebas automáticas que pasan, lectura del código) y qué queda **pendiente** (ejecución real contra SQL Server).

### 5.A Reestructuración del frontend

| Aspecto | M1 · Rediseño de los espacios de trabajo | M2 · Navegación por rutas y pantallas por módulo | M3 · Pantallas por etapas y tableros por rol | M4 · Consulta primero en el detalle operativo |
|---|---|---|---|---|
| **Situación anterior** | Una pantalla operativa concentraba formulario, bandeja, tablas y notificaciones; el menú mostraba «Vuelos» y «Notificaciones» sin navegación asociada; en móvil el menú desaparecía. | `main.jsx` (780 líneas) con dos aplicaciones paralelas (`AdminApp`, `OperationalApp`), navegación por estado y `#hash`, un `<select>` genérico para elegir el vuelo y 15+ secciones apiladas. | Detalle con todas las secciones visibles; la regla «sin acuerdo no hay documentación» se resolvía ocultando bloques dentro de una página única. | Hangar, coordinaciones, ruta, planificación aeroportuaria y clima abrían formularios de inmediato: un registro vigente podía quedar detrás de los controles de escritura. |
| **Problema** | Jerarquía de trabajo difusa; sin acción primaria por rol. | Sin URL por pantalla, sin Atrás/Adelante, sin deep links, sin control de acceso por ruta, estilos duplicados. | Carga cognitiva y riesgo de ofrecer acciones que el servidor rechaza. | Pérdida silenciosa de cambios al salir; diferencias de lectura entre CO y Comandante. |
| **Implementación** | Carcasa con barra lateral por rol, inicio por rol con bandeja de atención, tokens de estilo. | React Router, layout persistente, una pantalla por módulo, listados con filtros en la URL, detalle con **pestañas con URL**, mapa único de navegación (`navigation.js`) y guards. | `flightStages.js`/`flightTabs.js` derivan etapa y pestañas del estado real; tableros `Admin/Dts/Operations/CommanderDashboard`; carga diferida (`lazy`). | Paneles contraídos, alta/modificación/revisión explícitas, confirmación al cerrar con cambios, `useFlightDraftGuard`, matriz CO/Comandante compartiendo la ficha de lectura. |
| **Situación actual** | Vigente (base de M2). | Vigente: 24 rutas bajo `/app`; enlaces `#/…` antiguos se redirigen. | Vigente: 7 pestañas posibles por vuelo (Resumen, Negociación, Planificación, Tripulación y contactos, Documentos, Ejecución y cierre, Historial). | Vigente en el commit actual. |
| **Impacto** | Frontend. | Frontend; **sin cambios de API ni de BD** (informado por la documentación y verificable: el diff del backend de esos commits es vacío). | Frontend. | Frontend; sin cambios de API. |
| **Evidencia** | `2ae32fc`; `docs/AUDITORIA_UX_UI_REDISENO_2026-11-01.md` | `6d2fa45`; `docs/REESTRUCTURACION_FRONTEND_NAVEGACION_2026-11-02.md` | `c6abc93`; `docs/DETALLE_POR_ETAPAS_SOLICITUDES_SANITARIAS_2026-11-02.md` | `ef9bb09`; `docs/AUDITORIA_UX_DETALLE_VUELOS.md` |
| **Verificación** | Parcial (la carcasa original ya no existe; la sustituyó M2) | **Confirmada** en unidades: 357/357 pruebas Vitest y `vite build` correctos; **pendiente** la corrida E2E de UI (los scripts de Chrome anteriores a M2 no se migraron, según la memoria del proyecto; la última corrida registrada es de antes de M2) | Confirmada en unidades (`flightStages.test`, `FlightDetailPage.test`); E2E pendiente | Confirmada en unidades; E2E pendiente |

### 5.B Gestión de solicitudes

| Aspecto | Descripción |
|---|---|
| Funcionalidad | Bandejas de atención, negociación de horario y habilitación progresiva de funciones (F11–F15). |
| Situación anterior | La negociación y la cancelación ya existían desde V20/V44; la regla documental «sin acuerdo no hay documentos» existía como bloqueo (doc. `SOLICITUDES_Y_BLOQUEO_DOCUMENTAL_HORARIO_2026-11-01.md`), pero hangar, coordinaciones y bitácora manual podían registrarse durante la negociación. |
| Problema | Cargar preparación antes de que el horario sea firme obliga a rehacerla si la negociación se reabre. |
| Implementación | Clases `DocumentScheduleGate` y `PreparationStageGate` (acuerdo = estado APROBADO, que el servidor sólo fija cuando ambas partes coinciden); en el cliente, `flightStage` y `visibleSections`. |
| Situación actual | Documentos, hangar, coordinaciones y bitácora manual responden **409** durante la negociación; el frontend ofrece cada pestaña según la etapa y muestra el motivo del bloqueo. |
| Impacto | Backend (servicios), frontend; sin cambios de esquema. |
| Evidencia | `service/DocumentScheduleGate.java`, `service/PreparationStageGate.java`; `features/flights/flightStages.js`. |
| Verificación | Confirmada en unidades (`DocumentScheduleGateTest`, `SanitaryDocumentGateIntegrationTest`, `flightStages.test`, `dts-stage.test`). |

### 5.C Planificación de vuelos

| Aspecto | M5 · Ubicación del comandante y asignación por reserva (V63) | M6 · Jurisdicción de salida y aeropuertos propuestos/confirmados (V64/V65) |
|---|---|---|
| **Situación anterior** | Hasta V62 el perfil sólo guardaba la provincia y la elegibilidad geográfica de un sanitario se resolvía por provincia sin saber quién la fijó ni cuándo. | V63 registraba la ubicación por **localidad** y la comparaba con la localidad del paciente. |
| **Problema** | Falta de trazabilidad de la ubicación y de un registro de las asignaciones excepcionales. | Ambas ideas eran erróneas: la ubicación operativa es una jurisdicción (provincia/CABA) y la localidad del paciente (necesidad sanitaria) **no es** el aeropuerto del que despega la aeronave (ejecución aeronáutica). |
| **Implementación** | Localidad actual, fecha y responsable en `perfiles_comandante`; tabla `excepciones_geograficas_comandante`; panel de asignación de recursos de CO; elección **reservada** (comandante o aeronave primero) con pase a PLANIFICADO al completar el par. | Se retira la localidad (la anterior queda en la auditoría); la elegibilidad depende de la **provincia del aeropuerto de salida**; `estado_aeropuerto_origen/destino` (PROPUESTO/CONFIRMADO); selección asistida con `AirportCandidateService` y coordenadas de localidades (V65); el inicio exige aeropuertos confirmados. |
| **Situación actual** | Vigente en lo estructural (reserva, excepciones, fecha/responsable); la parte por localidad fue reemplazada. | Vigente: es la regla actual (F16, F17). |
| **Impacto** | Backend (`FlightService`, `CommanderLocationService`), frontend (`resourceAssignment.jsx`), BD (V63). | Backend, frontend (`airportPlanning.jsx`), BD (V64/V65). |
| **Evidencia** | `0257f32`, `99a786a`, `6623b00`; `docs/ASIGNACION_COMANDANTE_Y_AERONAVE_V63_2026-11-02.md` | `a51bb26`, `41e7e53`; `docs/CORRECCION_GEOGRAFICA_COMANDANTES_Y_AEROPUERTOS_V64_2026-11-02.md` |
| **Verificación** | Unidades confirmadas (`CommanderLocationServiceTest`, `AircraftAssignmentFlightServiceTest`); E2E de la rama pasó en su momento, **no re-ejecutado** sobre este commit | Unidades confirmadas (`CommanderGeographyTest`, `AirportCandidateServiceTest`, `airportPlanning.test`); E2E no re-ejecutado |

### 5.D Profesionales y tripulación

| Aspecto | M7 · Requisitos del comandante administrables (`b1c9d02`) | M8 · Simplificación de la tripulación (V66) |
|---|---|---|
| **Situación anterior** | El comandante exigía clasificación, política de suficiencia y habilitación verificada (V33–V60). | Ídem (modelo de V59/V60 y el intento de `b1c9d02`). |
| **Problema** | Complejidad y carga documental desproporcionadas para el alcance; reglas que la aplicación no podía verificar (la matrícula es declarada). | Mismo. |
| **Implementación** | Pantalla y servicios para explicar y administrar los requisitos. **Efímero**: reemplazado a las pocas horas. | El comandante es asignable sin habilitaciones; el **copiloto es otro usuario COMANDANTE**; el **personal sanitario** (médicos/enfermeros) es un registro del DTS **sin cuenta** (`personal_sanitario`, `vuelos_personal_sanitario`); la ubicación prevista se deduce del itinerario; se retiran habilitaciones, clasificaciones, políticas, PDF de habilitación y antivirus. |
| **Situación actual** | No existe. | Vigente (F17–F21, F40). El comandante y el copiloto se evalúan con `CrewManagementService.evaluate`; el personal sanitario se gestiona con `HealthStaffService`. |
| **Impacto** | — | Backend (−1.810 / +1.965 líneas en 81 archivos desde V62), frontend (pantalla «Personal sanitario» y copiloto), BD (V66: 2 tablas nuevas, columna `funcion`, 6 tablas retiradas), configuración (restos de antivirus). |
| **Evidencia** | `b1c9d02` | `d3aab49`, `cadceab`, `090cdfe`; `docs/SIMPLIFICACION_TRIPULACION_Y_PERSONAL_SANITARIO_V66_2026-11-02.md` |
| **Verificación** | No aplica (retirado) | Unidades confirmadas (`HealthStaffServiceTest`, `CrewManagementServiceTest`, `CrewItineraryServiceTest`, `healthStaff.test`, `copilot.test`); según la memoria del proyecto, los E2E `e2e-simplificacion-tripulacion` y `e2e-personal-sanitario-ui` pasaron el 2026-11-02 y el stack habitual se migró a V66 (los datos del usuario de pruebas quedaron intactos); la suite completa **no** se ejecutó entera tras V66 |

### 5.E Seguridad y gestión de usuarios

| Aspecto | Descripción |
|---|---|
| Funcionalidad | OTP de 6 dígitos para activar cuentas y verificar correos; endurecimiento del alta de usuarios y de la recuperación de sesión (F2, F4, F5). |
| Situación anterior | Código de activación alfanumérico de 24 h sin límite de intentos; verificación de correo con otra forma de código (V54). |
| Problema | Códigos largos de transcribir y sin freno a la fuerza bruta. |
| Implementación | V61/V62: código decimal, 10 minutos, 5 intentos con cierre al quinto (`noRollbackFor` para persistir el conteo), códigos previos marcados como legados (`codigo_numerico=0`); `c414065` endurece el formulario de alta y la recuperación de sesión del cliente; `4460a64` agrega una prueba del correo normalizado en el alta pendiente. |
| Situación actual | Vigente. El nuevo usuario comandante puede tener provincia inicial. |
| Impacto | Backend, frontend (`LoginPage`, `UserCreatePage`, `PhoneField`, `api.js`), BD (V61, V62: `codigo_numerico`, `intentos_fallidos`, CHECK de fechas e intentos). |
| Evidencia | `8274062`, `01497e5`, `6126e5d`, `c414065`, `4460a64`; `docs/OTP_VERIFICACION_CORREO_V61.md` |
| Verificación | Confirmada en unidades (`AccountActivationIntegrationTest`, `EmailVerificationIntegrationTest`, `LoginPage.activation.test`). El contenido exacto de `c414065` no se auditó línea por línea: se cita su mensaje. |

### 5.F Otras implementaciones detectadas

| Cambio | Detalle | Evidencia | Verificación |
|---|---|---|---|
| Procesos de elegibilidad e itinerario | `CrewEligibilityMonitoringService` ahora revisa también el itinerario y avisa sin quitar a nadie | `d3aab49` | Confirmada (`CrewEligibilityTest`, `CrewItineraryServiceTest`) |
| Cuenta de migración separada | `MigrationAccountConfig`, `ReadinessService` verifica que la cuenta de la aplicación no pueda alterar el esquema | I-5.8 (`6b09f43`) | Confirmada (`MigrationAccountConfigTest`) |
| Migraciones Java de datos geográficos | V16, V17, V26, V65 | `db/migration/*.java` | Confirmada (`GeographicCatalogDatasetTest`) |
| Retiro del antivirus | Se eliminan `ClamdMalwareScanner`, `GuardedMalwareScanner`, `PdfInspector`, `MalwareScannerConfig` | `d3aab49` | Confirmada por ausencia en el código; configuración residual en Compose (§10) |

---

## 6. Procesos completos y transiciones

> Reconstruidos desde el código (`FlightService`, `CrewManagementService`, `HealthStaffService`, `FinalReportWorkflowService`, `FlightRouteService`, `AuthService`). El detalle de tablas por paso está en el informe de BD (§8).

### 6.1 Solicitud de vuelo sanitario (flujo principal)

| # | Actor | Estado anterior | Acción | Validaciones | Estado posterior | Información creada o actualizada | Consecuencias |
|---|---|---|---|---|---|---|---|
| 1 | DTS | — | Crear solicitud | Rol DTS; política de urgencia; datos médicos; localidades válidas | Solicitud **SOLICITADO**; vuelo sin estado | `vuelos`, `vuelos_sanitarios`, `informacion_medica_vuelo`, negociación `DTS_PROPUESTA`, contactos, auditoría | Aviso a Operaciones (y de extrema urgencia) |
| 2a | CO/Operaciones | SOLICITADO | **Aprobar** el horario solicitado | Horario futuro | **APROBADO**; `fecha_planificada_salida` = solicitada | Negociación `CO_ACEPTA_PROPUESTA`; evaluador | Se habilitan documentos, hangar, coordinaciones, bitácora, recursos; aviso al DTS |
| 2b | CO/Operaciones | SOLICITADO o PENDIENTE_RESPUESTA_DTS | **Contraproponer** | Horario futuro, distinto, ≤ límite de urgencia, con motivo | **PENDIENTE_RESPUESTA_DTS** | Negociación `CO_CONTRAPROPUESTA` (reemplaza a la anterior) | Aviso al DTS |
| 2c | CO/Operaciones | SOLICITADO | **Rechazar** | Motivo del catálogo | **RECHAZADO** (definitivo; vuelo sin estado) | `motivo_rechazo`; negociación `CO_RECHAZO_DIRECTO` | Aviso al DTS; cierre |
| 3a | DTS solicitante | PENDIENTE_RESPUESTA_DTS | Aceptar contrapropuesta | Propuesta vigente y futura | **APROBADO** | Negociación `DTS_ACEPTA_CONTRAPROPUESTA` | Aviso a Operaciones |
| 3b | DTS solicitante | PENDIENTE_RESPUESTA_DTS | Rechazar contrapropuesta | Motivo del catálogo | **CANCELADO** (solicitud y vuelo) | Negociación `DTS_RECHAZA_CONTRAPROPUESTA`; cancelación | Cierre |
| 4 | CO/Operaciones | APROBADO | Proponer aeropuertos (opcional previo) | Aeropuertos activos con provincia; justificación si es otra provincia | APROBADO (aeropuertos PROPUESTO) | `vuelos` (aeropuertos, estado, quién y cuándo) | Aviso al comandante si ya está asignado; ruta a revisión |
| 5 | CO/Operaciones | APROBADO | Elegir comandante y aeronave (en cualquier orden) | Elegibilidad, jurisdicción (o excepción de CO), disponibilidad, capacidad | APROBADO con elección **reservada**; al completarse el par → **PLANIFICADO** | `vuelos`, `vuelos_tripulantes`, `excepciones_geograficas_comandante` | El comandante ve el vuelo; aviso `COMMANDER_ASSIGNED` |
| 6 | CO/Operaciones | APROBADO/PLANIFICADO | Asignar o cambiar copiloto | Cuenta activa, rol COMANDANTE, licencia, disponibilidad y regla geográfica; distinto del principal | sin cambio | `vuelos_tripulantes` | Revalidación de itinerario |
| 7 | DTS solicitante | APROBADO o PLANIFICADO | Asignar personal sanitario | Profesional propio, activo, sin superposición | sin cambio | `vuelos_personal_sanitario` | Cuenta para la capacidad de la aeronave |
| 8 | Comandante | PLANIFICADO | Confirmar aeropuertos y llegada prevista | Salida en su jurisdicción (o excepción vigente); otra provincia que la del paciente requiere justificación | PLANIFICADO (aeropuertos CONFIRMADO) | `vuelos` | Aviso a Operaciones si cambió lo propuesto; ruta a revisión |
| 9 | Comandante | PLANIFICADO | Registrar clima; guardar y presentar ruta; observación de hangar | Informes al día; datos de planificación completos | PLANIFICADO | `instantaneas_clima`, `rutas_vuelo`, `informacion_hangar` | Aviso a Operaciones (ruta pendiente) |
| 10 | CO/Operaciones | PLANIFICADO | Aprobar o devolver ruta; cargar hangar y coordinaciones | No revisa quien presentó; versión vigente | PLANIFICADO | `rutas_vuelo`, `informacion_hangar`, `coordinaciones_aa2000` | Aviso al comandante |
| 11 | CO/Operaciones | PLANIFICADO | **Iniciar** | Datos completos, aeropuertos confirmados, tripulación elegible, aeronave en el origen, ruta aprobada | **EN_CURSO** | `fecha_salida_real`; bitácora INICIO | — |
| 12 | CO/Operaciones | EN_CURSO | **Finalizar** | — | **FINALIZADO** | `fecha_llegada_real`; aeronave y tripulación pasan al destino; obligación de informe (48 h) | Aviso al comandante |
| 13 | Comandante | FINALIZADO | Presentar informe (o pedir prórroga de 24 h una vez) | Vuelo finalizado; comandante asignado | informe PRESENTADO | `informes_finales_vuelo`, obligación | Aviso a Operaciones |
| 14 | CO/Operaciones | FINALIZADO | Aprobar o devolver informe | Versión actual presentada; devolución con motivo | **COMPLETADO** (aprobado) o devuelto con plazo de 48 h | informe y obligación | Cierre |
| X | CO/Operaciones o DTS dueño | SOLICITADO, PENDIENTE_RESPUESTA_DTS, APROBADO (vuelo sin estado o PLANIFICADO) | **Cancelar** | Motivo del catálogo | **CANCELADO** | Cancelación; bitácora | Recursos liberados; avisos |

**Diferencia clave:** en un vuelo sanitario **el comandante no acepta ni rechaza**: tras la asignación el vuelo pasa directo a PLANIFICADO. La respuesta del comandante sólo existe en vuelos operativos.

### 6.2 Vuelo operativo (no sanitario)

| # | Actor | Estado anterior | Acción | Estado posterior | Consecuencias |
|---|---|---|---|---|---|
| 1 | Operaciones/CO (backend: también Administrador) | — | Crear (aeronave, destino, comandante, salida y llegada) | PENDIENTE_CONFIRMACION_COMANDANTE | Aviso al comandante |
| 2a | Comandante | PENDIENTE_CONFIRMACION_COMANDANTE | Aceptar (salida futura, elegible) | PLANIFICADO | Aviso a Operaciones |
| 2b | Comandante | ídem | Proponer otro horario (con motivo) | PENDIENTE_RESPUESTA_OPERACIONES | Aviso a Operaciones |
| 2c | Comandante | ídem | Rechazar (con motivo) | PENDIENTE_REPLANIFICACION | Aviso a Operaciones |
| 3 | Operaciones | PENDIENTE_RESPUESTA_OPERACIONES | Aceptar (→ PLANIFICADO) o rechazar la propuesta (→ PENDIENTE_CONFIRMACION_COMANDANTE) | según el caso | Aviso al comandante |
| 4 | Operaciones | PENDIENTE_REPLANIFICACION | Enviar nueva asignación | PENDIENTE_CONFIRMACION_COMANDANTE | Aviso al comandante |
| 5 | — | PLANIFICADO | Iniciar, finalizar, informe: igual que el sanitario | EN_CURSO → FINALIZADO → COMPLETADO | — |

### 6.3 Alta y activación de una cuenta

| # | Actor | Estado | Acción | Resultado |
|---|---|---|---|---|
| 1 | Administrador | — | Crear usuario | Cuenta **PENDIENTE_ACTIVACION** (sin usuario ni contraseña); código de 6 dígitos mostrado una vez |
| 2 | Titular | PENDIENTE_ACTIVACION | Activar (DNI, código, usuario, contraseña) | **ACTIVO**; el código se cierra; tras 5 errores o 10 min el administrador debe regenerarlo |
| 3 | Administrador | ACTIVO | Desactivar (sin responsabilidades vigentes) / Reactivar | **DESACTIVADO** (invalida tokens, libera bloqueos) / ACTIVO con contraseña temporal y cambio obligatorio |

### 6.4 Excepción geográfica

Cuando la persona elegida como comandante o copiloto no está —ni estará, según su itinerario— en la provincia/CABA del aeropuerto de salida: (1) el servidor responde 409 `COMMANDER_OUTSIDE_DEPARTURE_JURISDICTION` si no se envía excepción; (2) con excepción, sólo `CENTRO_OPERACIONES` puede autorizarla (si no, 403) y exige una justificación de al menos 15 caracteres; (3) la excepción queda **vigente** para esa persona, función y jurisdicción; (4) se cierra (`fecha_reemplazo`) si se reemplaza a la persona, se la retira o el aeropuerto pasa a otra provincia; (5) cada alta se audita. Ninguna excepción omite las demás validaciones.

### 6.5 Personal sanitario

Registro en el catálogo del DTS (F19) → asignación a un vuelo con horario acordado (F20) → sustitución o retiro (baja lógica con motivo) hasta que el vuelo inicia; después la tripulación sanitaria es sólo de consulta.

---

## 7. Responsabilidades y matriz de permisos

**Leyenda:** C = consultar · A = crear/registrar · M = modificar · P = aprobar · X = rechazar/devolver · B = baja/cancelación · — = sin permiso. «CO/Op.» agrupa los roles `CENTRO_OPERACIONES` y `OPERACIONES`, que tienen **los mismos permisos** salvo la fila 13. Fuente: `@PreAuthorize` de los controladores y reglas de los servicios (el acceso a un vuelo concreto lo decide `FlightAuthorizationService.mayRead`: Operaciones y Administrador ven todo; el DTS sólo sus solicitudes; el comandante sólo los vuelos que **comanda** y que ya tienen estado).

| # | Acción / dato | Administrador | DTS | CO / Op. | Comandante | Condiciones |
|---|---|---|---|---|---|---|
| 1 | Usuarios: listar, buscar, ver | C | — | C (sólo candidatos a comandante) | — | |
| 2 | Usuarios: alta, edición, roles, licencia, provincia, DNI | A M | — | — | — | No sobre sí mismo ni dejando el sistema sin administrador |
| 3 | Usuarios: baja/reactivación, código, contraseña temporal | B M | — | — | — | Sin responsabilidades vigentes |
| 4 | Mi cuenta: contactos y contraseña | A M B | A M B | A M B | A M B | Sólo sobre la propia cuenta |
| 5 | Aeronaves: alta, edición, activar/desactivar | A M B | — | — | — | |
| 6 | Aeronaves: listado / detalle y disponibilidad / mover ubicación | C / C / M | C / — / — | C / C / M | C / — / — | Historial de la aeronave: sólo Administrador |
| 7 | Geografía (provincias, localidades, aeropuertos): administrar / consultar | A M B / C | C | C | C | Con control de dependencias |
| 8 | Ubicación operativa de comandantes | C M | — | C M | C (la propia) | |
| 9 | Pacientes: buscar / detalle y corrección / alta | C / C M / — | C / — / A | — / — / A | — | Alta directa sin pantalla (`POST /api/patients`) |
| 10 | Solicitud sanitaria: crear / consultar | — / C | A / C (propias) | — / C | — / C (si lo comanda y tiene estado) | |
| 11 | Negociación: aprobar, contraproponer, rechazar | — | — | P X | — | Estado SOLICITADO o PENDIENTE_RESPUESTA_DTS |
| 12 | Negociación: responder la contrapropuesta | — | P X (sólo el solicitante) | — | — | PENDIENTE_RESPUESTA_DTS |
| 13 | **Autorizar excepción geográfica** | — | — | **sólo `CENTRO_OPERACIONES`** (`OPERACIONES`: 403) | — | Justificación ≥ 15 caracteres |
| 14 | Proponer / cambiar aeropuertos | — | — | A M | — | APROBADO o PLANIFICADO |
| 15 | Confirmar aeropuertos y llegada prevista | — | — | — | M (sólo el comandante asignado) | PLANIFICADO; informes al día |
| 16 | Asignar comandante, aeronave, recursos | — | — | A M | — (C) | Horario acordado; vuelo sin iniciar |
| 17 | Copiloto: asignar, cambiar, retirar | — | — | A M B | — (C) | Comparte regla geográfica; la obligación de informe corresponde al principal |
| 18 | Personal sanitario: catálogo propio | — | A M B | — | — | Cada DTS sólo ve el suyo |
| 19 | Personal sanitario del vuelo: asignar, sustituir, retirar / consultar | C | A M B (sólo el solicitante) / C | C | C | Solicitud APROBADA y vuelo sin iniciar |
| 20 | Crear vuelo no sanitario | A (backend); **sin menú** | — | A | — | El tipo SANITARIO sólo lo crea el DTS |
| 21 | Responder la asignación de un vuelo operativo / su propuesta | — | — | P X (la propuesta del comandante) | P X (la asignación) | |
| 22 | Clima | C | C | C | A | PLANIFICADO |
| 23 | Ruta: consultar / guardar y presentar / aprobar o devolver | C / — / — | C / — / — | C / — / P X | C / A M / — | Nadie revisa lo que presentó |
| 24 | Hangar | C | — | A M | M (observación) / C | Horario acordado |
| 25 | Coordinaciones aeroportuarias | C | — | A M | C | Horario acordado |
| 26 | Bitácora | C | — | A | A | Horario acordado (Operaciones) |
| 27 | Documentos: consultar / registrar, versionar, bloquear, retirar | **sin acceso** | C / — | C / A M B | C / A M B | Horario acordado; vuelo abierto |
| 28 | Iniciar / finalizar | — | — | M | — | Ver §6.1 |
| 29 | Cancelar | — | B (su solicitud) | B | — | Antes de la ejecución |
| 30 | Informe final: presentar / prórroga / aprobar o devolver / consultar | C | — | P X / C | A M / C | Vuelo FINALIZADO |
| 31 | Contactos de coordinación del traslado | — | A M B | C | — | |
| 32 | Contactos laborales de la tripulación | — | — | C | — | Vuelo abierto; consulta auditada |
| 33 | Notificaciones | — | C M | C M | C M | |
| 34 | Auditoría: global / por vuelo | C / C | — / C (subconjunto) | — / C | — / C | Campos filtrados por audiencia |
| 35 | Readiness / controles E2E | C / (e2e) | — | — | — | Los controles E2E sólo existen con el perfil `e2e` |

### Diferencias entre el backend y las restricciones visuales del frontend

| # | Backend | Frontend | Consecuencia |
|---|---|---|---|
| 1 | `POST /api/flights/operational` admite `ADMINISTRADOR` | Menú «Nuevo vuelo» sólo en el área OPERACIONES; `ROUTE_ACCESS['vuelos/nuevo']=['OPERACIONES']` | Capacidad sólo alcanzable por API; no es una brecha de seguridad (el rol existe en el servidor) pero es una **inconsistencia** |
| 2 | El Administrador puede leer vuelos, ruta, hangar, coordinaciones, bitácora, informes y auditoría por vuelo | El área ADMIN no tiene pantallas de solicitudes ni vuelos | Lectura de vuelos del Administrador sólo por API o auditoría |
| 3 | La autorización de excepciones depende del **rol** `CENTRO_OPERACIONES` | La UI usa `puedeAutorizarExcepcion` informado por el servidor y explica el motivo | Coherentes; el efecto es que un usuario sólo `OPERACIONES` no puede completar una asignación excepcional |
| 4 | `GET /api/flights/{id}` sólo para el comandante principal con vuelo con estado | Las notificaciones del copiloto enlazan a `/app/vuelos/{id}` | **El copiloto recibe un aviso que lleva a una pantalla cuyo detalle devuelve 403 si su único vínculo es la asignación como copiloto** (confirmado por código; sin reproducción HTTP en esta revisión) |
| 5 | `GET /api/admin/readiness` | Sin pantalla | Funcionalidad sin interfaz |
| 6 | `POST /api/patients` (DTS/Op./CO) | Ninguna pantalla lo invoca | Recurso de integración o de pruebas (pendiente de confirmar) |

---

## 8. Reglas de negocio consolidadas

| Tema | Regla (verificada en el código) | Dónde se impone |
|---|---|---|
| Urgencia | Vuelo ordinario sólo para pasado mañana o después; extrema urgencia con justificación y límite ≥ fecha solicitada; la contrapropuesta no supera el límite | `FlightUrgencyPolicy`, `FlightService.validateSanitaryHour` |
| Negociación | Una sola propuesta vigente; responder una obsoleta da 409; el rechazo directo es definitivo | `FlightService` |
| Estados sanitarios | SOLICITADO → APROBADO / PENDIENTE_RESPUESTA_DTS / RECHAZADO / CANCELADO; trigger de máquina de estados | `trg_vuelos_sanitarios_validar_estado` |
| Estados del vuelo | PENDIENTE_* → PLANIFICADO → EN_CURSO → FINALIZADO → COMPLETADO / CANCELADO; COMPLETADO y CANCELADO inmutables | `trg_vuelos_validar_*` |
| Acuerdo de horario | Sólo APROBADO habilita documentos, hangar, coordinaciones, bitácora manual y recursos | `DocumentScheduleGate`, `PreparationStageGate`, `requireAssignableSanitary` |
| Elegibilidad de tripulación | Cuenta activa + rol COMANDANTE + licencia registrada; comandante principal sin informes finales vencidos; sin superposición horaria (u horario indeterminado) | `CrewManagementService.evaluate` |
| Geografía | Comandante/copiloto en la provincia/CABA del aeropuerto de salida (según itinerario); si no, excepción de CO con ≥ 15 caracteres; un aeropuerto sin provincia bloquea la decisión | `CommanderGeography`, `FlightService.decideGeography` |
| Aeropuertos | Origen ≠ destino; otra provincia que la del paciente exige justificación ≥ 10 caracteres; el inicio exige ambos CONFIRMADOS | `FlightService`, CHECK de `vuelos` |
| Aeronave | Activa, fuera de vuelo, sin compromiso en el horario, capacidad ≥ comandante + copiloto + personal sanitario, ubicada en el aeropuerto de salida | `FlightService.aircraftCandidates`, `assertAircraft*` |
| Ruta | Versionada; cambios del vuelo la invalidan; autorrevisión prohibida; el inicio exige ruta APROBADA | `FlightRouteService` |
| Informe final | 48 h tras finalizar; una prórroga de 24 h por ciclo; vencido ⇒ comandante bloqueado; devolución ⇒ 48 h; aprobación ⇒ vuelo COMPLETADO | `FinalReportWorkflowService`, trigger de la obligación |
| Documentos | Sólo PDF, versionado, bloqueo de edición de 300 s, baja lógica con motivo | `DocumentService` |
| Cuentas | DNI único; OTP de 6 dígitos, 10 min, 5 intentos; contraseña ≥ 12; baja invalida tokens; no se deja al sistema sin administrador | `AuthService` |
| Contactos | Teléfonos internacionales; correo verificable por OTP; un principal; baja lógica | `PersonContactService`, `EmailVerificationService` |
| Personal sanitario | Catálogo por DTS; matrícula única por tipo; sin cuenta; asignación sólo con horario acordado y sin superposición | `HealthStaffService` |
| Auditoría | Toda escritura relevante deja evento; eventos inmutables; `AuditService` exige transacción | `AuditService`, `tr_eventos_auditoria_inmutable` |

---

## 9. Estado de calidad

| Evidencia | Resultado | ¿Corresponde al código actual? |
|---|---|---|
| **Pruebas del backend** (`mvn -o test`) | **646 pruebas, 0 fallos, 0 errores, 0 omitidas**; BUILD SUCCESS, 4 min 55 s, ejecutado el 2026-11-03 sobre `ef9bb09` | **Sí** (ejecutado en esta auditoría) |
| **Compilación del backend** | Implícita en lo anterior (Maven compila antes de probar) | Sí |
| **Pruebas del frontend** (`vitest run`) | **357 pruebas, 0 fallos**, 201 s | **Sí** (ejecutado en esta auditoría) |
| **Compilación del frontend** (`vite build`, salida en un directorio temporal) | Correcta (1,25 s) | **Sí** |
| Base de datos de las pruebas de backend | **H2 en modo `MSSQLServer`**; Flyway no se ejecuta contra SQL Server | Limita lo verificado: **los triggers, CHECK e índices de SQL Server no están ejercitados por esas 646 pruebas** |
| Migraciones | 66 aplicadas y `success` en la base habitual (consulta de sólo lectura); no se recreó una base vacía | Sí para la base habitual |
| Validación de permisos | Pruebas de autorización por controlador (`AdministratorAuthorizationTest`, `CrewAndAircraftAssignmentAuthorizationTest`, `ResourceAssignmentAuthorizationTest`, `FlightRouteAuthorizationTest`, `DocumentAuthorizationTest`, `CommanderWriteEndpointsGuardTest`) | Sí |
| **Pruebas E2E** (`scripts/e2e-*.cjs`, 57 scripts; 45 en la suite `e2e-suite-completa`) | Última corrida registrada: `20261102T141312`, **41 OK / 17 FALLO de 58**, sobre el commit `6623b00` con árbol sucio, **antes de V66 y de la reestructuración del frontend** | **No**: no se atribuye al código actual. Los 17 fallos son de scripts de interfaz y de contactos/identidad, y cuatro corresponden al modelo luego retirado (`e2e-roles-clasificaciones-ui`, `e2e-habilitaciones-ui`, `e2e-politicas-documentos-ui`, `e2e-seguridad-i58`); la causa de cada uno no se investigó |
| Corrida E2E previa más reciente completa | `20261029T073329`: 54/54 sobre `a9f0799` (V60) | **No** (código anterior a V61) |
| E2E tras V66 | Según la memoria del proyecto, pasaron `e2e-simplificacion-tripulacion` y `e2e-personal-sanitario-ui` y una regresión de 17 scripts; la suite completa no se ejecutó entera | Parcial; **no reproducido en esta auditoría** |
| Funcionalidades incompletas / errores conocidos | Ver §10 | — |

---

## 10. Problemas detectados

**Clasificación:** 🔴 alta · 🟠 media · 🟡 baja. **Tipo:** *Hecho* = comprobado en el código o en el esquema; *Riesgo* = potencial, no demostrado; *Pendiente* = requiere ejecución para confirmarse; *Decisión de alcance* = simplificación intencional. No se implementó ninguna solución.

| # | Gravedad | Tipo | Hallazgo | Evidencia |
|---|---|---|---|---|
| P1 | 🟠 | Hecho | **La última corrida E2E registrada falló en 17 de 58 scripts y es anterior a V66 y a la reestructuración del frontend.** No hay una corrida completa que certifique el código actual. Los scripts de Chrome de la interfaz anterior no se migraron a las rutas nuevas (memoria del proyecto). | `scripts/e2e-logs/20261102T141312` |
| P2 | 🟠 | Hecho | **Las 646 pruebas de backend usan H2:** los triggers de ciclo de vida, los CHECK y los índices de SQL Server sólo se verifican con E2E. Un error de esquema que H2 tolere no se detectaría. | `pom.xml` (H2 en `test`), `jdbc:h2:mem:…;MODE=MSSQLServer` |
| P3 | 🟠 | Hecho | **Capacidad no validada al agregar personal sanitario:** `HealthStaffService.add` no compara con `capacidad_tripulacion`; los caminos de asignación de recursos tienen controles de capacidad. El DTS puede superar la capacidad después de que Operaciones asigna la aeronave. `FlightService.start` tampoco la vuelve a comprobar. | `HealthStaffService.add` vs `FlightService.assertAircraftCapacity` |
| P4 | 🟠 | Hecho | **La asignación como copiloto no da acceso al detalle del vuelo:** `mayRead` reconoce al comandante principal y admite otros permisos independientes. El aviso `CREW_ASSIGNED` enlaza al detalle, que responde 403 si el usuario sólo es copiloto en ese vuelo. La comprobación es estática. | `FlightAuthorizationService.mayRead`, `NotificationsPage.linkFor` |
| P5 | 🟠 | Hecho | **Un usuario con sólo el rol `OPERACIONES` no puede resolver una asignación que requiere excepción geográfica** (403 `GEOGRAPHIC_EXCEPTION_NOT_AUTHORIZED`); depende de que exista un usuario `CENTRO_OPERACIONES`. Los dos roles coexisten con el mismo nombre visible. | `FlightService.decideGeography`; `roles` |
| P6 | 🟡 | Hecho | `POST /api/flights/operational` admite `ADMINISTRADOR` pero el menú sólo lo ofrece a Operaciones (inconsistencia backend/UI). | `FlightController`, `navigation.js` |
| P7 | 🟡 | Hecho | **Documentación y configuración obsoletas:** `README.md` dice «hasta V47» y «V1 a V31»; `docker-compose.yml` conserva las variables `APP_ANTIMALWARE_*` y el servicio `clamav` para una función retirada; `scripts/e2e_habilitaciones.py` apunta a un flujo que ya no existe; `docs/MATRIZ_*`, `PLAN_PRUEBAS_MANUALES_V60.md` y `ESTADO_FUNCIONAL.md` describen habilitaciones; el Javadoc de `FlightService` (`assertCommanderEligible`, `commanderCandidates`) todavía menciona «clasificación y habilitación». | `README.md`, `docker-compose.yml:101-136`, `scripts/` |
| P8 | 🟡 | Hecho | **`main` local está desactualizada** (V60) y `origin/main` sólo contiene el OTP: todo lo reciente vive en ramas sin integrar. Riesgo de despliegue desde la rama equivocada. | `git rev-list` |
| P9 | 🟡 | Hecho | **Seis tablas retiradas siguen en el esquema** con sus FK históricas y cuatro triggers activos sobre decisiones, consultas, documentos y políticas; y `sysdiagrams` (artefacto de SSMS) aparece en la base habitual. | informe de BD §3 |
| P10 | 🟡 | Hecho | **Índices duplicados (63 grupos), 7 índices de migraciones ausentes, CHECK con nombre generado (7) y un CHECK ternario que admite NULL en `vuelos.estado_aeropuerto_*`.** | informe de BD §12 |
| P11 | 🟡 | Hecho | **No hay registro de inicios de sesión** (el `login` es de sólo lectura y no audita). | `AuthService.login` |
| P12 | 🟡 | Decisión de alcance | **Datos declarados, no verificados:** licencia del comandante y matrícula del personal sanitario; la aplicación no los certifica ante ningún organismo (decisión documentada de V66). | `HealthStaff.java`, `CrewManagementService` |
| P13 | 🟡 | Hecho | **Recursos sin pantalla:** `GET /api/admin/readiness` y el alta directa `POST /api/patients`. | frontend |
| P14 | 🟡 | Riesgo | **Unicidad de la excepción geográfica vigente y pertenencia del profesional al DTS** sólo se garantizan por servicio (SERIALIZABLE), no por restricción de base. | informe de BD §12.B4 |
| P15 | 🟡 | Hecho | **Endpoint heredado `POST /api/catalogs/airports`** crea aeropuertos incompletos (sin provincia) que luego las reglas de jurisdicción rechazan; y `POST /api/catalogs/commanders/{id}/location` duplica el nuevo `PUT /api/commanders/{id}/location`. | `CatalogController`, `CommanderLocationController` |
| P16 | 🟡 | Riesgo | **Posibles regresiones:** el diff de V62 a HEAD toca 81 archivos de backend (+1.965/−1.810) y reubica todo el frontend; sin una suite E2E completa posterior, los flujos entre pantallas (UI → API → SQL Server) no están certificados. | `git diff --stat` |

**Funcionalidades difíciles de encontrar (UX):** la sección «Copiloto» y la edición de aeropuertos están dentro de la pestaña «Planificación» de un detalle que a su vez depende de la etapa; el DTS asigna su personal sanitario en «Personal y contactos» de **cada solicitud** (no en el menú «Personal sanitario», que es sólo el catálogo).

**Código aparentemente obsoleto (no eliminar sin confirmar):** columnas heredadas sin escritura (informe de BD §12.A4), el rol `OPERACIONES` duplicado, funciones MEDICO/ENFERMERO en `roles_tripulacion`, `CrewManagementService.evaluate` con la rama «HISTORICO» para funciones ya no evaluadas.

---

## 11. Conclusiones

1. **Qué hace hoy el sistema:** cubre de punta a punta el traslado sanitario —solicitud, negociación de horario, asignación de recursos con regla geográfica y excepciones auditables, planificación del comandante, ejecución, informe final y cierre— y los vuelos no sanitarios, con cuatro áreas de trabajo, gestión documental versionada, notificaciones y auditoría inmutable.
2. **Qué cambió:** el modelo de tripulación se **simplificó** (V66: sin habilitaciones; copiloto = comandante; personal sanitario del DTS sin cuenta), la geografía operativa pasó a **jurisdicción de salida** con aeropuertos propuestos/confirmados (V63–V65) y el frontend se **reestructuró** en rutas, etapas y consulta primero. Esas tres líneas ocurrieron entre el 31/10 y el 03/11/2026.
3. **Calidad verificada:** compilan backend y frontend y pasan 646 + 357 pruebas en este commit. **No** hay una certificación E2E del código actual: la última corrida registrada (41/58) es anterior y los scripts de interfaz no se migraron.
4. **Riesgos principales:** falta de E2E vigente, ramas sin integrar a `main`, la capacidad no validada del personal sanitario, el acceso del copiloto y documentación/configuración obsoleta.
5. **Recomendación (no implementada):** antes de desplegar, consolidar la rama actual, ejecutar la suite E2E completa sobre SQL Server tras V66 y limpiar la configuración y documentación residual de habilitaciones y antivirus.

---

## Anexo A · Cobertura de la investigación

| Área | Qué se revisó | Resultado |
|---|---|---|
| Repositorio | Ramas, historial, estado, diferencias entre ramas y con `main`, migraciones y su aplicación en la base habitual | §2 |
| Backend | 20 controladores (anotaciones de seguridad completas), servicios de vuelo, tripulación, ubicación, itinerario, aeropuertos, personal sanitario, compuertas, autenticación (cambios desde V62), auditoría y monitoreo; entidades de las tablas nuevas; **los servicios de ruta, informe final, aeronaves, documentos y notificaciones se verificaron por sus reglas y por el diff vacío desde V62**, no línea por línea | §3–§8 |
| Frontend | Rutas, guards, navegación, etapas y pestañas, componentes de personal sanitario, asignación, aeropuertos y ubicación, notificaciones; commits de la reestructuración | §3, §5 |
| Base de datos | Esquema vivo completo (50 tablas, 534 columnas, 126 FK, 75 CHECK, 227 índices, 11 triggers) | `INFORME_COMPLETO_BASE_DATOS.md` |
| Calidad | Backend, frontend, build, E2E registrados | §9 |

## Anexo B · Limitaciones de verificación

1. No se ejecutó la aplicación ni los flujos E2E: el comportamiento descrito es el que **implementa el código**, contrastado con las pruebas automáticas que pasan.
2. El código de los servicios de ruta, informe final, aeronaves, documentos, geografía, pacientes, contactos y notificaciones se verificó por sus mensajes de regla, sus pruebas y la ausencia de cambios desde V62; no se releyó línea por línea.
3. No se pudo consultar GitHub (sin acceso autorizado): se desconoce el estado de los pull requests.
4. La base consultada es la habitual local (muy pocos datos); no se analizaron las otras bases de la instancia.
5. Las ramas, la memoria del proyecto y los documentos de `docs/` se usaron como contexto y se contrastaron con el código cuando fue posible; donde sólo hay mensaje de commit o documento se indica.
6. No se modificó el código, la base de datos, las migraciones, la configuración ni las dependencias. Artefactos creados fuera del repositorio: logs de pruebas y una salida de `vite build` en el directorio temporal de la sesión. Se **sobrescribió** `docs/INFORME_COMPLETO_BASE_DATOS.md` (borrador previo V62, sin versionar; se conservó una copia fuera del repositorio).
