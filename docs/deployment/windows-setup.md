# Windows Setup & Developer Guide

This guide provides a step-by-step PowerShell workflow for installing, configuring, and running the TradingAgents PWA on Windows 10/11.

---

## 1. Prerequisites & Tool Inspection

Verify that your Windows machine has the necessary build tools installed. Open PowerShell 5.1 or PowerShell 7+ as an Administrator or standard user:

```powershell
# Check Git version
git --version
# Expected: git version 2.30+

# Check Python version (Python 3.10 to 3.14 supported)
python --version
# Expected: Python 3.10.x - 3.14.x

# Check Node.js and npm
node --version
npm --version
# Expected: Node v18+ (tested with v24.x) and npm 9+
```

---

## 2. Repository Setup & Virtual Environment

Clone or navigate into the repository:

```powershell
cd D:\TradingAgents-main

# If on a new clone, create the Python virtual environment
python -m venv .venv

# Activate the virtual environment
.\.venv\Scripts\Activate.ps1
```

> **Note on PowerShell Script Execution Policy**: If you receive a script execution error (`PSSecurityException`), run:
> ```powershell
> Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
> ```

---

## 3. Dependency Installation

### 3.1 Python Dependencies
Install the required packages in editable mode:

```powershell
# Upgrade pip and wheel
python -m pip install --upgrade pip setuptools wheel

# Install core TradingAgents framework and backend dependencies
pip install -e .
pip install fastapi uvicorn[standard] pydantic pydantic-settings pyjwt[crypto] httpx yfinance pandas numpy pytest pytest-asyncio
```

### 3.2 Frontend Dependencies
Navigate to the frontend directory and install npm packages:

```powershell
cd frontend
npm install
cd ..
```

---

## 4. Environment Configuration

Copy the example environment file:

```powershell
Copy-Item .env.example .env
```

Open `.env` in your editor and configure the keys:
- `SUPABASE_JWT_SECRET`: Minimum 32-character secret matching your Supabase project (or local synthetic secret for dev).
- `GEMINI_API_KEY`: Free-tier API key from Google AI Studio.
- `GROQ_API_KEY`: Free-tier API key from Groq Cloud (optional alternative).
- `VITE_SUPABASE_URL`: Your Supabase project URL (e.g., `https://xyzcompany.supabase.co`).
- `VITE_SUPABASE_ANON_KEY`: Your Supabase public anonymous key.

---

## 5. Running the Application

### 5.1 One-Click PowerShell Development Runner
Run the bundled orchestration script from the repository root:

```powershell
.\start-dev.ps1
```

This launches:
- **FastAPI Backend Server**: Running on `http://127.0.0.1:8000` (API Docs at `/docs`).
- **Vite PWA Frontend Server**: Running on `http://localhost:5173`.

### 5.2 Manual Process Launch (Dual Terminals)

**Terminal 1 (Backend)**:
```powershell
.\.venv\Scripts\Activate.ps1
uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

**Terminal 2 (Frontend)**:
```powershell
cd frontend
npm run dev
```

---

## 6. Running Tests on Windows

```powershell
# Run the 27 full backend test suite
.\.venv\Scripts\pytest.exe backend/tests/ -v

# Run frontend build check
cd frontend
npm run build
cd ..
```

---

## 7. Troubleshooting Common Windows Errors

1. **Port 8000 or 5173 Already in Use**:
   ```powershell
   Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | Select-Object OwningProcess
   Stop-Process -Id <ProcessId> -Force
   ```
2. **Long Path Limitations**:
   If Git or Python raises `PathTooLongException`, enable long paths in Windows:
   ```powershell
   New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force
   ```
3. **PowerShell Statement Separators**:
   Use `;` (semicolon) instead of `&&` in Windows PowerShell for chained commands.
