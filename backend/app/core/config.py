"""Process-level configuration.

These values are read once at startup from environment variables (prefix
``GTA_CLIPS_``) or from ``backend/.env``. They describe *how the backend runs*
(where its database lives, which origin may talk to it, etc.).

User-editable preferences such as the video storage folders are **not** here:
they live in the database (see ``app.services.user_settings``) so they can be
changed from the Settings page without restarting anything.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]

APP_NAME = "GTA Clips AI"
APP_VERSION = "0.1.0"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="GTA_CLIPS_",
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Where the SQLite database and logs are stored. Must be on the internal SSD.
    data_dir: Path = Field(default=BACKEND_DIR / "data")

    # Network binding. The API is meant to be reachable only from this machine.
    host: str = "127.0.0.1"
    port: int = Field(default=8000, ge=1024, le=65535)

    # The only browser origins allowed to call the API (the local frontend).
    cors_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:3000", "http://127.0.0.1:3000"]
    )
    # Accepted values for the HTTP Host header (protects against DNS rebinding).
    allowed_hosts: list[str] = Field(default_factory=lambda: ["localhost", "127.0.0.1"])

    log_level: str = Field(default="INFO", pattern="^(DEBUG|INFO|WARNING|ERROR)$")
    log_json: bool = True

    @property
    def database_path(self) -> Path:
        return self.data_dir / "gta_clips.db"

    @property
    def database_url(self) -> str:
        return f"sqlite:///{self.database_path.as_posix()}"

    @property
    def log_dir(self) -> Path:
        return self.data_dir / "logs"

    @property
    def models_dir(self) -> Path:
        """AI models (SSD). Downloaded once, then used offline."""
        return self.data_dir / "models"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
