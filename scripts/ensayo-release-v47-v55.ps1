#requires -Version 7.4
<#
.SYNOPSIS
  Ensayo definitivo V47 -> V55 con las IMÁGENES RELEASE, sobre una restauración aislada de la base habitual. No modifica la base habitual.
.DESCRIPTION
  La base habitual sólo se LEE (respaldo COPY_ONLY). Todo lo demás ocurre en la base `vuelos_sanitarios_ensayo_v47` de la instancia SQL E2E
  y en contenedores descartables de la red `vuelos-sanitarios-e2e_internal`. Requiere detenidos el backend y el frontend E2E (memoria de Docker).
  El ayudante de producción `invoke-prepared-flyway-v55.ps1` se ejecuta en una COPIA con las constantes del objetivo sustituidas (cada sustitución
  debe coincidir exactamente una vez): así se prueban sus guardias, su copia del bundle y la autorización por versión sin tocar la base habitual.
  Etapas (lista separada por comas en -Stage): 1 respaldo y cadena AES de la habitual | 2 restauración | 3 siembra con el contrato V47 |
  4 fotografía previa y diagnóstico | 5 FULL de la ventana | 6 bundle desde la imagen release | 7 Validate y Migrate |
  8 fotografía posterior y comprobaciones SQL | 9 arranque de las imágenes release (configuración tipo habitual) | 10 prueba funcional |
  11 auditoría | 12 recuperación con las versiones V47 | 14 ensayo negativo (V52 se detiene y se reanuda) | 13 limpieza.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Work,
    [Parameter(Mandatory)][string]$BackendImage,
    [Parameter(Mandatory)][string]$FrontendImage,
    [string]$V47BackendImage='vuelos-sanitarios-backend:release-v47-20261023',
    [string]$V47FrontendImage='vuelos-sanitarios-frontend:release-v47-20261023',
    # Cadena y no [int[]]: con `pwsh -File`, "1,2" se interpretaría como el número 12.
    [string]$Stage='1,2,3,4,5,6,7,8,9,10,11,12,14,13'
)
$ErrorActionPreference='Stop'
$repo=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$store='C:\ProgramData\VuelosSanitarios'
$protect=Join-Path $PSScriptRoot 'protect-sql-backup.ps1'
$hab='vuelos-sanitarios-sqlserver-1'; $e2e='vuelos-sanitarios-e2e-sqlserver-1'; $e2eBackend='vuelos-sanitarios-e2e-backend-1'
$net='vuelos-sanitarios-e2e_internal'
$DB='vuelos_sanitarios_ensayo_v47'; $BK='vuelos-sanitarios-ensayo-backend'; $FE='vuelos-sanitarios-ensayo-frontend'; $VOL='vuelos-sanitarios-ensayo_documents'
$statePath=Join-Path $Work 'state.json'
New-Item -ItemType Directory -Force $Work,"$Work\logs" | Out-Null
$state=if(Test-Path $statePath){Get-Content $statePath -Raw|ConvertFrom-Json -AsHashtable}else{@{}}
function Save-State{ $state|ConvertTo-Json -Depth 6|Set-Content $statePath -Encoding utf8 }
function Say([string]$m){ $line="[{0:HH:mm:ss}] {1}" -f (Get-Date),$m; Write-Host $line; Add-Content "$Work\logs\ensayo.log" $line }
function Sql([string]$c,[string]$db,[string]$q){
    $remote='export SQLCMDPASSWORD="$MSSQL_SA_PASSWORD"; exec /opt/mssql-tools18/bin/sqlcmd -C -S localhost -U sa -d '+$db+' -h -1 -W -b -s "|"'
    $out=@(($q+"`nGO`n")|docker exec -i $c bash -c $remote 2>&1)
    if($LASTEXITCODE -ne 0){ throw "SQL failed in ${c}: $($out -join ' | ')" }
    ,@($out|ForEach-Object{"$_"}|Where-Object{$_.Trim()})
}
function Native([scriptblock]$b,[string]$what){ $o=@(& $b 2>&1); if($LASTEXITCODE -ne 0){ throw "$what failed: $($o|Select-Object -Last 5)" }; $o }
function Wait-Started([string]$name){
    for($i=0;$i -lt 90;$i++){
        $log=(docker logs $name 2>&1|Out-String)
        if($log -match 'Started BackendApplication'){ return }
        if($log -match 'APPLICATION FAILED|Application run failed'){ throw "$name did not start: $(($log -split "`n"|Select-String 'Caused by|ERROR'|Select-Object -First 3) -join ' / ')" }
        Start-Sleep 4
    }
    throw "$name did not start in time"
}
function E2eEnv{
    $h=[ordered]@{}
    foreach($l in (docker inspect $e2eBackend --format '{{range .Config.Env}}{{println .}}{{end}}')){
        if($l -match '^([A-Z0-9_]+)=(.*)$'){ $k=$Matches[1]; $v=$Matches[2]; if($k -match '^(APP_|BOOTSTRAP_|CORS_|DB_|DOCUMENT|EMAIL_|FINAL_|JWT_|MAIL_|MAX_PDF|SPRING_)'){ $h[$k]=$v } }
    }
    $h
}
function Write-EnvFile([System.Collections.IDictionary]$h,[string]$path){ ($h.GetEnumerator()|ForEach-Object{"$($_.Key)=$($_.Value)"}) -join "`n"|Set-Content $path -Encoding ascii -NoNewline }
function Habitual-like-env{
    $h=E2eEnv
    foreach($k in @($h.Keys)){ if($k -match '^(APP_E2E|APP_CREW|APP_AUDIT_DIAG|EMAIL_VERIFICATION_RESEND|FINAL_REPORT|DOCUMENT_LOCK)'){ $h.Remove($k) } }
    $h['SPRING_PROFILES_ACTIVE']='docker'; $h['MAIL_ENABLED']='false'; $h['MAIL_HOST']=''; $h['MAIL_FROM']=''; $h['MAIL_USERNAME']=''; $h['MAIL_PASSWORD']=''
    $h['DB_URL']="jdbc:sqlserver://sqlserver:1433;databaseName=$DB;encrypt=true;trustServerCertificate=true"; $h['APP_PUBLIC_URL']='http://127.0.0.1:18091'
    $h
}
function Start-Backend([string]$image,[string]$envFile){
    docker rm -f $BK 2>&1|Out-Null
    $null=Native { docker run -d --name $BK --network $net --network-alias backend --memory 640m --env-file $envFile -e JAVA_TOOL_OPTIONS=-Xmx400m -p 127.0.0.1:18090:8080 -v "${VOL}:/data/documents" $image } 'backend start'
    Wait-Started $BK
}
function Stop-Apps{ foreach($n in $FE,$BK){ docker rm -f $n 2>&1|Out-Null } }
function Node-Env{
    $env:E2E_BASE='http://127.0.0.1:18090/api'; $env:E2E_DB_NAME=$DB; $env:E2E_SQL_CONTAINER=$e2e; $env:E2E_BACKEND_CONTAINER=$BK
    $env:ENSAYO_STATE="$Work\ensayo-state.json"; $env:E2E_FIXED_MARK=$state.mark; $env:E2E_FIXED_PASSWORD=$state.password
}
function Backup-Chain([string]$srcContainer,[string]$srcDb,[string]$label){
    $ts=Get-Date -Format 'yyyyMMdd_HHmmss'; $name="ensayo_release_${label}_$ts"; $inC="/var/opt/mssql/backup/$name.bak"
    $null=Sql $srcContainer master "BACKUP DATABASE [$srcDb] TO DISK = N'$inC' WITH COPY_ONLY, CHECKSUM, COMPRESSION, INIT"
    $v=Sql $srcContainer master "RESTORE VERIFYONLY FROM DISK = N'$inC' WITH CHECKSUM"
    $shaC=(docker exec $srcContainer sha256sum $inC).Split(' ')[0].ToUpper()
    $hostBak="$store\Backups\$name.bak"; docker cp "${srcContainer}:$inC" $hostBak|Out-Null
    $shaH=(Get-FileHash $hostBak -Algorithm SHA256).Hash; if($shaC -ne $shaH){ throw 'SHA-256 mismatch container/host' }
    $enc="$hostBak.aesgcm"; $key="$store\RecoveryKeys\$name.key"
    $p=& $protect -Mode Protect -KeyProtection PortableKeyFile -InputPath $hostBak -KeyPath $key -OutputPath $enc
    $vv=& $protect -Mode Verify -KeyProtection PortableKeyFile -InputPath $enc -KeyPath $key
    $rec="$store\Backups\$name.recovered.bak"; $null=& $protect -Mode Restore -KeyProtection PortableKeyFile -InputPath $enc -KeyPath $key -OutputPath $rec
    $same=((Get-FileHash $rec -Algorithm SHA256).Hash -eq $shaH)
    Say ("backup {0}: {1} bytes sha256={2} verifyonly='{3}' aesVerified={4} recoveredIdentical={5}" -f $label,(Get-Item $hostBak).Length,$shaH.Substring(0,16),($v -join ' '),($p.Verified -and $vv.Verified),$same)
    if(-not ($same -and $vv.Verified)){ throw 'backup chain failed' }
    [ordered]@{name=$name;sha256=$shaH;recovered=$rec;bytes=(Get-Item $hostBak).Length}
}
function Restore-To-E2e([string]$recoveredHostFile,[string]$tag){
    $inE="/var/opt/mssql/backup/$tag.bak"; docker cp $recoveredHostFile "${e2e}:$inE"|Out-Null
    $r=Sql $e2e master "RESTORE VERIFYONLY FROM DISK = N'$inE' WITH CHECKSUM"; Say "e2e VERIFYONLY: $($r -join ' ')"
    $inE
}
function Restore-Db([string]$inE){
    $user=(E2eEnv)['DB_USERNAME']; if(-not $user){ throw 'no se pudo leer DB_USERNAME del backend E2E' }
    $null=Sql $e2e master "IF DB_ID(N'$DB') IS NOT NULL ALTER DATABASE [$DB] SET SINGLE_USER WITH ROLLBACK IMMEDIATE"
    $null=Sql $e2e master "RESTORE DATABASE [$DB] FROM DISK = N'$inE' WITH CHECKSUM, RECOVERY, REPLACE, MOVE N'vuelos_sanitarios' TO N'/var/opt/mssql/data/$DB.mdf', MOVE N'vuelos_sanitarios_log' TO N'/var/opt/mssql/data/${DB}_log.ldf'"
    $null=Sql $e2e master "ALTER DATABASE [$DB] SET RECOVERY SIMPLE; ALTER DATABASE [$DB] SET MULTI_USER"
    $null=Sql $e2e $DB "ALTER USER [$user] WITH LOGIN = [$user]"
}
function Flyway-Max{ (Sql $e2e $DB "SET NOCOUNT ON; SELECT CONCAT(MAX(CASE WHEN success=1 THEN TRY_CONVERT(int,version) END),'|failed=',SUM(CASE WHEN success=0 THEN 1 ELSE 0 END)) FROM dbo.flyway_schema_history")[0] }
function Check-Db([string]$phase){
    $c=Sql $e2e $DB "DBCC CHECKDB (N'$DB') WITH NO_INFOMSGS, ALL_ERRORMSGS; DBCC CHECKCONSTRAINTS WITH ALL_CONSTRAINTS; SELECT 'ok'"
    $bad=@($c|Where-Object{$_ -notmatch '^(ok|DBCC execution completed.*|\(.*rows? affected\))$'})
    Say "$phase DBCC CHECKDB/CHECKCONSTRAINTS: $(if($bad.Count){'ERRORES: '+($bad -join ' / ')}else{'sin errores'})"
    if($bad.Count){ throw "DBCC reported problems in $phase" }
}
function Dotenv{ $d=@{}; foreach($l in Get-Content "$repo\.env"){ if($l -match '^([A-Z_]+)=(.*)$'){ $d[$Matches[1]]=$Matches[2] } }; $d }

foreach($s in ($Stage -split ',' | ForEach-Object { [int]$_.Trim() })){
    switch($s){
    1 {
        Say '== 1. Estado de la habitual (sólo lectura) y cadena de respaldo'
        $h=Sql $hab vuelos_sanitarios "SET NOCOUNT ON; SELECT CONCAT(MAX(CASE WHEN success=1 THEN TRY_CONVERT(int,version) END),'|',COUNT(*),'|failed=',SUM(CASE WHEN success=0 THEN 1 ELSE 0 END)) FROM dbo.flyway_schema_history"
        Say "habitual Flyway (max|filas|fallidas): $($h[0])"; if($h[0] -notmatch '^47\|47\|failed=0$'){ throw 'la habitual no está en V47 limpio' }
        $b=Backup-Chain $hab vuelos_sanitarios 'habitual_v47'; $state.habitualBackup=$b; Save-State
    }
    2 {
        Say '== 2. Restauración aislada en la instancia E2E'
        $inE=Restore-To-E2e $state.habitualBackup.recovered "$($state.habitualBackup.name).recovered"
        Restore-Db $inE
        Say "restaurada en Flyway: $(Flyway-Max)"; Check-Db 'restauración V47'
        docker exec $e2e rm $inE|Out-Null
    }
    3 {
        Say '== 3. Siembra con el contrato V47 (imagen release V47)'
        if(-not $state.mark){ $state.mark='ens'+(Get-Date -Format 'HHmm'); $state.password='Ens-'+([Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(12))-replace '[/+=]',''); Save-State }
        $e=E2eEnv; $e['DB_URL']="jdbc:sqlserver://sqlserver:1433;databaseName=$DB;encrypt=true;trustServerCertificate=true"; $e['APP_PUBLIC_URL']='http://127.0.0.1:18090'; $e['MAIL_ENABLED']='false'
        Write-EnvFile $e "$Work\seed.env"
        docker volume rm -f $VOL 2>&1|Out-Null; $null=docker volume create $VOL
        $null=Native { docker run --rm --user root --entrypoint chown -v "${VOL}:/data/documents" $V47BackendImage 999:999 /data/documents } 'chown documents volume'
        try{
            Start-Backend $V47BackendImage "$Work\seed.env"
            Node-Env; $o=@(node (Join-Path $PSScriptRoot 'ensayo-sembrar-v47.cjs') 2>&1); $rc=$LASTEXITCODE
            $o|Select-Object -Last 8|ForEach-Object{ Say ("siembra: "+("$_".Substring(0,[Math]::Min(300,("$_").Length)))) }
            if($rc -ne 0){ throw 'la siembra falló' }
        } finally { Stop-Apps; Remove-Item "$Work\seed.env" -Force -ErrorAction SilentlyContinue }
    }
    4 {
        Say '== 4. Fotografía previa y diagnóstico previo sobre V47 sembrado'
        Node-Env; $o=@(node (Join-Path $PSScriptRoot 'ensayo-snapshot.cjs') "$Work\snap-pre.json" 2>&1); if($LASTEXITCODE -ne 0){ throw "snapshot pre failed: $($o|Select-Object -Last 3)" }; $o|Select-Object -Last 3|ForEach-Object{Say "snap-pre: $_"}
        $t=(Get-Content (Join-Path $PSScriptRoot 'prevalidate-migrations.ps1') -Raw).Replace("`r`n","`n"); $i=$t.IndexOf("@'`n")+3; $j=$t.IndexOf("`n'@",$i)
        $d=Sql $e2e $DB $t.Substring($i,$j-$i); $d|ForEach-Object{ Say "prevalidación: $_" }
        if(@($d|Where-Object{$_ -match '^ISSUE\|'}).Count){ throw 'el diagnóstico previo informa ISSUE' }
    }
    5 {
        Say '== 5. FULL de la ventana (de la restauración sembrada) y cadena AES'
        $b=Backup-Chain $e2e $DB 'ventana_v47'; $state.windowBackup=$b; Save-State
    }
    6 {
        Say '== 6. Bundle de migración construido desde la imagen release'
        $bundle="$Work\bundle"; Remove-Item $bundle -Recurse -Force -ErrorAction SilentlyContinue; New-Item -ItemType Directory "$bundle\classes","$bundle\libs" -Force|Out-Null
        $cn="relbundle-$([guid]::NewGuid().ToString('N').Substring(0,6))"; $null=docker create --name $cn $BackendImage
        try{ docker cp "${cn}:/app/app.jar" "$Work\release-app.jar"|Out-Null } finally { docker rm -f $cn|Out-Null }
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $z=[IO.Compression.ZipFile]::OpenRead("$Work\release-app.jar")
        try{
            foreach($e in $z.Entries){
                if($e.FullName -match '^BOOT-INF/classes/(db/|catalogos/)' -and $e.Name){ $t="$bundle\classes\"+($e.FullName -replace '^BOOT-INF/classes/','').Replace('/','\'); New-Item -ItemType Directory (Split-Path $t) -Force|Out-Null; [IO.Compression.ZipFileExtensions]::ExtractToFile($e,$t) }
                elseif($e.FullName -match '^BOOT-INF/lib/(flyway-core|flyway-sqlserver|mssql-jdbc|jackson-databind|jackson-core|jackson-annotations|jackson-dataformat-toml|slf4j-api)-[0-9].*\.jar$'){ [IO.Compression.ZipFileExtensions]::ExtractToFile($e,"$bundle\libs\$($e.Name)") }
            }
        } finally { $z.Dispose() }
        $libs=@(Get-ChildItem "$bundle\libs" -Filter *.jar); if($libs.Count -ne 8){ throw "se esperaban 8 librerías en el bundle y hay $($libs.Count): $($libs.Name -join ', ')" }
        $null=Native { javac --release 21 -cp "$bundle\libs\*" -d "$bundle\classes" (Join-Path $PSScriptRoot 'FlywayMigrationRunner.java') } 'javac runner'
        $m=@(Get-ChildItem "$bundle\classes\db\migration" -File); Say "bundle: $($m.Count) migraciones (SQL $(@($m|Where-Object Extension -eq '.sql').Count), clases $(@($m|Where-Object Extension -eq '.class').Count)), librerías: $($libs.Name -join ', ')"
        $zip="$Work\ops-flyway-bundle-v55.zip"; Remove-Item $zip -ErrorAction SilentlyContinue; Compress-Archive -LiteralPath "$bundle\classes","$bundle\libs" -DestinationPath $zip
        $state.bundleZipSha256=(Get-FileHash $zip -Algorithm SHA256).Hash; $state.bundle=$bundle; Save-State; Say "bundle zip sha256=$($state.bundleZipSha256)"
    }
    7 {
        Say '== 7. Ayudante de producción (copia con objetivo de ensayo): Validate y Migrate'
        $src=Get-Content (Join-Path $PSScriptRoot 'invoke-prepared-flyway-v55.ps1') -Raw
        $ensayoUrl="jdbc:sqlserver://sqlserver:1433;databaseName=$DB;encrypt=true;trustServerCertificate=true"
        $subs=@(
            @("docker inspect vuelos-sanitarios-backend-1","docker inspect $e2eBackend"),
            @("-ne 'vuelos-sanitarios'){","-ne 'vuelos-sanitarios-e2e'){"),
            @("docker inspect vuelos-sanitarios-frontend-1","docker inspect vuelos-sanitarios-e2e-frontend-1"),
            @("docker exec -i vuelos-sanitarios-sqlserver-1","docker exec -i $e2e"),
            @("-U sa -d vuelos_sanitarios -h -1","-U sa -d $DB -h -1"),
            @("if(`$values.DB_URL -ne 'jdbc:sqlserver://sqlserver:1433;databaseName=vuelos_sanitarios;encrypt=true;trustServerCertificate=true'){","`$values.DB_URL='$ensayoUrl'; if(`$values.DB_URL -ne '$ensayoUrl'){"),
            @("'--network','vuelos-sanitarios_internal'","'--network','$net'"))
        foreach($s2 in $subs){ $n=([regex]::Matches($src,[regex]::Escape($s2[0]))).Count; if($n -ne 1){ throw "la sustitución '$($s2[0])' coincide $n veces (debe ser 1)" }; $src=$src.Replace($s2[0],$s2[1]) }
        $copy="$Work\invoke-prepared-flyway-v55.ensayo.ps1"; Set-Content $copy $src -Encoding utf8
        $pw=(Get-Process -Id $PID).Path; $img=(docker image inspect $V47BackendImage --format '{{.Id}}')
        $o=@(& $pw -NoProfile -File $copy -BundlePath $state.bundle -RuntimeImage $img -Mode Validate *>&1); Say "Validate rc=$LASTEXITCODE : $(($o|Select-Object -Last 2) -join ' / ')"; if($LASTEXITCODE -ne 0){ throw 'Validate failed' }
        $t0=Get-Date
        $o=@(& $pw -NoProfile -File $copy -BundlePath $state.bundle -RuntimeImage $img -Mode Migrate -HabitualMigrationExplicitlyAuthorized *>&1); $rc=$LASTEXITCODE
        $o|ForEach-Object{ Say "Migrate: $_" }; if($rc -ne 0){ throw 'Migrate failed' }
        Say ("migración terminada en {0:N0} s; Flyway: {1}" -f ((Get-Date)-$t0).TotalSeconds,(Flyway-Max))
        if((Flyway-Max) -ne '55|failed=0'){ throw 'el historial no terminó en V55 limpio' }
    }
    8 {
        Say '== 8. Fotografía posterior, comparación y comprobaciones SQL'
        Node-Env; $o=@(node (Join-Path $PSScriptRoot 'ensayo-snapshot.cjs') "$Work\snap-post.json" "$Work\snap-pre.json" 2>&1); $rc=$LASTEXITCODE; $o|Select-Object -Last 14|ForEach-Object{Say "snap-post: $_"}; if($rc -ne 0){ throw 'la comparación de fotografías informó diferencias inesperadas' }
        Check-Db 'V55'
        $c=Sql $e2e $DB @"
SET NOCOUNT ON;
SELECT CONCAT('objetos|tablas=',(SELECT COUNT(*) FROM sys.tables WHERE name<>'flyway_schema_history'),'|pk=',(SELECT COUNT(*) FROM sys.key_constraints WHERE type='PK'),'|fk=',(SELECT COUNT(*) FROM sys.foreign_keys),'|check=',(SELECT COUNT(*) FROM sys.check_constraints),'|indices_unicos=',(SELECT COUNT(*) FROM sys.indexes WHERE is_unique=1 AND is_primary_key=0 AND type>0));
SELECT CONCAT('no_confiables|fk=',(SELECT COUNT(*) FROM sys.foreign_keys WHERE is_disabled=1 OR is_not_trusted=1),'|check=',(SELECT COUNT(*) FROM sys.check_constraints WHERE is_disabled=1 OR is_not_trusted=1),'|triggers_deshabilitados=',(SELECT COUNT(*) FROM sys.triggers WHERE parent_class=1 AND is_disabled=1));
SELECT CONCAT('trigger_auditoria|',name,'|deshabilitado=',is_disabled) FROM sys.triggers WHERE name='tr_eventos_auditoria_inmutable';
SELECT CONCAT('flyway|',version,'|',success,'|',script) FROM dbo.flyway_schema_history WHERE TRY_CONVERT(int,version)>=47 ORDER BY installed_rank;
SELECT CONCAT('correos|total=',COUNT(*),'|verificados=',SUM(CASE WHEN fecha_verificacion IS NOT NULL THEN 1 ELSE 0 END)) FROM dbo.correos_electronicos;
SELECT CONCAT('rutas|',estado_revision,'|',COUNT(*)) FROM dbo.rutas_vuelo GROUP BY estado_revision;
"@
        $c|ForEach-Object{ Say "sql: $_" }
    }
    9 {
        Say '== 9. Imágenes release con configuración tipo habitual (profile docker, MAIL_ENABLED=false)'
        Write-EnvFile (Habitual-like-env) "$Work\app.env"
        Start-Backend $BackendImage "$Work\app.env"
        $null=Native { docker run -d --name $FE --network $net --memory 64m -p 127.0.0.1:18091:80 $FrontendImage } 'frontend start'
        Start-Sleep 4
        $r=[ordered]@{}
        $r.health=(Invoke-RestMethod http://127.0.0.1:18090/actuator/health).status
        $r.frontendHtml=(Invoke-WebRequest http://127.0.0.1:18091/ -UseBasicParsing).StatusCode
        $r.badLoginViaProxy=(Invoke-WebRequest http://127.0.0.1:18091/api/auth/login -Method Post -ContentType application/json -Body '{"username":"no-existe","password":"invalida-123"}' -SkipHttpErrorCheck).StatusCode
        $dotenv=Dotenv
        $login=Invoke-WebRequest http://127.0.0.1:18091/api/auth/login -Method Post -ContentType application/json -Body (@{username=$dotenv.BOOTSTRAP_ADMIN_USERNAME;password=$dotenv.BOOTSTRAP_ADMIN_PASSWORD}|ConvertTo-Json) -SkipHttpErrorCheck
        $r.adminLoginViaProxy=$login.StatusCode
        if($login.StatusCode -eq 200){
            $tok=($login.Content|ConvertFrom-Json).accessToken; $hd=@{Authorization="Bearer $tok"}
            $me=Invoke-RestMethod http://127.0.0.1:18091/api/auth/me -Headers $hd
            $r.meFields=($me.PSObject.Properties.Name) -join ','
            $mail=@($me.correos ?? $me.emails ?? @()); $r.adminEmails=$mail.Count
            if($mail.Count){
                $r.adminEmailState=@($mail|ForEach-Object{ $_.verificacion }) -join ','
                $vr=Invoke-WebRequest "http://127.0.0.1:18091/api/auth/me/correos/$($mail[0].id)/verificacion" -Method Post -Headers $hd -SkipHttpErrorCheck
                $r.verificationRequestWithoutSmtp="$($vr.StatusCode) $($vr.Content.Substring(0,[Math]::Min(160,$vr.Content.Length)))"
            }
            $r.e2eClock=(Invoke-WebRequest http://127.0.0.1:18091/api/e2e/clock -Headers $hd -SkipHttpErrorCheck).StatusCode
            $r.flightsList=(Invoke-WebRequest http://127.0.0.1:18091/api/flights -Headers $hd -SkipHttpErrorCheck).StatusCode
        }
        $r.GetEnumerator()|ForEach-Object{ Say "humo: $($_.Key) = $($_.Value)" }
        $state.smokeHabitualLike=$r; Save-State
        if($r.health -ne 'UP' -or $r.frontendHtml -ne 200 -or $r.badLoginViaProxy -ne 401 -or $r.adminLoginViaProxy -ne 200){ throw 'el humo de las imágenes release falló' }
    }
    10 {
        Say '== 10. Prueba funcional (backend release con la configuración del ensayo: perfil e2e, SMTP de Mailpit)'
        $e=E2eEnv; $e['DB_URL']="jdbc:sqlserver://sqlserver:1433;databaseName=$DB;encrypt=true;trustServerCertificate=true"; $e['APP_PUBLIC_URL']='http://127.0.0.1:18090'; $e['MAIL_ENABLED']='true'
        Write-EnvFile $e "$Work\app-e2e.env"; Stop-Apps
        try{
            Start-Backend $BackendImage "$Work\app-e2e.env"
            Node-Env; $o=@(node (Join-Path $PSScriptRoot 'ensayo-funcional-v55.cjs') 2>&1); $rc=$LASTEXITCODE
            $o|Out-File "$Work\logs\funcional.log" -Encoding utf8; $o|Select-Object -Last 16|ForEach-Object{ Say ("funcional: "+("$_".Substring(0,[Math]::Min(300,("$_").Length)))) }
            Say "PASS en la salida: $(@($o|Where-Object{$_ -match '^PASS:'}).Count)"
            if($rc -ne 0){ throw 'la prueba funcional falló' }
        } finally { Stop-Apps; Remove-Item "$Work\app-e2e.env" -Force -ErrorAction SilentlyContinue }
    }
    11 {
        Say '== 11. Auditoría y consistencia transaccional'
        $a=Sql $e2e $DB @"
SET NOCOUNT ON;
SELECT CONCAT('auditoria|eventos=',COUNT(*),'|sin_fecha=',SUM(CASE WHEN fecha_ocurrencia IS NULL THEN 1 ELSE 0 END)) FROM dbo.eventos_auditoria;
SELECT CONCAT('auditoria_ruta|',operacion,'|',COUNT(*)) FROM dbo.eventos_auditoria WHERE tipo_entidad=N'FLIGHT_ROUTE' GROUP BY operacion ORDER BY operacion;
SELECT CONCAT('huerfanos|rutas_sin_vuelo=',(SELECT COUNT(*) FROM dbo.rutas_vuelo r WHERE NOT EXISTS (SELECT 1 FROM dbo.vuelos v WHERE v.id_vuelos=r.id_vuelos)),'|verificaciones_sin_correo=',(SELECT COUNT(*) FROM dbo.verificaciones_correo x WHERE NOT EXISTS (SELECT 1 FROM dbo.correos_electronicos c WHERE c.id_correos_electronicos=x.id_correos_electronicos)),'|rutas_vigentes_duplicadas=',(SELECT COUNT(*) FROM (SELECT id_vuelos FROM dbo.rutas_vuelo WHERE es_version_actual=1 GROUP BY id_vuelos HAVING COUNT(*)>1) d));
"@
        $a|ForEach-Object{ Say "sql: $_" }
        $trig=Sql $e2e $DB "SET NOCOUNT ON; BEGIN TRY BEGIN TRAN; UPDATE TOP (1) dbo.eventos_auditoria SET operacion=operacion; COMMIT; SELECT 'PERMITIDO'; END TRY BEGIN CATCH IF @@TRANCOUNT>0 ROLLBACK; SELECT CONCAT('RECHAZADO|',ERROR_NUMBER()); END CATCH"
        Say "trigger de auditoría ante UPDATE: $($trig -join ' ')"; if(($trig -join '') -notmatch 'RECHAZADO'){ throw 'el trigger de auditoría no rechazó el UPDATE' }
        Check-Db 'tras la prueba funcional'
    }
    12 {
        Say '== 12. Recuperación: restaurar el FULL de la ventana y volver a las imágenes V47'
        Stop-Apps
        $inE=Restore-To-E2e $state.windowBackup.recovered "$($state.windowBackup.name).recovered"
        $before=Flyway-Max
        Restore-Db $inE
        Say "tras restaurar: Flyway $before -> $(Flyway-Max)"; if((Flyway-Max) -ne '47|failed=0'){ throw 'la restauración no devolvió V47' }
        Check-Db 'restauración desde el FULL de la ventana'
        Node-Env; $o=@(node (Join-Path $PSScriptRoot 'ensayo-snapshot.cjs') "$Work\snap-restored.json" "$Work\snap-pre.json" 2>&1); $rc=$LASTEXITCODE; $o|Select-Object -Last 6|ForEach-Object{Say "snap-restaurada vs previa: $_"}
        if($rc -ne 0){ throw 'la base restaurada difiere de la fotografía previa' }
        Write-EnvFile (Habitual-like-env) "$Work\app-v47.env"
        try{
            Start-Backend $V47BackendImage "$Work\app-v47.env"
            $null=Native { docker run -d --name $FE --network $net --memory 64m -p 127.0.0.1:18091:80 $V47FrontendImage } 'frontend v47 start'; Start-Sleep 4
            $dotenv=Dotenv
            $login=Invoke-WebRequest http://127.0.0.1:18091/api/auth/login -Method Post -ContentType application/json -Body (@{username=$dotenv.BOOTSTRAP_ADMIN_USERNAME;password=$dotenv.BOOTSTRAP_ADMIN_PASSWORD}|ConvertTo-Json) -SkipHttpErrorCheck
            $flights=if($login.StatusCode -eq 200){ (Invoke-WebRequest http://127.0.0.1:18091/api/flights -Headers @{Authorization="Bearer $(($login.Content|ConvertFrom-Json).accessToken)"} -SkipHttpErrorCheck).StatusCode }else{ 'n/a' }
            Say "imágenes V47 sobre la base restaurada: health=$((Invoke-RestMethod http://127.0.0.1:18090/actuator/health).status) html=$((Invoke-WebRequest http://127.0.0.1:18091/ -UseBasicParsing).StatusCode) loginAdmin=$($login.StatusCode) GET /api/flights=$flights"
            if($login.StatusCode -ne 200){ throw 'el administrador no pudo entrar en V47 tras la recuperación' }
        } finally { Stop-Apps; Remove-Item "$Work\app-v47.env" -Force -ErrorAction SilentlyContinue }
        docker exec $e2e rm $inE|Out-Null
    }
    14 {
        Say '== 14. Ensayo negativo con el ayudante: un documento inactivo sin versiones detiene V52 (THROW 51052)'
        $copy="$Work\invoke-prepared-flyway-v55.ensayo.ps1"; if(-not (Test-Path $copy)){ throw 'ejecute antes la etapa 7 (crea la copia del ayudante)' }
        $inE=Restore-To-E2e $state.habitualBackup.recovered "$($state.habitualBackup.name).recovered"; Restore-Db $inE; docker exec $e2e rm $inE|Out-Null
        Say "restauración limpia: Flyway $(Flyway-Max)"
        $null=Sql $e2e $DB @"
SET NOCOUNT ON;
INSERT INTO vuelos (codigo_vuelo, id_tipos_vuelo, motivo_vuelo, id_usuario_creador, fecha_creacion, fecha_actualizacion)
SELECT TOP 1 N'V-NEGATIVO', (SELECT TOP 1 id_tipos_vuelo FROM tipos_vuelo), N'Vuelo del ensayo negativo', id_usuarios, SYSDATETIME(), SYSDATETIME() FROM usuarios ORDER BY id_usuarios;
INSERT INTO documentos_vuelo (nombre_documento, esta_activo, fecha_creacion, id_vuelos, id_tipos_documento)
SELECT N'Documento inactivo sin versiones', 0, SYSDATETIME(), (SELECT id_vuelos FROM vuelos WHERE codigo_vuelo=N'V-NEGATIVO'), (SELECT TOP 1 id_tipos_documento FROM tipos_documento);
"@
        $t=(Get-Content (Join-Path $PSScriptRoot 'prevalidate-migrations.ps1') -Raw).Replace("`r`n","`n"); $i=$t.IndexOf("@'`n")+3; $j=$t.IndexOf("`n'@",$i)
        $d=Sql $e2e $DB $t.Substring($i,$j-$i); $d|Where-Object{$_ -match '^(ISSUE|WARNING)\|'}|ForEach-Object{ Say "prevalidación: $_" }
        if(-not @($d|Where-Object{$_ -match '^ISSUE\|hay documentos inactivos sin versiones'}).Count){ throw 'el diagnóstico previo no señaló el documento conflictivo' }
        $pw=(Get-Process -Id $PID).Path; $img=(docker image inspect $V47BackendImage --format '{{.Id}}')
        $o=@(& $pw -NoProfile -File $copy -BundlePath $state.bundle -RuntimeImage $img -Mode Migrate -HabitualMigrationExplicitlyAuthorized *>&1); $rc=$LASTEXITCODE
        $o|Where-Object{ "$_" -match '51052|inactivos|Migration|failed|ERROR|WARNING' }|Select-Object -First 8|ForEach-Object{ Say ("Migrate (esperado: falla): "+("$_".Substring(0,[Math]::Min(260,("$_").Length)))) }
        Say "rc del ayudante = $rc"; if($rc -eq 0){ throw 'la migración debía detenerse en V52' }
        if(-not (($o|Out-String) -match '51052|inactivos')){ throw 'el diagnóstico del ayudante no identifica la causa' }
        $st=Sql $e2e $DB "SET NOCOUNT ON; SELECT CONCAT('flyway_max_ok=',MAX(CASE WHEN success=1 THEN TRY_CONVERT(int,version) END),'|filas_fallidas=',SUM(CASE WHEN success=0 THEN 1 ELSE 0 END)) FROM dbo.flyway_schema_history; SELECT CONCAT('documentos_vuelo_columnas=',COUNT(*)) FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.documentos_vuelo'); SELECT CONCAT('documento_conflictivo_intacto=',COUNT(*)) FROM dbo.documentos_vuelo WHERE nombre_documento=N'Documento inactivo sin versiones' AND esta_activo=0"
        $st|ForEach-Object{ Say "estado tras el fallo: $_" }
        if($st[0] -ne 'flyway_max_ok=51|filas_fallidas=0'){ throw 'el historial debía quedar en V51 sin filas fallidas' }
        # La base quedó en V51: el ayudante NO continúa (sólo migra una base exactamente en V47). La salida prevista es restaurar el FULL de la ventana.
        $o=@(& $pw -NoProfile -File $copy -BundlePath $state.bundle -RuntimeImage $img -Mode Migrate -HabitualMigrationExplicitlyAuthorized *>&1); $rc=$LASTEXITCODE
        Say "reintento sobre la base en V51: rc=$rc ($((($o|Out-String) -split "`n"|Select-String 'not exactly at Flyway V47'|Select-Object -First 1)))"
        if($rc -eq 0 -or -not (($o|Out-String) -match 'not exactly at Flyway V47')){ throw 'el ayudante debía negarse a migrar una base que no está en V47' }
        $inE=Restore-To-E2e $state.habitualBackup.recovered "$($state.habitualBackup.name).recovered"; Restore-Db $inE; docker exec $e2e rm $inE|Out-Null
        Say "recuperación: restaurado el FULL anterior a la migración -> Flyway $(Flyway-Max); se repite sin el dato conflictivo"
        $o=@(& $pw -NoProfile -File $copy -BundlePath $state.bundle -RuntimeImage $img -Mode Migrate -HabitualMigrationExplicitlyAuthorized *>&1); $rc=$LASTEXITCODE
        Say "migración tras la recuperación: rc=$rc; Flyway $(Flyway-Max)"; if($rc -ne 0 -or (Flyway-Max) -ne '55|failed=0'){ throw 'la migración tras la recuperación no llegó a V55' }
        Check-Db 'tras recuperar y repetir'
    }
    13 {
        Say '== 13. Limpieza (sólo objetos del ensayo)'
        Stop-Apps; docker volume rm -f $VOL 2>&1|Out-Null
        $null=Sql $e2e master "IF DB_ID(N'$DB') IS NOT NULL BEGIN ALTER DATABASE [$DB] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$DB]; END"
        Remove-Item "$Work\*.env" -Force -ErrorAction SilentlyContinue
        Say "bases de ensayo restantes: $((Sql $e2e master "SELECT COUNT(*) FROM sys.databases WHERE name=N'$DB'")[0])"
    }
    }
}
Say 'ensayo: etapas solicitadas completadas'
