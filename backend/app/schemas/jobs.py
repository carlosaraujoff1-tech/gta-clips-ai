from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.db.models import JobStatus, JobType


class JobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: JobType
    status: JobStatus
    progress: float
    message: str | None
    error: str | None
    result: dict[str, Any] | None
    payload: dict[str, Any]
    cancel_requested: bool
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None


class ImportFileRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    source_path: str = Field(min_length=3, max_length=1024)

    @field_validator("source_path", mode="before")
    @classmethod
    def _strip_quotes(cls, value: object) -> object:
        # Windows Explorer's "Copy as path" wraps the path in double quotes.
        return value.strip().strip('"') if isinstance(value, str) else value
