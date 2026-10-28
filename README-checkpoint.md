# AutoML Data Intelligence Platform

## What you get
- Drag & drop dataset upload UI (`frontend/`)
- Backend API to upload + run AutoML (`backend/`)
- Trains baseline models, picks the best, saves it to `models/`

## Run
Create a virtual environment, then install dependencies:

```bash
pip install -r requirements.txt
```

Start the backend:

```bash
python -m backend.app
```

Open the app in your browser:
- `http://127.0.0.1:5000/`

## Render deploy
- **Build:** `pip install -r requirements.txt`
- **Start:** `gunicorn --bind 0.0.0.0:$PORT backend.app:app`
- **Python:** `3.11.11` — set via `.python-version`, `render.yaml`, or Dashboard → Environment → `PYTHON_VERSION=3.11.11` (required; default Render Python is 3.14 and breaks TensorFlow-heavy installs)
- Production deps are only in `requirements.txt` (no TensorFlow/torch). Heavy ML stacks live in `requirements-dev.txt` for local use.

## API
- `POST /api/upload` (form-data)
  - `file`: CSV/Excel
  - `target` (optional): target column name

Response includes:
- `run_id`, `task`, `target`, `best_model_name`, `metrics`, `features`
