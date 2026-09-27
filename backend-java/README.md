# Backend de Vuelos Sanitarios

Backend Java 21 / Spring Boot 3.4.5 para gestionar solicitudes, planificación y cierre de vuelos sanitarios. SQL Server es la única base soportada y Flyway es la fuente de verdad del esquema.

## Configuración local

Se requiere una base SQL Server de desarrollo vacía llamada `vuelos_sanitarios` y un usuario con permisos DDL para ejecutar Flyway. No hay credenciales ni secretos por defecto en el repositorio.

```powershell
$env:DB_USERNAME = 'vuelos_user'
$env:DB_PASSWORD = 'una-clave-local-segura'
$env:JWT_SECRET = 'una-clave-aleatoria-de-al-menos-32-caracteres'
$env:DOCUMENTS_DIRECTORY = 'C:\datos\vuelos-sanitarios\documents'
mvn spring-boot:run
```

La aplicación escucha en `http://localhost:8080`. En una base nueva Flyway aplica V1 a V5. V4 transforma la identidad compartida, la clínica por traslado y los documentos; V5 incorpora Administrador, prioridades y ciudades solicitadas. V4 elimina los registros documentales de prueba creados bajo el modelo V1/V2: no debe usarse para una base productiva sin una migración de archivos aprobada.

Para SQL Server con autenticación integrada en Windows se puede usar el perfil `windows`. El DLL `mssql-jdbc_auth` debe estar disponible en `java.library.path`. El primer administrador se crea de forma explícita y sólo si aún no existe:

```powershell
$env:SPRING_PROFILES_ACTIVE = 'windows'
$env:JWT_SECRET = 'una-clave-aleatoria-de-al-menos-32-caracteres'
$env:BOOTSTRAP_ADMIN_USERNAME = 'administrador'
$env:BOOTSTRAP_ADMIN_PASSWORD = 'cambiar-por-una-clave-segura'
$env:BOOTSTRAP_ADMIN_EMAIL = 'administrador@organizacion.local'
mvn spring-boot:run
```

## Modelo relacional

- `persons` es la identidad única; `users` y `patients` son subtipos 1:1 y una persona puede tener ambos.
- `flight_medical_info` es 1:1 con `flights`; conserva el contexto clínico de cada traslado, no una historia clínica general.
- Los datos operativos de ruta, hangar, AA2000 e informe final conservan versiones por vuelo mediante `(flight_id, version)` y un índice filtrado para la vigente.
- `flight_document_items` representa la identidad lógica de un PDF o texto. `flight_documents` contiene sus versiones; permite múltiples documentos del mismo tipo por vuelo.
- `audit_events` registra eventos de aplicación con actor autenticado, sin copiar contenido clínico ni binarios.

Las relaciones están en 3FN/BCNF según las dependencias demostrables. Los JSON de clima y checklist son snapshots; se mantienen como documentos validados con `ISJSON` porque no existe un requisito de consulta relacional por cada campo.

## API principal

- `POST /api/auth/login`: obtiene JWT.
- `POST /api/auth/users`: crea cuenta; sólo ADMINISTRADOR. El aprovisionamiento inicial se realiza mediante las variables `BOOTSTRAP_ADMIN_*`, nunca mediante un endpoint anónimo.
- `POST /api/flights`: crea solicitud; DTS.
- `POST /api/flights/{id}/evaluation`: aprueba o rechaza; OPERACIONES.
- `POST /api/flights/{id}/resources`: asigna aeronave y comandante; OPERACIONES.
- `POST /api/flights/{id}/plan` y `/final-report`: acciones del comandante asignado; `/start` y `/finish`: Operaciones.
- `POST /api/flights/{id}/documents/pdf` y `/texts`: crea PDF o texto. Las rutas `/api/documents/{itemId}/versions/*` crean una versión nueva; no sobrescriben historia.
- `GET /api/document-versions/{versionId}/download`: descarga autenticada y autorizada de un PDF.

El ciclo permitido es `SOLICITADO → APROBADO → PLANIFICADO → EN_CURSO → FINALIZADO`, con `RECHAZADO` desde solicitado y `CANCELADO` sólo antes de la ejecución. Las operaciones de planificación y versionado usan transacciones; las asignaciones usan aislamiento serializable y bloqueos pesimistas. SQL Server complementa esto con checks de fechas, unicidad de versión, índices filtrados y un trigger de cancelación por conjuntos.

## Verificación

```powershell
mvn test
```

La compilación se verifica sin levantar una base. Las pruebas específicas de SQL Server deben ejecutarse contra una instancia local de desarrollo: H2 no cubre T-SQL, `ROWVERSION`, índices filtrados ni triggers.

## Frontend

```powershell
cd ..\frontend-react
$env:VITE_API_URL = 'http://localhost:8080/api'
npm install
npm run dev
```

La interfaz ofrece inicio de sesión y paneles guiados para registrar solicitudes (DTS), evaluar/asignar/iniciar/finalizar (Operaciones) y planificar/informar (Comandante). El administrador dispone de las APIs de usuarios y catálogos; su mantenimiento visual detallado es una mejora pendiente.
