# Run from the workspace root in PowerShell
# This activates the virtual environment and starts the Flask backend.

Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned | Out-Null
$python = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"

if (-not (Test-Path $python)) {
	throw "Virtual environment not found at $python. Create it and install requirements first."
}

& $python -m backend.app