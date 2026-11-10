"""Read-only listings. Creation of these records arrives in later phases."""

from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import func, select

from app.api.deps import DbSession, PageParams
from app.db.models import Publication
from app.schemas.library import Page, PublicationOut

router = APIRouter(tags=["library"])


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
