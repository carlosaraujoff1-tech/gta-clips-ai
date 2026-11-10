"""Audio extraction with ffmpeg (input for transcription)."""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

from app.core.logging import get_logger
from app.schemas.settings import ToolSettings
from app.services.tools import FfmpegFailedError, run_ffmpeg_with_progress

log = get_logger(__name__)

WHISPER_SAMPLE_RATE = 16_000


class AudioExtractionError(Exception):
    """User-facing (Portuguese) explanation."""


def extract_audio(
    source: Path,
    destination: Path,
    audio_track: int,
    tools: ToolSettings,
    duration_seconds: float | None,
    on_progress: Callable[[float], None],
) -> None:
    """Writes one audio track of ``source`` as 16 kHz mono WAV (what Whisper expects).

    ``on_progress(fraction)`` is called as ffmpeg advances; it may raise (e.g. to
    cancel), in which case ffmpeg is stopped and the partial file removed.
    """
    if not source.is_absolute() or not destination.is_absolute():
        raise AudioExtractionError("Caminho inválido para extração de áudio.")
    args = [
        "-i", str(source),
        "-map", f"0:a:{int(audio_track)}",
        "-vn", "-ac", "1", "-ar", str(WHISPER_SAMPLE_RATE),
        "-c:a", "pcm_s16le", "-f", "wav",
        str(destination),
    ]  # fmt: skip
    try:
        run_ffmpeg_with_progress(tools, args, duration_seconds, on_progress, output=destination)
    except FfmpegFailedError as exc:
        if "matches no streams" in exc.stderr or "Stream map" in exc.stderr:
            raise AudioExtractionError(
                f"A faixa de áudio {audio_track + 1} não existe neste vídeo."
            ) from exc
        raise AudioExtractionError("O FFmpeg não conseguiu extrair o áudio deste vídeo.") from exc
