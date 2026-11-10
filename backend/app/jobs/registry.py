"""Maps every job type to its handler."""

from __future__ import annotations

from app.core.config import Settings
from app.db.models import JobType
from app.jobs.analysis import analyze_recording, pull_llm_model, render_clip
from app.jobs.handlers import import_file, probe_recording, scan_originals
from app.jobs.runner import Handler
from app.jobs.transcription import make_download_model, make_transcribe_recording


def build_handlers(config: Settings) -> dict[JobType, Handler]:
    return {
        JobType.SCAN_ORIGINALS: scan_originals,
        JobType.IMPORT_FILE: import_file,
        JobType.PROBE_RECORDING: probe_recording,
        JobType.DOWNLOAD_MODEL: make_download_model(config.models_dir),
        JobType.TRANSCRIBE_RECORDING: make_transcribe_recording(config.models_dir),
        JobType.PULL_LLM_MODEL: pull_llm_model,
        JobType.ANALYZE_RECORDING: analyze_recording,
        JobType.RENDER_CLIP: render_clip,
    }
