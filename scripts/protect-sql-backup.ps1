#requires -Version 7.4
<#
.SYNOPSIS
  Protects a SQL backup with AES-256-GCM and a DPAPI or portable key file.
.DESCRIPTION
  Never deletes or overwrites the original backup. Keys stay outside Git.
  DPAPI requires the same Windows profile. PortableKeyFile stores a random binary
  key in the explicitly chosen permanent key directory; protect it with strict ACLs
  and keep it separate from the ciphertext. Never print or commit the key.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateSet('Protect','Verify','Restore')][string]$Mode,
    [Parameter(Mandatory)][string]$InputPath,
    [Parameter(Mandatory)][string]$KeyPath,
    [string]$OutputPath,
    [ValidateSet('DPAPI','PortableKeyFile')][string]$KeyProtection='DPAPI'
)
$ErrorActionPreference = 'Stop'
if ($KeyProtection -eq 'DPAPI' -and -not $IsWindows) { throw 'Windows DPAPI is required for this key mode.' }
if (-not [System.Security.Cryptography.AesGcm]::IsSupported) { throw 'AES-GCM is unavailable.' }
$entropy = [System.Text.Encoding]::UTF8.GetBytes('VuelosSanitarios.SQLBackup.AESGCM.v1')
$scope = if ($KeyProtection -eq 'DPAPI') { [System.Security.Cryptography.DataProtectionScope]::CurrentUser } else { $null }
$keyDescription = if ($KeyProtection -eq 'DPAPI') {
    'Windows DPAPI CurrentUser; same Windows profile required'
} else {
    'Portable AES-256 key file; strict filesystem ACL; no Windows profile dependency'
}

function Write-NewBytes([string]$Path, [byte[]]$Bytes) {
    $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::CreateNew,
        [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
    try { $stream.Write($Bytes, 0, $Bytes.Length); $stream.Flush($true) }
    finally { $stream.Dispose() }
}

function Read-VerifiedPlaintext([string]$EnvelopePath, [string]$ProtectedKeyPath) {
    $envelope = [System.IO.File]::ReadAllText($EnvelopePath) | ConvertFrom-Json
    if ($envelope.format -ne 'VS-SQLBACKUP-AES256GCM-1') { throw 'Unsupported encrypted backup format.' }
    $storedKey = [System.IO.File]::ReadAllBytes($ProtectedKeyPath)
    try {
        $key = if ($KeyProtection -eq 'DPAPI') {
            [System.Security.Cryptography.ProtectedData]::Unprotect($storedKey, $entropy, $scope)
        } else {
            if ($storedKey.Length -ne 32) { throw 'A portable AES-256 key must contain exactly 32 bytes.' }
            $storedKey.Clone()
        }
    } finally { [Array]::Clear($storedKey, 0, $storedKey.Length) }
    $ciphertext = [Convert]::FromBase64String($envelope.ciphertext)
    $plain = [byte[]]::new($ciphertext.Length)
    $aes = [System.Security.Cryptography.AesGcm]::new($key, 16)
    try {
        $aes.Decrypt([Convert]::FromBase64String($envelope.nonce), $ciphertext,
            [Convert]::FromBase64String($envelope.tag), $plain,
            [System.Text.Encoding]::UTF8.GetBytes($envelope.metadata))
        $metadata = $envelope.metadata | ConvertFrom-Json
        if ($metadata.keyProtection -cne $keyDescription) { throw 'The selected key mode does not match the authenticated metadata.' }
        $actualHash = [Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData($plain))
        if ($actualHash -cne $metadata.sha256 -or $plain.Length -ne $metadata.bytes) {
            throw 'Decrypted backup does not match the authenticated manifest.'
        }
        return [pscustomobject]@{ Bytes=$plain; Metadata=$metadata }
    } catch {
        [Array]::Clear($plain, 0, $plain.Length)
        throw
    } finally {
        $aes.Dispose()
        [Array]::Clear($key, 0, $key.Length)
    }
}

$inputFull = (Resolve-Path -LiteralPath $InputPath).Path
$keyFull = [System.IO.Path]::GetFullPath($KeyPath)
if ($Mode -eq 'Protect') {
    if (-not $OutputPath) { throw 'Protect requires OutputPath.' }
    $outFull = [System.IO.Path]::GetFullPath($OutputPath)
    if (Test-Path -LiteralPath $outFull) { throw 'Encrypted output already exists; refusing overwrite.' }
    if (Test-Path -LiteralPath $keyFull) { throw 'Protected key already exists; refusing key reuse.' }
    if (-not (Test-Path -LiteralPath (Split-Path $keyFull -Parent) -PathType Container)) {
        throw 'Create a protected recovery-key directory first.'
    }
    $plain = [System.IO.File]::ReadAllBytes($inputFull)
    $key = [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
    $nonce = [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(12)
    $tag = [byte[]]::new(16)
    $ciphertext = [byte[]]::new($plain.Length)
    $metadata = [ordered]@{
        file=[System.IO.Path]::GetFileName($inputFull)
        bytes=$plain.Length
        sha256=[Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData($plain))
        createdUtc=[DateTime]::UtcNow.ToString('o')
        keyProtection=$keyDescription
    } | ConvertTo-Json -Compress
    $aes = [System.Security.Cryptography.AesGcm]::new($key, 16)
    try {
        $aes.Encrypt($nonce, $plain, $ciphertext, $tag, [System.Text.Encoding]::UTF8.GetBytes($metadata))
        $storedKey = if ($KeyProtection -eq 'DPAPI') {
            [System.Security.Cryptography.ProtectedData]::Protect($key, $entropy, $scope)
        } else { $key.Clone() }
        try { Write-NewBytes $keyFull $storedKey }
        finally { [Array]::Clear($storedKey, 0, $storedKey.Length) }
        $envelope = [ordered]@{
            format='VS-SQLBACKUP-AES256GCM-1'; metadata=$metadata
            nonce=[Convert]::ToBase64String($nonce); tag=[Convert]::ToBase64String($tag)
            ciphertext=[Convert]::ToBase64String($ciphertext)
        } | ConvertTo-Json -Compress
        Write-NewBytes $outFull ([System.Text.Encoding]::UTF8.GetBytes($envelope))
        $verified = Read-VerifiedPlaintext $outFull $keyFull
        [Array]::Clear($verified.Bytes, 0, $verified.Bytes.Length)
        [pscustomobject]@{Mode=$Mode;EncryptedFile=$outFull;OriginalSHA256=($metadata|ConvertFrom-Json).sha256;Verified=$true;KeyProtection=$keyDescription}
    } finally {
        $aes.Dispose()
        [Array]::Clear($plain, 0, $plain.Length)
        [Array]::Clear($key, 0, $key.Length)
    }
} else {
    $verified = Read-VerifiedPlaintext $inputFull $keyFull
    try {
        if ($Mode -eq 'Restore') {
            if (-not $OutputPath) { throw 'Restore requires OutputPath.' }
            $outFull = [System.IO.Path]::GetFullPath($OutputPath)
            Write-NewBytes $outFull $verified.Bytes
        }
        [pscustomobject]@{Mode=$Mode;OriginalSHA256=$verified.Metadata.sha256;Bytes=$verified.Metadata.bytes;Verified=$true;RestoredFile=$outFull}
    } finally { [Array]::Clear($verified.Bytes, 0, $verified.Bytes.Length) }
}
