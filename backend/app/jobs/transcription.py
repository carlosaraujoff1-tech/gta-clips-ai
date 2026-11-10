"""Phase 3 job handlers: model download and recording transcription."""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.logging import get_logger
from app.db.models import (
    Clip,
    ClipStatus,
    Recording,
    RecordingStatus,
    Transcript,
    TranscriptSegment,
)
from app.jobs.runner import JobContext, JobFailedError
from app.schemas.settings import WhisperModel
from app.services import whisper
from app.services.audio import AudioExtractionError, extract_audio

log = get_logger(__name__)

TEMP_AUDIO_PREFIX = "transcribe-"
EXTRACTION_SHARE = 0.08  # progress share of the audio-extraction step


def _fmt_clock(seconds: float) -> str:
    seconds = max(0, int(seconds))
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def _fmt_eta(seconds: float) -> str:
    if seconds < 60:
        return "menos de 1 min"
    if seconds < 3600:
        return f"~{round(seconds / 60)} min"
    return f"~{seconds / 3600:.1f} h".replace(".", ",")


# --------------------------------------------------------------- download


def make_download_model(models_root: Path) -> Any:
    def download_model(ctx: JobContext) -> dict[str, Any]:
        name = ctx.payload.get("model")
        if name not in whisper.MODELS:
            raise JobFailedError("Modelo desconhecido.")
        model: WhisperModel = name
        if whisper.is_downloaded(models_root, model):
            return {"model": model, "already_downloaded": True}

        def on_progress(done: int, expected: int) -> None:
            mb_done, mb_total = done / 1e6, expected / 1e6
            ctx.progress(
                min(0.99, done / expected) if expected else 0.0,
                f"Baixando modelo {model}: {mb_done:,.0f} de ~{mb_total:,.0f} MB".replace(",", "."),
            )

        ctx.progress(0.0, f"Iniciando download do modelo {model}…", force=True)
        try:
            path = whisper.download_model(models_root, model, on_progress)
        except whisper.WhisperError as exc:
            raise JobFailedError(str(exc)) from exc
        ctx.progress(1.0, f"Modelo {model} pronto para uso offline.", force=True)
        return {"model": model, "bytes": whisper.folder_size(path)}

    return download_model


# ----------------------------------------------------------- transcription


def _restore_status(session: Session, recording_id: int, error: str | None) -> None:
    recording = session.get(Recording, recording_id)
    if recording is None:
        return
    recording.status = (
        RecordingStatus.TRANSCRIBED
        if recording.transcript is not None
        else RecordingStatus.IMPORTED
    )
    if error is not None:
        recording.error_message = error
    session.commit()


def make_transcribe_recording(models_root: Path) -> Any:
    def transcribe_recording(ctx: JobContext) -> dict[str, Any]:
        recording_id = int(ctx.payload.get("recording_id", 0))
        audio_track = int(ctx.payload.get("audio_track", 0))
        ai = ctx.settings.ai

        # ---- preconditions (fail fast with clear messages)
        if not whisper.is_installed():
            raise JobFailedError("O Faster-Whisper não está instalado no backend.")
        if not whisper.is_downloaded(models_root, ai.whisper_model):
            raise JobFailedError(
                f"O modelo '{ai.whisper_model}' ainda não foi baixado. Baixe-o em Configurações."
            )
        processing_raw = ctx.settings.storage.processing
        if not processing_raw or not Path(processing_raw).is_dir():
            raise JobFailedError(
                "A pasta de processamento não está disponível. Verifique em Configurações."
            )

        with ctx.session() as session:
            recording = session.get(Recording, recording_id)
            if recording is None:
                raise JobFailedError("Gravação não encontrada.")
            source = Path(recording.file_path)
            if not source.is_file():
                raise JobFailedError("Arquivo da gravação não encontrado. O HD está conectado?")
            if recording.audio_tracks == 0:
                raise JobFailedError("Esta gravação não tem áudio.")
            duration = recording.duration_seconds
            title = recording.title
            recording.status = RecordingStatus.TRANSCRIBING
            session.commit()

        temp_audio = Path(processing_raw) / f"{TEMP_AUDIO_PREFIX}{recording_id}-{ctx.job_id}.wav"
        started = time.monotonic()
        try:
            # ---- 1. extract the chosen audio track
            ctx.progress(0.0, f"Extraindo áudio de {title}…", force=True)

            def on_extract(fraction: float) -> None:
                ctx.check_cancelled()
                ctx.progress(
                    fraction * EXTRACTION_SHARE, f"Extraindo áudio ({round(fraction * 100)}%)"
                )

            try:
                extract_audio(
                    source, temp_audio, audio_track, ctx.settings.tools, duration, on_extract
                )
            except AudioExtractionError as exc:
                raise JobFailedError(str(exc)) from exc

            # ---- 2. transcribe
            ctx.progress(EXTRACTION_SHARE, f"Carregando modelo {ai.whisper_model}…", force=True)
            try:
                info, segments_iter = whisper.transcribe(temp_audio, models_root, ai)
            except whisper.WhisperError as exc:
                raise JobFailedError(str(exc)) from exc

            total = info.duration or duration or 0.0
            transcribe_started = time.monotonic()
            segments: list[whisper.SegmentData] = []
            for seg in segments_iter:
                ctx.check_cancelled()
                segments.append(seg)
                if total:
                    done = min(1.0, seg.end / total)
                    elapsed = time.monotonic() - transcribe_started
                    eta = elapsed / done * (1 - done) if done > 0.02 else None
                    msg = f"Transcrevendo {_fmt_clock(seg.end)} de {_fmt_clock(total)}"
                    if eta is not None:
                        msg += f" · restante {_fmt_eta(eta)}"
                    ctx.progress(EXTRACTION_SHARE + done * (1 - EXTRACTION_SHARE), msg)
            ctx.check_cancelled()

            # ---- 3. store (replaces any previous transcript atomically)
            processing_seconds = round(time.monotonic() - started, 1)
            word_count = sum(len(s.text.split()) for s in segments)
            with ctx.session() as session:
                recording = session.get(Recording, recording_id)
                if recording is None:
                    raise JobFailedError("A gravação foi removida durante a transcrição.")
                if recording.transcript is not None:
                    session.delete(recording.transcript)
                    session.flush()
                transcript = Transcript(
                    recording_id=recording_id,
                    model=ai.whisper_model,
                    language=info.language,
                    language_probability=info.language_probability,
                    audio_track=audio_track,
                    audio_duration_seconds=total or None,
                    processing_seconds=processing_seconds,
                    segment_count=len(segments),
                    word_count=word_count,
                )
                session.add(transcript)
                session.flush()
                session.add_all(
                    TranscriptSegment(
                        transcript_id=transcript.id,
                        position=i,
                        start_seconds=s.start,
                        end_seconds=s.end,
                        text=s.text,
                        avg_logprob=s.avg_logprob,
                        no_speech_prob=s.no_speech_prob,
                        words=s.words or None,
                    )
                    for i, s in enumerate(segments)
                )
                recording.status = RecordingStatus.TRANSCRIBED
                recording.error_message = None
                session.commit()
        except JobFailedError as exc:
            with ctx.session() as session:
                _restore_status(session, recording_id, f"Transcrição: {exc}")
            raise
        except BaseException:
            with ctx.session() as session:
                _restore_status(session, recording_id, None)
            raise
        finally:
            temp_audio.unlink(missing_ok=True)

        speed = (total / processing_seconds) if processing_seconds and total else None
        summary = f"Concluída: {len(segments)} trechos, {word_count} palavras"
        if speed:
            summary += f" · {speed:.1f}x tempo real".replace(".", ",")
        ctx.progress(1.0, summary + ".", force=True)
        log.info(
            "transcription_done",
            recording_id=recording_id,
            segments=len(segments),
            seconds=processing_seconds,
            realtime_factor=round(speed, 2) if speed else None,
        )
        return {
            "recording_id": recording_id,
            "segments": len(segments),
            "words": word_count,
            "language": info.language,
            "processing_seconds": processing_seconds,
            "realtime_factor": round(speed, 2) if speed else None,
        }

    return transcribe_recording


# ------------------------------------------------------------- recovery


def recover_after_restart(session: Session, processing_folder: str | None) -> None:
    """Resets work left half-done by a shutdown and removes stale temporary files."""
    stuck = session.scalars(
        select(Recording).where(
            Recording.status.in_((RecordingStatus.TRANSCRIBING, RecordingStatus.ANALYZING))
        )
    ).all()
    for recording in stuck:
        recording.status = (
            RecordingStatus.TRANSCRIBED
            if recording.transcript is not None
            else RecordingStatus.IMPORTED
        )
    rendering = session.scalars(select(Clip).where(Clip.status == ClipStatus.RENDERING)).all()
    for clip in rendering:
        clip.status = ClipStatus.PENDING_REVIEW if clip.output_path else ClipStatus.DRAFT
    session.commit()
    if stuck or rendering:
        log.warning("status_recovered", recordings=len(stuck), clips=len(rendering))
    if processing_folder and Path(processing_folder).is_dir():
        folder = Path(processing_folder)
        for pattern in (
            f"{TEMP_AUDIO_PREFIX}*.wav",
            "analysis-*.wav",
            "render-*.ass",
            "render-*.wav",
        ):
            for temp in folder.glob(pattern):
                temp.unlink(missing_ok=True)
