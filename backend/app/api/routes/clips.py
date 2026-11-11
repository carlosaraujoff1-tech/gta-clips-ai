"""Phase 4 (highlight analysis) and clip endpoints, including the Phase 5 preview render."""

from __future__ import annotations

import os
from enum import StrEnum
from pathlib import Path
from typing import Annotated, Any

from fastapi import APIRouter, Query, Request, Response, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import ColumnElement, func, select

from app.api.deps import DbSession, PageParams
from app.core.errors import AppError
from app.db.models import Clip, ClipStatus, JobType, Recording, RecordingStatus
from app.jobs.render import effective_edit, render_inputs
from app.schemas.jobs import JobOut
from app.schemas.library import ClipOut, Page
from app.schemas.settings import ClipEdit, RenderSettings
from app.services import jobs as job_service
from app.services import ollama
from app.services.tools import ToolNotFoundError, ToolTimeoutError, run_tool_bytes
from app.services.user_settings import load_user_settings

router = APIRouter(tags=["clips"])


# ------------------------------------------------------------------ helpers


def to_out(clip: Clip, defaults: RenderSettings | None = None) -> ClipOut:
    out = ClipOut.model_validate(clip)
    out.recording_title = clip.recording.title
    out.recording_duration = clip.recording.duration_seconds
    out.has_video = bool(clip.output_path) and os.path.isfile(clip.output_path or "")
    thumb = (clip.render_info or {}).get("thumbnail")
    out.has_thumbnail = out.has_video and isinstance(thumb, str) and os.path.isfile(thumb)
    inputs = (clip.render_info or {}).get("inputs")
    if out.has_video and isinstance(inputs, dict) and defaults is not None:
        current = render_inputs(
            clip.start_seconds, clip.end_seconds, clip.title, effective_edit(clip.edit, defaults)
        )
        out.render_outdated = current != inputs
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
    defaults = load_user_settings(db).render
    return Page(
        items=[to_out(c, defaults) for c in rows],
        total=total,
        limit=page.limit,
        offset=page.offset,
    )


@router.get("/clips/{clip_id}", response_model=ClipOut)
def read_clip(clip_id: int, db: DbSession) -> ClipOut:
    return to_out(_get_clip(db, clip_id), load_user_settings(db).render)


class ClipUpdate(BaseModel):
    """Editable fields of a clip (omitted fields are unchanged)."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    title: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    start_seconds: float | None = Field(default=None, ge=0)
    end_seconds: float | None = Field(default=None, gt=0)
    edit: ClipEdit | None = None


MIN_CLIP_S, MAX_CLIP_S = 3.0, 180.0


@router.patch("/clips/{clip_id}", response_model=ClipOut)
def update_clip(clip_id: int, payload: ClipUpdate, db: DbSession) -> ClipOut:
    clip = _get_clip(db, clip_id)
    if clip.status in (ClipStatus.APPROVED, ClipStatus.RENDERING):
        raise AppError(
            "clip_locked",
            "Este corte já foi aprovado ou está sendo renderizado e não pode ser editado.",
            status.HTTP_409_CONFLICT,
        )
    changes = payload.model_dump(exclude_unset=True)
    start = payload.start_seconds if "start_seconds" in changes else clip.start_seconds
    end = payload.end_seconds if "end_seconds" in changes else clip.end_seconds
    if start is None or end is None:
        raise AppError("validation_error", "Informe o início e o fim do corte.")
    limit = clip.recording.duration_seconds
    if limit is not None and end > limit + 0.01:
        raise AppError(
            "validation_error", "O fim do corte passa da duração da gravação.",
            status.HTTP_422_UNPROCESSABLE_CONTENT,
        )  # fmt: skip
    if not MIN_CLIP_S <= end - start <= MAX_CLIP_S:
        raise AppError(
            "validation_error",
            f"O corte deve ter entre {MIN_CLIP_S:.0f} e {MAX_CLIP_S:.0f} segundos.",
            status.HTTP_422_UNPROCESSABLE_CONTENT,
        )
    if "title" in changes:
        if payload.title is None:
            raise AppError("validation_error", "O título não pode ficar vazio.")
        clip.title = payload.title
    if "description" in changes:
        clip.description = payload.description or None
    clip.start_seconds, clip.end_seconds = round(start, 2), round(end, 2)
    if "edit" in changes:
        clip.edit = payload.edit.model_dump() if payload.edit else None
    db.commit()
    return to_out(clip, load_user_settings(db).render)


@router.get("/clips/{clip_id}/thumbnail")
def clip_thumbnail(clip_id: int, db: DbSession) -> FileResponse:
    clip = _get_clip(db, clip_id)
    clips_folder = load_user_settings(db).storage.clips
    thumb = (clip.render_info or {}).get("thumbnail")
    if not isinstance(thumb, str) or not clips_folder:
        raise AppError("thumbnail_missing", "Miniatura indisponível.", status.HTTP_404_NOT_FOUND)
    path = Path(thumb).resolve()
    if Path(clips_folder).resolve() not in path.parents or not path.is_file():
        raise AppError("thumbnail_missing", "Miniatura indisponível.", status.HTTP_404_NOT_FOUND)
    return FileResponse(path, media_type="image/jpeg")


@router.get("/recordings/{recording_id}/frame")
def recording_frame(
    recording_id: int,
    db: DbSession,
    t: Annotated[float, Query(ge=0)] = 0.0,
    width: Annotated[int, Query(ge=160, le=1920)] = 960,
) -> Response:
    """A JPEG frame of the recording (used by the clip editor and the webcam picker)."""
    recording = db.get(Recording, recording_id)
    if recording is None:
        raise AppError("recording_not_found", "Gravação não encontrada.", status.HTTP_404_NOT_FOUND)
    source = Path(recording.file_path)
    if not source.is_file():
        raise AppError(
            "file_missing", "Arquivo da gravação não encontrado.", status.HTTP_404_NOT_FOUND
        )
    if recording.duration_seconds is not None:
        t = min(t, max(recording.duration_seconds - 0.1, 0.0))
    try:
        image = run_tool_bytes(
            "ffmpeg",
            load_user_settings(db).tools,
            ["-v", "error", "-ss", f"{t:.3f}", "-i", str(source), "-frames:v", "1",
             "-vf", f"scale={width}:-2", "-q:v", "4",
             "-f", "image2pipe", "-c:v", "mjpeg", "pipe:1"],
            timeout=20,
        )  # fmt: skip
    except (ToolNotFoundError, ToolTimeoutError) as exc:
        raise AppError(
            "frame_failed", "Não foi possível ler o quadro do vídeo.", status.HTTP_502_BAD_GATEWAY
        ) from exc
    if image is None:
        raise AppError(
            "frame_failed", "Não foi possível ler o quadro do vídeo.", status.HTTP_502_BAD_GATEWAY
        )
    return Response(
        content=image, media_type="image/jpeg", headers={"Cache-Control": "max-age=3600"}
    )


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
