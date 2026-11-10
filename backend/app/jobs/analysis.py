"""Phase 4 jobs (highlight analysis, LLM model pull) and the Phase 5 preview render job."""

from __future__ import annotations

import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import select

from app.core.logging import get_logger
from app.db.models import (
    Clip,
    ClipStatus,
    Recording,
    RecordingStatus,
    TranscriptSegment,
)
from app.jobs.runner import JobContext, JobFailedError
from app.services import highlights, ollama
from app.services.audio import AudioExtractionError, extract_audio
from app.services.render import RenderError, RenderJob, render, slugify
from app.services.subtitles import build_ass, words_for_range

log = get_logger(__name__)

TEMP_PREFIX = "analysis-"


def _require_folder(raw: str | None, label: str) -> Path:
    if not raw or not Path(raw).is_dir():
        raise JobFailedError(f"A pasta de {label} não está disponível. Verifique em Configurações.")
    return Path(raw)


# ------------------------------------------------------------------ pull


def pull_llm_model(ctx: JobContext) -> dict[str, Any]:
    base, model = ctx.settings.ai.ollama_base_url, str(ctx.payload.get("model", ""))
    if not model:
        raise JobFailedError("Modelo não informado.")
    ctx.progress(0.0, f"Iniciando download de {model} pelo Ollama…", force=True)

    def on_progress(status: str, done: int, total: int) -> None:
        ctx.check_cancelled()
        if total:
            ctx.progress(
                min(0.99, done / total),
                f"Baixando {model}: {done / 1e9:.2f} de {total / 1e9:.2f} GB".replace(".", ","),
            )
        else:
            ctx.progress(0.0, f"{model}: {status}")

    try:
        ollama.pull_model(base, model, on_progress)
    except ollama.OllamaError as exc:
        raise JobFailedError(str(exc)) from exc
    ctx.progress(1.0, f"Modelo {model} pronto.", force=True)
    return {"model": model}


# -------------------------------------------------------------- analysis


def analyze_recording(ctx: JobContext) -> dict[str, Any]:
    recording_id = int(ctx.payload.get("recording_id", 0))
    mode = str(ctx.payload.get("mode", "ai"))
    ai = ctx.settings.ai
    processing = _require_folder(ctx.settings.storage.processing, "processamento")

    if mode == "ai":
        try:
            if not ollama.has_model(ai.ollama_base_url, ai.ollama_model):
                raise JobFailedError(
                    f"O modelo '{ai.ollama_model}' não está instalado no Ollama. "
                    "Baixe-o em Configurações ou use a análise rápida (sem IA)."
                )
        except ollama.OllamaError as exc:
            raise JobFailedError(f"{exc} Ou use a análise rápida (sem IA).") from exc

    with ctx.session() as session:
        recording = session.get(Recording, recording_id)
        if recording is None:
            raise JobFailedError("Gravação não encontrada.")
        transcript = recording.transcript
        if transcript is None:
            raise JobFailedError("Transcreva a gravação antes de analisar.")
        rows = session.scalars(
            select(TranscriptSegment)
            .where(TranscriptSegment.transcript_id == transcript.id)
            .order_by(TranscriptSegment.position)
        ).all()
        segs = [highlights.Seg(r.position, r.start_seconds, r.end_seconds, r.text) for r in rows]
        if len(segs) < 2:
            raise JobFailedError("A transcrição tem fala de menos para encontrar momentos.")
        source = Path(recording.file_path)
        duration = recording.duration_seconds or segs[-1].end
        audio_track = transcript.audio_track
        has_audio = bool(recording.audio_tracks)
        title = recording.title
        previous_status = recording.status
        recording.status = RecordingStatus.ANALYZING
        session.commit()

    temp_audio = processing / f"{TEMP_PREFIX}{recording_id}-{ctx.job_id}.wav"
    started = time.monotonic()
    try:
        # ---- 1. audio loudness (optional signal: skipped if the file is unavailable)
        loudness: list[float] | None = None
        if has_audio and source.is_file():
            ctx.progress(0.0, f"Medindo a energia do áudio de {title}…", force=True)

            def on_extract(fraction: float) -> None:
                ctx.check_cancelled()
                ctx.progress(
                    fraction * 0.1, f"Medindo a energia do áudio ({round(fraction * 100)}%)"
                )

            try:
                extract_audio(
                    source, temp_audio, audio_track, ctx.settings.tools, duration, on_extract
                )
                loudness = highlights.loudness_per_second(temp_audio)
            except (AudioExtractionError, ValueError, OSError) as exc:
                log.warning("loudness_unavailable", error=str(exc))
            finally:
                temp_audio.unlink(missing_ok=True)

        signals = highlights.segment_signals(segs, loudness)
        min_s, max_s = ai.clip_min_seconds, ai.clip_max_seconds

        # ---- 2. candidates
        if mode == "ai":

            def ask(system: str, user: str, schema: dict[str, Any]) -> dict[str, Any]:
                ctx.check_cancelled()
                try:
                    return ollama.chat_json(
                        ai.ollama_base_url, ai.ollama_model, system, user, schema
                    )
                except ollama.OllamaError as exc:
                    raise JobFailedError(str(exc)) from exc

            def on_chunk(done: int, total: int) -> None:
                ctx.progress(
                    0.12 + 0.83 * done / max(total, 1),
                    f"IA analisando a live: parte {min(done + 1, total)} de {total}",
                    force=True,
                )

            candidates = highlights.ai_candidates(segs, signals, ask, min_s, max_s, on_chunk)
        else:
            ctx.progress(0.5, "Procurando picos de emoção…", force=True)
            candidates = highlights.heuristic_candidates(segs, signals, min_s, max_s)

        ctx.check_cancelled()

        # ---- 3. store (replaces previous *suggestions*; reviewed clips are kept)
        with ctx.session() as session:
            recording = session.get(Recording, recording_id)
            if recording is None:
                raise JobFailedError("A gravação foi removida durante a análise.")
            existing = session.scalars(select(Clip).where(Clip.recording_id == recording_id)).all()
            keep = [c for c in existing if c.status != ClipStatus.DRAFT]
            for clip in existing:
                if clip.status == ClipStatus.DRAFT:
                    session.delete(clip)
            chosen = highlights.finalize(
                candidates,
                signals,
                duration,
                ai.min_clip_score,
                ai.max_clips_per_recording,
                keep_out=[(c.start_seconds, c.end_seconds) for c in keep],
                segs=segs,
            )
            for c in chosen:
                session.add(
                    Clip(
                        recording_id=recording_id,
                        title=c.title,
                        description=None,
                        start_seconds=round(c.start, 2),
                        end_seconds=round(c.end, 2),
                        category=c.category,
                        score=c.score,
                        reason=c.reason,
                        hook=c.hook or None,
                        score_details=c.details,
                        source=c.source,
                        status=ClipStatus.DRAFT,
                    )
                )
            recording.status = RecordingStatus.ANALYZED
            recording.error_message = None
            session.commit()
    except JobFailedError as exc:
        with ctx.session() as session:
            rec = session.get(Recording, recording_id)
            if rec is not None:
                rec.status = previous_status
                rec.error_message = f"Análise: {exc}"
                session.commit()
        raise
    except BaseException:
        with ctx.session() as session:
            rec = session.get(Recording, recording_id)
            if rec is not None:
                rec.status = previous_status
                session.commit()
        raise

    seconds = round(time.monotonic() - started, 1)
    found = len(chosen)
    ctx.progress(
        1.0,
        f"Concluída: {found} momento(s) encontrado(s)"
        + (" (análise rápida, sem IA)" if mode != "ai" else "")
        + ".",
        force=True,
    )
    return {
        "recording_id": recording_id,
        "mode": mode,
        "candidates": len(candidates),
        "clips": found,
        "seconds": seconds,
    }


# ---------------------------------------------------------------- render


def render_clip(ctx: JobContext) -> dict[str, Any]:
    clip_id = int(ctx.payload.get("clip_id", 0))
    processing = _require_folder(ctx.settings.storage.processing, "processamento")
    clips_folder = _require_folder(ctx.settings.storage.clips, "cortes")

    with ctx.session() as session:
        clip = session.get(Clip, clip_id)
        if clip is None:
            raise JobFailedError("Corte não encontrado.")
        recording = clip.recording
        source = Path(recording.file_path)
        if not source.is_file():
            raise JobFailedError("Arquivo da gravação não encontrado. O HD está conectado?")
        segments: list[tuple[float, float, str, list[list[object]] | None]] = []
        if recording.transcript is not None:
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
        start, end = clip.start_seconds, clip.end_seconds
        title = clip.title
        old_output = Path(clip.output_path) if clip.output_path else None
        job = RenderJob(
            source=source,
            start=start,
            end=end,
            source_fps=recording.fps,
            has_audio=bool(recording.audio_tracks),
            subtitles_file=processing / f"render-{clip_id}-{ctx.job_id}.ass",
            output=clips_folder / f"{clip_id:05d}-{slugify(title)}.mp4",
        )
        previous_status = clip.status
        clip.status = ClipStatus.RENDERING
        clip.render_error = None
        session.commit()

    settings = ctx.settings.render
    try:
        words = words_for_range(segments, start, end)
        job.subtitles_file.write_text(
            build_ass(
                words,
                end - start,
                font=settings.subtitle_font,
                style=settings.subtitle_style,
                title=title if settings.show_title else None,
            ),
            encoding="utf-8",
        )

        def on_progress(fraction: float) -> None:
            ctx.check_cancelled()
            ctx.progress(fraction * 0.98, f"Renderizando corte vertical ({round(fraction * 100)}%)")

        ctx.progress(0.0, "Preparando edição (9:16, legendas, áudio)…", force=True)
        try:
            encoder = render(job, settings, ctx.settings.tools, on_progress)
        except RenderError as exc:
            raise JobFailedError(str(exc)) from exc

        with ctx.session() as session:
            clip = session.get(Clip, clip_id)
            if clip is None:
                job.output.unlink(missing_ok=True)
                raise JobFailedError("O corte foi removido durante a renderização.")
            if old_output and old_output != job.output:
                old_output.unlink(missing_ok=True)
            clip.output_path = str(job.output)
            clip.rendered_at = datetime.now(UTC)
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
        job.subtitles_file.unlink(missing_ok=True)

    size = job.output.stat().st_size
    ctx.progress(1.0, "Corte pronto para revisão.", force=True)
    return {"clip_id": clip_id, "output": str(job.output), "bytes": size, "encoder": encoder}
