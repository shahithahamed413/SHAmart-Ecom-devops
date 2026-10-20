"""
app/__init__.py
===============

Application Factory for the ShaMart REST API.

Wires together configuration, the shared ``database`` engine/schema, permissive
CORS for the Vanilla-JS/Vite frontend, both blueprints (storefront + ops) and
the Prometheus request instrumentation backing ``/metrics``.
"""

import logging
import os
import sys
import time

from flask import Flask, g, jsonify, request
from flask_cors import CORS

# --- Import bootstrap -------------------------------------------------------
# The dedicated ``database/`` package is a sibling of ``backend/`` (project
# root layout), so ensure the project root is on ``sys.path`` so
# ``from database import ...`` resolves from anywhere this package is loaded.
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_PROJECT_ROOT = os.path.dirname(_BACKEND_DIR)
for _dir in (_BACKEND_DIR, _PROJECT_ROOT):
    if _dir not in sys.path:
        sys.path.insert(0, _dir)

from database import init_db  # noqa: E402

from .config import Config  # noqa: E402
from .routes_api import api_bp  # noqa: E402
from .routes_ops import HTTP_REQUEST_DURATION, HTTP_REQUESTS_TOTAL, ops_bp  # noqa: E402

logger = logging.getLogger("shamart")


def create_app(config_object=Config):
    """Build and configure a Flask application instance."""
    app = Flask(__name__)

    # Load 12-Factor configuration into ``app.config`` (GIT_COMMIT_SHA, etc.).
    app.config.from_object(config_object)

    logging.basicConfig(
        level=app.config.get("LOG_LEVEL", "INFO"),
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )
    logger.info("Bootstrapping ShaMart API: %s", config_object.as_dict())

    # --- Cross-Origin Resource Sharing -----------------------------------
    # Wide-open so the Vite frontend (http://localhost:5173) and any preview /
    # ingress host can call the API without preflight friction.
    CORS(
        app,
        resources={r"/*": {"origins": app.config.get("CORS_ORIGINS", "*")}},
        supports_credentials=False,
        allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
        methods=["GET", "POST", "OPTIONS", "PUT", "DELETE"],
    )

    # --- Database schema bootstrap ---------------------------------------
    # Ensures the ``products``/``orders`` tables exist before serving traffic.
    # Tolerant boot: if MySQL is momentarily unreachable the process still
    # starts and /readyz reports 503 instead of the pod crash-looping.
    try:
        init_db()
    except Exception as exc:  # noqa: BLE001 - DB down; service stays up
        logger.error("Schema bootstrap skipped (MySQL unreachable): %s", exc)

    # --- Blueprints -------------------------------------------------------
    app.register_blueprint(ops_bp)   # /readyz, /healthz, /version, chaos, /metrics
    app.register_blueprint(api_bp)   # /api/v1/products, /api/v1/orders

    # --- Observability + JSON error handling ------------------------------
    _register_observability(app)
    _register_error_handlers(app)

    logger.info("ShaMart API ready (env=%s).", app.config.get("APP_ENV"))
    return app


def _register_observability(app):
    """Instrument every request with Prometheus counters/histograms."""

    @app.before_request
    def _begin_request_timer():
        g._request_start = time.perf_counter()

    @app.after_request
    def _record_request_metrics(response):
        # Never instrument the scrape endpoint itself (avoids self-noise).
        if request.path == "/metrics":
            return response

        start = getattr(g, "_request_start", None)
        elapsed = (time.perf_counter() - start) if start else 0.0
        endpoint = request.endpoint or "unknown"

        HTTP_REQUEST_DURATION.labels(
            method=request.method, endpoint=endpoint
        ).observe(elapsed)
        HTTP_REQUESTS_TOTAL.labels(
            method=request.method,
            endpoint=endpoint,
            status_code=str(response.status_code),
        ).inc()
        return response


def _register_error_handlers(app):
    """Return JSON (never an HTML error page) for the common error paths."""

    @app.errorhandler(400)
    def _bad_request(_error):
        return jsonify({"error": "Bad request"}), 400

    @app.errorhandler(404)
    def _not_found(_error):
        return jsonify({"error": "Resource not found", "path": request.path}), 404

    @app.errorhandler(405)
    def _method_not_allowed(_error):
        return jsonify({"error": "Method not allowed", "method": request.method}), 405

    @app.errorhandler(500)
    def _server_error(_error):
        return jsonify({"error": "Internal server error"}), 500
