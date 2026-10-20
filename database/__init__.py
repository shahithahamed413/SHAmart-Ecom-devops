"""
database/__init__.py
====================

Public surface of the dedicated ShaMart database package.

The Flask presentation layer (``app/``) must import its engine, session
factory and ORM models exclusively from here — never construct its own engine.

Exported
--------
engine              : SQLAlchemy 2.x Engine bound to the MySQL/PyMySQL DSN.
SessionLocal        : ``sessionmaker`` factory for ORM sessions.
Base                : Declarative base shared by all models.
get_db              : Flask-style session generator dependency.
get_db_session      : Transactional context manager (commit/rollback/close).
init_db             : Create all tables from the declarative metadata.
check_database_health: ``SELECT 1`` round-trip returning latency in ms.
pool_status         : Connection-pool utilisation snapshot.
Product, Order      : ORM models.
"""

from .connection import (
    Base,
    SessionLocal,
    check_database_health,
    engine,
    get_db,
    get_db_session,
    init_db,
    pool_status,
)
from .models import Order, Product

__all__ = [
    "Base",
    "SessionLocal",
    "engine",
    "get_db",
    "get_db_session",
    "init_db",
    "check_database_health",
    "pool_status",
    "Product",
    "Order",
]
