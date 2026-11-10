"""Phase 4 (highlight analysis) and clip endpoints, including the Phase 5 preview render."""

from __future__ import annotations

import os
from enum import StrEnum
from pathlib import Path
from typing import Annotated, Any

from fastapi import APIRouter, Query, Request, Response, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy import ColumnElement, func, select

from app.api.deps import DbSession, PageParams
from app.core.errors import AppError
from app.db.models import Clip, ClipStatus, JobType, Recording, RecordingStatus
from app.schemas.jobs import JobOut
from app.schemas.library import ClipOut, Page
from app.services import jobs as job_service
from app.services import ollama
from app.services.user_settings import load_user_settings

router = APIRouter(tags=["clips"])


# ------------------------------------------------------------------ helpers


def to_out(clip: Clip) -> ClipOut:
    out = ClipOut.model_validate(clip)
    out.recording_title = clip.recording.title
    out.has_video = bool(clip.output_path) and os.path.isfile(clip.output_path or "")
    return out


def _get_clip(db: DbSession, clip_id: int) -> Clip:
    clip = db.get(Clip, clip_id)
    if clip is None:
        raise AppError("clip_not_found", "Corte não encontrado.", status.HTTP_404_NOT_FOUND)
    return clip


def _active_ids(db: DbSession, job_type: JobType, key: str) -> set[int]:
    return {int(j.payload[key]) for j in job_service.active_jobs(db, job_type) if key in j.payload}


def _enqueue(
    db: DbSession, request: Request, job_type: JobType, payload: dict[str, object]
) -> JobOut:
    job = job_service.enqueue(db, job_type, payload)
    request.app.state.job_runner.notify()
    return JobOut.model_validate(job)


# ------------------------------------------------------------------ analysis


class AnalysisStatus(BaseModel):
    ollama_running: bool
    ollama_version: str | None
    base_url: str
    model: str
    model_installed: bool


@router.get("/analysis/status", response_model=AnalysisStatus)
def analysis_status(db: DbSession) -> AnalysisStatus:
    ai = load_user_settings(db).ai
    version = ollama.get_version(ai.ollama_base_url)
    installed = False
    if version is not None:
        try:
            installed = ollama.has_model(ai.ollama_base_url, ai.ollama_model)
        except ollama.OllamaError:
            installed = False
    return AnalysisStatus(
        ollama_running=version is not None,
        ollama_version=version,
        base_url=ai.ollama_base_url,
        model=ai.ollama_model,
        model_installed=installed,
    )


@router.post("/analysis/models/pull", response_model=JobOut, status_code=status.HTTP_202_ACCEPTED)
def pull_model(db: DbSession, request: Request) -> JobOut:
    ai = load_user_settings(db).ai
    if ollama.get_version(ai.ollama_base_url) is None:
        raise AppError(
            "ollama_offline",
            "O Ollama não está em execução. Abra o Ollama e tente novamente.",
            status.HTTP_409_CONFLICT,
        )
    if job_service.active_jobs(db, JobType.PULL_LLM_MODEL):
        raise AppError(
            "job_already_active", "Já existe um download em andamento.", status.HTTP_409_CONFLICT
        )
    return _enqueue(db, request, JobType.PULL_LLM_MODEL, {"model": ai.ollama_model})


class AnalysisMode(StrEnum):
    AI = "ai"
    HEURISTIC = "heuristic"


class AnalyzeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: AnalysisMode = AnalysisMode.AI


@router.post(
    "/recordings/{recording_id}/analyze",
    response_model=JobOut,
    status_code=status.HTTP_202_ACCEPTED,
)
def analyze_recording(
    recording_id: int, payload: AnalyzeRequest, db: DbSession, request: Request
) -> JobOut:
    recording = db.get(Recording, recording_id)
    if recording is None:
        raise AppError("recording_not_found", "Gravação não encontrada.", status.HTTP_404_NOT_FOUND)
    if recording.transcript is None:
        raise AppError(
            "transcript_missing",
            "Transcreva a gravação antes de procurar os melhores momentos.",
            status.HTTP_409_CONFLICT,
        )
    if recording.status in (RecordingStatus.TRANSCRIBING, RecordingStatus.ANALYZING):
        raise AppError(
            "recording_busy", "Esta gravação já está sendo processada.", status.HTTP_409_CONFLICT
        )
    if recording_id in _active_ids(db, JobType.ANALYZE_RECORDING, "recording_id"):
        raise AppError(
            "job_already_active",
            "Esta gravação já está na fila de análise.",
            status.HTTP_409_CONFLICT,
        )
    if payload.mode == AnalysisMode.AI:
        ai = load_user_settings(db).ai
        if ollama.get_version(ai.ollama_base_url) is None:
            raise AppError(
                "ollama_offline",
                "O Ollama não está em execução. Abra o Ollama ou use a análise rápida (sem IA).",
                status.HTTP_409_CONFLICT,
            )
    return _enqueue(
        db,
        request,
        JobType.ANALYZE_RECORDING,
        {"recording_id": recording_id, "mode": payload.mode.value, "title": recording.title},
    )


# --------------------------------------------------------------------- clips


class ClipSort(StrEnum):
    SCORE = "score"
    RECENT = "recent"
    TIMELINE = "timeline"


@router.get("/clips", response_model=Page[ClipOut])
def list_clips(
    db: DbSession,
    page: PageParams,
    status_filter: Annotated[ClipStatus | None, Query(alias="status")] = None,
    recording_id: int | None = None,
    sort: ClipSort = ClipSort.SCORE,
) -> Page[ClipOut]:
    query = select(Clip)
    if status_filter is not None:
        query = query.where(Clip.status == status_filter)
    if recording_id is not None:
        query = query.where(Clip.recording_id == recording_id)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    orders: dict[ClipSort, tuple[ColumnElement[Any], ...]] = {
        ClipSort.SCORE: (Clip.score.desc(), Clip.id.desc()),
        ClipSort.RECENT: (Clip.created_at.desc(), Clip.id.desc()),
        ClipSort.TIMELINE: (Clip.recording_id.desc(), Clip.start_seconds.asc()),
    }
    order = orders[sort]
    rows = db.scalars(query.order_by(*order).limit(page.limit).offset(page.offset)).all()
    return Page(items=[to_out(c) for c in rows], total=total, limit=page.limit, offset=page.offset)


@router.get("/clips/{clip_id}", response_model=ClipOut)
def read_clip(clip_id: int, db: DbSession) -> ClipOut:
    return to_out(_get_clip(db, clip_id))


@router.delete("/clips/{clip_id}", status_code=status.HTTP_204_NO_CONTENT)
def discard_suggestion(clip_id: int, db: DbSession) -> Response:
    """Discards an AI suggestion that was not rendered yet. Rendered clips go through approval."""
    clip = _get_clip(db, clip_id)
    if clip.status != ClipStatus.DRAFT:
        raise AppError(
            "clip_not_draft",
            "Só é possível descartar sugestões que ainda não viraram vídeo.",
            status.HTTP_409_CONFLICT,
        )
    db.delete(clip)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/clips/{clip_id}/render", response_model=JobOut, status_code=status.HTTP_202_ACCEPTED)
def render_clip(clip_id: int, db: DbSession, request: Request) -> JobOut:
    clip = _get_clip(db, clip_id)
    if clip.status in (ClipStatus.APPROVED, ClipStatus.RENDERING):
        raise AppError(
            "clip_locked",
            "Este corte já foi aprovado ou está sendo renderizado.",
            status.HTTP_409_CONFLICT,
        )
    if clip_id in _active_ids(db, JobType.RENDER_CLIP, "clip_id"):
        raise AppError(
            "job_already_active", "Este corte já está na fila.", status.HTTP_409_CONFLICT
        )
    return _enqueue(db, request, JobType.RENDER_CLIP, {"clip_id": clip_id, "title": clip.title})


@router.get("/clips/{clip_id}/video")
def clip_video(clip_id: int, db: DbSession, download: bool = False) -> FileResponse:
    """Streams the rendered clip (supports seeking). Only files inside the clips folder."""
    clip = _get_clip(db, clip_id)
    clips_folder = load_user_settings(db).storage.clips
    if not clip.output_path or not clips_folder:
        raise AppError(
            "video_missing", "Este corte ainda não foi renderizado.", status.HTTP_404_NOT_FOUND
        )
    path = Path(clip.output_path).resolve()
    folder = Path(clips_folder).resolve()
    if folder not in path.parents or not path.is_file():
        raise AppError(
            "video_missing", "Arquivo do corte não encontrado.", status.HTTP_404_NOT_FOUND
        )
    return FileResponse(
        path,
        media_type="video/mp4",
        filename=path.name if download else None,
        content_disposition_type="attachment" if download else "inline",
    )
