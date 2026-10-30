# Integración funcional: paciente nuevo y solicitud sanitaria

> Continuación: la vinculación de una persona preexistente quedó implementada y probada en [INTEGRACION_IDENTIDAD_COMPARTIDA_2026-10-23.md](INTEGRACION_IDENTIDAD_COMPARTIDA_2026-10-23.md). Las prioridades y resultados que siguen describen el estado al cierre de este incremento anterior.

## Estado observado

- Rama `main`, último commit `e8fce25`. Al iniciar ya había modificaciones ajenas en `docker/sqlserver/init-db.sh` y `.gitattributes`; se preservaron.
- SQL Server habitual y stack E2E saludables. Consulta de sólo lectura: ambas bases en Flyway V47; la aislada contiene 40 tablas de aplicación. No se aplicó ninguna migración ni se alteró la base habitual.
- El inventario de las 40 tablas, sus relaciones, servicios, roles y brechas está en [MATRIZ_COBERTURA_FUNCIONAL.md](MATRIZ_COBERTURA_FUNCIONAL.md), tabla del apartado de inventario. Las 26 funcionales y 14 parciales son la **evaluación histórica anterior a este incremento**; no se reclasifica una tabla entera sólo por corregir un camino de uso.

## Mapa de procesos y tablas

| Proceso | Acción y estado | Servicio | Tablas afectadas | Resultado y verificación |
|---|---|---|---|---|
| Solicitud sanitaria con paciente nuevo | DTS completa identidad, prioridad, localidades y datos médicos; estado inicial `SOLICITADO` | `SanitaryRequestRegistrationService` coordina `PatientService` y `FlightService` | `personas`, `pacientes`, `vuelos`, `vuelos_sanitarios`, `informacion_medica_vuelo`, `negociaciones_horario_vuelo`, `eventos_auditoria`, `notificaciones` | Alta única y atómica; `e2e-paciente-solicitud.cjs` comprueba rollback, FK, consulta, auditoría y reutilización |
| Solicitud con paciente registrado | DTS selecciona paciente; estado inicial `SOLICITADO` | `FlightService.create` | Las tablas del vuelo; se reutiliza `pacientes` y `personas` | No se duplica identidad; `e2e-paciente-solicitud.cjs` y `e2e-solicitudes.cjs` |
| Evaluación y negociación | CO acepta, contrapropone o rechaza; DTS responde | `FlightService` | `vuelos_sanitarios`, `negociaciones_horario_vuelo`, `estados_solicitud_sanitaria`, `notificaciones`, `eventos_auditoria` | `e2e-solicitudes.cjs` |
| Asignación y planificación | CO asigna recursos; comandante participa y planifica | `FlightService`, `CrewManagementService`, `FlightRouteService` | `vuelos`, `aeronaves`, `vuelos_tripulantes`, `rutas_vuelo`, `eventos_auditoria` | `e2e-aeronaves-tripulacion.cjs`, `e2e-rutas-ui.cjs` |
| Preparación, ejecución y cierre | CO y comandante registran preparación, clima, bitácora y cierre | Servicios de hangar, clima, bitácora e informes | `informacion_hangar`, `instantaneas_clima`, `bitacora_vuelos`, `obligaciones_informe_final`, `informes_finales_vuelo`, `documentos_vuelo` y versiones | E2E específicos de cada proceso en `scripts/` y matriz |
| Vuelo no sanitario | CO o ADMIN crea sin paciente ni datos médicos; luego asignación, ejecución y cierre | `FlightService.createOperational` y servicios comunes | `vuelos` y tablas operativas comunes; no `vuelos_sanitarios` | `e2e-solicitudes.cjs`, `e2e-cierre.cjs` |

## Problema y cambio

El formulario DTS hacía dos peticiones: `POST /patients` y luego `POST /flights`. Si la segunda fallaba, dejaba una persona y un paciente sin solicitud. Además omitía los campos de identidad disponibles en el modelo. El nuevo `POST /flights/with-patient` recibe los datos del paciente y de la solicitud, usa los servicios existentes en una sola transacción y agrega un evento de auditoría `PATIENT / CREATE_WITH_SANITARY_REQUEST` ligado al vuelo, sin datos clínicos ni DNI. Conserva `POST /flights` para un paciente ya registrado.

El formulario contextual de DTS ahora solicita DNI y fecha de nacimiento opcionales al crear un paciente. Desactiva el envío mientras la solicitud se procesa. La validación de unicidad de DNI de V47 y las validaciones del vuelo siguen aplicándose; un conflicto o error revierte toda la transacción. Los permisos se exigen en el servidor: sólo DTS puede usar la nueva ruta.

Archivos: `FlightDtos.java`, `FlightController.java`, `SanitaryRequestRegistrationService.java`, `AuditCatalog.java`, `main.jsx`, `dts.test.jsx`, `AdministratorAuthorizationTest.java`, `CrewAndAircraftAssignmentAuthorizationTest.java`, `scripts/e2e-paciente-solicitud.cjs` y `scripts/e2e-paciente-solicitud-ui.cjs`. No hay migración nueva.

## Integración pendiente, por prioridad

1. **Identidad compartida de pacientes**: permitir asociar de manera confirmada a una persona que ya existe como usuario y aún no es paciente, con búsqueda exacta y verificación de identidad; revisar el uso de `personId` del endpoint antiguo. Tablas: `personas`, `pacientes`, `usuarios`. Flujo: alta DTS. Depende de reglas de acceso a datos personales.
2. **Búsqueda y mantenimiento de pacientes**: sustituir el listado global completo por búsqueda paginada y controles de acceso, y definir correcciones de datos personales con historial. Tablas: `pacientes`, `personas`, `eventos_auditoria`. Flujo: selección DTS y consulta de vuelo.
3. **Documentación del vuelo**: terminar alta e historial visual integrados en el detalle y E2E de archivos, bloqueo y versiones. Tablas: `documentos_vuelo`, `versiones_documento_vuelo`, `bloqueos_documento_vuelo`, `tipos_documento`.
4. **Catálogos operativos**: reemplazar los tipos de vuelo fijos del selector y validar los tipos activos con SQL E2E; después completar administración geográfica si existe necesidad operativa. Tablas: `tipos_vuelo`, `aeropuertos`, `localidades`, `provincias`.
5. **Contactos de cuenta**: verificar mantenimiento propio y definir si ADMIN necesita corregir contactos ajenos. Tablas: `correos_electronicos`, `telefonos`, `personas`.

## Validación ejecutada

- `e2e-paciente-solicitud.cjs` sobre API, backend y SQL Server aislados en V47: **aprobada**. Comprobó rollback ante localidades inválidas; rechazo de `personId` en la ruta atómica; 403 para CO y 401 sin sesión; identidad única con DNI formateado y canónico; vínculo de `personas` → `pacientes` → `vuelos_sanitarios`; fecha de nacimiento; auditoría en el vuelo; consulta por DTS; reutilización de la misma ficha en otro vuelo. Se ejecutó nuevamente tras cada ampliación del escenario.
- `e2e-paciente-solicitud-ui.cjs` con Chrome, frontend, backend y SQL Server aislados: **aprobada**. DTS cargó identidad y solicitud en el formulario y el vínculo se comprobó por consulta SQL.
- Frontend: `vitest run --no-file-parallelism --maxWorkers=1`, **102 pruebas aprobadas** antes de agregar la prueba específica de paciente existente; luego `vitest run src/dts.test.jsx --no-file-parallelism --maxWorkers=1`, **6 pruebas aprobadas**, incluida esa regresión. `npm run build` y compilación del frontend Docker E2E, correctos.
- Backend: `mvn test` tras la corrección, **301 pruebas aprobadas, 0 fallas, 0 errores y 0 omitidas** (conteo de Surefire). La primera ejecución dio 15 errores de contexto en dos clases `@WebMvcTest` por faltar el mock del nuevo servicio; se corrigieron y la segunda suite completa pasó. Compilación y paquete Docker E2E correctos.
- El primer intento de Vitest paralelo agotó el tiempo de arranque de siete workers; se repitió secuencialmente. El primer intento de Chrome recibió 403 porque se inició el backend E2E sin el overlay de CORS para `:18081`; se recreó sólo ese contenedor con el overlay y la prueba pasó. No se tocó el stack habitual.

No se ejecutaron pruebas sobre la base habitual, ni se aplicaron migraciones. La cobertura actual valida este incremento; la asociación con una persona preexistente sin ficha de paciente sigue pendiente.
