"use client";

import { CircleCheck, CircleX, Download, Pencil, Scissors, Send, ShieldCheck } from "lucide-react";
import { useState } from "react";

import {
  ClipStatusBadge,
  CLIP_STATUS_LABEL,
  PLATFORM_LABEL,
  PublicationStatusBadge,
} from "@/components/status";
import {
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  PhaseNotice,
  PlannedButton,
  Skeleton,
  cx,
} from "@/components/ui";
import { formatDate, formatDuration } from "@/lib/format";
import type { Clip, ClipStatus, Page, Publication } from "@/lib/types";
import { useApi } from "@/lib/use-api";

function LoadingRows() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-12" />
      ))}
    </div>
  );
}

function TotalLabel({ total }: { total: number }) {
  return <span className="text-xs text-ink-faint">{total} no total</span>;
}

/* ------------------------------------------------------------------ Clips */

const CLIP_FILTERS: Array<{ value: ClipStatus | "all"; label: string }> = [
  { value: "all", label: "Todos" },
  ...(["pending_review", "approved", "rejected", "draft"] as const).map((value) => ({
    value,
    label: CLIP_STATUS_LABEL[value],
  })),
];

function ClipCard({ clip }: { clip: Clip }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface/60 p-4 transition hover:border-line-strong">
      <div className="grid aspect-[9/16] max-h-56 place-items-center rounded-lg bg-gradient-to-br from-accent/10 to-violet/10">
        <Scissors className="size-6 text-ink-faint" aria-hidden />
      </div>
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-sm font-medium text-ink">{clip.title}</p>
        {clip.score !== null ? (
          <span className="shrink-0 rounded-md bg-violet/15 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-violet-soft">
            {Math.round(clip.score)}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-faint">
        <span className="tabular-nums">
          {formatDuration(clip.end_seconds - clip.start_seconds)}
        </span>
        {clip.category ? <span>· {clip.category}</span> : null}
        <span className="ml-auto">
          <ClipStatusBadge status={clip.status} />
        </span>
      </div>
    </div>
  );
}

export function ClipsView() {
  const [filter, setFilter] = useState<ClipStatus | "all">("all");
  const path = filter === "all" ? "/clips?limit=100" : `/clips?limit=100&status=${filter}`;
  const { data, error, reload } = useApi<Page<Clip>>(path);

  return (
    <>
      <PageHeader
        title="Clips"
        description="Biblioteca de cortes gerados automaticamente a partir das suas lives, já no formato vertical 9:16."
      />
      <PhaseNotice phase={4} title="Geração de cortes">
        A IA vai identificar os melhores momentos (Fase 4) e o FFmpeg vai renderizar os cortes
        verticais com legendas e enquadramento (Fase 5).
      </PhaseNotice>
      <Card
        title="Biblioteca"
        icon={Scissors}
        action={data ? <TotalLabel total={data.total} /> : null}
      >
        <div role="tablist" aria-label="Filtrar por status" className="mb-5 flex flex-wrap gap-2">
          {CLIP_FILTERS.map((f) => (
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
          <LoadingRows />
        ) : data.items.length === 0 ? (
          <EmptyState icon={Scissors} title="Nenhum corte encontrado">
            {filter === "all"
              ? "Os cortes gerados pela IA aparecerão aqui."
              : `Não há cortes com status “${CLIP_FILTERS.find((f) => f.value === filter)?.label}”.`}
          </EmptyState>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {data.items.map((clip) => (
              <ClipCard key={clip.id} clip={clip} />
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

/* --------------------------------------------------------------- Approval */

export function ApprovalView() {
  const { data, error, reload } = useApi<Page<Clip>>("/clips?limit=100&status=pending_review");
  return (
    <>
      <PageHeader
        title="Aprovação"
        description="Assista, aprove ou rejeite cada corte. Nada é publicado sem a sua aprovação explícita."
      />
      <div className="animate-fade-in mb-6 flex gap-3 rounded-2xl border border-ok/25 bg-ok/[0.05] p-4 text-sm">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-ok" aria-hidden />
        <p className="text-ink-muted">
          <span className="font-medium text-ink">Regra do sistema:</span> nenhum corte é publicado
          automaticamente. Todo conteúdo passa por esta tela e só segue para publicação depois que
          você aprovar.
        </p>
      </div>
      <PhaseNotice phase={6} title="Player e revisão de cortes">
        Vai incluir player de vídeo, aprovação, rejeição e edição de título, descrição e trecho.
      </PhaseNotice>
      <Card
        title="Aguardando aprovação"
        icon={CircleCheck}
        action={data ? <TotalLabel total={data.total} /> : null}
      >
        {error ? (
          <ErrorState message={error.message} onRetry={reload} />
        ) : !data ? (
          <LoadingRows />
        ) : data.items.length === 0 ? (
          <EmptyState icon={CircleCheck} title="Nenhum corte aguardando aprovação">
            Quando houver cortes renderizados, eles aparecerão aqui para sua revisão.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {data.items.map((clip) => (
              <li key={clip.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{clip.title}</p>
                  <p className="text-xs text-ink-faint">
                    {formatDuration(clip.end_seconds - clip.start_seconds)} · gerado em{" "}
                    {formatDate(clip.created_at)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <PlannedButton icon={Pencil} phase={6}>
                    Editar
                  </PlannedButton>
                  <PlannedButton icon={CircleX} phase={6}>
                    Rejeitar
                  </PlannedButton>
                  <PlannedButton icon={CircleCheck} phase={6}>
                    Aprovar
                  </PlannedButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

/* ----------------------------------------------------------- Publications */

export function PublicationsView() {
  const { data, error, reload } = useApi<Page<Publication>>("/publications?limit=100");
  return (
    <>
      <PageHeader
        title="Publicações"
        description="Histórico de conteúdos publicados ou exportados para TikTok, YouTube Shorts e Instagram Reels."
        actions={
          <PlannedButton icon={Download} phase={7}>
            Exportar cortes aprovados
          </PlannedButton>
        }
      />
      <PhaseNotice phase={7} title="Publicação e exportação">
        A integração seguirá as APIs oficiais de cada rede e sempre exigirá aprovação prévia. A
        exportação manual de arquivos também estará disponível.
      </PhaseNotice>
      <Card title="Histórico" icon={Send} action={data ? <TotalLabel total={data.total} /> : null}>
        {error ? (
          <ErrorState message={error.message} onRetry={reload} />
        ) : !data ? (
          <LoadingRows />
        ) : data.items.length === 0 ? (
          <EmptyState icon={Send} title="Nenhuma publicação ainda">
            Os conteúdos publicados ou exportados aparecerão aqui, com data e link.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-ink-faint">
                <tr>
                  <th className="pb-3 font-medium">Corte</th>
                  <th className="pb-3 font-medium">Plataforma</th>
                  <th className="pb-3 font-medium">Data</th>
                  <th className="pb-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.items.map((p) => (
                  <tr key={p.id} className="text-ink-muted">
                    <td className="py-3 pr-4 text-ink">#{p.clip_id}</td>
                    <td className="py-3 pr-4">{PLATFORM_LABEL[p.platform]}</td>
                    <td className="py-3 pr-4">{formatDate(p.published_at ?? p.created_at)}</td>
                    <td className="py-3">
                      <PublicationStatusBadge status={p.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
