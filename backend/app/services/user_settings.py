"""Persistence of user settings in the ``app_settings`` table."""

from __future__ import annotations

from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.core.logging import get_logger
from app.db.models import AppSetting
from app.schemas.settings import UserSettings

log = get_logger(__name__)

SETTINGS_KEY = "user_settings"


def load_user_settings(session: Session) -> UserSettings:
    row = session.get(AppSetting, SETTINGS_KEY)
    if row is None:
        return UserSettings()
    try:
        return UserSettings.model_validate(row.value)
    except ValidationError:
        # Never crash because of a stored value that became invalid (e.g. after
        # a rule change). Fall back to defaults and log it.
        log.warning("stored_settings_invalid_using_defaults")
        return UserSettings()


def save_user_settings(session: Session, settings: UserSettings) -> UserSettings:
    payload = settings.model_dump(mode="json")
    row = session.get(AppSetting, SETTINGS_KEY)
    if row is None:
        session.add(AppSetting(key=SETTINGS_KEY, value=payload))
    else:
        row.value = payload
    session.commit()
    log.info("settings_saved")
    return settings
