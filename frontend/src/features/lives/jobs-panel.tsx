"use client";

import { CircleCheck, CircleX, Clock, ListTodo, LoaderCircle, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Badge, Card, ErrorState, cx, type Tone } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { Job, JobStatus, Page } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const STATUS: Record<JobStatus, { tone: Tone; label: string }> = {
  queued: { tone: "neutral", label: "Na fila" },
  running: { tone: "accent", label: "Em andamento" },
  succeeded: { tone: "ok", label: "Concluída" },
  failed: { tone: "bad", label: "Falhou" },
  cancelled: { tone: "warn", label: "Cancelada" },
};

function isActive(job: Job): boolean {
  return job.status === "queued" || job.status === "running";
}

function fileName(path: unknown): string {
  return typeof path === "string" ? (path.split(/[\\/]/).pop() ?? path) : "";
}

export function jobTitle(job: Job): string {
  switch (job.type) {
    case "scan_originals":
      return "Varredura da pasta de originais";
    case "import_file":
      return `Importação: ${fileName(job.payload.source_path)}`;
    case "probe_recording":
      return "Leitura de metadados";
  }
}

function JobIcon({ status }: { status: JobStatus }) {
  const cls = "size-4 shrink-0";
  if (status === "running")
    return <LoaderCircle className={`${cls} animate-spin text-accent-soft`} />;
  if (status === "queued") return <Clock className={`${cls} text-ink-faint`} />;
  if (status === "succeeded") return <CircleCheck className={`${cls} text-ok`} />;
  return <CircleX className={`${cls} ${status === "failed" ? "text-bad" : "text-warn"}`} />;
}

function JobRow({ job, onChanged }: { job: Job; onChanged: () => void }) {
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = isActive(job);
  const pct = Math.round(job.progress * 100);

  async function cancel() {
    setCancelling(true);
    setError(null);
    try {
      await api.post(`/jobs/${job.id}/cancel`);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro ao cancelar.");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5" aria-hidden>
          <JobIcon status={job.status} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm text-ink">{jobTitle(job)}</p>
            <Badge tone={STATUS[job.status].tone}>{STATUS[job.status].label}</Badge>
          </div>
          <p
            className={cx(
              "mt-0.5 break-words text-xs",
              job.status === "failed" ? "text-bad" : "text-ink-muted",
            )}
          >
            {job.status === "failed" ? job.error : (job.message ?? "Aguardando…")}
          </p>
          {active ? (
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Progresso: ${pct}%`}
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent to-violet transition-[width] duration-500"
                style={{ width: `${Math.max(pct, job.status === "running" ? 2 : 0)}%` }}
              />
            </div>
          ) : (
            <p className="mt-0.5 text-[11px] text-ink-faint">
              {formatDate(job.finished_at ?? job.created_at)}
            </p>
          )}
          {error ? <p className="mt-1 text-xs text-bad">{error}</p> : null}
        </div>
        {active ? (
          <button
            type="button"
            onClick={cancel}
            disabled={cancelling || job.cancel_requested}
            className="shrink-0 rounded-lg p-1.5 text-ink-faint transition hover:bg-white/[0.06] hover:text-bad disabled:opacity-40"
            aria-label={`Cancelar ${jobTitle(job)}`}
            title="Cancelar"
          >
            <X className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>
    </li>
  );
}

/**
 * Lists recent background tasks. Polls quickly while something is running.
 * Calls `onSettled` whenever a task that was active finishes.
 */
export function JobsPanel({
  refreshKey,
  onSettled,
}: {
  refreshKey: number;
  onSettled: () => void;
}) {
  const { data, error, reload } = useApi<Page<Job>>(`/jobs?limit=6&k=${refreshKey}`, {
    pollMs: (current) => (current?.items.some(isActive) ? 1000 : 8000),
  });
  const previousActive = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!data) return;
    const active = new Set(data.items.filter(isActive).map((j) => j.id));
    const finished = [...previousActive.current].some((id) => !active.has(id));
    previousActive.current = active;
    if (finished) onSettled();
  }, [data, onSettled]);

  return (
    <Card title="Tarefas em segundo plano" icon={ListTodo}>
      {error ? (
        <ErrorState message={error.message} onRetry={reload} />
      ) : !data ? (
        <p className="text-sm text-ink-faint">Carregando…</p>
      ) : data.items.length === 0 ? (
        <p className="text-sm text-ink-muted">
          Nenhuma tarefa ainda. Varreduras, cópias e leituras de metadados aparecem aqui com o
          progresso.
        </p>
      ) : (
        <ul className="-my-3 divide-y divide-line">
          {data.items.map((job) => (
            <JobRow key={job.id} job={job} onChanged={reload} />
          ))}
        </ul>
      )}
    </Card>
  );
}
