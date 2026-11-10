"""Audio extraction with ffmpeg (input for transcription)."""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

from app.core.logging import get_logger
from app.schemas.settings import ToolSettings
from app.services.tools import start_tool

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
        "-nostdin", "-hide_banner", "-v", "error", "-y",
        "-i", str(source),
        "-map", f"0:a:{int(audio_track)}",
        "-vn", "-ac", "1", "-ar", str(WHISPER_SAMPLE_RATE),
        "-c:a", "pcm_s16le", "-f", "wav",
        "-progress", "pipe:1", "-nostats",
        str(destination),
    ]  # fmt: skip
    process = start_tool("ffmpeg", tools, args)
    try:
        assert process.stdout is not None
        for line in process.stdout:
            key, _, value = line.strip().partition("=")
            if key == "out_time_us" and duration_seconds and value.isdigit():
                on_progress(min(1.0, int(value) / 1_000_000 / duration_seconds))
        stderr = process.stderr.read() if process.stderr else ""
        returncode = process.wait()
    except BaseException:
        process.kill()
        process.wait()
        destination.unlink(missing_ok=True)
        raise

    if returncode != 0:
        destination.unlink(missing_ok=True)
        log.info("audio_extraction_failed", returncode=returncode, stderr=stderr[-500:])
        if "matches no streams" in stderr or "Stream map" in stderr:
            raise AudioExtractionError(
                f"A faixa de áudio {audio_track + 1} não existe neste vídeo."
            )
        raise AudioExtractionError("O FFmpeg não conseguiu extrair o áudio deste vídeo.")
    on_progress(1.0)
