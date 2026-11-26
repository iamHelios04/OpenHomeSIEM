param([switch]$SourceBuild)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

function Get-EnvValue([string]$Name, [string]$Default) {
    $line = Get-Content -LiteralPath '.env' | Where-Object { $_ -match "^$Name=" } | Select-Object -Last 1
    if ($line) { return $line.Substring($Name.Length + 1) }
    return $Default
}

function Set-EnvValue([string]$Name, [string]$Value) {
    $contents = Get-Content -LiteralPath '.env' -Raw
    if ($contents -match "(?m)^$Name=") {
        $contents = [regex]::Replace($contents, "(?m)^$Name=.*$", "$Name=$Value")
    } else {
        $contents = $contents.TrimEnd() + "`n$Name=$Value`n"
    }
    [System.IO.File]::WriteAllText((Join-Path $PSScriptRoot '.env'), $contents, [System.Text.UTF8Encoding]::new($false))
}

function Invoke-Compose([string[]]$Arguments) {
    $composeFiles = @()
    $buildSetting = Get-EnvValue 'BUILD_FROM_SOURCE' 'false'
    if ($buildSetting -eq 'true') {
        $composeFiles = @('-f', 'docker-compose.yml', '-f', 'docker-compose.source.yml')
    }
    & docker compose @composeFiles @Arguments
    if ($LASTEXITCODE -ne 0) { throw 'Docker Compose command failed. See the Docker output above.' }
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker is not installed. Install Docker Desktop, start it, then run install.cmd again.'
}
docker compose version *> $null
if ($LASTEXITCODE -ne 0) { throw 'Docker Compose is not available. Update Docker Desktop and try again.' }
docker info *> $null
if ($LASTEXITCODE -ne 0) { throw 'Docker is installed but not running. Start Docker Desktop and run install.cmd again.' }

if (-not (Test-Path -LiteralPath '.env')) {
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    $secret = [Convert]::ToBase64String($bytes)
    $contents = [regex]::Replace((Get-Content -LiteralPath '.env.example' -Raw), '(?m)^SECRET_KEY=.*$', "SECRET_KEY=$secret")
    [System.IO.File]::WriteAllText((Join-Path $PSScriptRoot '.env'), $contents, [System.Text.UTF8Encoding]::new($false))
    Write-Host 'Created a local .env file with a random secret key.'
}
if ($SourceBuild) { Set-EnvValue 'BUILD_FROM_SOURCE' 'true' }
if (-not (Test-Path -LiteralPath 'data')) { New-Item -ItemType Directory -Path 'data' | Out-Null }

try {
    Invoke-Compose @('config', '--quiet')
} catch {
    throw 'Docker Compose configuration is invalid. Check the .env file.'
}

$buildFromSource = (Get-EnvValue 'BUILD_FROM_SOURCE' 'false') -eq 'true'
if (-not $buildFromSource) {
    try {
        Invoke-Compose @('pull')
    } catch {
        throw 'Could not pull the published images. Check your internet connection and GHCR_OWNER/IMAGE_TAG in .env.'
    }
}
if ($buildFromSource) {
    try {
        Invoke-Compose @('up', '--build', '-d')
    } catch {
        Write-Host 'Startup failed. If a port is busy, change WEB_PORT, SYSLOG_UDP_PORT, or SYSLOG_TCP_PORT in .env.' -ForegroundColor Yellow
        throw
    }
} else {
    try {
        Invoke-Compose @('up', '-d')
    } catch {
        Write-Host 'Startup failed. If a port is busy, change WEB_PORT, SYSLOG_UDP_PORT, or SYSLOG_TCP_PORT in .env.' -ForegroundColor Yellow
        throw
    }
}
if ($LASTEXITCODE -ne 0) {
    Write-Host 'Startup failed. If a port is busy, change WEB_PORT, SYSLOG_UDP_PORT, or SYSLOG_TCP_PORT in .env.' -ForegroundColor Yellow
    throw 'OpenHomeSIEM could not start. See the Docker output above.'
}

$webPort = Get-EnvValue 'WEB_PORT' '8080'
$healthy = $false
for ($attempt = 0; $attempt -lt 45; $attempt++) {
    try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:$webPort/api/health" -TimeoutSec 3
        if ($health.status -eq 'ok') { $healthy = $true; break }
    } catch {
        if ($attempt -eq 44) { Write-Verbose $_ }
    }
    Start-Sleep -Seconds 2
}
if (-not $healthy) {
    Invoke-Compose @('ps')
    throw 'The services started but the API did not become healthy. Run: docker compose logs --tail=100'
}

$udpPort = Get-EnvValue 'SYSLOG_UDP_PORT' '5514'
$tcpPort = Get-EnvValue 'SYSLOG_TCP_PORT' '6601'
try {
    $page = Invoke-WebRequest -Uri "http://127.0.0.1:$webPort/" -UseBasicParsing -TimeoutSec 10
    if ($page.StatusCode -ne 200) { throw 'Unexpected dashboard response.' }
} catch {
    Invoke-Compose @('ps')
    throw "The API is healthy but the dashboard did not respond on port $webPort. Check WEB_PORT in .env."
}
Write-Host ''
Write-Host 'OpenHomeSIEM is installed and running.' -ForegroundColor Green
Write-Host "Dashboard:  http://localhost:$webPort"
Write-Host "API health: http://localhost:$webPort/api/health"
Write-Host "Router syslog: UDP port $udpPort (recommended) or TCP port $tcpPort"
Write-Host 'Next: configure the router to send syslog to this computer’s LAN IP, then allow that UDP port through the computer firewall.'
