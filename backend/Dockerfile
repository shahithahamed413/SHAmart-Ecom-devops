# syntax=docker/dockerfile:1.4

# ---------------------------------------------------------------------------
# ShaMart backend — production image
# python:3.12-slim is deliberate: the pinned SQLAlchemy==2.0.30 does not import
# on Python 3.13+ (__firstlineno__ symbol conflict), so we stay on 3.12.
# ---------------------------------------------------------------------------
FROM python:3.12-slim

# --- Python runtime tuning --------------------------------------------------
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000 \
    HOST=0.0.0.0

# --- Non-root user for least privilege --------------------------------------
RUN groupadd --system shamart && useradd --system --gid shamart --home-dir /app shamart

WORKDIR /app

# --- Dependencies (installed before source copy for layer caching) ----------
COPY backend/requirements.txt .
# gunicorn is installed at the image level (not in the pinned requirements)
# so the app can serve under a production WSGI server.
RUN pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir "gunicorn==22.0.0"

# --- Application source -----------------------------------------------------
COPY --chown=shamart:shamart backend/app/ ./app/
COPY --chown=shamart:shamart database/ ./database/
COPY --chown=shamart:shamart backend/run.py .

# --- Runtime contract -------------------------------------------------------
EXPOSE 8000

USER shamart

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=2)"

# Production: Gunicorn (4 workers x 8 threads). For a quick dev run use:
#   docker run -p 8000:8000 shamart-backend python run.py
CMD ["gunicorn", "--workers", "4", "--threads", "8", "--bind", "0.0.0.0:8000", "run:app"]