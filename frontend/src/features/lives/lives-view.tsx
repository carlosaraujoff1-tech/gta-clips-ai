"use client";

import {
  ArrowDownWideNarrow,
  AudioLines,
  Clock,
  FileVideo,
  FolderSearch,
  HardDrive,
  Search,
  TriangleAlert,
  Video,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { RecordingStatusBadge } from "@/components/status";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
  cx,
  inputClass,
} from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { formatBytes, formatDate, formatDuration } from "@/lib/format";
import type { Job, LibraryStats, Page, Recording, RecordingSort } from "@/lib/types";
import { useApi } from "@/lib/use-api";

import { ImportDialog } from "./import-dialog";
import { JobsPanel } from "./jobs-panel";
import { RecordingDrawer } from "./recording-drawer";

const SORTS: Array<{ value: RecordingSort; label: string }> = [
  { value: "recent", label: "Importadas recentemente" },
  { value: "recorded", label: "Data da gravação" },
  { value: "title", label: "Título (A–Z)" },
  { value: "duration", label: "Mais longas" },
  { value: "size", label: "Maiores arquivos" },
];

function formatHours(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  return `${(seconds / 3600).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
}

function StatsStrip({ stats }: { stats: LibraryStats | null }) {
  const items = [
    { icon: Video, label: "Gravações", value: stats ? String(stats.total) : null },
    {
      icon: Clock,
      label: "Duração total",
      value: stats ? formatHours(stats.total_duration_seconds) : null,
    },
    {
      icon: HardDrive,
      label: "Espaço ocupado",
      value: stats ? formatBytes(stats.total_size_bytes) : null,
    },
    {
      icon: TriangleAlert,
      label: "Sem metadados",
      value: stats ? String(stats.missing_metadata) : null,
      warn: (stats?.missing_metadata ?? 0) > 0,
    },
  ];
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map(({ icon: Icon, label, value, warn }) => (
        <div
          key={label}
          className="animate-fade-in flex items-center gap-3 rounded-2xl border border-line bg-card/70 px-4 py-3"
        >
          <Icon
            className={cx("size-4 shrink-0", warn ? "text-warn" : "text-accent-soft")}
            aria-hidden
          />
          <div className="min-w-0">
            <p className="text-[11px] text-ink-faint">{label}</p>
            {value === null ? (
              <Skeleton className="mt-1 h-5 w-12" />
            ) : (
              <p
                className={cx(
                  "text-base font-semibold tabular-nums",
                  warn ? "text-warn" : "text-ink",
                )}
              >
                {value}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function RecordingRow({ r, onOpen }: { r: Recording; onOpen: () => void }) {
  return (
    <tr className="cursor-pointer text-ink-muted transition hover:bg-white/[0.03]" onClick={onOpen}>
      <td className="py-3 pl-2 pr-4">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className="block max-w-[22rem] truncate text-left text-ink hover:text-accent-soft focus-visible:outline-2 focus-visible:outline-accent"
        >
          {r.title}
        </button>
        <span className="mt-0.5 flex flex-wrap gap-1.5">
          {!r.file_exists ? <Badge tone="bad">Arquivo não encontrado</Badge> : null}
          {r.file_exists && r.probed_at === null ? <Badge tone="warn">Sem metadados</Badge> : null}
        </span>
      </td>
      <td className="py-3 pr-4 tabular-nums">{formatDuration(r.duration_seconds)}</td>
      <td className="py-3 pr-4 tabular-nums whitespace-nowrap">
        {r.width && r.height ? `${r.width}×${r.height}` : "—"}
        {r.fps ? <span className="text-ink-faint"> · {Math.round(r.fps)} fps</span> : null}
      </td>
      <td className="py-3 pr-4 tabular-nums whitespace-nowrap">{formatBytes(r.file_size_bytes)}</td>
      <td className="py-3 pr-4 whitespace-nowrap">{formatDate(r.recorded_at)}</td>
      <td className="py-3 pr-2">
        <RecordingStatusBadge status={r.status} />
      </td>
    </tr>
  );
}

export function LivesView() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<RecordingSort>("recent");
  const [importOpen, setImportOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [jobsKey, setJobsKey] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  // Debounce the search box so typing doesn't fire a request per key.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const params = new URLSearchParams({ limit: "200", sort });
  if (search) params.set("search", search);
  const list = useApi<Page<Recording>>(`/recordings?${params.toString()}`);
  const stats = useApi<LibraryStats>("/recordings/stats");
  const { reload: reloadList } = list;
  const { reload: reloadStats } = stats;

  const refreshLibrary = useCallback(() => {
    reloadList();
    reloadStats();
  }, [reloadList, reloadStats]);

  // Re-fetch the task list right away so the new task shows up without waiting for the poll.
  const jobStarted = useCallback(() => setJobsKey((k) => k + 1), []);

  async function transcribePending() {
    setBulkBusy(true);
    setActionError(null);
    setActionInfo(null);
    try {
      const result = await api.post<{ queued: number; skipped: number }>(
        "/recordings/transcribe-pending",
      );
      setActionInfo(
        result.queued === 0
          ? "Nenhuma gravação pendente de transcrição."
          : `${result.queued} gravação(ões) adicionada(s) à fila de transcrição. Elas serão processadas uma por vez.`,
      );
      jobStarted();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Erro ao iniciar as transcrições.");
    } finally {
      setBulkBusy(false);
    }
  }

  async function scan() {
    setScanning(true);
    setActionError(null);
    try {
      await api.post<Job>("/imports/scan");
      jobStarted();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Erro ao iniciar a varredura.");
    } finally {
      setScanning(false);
    }
  }

  const selected = list.data?.items.find((r) => r.id === selectedId) ?? null;

  return (
    <>
      <PageHeader
        title="Lives"
        description="Importe e organize suas lives e gravações de GTA RP. Os vídeos ficam no HD externo; o sistema guarda só o caminho e os metadados."
        actions={
          <>
            <Button icon={AudioLines} onClick={transcribePending} loading={bulkBusy}>
              Transcrever pendentes
            </Button>
            <Button icon={FolderSearch} onClick={scan} loading={scanning}>
              Escanear pasta de originais
            </Button>
            <Button variant="primary" icon={FileVideo} onClick={() => setImportOpen(true)}>
              Importar arquivo
            </Button>
          </>
        }
      />

      {actionError ? (
        <div className="mb-4">
          <ErrorState message={actionError} />
          {actionError.includes("Configurações") ? (
            <Link
              href="/configuracoes"
              className="mt-2 inline-block text-xs text-accent-soft hover:text-ink"
            >
              Abrir Configurações →
            </Link>
          ) : null}
        </div>
      ) : null}

      {actionInfo ? (
        <p
          role="status"
          className="mb-4 rounded-xl border border-ok/25 bg-ok/[0.05] px-4 py-3 text-sm text-ok"
        >
          {actionInfo}
        </p>
      ) : null}

      <StatsStrip stats={stats.data} />

      <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
        <Card
          title="Gravações"
          icon={Video}
          action={
            list.data ? (
              <span className="text-xs text-ink-faint">{list.data.total} no total</span>
            ) : null
          }
        >
          <div className="mb-4 flex flex-col gap-2 sm:flex-row">
            <label className="relative flex-1">
              <span className="sr-only">Buscar gravações</span>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
                aria-hidden
              />
              <input
                type="search"
                className={cx(inputClass, "pl-9")}
                placeholder="Buscar por título, anotação ou nome do arquivo…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                maxLength={100}
              />
            </label>
            <label className="relative sm:w-60">
              <span className="sr-only">Ordenar por</span>
              <ArrowDownWideNarrow
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
                aria-hidden
              />
              <select
                className={cx(inputClass, "pl-9")}
                value={sort}
                onChange={(e) => setSort(e.target.value as RecordingSort)}
              >
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {list.error ? (
            <ErrorState message={list.error.message} onRetry={list.reload} />
          ) : !list.data ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : list.data.items.length === 0 ? (
            search ? (
              <EmptyState icon={Search} title="Nada encontrado">
                Nenhuma gravação corresponde a “{search}”.
              </EmptyState>
            ) : (
              <EmptyState icon={Video} title="Nenhuma gravação na biblioteca">
                Coloque seus vídeos na pasta de originais e clique em{" "}
                <span className="text-ink">Escanear pasta de originais</span>, ou use{" "}
                <span className="text-ink">Importar arquivo</span> para copiar um vídeo de outra
                pasta (ex.: a pasta do OBS).
              </EmptyState>
            )
          ) : (
            <div className="-mx-2 overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wider text-ink-faint">
                  <tr>
                    <th className="pb-3 pl-2 font-medium">Título</th>
                    <th className="pb-3 font-medium">Duração</th>
                    <th className="pb-3 font-medium">Resolução</th>
                    <th className="pb-3 font-medium">Tamanho</th>
                    <th className="pb-3 font-medium">Gravada em</th>
                    <th className="pb-3 pr-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {list.data.items.map((r) => (
                    <RecordingRow key={r.id} r={r} onOpen={() => setSelectedId(r.id)} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="xl:sticky xl:top-6 xl:self-start">
          <JobsPanel refreshKey={jobsKey} onSettled={refreshLibrary} />
        </div>
      </div>

      {importOpen ? (
        <ImportDialog
          onClose={() => setImportOpen(false)}
          onStarted={() => {
            setImportOpen(false);
            jobStarted();
          }}
        />
      ) : null}

      {selected ? (
        <RecordingDrawer
          key={selected.id}
          recording={selected}
          onClose={() => setSelectedId(null)}
          onChanged={refreshLibrary}
          onJobStarted={jobStarted}
        />
      ) : null}
    </>
  );
}
