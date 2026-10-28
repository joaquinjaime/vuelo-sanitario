/*
  Permisos de base de datos de Vuelos Sanitarios (I-5.8). Idempotente. Se ejecuta con una cuenta administrativa (sa) y en el contexto de la base:

    sqlcmd -S <servidor> -U sa -C -b -I -d <base> -i apply-db-permissions.sql

  Variables de entorno (sqlcmd las sustituye en $(...)):
    MIGRATION_LOGIN  cuenta de migraciones: db_owner. La usa Flyway (arranque automático en desarrollo/E2E o el ayudante controlado en producción).
    APP_LOGIN        cuenta de la aplicación (Spring Boot en operación normal): SOLO lectura y escritura de datos.

  La cuenta de la aplicación NO puede crear, alterar ni eliminar objetos, deshabilitar triggers, administrar usuarios ni roles, ni modificar el historial de Flyway.
  db_datareader/db_datawriter cubren automáticamente las tablas que creen migraciones futuras (no hay que repetir este script tras cada migración); el DENY sobre
  flyway_schema_history sólo puede aplicarse cuando la tabla existe, por lo que el script se vuelve a ejecutar después de migrar (el procedimiento de producción lo incluye).
*/
SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;

IF N'$(MIGRATION_LOGIN)' = N'$(APP_LOGIN)'
    THROW 51080, N'La cuenta de migraciones y la cuenta de la aplicación deben ser distintas.', 1;
IF SUSER_ID(N'$(MIGRATION_LOGIN)') IS NULL OR SUSER_ID(N'$(APP_LOGIN)') IS NULL
    THROW 51081, N'Ambos logins deben existir en el servidor antes de otorgar permisos en la base.', 1;

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'$(MIGRATION_LOGIN)')
    CREATE USER [$(MIGRATION_LOGIN)] FOR LOGIN [$(MIGRATION_LOGIN)] WITH DEFAULT_SCHEMA = dbo;
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'$(APP_LOGIN)')
    CREATE USER [$(APP_LOGIN)] FOR LOGIN [$(APP_LOGIN)] WITH DEFAULT_SCHEMA = dbo;

-- Cuenta de migraciones: propietaria de la base (DDL, triggers, índices, Java migrations de Flyway).
IF IS_ROLEMEMBER(N'db_owner', N'$(MIGRATION_LOGIN)') = 0 ALTER ROLE db_owner ADD MEMBER [$(MIGRATION_LOGIN)];

-- Cuenta de la aplicación: retira todo privilegio administrativo heredado de configuraciones anteriores (db_owner) y deja sólo datos.
IF IS_ROLEMEMBER(N'db_owner', N'$(APP_LOGIN)') = 1 ALTER ROLE db_owner DROP MEMBER [$(APP_LOGIN)];
IF IS_ROLEMEMBER(N'db_ddladmin', N'$(APP_LOGIN)') = 1 ALTER ROLE db_ddladmin DROP MEMBER [$(APP_LOGIN)];
IF IS_ROLEMEMBER(N'db_securityadmin', N'$(APP_LOGIN)') = 1 ALTER ROLE db_securityadmin DROP MEMBER [$(APP_LOGIN)];
IF IS_ROLEMEMBER(N'db_accessadmin', N'$(APP_LOGIN)') = 1 ALTER ROLE db_accessadmin DROP MEMBER [$(APP_LOGIN)];
IF IS_ROLEMEMBER(N'db_backupoperator', N'$(APP_LOGIN)') = 1 ALTER ROLE db_backupoperator DROP MEMBER [$(APP_LOGIN)];
IF IS_ROLEMEMBER(N'db_datareader', N'$(APP_LOGIN)') = 0 ALTER ROLE db_datareader ADD MEMBER [$(APP_LOGIN)];
IF IS_ROLEMEMBER(N'db_datawriter', N'$(APP_LOGIN)') = 0 ALTER ROLE db_datawriter ADD MEMBER [$(APP_LOGIN)];

-- El historial de migraciones sólo lo escribe la cuenta de migraciones.
IF OBJECT_ID(N'dbo.flyway_schema_history', N'U') IS NOT NULL
    DENY INSERT, UPDATE, DELETE ON OBJECT::dbo.flyway_schema_history TO [$(APP_LOGIN)];

PRINT N'Permisos aplicados: migraciones=$(MIGRATION_LOGIN) (db_owner), aplicacion=$(APP_LOGIN) (db_datareader, db_datawriter).';
