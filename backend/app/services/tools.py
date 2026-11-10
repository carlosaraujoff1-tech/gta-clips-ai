"""Locating and running the external tools the backend is allowed to use.

Safety: only ``ffmpeg`` and ``ffprobe`` are ever executed. Arguments are passed
as a list (never through a shell) and every call has a timeout.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from app.core.logging import get_logger
from app.schemas.settings import ToolSettings

log = get_logger(__name__)

ToolName = Literal["ffmpeg", "ffprobe"]
_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)  # avoid console flashes on Windows


@dataclass(frozen=True)
class ToolResult:
    returncode: int
    stdout: str
    stderr: str


class ToolNotFoundError(Exception):
    def __init__(self, tool: ToolName) -> None:
        super().__init__(tool)
        self.tool = tool


class ToolTimeoutError(Exception):
    pass


def resolve_tool(tool: ToolName, settings: ToolSettings) -> str | None:
    """Configured path if it exists, otherwise the executable found on the PATH."""
    configured = settings.ffmpeg_path if tool == "ffmpeg" else settings.ffprobe_path
    if configured:
        return configured if os.path.isfile(configured) else None
    return shutil.which(tool)


def run_tool(tool: ToolName, settings: ToolSettings, args: list[str], timeout: float) -> ToolResult:
    executable = resolve_tool(tool, settings)
    if executable is None:
        raise ToolNotFoundError(tool)
    try:
        completed = subprocess.run(  # noqa: S603 - allow-listed executable, list args, no shell
            [executable, *args],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            check=False,
            creationflags=_NO_WINDOW,
        )
    except subprocess.TimeoutExpired as exc:
        log.warning("tool_timeout", tool=tool, timeout=timeout)
        raise ToolTimeoutError(tool) from exc
    except OSError as exc:
        log.warning("tool_failed_to_start", tool=tool, error=str(exc))
        raise ToolNotFoundError(tool) from exc
    return ToolResult(completed.returncode, completed.stdout, completed.stderr)


def start_tool(tool: ToolName, settings: ToolSettings, args: list[str]) -> subprocess.Popen[str]:
    """Starts a long-running tool (e.g. an ffmpeg conversion) whose output is read as it runs.

    The caller owns the process and must wait for it or terminate it.
    """
    executable = resolve_tool(tool, settings)
    if executable is None:
        raise ToolNotFoundError(tool)
    try:
        return subprocess.Popen(  # noqa: S603 - allow-listed executable, list args, no shell
            [executable, *args],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            creationflags=_NO_WINDOW,
        )
    except OSError as exc:
        log.warning("tool_failed_to_start", tool=tool, error=str(exc))
        raise ToolNotFoundError(tool) from exc


class FfmpegFailedError(Exception):
    def __init__(self, returncode: int, stderr: str) -> None:
        super().__init__(f"ffmpeg exited with {returncode}")
        self.returncode = returncode
        self.stderr = stderr


def run_ffmpeg_with_progress(
    tools: ToolSettings,
    args: list[str],
    duration_seconds: float | None,
    on_progress: Callable[[float], None],
    output: Path | None = None,
) -> None:
    """Runs ffmpeg with ``-progress pipe:1`` and reports a 0-1 fraction.

    ``on_progress`` may raise (e.g. to cancel): ffmpeg is then killed and ``output``
    (if given) removed. Raises ``FfmpegFailedError`` on a non-zero exit.
    """
    # The output path is always the last argument; progress flags go right before it.
    *options, destination = args
    full_args = [
        "-nostdin", "-hide_banner", "-v", "error", "-y",
        *options,
        "-progress", "pipe:1", "-nostats",
        destination,
    ]  # fmt: skip
    process = start_tool("ffmpeg", tools, full_args)
    try:
        assert process.stdout is not None
        for line in process.stdout:
            key, _, value = line.strip().partition("=")
            if key == "out_time_us" and duration_seconds and value.isdigit():
                on_progress(min(1.0, int(value) / 1_000_000 / duration_seconds))
        stderr = process.stderr.read() if process.stderr else ""
        returncode = process.wait()
    except BaseException:
        process.kill()
        process.wait()
        if output is not None:
            output.unlink(missing_ok=True)
        raise
    if returncode != 0:
        if output is not None:
            output.unlink(missing_ok=True)
        log.info("ffmpeg_failed", returncode=returncode, stderr=stderr[-800:])
        raise FfmpegFailedError(returncode, stderr)
    on_progress(1.0)


def run_tool_bytes(
    tool: ToolName, settings: ToolSettings, args: list[str], timeout: float
) -> bytes | None:
    """Like ``run_tool`` but returns raw stdout bytes (e.g. an image piped by ffmpeg)."""
    executable = resolve_tool(tool, settings)
    if executable is None:
        raise ToolNotFoundError(tool)
    try:
        completed = subprocess.run(  # noqa: S603 - allow-listed executable, list args, no shell
            [executable, *args],
            capture_output=True,
            timeout=timeout,
            check=False,
            creationflags=_NO_WINDOW,
        )
    except subprocess.TimeoutExpired as exc:
        raise ToolTimeoutError(tool) from exc
    except OSError as exc:
        raise ToolNotFoundError(tool) from exc
    return completed.stdout if completed.returncode == 0 and completed.stdout else None
