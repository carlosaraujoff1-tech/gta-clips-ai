"""Recordings library and import endpoints (Phase 2)."""

from __future__ import annotations

import os
from enum import StrEnum
from typing import Annotated, Any

from fastapi import APIRouter, Query, Request, Response, status
from sqlalchemy import ColumnElement, Select, func, or_, select

from app.api.deps import DbSession, PageParams
from app.core.errors import AppError
from app.db.models import Job, JobType, Recording
from app.jobs.handlers import ImportSourceError, require_originals_folder, validate_import_source
from app.schemas.jobs import ImportFileRequest, JobOut
from app.schemas.library import LibraryStats, Page, RecordingOut, RecordingUpdate
from app.services import jobs as job_service
from app.services import library
from app.services.user_settings import load_user_settings

router = APIRouter(tags=["recordings"])


class RecordingSort(StrEnum):
    RECENT = "recent"  # most recently imported
    RECORDED = "recorded"  # recording date
    TITLE = "title"
    DURATION = "duration"
    SIZE = "size"


def to_out(recording: Recording) -> RecordingOut:
    out = RecordingOut.model_validate(recording)
    out.file_exists = os.path.isfile(recording.file_path)
    out.has_transcript = recording.transcript is not None
    return out


def _get_recording(db: DbSession, recording_id: int) -> Recording:
    recording = db.get(Recording, recording_id)
    if recording is None:
        raise AppError("recording_not_found", "Gravação não encontrada.", status.HTTP_404_NOT_FOUND)
    return recording


def _escape_like(term: str) -> str:
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _apply_search(query: Select[tuple[Recording]], search: str | None) -> Select[tuple[Recording]]:
    if not search:
        return query
    pattern = f"%{_escape_like(search)}%"
    return query.where(
        or_(
            Recording.title.ilike(pattern, escape="\\"),
            Recording.notes.ilike(pattern, escape="\\"),
            Recording.file_path.ilike(pattern, escape="\\"),
        )
    )


_ORDER: dict[RecordingSort, tuple[ColumnElement[Any], ...]] = {
    RecordingSort.RECENT: (Recording.created_at.desc(), Recording.id.desc()),
    RecordingSort.RECORDED: (Recording.recorded_at.desc(), Recording.id.desc()),
    RecordingSort.TITLE: (Recording.title.asc(), Recording.id.asc()),
    RecordingSort.DURATION: (Recording.duration_seconds.desc(), Recording.id.desc()),
    RecordingSort.SIZE: (Recording.file_size_bytes.desc(), Recording.id.desc()),
}


# ------------------------------------------------------------------- library


@router.get("/recordings", response_model=Page[RecordingOut])
def list_recordings(
    db: DbSession,
    page: PageParams,
    search: Annotated[str | None, Query(max_length=100)] = None,
    sort: RecordingSort = RecordingSort.RECENT,
) -> Page[RecordingOut]:
    term = search.strip() if search else None
    query = _apply_search(select(Recording), term)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.scalars(query.order_by(*_ORDER[sort]).limit(page.limit).offset(page.offset)).all()
    return Page(items=[to_out(r) for r in rows], total=total, limit=page.limit, offset=page.offset)


@router.get("/recordings/stats", response_model=LibraryStats)
def recordings_stats(db: DbSession) -> LibraryStats:
    total, size, duration = db.execute(
        select(
            func.count(Recording.id),
            func.coalesce(func.sum(Recording.file_size_bytes), 0),
            func.coalesce(func.sum(Recording.duration_seconds), 0.0),
        )
    ).one()
    missing = (
        db.scalar(select(func.count()).select_from(Recording).where(Recording.probed_at.is_(None)))
        or 0
    )
    return LibraryStats(
        total=total,
        total_size_bytes=int(size),
        total_duration_seconds=float(duration),
        missing_metadata=missing,
    )


@router.get("/recordings/{recording_id}", response_model=RecordingOut)
def read_recording(recording_id: int, db: DbSession) -> RecordingOut:
    return to_out(_get_recording(db, recording_id))


@router.patch("/recordings/{recording_id}", response_model=RecordingOut)
def update_recording(recording_id: int, payload: RecordingUpdate, db: DbSession) -> RecordingOut:
    recording = _get_recording(db, recording_id)
    changes = payload.model_dump(exclude_unset=True)
    if "title" in changes:
        if changes["title"] is None:
            raise AppError("validation_error", "O título não pode ficar vazio.")
        recording.title = changes["title"]
    if "notes" in changes:
        recording.notes = changes["notes"] or None
    db.commit()
    return to_out(recording)


@router.delete("/recordings/{recording_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recording(recording_id: int, db: DbSession) -> Response:
    """Removes the recording from the library only. The video file is never deleted."""
    recording = _get_recording(db, recording_id)
    db.delete(recording)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/recordings/{recording_id}/probe",
    response_model=JobOut,
    status_code=status.HTTP_202_ACCEPTED,
)
def reprobe_recording(recording_id: int, db: DbSession, request: Request) -> JobOut:
    _get_recording(db, recording_id)
    if any(
        j.payload.get("recording_id") == recording_id
        for j in job_service.active_jobs(db, JobType.PROBE_RECORDING)
    ):
        raise AppError(
            "job_already_active",
            "Os metadados desta gravação já estão sendo lidos.",
            status.HTTP_409_CONFLICT,
        )
    job = job_service.enqueue(db, JobType.PROBE_RECORDING, {"recording_id": recording_id})
    request.app.state.job_runner.notify()
    return JobOut.model_validate(job)


# ------------------------------------------------------------------- imports


def _start(db: DbSession, request: Request, job_type: JobType, payload: dict[str, str]) -> Job:
    job = job_service.enqueue(db, job_type, payload)
    request.app.state.job_runner.notify()
    return job


@router.post("/imports/scan", response_model=JobOut, status_code=status.HTTP_202_ACCEPTED)
def scan_originals(db: DbSession, request: Request) -> JobOut:
    try:
        require_originals_folder(load_user_settings(db))
    except ImportSourceError as exc:
        raise AppError("originals_unavailable", str(exc), status.HTTP_409_CONFLICT) from exc
    if job_service.active_jobs(db, JobType.SCAN_ORIGINALS):
        raise AppError(
            "job_already_active",
            "Já existe uma varredura em andamento.",
            status.HTTP_409_CONFLICT,
        )
    return JobOut.model_validate(_start(db, request, JobType.SCAN_ORIGINALS, {}))


@router.post("/imports/file", response_model=JobOut, status_code=status.HTTP_202_ACCEPTED)
def import_file(payload: ImportFileRequest, db: DbSession, request: Request) -> JobOut:
    try:
        source = validate_import_source(payload.source_path)
        require_originals_folder(load_user_settings(db))
    except ImportSourceError as exc:
        raise AppError(
            "invalid_import_source", str(exc), status.HTTP_422_UNPROCESSABLE_CONTENT
        ) from exc

    normalized = library.normalize_path(source)
    if library.find_by_path(db, normalized) is not None:
        raise AppError(
            "already_imported", "Este arquivo já está na biblioteca.", status.HTTP_409_CONFLICT
        )
    if any(
        j.payload.get("source_path") == normalized
        for j in job_service.active_jobs(db, JobType.IMPORT_FILE)
    ):
        raise AppError(
            "job_already_active",
            "Este arquivo já está sendo importado.",
            status.HTTP_409_CONFLICT,
        )
    job = _start(db, request, JobType.IMPORT_FILE, {"source_path": normalized})
    return JobOut.model_validate(job)
