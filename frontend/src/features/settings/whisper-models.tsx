"use client";

import { CircleCheck, Download, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { Badge, Button, ErrorState, Skeleton } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import type { Job, Page, TranscriptionStatus } from "@/lib/types";
import { useApi } from "@/lib/use-api";

/** Lists the Whisper models and lets the user download them (one-time, needs internet). */
export function WhisperModels({ selected }: { selected: string }) {
  const status = useApi<TranscriptionStatus>("/transcription/status");
  const jobs = useApi<Page<Job>>("/jobs?active=true&limit=20", {
    pollMs: (data) => (data?.items.some((j) => j.type === "download_model") ? 1000 : 5000),
  });
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastActive, setLastActive] = useState(false);

  const download = jobs.data?.items.find((j) => j.type === "download_model") ?? null;
  // When a download finishes, refresh the model list once.
  if (lastActive !== (download !== null)) {
    setLastActive(download !== null);
    if (download === null) status.reload();
  }

  async function start(name: string) {
    setStarting(name);
    setError(null);
    try {
      await api.post<Job>(`/transcription/models/${name}/download`);
      jobs.reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro ao iniciar o download.");
    } finally {
      setStarting(null);
    }
  }

  if (status.error) return <ErrorState message={status.error.message} onRetry={status.reload} />;
  if (!status.data) return <Skeleton className="h-48" />;

  return (
    <div className="space-y-3">
      {!status.data.engine_installed ? (
        <div className="flex gap-2 rounded-xl border border-bad/30 bg-bad/[0.06] p-3 text-xs text-bad">
          <TriangleAlert className="size-4 shrink-0" aria-hidden />O Faster-Whisper não está
          instalado no backend. Rode <code>uv sync</code> na pasta backend.
        </div>
      ) : null}
      <ul className="divide-y divide-line rounded-xl border border-line">
        {status.data.models.map((m) => {
          const downloading = download?.payload.model === m.name ? download : null;
          return (
            <li key={m.name} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm text-ink">
                  <span className="font-mono">{m.name}</span>
                  {m.name === selected ? <Badge tone="accent">Selecionado</Badge> : null}
                  {m.downloaded ? (
                    <Badge tone="ok">
                      <CircleCheck className="size-3" aria-hidden /> Baixado
                    </Badge>
                  ) : null}
                </p>
                <p className="text-xs text-ink-muted">
                  {m.note} ·{" "}
                  {m.downloaded
                    ? `${formatBytes(m.size_on_disk_bytes)} no SSD`
                    : `download de ~${formatBytes(m.approx_download_bytes)}`}
                </p>
                {downloading ? (
                  <div className="mt-2">
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-accent to-violet transition-[width] duration-500"
                        style={{ width: `${Math.max(2, Math.round(downloading.progress * 100))}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-ink-faint">{downloading.message}</p>
                  </div>
                ) : null}
              </div>
              {!m.downloaded ? (
                <Button
                  icon={Download}
                  onClick={() => start(m.name)}
                  loading={starting === m.name || downloading !== null}
                  disabled={!status.data?.engine_installed || (download !== null && !downloading)}
                >
                  {downloading ? "Baixando…" : "Baixar"}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {error ? <p className="text-xs text-bad">{error}</p> : null}
      <p className="text-xs text-ink-faint">
        O download precisa de internet uma única vez. Depois o modelo fica no SSD (
        <code className="font-mono">{status.data.models_dir}</code>) e a transcrição funciona
        offline. Processamento na CPU com {status.data.cpu_threads} threads.
      </p>
    </div>
  );
}
