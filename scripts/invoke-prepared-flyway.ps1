#requires -Version 7.4
<#
.SYNOPSIS
  Validates the habitual schema using an archived, complete SQL/Java migration bundle.
.DESCRIPTION
  Default mode validates only. Applying V33-V47 requires both Migrate and the explicit
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
    throw 'Human approval of the V32-to-V47 maintenance is required.'
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
    $env:MIGRATION_HABITUAL_AUTHORIZATION=if($Mode -eq 'Migrate'){'V32_TO_V47_AUTHORIZED'}else{''}
    $arguments=@('run','--rm','--pull','never','--memory','256m','--cpus','1',
        '--network','vuelos-sanitarios_internal','--mount',"type=bind,source=$bundle,target=/ops,readonly")
    foreach($name in $variableNames){$arguments+=@('--env',$name)}
    $arguments+=@('--entrypoint','java',$RuntimeImage,'-Xmx128m','-cp','/ops/classes:/ops/libs/*','FlywayMigrationRunner','47')
    if($Mode -eq 'Validate'){$arguments+='validate'}
    $result=@(docker @arguments 2>&1)
    if($LASTEXITCODE -ne 0){throw 'Prepared Flyway operation failed; confidential diagnostics suppressed.'}
    $result|Where-Object {$_ -match 'Successfully|Flyway target='}
}finally{
    foreach($name in $variableNames){[Environment]::SetEnvironmentVariable($name,$saved[$name],'Process')}
    $values=$null;$backend=$null;$result=$null
}
