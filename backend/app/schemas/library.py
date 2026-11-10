"""Read models for recordings, clips, publications and the dashboard."""

from __future__ import annotations

from datetime import datetime
from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict

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
    file_path: str
    file_size_bytes: int
    duration_seconds: float | None
    width: int | None
    height: int | None
    fps: float | None
    recorded_at: datetime | None
    status: RecordingStatus
    created_at: datetime


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
