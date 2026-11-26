$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Test-Path -LiteralPath '.env')) { & (Join-Path $PSScriptRoot 'install.ps1'); return }
$sourceLine = Get-Content -LiteralPath '.env' | Where-Object { $_ -match '^BUILD_FROM_SOURCE=' } | Select-Object -Last 1
$composeFiles = @()
if ($sourceLine -eq 'BUILD_FROM_SOURCE=true') {
    $composeFiles = @('-f', 'docker-compose.yml', '-f', 'docker-compose.source.yml')
    docker compose @composeFiles up --build -d
} else {
    docker compose up -d
}
if ($LASTEXITCODE -ne 0) { throw 'Could not start OpenHomeSIEM. Check that Docker Desktop is running.' }
$webLine = Get-Content -LiteralPath '.env' | Where-Object { $_ -match '^WEB_PORT=' } | Select-Object -Last 1
$webPort = if ($webLine) { $webLine.Substring(9) } else { '8080' }
Write-Host "OpenHomeSIEM: http://localhost:$webPort"
