"""Phase 6: review workflow. Nothing leaves the app without an explicit approval here."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select

from app.api.deps import DbSession
from app.api.routes.clips import MAX_CLIP_S, MIN_CLIP_S, _get_clip, to_out
from app.core.errors import AppError
from app.core.logging import get_logger
from app.db.models import Clip, ClipStatus, Recording
from app.schemas.library import ClipOut
from app.services.user_settings import load_user_settings

router = APIRouter(tags=["review"])
log = get_logger(__name__)


class ClipCounts(BaseModel):
    draft: int = 0
    rendering: int = 0
    pending_review: int = 0
    approved: int = 0
    rejected: int = 0
    failed: int = 0


@router.get("/clips/counts", response_model=ClipCounts)
def clip_counts(db: DbSession) -> ClipCounts:
    rows = db.execute(select(Clip.status, func.count()).group_by(Clip.status)).all()
    return ClipCounts(**{str(status_.value): total for status_, total in rows})


def _require(clip: Clip, allowed: tuple[ClipStatus, ...], message: str) -> None:
    if clip.status not in allowed:
        raise AppError("invalid_clip_state", message, status.HTTP_409_CONFLICT)


@router.post("/clips/{clip_id}/approve", response_model=ClipOut)
def approve_clip(clip_id: int, db: DbSession) -> ClipOut:
    """Explicit approval. Only a finished, up-to-date video can be approved."""
    clip = _get_clip(db, clip_id)
    defaults = load_user_settings(db).render
    _require(
        clip,
        (ClipStatus.PENDING_REVIEW,),
        "Só cortes com vídeo pronto e aguardando aprovação podem ser aprovados.",
    )
    out = to_out(clip, defaults)
    if not out.has_video:
        raise AppError(
            "video_missing",
            "O arquivo do vídeo não foi encontrado. O HD está conectado? Gere o vídeo de novo.",
            status.HTTP_409_CONFLICT,
        )
    if out.render_outdated:
        raise AppError(
            "render_outdated",
            "A edição mudou depois do último vídeo. Gere o vídeo de novo antes de aprovar.",
            status.HTTP_409_CONFLICT,
        )
    clip.status = ClipStatus.APPROVED
    clip.reviewed_at = datetime.now(UTC)
    clip.reject_reason = None
    db.commit()
    log.info("clip_approved", clip_id=clip_id)
    return to_out(clip, defaults)


class RejectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    reason: str | None = Field(default=None, max_length=500)


@router.post("/clips/{clip_id}/reject", response_model=ClipOut)
def reject_clip(clip_id: int, db: DbSession, payload: RejectRequest | None = None) -> ClipOut:
    clip = _get_clip(db, clip_id)
    _require(
        clip,
        (ClipStatus.DRAFT, ClipStatus.PENDING_REVIEW),
        "Só é possível rejeitar cortes que ainda não foram aprovados.",
    )
    clip.status = ClipStatus.REJECTED
    clip.reviewed_at = datetime.now(UTC)
    clip.reject_reason = (payload.reason if payload else None) or None
    db.commit()
    log.info("clip_rejected", clip_id=clip_id)
    return to_out(clip, load_user_settings(db).render)


@router.post("/clips/{clip_id}/reopen", response_model=ClipOut)
def reopen_clip(clip_id: int, db: DbSession) -> ClipOut:
    """Undo an approval or a rejection: the clip goes back to the review queue."""
    clip = _get_clip(db, clip_id)
    _require(
        clip,
        (ClipStatus.APPROVED, ClipStatus.REJECTED),
        "Só cortes aprovados ou rejeitados podem ser reabertos.",
    )
    defaults = load_user_settings(db).render
    has_video = to_out(clip, defaults).has_video
    clip.status = ClipStatus.PENDING_REVIEW if has_video else ClipStatus.DRAFT
    clip.reviewed_at = None
    clip.reject_reason = None
    db.commit()
    log.info("clip_reopened", clip_id=clip_id)
    return to_out(clip, defaults)


class ManualClip(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    title: str = Field(min_length=1, max_length=120)
    start_seconds: float = Field(ge=0)
    end_seconds: float = Field(gt=0)


@router.post(
    "/recordings/{recording_id}/clips", response_model=ClipOut, status_code=status.HTTP_201_CREATED
)
def create_manual_clip(recording_id: int, payload: ManualClip, db: DbSession) -> ClipOut:
    """A clip chosen by the user (not by the AI). It still goes through render + approval."""
    recording = db.get(Recording, recording_id)
    if recording is None:
        raise AppError("recording_not_found", "Gravação não encontrada.", status.HTTP_404_NOT_FOUND)
    limit = recording.duration_seconds
    if limit is not None and payload.end_seconds > limit + 0.01:
        raise AppError(
            "validation_error",
            "O fim do corte passa da duração da gravação.",
            status.HTTP_422_UNPROCESSABLE_CONTENT,
        )
    length = payload.end_seconds - payload.start_seconds
    if not MIN_CLIP_S <= length <= MAX_CLIP_S:
        raise AppError(
            "validation_error",
            f"O corte deve ter entre {MIN_CLIP_S:.0f} e {MAX_CLIP_S:.0f} segundos.",
            status.HTTP_422_UNPROCESSABLE_CONTENT,
        )
    clip = Clip(
        recording_id=recording_id,
        title=payload.title,
        start_seconds=round(payload.start_seconds, 2),
        end_seconds=round(payload.end_seconds, 2),
        category="outro",
        reason="Corte criado manualmente.",
        source="manual",
        status=ClipStatus.DRAFT,
    )
    db.add(clip)
    db.commit()
    log.info("manual_clip_created", clip_id=clip.id)
    return to_out(clip, load_user_settings(db).render)
