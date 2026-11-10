"""Read models for recordings, clips, publications and the dashboard."""

from __future__ import annotations

from datetime import datetime
from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field

from app.db.models import ClipStatus, Platform, PublicationStatus, RecordingStatus

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    limit: int
    offset: int


class RecordingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    notes: str | None
    file_path: str
    file_size_bytes: int
    file_modified_at: datetime | None
    duration_seconds: float | None
    width: int | None
    height: int | None
    fps: float | None
    container: str | None
    video_codec: str | None
    audio_codec: str | None
    audio_tracks: int | None
    bitrate_kbps: int | None
    probed_at: datetime | None
    recorded_at: datetime | None
    status: RecordingStatus
    error_message: str | None
    created_at: datetime
    updated_at: datetime
    # Computed at read time: False when the file was moved/deleted or the HD is unplugged.
    file_exists: bool = True
    has_transcript: bool = False


class RecordingUpdate(BaseModel):
    """Editable fields. Omitted fields are left unchanged."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    title: str | None = Field(default=None, min_length=1, max_length=200)
    notes: str | None = Field(default=None, max_length=5000)


class LibraryStats(BaseModel):
    total: int
    total_size_bytes: int
    total_duration_seconds: float
    missing_metadata: int


class ClipOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    recording_id: int
    title: str
    description: str | None
    start_seconds: float
    end_seconds: float
    category: str | None
    score: float | None
    status: ClipStatus
    created_at: datetime


class PublicationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    clip_id: int
    platform: Platform
    status: PublicationStatus
    external_url: str | None
    published_at: datetime | None
    created_at: datetime


class DashboardCounts(BaseModel):
    recordings: int
    clips: int
    pending_review: int
    approved: int
    publications: int


class DashboardStorage(BaseModel):
    configured_folders: int
    ready_folders: int
    total_folders: int
    clips_free_bytes: int | None


class DashboardSummary(BaseModel):
    counts: DashboardCounts
    storage: DashboardStorage
    recent_recordings: list[RecordingOut]
