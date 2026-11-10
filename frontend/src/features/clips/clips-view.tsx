"use client";

import {
  Clapperboard,
  Download,
  Film,
  Info,
  LoaderCircle,
  RefreshCw,
  Scissors,
  Sparkles,
  Trash2,
  TriangleAlert,
  Wand2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";

import { ClipStatusBadge, CLIP_STATUS_LABEL } from "@/components/status";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
  cx,
  type Tone,
} from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import type { Clip, ClipStatus, Job, Page } from "@/lib/types";
import { useApi } from "@/lib/use-api";

import { JobsPanel } from "../lives/jobs-panel";

const FILTERS: Array<{ value: ClipStatus | "all"; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "draft", label: "Sugestões da IA" },
  { value: "pending_review", label: CLIP_STATUS_LABEL.pending_review },
  { value: "approved", label: CLIP_STATUS_LABEL.approved },
  { value: "rejected", label: CLIP_STATUS_LABEL.rejected },
];

const CATEGORY_TONE: Record<string, Tone> = {
  engraçado: "warn",
  perseguição: "accent",
  tiroteio: "bad",
  discussão: "violet",
  inesperado: "violet",
  interação: "ok",
  ação: "accent",
};

function scoreTone(score: number): string {
  if (score >= 80) return "from-ok/30 to-ok/5 text-ok border-ok/30";
  if (score >= 60) return "from-accent/30 to-accent/5 text-accent-soft border-accent/30";
  return "from-warn/25 to-warn/5 text-warn border-warn/30";
}

function ClipCard({
  clip,
  onChanged,
  onJobStarted,
}: {
  clip: Clip;
  onChanged: () => void;
  onJobStarted: () => void;
}) {
  const [busy, setBusy] = useState<"render" | "discard" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showWhy, setShowWhy] = useState(false);
  const duration = clip.end_seconds - clip.start_seconds;
  const rendering = clip.status === "rendering";

  async function run(kind: "render" | "discard", action: () => Promise<void>) {
    setBusy(kind);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro inesperado.");
    } finally {
      setBusy(null);
    }
  }

  const render = () =>
    run("render", async () => {
      await api.post<Job>(`/clips/${clip.id}/render`);
      onJobStarted();
      onChanged();
    });

  const discard = () =>
    run("discard", async () => {
      await api.delete(`/clips/${clip.id}`);
      onChanged();
    });

  return (
    <article className="animate-fade-in flex flex-col overflow-hidden rounded-2xl border border-line bg-surface/70 transition hover:border-line-strong">
      <div className="relative aspect-[9/16] w-full bg-canvas">
        {clip.has_video && !rendering ? (
          <video
            key={clip.rendered_at ?? clip.id}
            className="h-full w-full object-contain"
            src={`/api/clips/${clip.id}/video`}
            controls
            playsInline
            preload="metadata"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-accent/10 via-transparent to-violet/15 p-6 text-center">
            {rendering ? (
              <>
                <LoaderCircle className="size-8 animate-spin text-accent-soft" aria-hidden />
                <p className="text-sm text-ink-muted">Editando o corte…</p>
              </>
            ) : (
              <>
                <Film className="size-8 text-ink-faint" aria-hidden />
                <p className="text-sm text-ink-muted">
                  Sugestão da IA. Gere o vídeo vertical com legenda e edição.
                </p>
              </>
            )}
          </div>
        )}
        {clip.score !== null ? (
          <span
            className={cx(
              "absolute left-3 top-3 rounded-xl border bg-gradient-to-br px-2.5 py-1 text-sm font-bold tabular-nums backdrop-blur",
              scoreTone(clip.score),
            )}
            title="Nota do momento (IA + sinais de emoção do áudio e da fala)"
          >
            {Math.round(clip.score)}
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <ClipStatusBadge status={clip.status} />
          {clip.category ? (
            <Badge tone={CATEGORY_TONE[clip.category] ?? "neutral"}>{clip.category}</Badge>
          ) : null}
          {clip.source === "heuristic" ? <Badge>sem IA</Badge> : null}
        </div>
        <h3 className="text-sm font-semibold leading-snug text-ink">{clip.title}</h3>
        {clip.hook ? (
          <p className="border-l-2 border-violet/50 pl-2 text-xs italic text-ink-muted">
            “{clip.hook}”
          </p>
        ) : null}
        <p className="text-xs text-ink-faint">
          {clip.recording_title} · {formatDuration(clip.start_seconds)}–
          {formatDuration(clip.end_seconds)} · {Math.round(duration)}s
        </p>

        {clip.reason ? (
          <div>
            <button
              type="button"
              onClick={() => setShowWhy((v) => !v)}
              className="flex items-center gap-1 text-xs text-accent-soft hover:text-ink"
              aria-expanded={showWhy}
            >
              <Info className="size-3.5" aria-hidden /> Por que a IA escolheu?
            </button>
            {showWhy ? (
              <div className="mt-2 rounded-lg border border-line bg-canvas/50 p-2.5 text-xs text-ink-muted">
                <p>{clip.reason}</p>
                {clip.score_details ? (
                  <p className="mt-1.5 text-ink-faint">
                    {clip.score_details.ai !== null
                      ? `IA: ${Math.round(clip.score_details.ai)} · `
                      : ""}
                    Emoção medida (áudio + fala): {Math.round(clip.score_details.signals)}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {clip.render_error ? (
          <p className="flex gap-1.5 text-xs text-bad">
            <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
            {clip.render_error}
          </p>
        ) : null}
        {error ? <p className="text-xs text-bad">{error}</p> : null}

        <div className="mt-auto flex flex-wrap gap-2 pt-1">
          {clip.status === "draft" ? (
            <>
              <Button variant="primary" icon={Wand2} onClick={render} loading={busy === "render"}>
                Gerar vídeo
              </Button>
              <Button
                variant="ghost"
                icon={Trash2}
                onClick={discard}
                loading={busy === "discard"}
                className="hover:text-bad"
              >
                Descartar
              </Button>
            </>
          ) : null}
          {clip.has_video && !rendering ? (
            <>
              <a
                href={`/api/clips/${clip.id}/video?download=true`}
                download
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-line-strong bg-white/[0.03] px-3.5 text-sm font-medium text-ink transition hover:bg-white/[0.07]"
              >
                <Download className="size-4" aria-hidden /> Baixar
              </a>
              {clip.status !== "approved" ? (
                <Button icon={RefreshCw} onClick={render} loading={busy === "render"}>
                  Refazer edição
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function ClipsView() {
  const [filter, setFilter] = useState<ClipStatus | "all">("all");
  const [jobsKey, setJobsKey] = useState(0);
  const path = filter === "all" ? "/clips?limit=100" : `/clips?limit=100&status=${filter}`;
  const { data, error, reload } = useApi<Page<Clip>>(path, {
    pollMs: (d) => (d?.items.some((c) => c.status === "rendering") ? 2000 : undefined),
  });
  const jobStarted = useCallback(() => setJobsKey((k) => k + 1), []);

  return (
    <>
      <PageHeader
        title="Clips"
        description="Os melhores momentos encontrados pela IA. Gere o vídeo vertical (9:16) com legenda, zoom e áudio ajustado, e envie para aprovação."
      />

      <div className="animate-fade-in mb-6 flex gap-3 rounded-2xl border border-accent/20 bg-gradient-to-r from-accent/[0.07] to-violet/[0.05] p-4 text-sm">
        <Sparkles className="mt-0.5 size-5 shrink-0 text-accent-soft" aria-hidden />
        <div className="text-ink-muted">
          <p>
            <span className="font-medium text-ink">Como funciona:</span> em{" "}
            <Link href="/lives" className="text-accent-soft hover:text-ink">
              Lives
            </Link>
            , transcreva uma gravação e clique em{" "}
            <span className="text-ink">Encontrar melhores momentos</span>. As sugestões aparecem
            aqui; <span className="text-ink">Gerar vídeo</span> cria o corte pronto, que segue para
            aprovação. Nada é publicado sem você aprovar.
          </p>
          <p className="mt-1 text-xs text-ink-faint">
            A edição automática é uma prévia da Fase 5 (formato, legendas, zoom e áudio). Ajustes
            finos de enquadramento e estilo chegam na Fase 5.
          </p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
        <Card
          title="Biblioteca de cortes"
          icon={Scissors}
          action={
            data ? <span className="text-xs text-ink-faint">{data.total} no total</span> : null
          }
        >
          <div role="tablist" aria-label="Filtrar por status" className="mb-5 flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                role="tab"
                aria-selected={filter === f.value}
                onClick={() => setFilter(f.value)}
                className={cx(
                  "rounded-full border px-3 py-1 text-xs font-medium transition",
                  filter === f.value
                    ? "border-accent/40 bg-accent/15 text-ink"
                    : "border-line text-ink-muted hover:border-line-strong hover:text-ink",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          {error ? (
            <ErrorState message={error.message} onRetry={reload} />
          ) : !data ? (
            <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="aspect-[9/16]" />
              ))}
            </div>
          ) : data.items.length === 0 ? (
            <EmptyState icon={Clapperboard} title="Nenhum corte aqui ainda">
              {filter === "all"
                ? "Analise uma live transcrita para a IA sugerir os melhores momentos."
                : "Nenhum corte com este status."}
            </EmptyState>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
              {data.items.map((clip) => (
                <ClipCard key={clip.id} clip={clip} onChanged={reload} onJobStarted={jobStarted} />
              ))}
            </div>
          )}
        </Card>
        <div className="xl:sticky xl:top-6 xl:self-start">
          <JobsPanel refreshKey={jobsKey} onSettled={reload} />
        </div>
      </div>
    </>
  );
}
