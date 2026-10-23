param([switch]$ElevatedChild, [switch]$NoElevation)
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
$logRoot = Join-Path (Split-Path -Parent $repoRoot) 'artifacts\sql\diagnostics'
New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
$logPath = Join-Path $logRoot ('CMP_SQL_INSPECT_{0}_{1}.log' -f (Get-Date -Format 'yyyyMMdd_HHmmss'), [guid]::NewGuid().ToString('N').Substring(0, 8))
function Write-InspectionLog {
    param([string]$Message)
    $line = '[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-ddTHH:mm:ss.fffK'), $Message
    Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
    Write-Output $line
}
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$elevated = ([Security.Principal.WindowsPrincipal]::new($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$connection = $null
try {
    Write-InspectionLog "START read_only=true windows_identity=$($identity.Name) elevated=$elevated pid=$PID"
    if (-not $elevated -and -not $NoElevation) {
        if ($ElevatedChild) { throw 'Administrator token was not granted.' }
        $arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $PSCommandPath + '" -ElevatedChild'
        $child = Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList $arguments -Verb RunAs -WindowStyle Hidden -PassThru -Wait
        Write-InspectionLog "CHILD_EXIT code=$($child.ExitCode) pid=$($child.Id)"
        exit $child.ExitCode
    }

    $service = Get-CimInstance Win32_Service -Filter "Name='MSSQL`$SQLEXPRESS'"
    Write-InspectionLog ('SERVICE ' + ($service | Select-Object Name,State,StartMode,ExitCode,ServiceSpecificExitCode,ProcessId | ConvertTo-Json -Compress))
    $instanceKey = 'HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\MSSQL17.SQLEXPRESS\MSSQLServer'
    try {
        $parameters = Get-ItemProperty -LiteralPath (Join-Path $instanceKey 'Parameters')
        $errorLogArgument = @($parameters.PSObject.Properties | Where-Object { $_.Name -match '^SQLArg\d+$' -and [string]$_.Value -like '-e*' })
        if ($errorLogArgument.Count -ne 1) { throw 'Cannot identify the configured SQL error log.' }
        $errorLogPath = ([string]$errorLogArgument[0].Value).Substring(2).Trim('"')
        $lines = @(Get-Content -LiteralPath $errorLogPath -Tail 180 | Where-Object {
            $_ -match 'TDSSNIClient|10048|0x2740|Error: (17182|17826|17120|26023)|Server is listening on|Server name is|SQL Server could not spawn|failed to listen|SQL Server is terminating' -and
            $_ -notmatch '(?i)password|pwd\s*=|sqlserver://'
        })
        foreach ($line in $lines) { Write-InspectionLog ('SQL_SERVER_EVENT ' + $line.Trim()) }
        Write-InspectionLog "SQL_SERVER_EVENT_COUNT $($lines.Count)"
    } catch { Write-InspectionLog "ERRORLOG_UNAVAILABLE error_type=$($_.Exception.GetBaseException().GetType().FullName)" }

    $tcp = Get-ItemProperty -LiteralPath (Join-Path $instanceKey 'SuperSocketNetLib\Tcp')
    $ports = Get-ItemProperty -LiteralPath (Join-Path $instanceKey 'SuperSocketNetLib\Tcp\IPAll')
    Write-InspectionLog "TCP_OBSERVED enabled=$($tcp.Enabled) port=$($ports.TcpPort) dynamic_ports=$($ports.TcpDynamicPorts) configuration_changed=false"
    $listeners = @(Get-NetTCPConnection -State Listen | Where-Object { [string]$_.LocalPort -in @('1433', [string]$ports.TcpPort, [string]$ports.TcpDynamicPorts) })
    foreach ($listener in $listeners) {
        $processName = (Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue).ProcessName
        Write-InspectionLog "LISTENER address=$($listener.LocalAddress) port=$($listener.LocalPort) pid=$($listener.OwningProcess) process=$processName"
    }
    if ($service.State -ne 'Running') {
        Write-InspectionLog 'RESULT BLOCKED_SQL_SERVICE_STOPPED database_logins_backup=UNVERIFIED service_changed=false'
        exit 3
    }

    $connection = [Data.SqlClient.SqlConnection]::new('Data Source=lpc:.\SQLEXPRESS;Initial Catalog=master;Integrated Security=True;Encrypt=False;TrustServerCertificate=True;Connect Timeout=10;Application Name=CMP-Demo-ReadOnlyInspection')
    $connection.Open()
    $command = $connection.CreateCommand()
    $command.CommandText = "SELECT CASE WHEN CONVERT(nvarchar(128),SERVERPROPERTY('MachineName'))=N'CTIC-LP-054' AND CONVERT(nvarchar(128),SERVERPROPERTY('InstanceName'))=N'SQLEXPRESS' AND IS_SRVROLEMEMBER(N'sysadmin')=1 THEN 1 ELSE 0 END"
    try { $authorizedMetadata = $command.ExecuteScalar() } finally { $command.Dispose() }
    if ([int]$authorizedMetadata -ne 1) {
        Write-InspectionLog 'RESULT BLOCKED_METADATA_VISIBILITY exact instance and existing SQL sysadmin are required to prove absence.'
        exit 3
    }
    $queries = [ordered]@{
        IDENTITY = "SELECT SYSTEM_USER AS login_name, ORIGINAL_LOGIN() AS original_login, IS_SRVROLEMEMBER(N'sysadmin') AS is_sysadmin, CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')) AS server_name"
        DATABASE = "SELECT name,state_desc,user_access_desc,is_read_only,create_date FROM sys.databases WHERE name=N'CTIC_CMP_DEMO_2026'"
        LOGINS = "SELECT name,type_desc,is_disabled,create_date FROM sys.server_principals WHERE name IN(N'CMP_DEMO_APP',N'CMP_DEMO_MIGRATOR')"
        BACKUPS = "SELECT TOP(10) b.backup_finish_date,b.type,b.is_copy_only,b.has_backup_checksums,m.physical_device_name FROM msdb.dbo.backupset b JOIN msdb.dbo.backupmediafamily m ON m.media_set_id=b.media_set_id WHERE b.database_name=N'CTIC_CMP_DEMO_2026' ORDER BY b.backup_finish_date DESC"
    }
    foreach ($name in $queries.Keys) {
        $command = $connection.CreateCommand()
        $command.CommandText = $queries[$name]
        $command.CommandTimeout = 15
        $reader = $null
        try {
            $reader = $command.ExecuteReader()
            $count = 0
            while ($reader.Read()) {
                $row = [ordered]@{}
                for ($i = 0; $i -lt $reader.FieldCount; $i++) {
                    $row[$reader.GetName($i)] = if ($reader.IsDBNull($i)) { $null } else { $reader.GetValue($i) }
                }
                Write-InspectionLog ($name + ' ' + ($row | ConvertTo-Json -Compress))
                $count++
            }
            Write-InspectionLog "${name}_ROWS $count"
        } finally { if ($reader) { $reader.Dispose() }; $command.Dispose() }
    }
    Write-InspectionLog 'RESULT READ_ONLY_INSPECTION_COMPLETE review results before any bootstrap; this is not Gate A PASS.'
} catch {
    $exception = $_.Exception.GetBaseException()
    Write-InspectionLog "ERROR error_type=$($exception.GetType().FullName) script_line=$($_.InvocationInfo.ScriptLineNumber)"
    if ($exception -is [Data.SqlClient.SqlException]) {
        foreach ($errorItem in $exception.Errors) { Write-InspectionLog "SQL_ERROR number=$($errorItem.Number) state=$($errorItem.State)" }
    }
    exit 1
} finally { if ($connection) { $connection.Dispose() }; Write-InspectionLog 'END read_only=true' }
