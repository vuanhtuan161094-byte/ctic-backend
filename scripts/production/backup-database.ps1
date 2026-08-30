param(
    [Parameter(Mandatory = $true)][string]$ServerInstance,
    [Parameter(Mandatory = $true)][string]$DatabaseName,
    [Parameter(Mandatory = $true)][string]$BackupFile,
    [string]$SqlUsername,
    [switch]$TrustServerCertificate
)

$ErrorActionPreference = 'Stop'

if ($DatabaseName -notmatch '^[A-Za-z0-9_\-]+$') {
    throw 'DatabaseName may contain only letters, digits, underscore, and hyphen.'
}
if ($SqlUsername -and $SqlUsername -notmatch '^[A-Za-z0-9_.\\\-]+$') {
    throw 'SqlUsername contains unsupported characters.'
}

$backupFullPath = [System.IO.Path]::GetFullPath($BackupFile)
if ($backupFullPath.Contains("'")) {
    throw "BackupFile must not contain a single quote character."
}

$backupDirectory = Split-Path -Parent $backupFullPath
if (-not $backupDirectory) {
    throw 'BackupFile must include a directory.'
}
New-Item -ItemType Directory -Force -Path $backupDirectory | Out-Null

$sqlcmd = Get-Command sqlcmd.exe -ErrorAction SilentlyContinue
if (-not $sqlcmd) { $sqlcmd = Get-Command sqlcmd -ErrorAction SilentlyContinue }
if (-not $sqlcmd) { throw 'sqlcmd is required for the SQL Server backup drill.' }

$sqlScript = Join-Path $PSScriptRoot 'backup-database.sql'
if (-not (Test-Path -LiteralPath $sqlScript -PathType Leaf)) {
    throw "Backup SQL script not found: $sqlScript"
}

$previousDatabaseName = $env:DatabaseName
$previousBackupFile = $env:BackupFile
$previousSqlcmdPassword = $env:SQLCMDPASSWORD
$passwordBstr = [IntPtr]::Zero

try {
    # SQLCMD shell variables avoid Windows PowerShell quoting problems with -v.
    $env:DatabaseName = $DatabaseName
    $env:BackupFile = $backupFullPath

    $arguments = @('-S', $ServerInstance)
    if ($SqlUsername) {
        $securePassword = Read-Host "SQL password for $SqlUsername" -AsSecureString
        $passwordBstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
        $env:SQLCMDPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordBstr)
        $arguments += @('-U', $SqlUsername)
    }
    else {
        $arguments += '-E'
    }
    $arguments += '-b'
    if ($TrustServerCertificate) { $arguments += '-C' }
    $arguments += @('-i', $sqlScript)

    & $sqlcmd.Source @arguments
    if ($LASTEXITCODE -ne 0) {
        throw "SQL Server backup/VERIFYONLY failed with sqlcmd exit code $LASTEXITCODE."
    }

    if (-not (Test-Path -LiteralPath $backupFullPath -PathType Leaf)) {
        throw "SQL Server reported success but the backup file is not visible at: $backupFullPath. Verify SQL Server service-account access and backup location."
    }

    Write-Host "DATABASE BACKUP: PASS - $DatabaseName -> $backupFullPath"
}
finally {
    if ($passwordBstr -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordBstr)
    }
    if ($null -eq $previousDatabaseName) { Remove-Item Env:DatabaseName -ErrorAction SilentlyContinue }
    else { $env:DatabaseName = $previousDatabaseName }

    if ($null -eq $previousBackupFile) { Remove-Item Env:BackupFile -ErrorAction SilentlyContinue }
    else { $env:BackupFile = $previousBackupFile }

    if ($null -eq $previousSqlcmdPassword) { Remove-Item Env:SQLCMDPASSWORD -ErrorAction SilentlyContinue }
    else { $env:SQLCMDPASSWORD = $previousSqlcmdPassword }
}
