param(
    [ValidateSet(4, 6)]
    [int]$Count = 6,
    [string]$BaseUrl = '',
    [string]$StarterProfile = '',
    [string]$Difficulty = '',
    [string]$Challenges = '',
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$root = Split-Path $PSScriptRoot -Parent
$sessionFile = Join-Path $env:TEMP 'cardbattler-ai-grid-session.json'

function Resolve-BrowserPath {
    $candidates = @(
        "$env:ProgramFiles(x86)\Microsoft\Edge\Application\msedge.exe",
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "$env:ProgramFiles(x86)\Google\Chrome\Application\chrome.exe",
        "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
    )
    return $candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
}

function Test-BaseUrl {
    param([string]$Url)

    if ([string]::IsNullOrWhiteSpace($Url)) { return $false }
    try {
        Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3 | Out-Null
        return $true
    } catch {
        return $false
    }
}

function Wait-ForBaseUrl {
    param(
        [string]$Url,
        [int]$TimeoutSeconds = 60
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-BaseUrl $Url) { return $true }
        Start-Sleep -Seconds 1
    }
    return $false
}

function Build-LaunchUrl {
    param(
        [string]$ResolvedBaseUrl,
        [string]$Playstyle
    )

    $builder = [System.UriBuilder]::new($ResolvedBaseUrl)
    $params = [System.Collections.Specialized.NameValueCollection]::new()
    $params['ai'] = 'true'
    $params['autoRun'] = 'true'
    $params['playtest'] = '1'
    $params['playstyle'] = $Playstyle
    $params['seedMode'] = 'sensible'
    $params['randomize'] = 'true'
    $params['speed'] = '150'
    if ($StarterProfile) { $params['starterProfile'] = $StarterProfile }
    if ($Difficulty) { $params['difficulty'] = $Difficulty }
    if ($Challenges) { $params['challenges'] = $Challenges }

    $queryPairs = foreach ($key in $params.AllKeys) {
        '{0}={1}' -f [System.Uri]::EscapeDataString($key), [System.Uri]::EscapeDataString($params[$key])
    }
    $builder.Query = ($queryPairs -join '&')
    return $builder.Uri.AbsoluteUri
}

$browser = Resolve-BrowserPath
if (-not $browser) {
    throw 'Could not find Edge or Chrome. Install one of them or update tools\launch-ai-grid.ps1.'
}

if (Test-Path $sessionFile) {
    try {
        $oldSession = Get-Content $sessionFile -Raw | ConvertFrom-Json
        foreach ($oldPid in ($oldSession.browserPids | Where-Object { $_ })) {
            $proc = Get-Process -Id $oldPid -ErrorAction SilentlyContinue
            if ($proc) { $proc.Kill() }
        }
        if ($oldSession.serverPid) {
            $serverProc = Get-Process -Id $oldSession.serverPid -ErrorAction SilentlyContinue
            if ($serverProc) { $serverProc.Kill() }
        }
    } catch {
        Write-Host "Previous AI grid session file was unreadable. Starting fresh."
    }
    Remove-Item $sessionFile -Force -ErrorAction SilentlyContinue
}

0..5 | ForEach-Object {
    $profileDir = Join-Path $env:TEMP "cardbattler-ai-grid-$_"
    if (Test-Path $profileDir) {
        Remove-Item $profileDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

$resolvedBaseUrl = $BaseUrl
if (-not $resolvedBaseUrl) {
    foreach ($candidate in @('http://127.0.0.1:5173/', 'http://127.0.0.1:4173/')) {
        if (Test-BaseUrl $candidate) {
            $resolvedBaseUrl = $candidate
            break
        }
    }
}

$serverPid = $null
if (-not $resolvedBaseUrl) {
    $launchCommand = "Set-Location '$root'; npm.cmd run playtest:dev"
    if ($DryRun) {
        $resolvedBaseUrl = 'http://127.0.0.1:5173/'
        Write-Host "[dry-run] Would start dev server with: $launchCommand"
    } else {
        $serverProcess = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoExit', '-Command', $launchCommand) -PassThru
        $serverPid = $serverProcess.Id
        $resolvedBaseUrl = 'http://127.0.0.1:5173/'
        if (-not (Wait-ForBaseUrl -Url $resolvedBaseUrl -TimeoutSeconds 60)) {
            throw "Timed out waiting for $resolvedBaseUrl after starting the dev server."
        }
    }
}

$allPlaystyles = @('balanced', 'aggressive', 'defensive', 'buffDebuff', 'preservation', 'mutationPusher')
$playstyles = $allPlaystyles[0..($Count - 1)]
$positions = @(
    @(0, 0),
    @(680, 0),
    @(0, 540),
    @(680, 540),
    @(620, 180),
    @(760, 260)
)
$ports = @(19222, 19223, 19224, 19225, 19226, 19227)
$windowWidth = 660
$windowHeight = 520
$browserPids = @()

Write-Host "Using browser: $browser"
Write-Host "Using base URL: $resolvedBaseUrl"
Write-Host "Launching $Count AI window(s)..."

for ($i = 0; $i -lt $Count; $i++) {
    $playstyle = $playstyles[$i]
    $x = $positions[$i][0]
    $y = $positions[$i][1]
    $port = $ports[$i]
    $profileDir = Join-Path $env:TEMP "cardbattler-ai-grid-$i"
    $url = Build-LaunchUrl -ResolvedBaseUrl $resolvedBaseUrl -Playstyle $playstyle
    $browserArgs = @(
        "--user-data-dir=$profileDir",
        '--new-window',
        "--window-position=$x,$y",
        "--window-size=$windowWidth,$windowHeight",
        "--remote-debugging-port=$port",
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        $url
    )

    if ($DryRun) {
        Write-Host "[dry-run] [$playstyle] port $port -> $url"
        continue
    }

    $proc = Start-Process -FilePath $browser -ArgumentList $browserArgs -PassThru
    $browserPids += $proc.Id
    Write-Host "[$playstyle] PID $($proc.Id) port $port"
    Start-Sleep -Milliseconds 700
}

if (-not $DryRun) {
    @{
        browserPath = $browser
        baseUrl = $resolvedBaseUrl
        browserPids = $browserPids
        ports = $ports[0..($Count - 1)]
        playstyles = $playstyles
        serverPid = $serverPid
    } | ConvertTo-Json | Set-Content $sessionFile

    Write-Host ''
    Write-Host "AI grid launched. Session saved to $sessionFile"
    Write-Host 'Use close-ai-grid.bat to export the run data and close the windows.'
}
