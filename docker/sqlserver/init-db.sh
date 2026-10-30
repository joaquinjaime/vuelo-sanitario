#!/usr/bin/env bash
set -euo pipefail

SQLCMD=/opt/mssql-tools18/bin/sqlcmd
if [[ ! -x "$SQLCMD" ]]; then SQLCMD=/opt/mssql-tools/bin/sqlcmd; fi

# SQL Server passwords used here must not include a single quote. This keeps
# sqlcmd variable substitution unambiguous and is documented in .env.example.
case "$MSSQL_SA_PASSWORD$DB_PASSWORD$MIGRATION_DB_PASSWORD" in *\'*) echo "Passwords must not contain a single quote." >&2; exit 1;; esac

# Dos identidades distintas (mínimo privilegio): la cuenta de migraciones (Flyway, db_owner) y la cuenta de la aplicación (sólo datos).
if [[ "$DB_USERNAME" == "$MIGRATION_DB_USERNAME" ]]; then
  echo "DB_USERNAME (aplicación) y MIGRATION_DB_USERNAME (migraciones) deben ser cuentas distintas." >&2; exit 1
fi
if [[ "$DB_PASSWORD" == "$MIGRATION_DB_PASSWORD" ]]; then
  echo "DB_PASSWORD y MIGRATION_DB_PASSWORD deben ser distintas." >&2; exit 1
fi

export SQLCMDPASSWORD="$MSSQL_SA_PASSWORD"
export APP_LOGIN="$DB_USERNAME" APP_PASSWORD="$DB_PASSWORD" MIGRATION_LOGIN="$MIGRATION_DB_USERNAME" MIGRATION_PASSWORD="$MIGRATION_DB_PASSWORD" DB_NAME

"$SQLCMD" -S sqlserver -U sa -C -b \
  -Q "
IF DB_ID(N'\$(DB_NAME)') IS NULL
BEGIN
    EXEC(N'CREATE DATABASE [\$(DB_NAME)]');
END;
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'\$(APP_LOGIN)')
BEGIN
    EXEC(N'CREATE LOGIN [\$(APP_LOGIN)] WITH PASSWORD = N''\$(APP_PASSWORD)'', CHECK_POLICY = ON');
END;
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'\$(MIGRATION_LOGIN)')
BEGIN
    EXEC(N'CREATE LOGIN [\$(MIGRATION_LOGIN)] WITH PASSWORD = N''\$(MIGRATION_PASSWORD)'', CHECK_POLICY = ON');
END;"

# Usuarios y roles de la base (db_owner sólo para migraciones; db_datareader/db_datawriter para la aplicación). Se reaplica en cada arranque: también degrada
# a una cuenta de aplicación que hubiera heredado db_owner de una instalación anterior.
"$SQLCMD" -S sqlserver -U sa -C -b -I -d "$DB_NAME" -i /scripts/apply-db-permissions.sql

echo "Database $DB_NAME, migration login and least-privilege application login are ready."
