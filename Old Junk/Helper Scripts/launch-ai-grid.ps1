# Cardbattler AI Grid Launcher
# Layout: 2x2 grid (top-left) + 2 centred windows that can overlap
#
#   [Balanced]    [Aggressive]
#   [Defensive]   [Buff/Debuff]
#          [Preservation]    <- centred
#        [Mutation Pusher]   <- centred, offset

# Find Chrome — check both standard and x86 Program Files
$chromePaths = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$chrome = $chromePaths | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) {
    Write-Host "[ERROR] Chrome not found. Add your chrome.exe path to the chromePaths list in launch-ai-grid.ps1"
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "Using Chrome: $chrome"

# Kill any leftover cb-ai Chrome instances from a previous session
$sessionFile = "$env:TEMP\cb-ai-session.json"
if (Test-Path $sessionFile) {
    Write-Host "Cleaning up previous session..."
    $oldSession = Get-Content $sessionFile | ConvertFrom-Json
    foreach ($oldPid in $oldSession.pids) {
        $proc = Get-Process -Id $oldPid -ErrorAction SilentlyContinue
        if ($proc) { $proc.Kill(); Write-Host "  Killed old PID $oldPid" }
    }
    Remove-Item $sessionFile -Force
}

# Clear old temp profiles so --window-position flags are respected
Write-Host "Clearing old temp profiles..."
0..5 | ForEach-Object {
    $dir = "$env:TEMP\cb-ai-$_"
    if (Test-Path $dir) { Remove-Item $dir -Recurse -Force -ErrorAction SilentlyContinue }
}

$winW = 640
$winH = 490

# Remote debugging ports (high range to avoid conflicts with any existing Chrome)
$debugPorts = @(19222, 19223, 19224, 19225, 19226, 19227)

$playstyles = @('balanced','aggressive','defensive','buffDebuff','preservation','mutationPusher')
$positions  = @(
    @(0,   0),    # balanced      top-left
    @(640, 0),    # aggressive    top-right
    @(0,   490),  # defensive     bottom-left
    @(640, 490),  # buffDebuff    bottom-right
    @(610, 220),  # preservation  centred
    @(670, 260)   # mutationPusher centred + offset
)

Write-Host "Launching 6 AI windows..."

$procIds = @()

for ($i = 0; $i -lt 6; $i++) {
    $ps   = $playstyles[$i]
    $x    = $positions[$i][0]
    $y    = $positions[$i][1]
    $port = $debugPorts[$i]
    $url  = "http://localhost:5173/?playstyle=$ps&seedMode=sensible&randomize=true&ai=true&speed=150"

    # NOTE: $args is a reserved PowerShell variable — use $chromeArgs instead
    $chromeArgs = @(
        "--user-data-dir=$env:TEMP\cb-ai-$i",
        "--window-position=$x,$y",
        "--window-size=$winW,$winH",
        "--remote-debugging-port=$port",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-extensions",
        $url
    )
    Write-Host "  [$ps] port $port  pos ($x,$y)"
    $proc = Start-Process -FilePath $chrome -ArgumentList $chromeArgs -PassThru
    $procIds += $proc.Id
    Start-Sleep -Milliseconds 1000
}

# Save session info so close-ai-grid.ps1 can find and export each instance
$session = @{ pids = $procIds; ports = $debugPorts; playstyles = $playstyles }
$session | ConvertTo-Json | Set-Content $sessionFile

Write-Host ""
Write-Host "Done! All 6 windows launched."
Write-Host "Session saved to $sessionFile"
Write-Host "Run close-ai-grid.bat when you want to export data and close all windows."
