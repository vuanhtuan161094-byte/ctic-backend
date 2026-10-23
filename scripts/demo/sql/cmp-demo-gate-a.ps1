param(
    [switch]$Apply,
    [switch]$ElevatedChild,
    [string]$CredentialPath
)

$ErrorActionPreference = 'Stop'
$expectedMachine = 'CTIC-LP-054'
$expectedInstance = 'SQLEXPRESS'
$expectedLogin = 'CTIC-LP-054\Administrator'
$expectedDatabase = 'CTIC_CMP_DEMO_2026'
$expectedAppLogin = 'CMP_DEMO_APP'
$expectedMigratorLogin = 'CMP_DEMO_MIGRATOR'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
$bootstrapPath = Join-Path $PSScriptRoot '01-bootstrap-cmp-demo-2026.sql'
$CredentialPath = if ([string]::IsNullOrWhiteSpace($CredentialPath)) {
    Join-Path $env:LOCALAPPDATA 'CMP\DEMO\sql-credentials.json'
} else { [IO.Path]::GetFullPath($CredentialPath) }
$logRoot = Join-Path (Split-Path -Parent $repoRoot) 'artifacts\sql\gate-a'
New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
$logPath = Join-Path $logRoot ("CMP_GATE_A_{0}_{1}.log" -f (Get-Date -Format 'yyyyMMdd_HHmmss'), ([guid]::NewGuid().ToString('N').Substring(0, 8)))
$script:VerifiedBootstrapStatus = $null
$script:VerifiedBackupPath = $null

function Write-Log {
    param([Parameter(Mandatory = $true)][string]$Message)
    $line = '[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-ddTHH:mm:ss.fffK'), $Message
    Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
    Write-Output $line
}

function Invoke-ScalarQuery {
    param(
        [Parameter(Mandatory = $true)][System.Data.SqlClient.SqlConnection]$Connection,
        [Parameter(Mandatory = $true)][string]$Query
    )
    $command = $Connection.CreateCommand()
    $command.CommandTimeout = 30
    $command.CommandText = $Query
    try { return $command.ExecuteScalar() }
    finally { $command.Dispose() }
}

function Invoke-ReaderQuery {
    param(
        [Parameter(Mandatory = $true)][System.Data.SqlClient.SqlConnection]$Connection,
        [Parameter(Mandatory = $true)][string]$Query,
        [hashtable]$Parameters = @{}
    )
    $command = $Connection.CreateCommand()
    $command.CommandTimeout = 30
    $command.CommandText = $Query
    foreach ($name in $Parameters.Keys) {
        $parameter = $command.Parameters.Add("@$name", [Data.SqlDbType]::NVarChar, 128)
        $parameter.Value = [string]$Parameters[$name]
    }
    $reader = $null
    try {
        $reader = $command.ExecuteReader()
        while ($reader.Read()) {
            $row = [ordered]@{}
            for ($index = 0; $index -lt $reader.FieldCount; $index++) {
                $row[$reader.GetName($index)] = if ($reader.IsDBNull($index)) { $null } else { $reader.GetValue($index) }
            }
            if ($row.Contains('gate_status')) { $script:VerifiedBootstrapStatus = [string]$row['gate_status'] }
            if ($row.Contains('verified_backup_path')) { $script:VerifiedBackupPath = [string]$row['verified_backup_path'] }
            Write-Log ('SQL_RESULT ' + ($row | ConvertTo-Json -Compress -Depth 5))
        }
        while ($reader.NextResult()) {
            while ($reader.Read()) {
                $row = [ordered]@{}
                for ($index = 0; $index -lt $reader.FieldCount; $index++) {
                    $row[$reader.GetName($index)] = if ($reader.IsDBNull($index)) { $null } else { $reader.GetValue($index) }
                }
                if ($row.Contains('gate_status')) { $script:VerifiedBootstrapStatus = [string]$row['gate_status'] }
                if ($row.Contains('verified_backup_path')) { $script:VerifiedBackupPath = [string]$row['verified_backup_path'] }
                Write-Log ('SQL_RESULT ' + ($row | ConvertTo-Json -Compress -Depth 5))
            }
        }
    }
    finally {
        if ($reader) { $reader.Dispose() }
        $command.Dispose()
    }
}

function New-DemoPassword {
    $bytes = [byte[]]::new(48)
    $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
    return ([Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_') + 'Aa1!')
}

function Ensure-DemoCredentials {
    $directory = Split-Path -Parent $CredentialPath
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    $currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $stored = $null
    if (Test-Path -LiteralPath $CredentialPath -PathType Leaf) {
        $stored = Get-Content -LiteralPath $CredentialPath -Raw | ConvertFrom-Json
    }
    $ownerSid = if ($stored.ownerSid -match '^S-1-[0-9-]+$') { [string]$stored.ownerSid } else { $currentSid }
    . (Join-Path $PSScriptRoot 'cmp-demo-credential-acl.ps1')
    Set-CmpDemoCredentialAcl -DirectoryPath $directory -CredentialFilePath $CredentialPath -OwnerSid $ownerSid
    if (-not (Test-Path -LiteralPath $CredentialPath -PathType Leaf)) {
        $secrets = [ordered]@{
            schema = 'cmp-demo-sql-credentials/v1'
            ownerSid = $ownerSid
            appLogin = $expectedAppLogin
            appPassword = New-DemoPassword
            migratorLogin = $expectedMigratorLogin
            migratorPassword = New-DemoPassword
            createdAt = (Get-Date).ToUniversalTime().ToString('o')
        }
        $temporary = $CredentialPath + '.' + [guid]::NewGuid().ToString('N') + '.tmp'
        [IO.File]::WriteAllText($temporary, ($secrets | ConvertTo-Json -Depth 3), [Text.UTF8Encoding]::new($false))
        try {
            [IO.File]::Move($temporary, $CredentialPath)
        }
        catch {
            Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
            throw
        }
        $stored = $secrets
    }
    Set-CmpDemoCredentialAcl -DirectoryPath $directory -CredentialFilePath $CredentialPath -OwnerSid $ownerSid
    if ($stored.schema -ne 'cmp-demo-sql-credentials/v1' -or
        $stored.appLogin -ne $expectedAppLogin -or
        $stored.migratorLogin -ne $expectedMigratorLogin -or
        ([string]$stored.appPassword).Length -lt 32 -or
        ([string]$stored.migratorPassword).Length -lt 32) {
        throw 'External DEMO SQL credential file is invalid; no SQL command was sent.'
    }
    return $stored
}

function Get-IsElevated {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function New-GateConnectionString {
    # Windows PowerShell adapts this IDictionary: use SQL keywords, not CLR property names.
    $builder = [System.Data.SqlClient.SqlConnectionStringBuilder]::new()
    $builder['Data Source'] = 'lpc:.\SQLEXPRESS'
    $builder['Initial Catalog'] = 'master'
    $builder['Integrated Security'] = $true
    $builder['Encrypt'] = $false
    $builder['TrustServerCertificate'] = $true
    $builder['Connect Timeout'] = 10
    $builder['Application Name'] = 'CMP-Demo-Gate-A'
    return $builder.get_ConnectionString()
}

function Write-GateFailure {
    param([Parameter(Mandatory = $true)][System.Management.Automation.ErrorRecord]$Failure)
    $exception = $Failure.Exception.GetBaseException()
    # Never print exception messages, source lines or SQL text: they can contain credentials.
    Write-Log "ERROR phase=$script:GatePhase error_type=$($exception.GetType().FullName) script_line=$($Failure.InvocationInfo.ScriptLineNumber) sql_write_attempted=$script:SqlWriteAttempted"
    if ($exception -is [System.Data.SqlClient.SqlException]) {
        foreach ($sqlError in $exception.Errors) {
            Write-Log "SQL_ERROR number=$($sqlError.Number) state=$($sqlError.State) class=$($sqlError.Class) line=$($sqlError.LineNumber)"
        }
    }
    if ($script:SqlWriteAttempted) {
        Write-Log 'RESULT PENDING_PARTIAL_STATE inspect database, logins and backups; do not rerun or delete.'
    }
    else {
        Write-Log 'RESULT FAILED_BEFORE_SQL_WRITE this process did not submit the bootstrap; existing SQL state still requires inspection.'
    }
}

$connection = $null
$script:GatePhase = 'startup'
$script:SqlWriteAttempted = $false
try {
Write-Log "START mode=$(if ($Apply) { 'apply-requested' } else { 'inspect-only' }) pid=$PID windows_identity=$([Security.Principal.WindowsIdentity]::GetCurrent().Name) elevated=$(Get-IsElevated) log_path=$logPath"

if ($Apply -and (Get-IsElevated) -and -not (Test-Path -LiteralPath $CredentialPath -PathType Leaf)) {
    throw 'BLOCKED: Start RUN_CMP_DEMO_GATE_A.cmd from the signed-in regular Windows session; direct elevated launch would create credentials under the Administrator profile.'
}

if ($Apply -and (Get-IsElevated) -and -not (Test-Path -LiteralPath $CredentialPath -PathType Leaf)) {
    throw 'BLOCKED: Start RUN_CMP_DEMO_GATE_A.cmd from the signed-in regular Windows session; direct elevated launch would create credentials under the Administrator profile.'
}

if ($Apply -and -not (Get-IsElevated)) {
    $script:GatePhase = 'credential-preparation'
    $script:DemoCredentials = Ensure-DemoCredentials
    if ($ElevatedChild) { throw 'The elevated process does not have an Administrator token; no SQL command was sent.' }
    $powershell = Join-Path $PSHOME 'powershell.exe'
    $quotedScript = '"' + $PSCommandPath + '"'
    $quotedCredentials = '"' + $CredentialPath + '"'
    $argumentList = '-NoProfile -ExecutionPolicy Bypass -File ' + $quotedScript + ' -Apply -ElevatedChild -CredentialPath ' + $quotedCredentials
    Write-Log 'UAC_REQUEST opening Windows elevation prompt; credentials are not read or automated.'
    $script:GatePhase = 'uac'
    try {
        $child = Start-Process -FilePath $powershell -ArgumentList $argumentList -Verb RunAs -PassThru -Wait
        Write-Log "ELEVATED_PROCESS_EXIT code=$($child.ExitCode) pid=$($child.Id) child_sql_state=inspect-child-log"
        exit $child.ExitCode
    }
    catch {
        Write-Log 'UAC_NOT_COMPLETED no elevated SQL process was started.'
        throw
    }
}

    $script:GatePhase = 'bootstrap-file-check'
    if (-not (Test-Path -LiteralPath $bootstrapPath -PathType Leaf)) {
        throw 'The reviewed SQL bootstrap file is missing.'
    }

    $script:GatePhase = 'connection-build'
    $connection = [System.Data.SqlClient.SqlConnection]::new((New-GateConnectionString))
    $script:GatePhase = 'connection-open'
    Write-Log 'SQL_CONNECT_BEGIN transport=shared-memory database=master authentication=windows'
    $connection.Open()
    Write-Log 'SQL_CONNECT_OK'
    $script:GatePhase = 'identity-read'
    $identityQuery = @"
SELECT
  SYSTEM_USER AS login_name,
  ORIGINAL_LOGIN() AS original_login,
  CONVERT(nvarchar(128), SERVERPROPERTY('MachineName')) AS sql_machine,
  CONVERT(nvarchar(128), SERVERPROPERTY('InstanceName')) AS sql_instance,
  DB_NAME() AS current_database,
  IS_SRVROLEMEMBER(N'sysadmin') AS is_sysadmin,
  DB_ID(N'$expectedDatabase') AS demo_database_id,
  CONVERT(nvarchar(4000), SERVERPROPERTY('InstanceDefaultBackupPath')) AS backup_path
"@
    $command = $connection.CreateCommand()
    $command.CommandText = $identityQuery
    $reader = $command.ExecuteReader()
    if (-not $reader.Read()) { throw 'SQL identity query returned no row.' }
    $login = [string]$reader['login_name']
    $originalLogin = [string]$reader['original_login']
    $machine = [string]$reader['sql_machine']
    $instance = [string]$reader['sql_instance']
    $currentDatabase = [string]$reader['current_database']
    $isSysadmin = [int]$reader['is_sysadmin']
    $demoDatabaseId = if ($reader.IsDBNull($reader.GetOrdinal('demo_database_id'))) { $null } else { [int]$reader['demo_database_id'] }
    $backupPath = if ($reader.IsDBNull($reader.GetOrdinal('backup_path'))) { '' } else { [string]$reader['backup_path'] }
    $reader.Dispose()
    $command.Dispose()

    Write-Log ('IDENTITY ' + (@{ login = $login; original_login = $originalLogin; machine = $machine; instance = $instance; current_database = $currentDatabase; is_sysadmin = $isSysadmin; demo_database_id = $demoDatabaseId; default_backup_path = $backupPath } | ConvertTo-Json -Compress))

    $script:GatePhase = 'identity-validation'
    if ($machine -ine $expectedMachine -or $instance -ine $expectedInstance -or $currentDatabase -ine 'master') {
        throw 'BLOCKED: SQL machine, instance or current database does not match the approved target.'
    }
    if ($Apply -and ($login -ine $expectedLogin -or $originalLogin -ine $expectedLogin -or $isSysadmin -ne 1)) {
        throw 'BLOCKED: Apply requires the verified CTIC-LP-054\Administrator SQL sysadmin session.'
    }

    if ($null -ne $demoDatabaseId) {
        $script:GatePhase = 'existing-sandbox-inspection'
        Write-Log 'SANDBOX_EXISTS inspect-only; CREATE DATABASE script will not be run.'
        $inspection = @"
SELECT d.name,d.state_desc,d.user_access_desc,d.is_read_only,d.create_date,
       SUSER_SNAME(d.owner_sid) AS owner_login
FROM sys.databases AS d
WHERE d.name=N'$expectedDatabase'
"@
        Invoke-ReaderQuery -Connection $connection -Query $inspection
        $databaseState = [string](Invoke-ScalarQuery -Connection $connection -Query "SELECT state_desc FROM sys.databases WHERE name=N'$expectedDatabase'")
        if ($databaseState -ceq 'ONLINE') {
            $roleInspection = @"
SELECT r.name AS database_role,u.name AS member_name
FROM [$expectedDatabase].sys.database_role_members AS m
JOIN [$expectedDatabase].sys.database_principals AS r ON r.principal_id=m.role_principal_id
JOIN [$expectedDatabase].sys.database_principals AS u ON u.principal_id=m.member_principal_id
WHERE u.name IN (N'$expectedAppLogin',N'$expectedMigratorLogin')
ORDER BY u.name,r.name
"@
            Invoke-ReaderQuery -Connection $connection -Query $roleInspection
        }
        else {
            Write-Log "DATABASE_ROLE_INSPECTION_SKIPPED state=$databaseState"
        }
        $backupInspection = @"
SELECT TOP (5) b.backup_finish_date,b.type,b.is_copy_only,b.has_backup_checksums,mf.physical_device_name
FROM msdb.dbo.backupset AS b
JOIN msdb.dbo.backupmediafamily AS mf ON mf.media_set_id=b.media_set_id
WHERE b.database_name=N'$expectedDatabase' AND b.type=N'D'
ORDER BY b.backup_finish_date DESC
"@
        Invoke-ReaderQuery -Connection $connection -Query $backupInspection
        Write-Log 'RESULT PENDING_EXISTING_DATABASE_REQUIRES_REVIEW no database writes were made.'
        exit 3
    }

    if (-not $Apply) {
        Write-Log 'RESULT PREFLIGHT_PASS_TARGET_CONFIRMED database is absent; inspect-only mode made no writes.'
        exit 0
    }
    $script:GatePhase = 'pre-write-state-check'
    if ([string]::IsNullOrWhiteSpace($backupPath)) {
        throw 'BLOCKED: SQL Server does not report an instance default backup path.'
    }

    $loginCheck = Invoke-ScalarQuery -Connection $connection -Query "SELECT CASE WHEN SUSER_ID(N'$expectedAppLogin') IS NULL AND SUSER_ID(N'$expectedMigratorLogin') IS NULL THEN 1 ELSE 0 END"
    if ([int]$loginCheck -ne 1) { throw 'BLOCKED: A reserved DEMO SQL login already exists; inspect before retrying.' }

    $script:GatePhase = 'bootstrap-validation'
    $sql = [IO.File]::ReadAllText($bootstrapPath)
    foreach ($required in @('CTIC-LP-054', 'SQLEXPRESS', 'CTIC_CMP_DEMO_2026', 'BOOTSTRAP_PASS_BACKUP_VERIFIED', 'RESTORE VERIFYONLY')) {
        if (-not $sql.Contains($required)) { throw "BLOCKED: Reviewed SQL bootstrap is missing required guard: $required" }
    }
    if ($sql -match '(?im)\b(?:DROP|TRUNCATE)\s+(?:DATABASE|TABLE)\b|\b(?:ALTER\s+SERVER\s+ROLE|ALTER\s+LOGIN)\b') {
        throw 'BLOCKED: SQL bootstrap contains an out-of-scope server or destructive database operation.'
    }
    $loginCreates = [regex]::Matches($sql, '(?im)\bCREATE\s+LOGIN\s+\[([^\]]+)\]') | ForEach-Object { $_.Groups[1].Value }
    if (@($loginCreates | Where-Object { $_ -notin @($expectedAppLogin, $expectedMigratorLogin) }).Count -gt 0 -or
        @($loginCreates | Sort-Object -Unique).Count -ne 2) {
        throw 'BLOCKED: SQL bootstrap may create only the two reserved least-privilege DEMO logins.'
    }

    $script:GatePhase = 'credential-read'
    $script:DemoCredentials = Ensure-DemoCredentials
    $script:GatePhase = 'bootstrap-execution'
    Write-Log 'APPLY_BEGIN submitting guarded bootstrap; a failure from this point requires SQL state inspection.'
    $script:SqlWriteAttempted = $true
    Invoke-ReaderQuery -Connection $connection -Query $sql -Parameters @{
        demoAppPassword = $script:DemoCredentials.appPassword
        demoMigratorPassword = $script:DemoCredentials.migratorPassword
    }
    $script:GatePhase = 'post-bootstrap-verification'
    $backupInspection = @"
SELECT TOP (1) b.backup_finish_date,b.type,b.is_copy_only,b.has_backup_checksums,mf.physical_device_name
FROM msdb.dbo.backupset AS b
JOIN msdb.dbo.backupmediafamily AS mf ON mf.media_set_id=b.media_set_id
WHERE b.database_name=N'$expectedDatabase' AND b.type=N'D'
ORDER BY b.backup_finish_date DESC
"@
    Invoke-ReaderQuery -Connection $connection -Query $backupInspection
    $state = Invoke-ScalarQuery -Connection $connection -Query "SELECT state_desc FROM sys.databases WHERE name=N'$expectedDatabase'"
    if (
        $script:VerifiedBootstrapStatus -cne 'BOOTSTRAP_PASS_BACKUP_VERIFIED' -or
        [string]::IsNullOrWhiteSpace($script:VerifiedBackupPath) -or
        [string]$state -cne 'ONLINE'
    ) {
        throw 'BLOCKED: The script did not return its verified-backup marker with an online demo database.'
    }
    Write-Log "RESULT BOOTSTRAP_PASS_BACKUP_VERIFIED database=CTIC_CMP_DEMO_2026 backup_path=$script:VerifiedBackupPath"
}
catch {
    Write-GateFailure -Failure $_
    exit 1
}
finally {
    if ($connection) { $connection.Dispose() }
    Write-Log 'END'
}
