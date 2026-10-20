# Refactorización de identificadores numéricos

## Diagnóstico y estrategia

El esquema físico ya utilizaba tablas españolas en `snake_case`, pero las PK y FK de negocio eran `UNIQUEIDENTIFIER` y el backend/API exponían `UUID`. La migración `V24` es un corte destructivo de desarrollo: vacía las tablas de aplicación, conserva el historial de Flyway y reconstruye cada PK ordinaria como `BIGINT IDENTITY(1,1)`. Captura y recompone PK, UQ y FK existentes; las FK se renombran como `fk_<tabla>_<columna>` y reciben índices `idx_<tabla>_<columna>`.

`vuelos_sanitarios.vuelo_id` y `perfiles_comandante.persona_id` son excepciones documentadas: siguen siendo PK/FK `BIGINT`, pues modelan extensiones estrictas 1:1. `usuarios_roles` conserva la PK compuesta `(usuario_id, rol_id)`.

## Convención definitiva

- Tablas y columnas: español y `snake_case`; las tablas son plurales.
- PK ordinaria: `id BIGINT IDENTITY(1,1)`; FK: `<entidad>_id` o un rol explícito, por ejemplo `comandante_usuario_id`.
- Auditoría técnica: `fecha_creacion`, `fecha_actualizacion`, `fecha_baja` y campos de negocio explícitos.
- Booleanos: `activo`, `leido`, `favorable`, `es_actual`, etc., con `BIT`.
- Catálogos: el código (`codigo`) es estable; los IDs no se usan como significado de negocio.

## Mapeo de impacto

| Área | Antes | Después |
|---|---|---|
| PK de entidades | `UUID` / `UNIQUEIDENTIFIER` | `Long` / `BIGINT IDENTITY` |
| FK y DTO/API | UUID y JSON string | `Long` y JSON number |
| JWT `sub` de usuario | UUID serializado | ID numérico serializado y `Long.parseLong` |
| `vuelos.origen_id`, `vuelos.destino_id` | Nombre ambiguo | `aeropuerto_origen_id`, `aeropuerto_destino_id`: expresan la entidad referenciada |

## Flyway y seeds

`V24` no modifica migraciones históricas, por lo que no altera checksums existentes. `V25` rearma los catálogos de dominio y `V26` vuelve a cargar los snapshots versionados de provincias, localidades y aeródromos. No se depende de SQL manual ni de IDs fijos.

## Verificación

`npm run build` finaliza correctamente. La compilación Java y de pruebas finaliza antes de ejecutar la suite. La suite de integración completa requiere un SQL Server disponible; en este entorno queda esperando la conexión configurada en `application.yml`, por lo que no se declara como aprobada.
