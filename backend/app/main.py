"""FastAPI application factory and entry point.

Run in development with::

    uv run python -m app.main
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import uvicorn
from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.api.routes import (
    dashboard,
    health,
    jobs,
    library,
    recordings,
    settings,
    system,
    transcription,
)
from app.core.config import APP_NAME, APP_VERSION, Settings, get_settings
from app.core.errors import register_error_handlers
from app.core.logging import configure_logging, get_logger
from app.core.middleware import CLIENT_HEADER, LocalClientGuardMiddleware, RequestContextMiddleware
from app.db.session import dispose_engine, get_session_factory, init_engine, run_migrations
from app.jobs.registry import build_handlers
from app.jobs.runner import JobRunner
from app.jobs.transcription import recover_after_restart
from app.services.user_settings import load_user_settings

log = get_logger(__name__)


def create_app(config: Settings | None = None) -> FastAPI:
    config = config or get_settings()
    configure_logging(config.log_level, config.log_dir, as_json=config.log_json)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        init_engine(config)
        run_migrations(config)
        session_factory = get_session_factory()
        with session_factory() as session:
            recover_after_restart(session, load_user_settings(session).storage.processing)
        runner = JobRunner(session_factory, build_handlers(config))
        app.state.config = config
        app.state.job_runner = runner
        runner.start()
        log.info("backend_started", version=APP_VERSION, host=config.host, port=config.port)
        yield
        runner.stop()
        dispose_engine()
        log.info("backend_stopped")

    app = FastAPI(title=APP_NAME, version=APP_VERSION, lifespan=lifespan)

    # Order: the last middleware added runs first.
    app.add_middleware(LocalClientGuardMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.cors_origins,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Content-Type", CLIENT_HEADER, "X-Request-ID"],
        expose_headers=["X-Request-ID"],
    )
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=config.allowed_hosts)
    app.add_middleware(RequestContextMiddleware)

    register_error_handlers(app)

    api = APIRouter(prefix="/api")
    for module in (
        health,
        dashboard,
        settings,
        system,
        recordings,
        transcription,
        jobs,
        library,
    ):
        api.include_router(module.router)
    app.include_router(api)
    return app


def run() -> None:
    config = get_settings()
    if config.host not in ("127.0.0.1", "localhost", "::1"):
        raise SystemExit("Por segurança, o backend só pode escutar em 127.0.0.1/localhost.")
    uvicorn.run(
        "app.main:create_app", factory=True, host=config.host, port=config.port, log_config=None
    )


if __name__ == "__main__":
    run()
