from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.settings import WhisperModel


class WhisperModelInfo(BaseModel):
    name: WhisperModel
    downloaded: bool
    size_on_disk_bytes: int | None
    approx_download_bytes: int
    note: str
    selected: bool


class TranscriptionStatus(BaseModel):
    engine_installed: bool
    models_dir: str
    cpu_threads: int
    models: list[WhisperModelInfo]


class TranscribeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # 0-based index of the audio stream. OBS track 1 (index 0) is usually the full mix.
    audio_track: int = Field(default=0, ge=0, le=15)


class BulkTranscribeResult(BaseModel):
    queued: int
    skipped: int


class SegmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    position: int
    start_seconds: float
    end_seconds: float
    text: str


class TranscriptOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    recording_id: int
    model: str
    language: str | None
    language_probability: float | None
    audio_track: int
    audio_duration_seconds: float | None
    processing_seconds: float | None
    segment_count: int
    word_count: int
    created_at: datetime
    segments: list[SegmentOut]
