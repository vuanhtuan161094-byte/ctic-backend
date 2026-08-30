param(
    [Parameter(Mandatory = $true)][string]$ServerInstance,
    [Parameter(Mandatory = $true)][string]$BackupFile,
    [Parameter(Mandatory = $true)][string]$RestoreDatabaseName,
    [string]$DataDirectory,
    [Parameter(Mandatory = $true)][string]$StorageBackupRoot,
    [Parameter(Mandatory = $true)][string]$StorageRestoreRoot,
    [string]$SqlUsername,
    [switch]$TrustServerCertificate
)

$ErrorActionPreference = 'Stop'
if ($RestoreDatabaseName -notmatch '_(restore_test|dr_test)$') { throw 'RestoreDatabaseName must end with _restore_test or _dr_test.' }
if ($SqlUsername -and $SqlUsername -notmatch '^[A-Za-z0-9_.\\\-]+$') { throw 'SqlUsername contains unsupported characters.' }
if (-not (Test-Path -LiteralPath $BackupFile -PathType Leaf)) { throw "Backup file not found: $BackupFile" }
if (-not (Test-Path -LiteralPath $StorageBackupRoot -PathType Container)) { throw "Storage backup not found: $StorageBackupRoot" }

$sqlcmd = Get-Command sqlcmd.exe -ErrorAction SilentlyContinue
if (-not $sqlcmd) { $sqlcmd = Get-Command sqlcmd -ErrorAction SilentlyContinue }
if (-not $sqlcmd) { throw 'sqlcmd is required for the SQL Server restore drill.' }

$previousSqlcmdPassword = $env:SQLCMDPASSWORD
$passwordBstr = [IntPtr]::Zero

try {
    $sqlcmdBaseArgs = @('-S', $ServerInstance)
    if ($SqlUsername) {
        $securePassword = Read-Host "SQL password for $SqlUsername" -AsSecureString
        $passwordBstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
        $env:SQLCMDPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordBstr)
        $sqlcmdBaseArgs += @('-U', $SqlUsername)
    }
    else {
        $sqlcmdBaseArgs += '-E'
    }
    if ($TrustServerCertificate) { $sqlcmdBaseArgs += '-C' }

    if (-not $DataDirectory) {
        $defaultDataPath = & $sqlcmd.Source @sqlcmdBaseArgs -b -h -1 -W -Q "SET NOCOUNT ON; SELECT CONVERT(nvarchar(4000), SERVERPROPERTY('InstanceDefaultDataPath'));"
        if ($LASTEXITCODE -ne 0) { throw 'Could not resolve SQL Server default data directory.' }
        $DataDirectory = ($defaultDataPath | Where-Object { $_ -and $_.Trim() } | Select-Object -First 1).Trim()
        if (-not $DataDirectory) { throw 'SQL Server did not report InstanceDefaultDataPath; pass -DataDirectory explicitly.' }
    }

    $fileListQuery = "SET NOCOUNT ON; RESTORE FILELISTONLY FROM DISK = N'$($BackupFile.Replace("'", "''"))';"
    $fileListRaw = & $sqlcmd.Source @sqlcmdBaseArgs -b -W -s '|' -Q $fileListQuery
    if ($LASTEXITCODE -ne 0) { throw 'RESTORE FILELISTONLY failed.' }
    $rows = @($fileListRaw | Where-Object { $_ -match '\|' })
    $dataRow = $rows | Where-Object { $_ -match '\|D\|' } | Select-Object -First 1
    $logRow = $rows | Where-Object { $_ -match '\|L\|' } | Select-Object -First 1
    if (-not $dataRow -or -not $logRow) { throw 'Could not determine logical data/log names from backup.' }
    $dataLogical = ($dataRow -split '\|')[0].Trim()
    $logLogical = ($logRow -split '\|')[0].Trim()

    New-Item -ItemType Directory -Force -Path $DataDirectory | Out-Null
    $dataFile = Join-Path $DataDirectory "$RestoreDatabaseName.mdf"
    $logFile = Join-Path $DataDirectory "${RestoreDatabaseName}_log.ldf"

    $sql = "IF DB_ID(N'$($RestoreDatabaseName.Replace("'", "''"))') IS NOT NULL THROW 51000, 'Restore-test database already exists; drop it explicitly before rerunning the drill.', 1; RESTORE DATABASE [$RestoreDatabaseName] FROM DISK=N'$($BackupFile.Replace("'", "''"))' WITH MOVE N'$($dataLogical.Replace("'", "''"))' TO N'$($dataFile.Replace("'", "''"))', MOVE N'$($logLogical.Replace("'", "''"))' TO N'$($logFile.Replace("'", "''"))', RECOVERY, CHECKSUM; ALTER DATABASE [$RestoreDatabaseName] SET AUTO_CLOSE OFF; SELECT DB_NAME(database_id), state_desc FROM sys.databases WHERE name=N'$($RestoreDatabaseName.Replace("'", "''"))';"
    & $sqlcmd.Source @sqlcmdBaseArgs -b -Q $sql
    if ($LASTEXITCODE -ne 0) { throw 'Database restore failed.' }

    $snapshotRoot = [System.IO.Path]::GetFullPath($StorageBackupRoot)
    $storageSource = Join-Path $snapshotRoot 'storage'
    if (-not (Test-Path -LiteralPath $storageSource -PathType Container)) { throw 'Storage backup snapshot is missing the storage data directory.' }
    $storageDestination = [System.IO.Path]::GetFullPath($StorageRestoreRoot)
    if ((Test-Path -LiteralPath $storageDestination) -and (Get-ChildItem -LiteralPath $storageDestination -Force | Select-Object -First 1)) {
        throw 'StorageRestoreRoot must be empty for an isolated restore drill.'
    }
    New-Item -ItemType Directory -Force -Path $storageDestination | Out-Null
    & robocopy.exe $storageSource $storageDestination /E /COPY:DAT /DCOPY:DAT /R:2 /W:2 /XJ /NFL /NDL /NP
    if ($LASTEXITCODE -ge 8) { throw "Storage restore failed with robocopy exit code $LASTEXITCODE" }

    Write-Host 'RESTORE DRILL: PASS - database and storage restored into isolated targets.'
    Write-Host 'IMPORTANT: Perform application smoke verification, then drop the restore-test DB and delete restored storage manually.'
}
finally {
    if ($passwordBstr -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordBstr)
    }
    if ($null -eq $previousSqlcmdPassword) { Remove-Item Env:SQLCMDPASSWORD -ErrorAction SilentlyContinue }
    else { $env:SQLCMDPASSWORD = $previousSqlcmdPassword }
}
