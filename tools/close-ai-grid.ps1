param(
    [switch]$LeaveServerRunning
)

$ErrorActionPreference = 'Continue'
$sessionFile = Join-Path $env:TEMP 'cardbattler-ai-grid-session.json'

if (-not (Test-Path $sessionFile)) {
    throw "No AI grid session file found at $sessionFile"
}

$session = Get-Content $sessionFile -Raw | ConvertFrom-Json

function Invoke-CDP {
    param(
        [int]$Port,
        [string]$Expression,
        [int]$TimeoutMs = 8000
    )

    try {
        $tabs = $null
        for ($attempt = 0; $attempt -lt 3; $attempt++) {
            try {
                $tabs = Invoke-RestMethod "http://127.0.0.1:$Port/json" -TimeoutSec 4 -ErrorAction Stop
                break
            } catch {
                if ($attempt -lt 2) { Start-Sleep -Milliseconds 500 }
            }
        }
        if (-not $tabs) { return $false }

        $tab = $tabs | Where-Object { $_.type -eq 'page' } | Select-Object -First 1
        if (-not $tab -or -not $tab.webSocketDebuggerUrl) { return $false }

        $ws = [System.Net.WebSockets.ClientWebSocket]::new()
        $cts = [System.Threading.CancellationTokenSource]::new($TimeoutMs)
        $ws.ConnectAsync([Uri]$tab.webSocketDebuggerUrl, $cts.Token).Wait()

        $message = @{
            id = 1
            method = 'Runtime.evaluate'
            params = @{
                expression = $Expression
                awaitPromise = $true
            }
        } | ConvertTo-Json -Compress

        $bytes = [System.Text.Encoding]::UTF8.GetBytes($message)
        $segment = [ArraySegment[byte]]::new($bytes)
        $ws.SendAsync($segment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $cts.Token).Wait()

        $buffer = [byte[]]::new(4096)
        $bufferSegment = [ArraySegment[byte]]::new($buffer)
        $ws.ReceiveAsync($bufferSegment, $cts.Token).Wait(3000) | Out-Null

        $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, '', $cts.Token).Wait()
        $ws.Dispose()
        $cts.Dispose()
        return $true
    } catch {
        return $false
    }
}

Write-Host 'Triggering exports...'
for ($i = 0; $i -lt $session.ports.Count; $i++) {
    $port = $session.ports[$i]
    $playstyle = if ($session.playstyles[$i]) { $session.playstyles[$i] } else { "window-$i" }
    $ok = Invoke-CDP -Port $port -Expression 'typeof window.exportGameData === "function" ? window.exportGameData().then(() => "ok").catch(e => String(e)) : Promise.resolve("missing")'
    if ($ok) {
        Write-Host "[$playstyle] export triggered"
    } else {
        Write-Host "[$playstyle] export skipped"
    }
    Start-Sleep -Milliseconds 250
}

# Give browser-managed downloads time to flush before we kill the windows.
Start-Sleep -Seconds 12

Write-Host 'Closing browser windows...'
foreach ($browserPid in ($session.browserPids | Where-Object { $_ })) {
    try {
        $proc = Get-Process -Id $browserPid -ErrorAction SilentlyContinue
        if (-not $proc) { continue }
        $proc.CloseMainWindow() | Out-Null
        $proc.WaitForExit(3000) | Out-Null
        if (-not $proc.HasExited) {
            $proc.Kill()
        }
        Write-Host "Closed PID $browserPid"
    } catch {
        Write-Host "Failed to close PID $browserPid"
    }
}

if (-not $LeaveServerRunning -and $session.serverPid) {
    try {
        $serverProc = Get-Process -Id $session.serverPid -ErrorAction SilentlyContinue
        if ($serverProc) {
            $serverProc.Kill()
            Write-Host "Stopped dev server PID $($session.serverPid)"
        }
    } catch {
        Write-Host "Failed to stop dev server PID $($session.serverPid)"
    }
}

Remove-Item $sessionFile -Force -ErrorAction SilentlyContinue
Write-Host 'AI grid session closed.'
