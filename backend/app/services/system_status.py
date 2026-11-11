"""Detection of the local tools and services the pipeline depends on.

Safety: the only external programs ever executed are ``ffmpeg`` and ``ffprobe``,
with fixed arguments, without a shell and with a timeout. Nothing here runs
input received from the UI.
"""

from __future__ import annotations

import asyncio
import importlib.util
import os
import platform
import re
import sys
import time
from typing import Literal

import httpx
from pydantic import BaseModel

from app.core.config import APP_VERSION
from app.core.logging import get_logger
from app.schemas.settings import UserSettings
from app.services.tools import (
    ToolName,
    ToolNotFoundError,
    ToolTimeoutError,
    resolve_tool,
    run_tool,
)

log = get_logger(__name__)

State = Literal["ok", "warning", "missing", "error", "not_implemented"]
CACHE_TTL_SECONDS = 30.0
SUBPROCESS_TIMEOUT_SECONDS = 10


class ServiceStatus(BaseModel):
    key: str
    name: str
    state: State
    version: str | None = None
    detail: str
    phase: int | None = None  # development phase in which this component is used


class HostInfo(BaseModel):
    os: str
    machine: str
    cpu_threads: int | None
    python_version: str
    app_version: str


class SystemStatus(BaseModel):
    checked_at: float
    host: HostInfo
    services: list[ServiceStatus]


def _run_fixed(tool: ToolName, settings: UserSettings, args: list[str]) -> str | None:
    try:
        result = run_tool(tool, settings.tools, args, timeout=SUBPROCESS_TIMEOUT_SECONDS)
    except (ToolNotFoundError, ToolTimeoutError):
        return None
    return result.stdout if result.returncode == 0 else None


def _first_version(output: str, name: str) -> str | None:
    match = re.search(rf"{name} version (\S+)", output)
    return match.group(1) if match else None


def _check_ffmpeg_family(settings: UserSettings) -> list[ServiceStatus]:
    statuses: list[ServiceStatus] = []
    ffmpeg = resolve_tool("ffmpeg", settings.tools)
    ffprobe = resolve_tool("ffprobe", settings.tools)

    checks: tuple[tuple[ToolName, str | None, int], ...] = (
        ("ffmpeg", ffmpeg, 5),
        ("ffprobe", ffprobe, 2),
    )
    for key, exe, phase in checks:
        if exe is None:
            where = (
                "no caminho configurado" if getattr(settings.tools, f"{key}_path") else "no PATH"
            )
            statuses.append(
                ServiceStatus(
                    key=key,
                    name="FFmpeg" if key == "ffmpeg" else "FFprobe",
                    state="missing",
                    detail=f"Não encontrado {where}.",
                    phase=phase,
                )
            )
            continue
        out = _run_fixed(key, settings, ["-hide_banner", "-version"])
        version = _first_version(out, key) if out else None
        statuses.append(
            ServiceStatus(
                key=key,
                name="FFmpeg" if key == "ffmpeg" else "FFprobe",
                state="ok" if out else "error",
                version=version,
                detail=exe if out else "Encontrado, mas não respondeu corretamente.",
                phase=phase,
            )
        )

    # Hardware encoders: AMD AMF on the RX 7600, with libx264 as the CPU fallback.
    if ffmpeg is not None:
        encoders = _run_fixed("ffmpeg", settings, ["-hide_banner", "-encoders"]) or ""
        amf = [e for e in ("h264_amf", "hevc_amf", "av1_amf") if re.search(rf"\b{e}\b", encoders)]
        has_x264 = bool(re.search(r"\blibx264\b", encoders))
        if amf:
            statuses.append(
                ServiceStatus(
                    key="encoder_amf",
                    name="Codificação por GPU AMD (AMF)",
                    state="ok",
                    detail="Disponível: " + ", ".join(amf),
                    phase=5,
                )
            )
        else:
            statuses.append(
                ServiceStatus(
                    key="encoder_amf",
                    name="Codificação por GPU AMD (AMF)",
                    state="warning",
                    detail=(
                        "AMF indisponível neste FFmpeg. "
                        + ("Será usado libx264 (CPU)." if has_x264 else "libx264 também ausente.")
                    ),
                    phase=5,
                )
            )
    return statuses


async def _check_ollama(settings: UserSettings) -> list[ServiceStatus]:
    base = settings.ai.ollama_base_url  # validated: loopback only
    model = settings.ai.ollama_model
    try:
        async with httpx.AsyncClient(timeout=2.5) as client:
            version_resp = await client.get(f"{base}/api/version")
            version_resp.raise_for_status()
            tags_resp = await client.get(f"{base}/api/tags")
            tags_resp.raise_for_status()
    except httpx.HTTPError:
        return [
            ServiceStatus(
                key="ollama",
                name="Ollama",
                state="missing",
                detail=f"Não respondeu em {base}. Está instalado e em execução?",
                phase=4,
            ),
            ServiceStatus(
                key="ollama_model",
                name=f"Modelo {model}",
                state="missing",
                detail="Depende do Ollama.",
                phase=4,
            ),
        ]

    version = str(version_resp.json().get("version", "")) or None
    names = {str(m.get("name", "")) for m in tags_resp.json().get("models", [])}
    has_model = model in names or f"{model}:latest" in names
    return [
        ServiceStatus(
            key="ollama",
            name="Ollama",
            state="ok",
            version=version,
            detail=f"Respondendo em {base}.",
            phase=4,
        ),
        ServiceStatus(
            key="ollama_model",
            name=f"Modelo {model}",
            state="ok" if has_model else "missing",
            detail="Baixado." if has_model else "Ainda não baixado no Ollama.",
            phase=4,
        ),
    ]


def _check_python_package(key: str, name: str, module: str, phase: int) -> ServiceStatus:
    if importlib.util.find_spec(module) is not None:
        return ServiceStatus(
            key=key, name=name, state="ok", detail="Pacote instalado.", phase=phase
        )
    return ServiceStatus(
        key=key,
        name=name,
        state="not_implemented",
        detail=f"Será instalado na Fase {phase}.",
        phase=phase,
    )


def _os_label() -> str:
    system, release, version = platform.system(), platform.release(), platform.version()
    if system == "Windows":
        # Python reports "10" on Windows 11 too; builds >= 22000 are Windows 11.
        build = int(version.split(".")[-1]) if version.split(".")[-1].isdigit() else 0
        if release == "10" and build >= 22000:
            release = "11"
    return f"{system} {release} ({version})"


def _host_info() -> HostInfo:
    return HostInfo(
        os=_os_label(),
        machine=platform.machine(),
        cpu_threads=os.cpu_count(),
        python_version=sys.version.split()[0],
        app_version=APP_VERSION,
    )


_cache: tuple[float, str, SystemStatus] | None = None


async def get_system_status(settings: UserSettings, refresh: bool = False) -> SystemStatus:
    global _cache
    fingerprint = settings.model_dump_json()
    now = time.time()
    if (
        not refresh
        and _cache is not None
        and _cache[1] == fingerprint
        and now - _cache[0] < CACHE_TTL_SECONDS
    ):
        return _cache[2]

    ffmpeg_statuses, ollama_statuses = await asyncio.gather(
        asyncio.to_thread(_check_ffmpeg_family, settings),
        _check_ollama(settings),
    )
    services = [
        ServiceStatus(
            key="backend",
            name="Backend (API)",
            state="ok",
            version=APP_VERSION,
            detail="Em execução.",
            phase=1,
        ),
        ServiceStatus(
            key="database", name="Banco de dados SQLite", state="ok", detail="Conectado.", phase=1
        ),
        *ffmpeg_statuses,
        _check_python_package("faster_whisper", "Faster-Whisper", "faster_whisper", 3),
        *ollama_statuses,
    ]
    status = SystemStatus(checked_at=now, host=_host_info(), services=services)
    _cache = (now, fingerprint, status)
    return status
