"""Creating, listing and cancelling background jobs."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from fastapi import status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.logging import get_logger
from app.db.models import Job, JobStatus, JobType

log = get_logger(__name__)

ACTIVE_STATUSES = (JobStatus.QUEUED, JobStatus.RUNNING)


def active_jobs(session: Session, job_type: JobType) -> list[Job]:
    return list(
        session.scalars(
            select(Job).where(Job.type == job_type, Job.status.in_(ACTIVE_STATUSES))
        ).all()
    )


def enqueue(session: Session, job_type: JobType, payload: dict[str, Any]) -> Job:
    job = Job(type=job_type, status=JobStatus.QUEUED, payload=payload, progress=0.0)
    session.add(job)
    session.commit()
    log.info("job_enqueued", job_id=job.id, type=job_type.value)
    return job


def get_job(session: Session, job_id: int) -> Job:
    job = session.get(Job, job_id)
    if job is None:
        raise AppError("job_not_found", "Tarefa não encontrada.", status.HTTP_404_NOT_FOUND)
    return job


def request_cancel(session: Session, job_id: int) -> Job:
    job = get_job(session, job_id)
    if job.status == JobStatus.QUEUED:
        job.status = JobStatus.CANCELLED
        job.message = "Cancelada antes de iniciar."
        job.finished_at = datetime.now(UTC)
    elif job.status == JobStatus.RUNNING:
        job.cancel_requested = True
        job.message = "Cancelando…"
    else:
        raise AppError("job_not_active", "Esta tarefa já foi finalizada.", status.HTTP_409_CONFLICT)
    session.commit()
    log.info("job_cancel_requested", job_id=job_id)
    return job
