"""Renders a vertical 9:16 clip (1080x1920) ready for TikTok / Shorts / Reels.

Edit applied with ffmpeg (one filter graph, one encode):
- jump cuts (optional): the clip is assembled from the kept intervals; when zoom is on,
  every other piece gets a 8 % punch-in, the classic way to hide a cut;
- layouts:
    ``blur``    gameplay (4:3 window) centred over a blurred, darkened copy of itself;
    ``crop``    9:16 crop of the gameplay filling the screen;
    ``facecam`` the streamer's webcam on top (1080x640), gameplay below (1080x1280),
                separated by a thin accent line;
  ``focus_x`` moves the gameplay crop horizontally (0 = left, 1 = right);
- slow push-in zoom (6 %) when there are no jump cuts;
- title, word-synced subtitles and watermark via an ASS file (libass);
- audio: optional voice boost (high-pass + compressor), fades, loudness normalised
  to the platform level (-14 LUFS by default);
- H.264 via the AMD GPU encoder (AMF) when available, libx264 otherwise (automatic
  fallback if the GPU encode fails), ``+faststart`` for instant playback.
"""

from __future__ import annotations

import functools
import re
import unicodedata
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from pathlib import Path

from app.core.logging import get_logger
from app.schemas.settings import Region, RenderSettings, ToolSettings, VerticalLayout
from app.services.tools import (
    FfmpegFailedError,
    ToolNotFoundError,
    ToolTimeoutError,
    resolve_tool,
    run_ffmpeg_with_progress,
    run_tool,
)

log = get_logger(__name__)

OUT_W, OUT_H = 1080, 1920
FG_W, FG_H, FG_Y = 1080, 810, 520  # 4:3 gameplay window in the blur layout
CAM_H = 640  # webcam band in the facecam layout (gameplay gets the remaining 1280 px)
ZOOM_AMOUNT = 0.06
PUNCH_IN = 1.08
ACCENT = "0x8B5CF6"
AUDIO_ARGS = ["-map", "[a]", "-c:a", "aac", "-b:a", "192k", "-ar", "48000"]


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
    layout: VerticalLayout = "blur"
    focus_x: float = 0.5
    zoom: bool = True
    facecam: Region | None = None
    source_width: int | None = None
    source_height: int | None = None
    # Parts of the clip to keep (clip time). Empty = the whole clip.
    keeps: Sequence[tuple[float, float]] = field(default_factory=tuple)

    @property
    def is_portrait(self) -> bool:
        """Source already vertical (phone recording, vertical stream, edited clip)."""
        if not self.source_width or not self.source_height:
            return False
        return self.source_height > self.source_width * 1.2

    @property
    def duration(self) -> float:
        return self.end - self.start

    @property
    def final_duration(self) -> float:
        return sum(b - a for a, b in self.keeps) if self.keeps else self.duration


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


def _grow(base: int, zoom: float, duration: float) -> str:
    """Size expression for a linear push-in (even sizes keep encoders happy)."""
    return f"trunc({base}*(1+{zoom}*t/{duration:.3f})/2)*2"


def _fill(w: int, h: int, fx: str, zoom: float, duration: float) -> str:
    """Scale to *cover* w x h (never short of pixels, whatever the source size or
    rounding), then crop it, positioned horizontally by ``fx`` (0 = left, 1 = right)."""
    return (
        f"scale=w='{_grow(w, zoom, duration)}':h='{_grow(h, zoom, duration)}':"
        "force_original_aspect_ratio=increase:eval=frame,"
        f"crop={w}:{h}:'(iw-ow)*{fx}':'(ih-oh)/2',setsar=1"
    )


def _layout(job: RenderJob, src: str, zoom: float, duration: float) -> str:
    """Filters turning ``src`` (any size) into a 1080x1920 frame labelled [lay]."""
    fx = f"{min(max(job.focus_x, 0.0), 1.0):.3f}"
    if job.is_portrait:
        # Already vertical: keep the whole picture (fill 9:16, blurred bars only if needed).
        return (
            f"[{src}]split=2[bgsrc][fgsrc];"
            "[bgsrc]scale=360:640:force_original_aspect_ratio=increase,crop=360:640,"
            "boxblur=14:2,scale=1080:1920,eq=brightness=-0.12[bg];"
            f"[fgsrc]scale=w='{_grow(OUT_W, zoom, duration)}':h='{_grow(OUT_H, zoom, duration)}':"
            "force_original_aspect_ratio=decrease:eval=frame,"
            f"crop='min(iw,{OUT_W})':'min(ih,{OUT_H})',setsar=1[fg];"
            "[bg][fg]overlay=x=(W-w)/2:y=(H-h)/2[lay]"
        )
    if job.layout == "blur":
        return (
            f"[{src}]split=2[bgsrc][fgsrc];"
            "[bgsrc]scale=360:640:force_original_aspect_ratio=increase,crop=360:640,"
            "boxblur=14:2,scale=1080:1920,eq=brightness=-0.12:saturation=1.2[bg];"
            f"[fgsrc]{_fill(FG_W, FG_H, fx, zoom, duration)}[fg];"
            f"[bg][fg]overlay=x=0:y={FG_Y}:eval=init[lay]"
        )
    if job.layout == "crop":
        return f"[{src}]{_fill(OUT_W, OUT_H, fx, zoom, duration)}[lay]"
    # facecam
    if job.facecam is None:
        raise RenderError(
            "Para o layout com câmera, marque onde fica a sua câmera em Configurações."
        )
    r = job.facecam
    game_h = OUT_H - CAM_H
    return (
        f"[{src}]split=2[camsrc][gamesrc];"
        f"[camsrc]crop=iw*{r.w:.4f}:ih*{r.h:.4f}:iw*{r.x:.4f}:ih*{r.y:.4f},"
        f"{_fill(OUT_W, CAM_H, '0.5', 0.0, duration)}[cam];"
        f"[gamesrc]{_fill(OUT_W, game_h, fx, zoom, duration)}[game];"
        f"[cam][game]vstack=inputs=2,"
        f"drawbox=x=0:y={CAM_H - 4}:w=iw:h=8:color={ACCENT}@1:t=fill[lay]"
    )


def build_graph(job: RenderJob, settings: RenderSettings) -> tuple[str, bool]:
    """Full filter graph producing [v] (and [a] when the clip has audio)."""
    fps = output_fps(job.source_fps)
    subs = f"ass={_filter_path(job.subtitles_file)}"
    duration = job.final_duration
    pieces = list(job.keeps) if len(job.keeps) > 1 else []
    parts: list[str] = []

    # Common size for the jump-cut pieces (concat needs identical sizes).
    pw, ph = (job.source_width or 1920), (job.source_height or 1080)
    pw, ph = pw - pw % 2, ph - ph % 2
    if pieces:
        n = len(pieces)
        parts.append(f"[0:v]fps={fps},split={n}" + "".join(f"[vs{i}]" for i in range(n)))
        if job.has_audio:
            parts.append(f"[0:a:0]asplit={n}" + "".join(f"[as{i}]" for i in range(n)))
        concat_inputs = ""
        for i, (a, b) in enumerate(pieces):
            punch = (
                f",crop=trunc(iw/{PUNCH_IN}/2)*2:trunc(ih/{PUNCH_IN}/2)*2,scale=iw*{PUNCH_IN}:-2"
                if job.zoom and i % 2 == 1
                else ""
            )
            # Every piece is scaled to the same size so concat accepts them.
            parts.append(
                f"[vs{i}]trim=start={a:.3f}:end={b:.3f},setpts=PTS-STARTPTS{punch},"
                f"scale={pw}:{ph}:force_original_aspect_ratio=decrease,"
                f"pad={pw}:{ph}:(ow-iw)/2:(oh-ih)/2,setsar=1[vp{i}]"
            )
            concat_inputs += f"[vp{i}]"
            if job.has_audio:
                fade_out = max(b - a - 0.015, 0.0)
                parts.append(
                    f"[as{i}]atrim=start={a:.3f}:end={b:.3f},asetpts=PTS-STARTPTS,"
                    f"afade=t=in:d=0.012,afade=t=out:st={fade_out:.3f}:d=0.015[ap{i}]"
                )
                concat_inputs += f"[ap{i}]"
        parts.append(
            f"{concat_inputs}concat=n={n}:v=1:a={1 if job.has_audio else 0}"
            + ("[vcat][acat]" if job.has_audio else "[vcat]")
        )
        video_src, audio_src = "vcat", "acat"
        slow_zoom = 0.0  # punch-ins replace the slow push-in
    else:
        parts.append("[0:v]setpts=PTS-STARTPTS[vin]")
        video_src, audio_src = "vin", "0:a:0"
        slow_zoom = ZOOM_AMOUNT if job.zoom else 0.0

    parts.append(_layout(job, video_src, slow_zoom, duration))
    parts.append(f"[lay]fps={fps},format=yuv420p,{subs}[v]")

    if job.has_audio:
        voice = (
            "highpass=f=80,acompressor=threshold=0.125:ratio=3:attack=10:release=150:makeup=1.6,"
            if settings.voice_boost
            else ""
        )
        fade_out = max(duration - 0.3, 0.0)
        parts.append(
            f"[{audio_src}]asetpts=PTS-STARTPTS,{voice}"
            f"afade=t=in:st=0:d=0.15,afade=t=out:st={fade_out:.3f}:d=0.3,"
            f"loudnorm=I={settings.target_lufs}:TP=-1.5:LRA=11,aresample=48000[a]"
        )
    return ";".join(parts), job.has_audio


@functools.lru_cache(maxsize=4)
def _amf_available(ffmpeg_path: str) -> bool:
    try:
        result = run_tool(
            "ffmpeg", ToolSettings(ffmpeg_path=ffmpeg_path), ["-hide_banner", "-encoders"], 10
        )
    except (ToolNotFoundError, ToolTimeoutError):
        return False
    return bool(re.search(r"\bh264_amf\b", result.stdout))


def amf_available(tools: ToolSettings) -> bool:
    path = resolve_tool("ffmpeg", tools)
    return _amf_available(path) if path else False


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
    if job.duration <= 0.5 or job.final_duration <= 0.5:
        raise RenderError("O corte é curto demais para renderizar.")
    if not job.source.is_absolute() or not job.output.is_absolute():
        raise RenderError("Caminho inválido para renderização.")
    graph, has_audio = build_graph(job, settings)
    fps = output_fps(job.source_fps)

    encoders = ["h264_amf", "libx264"] if amf_available(tools) else ["libx264"]
    last_error: FfmpegFailedError | None = None
    for encoder in encoders:
        args = [
            "-ss", f"{job.start:.3f}", "-t", f"{job.duration:.3f}",
            "-i", str(job.source),
            "-filter_complex", graph,
            "-map", "[v]",
            *(AUDIO_ARGS if has_audio else ["-an"]),
            *_video_codec_args(encoder, fps),
            "-pix_fmt", "yuv420p", "-r", str(fps),
            "-map_metadata", "-1", "-movflags", "+faststart",
            str(job.output),
        ]  # fmt: skip
        try:
            run_ffmpeg_with_progress(
                tools, args, job.final_duration, on_progress, output=job.output
            )
            log.info("clip_rendered", encoder=encoder, seconds=round(job.final_duration, 1))
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


def make_thumbnail(video: Path, thumbnail: Path, tools: ToolSettings) -> bool:
    """Poster image (JPEG) for the clip card. Failure is not fatal."""
    try:
        result = run_tool(
            "ffmpeg",
            tools,
            ["-v", "error", "-y", "-ss", "1", "-i", str(video), "-frames:v", "1",
             "-vf", "scale=540:-2", "-q:v", "3", str(thumbnail)],
            timeout=30,
        )  # fmt: skip
    except (ToolNotFoundError, ToolTimeoutError):
        return False
    return result.returncode == 0 and thumbnail.is_file()
