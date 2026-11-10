from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.config import APP_NAME, APP_VERSION

router = APIRouter(tags=["health"])


class Health(BaseModel):
    status: str
    app: str
    version: str
    time: datetime


@router.get("/health", response_model=Health)
def health() -> Health:
    return Health(status="ok", app=APP_NAME, version=APP_VERSION, time=datetime.now(UTC))
