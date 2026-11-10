"""ORM models.

Video files are **never** stored in the database: rows only keep the path of
the file on disk plus its metadata.

Tables and the phase that fills them:
- ``recordings``   -> Phase 2 (import)
- ``jobs``         -> Phase 2+ (background tasks: import, probing, later transcription/rendering)
- ``clips``        -> Phases 4/5 (AI selection and rendering)
- ``publications`` -> Phase 7 (publishing, always after explicit approval)
"""

from __future__ import annotations

import enum
from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


def _enum(cls: type[enum.Enum]) -> Enum:
    # Stored as plain strings (no native DB enum): easy to evolve with migrations.
    return Enum(
        cls,
        native_enum=False,
        length=32,
        validate_strings=True,
        values_callable=lambda e: [m.value for m in e],
    )


class RecordingStatus(enum.StrEnum):
    IMPORTED = "imported"
    TRANSCRIBING = "transcribing"
    TRANSCRIBED = "transcribed"
    ANALYZING = "analyzing"
    ANALYZED = "analyzed"
    FAILED = "failed"


class ClipStatus(enum.StrEnum):
    DRAFT = "draft"  # suggested by the AI, not rendered yet
    RENDERING = "rendering"
    PENDING_REVIEW = "pending_review"  # rendered, waiting for the user's decision
    APPROVED = "approved"
    REJECTED = "rejected"
    FAILED = "failed"


class JobType(enum.StrEnum):
    SCAN_ORIGINALS = "scan_originals"
    IMPORT_FILE = "import_file"
    PROBE_RECORDING = "probe_recording"


class JobStatus(enum.StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"


class Platform(enum.StrEnum):
    TIKTOK = "tiktok"
    YOUTUBE_SHORTS = "youtube_shorts"
    INSTAGRAM_REELS = "instagram_reels"
    MANUAL_EXPORT = "manual_export"


class PublicationStatus(enum.StrEnum):
    SCHEDULED = "scheduled"
    PUBLISHED = "published"
    EXPORTED = "exported"
    FAILED = "failed"


class Recording(TimestampMixin, Base):
    __tablename__ = "recordings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    file_path: Mapped[str] = mapped_column(String(1024), unique=True, nullable=False)
    # BigInteger: lives easily exceed 2 GB (would overflow a 32-bit column on PostgreSQL).
    file_size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    file_modified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(Text)

    # Metadata read with ffprobe. ``None`` until probing succeeds.
    duration_seconds: Mapped[float | None] = mapped_column(Float)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    fps: Mapped[float | None] = mapped_column(Float)
    container: Mapped[str | None] = mapped_column(String(64))
    video_codec: Mapped[str | None] = mapped_column(String(32))
    audio_codec: Mapped[str | None] = mapped_column(String(32))
    audio_tracks: Mapped[int | None] = mapped_column(Integer)
    bitrate_kbps: Mapped[int | None] = mapped_column(Integer)
    probed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    recorded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[RecordingStatus] = mapped_column(
        _enum(RecordingStatus), default=RecordingStatus.IMPORTED, nullable=False, index=True
    )
    error_message: Mapped[str | None] = mapped_column(Text)

    clips: Mapped[list[Clip]] = relationship(back_populates="recording")


class Clip(TimestampMixin, Base):
    __tablename__ = "clips"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    recording_id: Mapped[int] = mapped_column(
        ForeignKey("recordings.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    start_seconds: Mapped[float] = mapped_column(Float, nullable=False)
    end_seconds: Mapped[float] = mapped_column(Float, nullable=False)
    category: Mapped[str | None] = mapped_column(String(50))  # e.g. "perseguição", "engraçado"
    score: Mapped[float | None] = mapped_column(Float)  # 0-100 quality score from the AI
    output_path: Mapped[str | None] = mapped_column(String(1024))
    status: Mapped[ClipStatus] = mapped_column(
        _enum(ClipStatus), default=ClipStatus.DRAFT, nullable=False, index=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    recording: Mapped[Recording] = relationship(back_populates="clips")
    publications: Mapped[list[Publication]] = relationship(back_populates="clip")


class Publication(TimestampMixin, Base):
    __tablename__ = "publications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    clip_id: Mapped[int] = mapped_column(
        ForeignKey("clips.id", ondelete="CASCADE"), nullable=False, index=True
    )
    platform: Mapped[Platform] = mapped_column(_enum(Platform), nullable=False)
    status: Mapped[PublicationStatus] = mapped_column(_enum(PublicationStatus), nullable=False)
    external_url: Mapped[str | None] = mapped_column(String(1024))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    clip: Mapped[Clip] = relationship(back_populates="publications")


class AppSetting(TimestampMixin, Base):
    """Key/value store for user-editable preferences (validated by Pydantic)."""

    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[Any] = mapped_column(JSON, nullable=False)


class Job(TimestampMixin, Base):
    """A long-running task executed by the background worker (see ``app.jobs``)."""

    __tablename__ = "jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    type: Mapped[JobType] = mapped_column(_enum(JobType), nullable=False, index=True)
    status: Mapped[JobStatus] = mapped_column(
        _enum(JobStatus), default=JobStatus.QUEUED, nullable=False, index=True
    )
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    result: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    progress: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)  # 0.0 - 1.0
    message: Mapped[str | None] = mapped_column(String(300))
    error: Mapped[str | None] = mapped_column(Text)
    cancel_requested: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
