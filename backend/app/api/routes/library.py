"""Read-only listings. Creation of these records arrives in later phases."""

from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import func, select

from app.api.deps import DbSession, PageParams
from app.db.models import Clip, ClipStatus, Publication
from app.schemas.library import ClipOut, Page, PublicationOut

router = APIRouter(tags=["library"])


@router.get("/clips", response_model=Page[ClipOut])
def list_clips(db: DbSession, page: PageParams, status: ClipStatus | None = None) -> Page[ClipOut]:
    query = select(Clip)
    count = select(func.count()).select_from(Clip)
    if status is not None:
        query = query.where(Clip.status == status)
        count = count.where(Clip.status == status)
    total = db.scalar(count) or 0
    rows = db.scalars(
        query.order_by(Clip.created_at.desc(), Clip.id.desc()).limit(page.limit).offset(page.offset)
    ).all()
    return Page(
        items=[ClipOut.model_validate(c) for c in rows],
        total=total,
        limit=page.limit,
        offset=page.offset,
    )


@router.get("/publications", response_model=Page[PublicationOut])
def list_publications(db: DbSession, page: PageParams) -> Page[PublicationOut]:
    total = db.scalar(select(func.count()).select_from(Publication)) or 0
    rows = db.scalars(
        select(Publication)
        .order_by(Publication.created_at.desc(), Publication.id.desc())
        .limit(page.limit)
        .offset(page.offset)
    ).all()
    return Page(
        items=[PublicationOut.model_validate(p) for p in rows],
        total=total,
        limit=page.limit,
        offset=page.offset,
    )
