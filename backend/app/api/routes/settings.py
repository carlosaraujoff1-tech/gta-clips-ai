from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import DbSession
from app.schemas.settings import StorageStatus, UserSettings
from app.services import storage
from app.services.user_settings import load_user_settings, save_user_settings

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=UserSettings)
def read_settings(db: DbSession) -> UserSettings:
    return load_user_settings(db)


@router.put("", response_model=UserSettings)
def update_settings(payload: UserSettings, db: DbSession) -> UserSettings:
    return save_user_settings(db, payload)


@router.get("/storage/status", response_model=StorageStatus)
def read_storage_status(db: DbSession) -> StorageStatus:
    return storage.storage_status(load_user_settings(db).storage)


@router.post("/storage/create-folders", response_model=StorageStatus)
def create_storage_folders(db: DbSession) -> StorageStatus:
    """Creates the folders that are already saved in the settings (no body accepted)."""
    return storage.create_missing_folders(load_user_settings(db).storage)
