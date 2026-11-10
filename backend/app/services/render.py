"""Renders a vertical 9:16 clip (1080x1920) ready for TikTok / Shorts / Reels.

Edit applied with ffmpeg:
- layout ``blur``: gameplay centred (4:3 crop) over a blurred, darkened copy that
  fills the frame; ``crop``: centre 9:16 crop of the gameplay;
- optional slow push-in zoom (6 % over the clip) for movement;
- title box at the top and word-synced subtitles in the lower third (ASS/libass);
- audio: fade in/out and loudness normalisation to the platform level (-14 LUFS);
- H.264 via the AMD GPU encoder (AMF) when available, libx264 on the CPU otherwise
  (automatic fallback if the GPU encode fails).
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from app.core.logging import get_logger
from app.schemas.settings import RenderSettings, ToolSettings
from app.services.tools import (
    FfmpegFailedError,
    ToolNotFoundError,
    ToolTimeoutError,
    run_ffmpeg_with_progress,
    run_tool,
)

log = get_logger(__name__)

OUT_W, OUT_H = 1080, 1920
FG_W, FG_H = 1080, 810  # 4:3 gameplay window in the blur layout
FG_Y = 520  # leaves room for the title above and subtitles below
ZOOM_AMOUNT = 0.06


class RenderError(Exception):
    """User-facing (Portuguese) explanation."""


@dataclass(frozen=True)
class RenderJob:
    source: Path
    start: float
    end: float
    source_fps: float | None
    has_audio: bool
    subtitles_file: Path
    output: Path


def slugify(text: str, max_len: int = 50) -> str:
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^A-Za-z0-9]+", "-", ascii_text).strip("-").lower()
    return slug[:max_len].strip("-") or "corte"


def _filter_path(path: Path) -> str:
    """Path quoted for an ffmpeg filter argument (handles Windows drive letters)."""
    posix = path.resolve().as_posix()
    if "'" in posix:
        raise RenderError("O caminho da pasta de processamento não pode conter apóstrofo (').")
    return "'" + posix.replace(":", "\\:") + "'"


def output_fps(source_fps: float | None) -> int:
    if not source_fps or source_fps <= 0:
        return 30
    return 60 if source_fps >= 50 else 30


def build_filters(job: RenderJob, settings: RenderSettings) -> tuple[str, str | None]:
    duration = max(job.end - job.start, 0.1)
    fps = output_fps(job.source_fps)
    zoom = ZOOM_AMOUNT if settings.zoom else 0.0
    # Width grows linearly with time for the push-in; even sizes keep encoders happy.
    grow = f"trunc({{base}}*(1+{zoom}*t/{duration:.3f})/2)*2"
    subs = f"ass={_filter_path(job.subtitles_file)}"

    if settings.layout == "blur":
        video = (
            "[0:v]setpts=PTS-STARTPTS,split=2[bgsrc][fgsrc];"
            "[bgsrc]scale=360:640:force_original_aspect_ratio=increase,crop=360:640,"
            "boxblur=14:2,scale=1080:1920,eq=brightness=-0.12:saturation=1.2[bg];"
            "[fgsrc]crop='min(iw,ih*4/3)':ih,"
            f"scale=w='{grow.format(base=FG_W)}':h=-2:eval=frame,"
            f"crop={FG_W}:{FG_H},setsar=1[fg];"
            f"[bg][fg]overlay=x=0:y={FG_Y}:eval=init,fps={fps},format=yuv420p,{subs}[v]"
        )
    else:
        video = (
            "[0:v]setpts=PTS-STARTPTS,crop='min(iw,ih*9/16)':ih,"
            f"scale=w='{grow.format(base=OUT_W)}':h=-2:eval=frame,"
            f"crop={OUT_W}:{OUT_H},setsar=1,fps={fps},format=yuv420p,{subs}[v]"
        )

    audio = None
    if job.has_audio:
        fade_out = max(duration - 0.3, 0.0)
        audio = (
            "[0:a:0]asetpts=PTS-STARTPTS,"
            f"afade=t=in:st=0:d=0.15,afade=t=out:st={fade_out:.3f}:d=0.3,"
            f"loudnorm=I={settings.target_lufs}:TP=-1.5:LRA=11,aresample=48000[a]"
        )
    return video, audio


def amf_available(tools: ToolSettings) -> bool:
    try:
        result = run_tool("ffmpeg", tools, ["-hide_banner", "-encoders"], timeout=10)
    except (ToolNotFoundError, ToolTimeoutError):
        return False
    return bool(re.search(r"\bh264_amf\b", result.stdout))


def _video_codec_args(encoder: str, fps: int) -> list[str]:
    if encoder == "h264_amf":
        return [
            "-c:v", "h264_amf", "-quality", "quality", "-rc", "cqp",
            "-qp_i", "19", "-qp_p", "21", "-qp_b", "23", "-g", str(fps * 2),
        ]  # fmt: skip
    return [
        "-c:v", "libx264", "-preset", "medium", "-crf", "19",
        "-profile:v", "high", "-g", str(fps * 2),
    ]  # fmt: skip


def render(
    job: RenderJob,
    settings: RenderSettings,
    tools: ToolSettings,
    on_progress: Callable[[float], None],
) -> str:
    """Renders ``job.output``. Returns the video encoder used."""
    duration = job.end - job.start
    if duration <= 0.5:
        raise RenderError("O corte é curto demais para renderizar.")
    if not job.source.is_absolute() or not job.output.is_absolute():
        raise RenderError("Caminho inválido para renderização.")
    video, audio = build_filters(job, settings)
    fps = output_fps(job.source_fps)
    graph = video if audio is None else f"{video};{audio}"

    encoders = ["h264_amf", "libx264"] if amf_available(tools) else ["libx264"]
    last_error: FfmpegFailedError | None = None
    for encoder in encoders:
        args = [
            "-ss", f"{job.start:.3f}", "-t", f"{duration:.3f}",
            "-i", str(job.source),
            "-filter_complex", graph,
            "-map", "[v]",
            *(["-map", "[a]", "-c:a", "aac", "-b:a", "192k", "-ar", "48000"] if audio else ["-an"]),
            *_video_codec_args(encoder, fps),
            "-pix_fmt", "yuv420p", "-r", str(fps),
            "-map_metadata", "-1", "-movflags", "+faststart",
            str(job.output),
        ]  # fmt: skip
        try:
            run_ffmpeg_with_progress(tools, args, duration, on_progress, output=job.output)
            log.info("clip_rendered", encoder=encoder, seconds=round(duration, 1))
            return encoder
        except FfmpegFailedError as exc:
            last_error = exc
            log.warning("render_failed", encoder=encoder, stderr=exc.stderr[-400:])
            continue  # GPU encoder unavailable at runtime: fall back to the CPU
        except ToolNotFoundError as exc:
            raise RenderError("FFmpeg não encontrado. Configure-o em Configurações.") from exc
    detail = (
        (last_error.stderr.strip().splitlines() or ["erro desconhecido"])[-1] if last_error else ""
    )
    raise RenderError(f"O FFmpeg não conseguiu renderizar o corte ({detail[:200]}).")
