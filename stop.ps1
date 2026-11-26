$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
docker compose stop
if ($LASTEXITCODE -ne 0) { throw 'Could not stop OpenHomeSIEM. Check that Docker Desktop is running.' }
Write-Host 'OpenHomeSIEM is stopped. Your database and settings are preserved.'
