/** Types mirroring the backend's API schemas (backend/app/schemas). */

export type RecordingStatus =
  "imported" | "transcribing" | "transcribed" | "analyzing" | "analyzed" | "failed";

export type ClipStatus =
  "draft" | "rendering" | "pending_review" | "approved" | "rejected" | "failed";

export type Platform = "tiktok" | "youtube_shorts" | "instagram_reels" | "manual_export";
export type PublicationStatus = "scheduled" | "published" | "exported" | "failed";

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface Recording {
  id: number;
  title: string;
  notes: string | null;
  file_path: string;
  file_size_bytes: number;
  file_modified_at: string | null;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  container: string | null;
  video_codec: string | null;
  audio_codec: string | null;
  audio_tracks: number | null;
  bitrate_kbps: number | null;
  probed_at: string | null;
  recorded_at: string | null;
  status: RecordingStatus;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  file_exists: boolean;
}

export type RecordingSort = "recent" | "recorded" | "title" | "duration" | "size";

export interface LibraryStats {
  total: number;
  total_size_bytes: number;
  total_duration_seconds: number;
  missing_metadata: number;
}

export type JobType = "scan_originals" | "import_file" | "probe_recording";
export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface Job {
  id: number;
  type: JobType;
  status: JobStatus;
  progress: number;
  message: string | null;
  error: string | null;
  result: Record<string, unknown> | null;
  payload: Record<string, unknown>;
  cancel_requested: boolean;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface Clip {
  id: number;
  recording_id: number;
  title: string;
  description: string | null;
  start_seconds: number;
  end_seconds: number;
  category: string | null;
  score: number | null;
  status: ClipStatus;
  created_at: string;
}

export interface Publication {
  id: number;
  clip_id: number;
  platform: Platform;
  status: PublicationStatus;
  external_url: string | null;
  published_at: string | null;
  created_at: string;
}

export interface DashboardSummary {
  counts: {
    recordings: number;
    clips: number;
    pending_review: number;
    approved: number;
    publications: number;
  };
  storage: {
    configured_folders: number;
    ready_folders: number;
    total_folders: number;
    clips_free_bytes: number | null;
  };
  recent_recordings: Recording[];
}

export type StorageKey = "originals" | "processing" | "clips" | "exports";
export type WhisperModel = "tiny" | "base" | "small" | "medium" | "large-v3";

export interface UserSettings {
  storage: Record<StorageKey, string | null>;
  tools: { ffmpeg_path: string | null; ffprobe_path: string | null };
  ai: { ollama_base_url: string; ollama_model: string; whisper_model: WhisperModel };
}

export interface FolderStatus {
  key: StorageKey;
  label: string;
  path: string | null;
  configured: boolean;
  drive_available: boolean;
  exists: boolean;
  writable: boolean;
  free_bytes: number | null;
  total_bytes: number | null;
  message: string;
}

export interface StorageStatus {
  all_ready: boolean;
  folders: FolderStatus[];
}

export type ServiceState = "ok" | "warning" | "missing" | "error" | "not_implemented";

export interface ServiceStatus {
  key: string;
  name: string;
  state: ServiceState;
  version: string | null;
  detail: string;
  phase: number | null;
}

export interface SystemStatus {
  checked_at: number;
  host: {
    os: string;
    machine: string;
    cpu_threads: number | null;
    python_version: string;
    app_version: string;
  };
  services: ServiceStatus[];
}

export interface Health {
  status: string;
  app: string;
  version: string;
  time: string;
}
