"""Recordings library: finding, copying and registering video files."""

from __future__ import annotations

import os
import shutil
from collections.abc import Callable, Iterator
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.logging import get_logger
from app.db.models import Recording, RecordingStatus
from app.schemas.settings import ToolSettings
from app.services.media_probe import MediaInfo, ProbeError, probe_file

log = get_logger(__name__)

# Containers produced by OBS / Streamlabs / common recorders.
VIDEO_EXTENSIONS = frozenset({".mp4", ".mkv", ".mov", ".flv", ".ts", ".webm", ".avi", ".m4v"})
PARTIAL_SUFFIX = ".part"
COPY_CHUNK_BYTES = 8 * 1024 * 1024
FREE_SPACE_MARGIN_BYTES = 1024 * 1024 * 1024  # keep at least 1 GB free after copying


def normalize_path(path: Path | str) -> str:
    return os.path.normpath(os.path.abspath(str(path)))


def is_video_file(path: Path) -> bool:
    return path.suffix.lower() in VIDEO_EXTENSIONS and not path.name.startswith(".")


def is_inside(path: Path, folder: Path) -> bool:
    a = os.path.normcase(normalize_path(path))
    b = os.path.normcase(normalize_path(folder))
    return a.startswith(b.rstrip(os.sep) + os.sep)


def iter_video_files(folder: Path) -> Iterator[Path]:
    """Video files under ``folder`` (recursive), skipping hidden folders and partial copies."""
    for root, dirs, files in os.walk(folder):
        dirs[:] = sorted(d for d in dirs if not d.startswith("."))
        for name in sorted(files):
            path = Path(root) / name
            if is_video_file(path):
                yield path


def find_by_path(session: Session, path: Path | str) -> Recording | None:
    return session.scalars(
        select(Recording).where(Recording.file_path == normalize_path(path))
    ).first()


def apply_media_info(recording: Recording, info: MediaInfo) -> None:
    recording.duration_seconds = info.duration_seconds
    recording.width = info.width
    recording.height = info.height
    recording.fps = info.fps
    recording.container = info.container
    recording.video_codec = info.video_codec
    recording.audio_codec = info.audio_codec
    recording.audio_tracks = info.audio_tracks
    recording.bitrate_kbps = info.bitrate_kbps
    recording.probed_at = datetime.now(UTC)
    if info.created_at is not None:
        recording.recorded_at = info.created_at
    recording.error_message = None


def refresh_metadata(recording: Recording, tools: ToolSettings) -> bool:
    """Re-reads file stats and metadata. Returns False (and stores the reason) on failure."""
    path = Path(recording.file_path)
    try:
        stat = path.stat()
    except OSError:
        recording.error_message = "Arquivo não encontrado. O HD externo está conectado?"
        return False
    recording.file_size_bytes = stat.st_size
    recording.file_modified_at = datetime.fromtimestamp(stat.st_mtime, UTC)
    try:
        apply_media_info(recording, probe_file(path, tools))
    except ProbeError as exc:
        recording.error_message = str(exc)
        return False
    return True


def register_file(session: Session, path: Path, tools: ToolSettings) -> tuple[Recording, bool]:
    """Adds ``path`` to the library (or returns the existing row). Returns (recording, created)."""
    existing = find_by_path(session, path)
    if existing is not None:
        return existing, False

    stat = path.stat()
    modified = datetime.fromtimestamp(stat.st_mtime, UTC)
    recording = Recording(
        title=path.stem[:200] or path.name[:200],
        file_path=normalize_path(path),
        file_size_bytes=stat.st_size,
        file_modified_at=modified,
        recorded_at=modified,
        status=RecordingStatus.IMPORTED,
    )
    try:
        apply_media_info(recording, probe_file(path, tools))
    except ProbeError as exc:
        recording.error_message = str(exc)
    session.add(recording)
    session.commit()
    log.info(
        "recording_registered", recording_id=recording.id, probed=recording.probed_at is not None
    )
    return recording, True


def unique_destination(folder: Path, name: str) -> Path:
    candidate = folder / name
    stem, suffix = Path(name).stem, Path(name).suffix
    counter = 1
    while candidate.exists() or candidate.with_name(candidate.name + PARTIAL_SUFFIX).exists():
        candidate = folder / f"{stem} ({counter}){suffix}"
        counter += 1
    return candidate


def copy_with_progress(
    source: Path,
    destination: Path,
    on_progress: Callable[[int, int], None],
) -> None:
    """Copies via a ``.part`` file, renamed only when complete. Removes it on any failure.

    ``on_progress(copied, total)`` may raise (e.g. to cancel); the partial file is then removed.
    """
    total = source.stat().st_size
    partial = destination.with_name(destination.name + PARTIAL_SUFFIX)
    copied = 0
    try:
        with source.open("rb") as src, partial.open("xb") as dst:
            while chunk := src.read(COPY_CHUNK_BYTES):
                dst.write(chunk)
                copied += len(chunk)
                on_progress(copied, total)
        shutil.copystat(source, partial)  # keep the original modification date
        partial.rename(destination)
    except BaseException:
        partial.unlink(missing_ok=True)
        raise
