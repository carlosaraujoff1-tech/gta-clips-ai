"""Reads video metadata with ffprobe."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from app.core.logging import get_logger
from app.schemas.settings import ToolSettings
from app.services.tools import ToolNotFoundError, ToolTimeoutError, run_tool

log = get_logger(__name__)

PROBE_TIMEOUT_SECONDS = 60


class ProbeError(Exception):
    """User-facing (Portuguese) explanation of why metadata could not be read."""


@dataclass(frozen=True)
class MediaInfo:
    duration_seconds: float | None
    width: int | None
    height: int | None
    fps: float | None
    container: str | None
    video_codec: str | None
    audio_codec: str | None
    audio_tracks: int
    bitrate_kbps: int | None
    created_at: datetime | None


def _to_float(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number >= 0 else None


def _parse_rate(rate: Any) -> float | None:
    """'60/1' -> 60.0, '30000/1001' -> 29.97, '0/0' -> None."""
    if not isinstance(rate, str) or "/" not in rate:
        return _to_float(rate)
    num, _, den = rate.partition("/")
    n, d = _to_float(num), _to_float(den)
    if not n or not d:
        return None
    return round(n / d, 3)


def _parse_datetime(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def parse_ffprobe_output(data: dict[str, Any]) -> MediaInfo:
    """Turns ffprobe's ``-show_format -show_streams`` JSON into ``MediaInfo``."""
    streams: list[dict[str, Any]] = [s for s in data.get("streams", []) if isinstance(s, dict)]
    fmt: dict[str, Any] = data.get("format", {}) if isinstance(data.get("format"), dict) else {}

    video = next(
        (
            s
            for s in streams
            if s.get("codec_type") == "video"
            # Ignore embedded cover art / thumbnails.
            and not (s.get("disposition") or {}).get("attached_pic")
        ),
        None,
    )
    audio = [s for s in streams if s.get("codec_type") == "audio"]

    duration = _to_float(fmt.get("duration"))
    if duration is None and video is not None:
        duration = _to_float(video.get("duration"))

    fps = None
    if video is not None:
        fps = _parse_rate(video.get("avg_frame_rate")) or _parse_rate(video.get("r_frame_rate"))

    bit_rate = _to_float(fmt.get("bit_rate"))
    tags = fmt.get("tags") if isinstance(fmt.get("tags"), dict) else {}

    return MediaInfo(
        duration_seconds=round(duration, 3) if duration is not None else None,
        width=int(video["width"]) if video and isinstance(video.get("width"), int) else None,
        height=int(video["height"]) if video and isinstance(video.get("height"), int) else None,
        fps=fps,
        container=str(fmt["format_name"])[:64] if fmt.get("format_name") else None,
        video_codec=str(video["codec_name"])[:32] if video and video.get("codec_name") else None,
        audio_codec=str(audio[0]["codec_name"])[:32]
        if audio and audio[0].get("codec_name")
        else None,
        audio_tracks=len(audio),
        bitrate_kbps=round(bit_rate / 1000) if bit_rate else None,
        created_at=_parse_datetime((tags or {}).get("creation_time")),
    )


def probe_file(path: Path, tools: ToolSettings) -> MediaInfo:
    """Runs ffprobe on ``path`` (an absolute path to an existing file)."""
    if not path.is_absolute():  # defence in depth: never pass something that looks like an option
        raise ProbeError("Caminho inválido para leitura de metadados.")
    args = [
        "-v", "error",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        str(path),
    ]  # fmt: skip
    try:
        result = run_tool("ffprobe", tools, args, timeout=PROBE_TIMEOUT_SECONDS)
    except ToolNotFoundError as exc:
        raise ProbeError(
            "FFprobe não encontrado. Instale o FFmpeg ou configure o caminho em Configurações."
        ) from exc
    except ToolTimeoutError as exc:
        raise ProbeError("O FFprobe demorou demais para ler o arquivo.") from exc

    if result.returncode != 0:
        log.info("probe_failed", returncode=result.returncode, stderr=result.stderr[-500:])
        raise ProbeError(
            "Não foi possível ler o vídeo. O arquivo pode estar corrompido ou incompleto."
        )
    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise ProbeError("Resposta inesperada do FFprobe.") from exc

    info = parse_ffprobe_output(data if isinstance(data, dict) else {})
    if info.video_codec is None:
        raise ProbeError("O arquivo não contém uma faixa de vídeo.")
    return info
