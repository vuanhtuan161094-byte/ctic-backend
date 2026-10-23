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

Write-Log "START mode=$(if ($Apply) { 'apply-requested' } else { 'inspect-only' }) log_path=$logPath"

if ($Apply -and (Get-IsElevated) -and -not (Test-Path -LiteralPath $CredentialPath -PathType Leaf)) {
    throw 'BLOCKED: Start RUN_CMP_DEMO_GATE_A.cmd from the signed-in regular Windows session; direct elevated launch would create credentials under the Administrator profile.'
}

if ($Apply -and -not (Get-IsElevated)) {
    $script:DemoCredentials = Ensure-DemoCredentials
    if ($ElevatedChild) { throw 'The elevated process does not have an Administrator token; no SQL command was sent.' }
    $powershell = Join-Path $PSHOME 'powershell.exe'
    $quotedScript = '"' + $PSCommandPath + '"'
    $quotedCredentials = '"' + $CredentialPath + '"'
    $argumentList = '-NoProfile -ExecutionPolicy Bypass -File ' + $quotedScript + ' -Apply -ElevatedChild -CredentialPath ' + $quotedCredentials
    Write-Log 'UAC_REQUEST opening Windows elevation prompt; credentials are not read or automated.'
    try {
        $child = Start-Process -FilePath $powershell -ArgumentList $argumentList -Verb RunAs -PassThru -Wait
        Write-Log "EvëÍí¢G§²ÚîÆ­yÒ‚v6×ÖFVÖòÖ6ÂÒr²¶wV–EÓ£¤æWtwV–B‚’åFõ7G&–ær‚târ’¢GFW7Df–ÆRÒ¦ö–âÕF‚GFW7E&ö÷Bv7&VFVçF–Ç2çFW7Bæ§6öâp §G'’°¢æWrÔ—FVÒÔ—FVÕG—RF—&V7F÷'’ÕF‚GFW7E&ö÷BÂ÷WBÔçVÆÀ¢´”òäf–ÆUÓ£¥w&—FTÆÅFW‡B‚GFW7Df–ÆRÂw²'FW7B#¢&6ÂÖÖ&¶W"'ÒrÂµFW‡BåUDc„Væ6öF–æuÓ£¦æWr‚FfÇ6R’¢6WBÔ6×FVÖô7&VFVçF–Ä6ÂÔF—&V7F÷'•F‚GFW7E&ö÷BÔ7&VFVçF–Äf–ÆUF‚GFW7Df–ÆRÔ÷væW%6–BF÷væW%6–@ ¢F6öçFVçG2Ò´”òäf–ÆUÓ£¥&VDÆÅFW‡B‚GFW7Df–ÆR¢–b‚F6öçFVçG2ÖæRw²'FW7B#¢&6ÂÖÖ&¶W"'Òr’²F‡&÷ruF†R7&VF–ærv–æF÷w2W6W"6÷VÆBæ÷B&VBF†R&÷FV7FVBFW7Bf–ÆRârĞ ¢f÷&V6‚‚GF‚–â‚GFW7E&ö÷BÂGFW7Df–ÆR’’°¢F6ÂÒvWBÔ6ÂÔÆ—FW&ÅF‚GF€¢F7GVÅ6–G2Ò‚F6ÂävWD66W75'VÆW2‚GG'VRÂGG'VRÂµ6V7W&—G’å&–æ6—Âå6V7W&—G”–FVçF–f–W%Ò’Âf÷$V6‚Ôö&¦V7B²Eòä–FVçF—G•&VfW&Væ6RåfÇVRÒÂ6÷'BÔö&¦V7BÕVæ—VR¢G'VÆW2Ò‚F6ÂävWD66W75'VÆW2‚GG'VRÂGG'VRÂµ6V7W&—G’å&–æ6—Âå6V7W&—G”–FVçF–f–W%Ò’¢f÷&V6‚‚G6–B–âF7GVÅ6–G2’°¢–b‚G6–BÖæ÷F–âFÆÆ÷vVE6–G2’²F‡&÷r%VæW‡V7FVB7&VFVçF–Â4Â&–æ6—Ã¢G6–B"Ğ¢Ğ¢f÷&V6‚‚G6–B–âFÆÆ÷vVE6–G2’°¢–b‚G6–BÖæ÷F–âF7GVÅ6–G2’²F‡&÷r%&WV—&VB7&VFVçF–Â4Â&–æ6—Â—2Ö—76–æs¢G6–B"Ğ¢Ğ¢–b‚F6ÂävWD÷væW"…µ6V7W&—G’å&–æ6—Âå6V7W&—G”–FVçF–f–W%Ò’åfÇVRÖæRF÷væW%6–B’°¢F‡&÷ruF†R7&VFVçF–ÂF‚÷væW"FöW2æ÷BÖF6‚F†R÷&F–æ'’v–æF÷w266÷VçBâp¢Ğ¢f÷&V6‚‚G'VÆR–âG'VÆW2’°¢–b‚G'VÆRä66W746öçG&öÅG—RÖæRµ6V7W&—G’ä66W746öçG&öÂä66W746öçG&öÅG—UÓ£¤ÆÆ÷rÖ÷ ¢‚G'VÆRäf–ÆU7—7FVÕ&–v‡G2Ö&æBµ6V7W&—G’ä66W746öçG&öÂäf–ÆU7—7FVÕ&–v‡G5Ó£¤gVÆÄ6öçG&öÂ’ÖæRµ6V7W&—G’ä66W746öçG&öÂäf–ÆU7—7FVÕ&–v‡G5Ó£¤gVÆÄ6öçG&öÂ’°¢F‡&÷rt7&VFVçF–Â4ÂVçG'’—2æ÷BâW‡Æ–6—BgVÆÄ6öçG&öÂÆÆ÷rVçG'’âp¢Ğ¢Ğ¢Ğ ¢w&—FRÔ÷WGWBu53¢÷væW"6â&VBF†RFW7Bf–ÆS²4Â6öçF–ç2öæÇ’÷væW"4”BÂ5•5DTÒÂæBFÖ–æ—7G&F÷'2âp§Ğ¦f–æÆÇ’°¢–b…FW7BÕF‚ÔÆ—FW&ÅF‚GFW7E&ö÷B’°¢&VÖ÷fRÔ—FVÒÔÆ—FW&ÅF‚GFW7E&ö÷BÕ&V7W'6RÔf÷&6P¢Ğ§Ğ