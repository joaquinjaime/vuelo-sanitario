# Sistema de Gestión de Vuelos Sanitarios

Aplicación para registrar, evaluar, planificar, ejecutar y cerrar vuelos sanitarios, con trazabilidad, roles, informes finales y documentos PDF versionados.

## Stack actual

- Backend: Java 21, Spring Boot 3.4.5, Maven, Spring Security, Flyway y SQL Server JDBC.
- Frontend: React con Vite (Node 24 en la imagen de compilación).
- Base de datos: SQL Server 2022 Developer en contenedor.
- Entrega local: Docker Compose, Nginx como servidor SPA y proxy inverso.

## Ejecutar con Docker

1. Clone el repositorio y entre al directorio.
2. Copie `.env.example` a `.env`.
3. Reemplace los valores de contraseña y `JWT_SECRET`. El secreto JWT debe tener al menos 32 bytes aleatorios; puede generarlo con `openssl rand -base64 48`.
4. Ejecute `docker compose up --build`.
5. Abra `http://localhost` (o el valor elegido en `FRONTEND_PORT`). La API queda disponible a través de `http://localhost/api`; no se expone directamente al navegador.

El primer arranque crea `vuelos_sanitarios`, crea el login de aplicación, ejecuta Flyway de V1 a V10 y luego inicia el backend. El perfil Docker no usa autenticación integrada de Windows.

Para detener el stack:

```powershell
docker compose down
```

Para reiniciar una instalación Docker desde cero:

```powershell
docker compose down -v
docker compose up --build
```

`down -v` elimina los volúmenes Docker de SQL Server y de documentos; los datos y PDFs persistentes se perderán. No toca ninguna instalación SQL Server nativa de Windows.

## Arquitectura

El navegador consulta al frontend Nginx. Nginx sirve la SPA y reenvía `/api` al backend dentro de la red privada de Compose. Spring Boot usa SQL Server y almacena PDFs en un volumen independiente. Sólo se publica el puerto HTTP del frontend.

## Variables de entorno

Consulte [`.env.example`](.env.example). `MSSQL_SA_PASSWORD`, `DB_PASSWORD` y `JWT_SECRET` son obligatorias. Las contraseñas SQL no pueden incluir comillas simples debido a la sustitución segura del script inicializador. `BOOTSTRAP_ADMIN_*` es opcional y sólo aprovisiona el primer administrador si no existe.

## Migraciones y persistencia

Flyway administra el esquema exclusivamente mediante `backend-java/src/main/resources/db/migration`, hasta V10. Los datos SQL se guardan en `sqlserver_data`; los documentos subidos se guardan en `documents_data`. Ambos sobreviven a `docker compose down`.

## Desarrollo sin Docker

Se necesita Java 21, Maven, Node y una base SQL Server local. Configure `DB_USERNAME`, `DB_PASSWORD` y `JWT_SECRET`, y ejecute:

```powershell
cd backend-java
mvn spring-boot:run
cd ..\frontend-react
$env:VITE_API_URL = 'http://localhost:8080/api'
npm ci
npm run dev
```

El perfil `windows` conserva el uso local de autenticación integrada y su DLL JDBC; no se utiliza dentro de Docker.

Más detalle operativo: [docs/DOCKER.md](docs/DOCKER.md).
