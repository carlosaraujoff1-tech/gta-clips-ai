"""User-editable settings and their validation rules."""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Literal
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

MAX_PATH_LENGTH = 240  # stays below the classic Windows MAX_PATH (260) with room for files
LOOPBACK_HOSTS = frozenset({"127.0.0.1", "localhost", "::1"})
WhisperModel = Literal["tiny", "base", "small", "medium", "large-v3"]
WhisperLanguage = Literal["pt", "auto", "en", "es"]

STORAGE_FOLDER_KEYS = ("originals", "processing", "clips", "exports")


def _clean_optional_path(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip().strip('"')
    if not value:
        return None
    if "\x00" in value:
        raise ValueError("Caminho contém caracteres inválidos.")
    if len(value) > MAX_PATH_LENGTH:
        raise ValueError(f"Caminho muito longo (máximo {MAX_PATH_LENGTH} caracteres).")
    if not Path(value).is_absolute():
        raise ValueError(r"Use um caminho absoluto, por exemplo E:\GTA-CLIPS-AI\originals.")
    return os.path.normpath(value)


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class StorageSettings(_Strict):
    """Folders on the external drive. ``None`` means 'not configured yet'."""

    originals: str | None = None
    processing: str | None = None
    clips: str | None = None
    exports: str | None = None

    @field_validator("originals", "processing", "clips", "exports", mode="before")
    @classmethod
    def _validate_path(cls, value: str | None) -> str | None:
        return _clean_optional_path(value)

    @model_validator(mode="after")
    def _distinct_and_not_nested(self) -> StorageSettings:
        configured = {k: v for k, v in self.as_dict().items() if v}
        normalized = {k: os.path.normcase(v) for k, v in configured.items()}
        keys = list(normalized)
        for i, a in enumerate(keys):
            for b in keys[i + 1 :]:
                pa, pb = normalized[a], normalized[b]
                if pa == pb:
                    raise ValueError(f"As pastas '{a}' e '{b}' não podem ser iguais.")
                if pa.startswith(pb + os.sep) or pb.startswith(pa + os.sep):
                    raise ValueError(
                        f"As pastas '{a}' e '{b}' não podem ficar uma dentro da outra."
                    )
        return self

    def as_dict(self) -> dict[str, str | None]:
        return {key: getattr(self, key) for key in STORAGE_FOLDER_KEYS}


class ToolSettings(_Strict):
    """Optional explicit paths to executables. Empty = look them up on the system PATH."""

    ffmpeg_path: str | None = None
    ffprobe_path: str | None = None

    @field_validator("ffmpeg_path", "ffprobe_path", mode="before")
    @classmethod
    def _validate_path(cls, value: str | None) -> str | None:
        return _clean_optional_path(value)

    @model_validator(mode="after")
    def _only_expected_executables(self) -> ToolSettings:
        # Safety rule: the backend only ever runs ffmpeg/ffprobe, never an
        # arbitrary program chosen through the UI.
        for field, expected in (("ffmpeg_path", "ffmpeg"), ("ffprobe_path", "ffprobe")):
            value: str | None = getattr(self, field)
            if value is None:
                continue
            p = Path(value)
            if p.stem.lower() != expected or p.suffix.lower() not in ("", ".exe"):
                raise ValueError(
                    f"O caminho de {expected} deve apontar para o executável "
                    f"'{expected}.exe' (ou '{expected}')."
                )
        return self


class AISettings(_Strict):
    ollama_base_url: str = "http://127.0.0.1:11434"
    # Qwen3 4B *Instruct* (Q4_K_M, ~2.5 GB): answers directly. The plain "qwen3:4b"
    # tag is the "thinking" variant, which writes long reasoning first (much slower).
    ollama_model: str = Field(default="qwen3:4b-instruct", min_length=1, max_length=100)
    whisper_model: WhisperModel = "small"
    whisper_language: WhisperLanguage = "pt"
    # 0 = automatic (one thread per physical core: 6 on a Ryzen 5 5500).
    whisper_cpu_threads: int = Field(default=0, ge=0, le=64)

    # Highlight detection (Phase 4)
    clip_min_seconds: int = Field(default=15, ge=5, le=120)
    clip_max_seconds: int = Field(default=60, ge=10, le=180)
    max_clips_per_recording: int = Field(default=8, ge=1, le=50)
    min_clip_score: int = Field(default=55, ge=0, le=100)

    @field_validator("ollama_base_url")
    @classmethod
    def _local_ollama_only(cls, value: str) -> str:
        parsed = urlparse(value)
        if parsed.scheme not in ("http", "https") or not parsed.hostname:
            raise ValueError("Endereço do Ollama inválido. Exemplo: http://127.0.0.1:11434")
        if parsed.hostname not in LOOPBACK_HOSTS:
            raise ValueError("O Ollama deve rodar neste computador (127.0.0.1 ou localhost).")
        if parsed.path not in ("", "/") or parsed.query or parsed.fragment:
            raise ValueError("Informe apenas o endereço base, sem caminho.")
        return value.rstrip("/")

    @model_validator(mode="after")
    def _clip_bounds(self) -> AISettings:
        if self.clip_min_seconds >= self.clip_max_seconds:
            raise ValueError("A duração mínima do corte deve ser menor que a máxima.")
        return self

    @field_validator("ollama_model")
    @classmethod
    def _model_name(cls, value: str) -> str:
        if not re.fullmatch(r"[A-Za-z0-9._:/-]+", value):
            raise ValueError("Nome de modelo inválido.")
        return value


SubtitleStyle = Literal["karaoke", "simple"]
VerticalLayout = Literal["blur", "crop"]


class RenderSettings(_Strict):
    """Vertical (9:16) export settings. Phase 5 preview: refined in Phase 5."""

    layout: VerticalLayout = "blur"  # blur = gameplay centered over a blurred copy
    subtitle_style: SubtitleStyle = "karaoke"  # karaoke = current word highlighted
    subtitle_font: str = Field(default="Arial Black", min_length=1, max_length=60)
    show_title: bool = True
    zoom: bool = True  # slow push-in for movement
    target_lufs: float = Field(default=-14.0, ge=-24.0, le=-9.0)  # TikTok/Shorts/Reels level

    @field_validator("subtitle_font")
    @classmethod
    def _font_name(cls, value: str) -> str:
        if not re.fullmatch(r"[A-Za-z0-9 ._-]+", value):
            raise ValueError("Nome de fonte inválido.")
        return value


class UserSettings(_Strict):
    storage: StorageSettings = Field(default_factory=StorageSettings)
    tools: ToolSettings = Field(default_factory=ToolSettings)
    ai: AISettings = Field(default_factory=AISettings)
    render: RenderSettings = Field(default_factory=RenderSettings)


class FolderStatus(BaseModel):
    key: str
    label: str
    path: str | None
    configured: bool
    drive_available: bool
    exists: bool
    writable: bool
    free_bytes: int | None
    total_bytes: int | None
    message: str


class StorageStatus(BaseModel):
    all_ready: bool
    folders: list[FolderStatus]
