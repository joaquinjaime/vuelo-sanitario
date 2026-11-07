# Aislamiento de solicitudes DTS y dashboard de Administración (2026-11-06)

## A. Solicitudes DTS

**Causa raíz.** Cada solicitud ya guardaba su creador (`vuelos_sanitarios.id_usuario_solicitante`, NOT NULL, FK a `usuarios`; además `vuelos.id_usuario_creador`). El listado y las lecturas de un DTS *puro* ya filtraban por ese campo. La visibilidad cruzada se producía con **cuentas que reúnen DTS y ADMINISTRADOR** (en la base local, `juan123`): el backend daba lectura global de vuelos a cualquier cuenta con el rol ADMINISTRADOR, sin mirar si además era DTS. En «Mis solicitudes» esa cuenta recibía todas las solicitudes (`GET /api/flights` → `findAll()`), y por identificador podía leer detalle, clima, ruta, personal sanitario, hangar, bitácora, coordinaciones aeroportuarias e informes finales de cualquier solicitud.

**Cómo se identifica al creador.** Por `id_usuario_solicitante`, que se asigna en el servidor con el `id` del JWT validado (`@AuthenticationPrincipal`). Ningún endpoint acepta un `usuarioId`/`creadorId` para ello y no existe operación que cambie el propietario. **No hizo falta migración**: no hay cambios de esquema ni de datos, y no existen solicitudes históricas sin propietario (la columna es NOT NULL).

**Cambios de backend**
- `FlightAuthorizationService`: regla única `readsAllFlights(roles)` = Operaciones, o ADMINISTRADOR **que no es también DTS**. `mayRead` (usada por detalle, clima, ruta, personal sanitario, documentos, auditoría por vuelo) la aplica.
- La misma regla reemplaza al chequeo suelto de ADMINISTRADOR en `FlightService.list`, `HangarInfoService.get`, `FlightLogService.history`, `Aa2000CoordinationService.canRead` y `FinalReportWorkflowService.requireReader`.
- `GET /api/flights?scope=mine|all` (defecto `all`): `mine` sólo **estrecha** el resultado a las solicitudes creadas por el usuario autenticado; nunca amplía. Lo usa el área DTS, de modo que una cuenta DTS+Centro de Operaciones ve en «Mis solicitudes» únicamente las suyas y conserva la bandeja completa en el área de Operaciones.
- El listado de una cuenta DTS+COMANDANTE ahora une sus solicitudes y sus vuelos asignados (antes ocultaba las propias).
- `respondToCounterproposal`: la propiedad se comprueba **antes** que el estado, para que otro DTS no averigüe la etapa de una solicitud ajena (siempre 403).
- Respuesta ante recurso ajeno: se mantiene la política existente (403 «No tiene acceso a este vuelo», 404 en eventos de auditoría). Nota: 403 vs 404 distingue un id existente de uno inexistente; es la política vigente y no se modificó.

**Endpoints ya correctos (verificados, sin cambios):** documentos (lista, acceso, versiones, bloqueo, descarga), contactos de traslado, personal sanitario (asignar/reemplazar/retirar exigen ser el solicitante), cancelación, respuesta a contrapropuesta, auditoría por vuelo/evento (global sólo ADMINISTRADOR), notificaciones (siempre por usuario; marcar ajena → 403).

**Frontend.** `OperationalDataProvider` pide `/flights?scope=mine` en el área DTS y se monta con clave `usuario:área`, por lo que al cerrar sesión e ingresar otra cuenta no sobrevive ningún dato cargado. Estado vacío con «Nueva solicitud» ya existía. Filtros, contadores, búsqueda y paginación operan sobre el conjunto devuelto por el servidor.

**Pendiente / residual a decidir (no modificado).**
1. Una cuenta DTS+ADMINISTRADOR conserva el módulo de Auditoría de Administración (`/api/audit`, es una función administrativa que muestra eventos de todos los vuelos). Recomendación: cuentas separadas para el rol DTS y el administrativo.
2. El directorio de pacientes (`/api/patients/search`, por DNI exacto o nombre+apellido) es compartido entre DTS por diseño: expone la identidad del paciente, no sus solicitudes ni vuelos.
3. Una cuenta DTS+ADMINISTRADOR pierde la lectura global de vuelos por API (la pantalla de Administración no la usaba).

## B. Dashboard de Administración
- Componente: `frontend-react/src/features/dashboard/AdminDashboard.jsx`; CSS en `styles/ui.css`.
- Se eliminó la tarjeta «Cuentas desactivadas». Quedan Cuentas activas, Activaciones pendientes y Aeronaves activas, y «Gestión frecuente».
- Responsive: `.stat-grid-three` = 3 columnas iguales; bajo 62rem (≈992 px) se apilan a ancho completo (sin tarjeta huérfana a media fila).
- Usuarios desactivados: sin cambios; siguen en Administración → Usuarios → «Desactivadas» (`?estado=desactivados`), con baja lógica, reactivación y auditoría. El endpoint `/auth/users/summary` no se tocó.

## C. Pruebas
**Resultado:** backend `mvn -o test` 656 aprobadas / 0 fallidas (BUILD SUCCESS); frontend `vitest run` 362 aprobadas / 0 fallidas (35 archivos); `npm run build` correcto.

- Backend, nueva `RequestIsolationIntegrationTest` (10 pruebas, HTTP + JWT + seguridad reales sobre H2): propiedad y alcance; acceso directo por id a ~15 recursos; modificaciones ajenas rechazadas sin cambios de datos; documentos; ciclo de vida (negociación → aceptación → planificado → en curso → finalizado → completado, cancelada y rechazada); Operaciones/Comandante/Administrador sin regresión; cuentas DTS+ADMINISTRADOR, DTS+CO y DTS+COMANDANTE. Control negativo: con el comportamiento viejo la prueba falla.
- Frontend, nueva `dtsIsolation.test.jsx` (4) y ajustes en `AppRoutes.test.jsx` (tarjeta eliminada, usuarios desactivados) y `requests.test.jsx`.
- Límites de entorno: H2 no crea las tablas `obligaciones_informe_final` y `bitacora_vuelos`, por lo que el detalle completo (`GET /api/flights/{id}`) y la cancelación exitosa no corren de punta a punta en estas pruebas; su autorización se prueba con la regla real del servicio (rechazos 403 sí por HTTP) y la cancelación propia con mocks en `RequestNegotiationServiceTest`. La finalización real con comandante no se reejecuta aquí (estados fijados directamente). No se ejecutó el E2E contra SQL Server ni se probó en el navegador.

## D. Puesta en marcha local (sin borrar volúmenes ni datos)
No hay migraciones. Reconstruir sólo backend y frontend:
```bash
docker compose up -d --build backend frontend
```
