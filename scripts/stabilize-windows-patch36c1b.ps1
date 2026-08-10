$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $Root

function Write-Step([string]$Text) {
    Write-Host "`n$Text" -ForegroundColor Cyan
}

function Invoke-External {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $false)][string[]]$Arguments = @()
    )

    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "External command failed (exit $LASTEXITCODE): $FilePath $($Arguments -join ' ')"
    }
}

function Escape-SqlIdentifier([string]$Value) {
    return '[' + $Value.Replace(']', ']]') + ']'
}

function Open-AdminConnection($Info) {
    $builder = New-Object System.Data.SqlClient.SqlConnectionStringBuilder
    if ([int]$Info.port -eq 1433) {
        $builder['Data Source'] = [string]$Info.host
    }
    else {
        $builder['Data Source'] = "$($Info.host),$($Info.port)"
    }

    $builder['Initial Catalog'] = [string]$Info.database
    $builder['Integrated Security'] = $true
    $builder['TrustServerCertificate'] = $true
    $builder['Encrypt'] = $false
    $builder['Application Name'] = 'CMP Patch 36C.1c temporary migration elevation'

    $connection = New-Object System.Data.SqlClient.SqlConnection $builder.ConnectionString
    try {
        $connection.Open()
        return $connection
    }
    catch {
        $connection.Dispose()
        throw @"
Windows Authentication could not open an administrative SQL connection.
Server: $($Info.host):$($Info.port)
Database: $($Info.database)

Production: create .env.migration from .env.migration.example and configure MIGRATION_DATABASE_URL for a dedicated migration account.
Windows development: run STABILIZE_36C1C.cmd from a Windows account that has database administration permission.
Original error: $($_.Exception.Message)
"@
    }
}

function Invoke-SqlScalar($Connection, [string]$Sql, [hashtable]$Parameters = @{}) {
    $command = $Connection.CreateCommand()
    $command.CommandText = $Sql
    $command.CommandTimeout = 60

    foreach ($name in $Parameters.Keys) {
        $parameter = $command.Parameters.Add("@$name", [System.Data.SqlDbType]::NVarChar, 256)
        $parameter.Value = [string]$Parameters[$name]
    }

    try {
        return $command.ExecuteScalar()
    }
    finally {
        $command.Dispose()
    }
}

function Invoke-SqlNonQuery($Connection, [string]$Sql) {
    $command = $Connection.CreateCommand()
    $command.CommandText = $Sql
    $command.CommandTimeout = 60

    try {
        [void]$command.ExecuteNonQuery()
    }
    finally {
        $command.Dispose()
    }
}

function Get-TargetInfo {
    $json = & node '.\scripts\database-target-info-patch36c1a.cjs'
    if ($LASTEXITCODE -ne 0) {
        throw 'Could not read the current database target configuration.'
    }

    return ($json | Out-String | ConvertFrom-Json)
}

Write-Host '============================================================' -ForegroundColor Yellow
Write-Host 'PATCH 36C.1c - COMMERCIAL DATABASE STABILIZATION (WINDOWS)' -ForegroundColor Yellow
Write-Host '1 installation = 1 certification body.' -ForegroundColor Yellow
Write-Host 'No database reset. No certification data deletion.' -ForegroundColor Yellow
Write-Host '============================================================' -ForegroundColor Yellow

$info = Get-TargetInfo
$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
$npmCmd = if ($npmCommand) { $npmCommand.Source } else { 'npm.cmd' }

if ([string]::IsNullOrWhiteSpace([string]$info.database)) {
    throw 'DATABASE_URL does not contain a database name.'
}

if ($info.migrationConfigured) {
    Write-Step '[MODE] Dedicated MIGRATION_DATABASE_URL is configured.'
    Invoke-External $npmCmd @('run', 'stabilize:commercial')
    Write-Step '[VERIFY] Confirm runtime account does not retain DDL privileges...'
    Invoke-External $npmCmd @('run', 'db:runtime-permissions')
    Write-Host ''
    Write-Host 'PATCH 36C.1c STABILIZATION: PASS' -ForegroundColor Green
    exit 0
}

if ([string]$info.nodeEnv -eq 'production') {
    throw @"
Production does not allow temporary elevation of the runtime database account.
Create .env.migration from .env.migration.example and configure MIGRATION_DATABASE_URL for a dedicated migration account, then run this command again.
"@
}

if ([string]::IsNullOrWhiteSpace([string]$info.runtimeUser)) {
    throw 'Could not determine the DATABASE_URL database user. Configure MIGRATION_DATABASE_URL instead.'
}

$adminConnection = $null
$addedRoles = New-Object System.Collections.Generic.List[string]
$userQuoted = Escape-SqlIdentifier ([string]$info.runtimeUser)
$stabilizationSucceeded = $false

try {
    Write-Step '[MODE] Windows development: temporarily grant only required migration roles.'
    Write-Host "Database user: $($info.runtimeUser)"
    Write-Host 'Temporary roles: db_ddladmin, db_datareader, db_datawriter.'
    Write-Host 'db_owner is NOT granted.'

    $adminConnection = Open-AdminConnection $info

    $principalId = Invoke-SqlScalar $adminConnection `
        'SELECT DATABASE_PRINCIPAL_ID(@userName);' `
        @{ userName = [string]$info.runtimeUser }

    if ($null -eq $principalId -or [int]$principalId -le 0) {
        throw "Database user '$($info.runtimeUser)' does not exist in database '$($info.database)'."
    }

    foreach ($role in @('db_ddladmin', 'db_datareader', 'db_datawriter')) {
        $isMember = [int](Invoke-SqlScalar $adminConnection `
            "SELECT ISNULL(IS_ROLEMEMBER(N'$role', @userName), 0);" `
            @{ userName = [string]$info.runtimeUser })

        if ($isMember -ne 1) {
            Invoke-SqlNonQuery $adminConnection "ALTER ROLE [$role] ADD MEMBER $userQuoted;"
            $addedRoles.Add($role)
            Write-Host "Temporarily granted role: $role" -ForegroundColor Yellow
        }
        else {
            Write-Host "Role already present and will not be removed: $role"
        }
    }

    $env:ALLOW_RUNTIME_MIGRATION_CREDENTIALS = 'true'
    $env:CMP_TEMP_DDL_ELEVATION = 'true'

    Write-Step '[RUN] Baseline + migrations + schema contract + build + regressions...'
    Invoke-External $npmCmd @('run', 'stabilize:commercial')
    $stabilizationSucceeded = $true
}
finally {
    Remove-Item Env:ALLOW_RUNTIME_MIGRATION_CREDENTIALS -ErrorAction SilentlyContinue
    Remove-Item Env:CMP_TEMP_DDL_ELEVATION -ErrorAction SilentlyContinue

    if ($adminConnection) {
        for ($i = $addedRoles.Count - 1; $i -ge 0; $i--) {
            $role = $addedRoles[$i]
            try {
                Invoke-SqlNonQuery $adminConnection "ALTER ROLE [$role] DROP MEMBER $userQuoted;"
                Write-Host "Removed temporary role: $role" -ForegroundColor Green
            }
            catch {
                Write-Host ("WARNING: Could not remove temporary role {0}: {1}" -f $role, $_.Exception.Message) -ForegroundColor Red
                Write-Host ("Remove it manually in SSMS: ALTER ROLE [{0}] DROP MEMBER {1};" -f $role, $userQuoted) -ForegroundColor Red
            }
        }

        $adminConnection.Dispose()
    }
}

if (-not $stabilizationSucceeded) {
    throw 'Commercial stabilization did not complete successfully.'
}

Write-Step '[VERIFY] Confirm runtime database permissions after temporary roles were removed...'
Invoke-External $npmCmd @('run', 'db:runtime-permissions')

Write-Host ''
Write-Host '============================================================' -ForegroundColor Green
Write-Host 'PATCH 36C.1c STABILIZATION: PASS' -ForegroundColor Green
Write-Host 'Migration completed and temporary DDL roles were removed.' -ForegroundColor Green
Write-Host '============================================================' -ForegroundColor Green
