"""
run.py — ShaMart backend entrypoint.

Loads environment variables, builds the Flask app via the application factory
and starts the development/WSGI server on ``0.0.0.0``.

Project layout (database lives OUTSIDE this backend folder)::

    cloudmart2/
    ├── backend/        # this folder (app/, run.py, Dockerfile)
    └── database/       # sibling folder (engine, models, seed)

Local development (from the project root)::

    python backend/run.py

Production (WSGI), e.g. Gunicorn::

    gunicorn --chdir backend --workers 4 --threads 8 --bind 0.0.0.0:8000 "run:app"
"""

import logging
import os
import sys

from dotenv import load_dotenv

# --- Import bootstrap -------------------------------------------------------
# Backend and the sibling ``database/`` package are separate folders, so the
# project root is added to ``sys.path`` before anything imports them.
_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
_PROJECT_ROOT = os.path.dirname(_BACKEND_DIR)
for _dir in (_BACKEND_DIR, _PROJECT_ROOT):
    if _dir not in sys.path:
        sys.path.insert(0, _dir)

# Load .env before anything reads os.environ (config + database connection).
load_dotenv(verbose=False)

from app import create_app  # noqa: E402  (import after path/bootstrap setup)

# Module-level ``app`` is what Gunicorn/uWSGI import via "run:app".
app = create_app()

logger = logging.getLogger("shamart")


if __name__ == "__main__":
    host = app.config.get("HOST", "0.0.0.0")
    port = int(app.config.get("PORT", 8000))
    debug = bool(app.config.get("DEBUG", False))

    logger.info(
        "Starting ShaMart development server on %s:%s (env=%s, debug=%s)",
        host,
        port,
        app.config.get("APP_ENV"),
        debug,
    )
    app.run(host=host, port=port, debug=debug)
