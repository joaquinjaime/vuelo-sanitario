# Docker

## Servicios

`sqlserver` usa `mcr.microsoft.com/mssql/server:2022-latest` y sólo es accesible desde la red bridge privada `internal`. Su healthcheck ejecuta `sqlcmd SELECT 1`.

`db-init` espera ese healthcheck y ejecuta un script idempotente: crea la base `vuelos_sanitarios`, el login configurado por `DB_USERNAME` y el usuario asociado. El usuario recibe `db_owner` en este entorno de desarrollo para que Flyway pueda crear y evolucionar el esquema; el backend nunca usa `sa`.

`backend` compila Java 21 en una etapa Maven y ejecuta el JAR como usuario no root con el perfil `docker`. Expone sólo el puerto interno 8080, y el healthcheck consulta `/actuator/health`.

`frontend` compila React/Vite en Node 24 y lo sirve mediante Nginx. Nginx maneja fallback SPA y hace proxy de `/api/` a `backend:8080`, con un límite de carga de 10 MiB, igual al límite por defecto del backend.

## Volúmenes y puertos

- `sqlserver_data`: archivos de SQL Server.
- `documents_data`: PDFs cargados por la aplicación.
- `${FRONTEND_PORT:-80}:80`: único puerto publicado. SQL Server no se publica al host.

## Comandos

```powershell
docker compose up --build
docker compose ps
docker compose logs
docker compose logs backend
docker compose down
```

Use `docker compose down -v` únicamente para borrar deliberadamente tanto la base Docker como los documentos Docker y probar una instalación vacía.

## Diagnóstico

Si `db-init` falla, revise `docker compose logs db-init`; valide que las contraseñas no contengan `'` y respeten la política de SQL Server. Si el backend no queda saludable, use `docker compose logs backend`; los errores de Flyway o validación Hibernate se registran allí. Si una ruta React devuelve 404 al actualizar, confirme que se está usando el Nginx incluido, cuyo `try_files` devuelve `index.html`.

El daemon de Docker Desktop debe estar iniciado antes de construir o levantar servicios. No se necesita Java, Maven, Node ni SQL Server en la máquina anfitriona para la ejecución con Docker.
