"""WSGI entrypoint for Render/gunicorn (works with backend/ or flat repo layout)."""
try:
    from backend.app import app
except ImportError:
    from app import app
