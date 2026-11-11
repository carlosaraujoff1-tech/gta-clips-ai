"use client";

import { Download, Send } from "lucide-react";

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
import { formatDate } from "@/lib/format";
import type { Page, Publication } from "@/lib/types";
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
