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

`recordings` → `clips` → `publications`, plus `app_settings` and `jobs`. Video files are never stored in
the DB: rows hold file paths and metadata. Status columns are plain strings (non-native enums)
so the schema migrates cleanly to PostgreSQL later if ever needed.

### Background jobs (`app/jobs/`)

Long tasks run in an in-process worker (`JobRunner`) backed by the `jobs` table:

- **One worker thread, one job at a time**: heavy work (copying multi-GB files, later
  transcription and rendering) must not compete for the same disk/CPU/GPU on a Ryzen 5 5500 /
  RX 7600 8 GB. No Redis/Celery (poorly supported on Windows, unnecessary locally).
- **Durable queue**: queued jobs survive a restart; jobs that were *running* when the app stopped
  are marked as failed ("interrompida") on the next start.
- **Progress & cancellation**: handlers receive a `JobContext` with `progress()` (throttled DB
  writes) and `check_cancelled()` (cooperative; the API sets `cancel_requested`).
- **Errors**: `JobFailedError` carries a user-facing message; anything else is logged with the
  stack trace and reported as a generic internal error.

Job types (Phase 2): `scan_originals`, `import_file`, `probe_recording`. Duplicate active jobs
(same scan / same source file / same recording) are rejected with HTTP 409.

### Import pipeline (Phase 2)

- `services/library.py`: recursive discovery of video files, `.part` copy with progress
  (renamed only when complete, removed on failure/cancel), registration, re-probing.
- `services/media_probe.py`: `ffprobe -show_format -show_streams` parsed into duration,
  resolution, fps (`avg_frame_rate`), codecs, audio track count (OBS multi-track), bitrate and
  creation time. Cover-art streams are ignored.
- Source files are never moved or deleted. Removing a recording deletes only the DB row.
- `file_exists` is computed on read, so an unplugged drive shows as "Arquivo não encontrado"
  instead of breaking the library.

### Transcription (Phase 3)

- `services/audio.py`: ffmpeg extracts the chosen audio stream (`-map 0:a:N`) to 16 kHz mono
  WAV in the *processing* folder, reporting progress via `-progress pipe:1`. Killed on cancel.
- `services/whisper.py`: model registry (Systran CTranslate2 conversions), explicit one-time
  download into `<data_dir>/models/whisper/<name>` (marker file written only on success),
  model loading from that local path (never downloads implicitly), CPU int8, VAD, word
  timestamps, `condition_on_previous_text=False` to avoid repetition loops on long audio.
  Xet transfer and telemetry are disabled for `huggingface_hub` (plain HTTPS, local-first).
- `jobs/transcription.py`: `transcribe_recording` (extract → transcribe → atomically replace
  the previous transcript) and `download_model`. Recording status moves to `transcribing` and is
  restored on failure/cancel/restart; temp WAVs are always deleted.
- Storage: `transcripts` (one per recording) and `transcript_segments` (text, timings,
  confidence and per-word timings as JSON). Exports (SRT/VTT/TXT) are generated on demand.

### Highlights (Phase 4)

- `services/highlights.py`: per-segment *signals* (keywords, exclamations, speech rate, audio
  loudness vs the live's median using robust MAD statistics over audible seconds only), transcript
  chunking (~11k chars, overlapping lines), the PT-BR system prompt, a JSON schema for Ollama
  structured output (line numbers, not timestamps, to avoid hallucinated times), boundary
  fitting (min/max duration), context extension (pull in the trigger, the setup question and
  the reaction), padding that never crosses a neighbouring line, score blending (70% AI /
  30% signals), overlap removal and top-N selection. `heuristic` mode works without Ollama.
- `services/ollama.py`: loopback-only client; `think: false`, temperature 0.1, fixed seed
  (reproducible results), reasoning traces stripped defensively, model pull with progress.
- `services/whisper.py` additions: GTA RP `hotwords` and sentence splitting by word timings
  (precise clip boundaries even when Whisper merges lines).
- `jobs/analysis.py`: `analyze_recording` replaces previous *suggestions* only (clips already
  rendered/reviewed are kept and never suggested again), `pull_llm_model`.

### Vertical render (Phase 5)

- `services/render.py`: one ffmpeg filter graph per clip. Framing always *scales to cover*
  the target box then crops at `focus_x` (robust to any source size/rounding). Layouts:
  `blur`, `crop`, `facecam` (webcam region → 1080x640 band + gameplay 1080x1280 + accent
  line); portrait sources are kept whole. Jump cuts = `trim`/`atrim` pieces + `concat`,
  every other piece punched-in 8 %, 12-15 ms audio fades at each cut. Voice boost
  (`highpass` + `acompressor`) before `loudnorm`. AMF → libx264 fallback; JPEG thumbnail.
- `services/jumpcuts.py`: keep-intervals from word timings **and** 100 ms loudness: only
  quiet runs (≥ 0.4 s, 12 dB below the speech level) between phrases are removed; the tail
  after the last word is kept. Word timings are remapped to the cut timeline.
- `services/subtitles.py`: ASS presets (karaoke / boxed / simple), highlight colour, size,
  position, layout-aware title placement, watermark; speech text sanitised.
- `jobs/render.py`: merges per-clip `edit` (ClipEdit) over `RenderSettings`; stores
  `render_info` (encoder, duration, cuts, inputs) so the API can flag clips edited after
  rendering (`render_outdated`).
- API: `PATCH /clips/{id}` (title, start/end, edit; validated), `GET /recordings/{id}/frame`
  (JPEG for the editor and webcam picker), `GET /clips/{id}/thumbnail`.

### Transcription safeguards

Vocabulary hints are a plain word list (phrased as sentences, Whisper sometimes copied them
into silent/music parts). `is_hallucination` drops repetitive filler when `no_speech_prob`
is high and any segment made mostly of hint words; segments are also split at long pauses.

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
