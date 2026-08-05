Write-Host "=== BlueRock - BRVM Financial Intelligence Platform ===" -ForegroundColor Cyan
Write-Host ""

# Check prerequisites
$hasDocker = Get-Command docker -ErrorAction SilentlyContinue
$hasPython = Get-Command python -ErrorAction SilentlyContinue
$hasNode = Get-Command node -ErrorAction SilentlyContinue

if ($hasDocker) {
    Write-Host "[1/3] Starting with Docker Compose..." -ForegroundColor Yellow
    docker-compose up --build
    exit
}

Write-Host "Docker not found. Starting services individually..." -ForegroundColor Yellow

if (-not $hasPython) {
    Write-Host "ERROR: Python 3.11+ required" -ForegroundColor Red
    exit 1
}

if (-not $hasNode) {
    Write-Host "ERROR: Node.js 18+ required" -ForegroundColor Red
    exit 1
}

# Backend setup
Write-Host "[1/3] Setting up backend..." -ForegroundColor Yellow
Push-Location backend
python -m venv venv
if ($IsWindows -or $env:OS) {
    .\venv\Scripts\Activate.ps1
} else {
    source venv/bin/activate
}
pip install -r requirements.txt
Start-Process -NoNewWindow powershell -ArgumentList "cd backend; .\venv\Scripts\Activate.ps1; uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"
Pop-Location

# Frontend setup
Write-Host "[2/3] Setting up frontend..." -ForegroundColor Yellow
Push-Location frontend
npm install
Start-Process -NoNewWindow powershell -ArgumentList "cd frontend; npm run dev"
Pop-Location

Write-Host "[3/3] Done!" -ForegroundColor Green
Write-Host "Backend: http://localhost:8000" -ForegroundColor Cyan
Write-Host "Frontend: http://localhost:3000" -ForegroundColor Cyan
Write-Host "API Docs: http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host ""
Write-Host "Run seed endpoint to populate sample data:" -ForegroundColor Yellow
Write-Host "  Invoke-RestMethod -Method Post -Uri http://localhost:8000/api/seed/all" -ForegroundColor Gray
