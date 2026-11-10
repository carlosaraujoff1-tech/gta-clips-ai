"use client";

import {
  ArrowRight,
  CircleCheck,
  Clock,
  HardDrive,
  Scissors,
  Send,
  Server,
  Video,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { RecordingStatusBadge, ServiceStateIcon } from "@/components/status";
import { Card, EmptyState, ErrorState, PageHeader, Skeleton, cx } from "@/components/ui";
import { formatBytes, formatDate, formatDuration } from "@/lib/format";
import type { DashboardSummary, SystemStatus } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const PHASES = [
  { n: 1, name: "Fundação" },
  { n: 2, name: "Importação" },
  { n: 3, name: "Transcrição" },
  { n: 4, name: "Inteligência artificial" },
  { n: 5, name: "Edição automática" },
  { n: 6, name: "Aprovação" },
  { n: 7, name: "Publicação" },
  { n: 8, name: "Métricas" },
] as const;
const CURRENT_PHASE = 3;

function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  accent,
}: {
  label: string;
  value: number | null;
  icon: LucideIcon;
  hint: string;
  accent: "accent" | "violet" | "warn" | "ok";
}) {
  const ring = {
    accent: "from-accent/25 text-accent-soft",
    violet: "from-violet/25 text-violet-soft",
    warn: "from-warn/20 text-warn",
    ok: "from-ok/20 text-ok",
  }[accent];
  return (
    <Card className="relative overflow-hidden transition hover:border-line-strong">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">{label}</p>
          {value === null ? (
            <Skeleton className="mt-3 h-8 w-14" />
          ) : (
            <p className="mt-2 text-3xl font-semibold tabular-nums text-ink">{value}</p>
          )}
        </div>
        <span className={cx("rounded-xl bg-gradient-to-br to-transparent p-2.5", ring)}>
          <Icon className="size-5" aria-hidden />
        </span>
      </div>
      <p className="mt-3 text-xs text-ink-muted">{hint}</p>
    </Card>
  );
}

function StorageCard({ summary }: { summary: DashboardSummary | null }) {
  const s = summary?.storage;
  const ready = s ? s.ready_folders === s.total_folders : false;
  return (
    <Card
      title="Armazenamento"
      icon={HardDrive}
      action={
        <Link
          href="/configuracoes"
          className="flex items-center gap-1 text-xs text-accent-soft hover:text-ink"
        >
          Configurar <ArrowRight className="size-3" aria-hidden />
        </Link>
      }
    >
      {!s ? (
        <Skeleton className="h-16" />
      ) : s.configured_folders === 0 ? (
        <p className="text-sm text-ink-muted">
          As pastas de vídeo ainda não foram configuradas. Defina onde ficam os originais, cortes e
          exportações (normalmente no HD externo).
        </p>
      ) : (
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-ink-muted">Pastas prontas</span>
            <span className={cx("font-medium tabular-nums", ready ? "text-ok" : "text-warn")}>
              {s.ready_folders} de {s.total_folders}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent to-violet transition-all"
              style={{ width: `${(s.ready_folders / s.total_folders) * 100}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-ink-muted">Espaço livre (pasta de cortes)</span>
            <span className="font-medium tabular-nums text-ink">
              {formatBytes(s.clips_free_bytes)}
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}

function ServicesCard() {
  const { data, error, reload } = useApi<SystemStatus>("/system/status");
  return (
    <Card
      title="Serviços"
      icon={Server}
      action={
        <Link
          href="/configuracoes#servicos"
          className="flex items-center gap-1 text-xs text-accent-soft hover:text-ink"
        >
          Detalhes <ArrowRight className="size-3" aria-hidden />
        </Link>
      }
    >
      {error ? (
        <ErrorState message={error.message} onRetry={reload} />
      ) : !data ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-5" />
          ))}
        </div>
      ) : (
        <ul className="space-y-2.5">
          {data.services.map((s) => (
            <li key={s.key} className="flex items-center gap-2.5 text-sm">
              <ServiceStateIcon state={s.state} />
              <span className="truncate text-ink">{s.name}</span>
              {s.version ? (
                <span className="ml-auto shrink-0 font-mono text-[11px] text-ink-faint">
                  {s.version}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function RoadmapCard() {
  return (
    <Card title="Progresso do projeto" icon={Clock}>
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PHASES.map(({ n, name }) => {
          const state = n < CURRENT_PHASE ? "done" : n === CURRENT_PHASE ? "current" : "next";
          return (
            <li
              key={n}
              className={cx(
                "rounded-xl border px-3 py-2.5 text-xs",
                state === "current"
                  ? "border-accent/40 bg-gradient-to-br from-accent/15 to-violet/10"
                  : state === "done"
                    ? "border-ok/25 bg-ok/[0.05]"
                    : "border-line bg-surface/40",
              )}
            >
              <span
                className={cx(
                  "block font-semibold",
                  state === "next" ? "text-ink-faint" : "text-ink",
                )}
              >
                Fase {n}
              </span>
              <span className={state === "next" ? "text-ink-faint" : "text-ink-muted"}>{name}</span>
              {state === "current" ? (
                <span className="mt-1 block text-[10px] font-medium uppercase tracking-wider text-accent-soft">
                  Em andamento
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

export function DashboardView() {
  const { data, error, reload } = useApi<DashboardSummary>("/dashboard/summary");
  const c = data?.counts ?? null;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Visão geral das suas lives, cortes gerados, aprovações pendentes e publicações."
      />

      {error ? (
        <div className="mb-6">
          <ErrorState message={error.message} onRetry={reload} />
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Lives"
          value={c?.recordings ?? null}
          icon={Video}
          accent="accent"
          hint="Gravações importadas"
        />
        <StatCard
          label="Cortes"
          value={c?.clips ?? null}
          icon={Scissors}
          accent="violet"
          hint="Gerados pela IA"
        />
        <StatCard
          label="Pendentes"
          value={c?.pending_review ?? null}
          icon={CircleCheck}
          accent="warn"
          hint="Aguardando sua aprovação"
        />
        <StatCard
          label="Publicações"
          value={c?.publications ?? null}
          icon={Send}
          accent="ok"
          hint="Publicadas ou exportadas"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Lives recentes" icon={Video} className="lg:col-span-2">
          {!data ? (
            <Skeleton className="h-28" />
          ) : data.recent_recordings.length === 0 ? (
            <EmptyState icon={Video} title="Nenhuma live importada ainda">
              <Link href="/lives" className="text-accent-soft hover:text-ink">
                Importe sua primeira gravação →
              </Link>
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {data.recent_recordings.map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-3 text-sm">
                  <span className="truncate text-ink">{r.title}</span>
                  <span className="ml-auto shrink-0 text-xs text-ink-faint">
                    {formatDuration(r.duration_seconds)} · {formatDate(r.created_at)}
                  </span>
                  <RecordingStatusBadge status={r.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <StorageCard summary={data} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RoadmapCard />
        </div>
        <ServicesCard />
      </div>
    </>
  );
}
