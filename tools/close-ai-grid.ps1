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
        [string]$PreferredBaseUrl = '',
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

        $tabCandidates = $tabs | Where-Object { $_.type -eq 'page' -and $_.webSocketDebuggerUrl }
        if (-not $tabCandidates) { return $false }

        $normalizedBaseUrl = if ($PreferredBaseUrl) { $PreferredBaseUrl.TrimEnd('/') } else { '' }
        $tab = $null
        if ($normalizedBaseUrl) {
            $tab = $tabCandidates | Where-Object {
                $_.url -and $_.url.TrimEnd('/').StartsWith($normalizedBaseUrl)
            } | Select-Object -First 1
        }
        if (-not $tab) {
            $tab = $tabCandidates | Where-Object { $_.url -and $_.url -notmatch '^(about:blank|chrome://newtab/?|data:,?)$' } | Select-Object -First 1
        }
        if (-not $tab) {
            $tab = $tabCandidates | Select-Object -First 1
        }
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
                returnByValue = $true
            }
        } | ConvertTo-Json -Compress

        $bytes = [System.Text.Encoding]::UTF8.GetBytes($message)
        $segment = [ArraySegment[byte]]::new($bytes)
        $ws.SendAsync($segment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $cts.Token).Wait()

        $responseText = $null
        for ($messageIndex = 0; $messageIndex -lt 20; $messageIndex++) {
            $buffer = [byte[]]::new(8192)
            $bufferSegment = [ArraySegment[byte]]::new($buffer)
            $messageBuilder = [System.Text.StringBuilder]::new()
            do {
                $receiveTask = $ws.ReceiveAsync($bufferSegment, $cts.Token)
                $receiveTask.Wait(3000) | Out-Null
                $result = $receiveTask.Result
                if ($result.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) {
                    break
                }
                if ($result.Count -gt 0) {
                    [void]$messageBuilder.Append([System.Text.Encoding]::UTF8.GetString($buffer, 0, $result.Count))
                }
            } until ($result.EndOfMessage)
            if ($result.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) {
                break
            }
            $candidateText = $messageBuilder.ToString()
            if ([string]::IsNullOrWhiteSpace($candidateText)) {
                continue
            }
            try {
                $candidate = $candidateText | ConvertFrom-Json
                if ($candidate.id -eq 1) {
                    $responseText = $candidateText
                    break
                }
            } catch {
                continue
            }
        }

        $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, '', $cts.Token).Wait()
        $ws.Dispose()
        $cts.Dispose()

        if (-not $responseText) {
            return [pscustomobject]@{
                ok = $false
                status = 'missing-response'
                tabUrl = $tab.url
            }
        }

        $response = $responseText | ConvertFrom-Json
        if ($response.exceptionDetails) {
            return [pscustomobject]@{
                ok = $false
                status = 'exception'
                tabUrl = $tab.url
                detail = $response.exceptionDetails.text
            }
        }

        $value = $response.result.result.value
        return [pscustomobject]@{
            ok = ($value -eq 'ok')
            status = if ($null -ne $value) { [string]$value } else { 'no-value' }
            tabUrl = $tab.url
        }
    } catch {
        return [pscustomobject]@{
            ok = $false
            status = 'transport-error'
            detail = $_.Exception.Message
        }
    }
}

Write-Host 'Triggering exports...'
for ($i = 0; $i -lt $session.ports.Count; $i++) {
    $port = $session.ports[$i]
    $playstyle = if ($session.playstyles[$i]) { $session.playstyles[$i] } else { "window-$i" }
    $expressions = @(
        'typeof window.exportGameData === "function" ? window.exportGameData().then(() => "ok").catch(e => "error:" + String(e)) : Promise.resolve("missing")',
        'typeof window.exportCurrentGameData === "function" ? window.exportCurrentGameData().then(() => "ok").catch(e => "error:" + String(e)) : Promise.resolve("missing")'
    )
    $result = $null
    for ($attempt = 1; $attempt -le 2; $attempt++) {
        foreach ($expression in $expressions) {
            $result = Invoke-CDP -Port $port -PreferredBaseUrl $session.baseUrl -Expression $expression -TimeoutMs 15000
            if ($result.ok) {
                break
            }
            if ($result.status -eq 'missing') {
                continue
            }
        }
        if ($result.ok) {
            break
        }
        if ($attempt -lt 2) {
            Start-Sleep -Seconds 2
        }
    }

    if ($result.ok) {
        Write-Host "[$playstyle] export complete via $($result.tabUrl)"
    } else {
        $detail = if ($result.detail) { " ($($result.detail))" } else { '' }
        $tabUrl = if ($result.tabUrl) { " via $($result.tabUrl)" } else { '' }
        Write-Host "[$playstyle] export $($result.status)$tabUrl$detail"
    }
    Start-Sleep -Milliseconds 1000
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
