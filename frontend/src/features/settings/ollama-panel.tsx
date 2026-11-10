"use client";

import { CircleCheck, Download, ExternalLink, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { Badge, Button, ErrorState, Skeleton } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { AnalysisStatus, Job, Page } from "@/lib/types";
import { useApi } from "@/lib/use-api";

/** Ollama status and one-click download of the analysis model (needs internet once). */
export function OllamaPanel() {
  const status = useApi<AnalysisStatus>("/analysis/status");
  const jobs = useApi<Page<Job>>("/jobs?active=true&limit=20", {
    pollMs: (data) => (data?.items.some((j) => j.type === "pull_llm_model") ? 1000 : 6000),
  });
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastActive, setLastActive] = useState(false);

  const pull = jobs.data?.items.find((j) => j.type === "pull_llm_model") ?? null;
  if (lastActive !== (pull !== null)) {
    setLastActive(pull !== null);
    if (pull === null) status.reload();
  }

  async function start() {
    setStarting(true);
    setError(null);
    try {
      await api.post<Job>("/analysis/models/pull");
      jobs.reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro ao iniciar o download.");
    } finally {
      setStarting(false);
    }
  }

  if (status.error) return <ErrorState message={status.error.message} onRetry={status.reload} />;
  if (!status.data) return <Skeleton className="h-20" />;
  const s = status.data;

  return (
    <div className="space-y-3 rounded-xl border border-line p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-ink">Ollama</span>
        {s.ollama_running ? (
          <Badge tone="ok">
            <CircleCheck className="size-3" aria-hidden /> Em execução · v{s.ollama_version}
          </Badge>
        ) : (
          <Badge tone="bad">Não encontrado</Badge>
        )}
        <span className="text-ink-faint">·</span>
        <span className="font-mono text-xs text-ink">{s.model}</span>
        {s.ollama_running ? (
          s.model_installed ? (
            <Badge tone="ok">Instalado</Badge>
          ) : (
            <Badge tone="warn">Não baixado</Badge>
          )
        ) : null}
      </div>

      {!s.ollama_running ? (
        <div className="flex gap-2 rounded-lg border border-warn/30 bg-warn/[0.06] p-2.5 text-xs text-warn">
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
          <p>
            Instale o Ollama para Windows e deixe-o aberto. Sem ele, use a{" "}
            <span className="font-medium">Análise rápida (sem IA)</span> nas Lives.{" "}
            <a
              href="https://ollama.com/download/windows"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 underline hover:text-ink"
            >
              ollama.com <ExternalLink className="size-3" aria-hidden />
            </a>
          </p>
        </div>
      ) : !s.model_installed ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <p className="flex-1 text-xs text-ink-muted">
            O modelo precisa ser baixado uma vez (~2,5 GB). Depois funciona offline.
          </p>
          <Button icon={Download} onClick={start} loading={starting || pull !== null}>
            {pull ? "Baixando…" : "Baixar modelo"}
          </Button>
        </div>
      ) : null}

      {pull ? (
        <div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent to-violet transition-[width] duration-500"
              style={{ width: `${Math.max(2, Math.round(pull.progress * 100))}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] text-ink-faint">{pull.message}</p>
        </div>
      ) : null}
      {error ? <p className="text-xs text-bad">{error}</p> : null}
      <p className="text-[11px] text-ink-faint">
        Na Radeon RX 7600 o Ollama usa a GPU automaticamente quando suportado; caso contrário roda
        na CPU (mais lento, mesmo resultado).
      </p>
    </div>
  );
}
