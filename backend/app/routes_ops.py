"""
app/routes_ops.py
=================

DevOps / SRE telemetry endpoints consumed by the frontend "DevOps Telemetry"
bar and by Kubernetes probes:

* GET  /readyz                 readiness probe (active ``SELECT 1``)
* GET  /healthz                liveness probe (dependency-free)
* GET  /api/v1/version         build/release metadata
* POST /api/v1/chaos/toggle    operator failover switch
* GET  /metrics                Prometheus exposition

The engine and health helpers are imported from the ``database`` package; this
blueprint never constructs its own connection.
"""

import logging
import threading

from flask import Blueprint, Response, current_app, jsonify, request
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest

from database import check_database_health, pool_status

logger = logging.getLogger("shamart.ops")

ops_bp = Blueprint("ops", __name__)

# --- Prometheus instruments (registered once at import time) ----------------
HTTP_REQUESTS_TOTAL = Counter(
    "http_requests_total",
    "Total number of HTTP requests processed.",
    ["method", "endpoint", "status_code"],
)
HTTP_REQUEST_DURATION = Histogram(
    "http_request_duration_seconds",
    "HTTP request latency in seconds.",
    ["method", "endpoint"],
)

# --- Chaos state (process-local, in-memory) ---------------------------------
# Deliberately process-local: flipping it on one replica only degrades that
# replica, which is exactly what you want when exercising load-balancer
# failover / frontend circuit-breaking.
_chaos_lock = threading.Lock()
_chaos_state = {"enabled": False}


def chaos_enabled():
    with _chaos_lock:
        return _chaos_state["enabled"]


def set_chaos(enabled):
    with _chaos_lock:
        _chaos_state["enabled"] = bool(enabled)
    return _chaos_state["enabled"]


@ops_bp.route("/readyz", methods=["GET"])
def readyz():
    """Kubernetes readiness probe: actively pings MySQL with ``SELECT 1``."""
    if chaos_enabled():
        logger.warning("Readiness degraded: chaos mode is active.")
        return (
            jsonify(
                {
                    "status": "degraded",
                    "database": "disconnected",
                    "error": "Chaos mode enabled by operator",
                }
            ),
            503,
        )

    try:
        latency_ms = check_database_health()
    except Exception as exc:  # noqa: BLE001 - report any driver/pool failure
        logger.exception("Readiness probe failed: database unreachable.")
        return (
            jsonify(
                {
                    "status": "degraded",
                    "database": "disconnected",
                    "error": str(exc),
                }
            ),
            503,
        )

    return (
        jsonify(
            {
                "status": "ready",
                "database": "connected",
                "latency_ms": latency_ms,
                "pool": pool_status(),
            }
        ),
        200,
    )


@ops_bp.route("/healthz", methods=["GET"])
def healthz():
    """Kubernetes liveness probe: fast, dependency-free process ping."""
    return jsonify({"status": "alive"}), 200


@ops_bp.route("/api/v1/version", methods=["GET"])
def version():
    """Dynamic build/release metadata injected at deploy time."""
    git_commit = current_app.config.get("GIT_COMMIT_SHA", "unknown")
    return (
        jsonify(
            {
                "git_commit": git_commit,
                "image_tag": current_app.config.get("IMAGE_TAG", "unknown"),
                "environment": current_app.config.get("APP_ENV", "unknown"),
                # camelCase aliases for the JS telemetry console.
                "gitCommit": git_commit,
                "shortSha": (git_commit or "unknown")[:8],
            }
        ),
        200,
    )


@ops_bp.route("/api/v1/chaos/toggle", methods=["POST"])
def chaos_toggle():
    """Toggle the in-memory chaos flag.

    Body is optional: ``{"enabled": true|false}`` sets an explicit state, an
    empty/absent body simply flips the current state.
    """
    payload = request.get_json(silent=True) or {}
    if isinstance(payload, dict) and "enabled" in payload:
        enabled = bool(payload["enabled"])
    else:
        enabled = not chaos_enabled()

    set_chaos(enabled)
    logger.warning("Chaos mode %s by operator.", "ENABLED" if enabled else "DISABLED")
    return (
        jsonify(
            {
                "chaos_mode": enabled,
                "status": "enabled" if enabled else "disabled",
            }
        ),
        200,
    )


@ops_bp.route("/metrics", methods=["GET"])
def metrics():
    """Prometheus text-exposition endpoint."""
    return Response(generate_latest(), mimetype=CONTENT_TYPE_LATEST)
