"""Shared FastAPI dependencies."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_session

DbSession = Annotated[Session, Depends(get_session)]


class Pagination(BaseModel):
    limit: int
    offset: int


def pagination(
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Pagination:
    return Pagination(limit=limit, offset=offset)


PageParams = Annotated[Pagination, Depends(pagination)]
