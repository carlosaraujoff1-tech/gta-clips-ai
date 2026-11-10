from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import func, select

from app.api.deps import DbSession
from app.api.routes.recordings import to_out
from app.db.models import Clip, ClipStatus, Publication, Recording
from app.schemas.library import (
    DashboardCounts,
    DashboardStorage,
    DashboardSummary,
)
from app.services.storage import storage_status
from app.services.user_settings import load_user_settings

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummary)
def dashboard_summary(db: DbSession) -> DashboardSummary:
    def count(model: type[Recording] | type[Clip] | type[Publication]) -> int:
        return db.scalar(select(func.count()).select_from(model)) or 0

    def count_clips(status: ClipStatus) -> int:
        return db.scalar(select(func.count()).select_from(Clip).where(Clip.status == status)) or 0

    status = storage_status(load_user_settings(db).storage)
    clips_folder = next(f for f in status.folders if f.key == "clips")
    recent = db.scalars(
        select(Recording).order_by(Recording.created_at.desc(), Recording.id.desc()).limit(5)
    ).all()

    return DashboardSummary(
        counts=DashboardCounts(
            recordings=count(Recording),
            clips=count(Clip),
            pending_review=count_clips(ClipStatus.PENDING_REVIEW),
            approved=count_clips(ClipStatus.APPROVED),
            publications=count(Publication),
        ),
        storage=DashboardStorage(
            configured_folders=sum(f.configured for f in status.folders),
            ready_folders=sum(f.writable for f in status.folders),
            total_folders=len(status.folders),
            clips_free_bytes=clips_folder.free_bytes,
        ),
        recent_recordings=[to_out(r) for r in recent],
    )
