from __future__ import annotations

import re, subprocess, sys, textwrap
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "taller-iii-entrega"

TABLES = [
"activaciones_cuenta","aeronaves","aeropuertos","bitacora_vuelos","bloqueos_documento_vuelo","clasificaciones_tripulacion","consultas_externas_habilitacion","contactos_coordinacion_traslado","coordinaciones_aa2000","correos_electronicos","decisiones_habilitacion","documentos_habilitacion","documentos_vuelo","estados_solicitud_sanitaria","estados_vuelo","eventos_auditoria","habilitaciones_profesionales","informacion_hangar","informacion_medica_vuelo","informes_finales_vuelo","instantaneas_clima","localidades","motivos_cancelacion","negociaciones_horario_vuelo","notificaciones","obligaciones_informe_final","pacientes","perfiles_comandante","personas","politicas_habilitacion","prioridades_vuelo","provincias","roles","roles_tripulacion","rutas_vuelo","telefonos","tipos_documento","tipos_vuelo","usuarios","usuarios_roles","verificaciones_correo","versiones_documento_vuelo","vuelos","vuelos_sanitarios","vuelos_tripulantes"]

PURPOSE = {
"activaciones_cuenta":"códigos y ciclo de activación de cuentas", "aeronaves":"recurso aéreo, disponibilidad y ubicación", "aeropuertos":"catálogo de aeropuertos y referencia geográfica", "bitacora_vuelos":"asientos operativos del vuelo", "bloqueos_documento_vuelo":"lease temporal para edición documental", "clasificaciones_tripulacion":"historial de clasificación de personas de tripulación", "consultas_externas_habilitacion":"constancia manual e inmutable de consulta externa", "contactos_coordinacion_traslado":"contactos propios de una solicitud sanitaria", "coordinaciones_aa2000":"coordinaciones aeroportuarias por vuelo", "correos_electronicos":"contactos de correo de identidad", "decisiones_habilitacion":"historial inmutable de decisiones de habilitación", "documentos_habilitacion":"archivos de evidencia profesional y su análisis", "documentos_vuelo":"documento lógico asociado al vuelo", "estados_solicitud_sanitaria":"catálogo de estados de solicitud", "estados_vuelo":"catálogo de estados operativos", "eventos_auditoria":"auditoría de eventos de aplicación", "habilitaciones_profesionales":"habilitaciones de tripulantes", "informacion_hangar":"información operativa del hangar", "informacion_medica_vuelo":"datos sanitarios específicos de un traslado", "informes_finales_vuelo":"informe de cierre", "instantaneas_clima":"observaciones climáticas registradas", "localidades":"catálogo geográfico", "motivos_cancelacion":"catálogo de motivos", "negociaciones_horario_vuelo":"propuestas y decisión de negociación horaria", "notificaciones":"bandeja persistente por usuario", "obligaciones_informe_final":"obligación y plazos de informe", "pacientes":"subtipo paciente de una persona", "perfiles_comandante":"perfil operativo de comandante", "personas":"identidad civil compartida", "politicas_habilitacion":"reglas configurables de suficiencia", "prioridades_vuelo":"catálogo de prioridad", "provincias":"catálogo geográfico", "roles":"roles de autorización", "roles_tripulacion":"roles funcionales de tripulación", "rutas_vuelo":"versiones y revisión de ruta", "telefonos":"contactos telefónicos de identidad", "tipos_documento":"catálogo documental", "tipos_vuelo":"catálogo de tipos", "usuarios":"cuenta autenticable", "usuarios_roles":"asociación usuario-rol", "verificaciones_correo":"códigos de verificación de correo", "versiones_documento_vuelo":"versiones PDF de documento", "vuelos":"agregado principal del vuelo", "vuelos_sanitarios":"especialización sanitaria de un vuelo", "vuelos_tripulantes":"asignaciones e historial de tripulación"}

def write(name: str, body: str):
    (OUT / name).write_text(body.strip()+"\n", encoding="utf-8")

def sql_schema():
    # Sólo metadatos: no consulta filas de negocio ni ejecuta DDL/DML.
    q = r"""SET NOCOUNT ON;
SELECT t.name, c.column_id, c.name,
 TYPE_NAME(c.user_type_id) + CASE WHEN TYPE_NAME(c.user_type_id) IN ('varchar','nvarchar','char','nchar','varbinary') THEN '(' + CASE WHEN c.max_length=-1 THEN 'MAX' WHEN TYPE_NAME(c.user_type_id) IN ('nvarchar','nchar') THEN CONVERT(varchar(10),c.max_length/2) ELSE CONVERT(varchar(10),c.max_length) END + ')' WHEN TYPE_NAME(c.user_type_id) IN ('decimal','numeric') THEN '('+CONVERT(varchar(4),c.precision)+','+CONVERT(varchar(4),c.scale)+')' WHEN TYPE_NAME(c.user_type_id) IN ('datetime2','datetimeoffset','time') THEN '('+CONVERT(varchar(4),c.scale)+')' ELSE '' END,
 c.is_nullable, ISNULL(dc.definition,''),
 CASE WHEN pk.column_id IS NULL THEN '' ELSE 'PK' END,
 ISNULL(fk.ref,''), ISNULL(uq.name,'')
FROM sys.tables t JOIN sys.columns c ON c.object_id=t.object_id
LEFT JOIN sys.default_constraints dc ON dc.parent_object_id=t.object_id AND dc.parent_column_id=c.column_id
LEFT JOIN (SELECT ic.object_id,ic.column_id FROM sys.indexes i JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id WHERE i.is_primary_key=1) pk ON pk.object_id=t.object_id AND pk.column_id=c.column_id
LEFT JOIN (SELECT fkc.parent_object_id,fkc.parent_column_id, STRING_AGG(OBJECT_SCHEMA_NAME(fkc.referenced_object_id)+'.'+OBJECT_NAME(fkc.referenced_object_id)+'.'+COL_NAME(fkc.referenced_object_id,fkc.referenced_column_id),',') ref FROM sys.foreign_key_columns fkc GROUP BY fkc.parent_object_id,fkc.parent_column_id) fk ON fk.parent_object_id=t.object_id AND fk.parent_column_id=c.column_id
LEFT JOIN (SELECT i.name,ic.object_id,ic.column_id FROM sys.indexes i JOIN sys.index_columns ic ON i.object_id=ic.object_id AND i.index_id=ic.index_id WHERE i.is_unique=1 AND i.is_primary_key=0) uq ON uq.object_id=t.object_id AND uq.column_id=c.column_id
WHERE SCHEMA_NAME(t.schema_id)='dbo' ORDER BY t.name,c.column_id;"""
    cmd=["docker","exec","vuelos-sanitarios-sqlserver-1","bash","-lc", "SQLCMDPASSWORD=\"$MSSQL_SA_PASSWORD\" /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -C -d vuelos_sanitarios -W -s '|' -h -1 -Q \""+q.replace('"','\\"').replace('\n',' ')+"\""]
    try:
        r=subprocess.run(cmd,capture_output=True,text=True,timeout=40,check=True)
        rows=[]
        for line in r.stdout.splitlines():
            p=[x.strip() for x in line.split('|')]
            if len(p)==9 and p[0] and p[1].isdigit(): rows.append(p)
        return rows
    except Exception as e:
        return []

def dictionary(rows):
    grouped={}
    for row in rows: grouped.setdefault(row[0],[]).append(row)
    lines=["# Diccionario de datos", "", "## Método y alcance", "", "El diccionario combina dos cortes explícitamente diferenciados: (a) metadatos de sólo lectura de la instancia habitual `vuelos_sanitarios`, que estaba en Flyway V47 al relevamiento; y (b) el esquema objetivo del código V60, conciliado contra la evidencia de la base E2E aislada (`docs/evidencia-i57/inventario-tablas-e2e-v60.json`). Por ello no se presenta V60 como estado aplicado a la instancia habitual.", "", "La instancia habitual contiene 42 tablas físicas: 40 de negocio, `flyway_schema_history` y `sysdiagrams` (esta última es auxiliar de SSMS). El esquema V60 comprobado en E2E posee 46: 45 de negocio y `flyway_schema_history`. Los tipos y restricciones de V47 se extrajeron de `sys.columns`, `sys.foreign_keys`, índices y defaults; las cinco adiciones V48-V60 se fundamentan en sus migraciones. `NO VERIFICADO`: no se reinterrogó una base V60 durante esta elaboración.", "", "Leyenda: NN = no admite NULL; PK = clave primaria; FK = clave foránea; UQ = índice/clave única. Un nombre de índice único puede ser filtrado; consultar las migraciones para el predicado exacto.", ""]
    for table in sorted(grouped):
        cols=grouped[table]
        lines += [f"## `{table}`", "", f"**Finalidad:** {PURPOSE.get(table,'infraestructura o tabla auxiliar')}. **Corte:** instancia habitual V47, metadatos verificados.", "", "| Columna | Tipo SQL Server | NULL | Clave/relación | Default | UQ |", "|---|---|---|---|---|---|"]
        for _,_,col,typ,nullable,default,key,fk,uq in cols:
            relation="; ".join(x for x in [key,f"FK -> {fk}" if fk else ""] if x) or "-"
            lines.append(f"| `{col}` | `{typ}` | {'Sí' if nullable=='1' else 'No'} | {relation} | `{default or '-'}` | `{uq or '-'}` |")
        lines.append("")
    lines += ["## Diferencia V47 a V60", "", "El código agrega/modifica el modelo tras V47: V48 concurrencia de identidad; V49-V50 contactos; V51 `contactos_coordinacion_traslado`; V52-V53 documentos de vuelo; V54 `verificaciones_correo` y validación internacional; V55 rutas; V56-V58 índices, licencia y clasificación; V59 `politicas_habilitacion`, `decisiones_habilitacion`, `consultas_externas_habilitacion` y ciclo documental; V60 endurece restricciones e inmutabilidad. Las definiciones exactas están en `backend-java/src/main/resources/db/migration/V48__...sql` a `V60__...sql`.", "", "## Inventario V60 conciliado", "", "| Clase | Cantidad | Fuente |", "|---|---:|---|", "| Negocio | 45 | `docs/evidencia-i57/inventario-tablas-e2e-v60.json` |", "| Infraestructura | 1 | `flyway_schema_history` |", "| Total físico | 46 | inventario E2E V60 |", "", "Las 45 tablas de negocio son: "+", ".join(f"`{x}`" for x in TABLES)+"."]
    return "\n".join(lines)

def main_report():
    return r'''# Informe Técnico Integral Taller III

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
'''

def data_model():
    rows=[]
    for i,t in enumerate(TABLES,1): rows.append(f"| {i} | `{t}` | {PURPOSE[t]} |")
    return "# Modelo de datos actualizado\n\n## Corte de verdad\n\nEl modelo del código termina en Flyway V60. Una evidencia de SQL Server E2E aislado del 28/10/2026 concilia 46 tablas físicas (45 negocio + historial Flyway). La instancia habitual activa queda en V47; no se migró para este trabajo. Por tanto, el diagrama describe el objetivo V60 y no afirma que cada tabla esté aplicada en la base habitual.\n\n## Mapa por dominios\n\n```mermaid\nerDiagram\n  PERSONAS ||--o| USUARIOS : identidad\n  PERSONAS ||--o| PACIENTES : identidad\n  USUARIOS ||--o{ USUARIOS_ROLES : recibe\n  ROLES ||--o{ USUARIOS_ROLES : asigna\n  PACIENTES ||--o{ VUELOS_SANITARIOS : solicita\n  VUELOS ||--o| VUELOS_SANITARIOS : especializa\n  VUELOS ||--o{ VUELOS_TRIPULANTES : integra\n  USUARIOS ||--o{ VUELOS_TRIPULANTES : participa\n  VUELOS ||--o{ RUTAS_VUELO : versiona\n  VUELOS ||--o{ DOCUMENTOS_VUELO : documenta\n  DOCUMENTOS_VUELO ||--o{ VERSIONES_DOCUMENTO_VUELO : contiene\n  VUELOS ||--o| INFORMES_FINALES_VUELO : cierra\n  USUARIOS ||--o{ HABILITACIONES_PROFESIONALES : posee\n  HABILITACIONES_PROFESIONALES ||--o{ DECISIONES_HABILITACION : historiza\n```\n\n## Inventario\n\n| # | Tabla | Finalidad |\n|---:|---|---|\n"+"\n".join(rows)+"\n\n## Relaciones y cardinalidades\n\n* Uno a uno opcional: `personas` a `usuarios` y `personas` a `pacientes`, por identificadores únicos de subtipo.\n* Uno a muchos: `vuelos` a `rutas_vuelo`, documentos, bitácora, notificaciones y tripulación.\n* Muchos a muchos: usuarios y roles mediante `usuarios_roles`; el registro de asignación conserva su propio contexto.\n* Especialización: `vuelos_sanitarios` extiende `vuelos`; impide que información médica y de solicitud se guarde en todo vuelo.\n\n## Normalización e integridad\n\nLa evaluación se limita a dependencias observables. Catálogos y entidades se separan de hechos para evitar repetir nombres/estados. El modelo conserva snapshots de auditoría y de contexto de ruta para permitir reconstrucción histórica: es una desnormalización intencional. PK/FK/UNIQUE/CHECK y triggers sostienen reglas en SQL; servicios transaccionales sostienen transiciones, autorización y disponibilidad.\n\n## Fuente de diagramas\n\nLos fuentes Mermaid están en `diagramas/arquitectura.mmd` y `diagramas/modelo-dominios.mmd`.\n"

def operations():
    return "# Operaciones de extremo a extremo\n\n## Convención\n\nLas rutas y clases citadas son comprobadas en el código. Las tablas se citan con su nombre físico español. Las respuestas concretas pueden variar según la regla; no se exponen datos reales.\n\n## 1 Solicitud sanitaria\n\n**Interacción y frontend.** DTS trabaja en el módulo de solicitudes de `frontend-react/src/main.jsx`; sus pruebas están en `requests.test.jsx` y `dts.test.jsx`.\n\n**Backend.** `FlightController` recibe rutas bajo `/api/flights`; la lógica se concentra en `SanitaryRequestRegistrationService` y `FlightService`. DTOs están en `api/dto`.\n\n**Persistencia.** Inserta/consulta el agregado `vuelos` y, para el tipo sanitario, `vuelos_sanitarios`, `informacion_medica_vuelo`, paciente, catálogos y potencialmente contactos de coordinación. Auditoría y notificaciones son efectos de dominio cuando se configuran.\n\n**Integridad.** Validación de DTO, rol DTS, catálogos activos, relación paciente/solicitud y reglas de urgencia. Faltantes dan 400/404/409 según la condición; falta de rol 403.\n\n## 2 Asignación y planificación\n\nOperaciones usa endpoints de `FlightController` y `CatalogController`; intervienen `FlightService`, `AircraftAdminService` y `CrewManagementService`. Tablas: `vuelos`, `aeronaves`, `vuelos_tripulantes`, `perfiles_comandante`, `clasificaciones_tripulacion`, `habilitaciones_profesionales`, `notificaciones` y `eventos_auditoria`. Los servicios usan locks/repositorios y transacciones para evitar doble asignación y revisan la disponibilidad/estado.\n\n## 3 Ruta\n\n`FlightRouteController` expone GET/PUT y POST `submit`, `approve`, `return`; `FlightRouteService` es el único flujo de versión/revisión. Comandante crea/presenta; Operaciones revisa. `rutas_vuelo` almacena versión, contexto y decisión. Una modificación material del vuelo llama `reassess`, invalidando la ruta. Inicio exige ruta aprobada por `requireApprovedForStart`.\n\n```mermaid\nsequenceDiagram\n participant C as Comandante\n participant API as FlightRouteController\n participant S as FlightRouteService\n participant DB as SQL Server\n participant O as Operaciones\n C->>API: PUT /flights/id/route\n API->>S: save\n S->>DB: inserta nueva version rutas_vuelo\n C->>API: POST submit\n S->>DB: PENDIENTE_REVISION y auditoria\n O->>API: POST approve\n S->>DB: APRUEBA version y notifica\n```\n\n## 4 Cierre e informe\n\n`FinalReportWorkflowService`, `CommanderReportAccessService` y `ReportAttachmentService` controlan el cierre. Tablas: `obligaciones_informe_final`, `informes_finales_vuelo`, `vuelos`, documentos/adjuntos, auditoría y notificaciones. El sistema verifica acceso del comandante, condición de estado y plazos. Las migraciones V7 y V42-V43 son la fuente de restricciones físicas e historial.\n\n## 5 Habilitación profesional\n\n`ProfessionalCredentialController` sólo admite `ADMINISTRADOR`. `ProfessionalCredentialService`, `CredentialDocumentService`, `CredentialPolicyService` y `CredentialPolicyActivationService` modifican `habilitaciones_profesionales`, `documentos_habilitacion`, `decisiones_habilitacion`, `consultas_externas_habilitacion` y `politicas_habilitacion`. V60 rechaza modificaciones/bajas físicas sobre decisiones y consultas. Sin política activa aprobada, la elegibilidad no se presume.\n\n## Consultas de comprobación\n\nUsar exclusivamente `CONSULTAS_DEMOSTRACION.sql`. Ejecutarlas con cuenta de sólo lectura o la cuenta de aplicación, sin datos clínicos en pantalla.\n"

def defense():
    questions=[
    ("Básica","¿Qué diferencia hay entre persona y usuario?","Persona conserva identidad civil; usuario representa la cuenta autenticable. La separación evita exigir credenciales a todo paciente."),
    ("Básica","¿Qué es una PK?","Identifica de forma única una fila; las FKs referencian esa identidad."),
    ("Básica","¿Qué protege una FK?","Evita referencias a filas inexistentes, salvo las reglas explícitas de nulabilidad y borrado."),
    ("Básica","¿Cómo se autentica?","Login emite JWT; `JwtAuthenticationFilter` lo valida y carga roles en Spring Security."),
    ("Básica","¿Qué base usa?","Microsoft SQL Server; Flyway versiona el DDL y JPA valida el mapeo."),
    ("Intermedia","¿Por qué vuelos sanitarios está separado?","Sólo el traslado sanitario necesita paciente, solicitud e información médica; separarlo evita nulos y mezcla semántica."),
    ("Intermedia","¿Quién aprueba una ruta?","Operaciones/Centro de Operaciones; el comandante crea/presenta y no puede autorrevisarse."),
    ("Intermedia","¿Qué invalida una ruta?","Cambios materiales de aeropuertos, horarios, aeronave o comandante; `reassess` conserva evidencia e indica nueva revisión."),
    ("Intermedia","¿Cómo se evita una doble asignación?","Servicios/repositorios bloquean datos críticos y validan disponibilidad dentro de transacciones; consultar pruebas de concurrencia."),
    ("Intermedia","¿Qué ocurre al cerrar?","El flujo controla obligaciones/informe, estado y autorización; persiste informe/adjuntos y auditoría."),
    ("Intermedia","¿Qué es baja lógica?","Conservar la fila y marcarla inactiva/retirada, útil para no romper trazabilidad."),
    ("Intermedia","¿Qué se prueba en frontend?","Vitest y Testing Library; evidencia histórica I58 informa 255 pruebas aprobadas."),
    ("Intermedia","¿Qué se prueba E2E?","Flujos API/UI contra SQL Server aislado, incluyendo seguridad, migración y concurrencia."),
    ("Avanzada","¿Qué asegura SQL y qué asegura Java?","SQL asegura estructura e integridad declarable; Java asegura transiciones, autorización contextual y políticas complejas."),
    ("Avanzada","¿Cómo modificar un estado nuevo?","Evaluar catálogo, constantes/transiciones de servicio, CHECK/seed/migración, DTO/UI, pruebas y compatibilidad histórica."),
    ("Avanzada","¿Qué ocurre si falla una transacción?","Spring revierte cambios participantes; no se debe afirmar compensación externa sin revisar el servicio concreto."),
    ("Avanzada","¿Las consultas externas validan automáticamente organismos?","No. Son constancias manuales, explícitamente no una integración oficial."),
    ("Avanzada","¿Por qué hay dos cuentas SQL?","Mínimo privilegio: aplicación con datos y migrador con DDL; reduce la capacidad de alterar esquema accidentalmente."),
    ("Avanzada","¿Qué versión se defiende?","Código V60 y evidencia E2E V60; la base habitual relevada estaba en V47. No deben confundirse."),
    ("Avanzada","¿Cuál es el riesgo de escala?","Listados sin paginación y disponibilidad de comandantes evidenciaron tiempos altos con bases E2E acumuladas."),]
    # expand to 40 by project-specific variants
    extras=[
    ("Básica","¿Qué hace Flyway?","Ordena y registra migraciones; `flyway_schema_history` permite conocer el corte aplicado."),
    ("Básica","¿Qué rol tiene Nginx?","Sirve el frontend y forma parte del despliegue contenedorizado."),
    ("Básica","¿Qué es un DTO?","Contrato de entrada/salida de API, separado de la entidad persistente."),
    ("Básica","¿Qué contiene una tabla intermedia?","Las dos FKs y, si hace falta, atributos propios; ejemplo `usuarios_roles`."),
    ("Básica","¿Por qué hay auditoría?","Permite saber quién realizó cambios y reconstruir eventos."),
    ("Básica","¿Qué es `ddl-auto: validate`?","Hibernate verifica mapeos pero no genera ni altera tablas."),
    ("Intermedia","¿Cómo se protege un PDF?","Se restringe tipo/tamaño, se versiona, usa lock y los documentos profesionales incorporan análisis antimalware."),
    ("Intermedia","¿Qué son las notificaciones?","Mensajes persistentes por usuario para cambios operativos relevantes."),
    ("Intermedia","¿Qué diferencia hay entre rol de acceso y de tripulación?","`roles` autoriza API; `roles_tripulacion` describe función operativa."),
    ("Intermedia","¿Qué controla una UNIQUE?","Evita duplicados en la combinación/columna protegida; los índices filtrados aplican sólo en condiciones específicas."),
    ("Intermedia","¿Qué muestra la bitácora?","Asientos operativos del vuelo, distinta de la auditoría técnica general."),
    ("Intermedia","¿Qué ocurre con correo no verificado?","El modelo conserva verificación y vencimientos; entrega real requiere SMTP configurado."),
    ("Intermedia","¿Para qué sirve la versión de ruta?","Evita aprobar contenido distinto del revisado y conserva historial."),
    ("Intermedia","¿Cuándo un documento no se elimina?","El diseño prefiere baja lógica/historial; verificar la política concreta de cada módulo."),
    ("Avanzada","¿Cómo se agregaría una funcionalidad?","Definir dominio, migración Flyway, entidad/repositorio, servicio transaccional, API, UI y pruebas."),
    ("Avanzada","¿Qué protege un trigger inmutable?","Rechaza UPDATE/DELETE incluso si otro cliente elude el servicio Java."),
    ("Avanzada","¿Por qué los snapshots no violan necesariamente 3FN?","Son evidencia histórica deliberada, no atributos maestros actualizables."),
    ("Avanzada","¿Cuál es el estado de ClamAV?","Integración disponible y probada mínimamente; análisis completo productivo pendiente de recursos."),
    ("Avanzada","¿Qué hacer si falla la demo?","No tocar la base habitual: reiniciar con datos aislados conocidos, verificar health y ejecutar sólo consultas de lectura."),
    ("Avanzada","¿Qué no se debe afirmar?","Que la instancia habitual está en V60, que hay validación oficial externa, o que producción está autorizada."),]
    questions+=extras
    qtext="\n".join(f"### {d} - {q}\n\n**Respuesta:** {a}\n" for d,q,a in questions)
    return "# Guía de demostración y defensa\n\n## Guion seguro\n\n1. Mostrar `/actuator/health` y la versión Flyway con consulta de solo lectura.\n2. Ingresar como DTS: buscar/registrar un paciente ficticio y una solicitud ficticia en entorno aislado.\n3. Ingresar como Operaciones: mostrar disponibilidad/asignación y la diferencia de permisos.\n4. Ingresar como Comandante: crear y presentar una ruta.\n5. Volver a Operaciones: aprobar o devolver esa versión y mostrar el historial.\n6. Mostrar informe final/documentos, auditoría y las filas relacionadas mediante consultas de sólo lectura.\n7. Ingresar como Administrador: catálogo, auditoría y habilitaciones (sin afirmar aprobación normativa).\n\n**Datos necesarios:** cuatro cuentas de ensayo (DTS, Operaciones, Comandante, Administrador), un paciente/anónimo, dos aeropuertos, aeronave activa y un vuelo de ensayo. No usar datos clínicos reales ni la base habitual.\n\n**Recuperación:** detener la demo ante error; no ejecutar migraciones. Restablecer el entorno E2E conocido, comprobar health, y volver a cargar datos de ensayo.\n\n## Preguntas y respuestas\n\n"+qtext

def evidence():
    return "# Evidencias y limitaciones\n\n## Estado relevado\n\n| Dato | Resultado | Evidencia |\n|---|---|---|\n| Rama | `feature/completitud-funcional-post-v55` | `git branch --show-current` |\n| Commit actual | `7a767071cff5728e2202b74223dfaa7728de90d6` | `git rev-parse HEAD` |\n| Remoto | `origin` GitHub | `git remote -v` |\n| Última migración en código | V60 | `db/migration/V60__endurecimiento_politicas_y_documentos_heredados.sql` |\n| Instancia habitual activa | Flyway V47; 42 físicas (40 negocio + Flyway + sysdiagrams) | `docs/evidencia-i57/inventario-tablas-habitual-v47-solo-lectura.json` |\n| E2E aislada histórica | Flyway V60; 46 físicas (45 negocio + Flyway) | `docs/evidencia-i57/inventario-tablas-e2e-v60.json` |\n| Backend/frontend actual | contenedores healthy al relevamiento | `docker ps` |\n\n## Discrepancias\n\n1. **DISCREPANCIA DETECTADA:** código termina en V60 pero la base habitual sigue en V47.\n2. **NO VERIFICADO:** la consigna PDF `Trabajo Integrador Final Taller III - Evaluación.pdf` no estaba disponible; se usó el texto de requerimientos adjunto.\n3. **NO VERIFICADO:** no se inspeccionó una base V60 viva durante esta documentación; se utilizó evidencia versionada de E2E.\n4. **NO IMPLEMENTADO:** integración automática con registros externos; la consulta es manual.\n5. **PENDIENTE:** políticas profesionales reales, SMTP productivo, ClamAV completo y retención aprobada.\n\n## Pruebas\n\nEvidencia histórica I58: Maven 588, Vitest 255 y E2E 54/54. Estas cifras no se reejecutaron ahora. Archivos: `docs/INFORME_CERTIFICACION_FINAL_I58_2026-10-28.md` y `docs/evidencia-i58/suite-e2e-20261029T073329-resumen.json`.\n\n## Conservación\n\nNo se ejecutaron migraciones, DDL/DML, borrados, cambios de permisos ni cambios funcionales. Las únicas escrituras de esta tarea son los archivos de documentación bajo `docs/taller-iii-entrega/`.\n"

def compliance():
    rows=[
    ("Problema y objetivos","Informe 2-3","CUMPLIDO","Basado en alcance comprobado"),("Alcance y roles","Informe 4","CUMPLIDO","Matriz resumida"),("Tecnologías","Informe 5","CUMPLIDO","Configuraciones inspeccionadas"),("Arquitectura y diagramas","Informe 6 + diagramas","CUMPLIDO","Mermaid entregado"),("Modelo y diccionario","Modelo + Diccionario","PARCIAL","V60 desde evidencia; instancia viva V47"),("Tres operaciones E2E","Operaciones","CUMPLIDO","Cinco flujos"),("Reglas y validaciones","Informe 9","CUMPLIDO","Capas distinguidas"),("Decisiones","Informe 10","CUMPLIDO","Ventajas/limitaciones"),("Pruebas","Informe 11 + Evidencias","PARCIAL","Evidencia histórica, no reejecutada"),("Dificultades","Informe 12","CUMPLIDO","Fuentes históricas"),("Demostración","Guía","CUMPLIDO","Entorno aislado"),("Defensa oral","Guía","CUMPLIDO","40 preguntas"),("Correspondencia literal PDF","Todas","PENDIENTE","PDF no disponible")]
    return "# Matriz de cumplimiento de consigna\n\n| Requisito | Sección | Estado | Observación |\n|---|---|---|---|\n"+"\n".join(f"| {a} | {b} | **{c}** | {d} |" for a,b,c,d in rows)+"\n\nLa matriz usa los 14 apartados y exigencias explícitas del texto adjunto. Requiere revisión humana contra el PDF académico original cuando se proporcione.\n"

def sql_demo():
    return """/* Consultas de demostración - sólo lectura. No exponer datos clínicos reales. */
/* 1. Versión Flyway */
SELECT TOP (20) version, description, installed_on, success
FROM dbo.flyway_schema_history ORDER BY installed_rank DESC;

/* 2. Vuelo y referencias principales */
SELECT TOP (20) v.id_vuelos, v.codigo, ev.codigo AS estado, tv.codigo AS tipo,
       a.matricula, u.nombre_usuario AS comandante
FROM dbo.vuelos v
LEFT JOIN dbo.estados_vuelo ev ON ev.id_estados_vuelo=v.id_estados_vuelo
LEFT JOIN dbo.tipos_vuelo tv ON tv.id_tipos_vuelo=v.id_tipos_vuelo
LEFT JOIN dbo.aeronaves a ON a.id_aeronaves=v.id_aeronaves
LEFT JOIN dbo.usuarios u ON u.id_usuarios=v.id_comandante
ORDER BY v.id_vuelos DESC;

/* 3. Historial de rutas para reemplazar el parámetro ficticio */
SELECT r.id_vuelos, r.version, r.estado_revision, r.es_version_actual,
       r.fecha_presentacion, r.fecha_revision
FROM dbo.rutas_vuelo r
WHERE r.id_vuelos = :ID_VUELO
ORDER BY r.version DESC;

/* 4. Tripulación y roles */
SELECT vt.id_vuelos, u.nombre_usuario, rt.codigo AS rol_tripulacion, vt.activo
FROM dbo.vuelos_tripulantes vt
JOIN dbo.usuarios u ON u.id_usuarios=vt.id_usuarios
JOIN dbo.roles_tripulacion rt ON rt.id_roles_tripulacion=vt.id_roles_tripulacion
WHERE vt.id_vuelos = :ID_VUELO;

/* 5. Auditoría del vuelo: limitar columnas sensibles y filas */
SELECT TOP (50) fecha_evento, tipo_entidad, accion, id_usuarios
FROM dbo.eventos_auditoria
WHERE id_vuelos = :ID_VUELO
ORDER BY fecha_evento DESC;
"""

def create_docx(report):
    from docx import Document
    from docx.shared import Inches, Pt
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    doc=Document(); sec=doc.sections[0]; sec.top_margin=Inches(.8); sec.bottom_margin=Inches(.75); sec.left_margin=Inches(.8); sec.right_margin=Inches(.8)
    styles=doc.styles; styles['Normal'].font.name='Aptos'; styles['Normal'].font.size=Pt(10)
    styles['Title'].font.name='Aptos Display'; styles['Title'].font.size=Pt(24); styles['Title'].font.bold=True
    for name in ('Heading 1','Heading 2','Heading 3'):
        styles[name].font.name='Aptos'; styles[name].font.color.rgb=None
    title=doc.add_paragraph('Informe Técnico Integral Taller III', style='Title'); title.alignment=WD_ALIGN_PARAGRAPH.CENTER
    for x in ['Vuelos Sanitarios','Ingeniería Informática - UNSTA','Año académico 2026','Integrantes y docente: pendiente de completar']:
        p=doc.add_paragraph(x); p.alignment=WD_ALIGN_PARAGRAPH.CENTER
    doc.add_page_break()
    for line in report.splitlines():
        if line.startswith('# '): continue
        if line.startswith('## '): doc.add_heading(line[3:], level=1)
        elif line.startswith('### '): doc.add_heading(line[4:], level=2)
        elif line.startswith('|') or line.startswith('```') or line.startswith('* '):
            if not line.startswith('```'): doc.add_paragraph(line.replace('|','  ').strip())
        elif line.strip(): doc.add_paragraph(line.replace('**','').replace('`',''))
    for section in doc.sections:
        p=section.footer.paragraphs[0]; p.alignment=WD_ALIGN_PARAGRAPH.CENTER; p.add_run('Vuelos Sanitarios - Taller III')
    doc.save(OUT/'INFORME_TECNICO_TALLER_III.docx')

def create_pdf(report):
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
    styles=getSampleStyleSheet()
    styles.add(ParagraphStyle('Cover', parent=styles['Title'], alignment=TA_CENTER, fontName='Helvetica-Bold', fontSize=24, leading=30, textColor=colors.black, spaceAfter=24))
    styles.add(ParagraphStyle('Subcover', parent=styles['Normal'], alignment=TA_CENTER, fontSize=12, leading=18, spaceAfter=8))
    styles['Heading1'].fontName='Helvetica-Bold'; styles['Heading1'].fontSize=15; styles['Heading1'].leading=19; styles['Heading1'].spaceBefore=12; styles['Heading1'].spaceAfter=7
    styles['Heading2'].fontName='Helvetica-Bold'; styles['Heading2'].fontSize=12; styles['Heading2'].leading=15; styles['Heading2'].spaceBefore=10; styles['Heading2'].spaceAfter=5
    styles['BodyText'].fontName='Helvetica'; styles['BodyText'].fontSize=9.5; styles['BodyText'].leading=13; styles['BodyText'].spaceAfter=6
    story=[Paragraph('Informe Técnico Integral Taller III',styles['Cover']),Paragraph('Vuelos Sanitarios',styles['Subcover']),Paragraph('Ingeniería Informática - UNSTA',styles['Subcover']),Paragraph('Año académico 2026',styles['Subcover']),Paragraph('Integrantes y docente: pendiente de completar',styles['Subcover']),PageBreak()]
    skip=True
    for raw in report.splitlines():
        line=raw.strip()
        if not line or line.startswith('```'): continue
        if line.startswith('# '): continue
        if line.startswith('## '): story.append(Paragraph(line[3:],styles['Heading1']))
        elif line.startswith('### '): story.append(Paragraph(line[4:],styles['Heading2']))
        elif line.startswith('|'): continue
        else:
            clean=line.replace('**','').replace('`','').replace('->','→')
            if clean.startswith('* '): clean='• '+clean[2:]
            story.append(Paragraph(clean.replace('&','&amp;'),styles['BodyText']))
    def footer(canvas, doc):
        canvas.saveState(); canvas.setFont('Helvetica',8); canvas.drawCentredString(A4[0]/2,1.1*cm,f'Vuelos Sanitarios - Taller III - Página {doc.page}'); canvas.restoreState()
    SimpleDocTemplate(str(OUT/'INFORME_TECNICO_TALLER_III.pdf'),pagesize=A4,rightMargin=2*cm,leftMargin=2*cm,topMargin=1.8*cm,bottomMargin=1.8*cm,title='Informe Técnico Integral Taller III').build(story,onFirstPage=footer,onLaterPages=footer)

def run():
    OUT.mkdir(parents=True,exist_ok=True); (OUT/'diagramas').mkdir(exist_ok=True)
    report=main_report(); write('INFORME_TECNICO_TALLER_III.md',report); write('MODELO_DATOS_ACTUALIZADO.md',data_model()); write('OPERACIONES_EXTREMO_A_EXTREMO.md',operations()); write('GUIA_DEMOSTRACION_Y_DEFENSA.md',defense()); write('EVIDENCIAS_Y_LIMITACIONES.md',evidence()); write('MATRIZ_CUMPLIMIENTO_CONSIGNA.md',compliance()); write('CONSULTAS_DEMOSTRACION.sql',sql_demo())
    (OUT/'diagramas'/'arquitectura.mmd').write_text('flowchart LR\n U[Usuario]-->F[React Vite]\n F-->B[Spring Boot API]\n B-->S[JWT y servicios]\n S-->R[JPA repositories]\n R-->D[(SQL Server)]\n B-->N[Notificaciones y documentos]\n',encoding='utf-8')
    (OUT/'diagramas'/'modelo-dominios.mmd').write_text('erDiagram\n PERSONAS ||--o| USUARIOS : identidad\n PERSONAS ||--o| PACIENTES : identidad\n USUARIOS ||--o{ USUARIOS_ROLES : roles\n VUELOS ||--o| VUELOS_SANITARIOS : especializa\n VUELOS ||--o{ RUTAS_VUELO : versiona\n VUELOS ||--o{ VUELOS_TRIPULANTES : asigna\n',encoding='utf-8')
    rows=sql_schema(); write('DICCIONARIO_DATOS.md',dictionary(rows) if rows else '# Diccionario de datos\n\nNO VERIFICADO: la consulta de metadatos de sólo lectura no se pudo completar. Consulte las migraciones y la evidencia V60.\n')
    create_docx(report); create_pdf(report)
    print(f'generated {OUT}')

if __name__=='__main__': run()
