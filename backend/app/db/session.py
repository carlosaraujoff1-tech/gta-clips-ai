"""Database engine, sessions and migrations."""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

from alembic import command
from alembic.config import Config
from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import BACKEND_DIR, Settings
from app.core.logging import get_logger

log = get_logger(__name__)

_engine: Engine | None = None
_session_factory: sessionmaker[Session] | None = None


def _sqlite_pragmas(dbapi_connection: Any, _: Any) -> None:
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")  # enforce relations
    cursor.execute("PRAGMA journal_mode=WAL")  # API reads while background jobs write
    cursor.execute("PRAGMA busy_timeout=5000")
    cursor.close()


def init_engine(settings: Settings) -> Engine:
    global _engine, _session_factory
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    engine = create_engine(
        settings.database_url,
        connect_args={"check_same_thread": False},
    )
    event.listen(engine, "connect", _sqlite_pragmas)
    _engine = engine
    _session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    return engine


def dispose_engine() -> None:
    global _engine, _session_factory
    if _engine is not None:
        _engine.dispose()
    _engine = None
    _session_factory = None


def run_migrations(settings: Settings) -> None:
    """Bring the database schema up to date (``alembic upgrade head``)."""
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    cfg.set_main_option("sqlalchemy.url", settings.database_url)
    cfg.attributes["configure_logger"] = False
    command.upgrade(cfg, "head")
    log.info("database_ready", path=str(settings.database_path))


def get_session_factory() -> sessionmaker[Session]:
    if _session_factory is None:
        raise RuntimeError("Database engine not initialised")
    return _session_factory


def get_session() -> Iterator[Session]:
    """FastAPI dependency: one session per request, always closed."""
    if _session_factory is None:
        raise RuntimeError("Database engine not initialised")
    session = _session_factory()
    try:
        yield session
    finally:
        session.close()
