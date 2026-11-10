"""Locating and running the external tools the backend is allowed to use.

Safety: only ``ffmpeg`` and ``ffprobe`` are ever executed. Arguments are passed
as a list (never through a shell) and every call has a timeout.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from dataclasses import dataclass
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
