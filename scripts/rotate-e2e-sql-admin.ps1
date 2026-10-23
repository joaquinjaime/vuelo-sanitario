#requires -Version 7.4
<#
.SYNOPSIS
  Rotates only the existing E2E sa login, retaining its SQL volume and application data.
.DESCRIPTION
  Credentials travel through stdin or the process environment, never command arguments.
  Creates ignored .env.e2e and DPAPI recovery files. Stops only the E2E web services,
  recreates its SQL container with the same image/volume, and restores those services.
#>
[CmdletBinding()]
param([Parameter(Mandatory)][switch]$Rotate)
$ErrorActionPreference = 'Stop'
if (-not $IsWindows -or -not $Rotate) { throw 'Explicit Windows E2E rotation is required.' }
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$sqlContainer = 'vuelos-sanitarios-e2e-sqlserver-1'
$webContainers = @('vuelos-sanitarios-e2e-backend-1','vuelos-sanitarios-e2e-frontend-1')
$envFile = Join-Path $root '.env.e2e'
$keyDirectory = Join-Path $env:LOCALAPPDATA 'VuelosSanitarios\RecoveryKeys'
$evidenceDirectory = Join-Path $env:USERPROFILE 'Backups\VuelosSanitarios'
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$userSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value

function Set-RestrictedFile([string]$Path) {
    $acl = [System.Security.AccessControl.FileSecurity]::new()
    $acl.SetOwner([System.Security.Principal.SecurityIdentifier]::new($userSid))
    $acl.SetAccessRuleProtection($true,$false)
    foreach ($sid in @($userSid,'S-1-5-18','S-1-5-32-544')) {
        $acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new(
            [System.Security.Principal.SecurityIdentifier]::new($sid),'FullControl','Allow'))
    }
    Set-Acl -LiteralPath $Path -AclObject $acl
}
function New-RestrictedBytes([string]$Path,[byte[]]$Bytes) {
    $file = [System.IO.File]::Open($Path,[System.IO.FileMode]::CreateNew)
    $file.Dispose()
    Set-RestrictedFile $Path
    [System.IO.File]::WriteAllBytes($Path,$Bytes)
}
function Inspect-Container([string]$Name) {
    $result = docker inspect $Name | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) { throw 'Could not inspect a required container.' }
    return $result[0]
}
function Get-ContainerVariable($Container,[string]$Name) {
    $prefix=$Name+'='
    $value=@($Container.Config.Env | Where-Object { $_.StartsWith($prefix) })
    if ($value.Count -ne 1) { throw 'Required container credential is unavailable.' }
    return $value[0].Substring($prefix.Length)
}
function Invoke-CurrentSql([string]$Sql,[string]$Database='master') {
    $output=@($Sql | docker exec -i $sqlContainer /bin/bash -lc 'export SQLCMDPASSWORD="$MSSQL_SA_PASSWORD"; exec /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -C -b -x -h -1 -W -s "|" -d "$1"' sh $Database 2>&1)
    if ($LASTEXITCODE -ne 0) { throw 'E2E SQL operation failed; confidential diagnostic output suppressed.' }
    return @($output | ForEach-Object { $_.ToString().Trim() } | Where-Object {$_})
}
function Test-SqlCredential([string]$Credential) {
    $null=$Credential | docker exec -i $sqlContainer /bin/bash -lc 'IFS= read -r SQLCMDPASSWORD; SQLCMDPASSWORD="$(printf %s "$SQLCMDPASSWORD" | tr -d "\r\n")"; export SQLCMDPASSWORD; exec /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -C -b -l 5 -h -1 -Q "SET NOCOUNT ON; SELECT 1;"' 2>&1
    return $LASTEXITCODE -eq 0
}
function Wait-Healthy([string]$Name) {
    for($attempt=0;$attempt -lt 36;$attempt++) {
        $state=Inspect-Container $Name
        if($state.State.Status -eq 'running' -and $state.State.Health.Status -eq 'healthy'){return}
        Start-Sleep -Seconds 5
    }
    throw 'An E2E service did not become healthy; retained recovery credentials must be used.'
}

Push-Location $root
try {
    if(Test-Path -LiteralPath $envFile){throw '.env.e2e already exists; investigate before another rotation.'}
    if(-not (Test-Path -LiteralPath $keyDirectory -PathType Container)){throw 'Protected key directory is missing.'}
    $before=Inspect-Container $sqlContainer
    $usual=Inspect-Container 'vuelos-sanitarios-sqlserver-1'
    if($before.Config.Labels.'com.docker.compose.project' -ne 'vuelos-sanitarios-e2e'){throw 'Unexpected E2E project.'}
    $volume=@($before.Mounts|Where-Object Destination -eq '/var/opt/mssql')
    if($volume.Count -ne 1 -or $volume[0].Name -ne 'vuelos-sanitarios-e2e_sqlserver_data'){throw 'Unexpected SQL volume; aborting.'}
    $tag=(docker image inspect $before.Config.Image|ConvertFrom-Json)[0]
    if($tag.Id -ne $before.Image){throw 'SQL image tag differs from the running image; do not upgrade during credential rotation.'}
    $old=Get-ContainerVariable $before 'MSSQL_SA_PASSWORD'
    $new='Aa1!'+[Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).TrimEnd('=').Replace('+','-').Replace('/','_')
    $scope=[System.Security.Cryptography.DataProtectionScope]::CurrentUser
    foreach($item in @(@('before',$old),@('after',$new))){
        $protected=[System.Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($item[1]),$null,$scope)
        New-RestrictedBytes (Join-Path $keyDirectory "sql_e2e_admin_${stamp}_$($item[0]).dpapi") $protected
    }
    New-RestrictedBytes $envFile ([Text.Encoding]::UTF8.GetBytes("# Isolated E2E administrator. Never commit this file.`nE2E_MSSQL_SA_PASSWORD=$new`n"))
    $mainEnvHash=(Get-FileHash -LiteralPath '.env' -Algorithm SHA256).Hash
    $stopped=@()
    foreach($name in $webContainers){if((Inspect-Container $name).State.Running){docker stop --time 30 $name|Out-Null;if($LASTEXITCODE -ne 0){throw 'Could not stop E2E web traffic.'};$stopped+=$name}}
    $countsSql="SET NOCOUNT ON; DECLARE @q nvarchar(max)=N''; SELECT @q=@q+CASE WHEN @q=N'' THEN N'' ELSE N' UNION ALL ' END+N'SELECT N'''+t.name+N''' table_name,COUNT_BIG(*) row_count FROM dbo.'+QUOTENAME(t.name) FROM sys.tables t WHERE t.is_ms_shipped=0; EXEC(N'SELECT table_name,row_count FROM ('+@q+N') t ORDER BY table_name');"
    $countsBefore=Invoke-CurrentSql $countsSql 'vuelos_sanitarios_e2e'
    if(-not (Test-SqlCredential $old)){throw 'Existing E2E administrator login is not usable.'}
    $null=Invoke-CurrentSql "ALTER LOGIN [sa] WITH PASSWORD=N'$new';"
    if(-not (Test-SqlCredential $new)){throw 'New E2E administrator could not authenticate; preserve all recovery files.'}
    if(Test-SqlCredential $old){throw 'Old E2E administrator secret is still accepted.'}
    $compose=@('compose','--env-file','.env','--env-file','.env.e2e','-p','vuelos-sanitarios-e2e','-f','docker-compose.yml','-f','docker-compose.e2e.yml')
    docker @compose up -d --pull never --no-deps --force-recreate sqlserver
    if($LASTEXITCODE -ne 0){throw 'E2E SQL recreation failed; new credentials are preserved.'}
    $after=Inspect-Container $sqlContainer
    $afterVolume=@($after.Mounts|Where-Object Destination -eq '/var/opt/mssql')
    if($afterVolume[0].Name -ne $volume[0].Name -or $after.Image -ne $before.Image){throw 'Unexpected SQL image or volume after recreation.'}
    foreach($network in $before.NetworkSettings.Networks.PSObject.Properties){
        if(-not ($after.NetworkSettings.Networks.PSObject.Properties.Name -contains $network.Name)){
            $networkArgs=@('network','connect')
            foreach($alias in @($network.Value.Aliases)){if($alias){$networkArgs+=@('--alias',$alias)}}
            $networkArgs+=@($network.Name,$sqlContainer)
            docker @networkArgs
            if($LASTEXITCODE -ne 0){throw 'Could not restore an existing E2E SQL network.'}
        }
    }
    Wait-Healthy $sqlContainer
    $countsAfter=Invoke-CurrentSql $countsSql 'vuelos_sanitarios_e2e'
    if(($countsBefore -join "`n") -cne ($countsAfter -join "`n")){throw 'E2E table counts changed across credential rotation.'}
    docker @compose up -d --pull never --no-deps db-init
    if($LASTEXITCODE -ne 0){throw 'Could not update E2E db-init credential consumer.'}
    for($attempt=0;$attempt -lt 12;$attempt++){$init=Inspect-Container 'vuelos-sanitarios-e2e-db-init-1';if($init.State.Status -eq 'exited'){break};Start-Sleep -Seconds 2}
    if($init.State.Status -ne 'exited' -or $init.State.ExitCode -ne 0){throw 'E2E db-init did not complete successfully.'}
    foreach($name in $stopped){docker start $name|Out-Null;if($LASTEXITCODE -ne 0){throw 'Could not restart an E2E web service.'};Wait-Healthy $name}
    if(-not (Test-SqlCredential $new) -or (Test-SqlCredential $old)){throw 'Final E2E credential validation failed.'}
    $usualAfter=Inspect-Container 'vuelos-sanitarios-sqlserver-1'
    if($usualAfter.Id -ne $usual.Id -or $usualAfter.State.StartedAt -ne $usual.State.StartedAt -or (Get-FileHash '.env' -Algorithm SHA256).Hash -cne $mainEnvHash){throw 'The habitual environment changed unexpectedly.'}
    $evidence=[ordered]@{
        completedUtc=[DateTime]::UtcNow.ToString('o');environment='E2E';oldCredentialRejected=$true
        newCredentialAccepted=$true;tableCountsUnchanged=$true;habitualSqlUntouched=$true
        image=$after.Image;volume=$afterVolume[0].Name;newContainerId=$after.Id
        recoveryKeyStorage='DPAPI CurrentUser, outside repository';envFile='.env.e2e (ignored and ACL restricted)'
    }
    $evidence | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evidenceDirectory "sql_e2e_rotation_$stamp.json") -Encoding utf8
    [pscustomobject]$evidence
} finally {
    $old=$null;$new=$null;$protected=$null
    Pop-Location
}
