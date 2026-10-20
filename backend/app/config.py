"""
app/config.py
=============

12-Factor application configuration.

Every tunable is read from the process environment (loaded from ``.env`` in
development by ``python-dotenv``), so the identical code artifact can be
promoted across dev -> staging -> prod without modification. Local-development
defaults let ``python run.py`` boot with zero setup.

Datastore connection settings live in ``database/connection.py`` (owned by the
database package); this module owns application/server/observability settings.
"""

import os

from dotenv import load_dotenv

# Safe in every environment: real deployments inject vars directly and dotenv
# will not override values that are already present.
load_dotenv()


def _env_str(name, default):
    """Return an env var as a string, falling back to *default* when unset/empty."""
    value = os.getenv(name)
    return default if value is None or value == "" else value


def _env_int(name, default):
    try:
        return int(_env_str(name, default))
    except (TypeError, ValueError):
        return int(default)


def _env_bool(name, default=False):
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in ("1", "true", "t", "yes", "y", "on")


class Config:
    """Immutable-in-practice configuration snapshot for one app instance."""

    # --- Runtime environment / build metadata --------------------------------
    APP_ENV = _env_str("APP_ENV", "development")
    GIT_COMMIT_SHA = _env_str("GIT_COMMIT_SHA", "local-dev-commit")
    IMAGE_TAG = _env_str("IMAGE_TAG", "v1.0.0-snapshot")

    # --- HTTP server ---------------------------------------------------------
    HOST = _env_str("HOST", "0.0.0.0")
    PORT = _env_int("PORT", 8000)
    DEBUG = _env_bool("FLASK_DEBUG", _env_str("APP_ENV", "development") == "development")

    # --- MySQL reachability pre-check timeout surfaced by /readyz ------------
    READINESS_TIMEOUT_SECONDS = _env_int("READINESS_TIMEOUT_SECONDS", 3)

    # --- CORS (permissive for the Vite dev frontend on :5173) ----------------
    CORS_ORIGINS = _env_str("CORS_ORIGINS", "*")

    # --- Logging -------------------------------------------------------------
    LOG_LEVEL = _env_str("LOG_LEVEL", "INFO")

    # --- Flask secret (session/csrf signing; override in production) ---------
    SECRET_KEY = _env_str("SECRET_KEY", "shamart-dev-secret-key")

    @classmethod
    def as_dict(cls):
        """A safe-to-log view (never contains credentials)."""
        return {
            "APP_ENV": cls.APP_ENV,
            "GIT_COMMIT_SHA": cls.GIT_COMMIT_SHA,
            "IMAGE_TAG": cls.IMAGE_TAG,
            "HOST": cls.HOST,
            "PORT": cls.PORT,
            "LOG_LEVEL": cls.LOG_LEVEL,
        }
