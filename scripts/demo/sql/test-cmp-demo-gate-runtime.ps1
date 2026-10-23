$ErrorActionPreference = 'Stop'
$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile(
    (Join-Path $PSScriptRoot 'cmp-demo-gate-a.ps1'), [ref]$tokens, [ref]$parseErrors
)
if ($parseErrors.Count) { throw 'Gate A has PowerShell syntax errors.' }
$inspectionErrors = $null
[System.Management.Automation.Language.Parser]::ParseFile(
    (Join-Path $PSScriptRoot 'inspect-cmp-demo-sql.ps1'), [ref]$tokens, [ref]$inspectionErrors
) | Out-Null
if ($inspectionErrors.Count) { throw 'Read-only SQL inspection has PowerShell syntax errors.' }

# Load only pure connection construction and error formatting. Never execute the gate,
# connect to SQL, read credentials, request UAC or execute the bootstrap in this test.
foreach ($name in @('New-GateConnectionString', 'Write-GateFailure')) {
    $functions = @($ast.FindAll({
        param($node)
        $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name
    }, $true))
    if ($functions.Count -ne 1) { throw "Expected one production function: $name" }
    . ([scriptblock]::Create($functions[0].Extent.Text))
}

$connectionString = New-GateConnectionString
$builder = [System.Data.SqlClient.SqlConnectionStringBuilder]::new($connectionString)
if ($builder.get_DataSource() -cne 'lpc:.\SQLEXPRESS' -or
    $builder.get_InitialCatalog() -cne 'master' -or
    -not $builder.get_IntegratedSecurity() -or
    $builder.get_Encrypt() -or
    -not $builder.get_TrustServerCertificate() -or
    $builder.get_ConnectTimeout() -ne 10 -or
    $builder.get_ApplicationName() -cne 'CMP-Demo-Gate-A' -or
    $builder.get_UserID() -or $builder.get_Password()) {
    throw 'The production builder changed the approved SQL connection boundary.'
}
$connection = [System.Data.SqlClient.SqlConnection]::new($connectionString)
try {
    if ($connection.State -ne [Data.ConnectionState]::Closed) { throw 'The test unexpectedly opened SQL.' }
} finally { $connection.Dispose() }
Write-Output 'PASS: production connection builder works; SQL connection remains closed.'

function Write-Log { param([string]$Message) $script:CapturedLog.Add($Message) }
$script:CapturedLog = [Collections.Generic.List[string]]::new()
try { throw [InvalidOperationException]::new('synthetic-secret-marker;Password=do-not-log;SQL-text') }
catch { $failure = $_ }

$script:GatePhase = 'connection-build'
$script:SqlWriteAttempted = $false
Write-GateFailure -Failure $failure
$before = $script:CapturedLog -join "`n"
if ($before -notmatch 'ERROR phase=connection-build' -or
    $before -notmatch 'sql_write_attempted=False' -or
    $before -notmatch 'RESULT FAILED_BEFORE_SQL_WRITE' -or
    $before -match 'PENDING_PARTIAL_STATE|synthetic-secret-marker|Password=|SQL-text') {
    throw 'Pre-write failure classification or safe logging failed.'
}
Write-Output 'PASS: pre-write failures are classified without exposing exception contents.'

$script:CapturedLog.Clear()
$script:GatePhase = 'bootstrap-execution'
$script:SqlWriteAttempted = $true
Write-GateFailure -Failure $failure
$after = $script:CapturedLog -join "`n"
if ($after -notmatch 'sql_write_attempted=True' -or
    $after -notmatch 'RESULT PENDING_PARTIAL_STATE' -or
    $after -match 'FAILED_BEFORE_SQL_WRITE|synthetic-secret-marker|Password=|SQL-text') {
    throw 'Possible partial SQL execution was incorrectly classified or leaked exception contents.'
}
Write-Output 'PASS: attempted SQL writes require state inspection and never suggest automatic retry.'
