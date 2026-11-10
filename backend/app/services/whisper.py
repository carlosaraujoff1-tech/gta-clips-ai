"""Local speech-to-text with Faster-Whisper (CTranslate2).

Hardware notes (Ryzen 5 5500 + Radeon RX 7600 on Windows):
CTranslate2 only accelerates NVIDIA GPUs (CUDA), so transcription always runs on
the CPU with int8 quantization. ``small`` is the default: good Portuguese quality
at a usable speed; ``medium`` is more accurate but roughly 2-3x slower.

Models are downloaded once (explicit user action) into ``<data_dir>/models/whisper``
on the SSD and then loaded from disk, so transcription works offline.
"""

from __future__ import annotations

import contextlib
import importlib.util
import os
import re
import shutil
import threading
import time
from collections.abc import Callable, Iterator
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Any

from app.core.logging import get_logger
from app.schemas.settings import AISettings, WhisperModel

if TYPE_CHECKING:
    from faster_whisper import WhisperModel as FWModel

log = get_logger(__name__)

# Must be set before huggingface_hub is imported (it reads them at import time):
# - plain HTTPS downloads instead of the Xet protocol, which needs extra hosts and is
#   more easily blocked by firewalls/antivirus on a home PC;
# - no usage telemetry: this app is local-first.
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")

COMPLETE_MARKER = ".download-complete"
MODEL_FILES = [
    "config.json",
    "preprocessor_config.json",
    "model.bin",
    "tokenizer.json",
    "vocabulary.*",
]


@dataclass(frozen=True)
class ModelSpec:
    name: WhisperModel
    repo_id: str
    approx_bytes: int
    note: str


MODELS: dict[WhisperModel, ModelSpec] = {
    "tiny": ModelSpec("tiny", "Systran/faster-whisper-tiny", 75_000_000, "Muito rápido, impreciso"),
    "base": ModelSpec(
        "base", "Systran/faster-whisper-base", 145_000_000, "Rápido, precisão básica"
    ),
    "small": ModelSpec(
        "small", "Systran/faster-whisper-small", 484_000_000, "Recomendado para o seu PC"
    ),
    "medium": ModelSpec(
        "medium", "Systran/faster-whisper-medium", 1_530_000_000, "Mais preciso, ~2-3x mais lento"
    ),
    "large-v3": ModelSpec(
        "large-v3", "Systran/faster-whisper-large-v3", 3_090_000_000, "Lento demais na CPU"
    ),
}


class WhisperError(Exception):
    """User-facing (Portuguese) explanation."""


def is_installed() -> bool:
    return importlib.util.find_spec("faster_whisper") is not None


def model_dir(models_root: Path, name: WhisperModel) -> Path:
    return models_root / "whisper" / name


def is_downloaded(models_root: Path, name: WhisperModel) -> bool:
    folder = model_dir(models_root, name)
    return (folder / COMPLETE_MARKER).is_file() and (folder / "model.bin").is_file()


def folder_size(folder: Path) -> int:
    total = 0
    for root, _dirs, files in os.walk(folder):
        for f in files:
            with contextlib.suppress(OSError):
                total += (Path(root) / f).stat().st_size
    return total


def download_model(
    models_root: Path, name: WhisperModel, on_progress: Callable[[int, int], None]
) -> Path:
    """Downloads a model from Hugging Face (needs internet once). Reports (bytes, expected)."""
    from huggingface_hub import snapshot_download
    from huggingface_hub.errors import HfHubHTTPError

    spec = MODELS[name]
    target = model_dir(models_root, name)
    target.mkdir(parents=True, exist_ok=True)
    (target / COMPLETE_MARKER).unlink(missing_ok=True)

    error: list[BaseException] = []

    def worker() -> None:
        try:
            snapshot_download(spec.repo_id, local_dir=target, allow_patterns=MODEL_FILES)
        except BaseException as exc:
            error.append(exc)

    thread = threading.Thread(target=worker, name=f"download-{name}", daemon=True)
    thread.start()
    while thread.is_alive():
        on_progress(folder_size(target), spec.approx_bytes)
        thread.join(0.5)

    if error:
        exc = error[0]
        log.warning("model_download_failed", model=name, error=str(exc), type=type(exc).__name__)
        if (
            isinstance(exc, HfHubHTTPError)
            and exc.response is not None
            and exc.response.status_code in (401, 403, 404)
        ):
            raise WhisperError(
                "O servidor de modelos recusou o download. Tente novamente mais tarde."
            ) from exc
        # Any other failure is almost always connectivity (offline, firewall, proxy).
        raise WhisperError(
            "Falha ao baixar o modelo. Verifique a conexão com a internet (ou se um firewall/"
            "antivírus está bloqueando huggingface.co) e tente novamente. "
            "O que já foi baixado é aproveitado."
        ) from exc

    if not (target / "model.bin").is_file():
        raise WhisperError("O download terminou, mas o arquivo do modelo não foi encontrado.")
    shutil.rmtree(target / ".cache", ignore_errors=True)  # huggingface_hub temp metadata
    (target / COMPLETE_MARKER).write_text(spec.repo_id, encoding="utf-8")
    log.info("model_downloaded", model=name, bytes=folder_size(target))
    return target


def default_cpu_threads() -> int:
    # CTranslate2 performs best with one thread per *physical* core.
    logical = os.cpu_count() or 2
    return max(1, logical // 2)


# ------------------------------------------------------------- transcription


@dataclass
class SegmentData:
    start: float
    end: float
    text: str
    avg_logprob: float | None
    no_speech_prob: float | None
    words: list[list[Any]] = field(default_factory=list)


@dataclass(frozen=True)
class TranscriptionInfo:
    language: str | None
    language_probability: float | None
    duration: float


# Words common in Brazilian GTA RP lives that a generic model tends to mishear.
# Words common in Brazilian GTA RP lives that a generic model tends to mishear. Kept
# as a plain list: phrased as sentences, Whisper sometimes "hallucinates" the whole
# phrase over music or silence (see ``is_hallucination``).
GTA_RP_HOTWORDS = (
    "GTA RP, viatura, polícia, reboque, guincho, morro, mecânico, fiança, delegacia, "
    "assalto, perseguição, helicóptero"
)
_HOTWORD_SET = {w.strip().lower() for w in re.split(r"[,\s]+", GTA_RP_HOTWORDS) if w.strip()}

_model_lock = threading.Lock()
_loaded: tuple[str, int, FWModel] | None = None


def _load_model(models_root: Path, name: WhisperModel, threads: int) -> FWModel:
    """Loads (and caches) a model from disk. Never downloads."""
    global _loaded
    from faster_whisper import WhisperModel as FWModelImpl

    path = model_dir(models_root, name)
    with _model_lock:
        if _loaded is not None and _loaded[0] == str(path) and _loaded[1] == threads:
            return _loaded[2]
        started = time.monotonic()
        model = FWModelImpl(
            str(path), device="cpu", compute_type="int8", cpu_threads=threads, num_workers=1
        )
        _loaded = (str(path), threads, model)
        log.info(
            "whisper_model_loaded",
            model=name,
            threads=threads,
            seconds=round(time.monotonic() - started, 1),
        )
        return model


SENTENCE_END = (".", "?", "!", "…")
MIN_SENTENCE_WORDS = 2
PAUSE_SPLIT_S = 0.8  # a long pause inside a segment usually starts a new line


def is_hallucination(seg: SegmentData) -> bool:
    """Known Whisper failure modes on music/noise: drop rather than caption them.

    - repetitive filler ("oi oi oi", "obrigado") where the model itself doubts there
      is speech (no_speech_prob);
    - text made mostly of the vocabulary hints (prompt leaking into the transcript).
    """
    words = [w.lower() for w in re.findall(r"[\wÀ-ÿ]+", seg.text)]
    if not words:
        return True
    unique = set(words)
    doubt = (seg.no_speech_prob or 0.0) > 0.5
    if doubt and len(unique) <= 2 and len(words) <= 4:
        return True
    hint_share = sum(w in _HOTWORD_SET for w in words) / len(words)
    return len(words) >= 3 and hint_share >= 0.6


def _capitalize(text: str) -> str:
    return text[:1].upper() + text[1:] if text else text


def split_sentences(seg: SegmentData) -> list[SegmentData]:
    """Splits a Whisper segment at sentence ends using word timings.

    Whisper sometimes merges several lines (even different speakers) into one long
    segment; one sentence per segment gives the highlight finder precise boundaries.
    """
    if len(seg.words) < 2 * MIN_SENTENCE_WORDS:
        return [seg]
    groups: list[list[list[Any]]] = [[]]
    for i, word in enumerate(seg.words):
        groups[-1].append(word)
        token = str(word[2]).strip()
        remaining = len(seg.words) - i - 1
        next_gap = (float(seg.words[i + 1][0]) - float(word[1])) if remaining else 0.0
        if (
            (token.endswith(SENTENCE_END) or next_gap > PAUSE_SPLIT_S)
            and len(groups[-1]) >= MIN_SENTENCE_WORDS
            and remaining >= MIN_SENTENCE_WORDS
        ):
            groups.append([])
    if len(groups) == 1:
        return [seg]
    return [
        SegmentData(
            start=float(g[0][0]),
            end=float(g[-1][1]),
            text=_capitalize("".join(str(w[2]) for w in g).strip()),
            avg_logprob=seg.avg_logprob,
            no_speech_prob=seg.no_speech_prob,
            words=g,
        )
        for g in groups
        if g
    ]


def transcribe(
    audio_path: Path, models_root: Path, ai: AISettings
) -> tuple[TranscriptionInfo, Iterator[SegmentData]]:
    """Starts transcription. Segments are produced lazily: stop iterating to abort."""
    if not is_installed():
        raise WhisperError("O Faster-Whisper não está instalado no backend.")
    if not is_downloaded(models_root, ai.whisper_model):
        raise WhisperError(
            f"O modelo '{ai.whisper_model}' ainda não foi baixado. Baixe-o em Configurações."
        )
    threads = ai.whisper_cpu_threads or default_cpu_threads()
    model = _load_model(models_root, ai.whisper_model, threads)

    segments, info = model.transcribe(
        str(audio_path),
        language=None if ai.whisper_language == "auto" else ai.whisper_language,
        beam_size=5,
        vad_filter=True,  # skip silence: big speed-up on long lives
        vad_parameters={"min_silence_duration_ms": 500},
        word_timestamps=True,  # needed for word-synced subtitles (Phase 5)
        condition_on_previous_text=False,  # avoids repetition loops on long audio
        # Vocabulary hints applied to every 30 s window (initial_prompt would only
        # affect the first one when not conditioning on previous text).
        hotwords=GTA_RP_HOTWORDS if ai.whisper_language in ("pt", "auto") else None,
    )

    def produce() -> Iterator[SegmentData]:
        for seg in segments:
            text = seg.text.strip()
            if not text:
                continue
            words = [
                [round(w.start, 3), round(w.end, 3), w.word, round(w.probability, 3)]
                for w in (seg.words or [])
            ]
            for part in split_sentences(
                SegmentData(
                    start=round(seg.start, 3),
                    end=round(seg.end, 3),
                    text=text,
                    avg_logprob=seg.avg_logprob,
                    no_speech_prob=seg.no_speech_prob,
                    words=words,
                )
            ):
                if is_hallucination(part):
                    log.info("segment_dropped_as_hallucination", start=part.start)
                    continue
                part.text = _capitalize(part.text)
                yield part

    return (
        TranscriptionInfo(
            language=info.language,
            language_probability=info.language_probability,
            duration=info.duration,
        ),
        produce(),
    )


# --------------------------------------------------------------- formatting


def _timestamp(seconds: float, separator: str) -> str:
    ms_total = max(0, round(seconds * 1000))
    h, rem = divmod(ms_total, 3_600_000)
    m, rem = divmod(rem, 60_000)
    s, ms = divmod(rem, 1000)
    return f"{h:02d}:{m:02d}:{s:02d}{separator}{ms:03d}"


def to_srt(segments: list[tuple[float, float, str]]) -> str:
    blocks = [
        f"{i}\n{_timestamp(start, ',')} --> {_timestamp(end, ',')}\n{text}\n"
        for i, (start, end, text) in enumerate(segments, start=1)
    ]
    return "\n".join(blocks)


def to_vtt(segments: list[tuple[float, float, str]]) -> str:
    blocks = [
        f"{_timestamp(start, '.')} --> {_timestamp(end, '.')}\n{text}\n"
        for start, end, text in segments
    ]
    return "WEBVTT\n\n" + "\n".join(blocks)


def to_txt(segments: list[tuple[float, float, str]]) -> str:
    return (
        "\n".join(f"[{_timestamp(start, '.')[:8]}] {text}" for start, _end, text in segments) + "\n"
    )
