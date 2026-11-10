"""In-process background worker backed by the ``jobs`` table.

Design choices (see docs/ARCHITECTURE.md):
- One worker thread, one job at a time: heavy work (copying 10 GB files, later
  transcription and rendering) should not compete for the same disk/CPU/GPU.
- The queue lives in SQLite, so queued jobs survive a restart. Jobs that were
  *running* when the app stopped are marked as interrupted on the next start.
- No Redis/Celery: they are poorly supported on Windows and unnecessary locally.
"""

from __future__ import annotations

import threading
import time
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.orm import Session, sessionmaker

from app.core.logging import get_logger
from app.db.models import Job, JobStatus, JobType
from app.schemas.settings import UserSettings
from app.services.user_settings import load_user_settings

log = get_logger(__name__)

PROGRESS_WRITE_INTERVAL_S = 0.5
CANCEL_CHECK_INTERVAL_S = 0.5
IDLE_POLL_S = 2.0


class JobCancelledError(Exception):
    pass


class JobFailedError(Exception):
    """Expected failure with a user-facing (Portuguese) message."""


class JobContext:
    """Handed to every job handler: progress reporting, cancellation, DB access."""

    def __init__(
        self, job_id: int, payload: dict[str, Any], session_factory: sessionmaker[Session]
    ) -> None:
        self.job_id = job_id
        self.payload = payload
        self._session_factory = session_factory
        self._last_progress_write = 0.0
        self._last_cancel_check = 0.0
        self._cancelled = False
        with session_factory() as session:
            self.settings: UserSettings = load_user_settings(session)

    def session(self) -> Session:
        return self._session_factory()

    def progress(self, fraction: float, message: str | None = None, force: bool = False) -> None:
        now = time.monotonic()
        if not force and now - self._last_progress_write < PROGRESS_WRITE_INTERVAL_S:
            return
        self._last_progress_write = now
        values: dict[str, Any] = {"progress": max(0.0, min(1.0, fraction))}
        if message is not None:
            values["message"] = message[:300]
        with self._session_factory() as session:
            session.execute(update(Job).where(Job.id == self.job_id).values(**values))
            session.commit()

    def check_cancelled(self) -> None:
        """Raises ``JobCancelledError`` if the user asked to cancel this job."""
        now = time.monotonic()
        if not self._cancelled and now - self._last_cancel_check >= CANCEL_CHECK_INTERVAL_S:
            self._last_cancel_check = now
            with self._session_factory() as session:
                self._cancelled = bool(
                    session.scalar(select(Job.cancel_requested).where(Job.id == self.job_id))
                )
        if self._cancelled:
            raise JobCancelledError


Handler = Callable[[JobContext], dict[str, Any]]


class JobRunner:
    def __init__(
        self, session_factory: sessionmaker[Session], handlers: dict[JobType, Handler]
    ) -> None:
        self._session_factory = session_factory
        self._handlers = handlers
        self._wake = threading.Event()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    # ---------------------------------------------------------------- lifecycle

    def start(self) -> None:
        self._recover_interrupted()
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, name="job-runner", daemon=True)
        self._thread.start()
        log.info("job_runner_started")

    def stop(self, timeout: float = 10.0) -> None:
        self._stop.set()
        self._wake.set()
        if self._thread is not None:
            self._thread.join(timeout)
        log.info("job_runner_stopped")

    def notify(self) -> None:
        """Wake the worker immediately (called after a job is enqueued)."""
        self._wake.set()

    # ------------------------------------------------------------------ internals

    def _recover_interrupted(self) -> None:
        with self._session_factory() as session:
            result = session.execute(
                update(Job)
                .where(Job.status == JobStatus.RUNNING)
                .values(
                    status=JobStatus.FAILED,
                    error="Tarefa interrompida: o sistema foi encerrado durante a execução.",
                    finished_at=datetime.now(UTC),
                )
            )
            session.commit()
            count = getattr(result, "rowcount", 0) or 0
            if count:
                log.warning("jobs_marked_interrupted", count=count)

    def _loop(self) -> None:
        while not self._stop.is_set():
            try:
                job_id = self._claim_next()
            except Exception:
                log.exception("job_claim_failed")
                job_id = None
            if job_id is None:
                self._wake.wait(IDLE_POLL_S)
                self._wake.clear()
                continue
            self._execute(job_id)

    def _claim_next(self) -> int | None:
        with self._session_factory() as session:
            job = session.scalars(
                select(Job).where(Job.status == JobStatus.QUEUED).order_by(Job.id).limit(1)
            ).first()
            if job is None:
                return None
            job.status = JobStatus.RUNNING
            job.started_at = datetime.now(UTC)
            job.progress = 0.0
            session.commit()
            return job.id

    def _finish(self, job_id: int, **values: Any) -> None:
        with self._session_factory() as session:
            session.execute(
                update(Job).where(Job.id == job_id).values(finished_at=datetime.now(UTC), **values)
            )
            session.commit()

    def _execute(self, job_id: int) -> None:
        with self._session_factory() as session:
            job = session.get(Job, job_id)
            if job is None:
                return
            job_type, payload = job.type, dict(job.payload)

        log.info("job_started", job_id=job_id, type=job_type.value)
        started = time.monotonic()
        try:
            handler = self._handlers[job_type]
            context = JobContext(job_id, payload, self._session_factory)
            result = handler(context)
        except JobCancelledError:
            self._finish(job_id, status=JobStatus.CANCELLED, message="Cancelada pelo usuário.")
            log.info("job_cancelled", job_id=job_id)
        except JobFailedError as exc:
            self._finish(job_id, status=JobStatus.FAILED, error=str(exc))
            log.info("job_failed", job_id=job_id, reason=str(exc))
        except Exception:
            log.exception("job_crashed", job_id=job_id)
            self._finish(
                job_id,
                status=JobStatus.FAILED,
                error="Erro interno durante a tarefa. Consulte os logs do backend.",
            )
        else:
            self._finish(job_id, status=JobStatus.SUCCEEDED, progress=1.0, result=result)
            log.info(
                "job_succeeded",
                job_id=job_id,
                duration_s=round(time.monotonic() - started, 2),
            )
