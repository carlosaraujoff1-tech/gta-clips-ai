"""Phase 3: Whisper models and transcription endpoints."""

from __future__ import annotations

import re
from enum import StrEnum
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, Request, status
from fastapi.responses import PlainTextResponse
from sqlalchemy import select

from app.api.deps import DbSession
from app.core.errors import AppError
from app.db.models import JobType, Recording, RecordingStatus, Transcript, TranscriptSegment
from app.schemas.jobs import JobOut
from app.schemas.settings import WhisperModel
from app.schemas.transcription import (
    BulkTranscribeResult,
    SegmentOut,
    TranscribeRequest,
    TranscriptionStatus,
    TranscriptOut,
    WhisperModelInfo,
)
from app.services import jobs as job_service
from app.services import whisper
from app.services.user_settings import load_user_settings

router = APIRouter(tags=["transcription"])


def _models_root(request: Request) -> Path:
    root: Path = request.app.state.config.models_dir
    return root


def _get_recording(db: DbSession, recording_id: int) -> Recording:
    recording = db.get(Recording, recording_id)
    if recording is None:
        raise AppError("recording_not_found", "Gravação não encontrada.", status.HTTP_404_NOT_FOUND)
    return recording


def _active_transcription_ids(db: DbSession) -> set[int]:
    return {
        int(j.payload["recording_id"])
        for j in job_service.active_jobs(db, JobType.TRANSCRIBE_RECORDING)
        if "recording_id" in j.payload
    }


def _ensure_ready_to_transcribe(db: DbSession, request: Request) -> None:
    ai = load_user_settings(db).ai
    if not whisper.is_installed():
        raise AppError(
            "engine_missing", "O Faster-Whisper não está instalado.", status.HTTP_409_CONFLICT
        )
    if not whisper.is_downloaded(_models_root(request), ai.whisper_model):
        raise AppError(
            "model_missing",
            f"O modelo '{ai.whisper_model}' ainda não foi baixado. Baixe-o em Configurações.",
            status.HTTP_409_CONFLICT,
        )


# ------------------------------------------------------------------ models


@router.get("/transcription/status", response_model=TranscriptionStatus)
def transcription_status(db: DbSession, request: Request) -> TranscriptionStatus:
    ai = load_user_settings(db).ai
    root = _models_root(request)
    models = []
    for name, spec in whisper.MODELS.items():
        downloaded = whisper.is_downloaded(root, name)
        models.append(
            WhisperModelInfo(
                name=name,
                downloaded=downloaded,
                size_on_disk_bytes=(
                    whisper.folder_size(whisper.model_dir(root, name)) if downloaded else None
                ),
                approx_download_bytes=spec.approx_bytes,
                note=spec.note,
                selected=name == ai.whisper_model,
            )
        )
    return TranscriptionStatus(
        engine_installed=whisper.is_installed(),
        models_dir=str(root / "whisper"),
        cpu_threads=ai.whisper_cpu_threads or whisper.default_cpu_threads(),
        models=models,
    )


@router.post(
    "/transcription/models/{name}/download",
    response_model=JobOut,
    status_code=status.HTTP_202_ACCEPTED,
)
def download_model(name: WhisperModel, db: DbSession, request: Request) -> JobOut:
    if whisper.is_downloaded(_models_root(request), name):
        raise AppError(
            "already_downloaded", "Este modelo já foi baixado.", status.HTTP_409_CONFLICT
        )
    if job_service.active_jobs(db, JobType.DOWNLOAD_MODEL):
        raise AppError(
            "job_already_active", "Já existe um download em andamento.", status.HTTP_409_CONFLICT
        )
    job = job_service.enqueue(db, JobType.DOWNLOAD_MODEL, {"model": name})
    request.app.state.job_runner.notify()
    return JobOut.model_validate(job)


# ------------------------------------------------------------ transcription


@router.post(
    "/recordings/{recording_id}/transcribe",
    response_model=JobOut,
    status_code=status.HTTP_202_ACCEPTED,
)
def transcribe_recording(
    recording_id: int, payload: TranscribeRequest, db: DbSession, request: Request
) -> JobOut:
    recording = _get_recording(db, recording_id)
    _ensure_ready_to_transcribe(db, request)
    if recording.audio_tracks == 0:
        raise AppError("no_audio", "Esta gravação não tem áudio.", status.HTTP_409_CONFLICT)
    if recording.audio_tracks is not None and payload.audio_track >= recording.audio_tracks:
        raise AppError(
            "invalid_audio_track",
            f"Esta gravação tem {recording.audio_tracks} faixa(s) de áudio.",
            status.HTTP_422_UNPROCESSABLE_CONTENT,
        )
    if recording_id in _active_transcription_ids(db):
        raise AppError(
            "job_already_active",
            "Esta gravação já está na fila de transcrição.",
            status.HTTP_409_CONFLICT,
        )
    job = job_service.enqueue(
        db,
        JobType.TRANSCRIBE_RECORDING,
        {
            "recording_id": recording_id,
            "audio_track": payload.audio_track,
            "title": recording.title,
        },
    )
    request.app.state.job_runner.notify()
    return JobOut.model_validate(job)


@router.post("/recordings/transcribe-pending", response_model=BulkTranscribeResult)
def transcribe_pending(db: DbSession, request: Request) -> BulkTranscribeResult:
    """Queues every recording that has audio and no transcript yet (track 1)."""
    _ensure_ready_to_transcribe(db, request)
    active = _active_transcription_ids(db)
    candidates = db.scalars(
        select(Recording)
        .where(Recording.status == RecordingStatus.IMPORTED)
        .order_by(Recording.recorded_at.asc(), Recording.id.asc())
    ).all()
    queued = skipped = 0
    for recording in candidates:
        if (
            recording.transcript is not None
            or recording.id in active
            or recording.probed_at is None
            or not recording.audio_tracks
            or not Path(recording.file_path).is_file()
        ):
            skipped += 1
            continue
        job_service.enqueue(
            db,
            JobType.TRANSCRIBE_RECORDING,
            {"recording_id": recording.id, "audio_track": 0, "title": recording.title},
        )
        queued += 1
    if queued:
        request.app.state.job_runner.notify()
    return BulkTranscribeResult(queued=queued, skipped=skipped)


def _load_transcript(
    db: DbSession, recording_id: int
) -> tuple[Transcript, list[TranscriptSegment]]:
    recording = _get_recording(db, recording_id)
    transcript = recording.transcript
    if transcript is None:
        raise AppError(
            "transcript_not_found",
            "Esta gravação ainda não foi transcrita.",
            status.HTTP_404_NOT_FOUND,
        )
    segments = list(
        db.scalars(
            select(TranscriptSegment)
            .where(TranscriptSegment.transcript_id == transcript.id)
            .order_by(TranscriptSegment.position)
        ).all()
    )
    return transcript, segments


@router.get("/recordings/{recording_id}/transcript", response_model=TranscriptOut)
def read_transcript(recording_id: int, db: DbSession) -> TranscriptOut:
    transcript, segments = _load_transcript(db, recording_id)
    return TranscriptOut(
        id=transcript.id,
        recording_id=transcript.recording_id,
        model=transcript.model,
        language=transcript.language,
        language_probability=transcript.language_probability,
        audio_track=transcript.audio_track,
        audio_duration_seconds=transcript.audio_duration_seconds,
        processing_seconds=transcript.processing_seconds,
        segment_count=transcript.segment_count,
        word_count=transcript.word_count,
        created_at=transcript.created_at,
        segments=[SegmentOut.model_validate(s) for s in segments],
    )


class ExportFormat(StrEnum):
    SRT = "srt"
    VTT = "vtt"
    TXT = "txt"


_MEDIA_TYPES = {
    ExportFormat.SRT: "application/x-subrip",
    ExportFormat.VTT: "text/vtt",
    ExportFormat.TXT: "text/plain",
}


def _safe_filename(title: str) -> str:
    cleaned = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "", title).strip().strip(".")
    return (cleaned or "transcricao")[:120]


@router.get("/recordings/{recording_id}/transcript/export")
def export_transcript(recording_id: int, format: ExportFormat, db: DbSession) -> PlainTextResponse:
    transcript, segments = _load_transcript(db, recording_id)
    rows = [(s.start_seconds, s.end_seconds, s.text) for s in segments]
    body = {
        ExportFormat.SRT: whisper.to_srt,
        ExportFormat.VTT: whisper.to_vtt,
        ExportFormat.TXT: whisper.to_txt,
    }[format](rows)
    filename = f"{_safe_filename(transcript.recording.title)}.{format.value}"
    # RFC 5987 encoding keeps accented titles intact in the downloaded file name.
    return PlainTextResponse(
        body,
        media_type=f"{_MEDIA_TYPES[format]}; charset=utf-8",
        headers={
            "Content-Disposition": (
                f'attachment; filename="transcricao.{format.value}"; '
                f"filename*=UTF-8''{quote(filename)}"
            )
        },
    )
