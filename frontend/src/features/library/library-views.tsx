"use client";

import { CircleCheck, CircleX, Download, Pencil, Send, ShieldCheck } from "lucide-react";

import { PLATFORM_LABEL, PublicationStatusBadge } from "@/components/status";
import {
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  PhaseNotice,
  PlannedButton,
  Skeleton,
} from "@/components/ui";
import { formatDate, formatDuration } from "@/lib/format";
import type { Clip, Page, Publication } from "@/lib/types";
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
