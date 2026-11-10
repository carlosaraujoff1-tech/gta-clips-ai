from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query, Request
from sqlalchemy import func, select

from app.api.deps import DbSession
from app.db.models import Job, JobStatus
from app.schemas.jobs import JobOut
from app.schemas.library import Page
from app.services import jobs as job_service

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("", response_model=Page[JobOut])
def list_jobs(
    db: DbSession,
    active: bool = False,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> Page[JobOut]:
    query = select(Job)
    count = select(func.count()).select_from(Job)
    if active:
        query = query.where(Job.status.in_(job_service.ACTIVE_STATUSES))
        count = count.where(Job.status.in_(job_service.ACTIVE_STATUSES))
    rows = db.scalars(query.order_by(Job.id.desc()).limit(limit)).all()
    return Page(
        items=[JobOut.model_validate(j) for j in rows],
        total=db.scalar(count) or 0,
        limit=limit,
        offset=0,
    )


@router.get("/{job_id}", response_model=JobOut)
def read_job(job_id: int, db: DbSession) -> JobOut:
    return JobOut.model_validate(job_service.get_job(db, job_id))


@router.post("/{job_id}/cancel", response_model=JobOut)
def cancel_job(job_id: int, db: DbSession, request: Request) -> JobOut:
    job = job_service.request_cancel(db, job_id)
    if job.status == JobStatus.CANCELLED:
        request.app.state.job_runner.notify()
    return JobOut.model_validate(job)
