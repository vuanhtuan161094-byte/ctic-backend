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
        throw "Lệnh thất bại (mã $LASTEXITCODE): $FilePath $($Arguments -join ' ')"
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
    $builder['Application Name'] = 'CMP Patch 36C.1a temporary migration elevation'

    $connection = New-Object System.Data.SqlClient.SqlConnection $builder.ConnectionString
    try {
        $connection.Open()
        return $connection
    }
    catch {
        $connection.Dispose()
        throw @"
Không thể dùng Windows Authentication để cấp quyền migration tạm thời.
Server: $($Info.host):$($Info.port)
Database: $($Info.database)

Cách chuẩn production: tạo .env.migration từ .env.migration.example và điền MIGRATION_DATABASE_URL của tài khoản migration riêng.
Cách development Windows: đăng nhập Windows account có quyền quản trị database/SSMS rồi chạy lại STABILIZE_36C1A.cmd.
Lỗi gốc: $($_.Exception.Message)
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
        throw 'Không đọc được cấu hình database hiện tại.'
    }
    return ($json | Out-String | ConvertFrom-Json)
}

Write-Host '============================================================' -ForegroundColor Yellow
Write-Host 'PATCH 36C.1a - COMMERCIAL DATABASE STABILIZATION (WINDOWS)' -ForegroundColor Yellow
Write-Host '1 installation = 1 certification body.' -ForegroundColor Yellow
Write-Host 'Không reset database. Không xóa dữ liệu chứng nhận.' -ForegroundColor Yellow
Write-Host '============================================================' -ForegroundColor Yellow

$info = Get-TargetInfo
$npmCmd = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
if (-not $npmCmd) { $npmCmd = 'npm.cmd' }

if ([string]::IsNullOrWhiteSpace([string]$info.database)) {
    throw 'DATABASE_URL thiếu database name.'
}

if ($info.migrationConfigured) {
    Write-Step '[MODE] Dùng MIGRATION_DATABASE_URL riêng.'
    Invoke-External $npmCmd @('run', 'stabilize:commercial')
    Write-Step '[VERIFY] Kiểm tra tài khoản runtime không giữ quyền DDL...'
    Invoke-External $npmCmd @('run', 'db:runtime-permissions')
    exit 0
}

if ([string]$info.nodeEnv -eq 'production') {
    throw @"
Production không cho phép tự nâng quyền tài khoản runtime.
Tạo file .env.migration từ .env.migration.example và cấu hình MIGRATION_DATABASE_URL cho tài khoản migration riêng, sau đó chạy lại.
"@
}

if ([string]::IsNullOrWhiteSpace([string]$info.runtimeUser)) {
    throw 'Không xác định được database user của DATABASE_URL. Hãy cấu hình MIGRATION_DATABASE_URL riêng.'
}

$adminConnection = $null
$addedRoles = New-Object System.Collections.Generic.List[string]
$userQuoted = Escape-SqlIdentifier ([string]$info.runtimeUser)

try {
    Write-Step '[MODE] Development Windows: cấp quyền migration TẠM THỜI cho runtime DB user.'
    Write-Host "Database user: $($info.runtimeUser)"
    Write-Host 'Roles tạm thời tối đa: db_ddladmin, db_datareader, db_datawriter.'
    Write-Host 'KHÔNG cấp db_owner.'

    $adminConnection = Open-AdminConnection $info
    $principalId = Invoke-SqlScalar $adminConnection `
        'SELECT DATABASE_PRINCIPAL_ID(@userName);' `
        @{ userName = [string]$info.runtimeUser }
    if ($null -eq $principalId -or [int]$principalId -le 0) {
        throw "Database user '$($info.runtimeUser)' không tồn tại trong database '$($info.database)'."
    }

    foreach ($role in @('db_ddladmin', 'db_datareader', 'db_datawriter')) {
        $isMember = [int](Invoke-SqlScalar $adminConnection `
            "SELECT ISNULL(IS_ROLEMEMBER(N'$role', @userName), 0);" `
            @{ userName = [string]$info.runtimeUser })
        if ($isMember -ne 1) {
            Invoke-SqlNonQuery $adminConnection "ALTER ROLE [$role] ADD MEMBER $userQuoted;"
            $addedRoles.Add($role)
            Write-Host "Đã cấp tạm role $role." -ForegroundColor Yellow
        }
        else {
            Write-Host "User đã có role $role; không thay đổi quyền có sẵn."
        }
    }

    $env:ALLOW_RUNTIME_MIGRATION_CREDENTIALS = 'true'
    $env:CMP_TEMP_DDL_ELEVATION = 'true'

    Write-Step '[RUN] Baseline + migrate + schema contract + build + regressions...'
    Invoke-External $npmCmd @('run', 'stabilize:commercial')
}
finally {
    Remove-Item Env:ALLOW_RUNTIME_MIGRATION_CREDENTIALS -ErrorAction SilentlyContinue
    Remove-Item Env:CMP_TEMP_DDL_ELEVATION -ErrorAction SilentlyContinue

    if ($adminConnection) {
        for ($i = $addedRoles.Count - 1; $i -ge 0; $i--) {
            $role = $addedRoles[$i]
            try {
                Invoke-SqlNonQuery $adminConnection "ALTER ROLE [$role] DROP MEMBER $userQuoted;"
                Write-Host "Đã thu hồi role tạm thời $role." -ForegroundColor Green
            }
            catch {
                Write-Host "CẢNH BÁO: Không thu hồi được role $role: $($_.Exception.Message)" -ForegroundColor Red
                Write-Host "Hãy thu hồi thủ công trong SSMS: ALTER ROLE [$role] DROP MEMBER $userQuoted;" -ForegroundColor Red
            }
        }
        $adminConnection.Dispose()
    }
}

Write-Step '[VERIFY] Kiểm tra lại quyền runtime sau khi thu hồi quyền migration...'
Invoke-External $npmCmd @('run', 'db:runtime-permissions')

Write-Host ''
Write-Host '============================================================' -ForegroundColor Green
Write-Host 'PATCH 36C.1a STABILIZATION: PASS' -ForegroundColor Green
Write-Host 'Migration đã xong và quyền DDL tạm thời đã được thu hồi.' -ForegroundColor Green
Write-Host '============================================================' -ForegroundColor Green
