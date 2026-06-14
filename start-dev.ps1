# FillScore Development Startup Script
# Runs both the Next.js frontend and the Python ml-service in separate windows
# Usage: Right-click -> Run with PowerShell  OR  pwsh -File start-dev.ps1

$root = $PSScriptRoot

Write-Host "Starting FillScore development servers..." -ForegroundColor Cyan

# Start ml-service in a new visible PowerShell window (stays open)
Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-Command",
  "Set-Location '$root\ml-service'; Write-Host 'ML Service starting on port 8000...' -ForegroundColor Green; python -m uvicorn main:app --port 8000 --reload"
)

# Wait 3 seconds for ml-service to start
Start-Sleep -Seconds 3

# Start Next.js frontend in a new visible PowerShell window
Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-Command",
  "Set-Location '$root\frontend'; Write-Host 'Frontend starting on port 3000...' -ForegroundColor Green; npm run dev"
)

Write-Host ""
Write-Host "Both servers starting in separate windows." -ForegroundColor Green
Write-Host "  Frontend: http://localhost:3000" -ForegroundColor White
Write-Host "  ML API:   http://localhost:8000" -ForegroundColor White
Write-Host "  Health:   http://localhost:8000/health" -ForegroundColor White
Write-Host ""
Write-Host "Keep both windows open while developing." -ForegroundColor Yellow
