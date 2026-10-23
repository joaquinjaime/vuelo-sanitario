<#
.SYNOPSIS
  Reconstruct and validate V32 -> V47 on a new, clearly named SQL Server database.
.DESCRIPTION
  Never drops a database or volume. Requires sqlcmd, Java 21, Maven, and an isolated
  SQL Server. Credentials are read only from process environment variables.
.EXAMPLE
  $env:MIGRATION_SQL_USERNAME='sa'
  $env:SQLCMDPASSWORD=$env:MIGRATION_SQL_PASSWORD
  $env:MIGRATION_JDBC_PASSWORD=$env:SQLCMDPASSWORD
  .\scripts\validate-migration-upgrade.ps1 -Server 'tcp:127.0.0.1,14332' `
    -JdbcServer 'localhost:14332' -Database 'vuelos_validacion_migracion_v32_v47_20261022'
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$Server,
    [Parameter(Mandatory=$true)][string]$JdbcServer,
    [Parameter(Mandatory=$true)][ValidatePattern('^vuelos_validacion_migracion_v32_v47_[A-Za-z0-9_]+$')][string]$Database
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$migrationPath = Join-Path $root 'backend-java\src\main\resources\db\migration'
$runner = Join-Path $PSScriptRoot 'FlywayMigrationRunner.java'
$seed = Join-Path $PSScriptRoot 'seed-migration-v32-fixture.sql'
$verify = Join-Path $PSScriptRoot 'verify-migration-v47-fixture.sql'
$sqlcmd = Get-Command sqlcmd -ErrorAction SilentlyContinue
if (-not $sqlcmd) { throw 'sqlcmd is required.' }
if (-not $env:MIGRATION_SQL_USERNAME -or -not $env:SQLCMDPASSWORD -or -not $env:MIGRATION_JDBC_PASSWORD) {
    throw 'Set MIGRATION_SQL_USERNAME, SQLCMDPASSWORD, and MIGRATION_JDBC_PASSWORD in the process environment.'
}

$classpathFile = Join-Path $root 'backend-java\target\flyway-validation-classpath.txt'
if (-not (Test-Path -LiteralPath $classpathFile)) {
    Push-Location (Join-Path $root 'backend-java')
    try {
        & mvn -q dependency:build-classpath "-Dmdep.outputFile=target/flyway-validation-classpath.txt"
        if ($LASTEXITCODE -ne 0) { throw 'Maven could not prepare Flyway dependencies.' }
    } finally { Pop-Location }
}
$classpath = (Get-Content -Raw -LiteralPath $classpathFile).Trim()
$combinedClasspath = (Join-Path $root 'backend-java\target\classes') + ';' + $classpath
$env:MIGRATION_JDBC_URL = "jdbc:sqlserver://$JdbcServer;databaseName=$Database;encrypt=true;trustServerCertificate=true"
$env:MIGRATION_LOCATION = $migrationPath

$connectionArgs = @('-S', $Server, '-U', $env:MIGRATION_SQL_USERNAME, '-C', '-I', '-b', '-d', 'master')
$databaseQuery = "IF DB_ID(N'$Database') IS NOT NULL THROW 51130, 'Refusing to reuse an existing database.', 1; CREATE DATABASE [$Database]; SELECT DB_NAME(database_id) FROM sys.databases WHERE name=N'$Database';"
& $sqlcmd.Source @connectionArgs -Q $databaseQuery
if ($LASTEXITCODE -ne 0) { throw 'Could not create the new isolated validation database; no existing database was changed.' }

Push-Location $root
try {
    & java --class-path $combinedClasspath $runner 32
    if ($LASTEXITCODE -ne 0) { throw 'Reconstructing the historical V32 schema failed.' }
    & $sqlcmd.Source @connectionArgs -d $Database -v "FixtureDatabase=$Database" -i $seed
    if ($LASTEXITCODE -ne 0) { throw 'Synthetic V32 fixture load failed.' }
    & java --class-path $combinedClasspath $runner 47
    if ($LASTEXITCODE -ne 0) { throw 'Migrating the populated V32 fixture to V47 failed.' }
    & $sqlcmd.Source @connectionArgs -d $Database -v "FixtureDatabase=$Database" -i $verify
    if ($LASTEXITCODE -ne 0) { throw 'Post-migration integrity verification failed.' }
} finally {
    Remove-Item Env:MIGRATION_JDBC_URL -ErrorAction SilentlyContinue
    Remove-Item Env:MIGRATION_LOCATION -ErrorAction SilentlyContinue
    Pop-Location
}
