param(
    [string]$DesktopPath = [Environment]::GetFolderPath('DesktopDirectory'),
    [switch]$RepairKnownPartialShortcut
)

$ErrorActionPreference = 'Stop'
$demoDirectory = $PSScriptRoot
$startEntry = Join-Path $demoDirectory 'cmp-demo-desktop-start.vbs'
$accountEntry = Join-Path $demoDirectory 'cmp-demo-account-picker.vbs'
$wscriptPath = Join-Path $env:WINDIR 'System32\wscript.exe'
$shortcuts = @(
    [pscustomobject]@{ Name = 'CMP DEMO.lnk'; Entry = $startEntry; Description = 'Mở phần mềm CMP DEMO'; RepairablePartial = $true; }
    [pscustomobject]@{ Name = 'CMP - Tài khoản DEMO.lnk'; Entry = $accountEntry; Description = 'Chọn tài khoản đăng nhập CMP DEMO'; RepairablePartial = $false; }
)

if (-not (Test-Path -LiteralPath $DesktopPath -PathType Container)) {
    throw 'Không tìm thấy thư mục Desktop của tài khoản Windows hiện tại.'
}
if (-not (Test-Path -LiteralPath $wscriptPath -PathType Leaf)) {
    throw 'Không tìm thấy Windows Script Host.'
}
foreach ($shortcut in $shortcuts) {
    if (-not (Test-Path -LiteralPath $shortcut.Entry -PathType Leaf)) {
        throw "Thiếu thành phần shortcut: $($shortcut.Name)"
    }
}

Add-Type -TypeDefinition @'
using System.Text;
using System.Runtime.InteropServices;
public static class CmpDemoPath {
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern uint GetShortPathName(string longPath, StringBuilder shortPath, uint bufferLength);
    [DllImport("kernel32.dll")]
    public static extern uint GetACP();
}
'@

function Get-ShortPath([string]$Path) {
    $buffer = [System.Text.StringBuilder]::new(32768)
    $length = [CmpDemoPath]::GetShortPathName($Path, $buffer, [uint32]$buffer.Capacity)
    if ($length -eq 0 -or $length -ge $buffer.Capacity) {
        throw "Không chuyển được đường dẫn sang dạng Windows an toàn: $([IO.Path]::GetFileName($Path))"
    }
    return $buffer.ToString()
}

function ConvertTo-ActiveCodePage([string]$Value) {
    $encoding = [System.Text.Encoding]::GetEncoding([int][CmpDemoPath]::GetACP())
    return $encoding.GetString($encoding.GetBytes($Value))
}

$shortDemoDirectory = Get-ShortPath $demoDirectory
$shell = New-Object -ComObject WScript.Shell
$plans = foreach ($shortcut in $shortcuts) {
    $destination = Join-Path $DesktopPath $shortcut.Name
    $shortEntry = Get-ShortPath $shortcut.Entry
    $arguments = '"' + $shortEntry + '"'
    $state = 'create'
    if (Test-Path -LiteralPath $destination) {
        $existing = $shell.CreateShortcut((Get-ShortPath $destination))
        $matchesCorrectLink = $existing.TargetPath -ieq $wscriptPath -and
            $existing.Arguments -ceq $arguments -and
            $existing.WorkingDirectory -ceq $shortDemoDirectory
        if ($matchesCorrectLink) {
            $state = 'keep'
        }
        elseif ($RepairKnownPartialShortcut -and $shortcut.RepairablePartial -and
            $existing.TargetPath -ieq $wscriptPath -and
            $existing.Arguments -ceq (ConvertTo-ActiveCodePage ('"' + $shortcut.Entry + '"')) -and
            $existing.WorkingDirectory -ceq (ConvertTo-ActiveCodePage $demoDirectory)) {
            $state = 'repair-known-partial'
        }
        else {
            throw "Đã có mục Desktop không khớp shortcut CMP; không ghi đè: $($shortcut.Name)"
        }
    }
    [pscustomobject]@{
        Name = $shortcut.Name
        Entry = $shortcut.Entry
        Arguments = $arguments
        Destination = $destination
        Description = $shortcut.Description
        State = $state
    }
}

foreach ($plan in $plans) {
    if ($plan.State -eq 'keep') { continue }

    if ($plan.Name -eq 'CMP DEMO.lnk') {
        $link = $shell.CreateShortcut($plan.Destination)
        $link.TargetPath = $wscriptPath
        $link.Arguments = $plan.Arguments
        $link.WorkingDirectory = $shortDemoDirectory
        $link.Description = $plan.Description
        $link.WindowStyle = 7
        $link.Save()
        continue
    }

    # WScript.Shell saves ANSI-only link filenames on some Windows locales.
    # Save an ASCII staging link, then move it with .NET's Unicode-safe API.
    $staging = Join-Path $DesktopPath ('CMP-DEMO-ACCOUNTS-' + [guid]::NewGuid().ToString('N') + '.lnk')
    try {
        $link = $shell.CreateShortcut($staging)
        $link.TargetPath = $wscriptPath
        $link.Arguments = $plan.Arguments
        $link.WorkingDirectory = $shortDemoDirectory
        $link.Description = $plan.Description
        $link.WindowStyle = 7
        $link.Save()
        [System.IO.File]::Move($staging, $plan.Destination)
    }
    catch {
        if (Test-Path -LiteralPath $staging) { [System.IO.File]::Delete($staging) }
        throw
    }
}

foreach ($plan in $plans) {
    $actual = $shell.CreateShortcut((Get-ShortPath $plan.Destination))
    if ($actual.TargetPath -ine $wscriptPath -or
        $actual.Arguments -cne $plan.Arguments -or
        $actual.WorkingDirectory -cne $shortDemoDirectory) {
        throw "Không xác minh được shortcut sau khi cài: $($plan.Name)"
    }
}

Write-Output "Đã xác minh/cài shortcut CMP DEMO và tài khoản trên Desktop: $DesktopPath"
