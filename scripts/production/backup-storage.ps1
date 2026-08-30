param(
    [Parameter(Mandatory = $true)][string]$SourceRoot,
    [Parameter(Mandatory = $true)][string]$DestinationRoot
)

$ErrorActionPreference = 'Stop'
$source = [System.IO.Path]::GetFullPath($SourceRoot)
$destination = [System.IO.Path]::GetFullPath($DestinationRoot)
if (-not (Test-Path -LiteralPath $source -PathType Container)) { throw "SourceRoot does not exist: $source" }
if ($destination.StartsWith($source, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'DestinationRoot must not be inside SourceRoot.' }
if (Test-Path -LiteralPath $destination) {
    $existing = @(Get-ChildItem -LiteralPath $destination -Force -ErrorAction Stop)
    if ($existing.Count -gt 0) { throw 'DestinationRoot must be a new/empty snapshot directory. Existing backup snapshots are immutable.' }
}
New-Item -ItemType Directory -Force -Path $destination | Out-Null
$dataDestination = Join-Path $destination 'storage'
New-Item -ItemType Directory -Force -Path $dataDestination | Out-Null

$robocopy = Get-Command robocopy.exe -ErrorAction SilentlyContinue
if (-not $robocopy) { throw 'robocopy.exe is required on Windows for the storage backup script.' }
& $robocopy.Source $source $dataDestination /E /COPY:DAT /DCOPY:DAT /R:2 /W:2 /XJ /NFL /NDL /NP
$code = $LASTEXITCODE
if ($code -ge 8) { throw "robocopy failed with exit code $code" }

$sourceFiles = @(Get-ChildItem -LiteralPath $source -File -Recurse -Force)
$destinationFiles = @(Get-ChildItem -LiteralPath $dataDestination -File -Recurse -Force)
if ($sourceFiles.Count -ne $destinationFiles.Count) { throw "File-count verification failed: source=$($sourceFiles.Count), destination=$($destinationFiles.Count)" }

$manifest = [ordered]@{
    source = $source
    snapshot_root = $destination
    data_directory = $dataDestination
    completed_at_utc = [DateTime]::UtcNow.ToString('o')
    files = $sourceFiles.Count
    verification = 'FILE_COUNT_PASS'
    immutable_snapshot = $true
}
$manifest | ConvertTo-Json | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $destination 'cmp-storage-backup-manifest.json')
Write-Host "STORAGE BACKUP: PASS ($($sourceFiles.Count) files)"
