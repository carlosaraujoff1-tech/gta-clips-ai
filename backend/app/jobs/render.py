"""Phase 5 job: renders a clip as a finished vertical video (9:16)."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from pydantic import ValidationError
from sqlalchemy import select

from app.core.logging import get_logger
from app.db.models import Clip, ClipStatus, TranscriptSegment
from app.jobs.runner import JobContext, JobFailedError
from app.schemas.settings import ClipEdit, RenderSettings
from app.services import jumpcuts
from app.services.audio import AudioExtractionError
from app.services.render import RenderError, RenderJob, make_thumbnail, render, slugify
from app.services.subtitles import CaptionStyle, build_ass, words_for_range
from app.services.tools import FfmpegFailedError, run_ffmpeg_with_progress

log = get_logger(__name__)


def _folder(raw: str | None, label: str) -> Path:
    if not raw or not Path(raw).is_dir():
        raise JobFailedError(f"A pasta de {label} não está disponível. Verifique em Configurações.")
    return Path(raw)


def effective_edit(clip_edit: dict[str, Any] | None, defaults: RenderSettings) -> dict[str, Any]:
    """Per-clip choices merged over the defaults."""
    try:
        edit = ClipEdit.model_validate(clip_edit or {})
    except ValidationError:
        edit = ClipEdit()
    return {
        "layout": edit.layout or defaults.layout,
        "focus_x": edit.focus_x,
        "zoom": defaults.zoom if edit.zoom is None else edit.zoom,
        "jump_cuts": defaults.jump_cuts if edit.jump_cuts is None else edit.jump_cuts,
        "subtitles": edit.subtitles,
    }


def render_inputs(start: float, end: float, title: str, edit: dict[str, Any]) -> dict[str, Any]:
    return {"start": round(start, 2), "end": round(end, 2), "title": title, "edit": edit}


def render_clip(ctx: JobContext) -> dict[str, Any]:
    clip_id = int(ctx.payload.get("clip_id", 0))
    processing = _folder(ctx.settings.storage.processing, "processamento")
    clips_folder = _folder(ctx.settings.storage.clips, "cortes")
    settings = ctx.settings.render

    with ctx.session() as session:
        clip = session.get(Clip, clip_id)
        if clip is None:
            raise JobFailedError("Corte não encontrado.")
        recording = clip.recording
        source = Path(recording.file_path)
        if not source.is_file():
            raise JobFailedError("Arquivo da gravação não encontrado. O HD está conectado?")
        segments: list[tuple[float, float, str, list[list[object]] | None]] = []
        audio_track = 0
        if recording.transcript is not None:
            audio_track = recording.transcript.audio_track
            rows = session.scalars(
                select(TranscriptSegment)
                .where(
                    TranscriptSegment.transcript_id == recording.transcript.id,
                    TranscriptSegment.end_seconds > clip.start_seconds,
                    TranscriptSegment.start_seconds < clip.end_seconds,
                )
                .order_by(TranscriptSegment.position)
            ).all()
            segments = [(r.start_seconds, r.end_seconds, r.text, r.words) for r in rows]
        start, end, title = clip.start_seconds, clip.end_seconds, clip.title
        edit = effective_edit(clip.edit, settings)
        has_audio = bool(recording.audio_tracks)
        fps = recording.fps
        width, height = recording.width, recording.height
        old_output = Path(clip.output_path) if clip.output_path else None
        previous_status = clip.status
        clip.status = ClipStatus.RENDERING
        clip.render_error = None
        session.commit()

    stem = f"{clip_id:05d}-{slugify(title)}"
    subs_file = processing / f"render-{clip_id}-{ctx.job_id}.ass"
    clip_audio = processing / f"render-{clip_id}-{ctx.job_id}.wav"
    output = clips_folder / f"{stem}.mp4"
    thumbnail = clips_folder / f"{stem}.jpg"
    try:
        words = words_for_range(segments, start, end)
        duration = end - start

        # ---- jump cuts: needs the clip's audio level every 100 ms
        keeps: list[tuple[float, float]] = []
        if edit["jump_cuts"] and has_audio and words:
            ctx.progress(0.0, "Procurando pausas para cortar…", force=True)
            try:
                extract_audio_range(source, clip_audio, audio_track, start, duration, ctx)
                keeps = jumpcuts.keep_intervals(
                    words, jumpcuts.loudness_frames(clip_audio), duration
                )
            except (AudioExtractionError, ValueError, OSError) as exc:
                log.warning("jump_cuts_skipped", error=str(exc))
            finally:
                clip_audio.unlink(missing_ok=True)
        if len(keeps) > 1:
            words = jumpcuts.remap_words(words, keeps)
        else:
            keeps = []

        job = RenderJob(
            source=source,
            start=start,
            end=end,
            source_fps=fps,
            has_audio=has_audio,
            subtitles_file=subs_file,
            output=output,
            layout=edit["layout"],
            focus_x=edit["focus_x"],
            zoom=edit["zoom"],
            facecam=settings.facecam,
            source_width=width,
            source_height=height,
            keeps=keeps,
        )
        subs_file.write_text(
            build_ass(
                words,
                job.final_duration,
                title=title if settings.show_title else None,
                caption=CaptionStyle(
                    font=settings.subtitle_font,
                    style=settings.subtitle_style,
                    highlight=settings.subtitle_highlight,
                    size=settings.subtitle_size,
                    position=settings.subtitle_position,
                    layout="vertical" if job.is_portrait else edit["layout"],
                    watermark=settings.watermark,
                    title_style=settings.title_style,
                    title_size=settings.title_size,
                ),
                show_subtitles=edit["subtitles"],
            ),
            encoding="utf-8",
        )

        def on_progress(fraction: float) -> None:
            ctx.check_cancelled()
            ctx.progress(
                0.05 + fraction * 0.9, f"Renderizando corte vertical ({round(fraction * 100)}%)"
            )

        ctx.progress(0.05, "Montando a edição (9:16, legendas, áudio)…", force=True)
        try:
            encoder = render(job, settings, ctx.settings.tools, on_progress)
        except RenderError as exc:
            raise JobFailedError(str(exc)) from exc
        has_thumb = make_thumbnail(output, thumbnail, ctx.settings.tools)

        info = {
            "encoder": encoder,
            "layout": "vertical" if job.is_portrait else edit["layout"],
            "duration": round(job.final_duration, 2),
            "removed_seconds": round(duration - job.final_duration, 2),
            "cuts": max(len(keeps) - 1, 0),
            "thumbnail": str(thumbnail) if has_thumb else None,
            # What the video was made from: lets the UI flag a clip edited after rendering.
            "inputs": render_inputs(start, end, title, edit),
        }
        with ctx.session() as session:
            clip = session.get(Clip, clip_id)
            if clip is None:
                output.unlink(missing_ok=True)
                thumbnail.unlink(missing_ok=True)
                raise JobFailedError("O corte foi removido durante a renderização.")
            if old_output and old_output != output:
                old_output.unlink(missing_ok=True)
                old_output.with_suffix(".jpg").unlink(missing_ok=True)
            clip.output_path = str(output)
            clip.rendered_at = datetime.now(UTC)
            clip.render_info = info
            clip.status = ClipStatus.PENDING_REVIEW  # nothing is published without approval
            session.commit()
    except BaseException as exc:
        with ctx.session() as session:
            clip = session.get(Clip, clip_id)
            if clip is not None:
                clip.status = previous_status
                if isinstance(exc, JobFailedError):
                    clip.render_error = str(exc)
                session.commit()
        raise
    finally:
        subs_file.unlink(missing_ok=True)

    summary = "Corte pronto para revisão"
    if info["cuts"]:
        summary += f" ({info['cuts']} pausas removidas, -{info['removed_seconds']:.1f}s)".replace(
            ".", ","
        )
    ctx.progress(1.0, summary + ".", force=True)
    return {"clip_id": clip_id, "output": str(output), "bytes": output.stat().st_size, **info}


def extract_audio_range(
    source: Path, destination: Path, track: int, start: float, duration: float, ctx: JobContext
) -> None:
    """16 kHz mono WAV of just the clip's time range (fast: input seeking)."""
    args = [
        "-ss", f"{start:.3f}", "-t", f"{duration:.3f}",
        "-i", str(source),
        "-map", f"0:a:{int(track)}", "-vn", "-ac", "1", "-ar", "16000",
        "-c:a", "pcm_s16le", "-f", "wav",
        str(destination),
    ]  # fmt: skip
    try:
        run_ffmpeg_with_progress(
            ctx.settings.tools, args, duration, lambda _f: ctx.check_cancelled(), output=destination
        )
    except FfmpegFailedError as exc:
        raise AudioExtractionError("Não foi possível ler o áudio do corte.") from exc
