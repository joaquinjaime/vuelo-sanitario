#!/usr/bin/env bash
set -euo pipefail

SQLCMD=/opt/mssql-tools18/bin/sqlcmd
if [[ ! -x "$SQLCMD" ]]; then SQLCMD=/opt/mssql-tools/bin/sqlcmd; fi

# SQL Server passwords used here must not include a single quote. This keeps
# sqlcmd variable substitution unambiguous and is documented in .env.example.
case "$MSSQL_SA_PASSWORD$DB_PASSWORD" in *\'*) echo "Passwords must not contain a single quote." >&2; exit 1;; esac

"$SQLCMD" -S sqlserver -U sa -P "$MSSQL_SA_PASSWORD" -C -b \
  -v DB_NAME="$DB_NAME" APP_LOGIN="$DB_USERNAME" APP_PASSWORD="$DB_PASSWORD" \
  -Q "
IF DB_ID(N'\$(DB_NAME)') IS NULL
BEGIN
    EXEC(N'CREATE DATABASE [\$(DB_NAME)]');
END;
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'\$(APP_LOGIN)')
BEGIN
    EXEC(N'CREATE LOGIN [\$(APP_LOGIN)] WITH PASSWORD = N''\$(APP_PASSWORD)'', CHECK_POLICY = ON');
END;"

"$SQLCMD" -S sqlserver -U sa -P "$MSSQL_SA_PASSWORD" -C -b \
  -d "$DB_NAME" -v APP_LOGIN="$DB_USERNAME" \
  -Q "IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'\$(APP_LOGIN)') CREATE USER [\$(APP_LOGIN)] FOR LOGIN [\$(APP_LOGIN)]; ALTER ROLE db_owner ADD MEMBER [\$(APP_LOGIN)];"

echo "Database $DB_NAME and application login are ready."
