param(
    [string]$BackendPath = $env:CMP_BACKEND_PATH,
    [string]$Branch = 'feature/ux-fix-batch01'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$BackendRepo = 'vuanhtuan161094-byte/ctic-backend'
$FrontendRepo = 'vuanhtuan161094-byte/ctic-frontend'

if ([string]::IsNullOrWhiteSpace($BackendPath)) {
    throw 'Backend directory is missing (CMP_BACKEND_PATH).'
}

if ($BackendPath.Contains('"')) {
    throw 'CMP_BACKEND_PATH contains a literal quotation mark. Run the original CMP_ONE_CLICK.cmd directly.'
}
try {
    $BackendPath = [System.IO.Path]::GetFullPath($BackendPath)
    $FrontendPath = [System.IO.Path]::GetFullPath((Join-Path $BackendPath '..\frontend'))
}
catch {
    throw ("Invalid launcher directory from CMP_BACKEND_PATH: {0}" -f $_.Exception.Message)
}

# Scope PID state to this installation. Do not stop processes from another CMP checkout.
$normalizedRoot = $BackendPath.TrimEnd('\').ToUpperInvariant()
$hashProvider = [System.Security.Cryptography.SHA256]::Create()
try {
    $hashBytes = $hashProvider.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($normalizedRoot))
}
finally {
    $hashProvider.Dispose()
}
$stateId = -join ($hashBytes | Select-Object -First 8 | ForEach-Object { $_.ToString('x2') })
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$LogDir = Join-Path $env:TEMP ("CMP-{0}-{1}" -f $stamp, $PID)
$StateFile = Join-Path $env:TEMP ("CMP-launcher-{0}.json" -f $stateId)
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$BackendStdout = Join-Path $LogDir 'backend.stdout.log'
$BackendStderr = Join-Path $LogDir 'backend.stderr.log'
$FrontendStdout = Join-Path $LogDir 'frontend.stdout.log'
$FrontendStderr = Join-Path $LogDir 'frontend.stderr.log'

Add-Type -AssemblyName System.Net.Http

function Normalize-GitHubRemote {
    param([string]$Url)

    $value = $Url.Trim()
    if ($value.StartsWith('git@github.com:', [System.StringComparison]::OrdinalIgnoreCase)) {
        $value = $value.Substring('git@github.com:'.Length)
    }
    elseif ($value.StartsWith('ssh://git@github.com/', [System.StringComparison]::OrdinalIgnoreCase)) {
        $value = $value.Substring('ssh://git@github.com/'.Length)
    }
    elseif ($value.StartsWith('https://github.com/', [System.StringComparison]::OrdinalIgnoreCase)) {
        $value = $value.Substring('https://github.com/'.Length)
    }
    elseif ($value.StartsWith('http://github.com/', [System.StringComparison]::OrdinalIgnoreCase)) {
        $value = $value.Substring('http://github.com/'.Length)
    }

    $value = $value.TrimEnd('/')
    if ($value.EndsWith('.git', [System.StringComparison]::OrdinalIgnoreCase)) {
        $value = $value.Substring(0, $value.Length - 4)
    }

    return $value.ToLowerInvariant()
}

function Invoke-GitCapture {
    param(
        [string]$Path,
        [string[]]$GitArgs
    )

    $output = & git -C $Path @GitArgs 2>&1
    $exitCode = $LASTEXITCODE
    $textValue = (($output | Out-String).Trim())

    if ($exitCode -ne 0) {
        throw ("git {0} failed in {1}{2}{3}" -f ($GitArgs -join ' '), $Path, [Environment]::NewLine, $textValue)
    }

    return $textValue
}

function Invoke-GitVisible {
    param(
        [string]$Path,
        [string[]]$GitArgs
    )

    & git -C $Path @GitArgs
    if ($LASTEXITCODE -ne 0) {
        throw ("git {0} failed in {1}" -f ($GitArgs -join ' '), $Path)
    }
}

function Assert-Repository {
    param(
        [string]$Label,
        [string]$Path,
        [string]$ExpectedRepo
    )

    if (-not (Test-Path -LiteralPath (Join-Path $Path 'package.json'))) {
        throw "$Label folder is invalid or missing package.json: $Path"
    }

    $branchNow = Invoke-GitCapture -Path $Path -GitArgs @('rev-parse', '--abbrev-ref', 'HEAD')
    if ($branchNow -ne $Branch) {
        throw "$Label is on branch '$branchNow'. Expected '$Branch'. No checkout/reset was performed."
    }

    $origin = Invoke-GitCapture -Path $Path -GitArgs @('remote', 'get-url', 'origin')
    $normalizedOrigin = Normalize-GitHubRemote -Url $origin
    if ($normalizedOrigin -ne $ExpectedRepo.ToLowerInvariant()) {
        throw "$Label origin '$origin' does not match github.com/$ExpectedRepo."
    }

    $trackedStatus = Invoke-GitCapture -Path $Path -GitArgs @('status', '--porcelain', '--untracked-files=no')
    if (-not [string]::IsNullOrWhiteSpace($trackedStatus)) {
        throw ("{0} has tracked/staged local WIP. Launcher will not stash, reset, clean, or overwrite it.{1}{2}" -f $Label, [Environment]::NewLine, $trackedStatus)
    }
}

function Sync-Repository {
    param(
        [string]$Label,
        [string]$Path
    )

    Write-Host "[SYNC] $Label fetch origin/$Branch"
    Invoke-GitVisible -Path $Path -GitArgs @('fetch', 'origin', $Branch)

    $counts = Invoke-GitCapture -Path $Path -GitArgs @('rev-list', '--left-right', '--count', "HEAD...origin/$Branch")
    $parts = $counts -split '\s+'
    if ($parts.Count -lt 2) {
        throw "Could not determine ahead/behind state for ${Label}: $counts"
    }

    $ahead = [int]$parts[0]
    $behind = [int]$parts[1]

    if ($ahead -gt 0) {
        throw "$Label has $ahead local commit(s) not present on origin/$Branch. GitHub is source of truth; launcher will not reset or overwrite them."
    }

    if ($behind -gt 0) {
        Invoke-GitVisible -Path $Path -GitArgs @('merge', '--ff-only', "origin/$Branch")
    }

    $sha = Invoke-GitCapture -Path $Path -GitArgs @('rev-parse', 'HEAD')
    Write-Host "[SYNC OK] $Label $sha"
    return $sha
}

function Stop-RememberedProcess {
    param(
        $Entry,
        [string]$Label
    )

    if ($null -eq $Entry -or $null -eq $Entry.pid -or $null -eq $Entry.startTimeUtc) {
        return
    }

    try {
        $process = Get-Process -Id ([int]$Entry.pid) -ErrorAction Stop
        $actualStart = $process.StartTime.ToUniversalTime()
        $expectedStart = ([datetime]::Parse([string]$Entry.startTimeUtc)).ToUniversalTime()

        if ([math]::Abs(($actualStart - $expectedStart).TotalSeconds) -gt 0.25) {
            Write-Host "[WARN] Saved $Label PID $($Entry.pid) was reused by another process; not killing it."
            return
        }
        if ($process.ProcessName -ine [System.IO.Path]::GetFileNameWithoutExtension($env:ComSpec)) {
            Write-Host "[WARN] Saved $Label PID $($Entry.pid) is not cmd.exe; not killing it."
            return
        }

        Write-Host "[STOP] Previous $Label process tree PID $($Entry.pid)"
        & taskkill.exe /PID ([int]$Entry.pid) /T /F *> $null
    }
    catch {
        return
    }
}

function Stop-PreviousCmpProcesses {
    if (-not (Test-Path -LiteralPath $StateFile)) {
        return
    }

    try {
        $state = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
        if ($state.PSObject.Properties.Name -contains 'backend') {
            Stop-RememberedProcess -Entry $state.backend -Label 'backend'
        }
        if ($state.PSObject.Properties.Name -contains 'frontend') {
            Stop-RememberedProcess -Entry $state.frontend -Label 'frontend'
        }
    }
    catch {
        Write-Host "[WARN] Could not read previous CMP launcher state; continuing with port ownership checks."
    }
    finally {
        Remove-Item -LiteralPath $StateFile -Force -ErrorAction SilentlyContinue
    }

    Start-Sleep -Seconds 1
}

function Get-ListenerPids {
    param([int]$Port)

    # Query ALL listeners first: an empty filter is legitimate, but an unavailable
    # networking API is not. Fail closed rather than treating API errors as a free port.
    try {
        return @(
            Get-NetTCPConnection -State Listen -ErrorAction Stop |
                Where-Object { $_.LocalPort -eq $Port } |
                Select-Object -ExpandProperty OwningProcess -Unique
        )
    }
    catch {
        throw ("Cannot inspect TCP listener ownership for port {0}: {1}" -f $Port, $_.Exception.Message)
    }
}

function Stop-StaleCmpListenerOrFail {
    param(
        [int]$Port,
        [string[]]$RepoPaths
    )

    $listenerPids = @(Get-ListenerPids -Port $Port)
    foreach ($listenerPid in $listenerPids) {
        $win32 = Get-CimInstance Win32_Process -Filter "ProcessId = $listenerPid" -ErrorAction SilentlyContinue
        $commandLine = if ($null -ne $win32) { [string]$win32.CommandLine } else { '' }
        $processName = if ($null -ne $win32) { [string]$win32.Name } else { '' }

        $belongsToCmp = $false
        foreach ($repoPath in $RepoPaths) {
            # A matching directory substring alone must not authorize killing arbitrary processes.
            $repoPrefix = $repoPath.TrimEnd('\') + '\'
            if ($processName -ieq 'node.exe' -and
                -not [string]::IsNullOrWhiteSpace($commandLine) -and
                $commandLine.IndexOf($repoPrefix, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
                $belongsToCmp = $true
                break
            }
        }

        if ($belongsToCmp) {
            Write-Host "[STOP] Stale CMP listener PID $listenerPid on port $Port"
            & taskkill.exe /PID $listenerPid /T /F *> $null
        }
        else {
            throw "Port $Port is occupied by PID $listenerPid that cannot be verified as CMP-owned. Launcher will not kill an unrelated process."
        }
    }

    Start-Sleep -Milliseconds 500
    $remaining = @(Get-ListenerPids -Port $Port)
    if ($remaining.Count -gt 0) {
        throw "Port $Port is still occupied by PID(s): $($remaining -join ', ')."
    }
}

function Save-State {
    param(
        [System.Diagnostics.Process]$BackendProcess,
        [System.Diagnostics.Process]$FrontendProcess
    )

    $state = [ordered]@{
        backendPath = $BackendPath
        frontendPath = $FrontendPath
    }

    if ($null -ne $BackendProcess) {
        $state.backend = [ordered]@{
            pid = $BackendProcess.Id
            startTimeUtc = $BackendProcess.StartTime.ToUniversalTime().ToString('o')
        }
    }

    if ($null -ne $FrontendProcess) {
        $state.frontend = [ordered]@{
            pid = $FrontendProcess.Id
            startTimeUtc = $FrontendProcess.StartTime.ToUniversalTime().ToString('o')
        }
    }

    $state | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $StateFile -Encoding Ascii
}

function Start-CmpProcess {
    param(
        [string]$Label,
        [string]$WorkingDirectory,
        [string]$Command,
        [string]$StdoutPath,
        [string]$StderrPath
    )

    $quotedCommand = [char]34 + $Command + [char]34
    $argumentLine = '/d /s /c ' + $quotedCommand
    $process = Start-Process -FilePath $env:ComSpec -WorkingDirectory $WorkingDirectory -ArgumentList $argumentLine -WindowStyle Hidden -RedirectStandardOutput $StdoutPath -RedirectStandardError $StderrPath -PassThru
    Write-Host "[START] $Label launcher PID $($process.Id)"
    return $process
}

function Invoke-HttpProbe {
    param(
        [string]$Url,
        [int]$TimeoutSeconds = 5
    )

    # Loopback probes must not stall on a system proxy/PAC configuration.
    $handler = New-Object System.Net.Http.HttpClientHandler
    $handler.UseProxy = $false
    $client = [System.Net.Http.HttpClient]::new($handler)
    $client.Timeout = [TimeSpan]::FromSeconds($TimeoutSeconds)
    $response = $null

    try {
        $response = $client.GetAsync($Url, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
        $status = [int]$response.StatusCode
        return [pscustomobject]@{
            ok = ($status -ge 200 -and $status -lt 300)
            status = $status
            error = $null
        }
    }
    catch {
        $message = $_.Exception.GetBaseException().Message
        return [pscustomobject]@{
            ok = $false
            status = $null
            error = $message
        }
    }
    finally {
        if ($null -ne $response) {
            $response.Dispose()
        }
        $client.Dispose()
    }
}

function Test-TcpPort {
    param(
        [int]$Port,
        [int]$TimeoutMilliseconds = 800
    )

    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $async = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
        if (-not $async.AsyncWaitHandle.WaitOne($TimeoutMilliseconds)) {
            return $false
        }
        $client.EndConnect($async)
        return $true
    }
    catch {
        return $false
    }
    finally {
        $client.Close()
    }
}

function Wait-HttpReady {
    param(
        [string]$Label,
        [string]$Url,
        [System.Diagnostics.Process]$Process,
        [int]$MaxSeconds,
        [int]$ProbeTimeoutSeconds = 5
    )

    $watch = [System.Diagnostics.Stopwatch]::StartNew()
    $lastProbe = $null

    while ($watch.Elapsed.TotalSeconds -lt $MaxSeconds) {
        if ($Process.HasExited) {
            throw "$Label process exited before HTTP readiness (exit code $($Process.ExitCode))."
        }

        $lastProbe = Invoke-HttpProbe -Url $Url -TimeoutSeconds $ProbeTimeoutSeconds
        if ($lastProbe.ok) {
            Write-Host "[OK] $Label HTTP ready (status $($lastProbe.status))"
            return
        }

        Start-Sleep -Seconds 2
    }

    $reason = if ($null -ne $lastProbe -and -not [string]::IsNullOrWhiteSpace([string]$lastProbe.error)) { $lastProbe.error } else { 'no successful HTTP response' }
    throw "$Label did not become HTTP-ready within $MaxSeconds seconds: $reason"
}

function Confirm-FrontendStability {
    param(
        [System.Diagnostics.Process]$Process
    )

    # One successful response is not proof that the Vite browser UI stays usable.
    # Retry transient timeouts, but never convert an open TCP socket into HTTP PASS.
    $successes = 1
    $lastFailure = 'none'
    for ($attempt = 2; $attempt -le 9 -and $successes -lt 3; $attempt++) {
        Start-Sleep -Seconds 2
        if ($Process.HasExited) {
            throw "Frontend process exited after initial readiness (exit code $($Process.ExitCode))."
        }

        $timeout = if ($attempt -le 5) { 5 } else { 10 }
        $probe = Invoke-HttpProbe -Url 'http://127.0.0.1:5173/' -TimeoutSeconds $timeout
        if ($probe.ok) {
            $successes++
            continue
        }

        if (-not (Test-TcpPort -Port 5173)) {
            throw 'Frontend stopped listening on port 5173 after initial HTTP readiness.'
        }

        $lastFailure = if ($null -ne $probe.error) { [string]$probe.error } else { "HTTP status $($probe.status)" }
        Write-Host "[WARN] Frontend HTTP probe $attempt/9: $lastFailure"
    }

    if ($successes -lt 3) {
        throw "Frontend returned fewer than 3 successful HTTP responses; last failure: $lastFailure. Port listening alone is insufficient."
    }
    Write-Host "[OK] Frontend stability check: $successes successful HTTP probes."
}

function Show-LogTail {
    param(
        [string]$Path,
        [string]$Label
    )

    if (Test-Path -LiteralPath $Path) {
        Write-Host ''
        Write-Host "----- $Label (last 30 lines) -----"
        Get-Content -LiteralPath $Path -Tail 30 -ErrorAction SilentlyContinue
    }
}

$backendProcess = $null
$frontendProcess = $null

try {
    Write-Host ''
    Write-Host '============================================'
    Write-Host 'CMP - ONE CLICK'
    Write-Host '============================================'
    Write-Host "Backend : $BackendPath"
    Write-Host "Frontend: $FrontendPath"
    Write-Host "Branch  : $Branch"
    Write-Host "Logs    : $LogDir"
    Write-Host ''

    if ($null -eq (Get-Command git.exe -ErrorAction SilentlyContinue)) {
        throw 'git.exe was not found in PATH.'
    }
    if ($null -eq (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
        throw 'npm.cmd was not found in PATH.'
    }

    Assert-Repository -Label 'backend' -Path $BackendPath -ExpectedRepo $BackendRepo
    Assert-Repository -Label 'frontend' -Path $FrontendPath -ExpectedRepo $FrontendRepo

    Sync-Repository -Label 'backend' -Path $BackendPath | Out-Null
    Sync-Repository -Label 'frontend' -Path $FrontendPath | Out-Null

    Stop-PreviousCmpProcesses
    Stop-StaleCmpListenerOrFail -Port 3000 -RepoPaths @($BackendPath, $FrontendPath)
    Stop-StaleCmpListenerOrFail -Port 5173 -RepoPaths @($BackendPath, $FrontendPath)

    $backendCommand = 'call npm.cmd run db:recover:local && call npm.cmd run start:dev'
    $backendProcess = Start-CmpProcess -Label 'backend' -WorkingDirectory $BackendPath -Command $backendCommand -StdoutPath $BackendStdout -StderrPath $BackendStderr
    Save-State -BackendProcess $backendProcess -FrontendProcess $null

    Wait-HttpReady -Label 'Backend' -Url 'http://127.0.0.1:3000/health' -Process $backendProcess -MaxSeconds 180 -ProbeTimeoutSeconds 5

    $frontendCommand = 'call npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort'
    $frontendProcess = Start-CmpProcess -Label 'frontend' -WorkingDirectory $FrontendPath -Command $frontendCommand -StdoutPath $FrontendStdout -StderrPath $FrontendStderr
    Save-State -BackendProcess $backendProcess -FrontendProcess $frontendProcess

    Wait-HttpReady -Label 'Frontend' -Url 'http://127.0.0.1:5173/' -Process $frontendProcess -MaxSeconds 60 -ProbeTimeoutSeconds 5
    Confirm-FrontendStability -Process $frontendProcess

    Write-Host ''
    Write-Host '============================================'
    Write-Host 'CMP READY'
    Write-Host 'Backend : http://127.0.0.1:3000'
    Write-Host 'Frontend: http://127.0.0.1:5173'
    Write-Host "Logs    : $LogDir"
    Write-Host '============================================'
    Write-Host ''

    Start-Process 'http://127.0.0.1:5173/'
    exit 0
}
catch {
    Write-Host ''
    Write-Host "[FAIL] $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "[LOGS] $LogDir"

    Show-LogTail -Path $BackendStderr -Label 'backend.stderr.log'
    Show-LogTail -Path $BackendStdout -Label 'backend.stdout.log'
    Show-LogTail -Path $FrontendStderr -Label 'frontend.stderr.log'
    Show-LogTail -Path $FrontendStdout -Label 'frontend.stdout.log'

    exit 1
}
