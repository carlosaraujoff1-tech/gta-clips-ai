# Architecture

## Overview

```
Browser ──► Next.js (127.0.0.1:3000) ──/api/* proxy──► FastAPI (127.0.0.1:8000) ──► SQLite (SSD)
                                                              │
                                                              ├──► ffmpeg / ffprobe (fixed args)
                                                              ├──► Ollama (loopback only)   [Phase 4]
                                                              └──► Video folders (external HDD)
```

- The browser only talks to the Next.js server. `/api/*` is rewritten to the backend
  (`frontend/next.config.ts`), so there is a single origin and the backend is never exposed.
- Both servers bind to `127.0.0.1`. `app.main.run()` refuses to start on another interface.

## Backend

| Layer | Location | Responsibility |
|---|---|---|
| Config | `app/core/config.py` | Process settings from env vars (`GTA_CLIPS_*`) / `backend/.env` |
| Logging | `app/core/logging.py` | structlog JSON lines → stdout + rotating `data/logs/backend.log` |
| Errors | `app/core/errors.py` | One JSON error shape: `{"error": {code, message, details}}` |
| Middleware | `app/core/middleware.py` | Request ID + timing log; local-client guard |
| DB | `app/db/` | SQLAlchemy 2 models, WAL-mode SQLite, Alembic migrations on startup |
| Schemas | `app/schemas/` | Pydantic models; all input is `extra="forbid"` |
| Services | `app/services/` | Settings persistence, storage checks, tool detection |
| Routes | `app/api/routes/` | Thin HTTP layer |

### Settings: two kinds

1. **Process settings** (`Settings`, env vars): where the DB lives, host/port, allowed origins.
2. **User settings** (`UserSettings`, stored as JSON in `app_settings`): video folders,
   ffmpeg paths, AI preferences. Editable from the UI, validated on every write.

### Security measures

- `TrustedHostMiddleware`: only `localhost` / `127.0.0.1` Host headers (DNS-rebinding defence).
- CORS restricted to the local frontend origins.
- Every non-GET request must send `X-GTA-Clips-Client: web` and use JSON. A custom header forces
  a CORS preflight, so a random website cannot trigger actions (CSRF defence).
- No endpoint accepts a command or an arbitrary path to act on. "Create folders" only creates
  folders already saved in settings.
- Only `ffmpeg`/`ffprobe` are ever executed: the configured path must be named
  `ffmpeg(.exe)`/`ffprobe(.exe)`, run with fixed arguments, no shell, with a timeout.
- The Ollama URL must be a loopback address (prevents SSRF to the LAN/internet).

### Data model

`recordings` → `clips` → `publications`, plus `app_settings`. Video files are never stored in
the DB: rows hold file paths and metadata. Status columns are plain strings (non-native enums)
so the schema migrates cleanly to PostgreSQL later if ever needed.

### Background work (planned for Phase 2+)

Long tasks (probing, transcription, analysis, rendering) will run in an in-process worker backed
by a `jobs` table in SQLite: no Redis/Celery (poorly supported on Windows), survives restarts,
and processes one heavy job at a time to fit the Ryzen 5 5500 / RX 7600 8 GB.

## Frontend

- Next.js App Router, TypeScript `strict`, Tailwind v4 design tokens in `src/app/globals.css`.
- Pages are thin server components that render client views in `src/features/*`.
- `src/lib/api.ts`: typed fetch wrapper with timeout and normalized `ApiError`.
- `src/lib/use-api.ts`: minimal data-fetching hook (`data / error / loading / reload`).
- Features from later phases are shown with `PlannedButton` / `PhaseNotice`: visible, disabled,
  and labelled with the phase that delivers them.
- System fonts only (Segoe UI Variable on Windows 11): nothing is downloaded at runtime.

## Hardware notes (Ryzen 5 5500, RX 7600 8 GB, 32 GB RAM, Windows 11)

- Faster-Whisper (CTranslate2) has no AMD GPU support on Windows → CPU `int8`, model `small`
  by default (`medium` optional).
- Ollama supports RX 7000 GPUs on Windows; Qwen3 4B Q4 (~2.5–3 GB) fits in VRAM. CPU fallback.
- FFmpeg: `h264_amf`/`hevc_amf` hardware encoding when available, `libx264` fallback. The
  Settings page reports which one is available.
