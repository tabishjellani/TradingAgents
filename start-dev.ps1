<#
.SYNOPSIS
    Starts the full TradingAgents PWA local development environment.
.DESCRIPTION
    Launches the FastAPI backend and Vite frontend development servers.
#>

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  TradingAgents PWA: Starting Full-Stack Local Environment  " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# 1. Verify Virtual Environment
$VenvPython = ".\.venv\Scripts\python.exe"
$VenvUvicorn = ".\.venv\Scripts\uvicorn.exe"

if (-not (Test-Path $VenvPython)) {
    Write-Host "[!] Python virtual environment not found at .venv. Creating one now..." -ForegroundColor Yellow
    python -m venv .venv
    & .\.venv\Scripts\pip.exe install -e .[dev]
    & .\.venv\Scripts\pip.exe install fastapi uvicorn httpx pydantic-settings pytest-asyncio
}

# 2. Launch FastAPI Backend Service
Write-Host "[+] Launching FastAPI Backend on http://127.0.0.1:8000..." -ForegroundColor Green
$BackendProcess = Start-Process -FilePath $VenvUvicorn `
    -ArgumentList "backend.app.main:app", "--host", "127.0.0.1", "--port", "8000", "--reload" `
    -PassThru

# 3. Launch Vite Frontend Dev Server
Write-Host "[+] Launching Vite Frontend on http://localhost:5173..." -ForegroundColor Green
Set-Location -Path ".\frontend"
try {
    npm run dev
} finally {
    Set-Location -Path ".."
    if ($BackendProcess -and -not $BackendProcess.HasExited) {
        Write-Host "[-] Stopping backend process..." -ForegroundColor Yellow
        Stop-Process -Id $BackendProcess.Id -Force
    }
}
