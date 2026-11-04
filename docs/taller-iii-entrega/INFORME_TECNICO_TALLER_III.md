# Informe Técnico Integral Taller III

## 1. Portada

**Proyecto:** Vuelos Sanitarios  
**Materia:** Taller III  
**Carrera:** Ingeniería Informática  
**Universidad:** UNSTA  
**Año académico:** 2026  
**Integrantes:** Pendiente de completar con datos fiables  
**Docente:** Pendiente de completar

## 2. Descripción del problema

Vuelos Sanitarios centraliza el ciclo operativo de traslados sanitarios y vuelos operativos: solicitud, evaluación, asignación de recursos, planificación, ejecución, cierre, documentación y trazabilidad. El problema no es sólo registrar un vuelo; es mantener coherentes la solicitud sanitaria, el paciente, el personal, las aeronaves, los horarios, la ruta, las obligaciones de informe y la evidencia documental, con distintos permisos. Los actores confirmados por código son DTS, Operaciones/Centro de Operaciones, Comandante y Administrador.

El beneficio esperado es sustituir la coordinación dispersa por un registro transaccional y consultable. No se afirma que la aplicación esté habilitada para operación real: el propio repositorio documenta dependencias regulatorias, políticas profesionales no aprobadas y servicios externos todavía pendientes.

## 3. Objetivos

**Objetivo general.** Gestionar y trazar el ciclo de vuelos sanitarios y operativos con persistencia relacional, segregación de responsabilidades y validaciones de dominio.

**Objetivos específicos.** Registrar solicitudes y pacientes; administrar catálogos, usuarios, aeronaves y tripulación; coordinar recursos y horarios; versionar y revisar rutas; exigir y revisar informes finales; guardar documentos PDF con versiones; aplicar autenticación JWT y autorización por rol; conservar auditoría, notificaciones e integridad referencial.

## 4. Alcance funcional

| Módulo | Funcionalidad | Rol autorizado | Estado real | Evidencia |
|---|---|---|---|---|
| Acceso | login, activación, credenciales y perfil | autenticado / público limitado | IMPLEMENTADO | `AuthController`, `JwtAuthenticationFilter` |
| Solicitudes | alta sanitaria, consulta, negociación y cancelación | DTS, Operaciones según acción | IMPLEMENTADO | `FlightController`, `FlightService` |
| Recursos | aeronaves, comandante y tripulación | Operaciones; administración según catálogo | IMPLEMENTADO | `CatalogController`, `CrewManagementService` |
| Ruta | versión, presentación, aprobación/devolución | Comandante / Operaciones | IMPLEMENTADO | `FlightRouteController`, `FlightRouteService` |
| Cierre | informe final, adjuntos y plazo | Comandante / Operaciones | IMPLEMENTADO | `FinalReportWorkflowService` |
| Documentos | PDF, versiones, lock y baja lógica | Comandante/Operaciones | IMPLEMENTADO | `DocumentController`, `DocumentService` |
| Habilitaciones | credenciales, políticas y consultas manuales | Administrador | IMPLEMENTADO; política real pendiente | `ProfessionalCredentialController`, V59-V60 |
| Auditoría | consulta global y por vuelo | Administrador / lectores habilitados | IMPLEMENTADO | `AuditController`, `AuditQueryService` |

Limitación relevante: las políticas profesionales de suficiencia se mantienen vacías hasta aprobación de negocio; en ese estado la elegibilidad falla de forma segura. La integración con organismos externos no está implementada como consulta automática: sólo se registra una constancia manual.

La matriz anterior muestra los módulos con evidencia directa en controladores, servicios y pruebas. El detalle de cada permiso, endpoint y evidencia se conserva en los anexos para que la lectura principal no duplique el inventario técnico.

## 5. Tecnologías utilizadas

El backend es Java 21 con Spring Boot 3.4.5, Spring Web, Validation, Data JPA, Security, Actuator, WebSocket y Mail. JJWT 0.12.6 firma y valida tokens; SQL Server se accede con el driver JDBC; Flyway y Flyway SQL Server administran DDL. El frontend usa React, Vite y Vitest. Docker Compose orquesta SQL Server 2022, backend, frontend Nginx, inicialización de base y, opcionalmente, ClamAV. Estas afirmaciones proceden de `backend-java/pom.xml`, `frontend-react/package.json`, `application.yml` y `docker-compose.yml`.

## 6. Arquitectura de la solución

La solución separa React/Vite, API REST Spring Boot y SQL Server. El filtro JWT autentica cada petición Bearer y carga roles; los controladores aplican `@PreAuthorize`, los servicios contienen reglas y transacciones, y los repositorios JPA persisten entidades. Hibernate está configurado con `ddl-auto: validate`; Flyway es el dueño del esquema. No se detectó uso de Hibernate para generar DDL.

El recorrido habitual es: Usuario -> React -> HTTP `/api` -> `JwtAuthenticationFilter` -> controlador -> servicio transaccional -> repositorio JPA -> SQL Server -> DTO/HTTP. El frontend conserva el token y `api.js` centraliza llamadas. La excepción de autenticación es login/activación de cuenta; `/actuator/health` también está permitido.

## 7. Modelo de datos

El modelo V60 conciliado tiene 45 tablas de negocio y `flyway_schema_history`. El agregado `vuelos` vincula catálogos, aeronave, comandante, estado y tipo; `vuelos_sanitarios` especializa sólo el caso sanitario y evita mezclar información clínica en vuelos operativos. Personas y usuarios también se separan: una persona es identidad civil y un usuario es la cuenta autenticable. Ver `MODELO_DATOS_ACTUALIZADO.md` y `DICCIONARIO_DATOS.md`.

La integridad se distribuye entre PK/FK/UNIQUE/CHECK/triggers SQL, validación Bean Validation, autorizaciones y transacciones Spring. Ejemplos comprobados: índices únicos para identidad/contactos, trigger de auditoría inmutable, tabla de asociación `usuarios_roles`, bloqueo/versión para operaciones concurrentes y triggers V60 para impedir edición de decisiones y consultas de habilitación.

La normalización es comprobable en entidades centrales: 1FN por atributos atómicos; 2FN en la asociación `usuarios_roles`; 3FN al separar personas, usuarios, pacientes, catálogos y tablas históricas. Los snapshots/contextos de rutas y auditoría son desnormalizaciones deliberadas para trazabilidad; no deben interpretarse como fuente maestra de catálogos.

## 8. Operaciones de extremo a extremo

### 8.1 Registrar solicitud sanitaria

El DTS usa la pantalla de solicitudes y el frontend llama los endpoints de `FlightController`. El backend delega en `SanitaryRequestRegistrationService`/`FlightService`, valida la solicitud, identidad/paciente, prioridad, urgencia y autorización. Persiste principalmente `vuelos`, `vuelos_sanitarios`, `informacion_medica_vuelo`, referencias de catálogo y auditoría/notificaciones según el caso. La respuesta HTTP se refleja en la lista y detalle. Para ausencia de permisos se aplica 403; relaciones inexistentes o datos de catálogo inválidos producen errores de negocio. Las consultas de demostración están en `CONSULTAS_DEMOSTRACION.sql`.

### 8.2 Negociar o planificar recursos

Operaciones consulta el vuelo, disponibilidad de aeronaves/comandantes y registra cambios mediante `FlightController`, `FlightService`, `AircraftAdminService` y `CrewManagementService`. Se bloquea el vuelo mediante repositorios de lock en los cambios críticos y se verifican estado, disponibilidad, habilitación y conflictos. Intervienen `vuelos`, `aeronaves`, `vuelos_tripulantes`, `perfiles_comandante`, `negociaciones_horario_vuelo`, `notificaciones` y `eventos_auditoria`.

### 8.3 Planificar y aprobar ruta

El Comandante guarda/actualiza una versión a través de `FlightRouteController` y `FlightRouteService.save`; luego la presenta (`submit`). Operaciones la aprueba o devuelve (`approve`/`sendBack`). La ruta se guarda en `rutas_vuelo`, con versión vigente y un contexto de vuelo. Cambiar aeropuertos, horarios, aeronave o comandante puede invalidar una ruta presentada/aprobada dentro de la misma transacción (`reassess`). No hay autorrevisión: el planificador/presentador no puede aprobar. El inicio exige ruta aprobada y vigente.

### 8.4 Cierre e informe final

El comandante completa el informe por el flujo de `FinalReportWorkflowService`; se generan/controlan `obligaciones_informe_final`, `informes_finales_vuelo` y adjuntos. El flujo verifica acceso al vuelo, estado y plazos; el cierre y los cambios de estado se respaldan en tablas de vuelo/auditoría/notificación. Las restricciones exactas y los estados se encuentran en V7 y V42-V43.

### 8.5 Administración de habilitaciones profesionales

Un Administrador opera `ProfessionalCredentialController`: crea/renueva habilitaciones, adjunta evidencia, emite decisiones y registra consulta externa. Intervienen `habilitaciones_profesionales`, `documentos_habilitacion`, `decisiones_habilitacion`, `consultas_externas_habilitacion`, `politicas_habilitacion` y `eventos_auditoria`. V60 protege decisiones/consultas contra UPDATE/DELETE mediante triggers. Una consulta externa es una declaración administrativa manual, no una respuesta de ANAC/REFEPS-SISA.

## 9. Reglas de negocio y validaciones

| Regla | Capa comprobada | Incumplimiento |
|---|---|---|
| Acceso por rol | `SecurityConfig`, JWT y `@PreAuthorize` | 401 sin token, 403 sin rol |
| Cuenta activa y versión de credencial | `JwtAuthenticationFilter` | token invalidado/rechazado |
| Transiciones de ruta | `FlightRouteService` | 409 de transición/versión/contexto |
| Sin autorrevisión de ruta | `FlightRouteService` | 403 `AUTOREVISION_RUTA_NO_PERMITIDA` |
| Ruta aprobada para iniciar | `requireApprovedForStart` | 409 con código de ruta |
| Unicidad e identidad | índices SQL y servicios | conflicto/validación |
| Historial de habilitación inmutable | V60 triggers | error SQL, sin modificación |
| PDF y lock documental | `DocumentService`, configuración multipart | 415/406 o conflicto |

Además de estas reglas, las transiciones de vuelos, solicitudes e informes se implementan en servicios de dominio y migraciones específicas. Ante errores de validación el controlador devuelve el código HTTP construido por el manejador de excepciones; los estados no deben deducirse únicamente de la interfaz.

## 10. Decisiones de diseño

Se eligió API REST separada de React para desacoplar interfaz y reglas. SQL Server/Flyway hace reproducible el esquema, y JPA expresa entidades/repositorios sin delegar DDL. JWT mantiene sesiones stateless. La baja lógica conserva trazabilidad en usuarios, contactos y documentos. El versionado documental y de rutas conserva historial. La separación de cuenta de aplicación y cuenta de migración es una mejora de mínimo privilegio documentada en Compose y scripts. La desventaja es mayor complejidad operativa: se deben custodiar dos credenciales y compatibilizar la versión del backend con la de Flyway.

## 11. Pruebas realizadas

La evidencia histórica versionada informa para el corte I58: 588 pruebas Maven sin fallos, 255 Vitest sin fallos y 54/54 scripts E2E aprobados, en una base aislada V60. No se volvió a ejecutar esa suite durante esta documentación. Se revisaron las fuentes de pruebas, la evidencia `docs/evidencia-i58/suite-e2e-20261029T073329-resumen.json` y el informe de certificación. `NO VERIFICADO`: entrega SMTP real, análisis ClamAV completo de producción y comportamiento a escala real.

## 12. Dificultades y limitaciones

La evidencia registra consumo de RAM/OOM al solapar Docker, una carrera de refresco React corregida, respuestas lentas con bases E2E acumuladas, la incompatibilidad intencional entre código V60 y base V47, y configuración pendiente de SMTP/ClamAV. Persisten riesgos: ausencia de paginación en listados de vuelos a gran escala, una intermitencia aislada de UI no reproducida, políticas profesionales sin aprobación y falta de respaldo externo/documentación regulatoria.

## 13. Conclusiones

El sistema implementa un núcleo relacional y transaccional amplio para vuelos sanitarios, con separación de responsabilidades y evidencia de pruebas aisladas. Su fortaleza es la trazabilidad entre solicitud, recurso, ruta, documentación, auditoría y cierre. Su límite no es solamente técnico: para operar en producción aún requiere decisiones regulatorias, políticas de habilitación aprobadas, antimalware acreditado, SMTP y un entorno dimensionado. La defensa debe distinguir con claridad código V60 probado en E2E de la instancia habitual V47.

## 14. Anexos técnicos

Los anexos entregados son: modelo/diccionario, diagramas Mermaid, operaciones, guía de demostración y defensa, matriz de cumplimiento, evidencias/limitaciones y consultas de sólo lectura. La consigna PDF no estaba disponible en el espacio de trabajo; la matriz se elaboró contra los requisitos explícitos del pedido recibido. Esto es una limitación de trazabilidad académica, no una afirmación de cumplimiento literal del PDF.
