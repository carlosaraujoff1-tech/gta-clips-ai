"""Minimal client for a *local* Ollama server (http://127.0.0.1:11434 by default).

The base URL is validated in settings to be a loopback address, so this never
talks to the network. Calls are synchronous: they run inside background jobs.

Hardware note: on Windows, Ollama can use the Radeon RX 7600 (ROCm/Vulkan) and
falls back to the CPU automatically. Qwen3 4B in Q4 (~2.6 GB) fits in 8 GB VRAM.
"""

from __future__ import annotations

import json
import re
from collections.abc import Callable
from typing import Any

import httpx

from app.core.logging import get_logger

log = get_logger(__name__)

CHAT_TIMEOUT_S = 900.0  # a long chunk on CPU-only can take minutes
# Reasoning traces some models emit even when asked not to ("<think>...</think>",
# sometimes without the opening tag): everything up to the last closing tag is dropped.
_THINK_PREFIX = re.compile(r"^.*</think>", re.DOTALL)


class OllamaError(Exception):
    """User-facing (Portuguese) explanation."""


def _client(base_url: str, timeout: float | httpx.Timeout) -> httpx.Client:
    # trust_env=False: never route local calls through a system proxy.
    return httpx.Client(base_url=base_url, timeout=timeout, trust_env=False)


def get_version(base_url: str) -> str | None:
    try:
        with _client(base_url, 3.0) as client:
            resp = client.get("/api/version")
            resp.raise_for_status()
            return str(resp.json().get("version", "")) or None
    except (httpx.HTTPError, ValueError):
        return None


def list_models(base_url: str) -> set[str]:
    try:
        with _client(base_url, 5.0) as client:
            resp = client.get("/api/tags")
            resp.raise_for_status()
    except httpx.HTTPError as exc:
        raise OllamaError(
            f"O Ollama não respondeu em {base_url}. Ele está instalado e em execução?"
        ) from exc
    return {str(m.get("name", "")) for m in resp.json().get("models", [])}


def has_model(base_url: str, model: str) -> bool:
    names = list_models(base_url)
    return model in names or f"{model}:latest" in names


def pull_model(
    base_url: str,
    model: str,
    on_progress: Callable[[str, int, int], None],
) -> None:
    """Downloads a model into Ollama (internet needed once). Streams (status, done, total)."""
    try:
        with (
            _client(base_url, httpx.Timeout(30.0, read=None)) as client,
            client.stream("POST", "/api/pull", json={"model": model, "stream": True}) as resp,
        ):
            resp.raise_for_status()
            for line in resp.iter_lines():
                if not line.strip():
                    continue
                event = json.loads(line)
                if "error" in event:
                    raise OllamaError(f"O Ollama recusou o download: {event['error']}")
                on_progress(
                    str(event.get("status", "")),
                    int(event.get("completed") or 0),
                    int(event.get("total") or 0),
                )
    except httpx.HTTPError as exc:
        raise OllamaError(
            "Falha ao baixar o modelo pelo Ollama. Verifique se o Ollama está aberto e se há "
            "conexão com a internet."
        ) from exc


def chat_json(
    base_url: str,
    model: str,
    system: str,
    user: str,
    schema: dict[str, Any],
    *,
    num_ctx: int = 8192,
    temperature: float = 0.1,
    seed: int = 42,
) -> dict[str, Any]:
    """One chat turn whose answer must match ``schema`` (Ollama structured outputs)."""
    payload = {
        "model": model,
        "stream": False,
        "think": False,  # Qwen3: skip the long reasoning trace, answer directly
        "format": schema,
        "keep_alive": "10m",
        # Low temperature + fixed seed: analysing the same live gives the same clips.
        "options": {"temperature": temperature, "num_ctx": num_ctx, "seed": seed},
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    try:
        with _client(base_url, CHAT_TIMEOUT_S) as client:
            resp = client.post("/api/chat", json=payload)
    except httpx.TimeoutException as exc:
        raise OllamaError("O Ollama demorou demais para responder.") from exc
    except httpx.HTTPError as exc:
        raise OllamaError(
            f"O Ollama não respondeu em {base_url}. Ele está instalado e em execução?"
        ) from exc
    if resp.status_code == 404:
        raise OllamaError(f"O modelo '{model}' não está instalado no Ollama.")
    if resp.status_code >= 400:
        log.warning("ollama_error", status=resp.status_code, body=resp.text[:300])
        raise OllamaError(f"O Ollama retornou um erro ({resp.status_code}).")

    content = str(resp.json().get("message", {}).get("content", ""))
    content = _THINK_PREFIX.sub("", content).strip()
    try:
        data = json.loads(content)
    except json.JSONDecodeError as exc:
        log.warning("ollama_invalid_json", content=content[:300])
        raise OllamaError("A IA respondeu em um formato inesperado.") from exc
    if not isinstance(data, dict):
        raise OllamaError("A IA respondeu em um formato inesperado.")
    return data
