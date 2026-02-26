# Cardbattler AI Grid Closer
# 1. Connects to each Chrome instance via CDP (remote debugging protocol)
# 2. Calls window.exportGameData() to trigger a JSON save in each window
# 3. Waits for file writes to complete
# 4. Gracefully closes each Chrome instance

$sessionFile = "$env:TEMP\cb-ai-session.json"
if (-not (Test-Path $sessionFile)) {
    Write-Host "[ERROR] No session file found at $sessionFile"
    Write-Host "Launch the grid first with launch-ai-grid.bat"
    Read-Host "Press Enter to exit"
    exit 1
}

$session    = Get-Content $sessionFile | ConvertFrom-Json
$ports      = $session.ports
$savedPids  = $session.pids
$playstyles = $session.playstyles

# ── CDP helper: evaluate JS in the first page tab on a given port ────────────
function Invoke-CDP {
    param([int]$Port, [string]$Expression, [int]$TimeoutMs = 8000)

    try {
        # Get list of debuggable tabs — retry a couple of times if Chrome isn't ready
        $tabs = $null
        for ($attempt = 0; $attempt -lt 3; $attempt++) {
            try {
                $tabs = Invoke-RestMethod "http://localhost:$Port/json" -TimeoutSec 4 -ErrorAction Stop
                break
            } catch {
                if ($attempt -lt 2) { Start-Sleep -Milliseconds 500 }
            }
        }
        if (-not $tabs) { Write-Host "  Could not reach CDP on port $Port"; return $false }

        $tab = $tabs | Where-Object { $_.type -eq 'page' } | Select-Object -First 1
        if (-not $tab) { Write-Host "  No page tab found on port $Port"; return $false }

        $wsUrl = $tab.webSocketDebuggerUrl
        if (-not $wsUrl) { Write-Host "  No webSocketDebuggerUrl on port $Port"; return $false }

        # Open WebSocket and send Runtime.evaluate
        $ws  = [System.Net.WebSockets.ClientWebSocket]::new()
        $cts = [System.Threading.CancellationTokenSource]::new($TimeoutMs)
        $ws.ConnectAsync([Uri]$wsUrl, $cts.Token).Wait()

        $msg   = @{ id = 1; method = 'Runtime.evaluate'; params = @{ expression = $Expression; awaitPromise = $true } } | ConvertTo-Json -Compress
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($msg)
        $seg   = [ArraySegment[byte]]::new($bytes)
        $ws.SendAsync($seg, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $cts.Token).Wait()

        # Read the response to confirm execution
        $buf     = [byte[]]::new(4096)
        $bufSeg  = [ArraySegment[byte]]::new($buf)
        $result  = $ws.ReceiveAsync($bufSeg, $cts.Token).Wait(3000)

        $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, '', $cts.Token).Wait()
        $ws.Dispose()
        $cts.Dispose()
        return $true
    }
    catch {
        Write-Host "  CDP error on port $Port`: $_"
        return $false
    }
}

# ── Step 1: Trigger export in every window ───────────────────────────────────
Write-Host ""
Write-Host "Triggering export in each window..."
$exportCount = 0
for ($i = 0; $i -lt $ports.Count; $i++) {
    $port = $ports[$i]
    $ps   = if ($playstyles -and $playstyles[$i]) { $playstyles[$i] } else { "window $i" }
    Write-Host "  [$ps] port $port..."
    $ok = Invoke-CDP -Port $port -Expression 'typeof window.exportGameData === "function" ? window.exportGameData().then(() => "exported").catch(e => "error: " + e) : Promise.resolve("no function")'
    if ($ok) { Write-Host "    Export triggered"; $exportCount++ }
    else     { Write-Host "    Skipped (window may already be closed)" }
    Start-Sleep -Milliseconds 300
}

# ── Step 2: Wait for file writes to complete ─────────────────────────────────
Write-Host ""
if ($exportCount -gt 0) {
    Write-Host "Waiting 6 seconds for exports to finish writing..."
    Start-Sleep -Seconds 6
} else {
    Write-Host "No exports triggered (all windows may have been closed already)."
}

# ── Step 3: Close each Chrome instance ───────────────────────────────────────
Write-Host "Closing Chrome instances..."
foreach ($procId in $savedPids) {
    try {
        $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
        if (-not $proc) { Write-Host "  PID $procId already gone"; continue }
        # Try graceful close first (triggers beforeunload)
        $proc.CloseMainWindow() | Out-Null
        $proc.WaitForExit(3000) | Out-Null
        # Force kill if still running
        if (-not $proc.HasExited) {
            $proc.Kill()
            Write-Host "  Force-killed PID $procId"
        } else {
            Write-Host "  Closed PID $procId"
        }
    }
    catch { Write-Host "  PID $procId: $_" }
}

# Clean up session file
Remove-Item $sessionFile -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Done. Check your configured save folder (or Downloads) for ai_runs_*.json files."
