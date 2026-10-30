#requires -Version 7.4
<#
.SYNOPSIS
  V47 -> V55 (I-4.1): validates, or after explicit human approval applies, the habitual schema migration using an archived, complete SQL/Java migration bundle built from the tested release.
.DESCRIPTION
  Default mode validates only. Applying V48-V55 requires both Migrate and the explicit
  authorization switch, after human approval of the maintenance window. No web services
  are stopped or started by this helper. Credentials come from the existing backend
  environment and are forwarded by variable name, never as process arguments.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$BundlePath,
    [Parameter(Mandatory)][ValidatePattern('^sha256:[a-f0-9]{64}$')][string]$RuntimeImage,
    [ValidateSet('Validate','Migrate')][string]$Mode='Validate',
    [switch]$HabitualMigrationExplicitlyAuthorized
)
$ErrorActionPreference='Stop'
if($Mode -eq 'Migrate' -and -not $HabitualMigrationExplicitlyAuthorized){
    throw 'Human approval of the V47-to-V55 maintenance is required.'
}
$bundle=(Resolve-Path -LiteralPath $BundlePath).Path
if(-not (Test-Path -LiteralPath (Join-Path $bundle 'classes\FlywayMigrationRunner.class'))){
    throw 'The prepared migration bundle is incomplete.'
}
$variableNames=@('MIGRATION_SQL_USERNAME','MIGRATION_JDBC_PASSWORD','MIGRATION_JDBC_URL','MIGRATION_LOCATION','MIGRATION_HABITUAL_AUTHORIZATION')
$saved=@{}
foreach($name in $variableNames){$saved[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try{
    $backend=(docker inspect vuelos-sanitarios-backend-1|ConvertFrom-Json)[0]
    if($LASTEXITCODE -ne 0 -or $backend.Config.Labels.'com.docker.compose.project' -ne 'vuelos-sanitarios'){
        throw 'Expected habitual backend configuration is unavailable.'
    }
    if($Mode -eq 'Migrate'){
        $frontend=(docker inspect vuelos-sanitarios-frontend-1|ConvertFrom-Json)[0]
        if($LASTEXITCODE -ne 0 -or $backend.State.Running -or $frontend.State.Running){
            throw 'Stop habitual backend and frontend for the approved maintenance before migrating.'
        }
    }
    if($Mode -eq 'Migrate'){
        # Only a database that is exactly at V47 may be migrated; anything else needs a human decision (see docs/PROCEDIMIENTO_ACTUALIZACION_V47_V55.md).
        # $LASTEXITCODE is $null after `| Select-Object -First 1`, which refused every run: capture the whole output, read the exit code, then take the first line.
        $versionOutput=@(docker exec -i vuelos-sanitarios-sqlserver-1 bash -c 'export SQLCMDPASSWORD="$MSSQL_SA_PASSWORD"; exec /opt/mssql-tools18/bin/sqlcmd -C -S localhost -U sa -d vuelos_sanitarios -h -1 -W -Q "SET NOCOUNT ON; SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE success=1"' 2>&1)
        $versionExit=$LASTEXITCODE
        $current=([string]($versionOutput|Select-Object -First 1)).Trim()
        if($versionExit -ne 0 -or $current -ne '47'){throw 'The habitual database is not exactly at Flyway V47; the upgrade is refused.'}
    }
    $values=@{}
    foreach($name in @('DB_URL','DB_USERNAME','DB_PASSWORD')){
        $prefix=$name+'='
        $entry=@($backend.Config.Env|Where-Object {$_.StartsWith($prefix)})
        if($entry.Count -ne 1){throw 'A required application credential is unavailable.'}
        $values[$name]=$entry[0].Substring($prefix.Length)
    }
    if($values.DB_URL -ne 'jdbc:sqlserver://sqlserver:1433;databaseName=vuelos_sanitarios;encrypt=true;trustServerCertificate=true'){
        throw 'Habitual JDBC target differs from the verified maintenance target.'
    }
    $env:MIGRATION_SQL_USERNAME=$values.DB_USERNAME
    $env:MIGRATION_JDBC_PASSWORD=$values.DB_PASSWORD
    $env:MIGRATION_JDBC_URL=$values.DB_URL
    $env:MIGRATION_LOCATION='classpath:db/migration'
    $env:MIGRATION_HABITUAL_AUTHORIZATION=if($Mode -eq 'Migrate'){'V47_TO_V55_AUTHORIZED'}else{''}
    # The bundle is copied into the container with `docker cp` instead of a Windows bind mount: on this host the bind mount intermittently exposed an incomplete bundle
    # (NoClassDefFoundError / "No migration with a target version 55" in about 1 of 8 Validate runs). The host-side check below makes a partial bundle fail before anything runs.
    $migrationFiles=@(Get-ChildItem -LiteralPath (Join-Path $bundle 'classes\db\migration') -File)
    if($migrationFiles.Count -ne 55 -or @($migrationFiles|Where-Object {$_.Name -like 'V55__*'}).Count -ne 1){
        throw 'The prepared migration bundle does not contain exactly the 55 expected migrations.'
    }
    $container='vuelos-flyway-v55-'+[guid]::NewGuid().ToString('N').Substring(0,8)
    $arguments=@('create','--name',$container,'--pull','never','--memory','256m','--cpus','1','--network','vuelos-sanitarios_internal')
    foreach($name in $variableNames){$arguments+=@('--env',$name)}
    $arguments+=@('--entrypoint','java',$RuntimeImage,'-Xmx128m','-cp','/ops/classes:/ops/libs/*','FlywayMigrationRunner','55')
    if($Mode -eq 'Validate'){$arguments+='validate'}
    $null=@(docker @arguments 2>&1)
    if($LASTEXITCODE -ne 0){throw 'The migration container could not be created.'}
    $null=@(docker cp "$bundle\." "${container}:/ops" 2>&1)
    if($LASTEXITCODE -ne 0){throw 'The migration bundle could not be copied into the container.'}
    $result=@(docker start -a $container 2>&1)
    $flywayExit=$LASTEXITCODE
    if($flywayExit -ne 0){
        # Keep the failing migration identifiable (V52 stops with THROW 51052): print only Flyway/SQL Server error lines, with the application password removed.
        $result|ForEach-Object{([string]$_).Replace($values.DB_PASSWORD,'***')}|Where-Object{$_ -match 'ERROR|Migration|failed|SQL State|Error Code|Message|Location|Line \d'}|Select-Object -Last 20|ForEach-Object{Write-Warning $_}
        throw 'Prepared Flyway operation failed; password-redacted diagnostics were printed above.'
    }
    $result|Where-Object {$_ -match 'Successfully|Flyway target='}
}finally{
    if($container){$null=@(docker rm -f $container 2>&1)}
    foreach($name in $variableNames){[Environment]::SetEnvironmentVariable($name,$saved[$name],'Process')}
    $values=$null;$backend=$null;$result=$null
}
