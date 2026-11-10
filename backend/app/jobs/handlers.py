"""Job handlers for Phase 2: scanning, importing and probing recordings."""

from __future__ import annotations

import os
import shutil
from pathlib import Path
from typing import Any

from app.core.logging import get_logger
from app.db.models import JobType, Recording
from app.jobs.runner import Handler, JobContext, JobFailedError
from app.schemas.settings import UserSettings
from app.services import library

log = get_logger(__name__)


class ImportSourceError(Exception):
    """Invalid import source; message is user-facing (Portuguese)."""


def require_originals_folder(settings: UserSettings) -> Path:
    raw = settings.storage.originals
    if not raw:
        raise ImportSourceError(
            "A pasta de originais não está configurada. Defina-a em Configurações."
        )
    folder = Path(raw)
    if not folder.is_dir():
        raise ImportSourceError(
            "A pasta de originais não existe ou o HD externo está desconectado. "
            "Verifique em Configurações."
        )
    if not os.access(folder, os.W_OK):
        raise ImportSourceError("Sem permissão de escrita na pasta de originais.")
    return folder


def validate_import_source(raw: str) -> Path:
    path = Path(raw)
    if not path.is_absolute():
        raise ImportSourceError("Informe o caminho completo do arquivo, ex.: D:\\OBS\\live.mkv")
    if not library.is_video_file(path):
        allowed = ", ".join(sorted(library.VIDEO_EXTENSIONS))
        raise ImportSourceError(f"Formato não suportado. Formatos aceitos: {allowed}.")
    if not path.is_file():
        raise ImportSourceError("Arquivo não encontrado.")
    if path.stat().st_size == 0:
        raise ImportSourceError("O arquivo está vazio.")
    return path


# ----------------------------------------------------------------- handlers


def scan_originals(ctx: JobContext) -> dict[str, Any]:
    try:
        folder = require_originals_folder(ctx.settings)
    except ImportSourceError as exc:
        raise JobFailedError(str(exc)) from exc

    ctx.progress(0.0, "Procurando vídeos na pasta de originais…", force=True)
    files = list(library.iter_video_files(folder))
    added = existing = failed_metadata = 0

    with ctx.session() as session:
        for index, path in enumerate(files):
            ctx.check_cancelled()
            ctx.progress(
                index / max(len(files), 1), f"Lendo {path.name} ({index + 1}/{len(files)})"
            )
            try:
                recording, created = library.register_file(session, path, ctx.settings.tools)
            except OSError as exc:
                log.warning("scan_file_unreadable", error=str(exc))
                failed_metadata += 1
                continue
            if created:
                added += 1
                if recording.probed_at is None:
                    failed_metadata += 1
            else:
                existing += 1

    summary = f"{added} nova(s), {existing} já na biblioteca"
    if failed_metadata:
        summary += f", {failed_metadata} sem metadados"
    ctx.progress(1.0, f"Concluído: {summary}.", force=True)
    return {
        "found": len(files),
        "added": added,
        "already_in_library": existing,
        "without_metadata": failed_metadata,
    }


def import_file(ctx: JobContext) -> dict[str, Any]:
    try:
        source = validate_import_source(str(ctx.payload.get("source_path", "")))
        originals = require_originals_folder(ctx.settings)
    except ImportSourceError as exc:
        raise JobFailedError(str(exc)) from exc

    size = source.stat().st_size

    if library.is_inside(source, originals):
        # Already in the originals folder: just register it, no copy needed.
        destination = source
        ctx.progress(0.9, "O arquivo já está na pasta de originais. Registrando…", force=True)
    else:
        same_name = originals / source.name
        if same_name.is_file() and same_name.stat().st_size == size:
            destination = same_name
            ctx.progress(
                0.9, "Uma cópia idêntica já existe nos originais. Registrando…", force=True
            )
        else:
            free = shutil.disk_usage(originals).free
            if free < size + library.FREE_SPACE_MARGIN_BYTES:
                raise JobFailedError(
                    "Espaço insuficiente no HD externo para copiar este arquivo "
                    "(é preciso deixar ao menos 1 GB livre)."
                )
            destination = library.unique_destination(originals, source.name)
            ctx.progress(0.0, f"Copiando {source.name}…", force=True)

            def on_progress(copied: int, total: int) -> None:
                ctx.check_cancelled()
                pct = copied / total if total else 1.0
                ctx.progress(pct * 0.95, f"Copiando {source.name} ({round(pct * 100)}%)")

            try:
                library.copy_with_progress(source, destination, on_progress)
            except OSError as exc:
                log.warning("copy_failed", error=str(exc))
                raise JobFailedError(f"Falha ao copiar o arquivo: {exc.strerror or exc}") from exc

    ctx.check_cancelled()
    ctx.progress(0.96, "Lendo metadados…", force=True)
    with ctx.session() as session:
        recording, created = library.register_file(session, destination, ctx.settings.tools)
        result = {
            "recording_id": recording.id,
            "created": created,
            "copied": destination != source,
            "destination": str(destination),
            "metadata_ok": recording.probed_at is not None,
        }
    msg = "Importação concluída." if created else "Este arquivo já estava na biblioteca."
    ctx.progress(1.0, msg, force=True)
    return result


def probe_recording(ctx: JobContext) -> dict[str, Any]:
    recording_id = ctx.payload.get("recording_id")
    with ctx.session() as session:
        recording = session.get(Recording, recording_id)
        if recording is None:
            raise JobFailedError("Gravação não encontrada.")
        ctx.progress(0.1, f"Lendo metadados de {recording.title}…", force=True)
        ok = library.refresh_metadata(recording, ctx.settings.tools)
        session.commit()
        if not ok:
            raise JobFailedError(recording.error_message or "Falha ao ler metadados.")
    ctx.progress(1.0, "Metadados atualizados.", force=True)
    return {"recording_id": recording_id}


HANDLERS: dict[JobType, Handler] = {
    JobType.SCAN_ORIGINALS: scan_originals,
    JobType.IMPORT_FILE: import_file,
    JobType.PROBE_RECORDING: probe_recording,
}
