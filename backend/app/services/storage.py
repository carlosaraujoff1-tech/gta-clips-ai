"""Checks for the video storage folders (normally on the external drive)."""

from __future__ import annotations

import os
import shutil
from pathlib import Path

from app.core.logging import get_logger
from app.schemas.settings import FolderStatus, StorageSettings, StorageStatus

log = get_logger(__name__)

FOLDER_LABELS = {
    "originals": "Originais",
    "processing": "Em processamento",
    "clips": "Cortes",
    "exports": "Exportações",
}


def _nearest_existing(path: Path) -> Path | None:
    """Closest existing ancestor (used to read free space before the folder exists)."""
    for candidate in (path, *path.parents):
        if candidate.exists():
            return candidate
    return None


def _drive_available(path: Path) -> bool:
    anchor = path.anchor  # "E:\\" on Windows, "/" on Linux
    return bool(anchor) and Path(anchor).exists()


def folder_status(key: str, raw_path: str | None) -> FolderStatus:
    label = FOLDER_LABELS[key]
    if not raw_path:
        return FolderStatus(
            key=key,
            label=label,
            path=None,
            configured=False,
            drive_available=False,
            exists=False,
            writable=False,
            free_bytes=None,
            total_bytes=None,
            message="Pasta não configurada.",
        )

    path = Path(raw_path)
    drive_ok = _drive_available(path)
    exists = drive_ok and path.is_dir()
    writable = exists and os.access(path, os.W_OK)

    free = total = None
    base = _nearest_existing(path) if drive_ok else None
    if base is not None:
        try:
            usage = shutil.disk_usage(base)
            free, total = usage.free, usage.total
        except OSError:
            log.warning("disk_usage_failed", key=key)

    if not drive_ok:
        message = f"Unidade '{path.anchor or '?'}' não encontrada. O HD externo está conectado?"
    elif path.exists() and not path.is_dir():
        message = "O caminho existe, mas não é uma pasta."
    elif not exists:
        message = "A pasta ainda não existe. Use 'Criar pastas'."
    elif not writable:
        message = "Sem permissão de escrita nesta pasta."
    else:
        message = "Pronta."

    return FolderStatus(
        key=key,
        label=label,
        path=str(path),
        configured=True,
        drive_available=drive_ok,
        exists=exists,
        writable=writable,
        free_bytes=free,
        total_bytes=total,
        message=message,
    )


def storage_status(storage: StorageSettings) -> StorageStatus:
    folders = [folder_status(key, value) for key, value in storage.as_dict().items()]
    return StorageStatus(all_ready=all(f.writable for f in folders), folders=folders)


def create_missing_folders(storage: StorageSettings) -> StorageStatus:
    """Create the *configured* folders only. Never touches paths sent ad hoc by a client."""
    for key, value in storage.as_dict().items():
        if not value:
            continue
        path = Path(value)
        if not _drive_available(path):
            log.info("create_folder_skipped_drive_missing", key=key)
            continue
        if path.exists():
            continue
        try:
            path.mkdir(parents=True, exist_ok=True)
            log.info("folder_created", key=key, path=str(path))
        except OSError as exc:
            log.warning("folder_create_failed", key=key, error=str(exc))
    return storage_status(storage)
