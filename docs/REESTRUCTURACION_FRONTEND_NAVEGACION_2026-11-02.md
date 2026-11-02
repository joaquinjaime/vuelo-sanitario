# Reestructuración integral del frontend (navegación por rutas) — 2026-11-02

Rama: `feat/frontend-reestructuracion` (sobre `fix/asignacion-comandante-aeronave-ubicacion`). Alcance: **sólo `frontend-react/`**. No se tocó el backend,
las migraciones Flyway, los contratos de la API ni ninguna base de datos o volumen Docker.

## 1. Resumen

El frontend era una página extensa: `main.jsx` (780 líneas) contenía dos aplicaciones (`AdminApp` y `OperationalApp`) con navegación por `#hash`
y por estado interno; las opciones del menú desplazaban o reemplazaban bloques dentro de una misma pantalla, y cada rol resolvía sus tareas
eligiendo un vuelo en un `<select>` dentro de una tarjeta que mostraba todo a la vez.

Ahora es una SPA con **React Router**: rutas reales, un layout persistente (barra lateral + barra superior + área de trabajo), una pantalla por
módulo, listados con filtros en la URL, pantallas de detalle (solicitud/vuelo, usuario, aeronave) con **pestañas que tienen URL propia**, tableros
de inicio por rol y un conjunto de componentes reutilizables. Las funcionalidades de negocio no cambiaron: los componentes de cada módulo se
conservaron y se reubicaron; lo que se reescribió es la carcasa, la navegación y la composición de las pantallas.

## 2. Auditoría (problemas detectados)

| # | Problema | Dónde |
|---|---|---|
| 1 | Una sola pantalla larga por área; el menú lateral hacía de índice (`#/vuelos` mostraba formularios, listas y detalle apilados). | `OperationalApp` |
| 2 | Navegación por estado + `history.replaceState`/`#hash`: sin Atrás/Adelante, sin URL por pantalla, sin deep links a un detalle salvo `#/vuelos/<id>`. | `OperationalApp`, `AdminApp` |
| 3 | Dos aplicaciones paralelas con estructuras distintas (admin vs. operativa), cada una con su propio login, tema, sesión y avisos. | `AdminApp` / `OperationalApp` |
| 4 | El detalle de un vuelo se elegía con un `<select>` genérico; no se podía compartir ni recargar el contexto. | `Ops`, `Cmd`, `DtsResponses` |
| 5 | El detalle mostraba 15+ secciones una debajo de otra (hangar, bitácora, documentos, clima, ruta…); la regla «sin acuerdo de horario no hay carga documental» se resolvía ocultando secciones dentro de una página única. | `Ops`, `Cmd` |
| 6 | Alta de usuario y de aeronave en modales gigantes; detalle de usuario/aeronave incrustado bajo la tabla. | `AdminUsers`, `AdminAircraft`, `UserDirectory` |
| 7 | Formularios largos sin agrupar (solicitud DTS: 20 campos en una cuadrícula). | `DTS` |
| 8 | Sin control de acceso por ruta ni pantalla 403/404; el menú y la protección no compartían una definición. | — |
| 9 | Estilos: una hoja de 712 líneas con dos juegos de variables y el shell definido dos veces; sin sistema de espaciado ni componentes. | `styles.css` |
| 10 | Estados mostrados con el código interno (`PENDIENTE_RESPUESTA_DTS`), dependiendo sólo del color. | varios |
| 11 | Los avisos de resultado eran un párrafo fijo arriba de la página (visible sólo si se estaba arriba). | `OperationalApp` |
| 12 | Móvil: el menú del administrador se convertía en una barra horizontal; el resto ocultaba el menú sin forma de abrirlo salvo un botón suelto. | CSS |

## 3. Arquitectura nueva

```
frontend-react/src/
  main.jsx                      entrada: createRoot(<App/>)
  app/
    App.jsx                     proveedores (tema, avisos, sesión) + BrowserRouter
    AppRoutes.jsx               tabla de rutas (pantallas con carga diferida)
    navigation.js               ÚNICO mapa: módulos por área, acceso por ruta, redirección de enlaces «#/…» antiguos
    guards.jsx                  RequireAuth, RedirectIfAuthenticated, RequireWorkspace, 403/404, LegacyHashRedirect
    layouts/                    AppLayout, Sidebar, Topbar
    providers/                  SessionProvider, NotifyProvider (avisos), ThemeProvider, OperationalDataProvider (vuelos + avisos)
  components/
    ui/                         Icon, PageHeader/Breadcrumbs, Card/Field, RouteTabs/SegmentedControl, data (DataTable, Pagination,
                                FilterBar, SearchInput, StatCard), feedback (Alert, Spinner, EmptyState, ErrorState, LoadingBlock),
                                Modal/ConfirmDialog, StatusBadge, Stepper
    forms/                      PhoneField, DniRectification
  features/
    auth/                       LoginPage, PasswordChangePage, WorkspaceSelector, AuthLayout, workspace.js
    dashboard/                  Admin/Dts/Operations/Commander dashboards, AttentionList, attention.js
    flights/                    FlightListPage, pages/ (Requests, Flights, NewRequest, NewOperationalFlight),
                                detail/ (FlightDetailPage, flightTabs, nextStep, useFlightDetail, CancelFlightDialog),
                                tabs/ (Summary, Negotiation, Planning, Team, Documents, Operation, History),
                                components/ (FlightCrew, FlightLog, HangarInfo, …), flightStages, negotiation, documents, flightRoute, …
    users/  aircraft/  catalogs/  patients/  health-staff/  audit/  account/  notifications/  reports/  admin/
  hooks/                        useQueryState (filtros en la URL), useResource (lectura con protección contra respuestas tardías), useBack
  services/api.js               cliente HTTP (sin cambios de contrato; +evento de sesión vencida)
  utils/                        format.js, flightAdapter.js, contactRules.js
  styles/                       tokens.css, base.css, layout.css, ui.css, features.css
```

Decisiones:

* **Router**: `react-router-dom@7.18.4` (única dependencia nueva). `BrowserRouter`: `nginx.conf` ya tenía `try_files … /index.html`, así que las URL
  se pueden abrir y recargar. Los enlaces antiguos `#/vuelos/7`, `#/admin/usuarios`, `#/mi-cuenta`… se convierten a la ruta real (`LegacyHashRedirect`).
* **Un solo mapa de acceso** (`navigation.js`): el menú lateral y los guards salen de la misma tabla; una prueba verifica que el menú nunca
  ofrece una pantalla que la ruta rechazaría. La autorización real sigue siendo la del servidor (el frontend sólo decide qué se muestra).
* **Áreas de trabajo** (`ADMIN`, `DTS`, `OPERACIONES`, `COMANDANTE`): usuarios con un rol la tienen implícita; con varios eligen una (se guarda en
  `sessionStorage`) y la cambian desde el menú de usuario. Una URL de otra de sus áreas cambia el área en lugar de rechazarla.
* **Datos**: `OperationalDataProvider` mantiene los vuelos y avisos del usuario (refresco cada 30 s con la pestaña visible y al volver a ella, igual
  que antes). El resto de los recursos los pide cada pantalla con `useResource`. El área administrativa no consulta vuelos ni avisos.
* **Sesión vencida**: `api.js` emite un evento ante un 401 con token y la aplicación cierra la sesión una sola vez y lo explica en el ingreso.
* **Carga diferida** por pantalla (`React.lazy`): el paquete inicial pasa de un único bloque de 794 kB a 243 kB (el detalle de solicitud/vuelo, el más pesado, se descarga aparte: 110 kB).
* **Estado en la URL**: búsqueda, filtros y página de cada listado (`?filtro=…&q=…&pagina=…`). Al abrir un detalle y volver (Atrás o «Volver») el listado
  conserva su contexto, y la vista filtrada se puede compartir.
* **Pestañas con `replace`**: cambiar de pestaña no suma entradas al historial; Atrás sale del detalle y regresa a la pantalla anterior.

## 4. Mapa de rutas

Todas las rutas privadas cuelgan de `/app`; públicas: `/login`, `/cambiar-contrasena`. `/` redirige a `/app/inicio`; una ruta desconocida muestra 404.

| Ruta | Áreas | Pantalla |
|---|---|---|
| `/app/inicio` | todas | Panel de inicio del área |
| `/app/mi-cuenta` | todas | Contactos propios y cambio de contraseña |
| `/app/usuarios` · `/nuevo` · `/:id` | ADMIN | Listado (`?estado=activos\|pendientes\|desactivados&rol=&q=&pagina=`), alta, detalle |
| `/app/aeronaves` · `/nueva` · `/:id` · `/:id/editar` | ADMIN | Listado (`?estado=activas\|desactivadas&q=`), alta, detalle, edición |
| `/app/geografia` · `/pacientes` · `/auditoria` | ADMIN | Catálogos y auditoría |
| `/app/comandantes` | ADMIN, OPERACIONES | Ubicación operativa de comandantes |
| `/app/solicitudes` · `/nueva` · `/:id/:pestaña?` | DTS, OPERACIONES (`/nueva` sólo DTS) | Mis solicitudes / bandeja de solicitudes sanitarias |
| `/app/vuelos` · `/nuevo` · `/:id/:pestaña?` | OPERACIONES, COMANDANTE (`/nuevo` sólo OPERACIONES) | Vuelos / Mis vuelos |
| `/app/informes` | OPERACIONES, COMANDANTE | Informes finales (revisión / presentación) |
| `/app/personal-sanitario` | DTS | Catálogo de médicos y enfermeros |
| `/app/notificaciones` | DTS, OPERACIONES, COMANDANTE | Avisos (cada uno abre su solicitud o vuelo) |

Pestañas del detalle: `resumen` (por omisión) · `negociacion` · `planificacion` · `equipo` · `documentos` · `operacion` · `historial`.

## 5. Navegación por rol

| Rol / área | Menú lateral |
|---|---|
| Administrador | Inicio · Gestión: Usuarios, Aeronaves · Catálogos: Geografía, Ubicación de comandantes, Pacientes · Control: Auditoría |
| DTS | Inicio · Solicitudes: Mis solicitudes, Nueva solicitud · Mi equipo: Personal sanitario · Avisos: Notificaciones |
| Centro de Operaciones | Inicio · Operación: Solicitudes (con el contador de las que requieren intervención), Vuelos, Informes finales · Recursos: Comandantes · Avisos |
| Comandante | Inicio · Operación: Mis vuelos (contador de acciones pendientes), Informes finales · Avisos |

El administrador no ve ningún módulo operativo (ni se le consultan vuelos o avisos); la selección de médicos y enfermeros del vuelo es del DTS.

Tableros de inicio (todos los números salen de datos reales ya disponibles; no hay indicadores inventados):

* **Administrador**: cuentas activas / pendientes / desactivadas (`/auth/users/summary`), aeronaves activas, accesos rápidos.
* **DTS**: solicitudes que requieren su respuesta, en negociación, acordadas y en preparación, avisos; lista de lo que espera su respuesta.
* **Centro de Operaciones**: contadores y bandeja de la bandeja de solicitudes (nuevas primero, extrema urgencia, antigüedad), rutas por revisar,
  informes finales por revisar, vuelos operativos que requieren decisión.
* **Comandante**: asignaciones por aceptar, vuelos planificados, en curso, informes finales pendientes, alerta de funciones bloqueadas por informe vencido.

## 6. Detalle de solicitud/vuelo y regla del acuerdo de horario

`FlightDetailPage` arma sus pestañas con `flightTabs.tabsFor()`, que reutiliza `flightStage`/`visibleSections` (el estado real que informa el servidor);
ninguna pantalla repite esas condiciones. Una pestaña sin secciones habilitadas se muestra **bloqueada**, con el motivo, y no es un enlace; si se
abre su URL se muestra el bloqueo y **no se consulta ningún endpoint** de esa etapa.

| Etapa (estado) | Centro de Operaciones | DTS |
|---|---|---|
| Negociación (SOLICITADO, PENDIENTE_RESPUESTA_DTS) | Resumen · **Negociación** (se abre aquí) | Resumen · **Negociación** · Historial |
| Horario acordado (APROBADO) | + Planificación · Tripulación y contactos · Documentos · Historial | + Personal y contactos · Documentos (consulta) |
| Preparación (PLANIFICADO…) | + Ejecución y cierre | igual |
| Cerrada sin acuerdo (RECHAZADO) | Resumen · Negociación · Historial | igual |
| Vuelo operativo (sin solicitud) | todas | — |

El comandante ve sólo vuelos que ya le asignaron: Resumen (con la confirmación de asignación y «qué sigue») · Planificación · Tripulación · Documentos ·
Ejecución y cierre · Historial. Las acciones críticas (cancelar vuelo/solicitud) están en el encabezado, con diálogo de motivo.
La tarjeta «qué sigue» (`nextStep.js`) y el indicador de etapas informan la situación; no habilitan nada (lo habilita el estado y lo revalida el servidor).

## 7. Sistema de diseño

Tokens en `styles/tokens.css` (claro/oscuro, espaciado, radios, sombras, colores semánticos); el tema se aplica a `<html>` y `<body>` y se recuerda
(`vs-theme`). Componentes: encabezado de página con migas, tarjetas, tablas con scroll horizontal propio, paginación, filtros, contadores,
etiquetas de estado **con texto y símbolo** (nunca sólo color; los estados se muestran con su nombre comprensible, no con el código interno),
alertas, avisos transitorios (`role=status` / `role=alert`), diálogos accesibles (foco atrapado, Escape, restauración del foco), indicador de etapas.
Accesibilidad: enlace «Saltar al contenido», foco al contenido en cada cambio de pantalla, estados de foco visibles, `prefers-reduced-motion`,
migas, un único `h1` por pantalla, `aria-current` en menú y pestañas, controles de 2.5 rem.
Responsive: escritorio (barra lateral contraíble, preferencia recordada), tablet (barra de iconos) y móvil (panel deslizable que se cierra con
Escape o al navegar; el área de trabajo scrollea con la página).

## 8. Matriz de cobertura funcional

«Verificado» = prueba automatizada (Vitest) y/o recorrido real con Chrome sobre el stack aislado; «Componente conservado» = el componente y sus pruebas
originales no cambiaron, sólo su ubicación; se comprobó en Chrome que la pantalla carga con datos reales.

| Funcionalidad | Ubicación anterior | Nueva pantalla | Estado |
|---|---|---|---|
| Ingreso, activación de cuenta, cambio obligatorio de contraseña | `Login`, `PasswordRequired` | `/login`, `/cambiar-contrasena` | Verificado (tests + Chrome) |
| Sesión JWT, 401, cierre de sesión | estado de `AdminApp` | `SessionProvider` + menú de usuario | Verificado |
| Cambio de área (varios roles) | botón «Cambiar área» | selector + menú de usuario | Verificado |
| Tema claro/oscuro | botón ◐ | barra superior | Verificado |
| Panel del administrador | Inicio (admin) | `/app/inicio` | Verificado |
| Listar, buscar y filtrar usuarios, paginación del servidor | Usuarios | `/app/usuarios` | Verificado |
| Usuarios desactivados / pendientes | pestaña «desactivados» | `/app/usuarios?estado=…` | Verificado |
| Alta de usuario (persona existente, DNI desactivado, código único) | modal «Nuevo usuario» | `/app/usuarios/nuevo` | Verificado |
| Detalle, edición, roles, desactivar, reactivar, restablecer credenciales, regenerar código, rectificar DNI, historial | detalle bajo la tabla | `/app/usuarios/:id` | Verificado |
| Aeronaves: listado, búsqueda, activas/desactivadas | Aeronaves | `/app/aeronaves` | Verificado |
| Alta / edición de aeronave | modales | `/app/aeronaves/nueva`, `/:id/editar` | Verificado |
| Detalle (vuelos, historial), cambio de ubicación, activar/desactivar | modal «Detalle» | `/app/aeronaves/:id` | Verificado |
| Geografía · Pacientes · Auditoría | secciones del admin | `/app/geografia`, `/pacientes`, `/auditoria` | Componente conservado + Chrome |
| Ubicación de comandantes | admin / «Comandantes» (CO) | `/app/comandantes` | Componente conservado + Chrome |
| Mi cuenta: contactos y verificación de correo | «Mi cuenta» | `/app/mi-cuenta` | Verificado |
| Cambio de contraseña desde la cuenta | sólo admin | `/app/mi-cuenta` (todas las áreas)¹ | Verificado |
| Notificaciones, marcar leídas, alertas de extrema urgencia | «Notificaciones» | `/app/notificaciones` (+ campana con contador, enlace «Abrir») | Verificado |
| Bandeja de solicitudes del CO (orden, contadores, refresco) | Inicio / Gestión de vuelos | `/app/inicio`, `/app/solicitudes` | Verificado |
| Crear solicitud sanitaria (paciente nuevo/existente, localidades, urgencia, contactos) | «Nueva solicitud DTS» | `/app/solicitudes/nueva` | Verificado (tests + Chrome) |
| Mis solicitudes del DTS | selector «Solicitud» | `/app/solicitudes` | Verificado |
| Responder contrapropuesta; cancelar solicitud (DTS) | `DtsResponses` | `/app/solicitudes/:id` (Negociación; cabecera) | Verificado |
| Personal sanitario del vuelo y contactos del traslado (DTS) | `DtsResponses` | `…/:id/equipo` | Verificado |
| Catálogo de personal sanitario (DTS) | «Personal sanitario» | `/app/personal-sanitario` | Componente conservado + Chrome |
| Negociación del horario (aceptar / proponer / reemplazar / rechazar) | `Ops` | `/app/solicitudes/:id` (Negociación) | Verificado |
| Resumen de la solicitud y cierre administrativo | `Ops` | Resumen | Verificado |
| Asignación de comandante, aeronave y copiloto | `Ops` | `…/:id/planificacion` | Componente conservado + Chrome |
| Aeropuertos de salida/llegada · cambio de aeronave · hangar · coordinaciones · clima | `Ops` | `…/:id/planificacion` | Componente conservado + Chrome |
| Ruta (revisión del CO) y cola de rutas pendientes | `Ops` + lista | `…/planificacion`, `/app/vuelos` | Verificado |
| Tripulación (retiro, historial, contactos), personal sanitario (lectura), contactos | `Ops` | `…/:id/equipo` | Verificado |
| Documentos del vuelo (versiones, bloqueo, retiro) y bloqueo previo al acuerdo | `Ops`, `Cmd`, `DtsResponses` | `…/:id/documentos` | Verificado (tests + Chrome) |
| Iniciar / finalizar vuelo, bitácora, cierre | `Ops` | `…/:id/operacion` | Verificado |
| Cancelar vuelo | `Ops` | cabecera del detalle | Verificado |
| Historial / auditoría del vuelo | `Ops`, `Cmd`, `DtsResponses` | `…/:id/historial` | Verificado |
| Crear vuelo operativo | `OperationalFlightForm` | `/app/vuelos/nuevo` | Verificado |
| Propuesta de horario del comandante / replanificación (vuelos operativos) | `Ops` | `/app/vuelos/:id` (Negociación) | Componente conservado |
| Listado «Vuelos visibles» | `FlightList` | `/app/vuelos`, `/app/solicitudes` (búsqueda, filtros, paginación) | Verificado |
| Confirmación de asignación (aceptar / rechazar / proponer horario) | `Cmd` | `/app/vuelos/:id` (Resumen) | Verificado |
| Planificación de ruta, aeropuertos y clima del comandante | `Cmd` | `…/:id/planificacion` | Verificado |
| Informes finales: presentar, corregir, prórroga (comandante) | `CommanderReports` | `/app/informes` | Componente conservado + Chrome |
| Revisión de informes finales (CO) | `OperationsReports` | `/app/informes` | Componente conservado + Chrome |

¹ Era una funcionalidad existente (`/auth/me/password`, el mismo endpoint de la contraseña temporal); se expuso a todas las áreas. No es un módulo nuevo.

No se retiró ninguna funcionalidad.

## 9. Pruebas y validación

| Qué | Comando / método | Resultado |
|---|---|---|
| Línea base (antes) | `npx vitest run` | 29 archivos, **312** pruebas ✓ |
| Suite final | `npx vitest run` (en `frontend-react/`) | 34 archivos, **353** pruebas ✓ |
| Build de producción | `npx vite build` | ✓ (paquete inicial 794 kB → 243 kB; 42 archivos JS por pantalla) |
| Build en Docker | `docker build frontend-react` (imagen de prueba, sin tocar contenedores) | ✓ (`npm ci` + `vite build` dentro de la imagen) |
| Recorrido en Chrome — todos los roles, escritorio / tablet / móvil | Playwright + Chrome real contra el stack E2E aislado (API :18080) | 144 páginas (4 roles × 3 tamaños): sin errores de consola ni respuestas HTTP ≥ 400 y sin desborde horizontal. Se corrigieron durante el recorrido: un 403 del comandante (`/flights/route-statuses`, sólo del CO), desbordes en móvil y la insignia de la barra de iconos |
| Flujo completo en Chrome | DTS crea la solicitud → CO la abre, comprueba el bloqueo documental, acepta el horario → se habilitan las etapas; Atrás/Adelante, recarga, menú móvil, 404 | 26/26 comprobaciones ✓ |

Cobertura automatizada nueva: tabla de rutas y guards (sesión, redirección tras el ingreso, contraseña temporal, 403/404, enlaces antiguos,
cambio de área, recarga), menú por rol, coherencia menú ↔ rutas, barra lateral (contraer / móvil), tema, accesibilidad básica (foco, un solo h1,
migas, título del documento), listados con filtros en la URL, pestañas por etapa (`tabsFor` y `nextStep`), bloqueo documental, cancelación,
inicio de vuelo, notificaciones con enlace, hook `useResource`. Se **portaron** las pruebas existentes de `Ops`/`Cmd`/`DtsResponses`/`AdminUsers`/
`AdminAircraft`/`UserDirectory` a las pantallas nuevas conservando sus aserciones de negocio (carreras de respuestas tardías, doble envío,
confirmaciones, errores del servidor).

**Pendiente / limitaciones** (sin ocultar):

* Los guiones E2E de interfaz (24 archivos `scripts/e2e-*-ui.cjs` y `e2e-audit-actor-search.cjs`, que usan Chrome) apuntan a la interfaz anterior (selector «Solicitud», `#/…`, textos de botones de los
  modales). **No se adaptaron** y fallarán hasta que se migren a las rutas nuevas; los guiones de API (`e2e-*.cjs` sin `-ui`) no se ven afectados.
  Los enlaces `#/…` siguen funcionando para quien abra una URL, pero los selectores de esos guiones no.
* Las pantallas de Geografía, Pacientes, Personal sanitario, Ubicación de comandantes, Auditoría, Mi cuenta (contactos) e Informes finales **conservan
  sus componentes originales** (con su diseño propio) dentro de pantallas y encabezados nuevos; no se rediseñaron por dentro. Algunos conservan
  títulos propios (`h2`/`h4`) y estilos heredados (`features.css`).
* `/flights` no está paginado en el servidor: los listados de vuelos paginan en el cliente (12 por página). Usuarios sí usa la paginación del servidor.
* La verificación visual se hizo con Chrome headless (capturas y comprobaciones de DOM); no hubo revisión por una persona ni pruebas con lectores de pantalla.
* El tablero del DTS y del CO usan los vuelos ya cargados; no existe un endpoint de indicadores agregados (se documenta en lugar de inventarlos).
* Se mantiene `window.confirm` en confirmaciones heredadas (retiro de tripulante, desactivar usuario/aeronave, iniciar vuelo…) porque las pruebas y los
  guiones E2E lo usan; las acciones nuevas usan el diálogo accesible (`ConfirmDialog`/`Modal`).

## 10. Cómo probarlo localmente

* **Docker (lo habitual)**: el contenedor sirve el build de la imagen; modificar archivos no lo actualiza. Reconstruir sólo el frontend:
  `docker compose up -d --build frontend` (y refrescar el navegador con Ctrl+F5). Para el stack aislado de pruebas usar el mismo comando con sus
  archivos (`-p vuelos-sanitarios-e2e -f docker-compose.yml -f docker-compose.e2e.yml -f docker-compose.e2e.ui.yml --profile ui … frontend`).
  No hace falta reiniciar el backend ni la base. Tras el cambio, cualquier sesión abierta sigue siendo válida (mismas claves `vs-token`/`vs-session`).
* **Desarrollo**: `cd frontend-react && npm ci && npm run dev`. `vite.config.js` reenvía `/api` a `http://localhost:8080`
  (`VITE_DEV_PROXY` cambia el destino; `VITE_DEV_ORIGIN` el origen que se declara ante el CORS del backend, p. ej. `http://127.0.0.1:18081`
  cuando se apunta al stack aislado).
* **Pruebas**: `npm test` (Vitest). **Build**: `npm run build`.
* Ya no se usa `#/…`: las URL son `/app/…` (p. ej. `/app/solicitudes/12/documentos`).
