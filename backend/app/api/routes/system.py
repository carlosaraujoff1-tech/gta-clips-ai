from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import DbSession
from app.services.system_status import SystemStatus, get_system_status
from app.services.user_settings import load_user_settings

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/status", response_model=SystemStatus)
async def read_system_status(db: DbSession, refresh: bool = False) -> SystemStatus:
    return await get_system_status(load_user_settings(db), refresh=refresh)
