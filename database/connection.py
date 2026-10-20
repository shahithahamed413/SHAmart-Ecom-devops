"""
database/connection.py
======================

SQLAlchemy 2.x engine, resilient production connection pool and session
lifecycle helpers for the ShaMart datastore (MySQL via the PyMySQL driver).

Everything here is intentionally decoupled from Flask: this module has no
knowledge of HTTP, blueprints or request contexts. The ``app/`` package imports
its engine, session factory and declarative ``Base`` exclusively from here.

Resilience notes
----------------
* ``pool_pre_ping=True`` transparently validates a pooled TCP connection with a
  lightweight ping before handing it to a query, automatically recycling
  connections that MySQL has silently dropped (e.g. after a failover).
* ``pool_recycle=1800`` proactively rotates connections before MySQL's default
  ``wait_timeout`` (28800s) / intermediary firewall idle timeouts fire.
* ``max_overflow`` allows short bursts above the steady-state ``pool_size``.
"""

import logging
import os
import time
from contextlib import contextmanager

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker

# Load variables from a local .env file (if present). Real environments inject
# the same variables directly; dotenv never overrides an already-set value.
load_dotenv()

logger = logging.getLogger("shamart.database")

# --------------------------------------------------------------------------- #
# Connection settings (12-Factor: sourced from the environment, safe defaults).
# --------------------------------------------------------------------------- #
DB_USER = os.getenv("DB_USER", "cloudmart_user")
DB_PASSWORD = os.getenv("DB_PASSWORD", "secretpass")
DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
DB_PORT = os.getenv("DB_PORT", "3306")
DB_NAME = os.getenv("DB_NAME", "cloudmart_db")

DATABASE_URL = (
    f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
)


def _env_int(name, default):
    """Best-effort integer env lookup that falls back to *default*."""
    try:
        return int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


def _env_bool(name, default=False):
    """Best-effort boolean env lookup accepting 1/true/yes/on."""
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "t", "yes", "y", "on")


# --------------------------------------------------------------------------- #
# Engine + pool. ``create_engine`` is lazy: it does not open a socket here, so
# importing this module is safe even when MySQL is temporarily unreachable.
# --------------------------------------------------------------------------- #
engine = create_engine(
    DATABASE_URL,
    pool_size=_env_int("DB_POOL_SIZE", 10),
    max_overflow=_env_int("DB_MAX_OVERFLOW", 20),
    pool_recycle=_env_int("DB_POOL_RECYCLE", 1800),
    pool_timeout=_env_int("DB_POOL_TIMEOUT", 30),
    pool_pre_ping=True,
    echo=_env_bool("DB_ECHO", False),
    future=True,
)

# Session factory. ``expire_on_commit=False`` lets callers safely read generated
# primary keys (e.g. ``order.id``) immediately after ``commit()``.
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    expire_on_commit=False,
    future=True,
)

# Declarative base shared by every ORM model in ``database.models``.
Base = declarative_base()


def init_db():
    """Create any missing tables from the registered declarative models.

    Imports ``database.models`` for its registration side effect so that the
    ``Product``/``Order`` tables exist before ``create_all`` runs.
    """
    from . import models  # noqa: F401  (import registers models on Base)

    Base.metadata.create_all(bind=engine)
    logger.info("Schema ensured: %s", ", ".join(sorted(Base.metadata.tables)))
    return engine


@contextmanager
def get_db_session():
    """Transactional context manager: commit on success, rollback on error.

    Usage::

        with get_db_session() as session:
            session.add(obj)          # committed on clean exit
    """
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_db():
    """Flask-style session generator dependency.

    Yields a session and guarantees rollback-on-exception plus close. Suitable
    for ``@app.teardown_appcontext`` wiring or manual ``next(get_db())`` use.
    """
    session = SessionLocal()
    try:
        yield session
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def check_database_health():
    """Round-trip ``SELECT 1`` and return the observed latency in milliseconds.

    Raises whatever the driver/pool raises when the database is unreachable;
    callers translate that into a 503 readiness response.
    """
    start = time.perf_counter()
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return round((time.perf_counter() - start) * 1000, 3)


def pool_status():
    """Best-effort snapshot of the connection pool for observability."""
    pool = engine.pool
    try:
        return {
            "size": pool.size(),
            "checked_in": pool.checkedin(),
            "checked_out": pool.checkedout(),
            "overflow": pool.overflow(),
        }
    except Exception:  # pragma: no cover - pool API varies by backend
        return {"size": 0, "checked_in": 0, "checked_out": 0, "overflow": 0}
