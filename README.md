# AutoML Data Intelligence Platform

## What you get
- Drag & drop dataset upload UI (`frontend/`)
- Backend API to upload + run AutoML (`backend/`)
- Trains baseline models, picks the best, saves it to `models/`
- BrandGuard: a separate pre-publication brand governance module under `backend/brandguard/` and `frontend/brandguard/`

## Architecture overview
- The primary application remains the existing Nova Dominators AutoML platform.
- BrandGuard is introduced as a Flask Blueprint mounted at `/api/brandguard` so the existing AutoML, cleaning, and BI-report flows do not need to be restyled or rewritten.
- BrandGuard persists governance data in SQLite with seed files under `backend/brandguard/seed/`.
- Deterministic checks run before any AI-assisted review, and the AI layer is only used as an optional second-pass validator.
- Frontend pages live under `frontend/brandguard/` and are integrated via a single navbar link from the main app.

## Run
Create a virtual environment, then install dependencies:

```bash
pip install -r requirements.txt
```

Create a local `.env` file from `.env.example` and set:

```bash
ANTHROPIC_API_KEY=your-key
BRANDGUARD_MODEL=claude-3-5-sonnet-20241022
```

Start the backend:

```bash
python -m backend.app
```

Open the app in your browser:
- `http://127.0.0.1:5000/`
- BrandGuard UI: `http://127.0.0.1:5000/brandguard/index.html`

## BrandGuard quality evaluation
- Sample set: `eval/brandguard_samples.json`
- Evaluator: `eval/run_eval.py`

Run:

```bash
python eval/run_eval.py
```

The script prints per-category precision, recall, and false-positive rate, then identifies the weakest category for targeted tuning.

## External services used
- Anthropic Claude API for optional AI review and claim validation
- SQLite for local governance data persistence
- Pillow for image validation and palette comparison
- Python-dotenv for environment loading
- pytest for quality checks

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

## BrandGuard API highlights
- `GET /api/brandguard/health`
- `POST /api/brandguard/content`
- `GET /api/brandguard/queue`
- `GET /api/brandguard/insights`
- `POST /api/brandguard/image-check`
- `DELETE /api/brandguard/content/<content_id>`
