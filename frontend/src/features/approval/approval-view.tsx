"use client";

import {
  CircleCheck,
  CircleX,
  Download,
  Film,
  Keyboard,
  LoaderCircle,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  TriangleAlert,
  Undo2,
  Wand2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  PageHeader,
  Skeleton,
  cx,
  inputClass,
} from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { formatDate, formatDuration } from "@/lib/format";
import type { Clip, ClipCounts, Page, UserSettings } from "@/lib/types";
import { useApi } from "@/lib/use-api";

import { ClipEditor } from "../clips/clip-editor";

type Tab = "pending_review" | "approved" | "rejected";

const TABS: Array<{ value: Tab; label: string }> = [
  { value: "pending_review", label: "Aguardando" },
  { value: "approved", label: "Aprovados" },
  { value: "rejected", label: "Rejeitados" },
];

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
}

/* ------------------------------------------------------------ queue item */

function QueueItem({
  clip,
  active,
  onSelect,
}: {
  clip: Clip;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? "true" : undefined}
        className={cx(
          "flex w-full items-center gap-3 rounded-xl border p-2 text-left transition",
          active ? "border-accent/50 bg-accent/10" : "border-line hover:border-line-strong",
        )}
      >
        <span className="relative h-16 w-9 shrink-0 overflow-hidden rounded-md bg-canvas">
          {clip.has_thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element -- local API image
            <img
              src={`/api/clips/${clip.id}/thumbnail?v=${clip.rendered_at ?? ""}`}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <Film className="absolute inset-0 m-auto size-4 text-ink-faint" aria-hidden />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-ink">{clip.title}</span>
          <span className="block text-[11px] text-ink-faint">
            {formatDuration(clip.end_seconds - clip.start_seconds)} · {clip.recording_title}
          </span>
        </span>
        {clip.score !== null ? (
          <span className="shrink-0 rounded-md bg-violet/15 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-violet-soft">
            {Math.round(clip.score)}
          </span>
        ) : null}
      </button>
    </li>
  );
}

/* --------------------------------------------------------- review panel */

function ReviewPanel({
  clip,
  position,
  onChanged,
  onAdvance,
  onEdit,
  onJobStarted,
  rejecting,
  setRejecting,
}: {
  clip: Clip;
  position: string;
  onChanged: () => void;
  onAdvance: () => void;
  onEdit: () => void;
  onJobStarted: () => void;
  rejecting: boolean;
  setRejecting: (v: boolean) => void;
}) {
  const [title, setTitle] = useState(clip.title);
  const [description, setDescription] = useState(clip.description ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"save" | "approve" | "reject" | "reopen" | "render" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const rendering = clip.status === "rendering";
  const reviewing = clip.status === "pending_review" || clip.status === "draft";
  const titleChanged = title.trim() !== clip.title;
  const descChanged = description.trim() !== (clip.description ?? "");
  const canApprove = clip.status === "pending_review" && clip.has_video && !clip.render_outdated;

  async function run(kind: NonNullable<typeof busy>, action: () => Promise<void>) {
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

  const save = (renderAfter: boolean) =>
    run("save", async () => {
      await api.patch<Clip>(`/clips/${clip.id}`, {
        title: title.trim(),
        description: description.trim() || null,
      });
      if (renderAfter) {
        await api.post(`/clips/${clip.id}/render`);
        onJobStarted();
      }
      onChanged();
    });

  const approve = () =>
    run("approve", async () => {
      await api.post<Clip>(`/clips/${clip.id}/approve`);
      onChanged();
      onAdvance();
    });

  const reject = () =>
    run("reject", async () => {
      await api.post<Clip>(`/clips/${clip.id}/reject`, { reason: reason.trim() || null });
      setRejecting(false);
      setReason("");
      onChanged();
      onAdvance();
    });

  const reopen = () =>
    run("reopen", async () => {
      await api.post<Clip>(`/clips/${clip.id}/reopen`);
      onChanged();
      onAdvance();
    });

  const rerender = () =>
    run("render", async () => {
      await api.post(`/clips/${clip.id}/render`);
      onJobStarted();
      onChanged();
    });

  return (
    <div className="animate-fade-in grid gap-6 lg:grid-cols-[minmax(0,20rem)_1fr]">
      {/* ---------- player ---------- */}
      <div>
        <div className="relative mx-auto aspect-[9/16] max-h-[70vh] w-full overflow-hidden rounded-2xl border border-line bg-black">
          {clip.has_video && !rendering ? (
            <video
              key={`${clip.id}-${clip.rendered_at}`}
              className="h-full w-full object-contain"
              src={`/api/clips/${clip.id}/video`}
              poster={
                clip.has_thumbnail
                  ? `/api/clips/${clip.id}/thumbnail?v=${clip.rendered_at ?? ""}`
                  : undefined
              }
              controls
              playsInline
              preload="metadata"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              {rendering ? (
                <>
                  <LoaderCircle className="size-8 animate-spin text-accent-soft" aria-hidden />
                  <p className="text-sm text-ink-muted">Editando o corte…</p>
                </>
              ) : (
                <>
                  <Film className="size-8 text-ink-faint" aria-hidden />
                  <p className="text-sm text-ink-muted">
                    Este corte ainda não tem vídeo. Gere o vídeo para poder revisar.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
        <p className="mt-2 text-center text-xs text-ink-faint">{position}</p>
      </div>

      {/* ---------- details + actions ---------- */}
      <div className="min-w-0 space-y-5">
        <div className="flex flex-wrap items-center gap-1.5">
          {clip.category ? <Badge tone="violet">{clip.category}</Badge> : null}
          {clip.score !== null ? <Badge tone="accent">Nota {Math.round(clip.score)}</Badge> : null}
          {clip.source === "manual" ? <Badge>manual</Badge> : null}
          {clip.source === "heuristic" ? <Badge>sem IA</Badge> : null}
          {clip.status === "approved" ? <Badge tone="ok">Aprovado</Badge> : null}
          {clip.status === "rejected" ? <Badge tone="bad">Rejeitado</Badge> : null}
          <span className="text-xs text-ink-faint">
            {clip.recording_title} · {formatDuration(clip.start_seconds)}–
            {formatDuration(clip.end_seconds)}
            {clip.render_info ? ` · vídeo de ${Math.round(clip.render_info.duration)}s` : ""}
          </span>
        </div>

        {clip.render_outdated ? (
          <div className="flex flex-col gap-2 rounded-xl border border-warn/30 bg-warn/[0.06] p-3 text-sm text-warn sm:flex-row sm:items-center">
            <p className="flex flex-1 gap-2">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />A edição mudou depois
              do último vídeo. Gere o vídeo de novo para poder aprovar.
            </p>
            <Button icon={Wand2} onClick={rerender} loading={busy === "render"}>
              Refazer vídeo
            </Button>
          </div>
        ) : null}

        {clip.status === "approved" ? (
          <p className="rounded-xl border border-ok/25 bg-ok/[0.05] p-3 text-sm text-ok">
            Aprovado em {formatDate(clip.reviewed_at)}. A publicação só acontece por uma ação sua
            (Fase 7).
          </p>
        ) : null}
        {clip.status === "rejected" ? (
          <p className="rounded-xl border border-bad/25 bg-bad/[0.05] p-3 text-sm text-bad">
            Rejeitado em {formatDate(clip.reviewed_at)}
            {clip.reject_reason ? `: ${clip.reject_reason}` : "."}
          </p>
        ) : null}

        <Field
          label="Título (aparece no topo do vídeo)"
          htmlFor="review-title"
          hint={
            titleChanged && clip.has_video
              ? "O título está gravado no vídeo: ao mudar, o vídeo precisa ser refeito."
              : undefined
          }
        >
          <input
            id="review-title"
            className={inputClass}
            value={title}
            maxLength={120}
            disabled={clip.status === "approved" || rendering}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field
          label="Descrição da postagem"
          htmlFor="review-desc"
          hint={`${description.length}/2000 · texto e hashtags para usar ao publicar (não aparece no vídeo).`}
        >
          <textarea
            id="review-desc"
            className={cx(inputClass, "h-24 resize-y py-2")}
            value={description}
            maxLength={2000}
            disabled={clip.status === "approved" || rendering}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex.: Ele tentou fugir da polícia e deu tudo errado 😂 #gtarp #cortes"
          />
        </Field>
        {(titleChanged || descChanged) && clip.status !== "approved" ? (
          <div className="flex flex-wrap gap-2">
            <Button
              icon={Save}
              onClick={() => save(false)}
              loading={busy === "save"}
              disabled={!title.trim() || busy !== null}
            >
              Salvar
            </Button>
            {titleChanged && clip.has_video ? (
              <Button
                variant="primary"
                icon={Wand2}
                onClick={() => save(true)}
                disabled={!title.trim() || busy !== null}
              >
                Salvar e refazer vídeo
              </Button>
            ) : null}
          </div>
        ) : null}

        {clip.reason ? (
          <div className="rounded-xl border border-line bg-canvas/40 p-3 text-xs text-ink-muted">
            <p className="mb-1 font-medium text-ink">Por que este momento?</p>
            <p>{clip.reason}</p>
            {clip.hook ? <p className="mt-1 italic">Abertura: “{clip.hook}”</p> : null}
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-bad">
            {error}
          </p>
        ) : null}

        {/* ---------- actions ---------- */}
        {reviewing ? (
          <div className="space-y-3 border-t border-line pt-4">
            {rejecting ? (
              <div className="space-y-2 rounded-xl border border-bad/30 bg-bad/[0.05] p-3">
                <Field label="Motivo da rejeição (opcional)" htmlFor="reject-reason">
                  <input
                    id="reject-reason"
                    className={inputClass}
                    value={reason}
                    maxLength={500}
                    autoFocus
                    placeholder="Ex.: sem graça, áudio ruim, momento cortado no meio"
                    onChange={(e) => setReason(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void reject();
                      if (e.key === "Escape") setRejecting(false);
                    }}
                  />
                </Field>
                <div className="flex gap-2">
                  <Button
                    icon={CircleX}
                    onClick={reject}
                    loading={busy === "reject"}
                    className="border-bad/40 text-bad hover:bg-bad/10"
                  >
                    Confirmar rejeição
                  </Button>
                  <Button variant="ghost" onClick={() => setRejecting(false)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button
                  id="approve-shortcut"
                  variant="primary"
                  icon={CircleCheck}
                  onClick={approve}
                  loading={busy === "approve"}
                  disabled={!canApprove || busy !== null || titleChanged || descChanged}
                  title={
                    titleChanged || descChanged
                      ? "Salve as alterações antes de aprovar"
                      : !clip.has_video
                        ? "Gere o vídeo antes de aprovar"
                        : undefined
                  }
                >
                  Aprovar{" "}
                  <kbd className="ml-1 rounded border border-white/30 px-1 text-[10px]">A</kbd>
                </Button>
                <Button
                  icon={CircleX}
                  onClick={() => setRejecting(true)}
                  disabled={busy !== null || rendering}
                >
                  Rejeitar{" "}
                  <kbd className="ml-1 rounded border border-line-strong px-1 text-[10px]">R</kbd>
                </Button>
                <Button
                  icon={SlidersHorizontal}
                  onClick={onEdit}
                  disabled={busy !== null || rendering}
                >
                  Editar edição
                </Button>
                {clip.status === "draft" ? (
                  <Button icon={Wand2} onClick={rerender} loading={busy === "render"}>
                    Gerar vídeo
                  </Button>
                ) : null}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            {clip.has_video ? (
              <a
                href={`/api/clips/${clip.id}/video?download=true`}
                download
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-line-strong bg-white/[0.03] px-3.5 text-sm font-medium text-ink transition hover:bg-white/[0.07]"
              >
                <Download className="size-4" aria-hidden /> Baixar vídeo
              </a>
            ) : null}
            <Button icon={Undo2} onClick={reopen} loading={busy === "reopen"}>
              {clip.status === "approved" ? "Desfazer aprovação" : "Reabrir para revisão"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- view */

export function ApprovalView() {
  const [tab, setTab] = useState<Tab>("pending_review");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [editing, setEditing] = useState<Clip | null>(null);

  const counts = useApi<ClipCounts>("/clips/counts", { pollMs: 5000 });
  const list = useApi<Page<Clip>>(`/clips?limit=100&status=${tab}&sort=score`, {
    pollMs: (d) => (d?.items.some((c) => c.status === "rendering") ? 2000 : undefined),
  });
  const settings = useApi<UserSettings>("/settings");
  // A re-render moves a clip to "rendering" and back: show those in the current tab too.
  const rendering = useApi<Page<Clip>>("/clips?limit=50&status=rendering", {
    pollMs: (d) => (d && d.items.length > 0 ? 2000 : 8000),
  });

  const { reload: reloadList } = list;
  const { reload: reloadCounts } = counts;
  const { reload: reloadRendering } = rendering;
  const refresh = useCallback(() => {
    reloadList();
    reloadCounts();
    reloadRendering();
  }, [reloadList, reloadCounts, reloadRendering]);

  const items = useMemo(() => list.data?.items ?? [], [list.data]);
  const index = Math.max(
    0,
    items.findIndex((c) => c.id === selectedId),
  );
  const selected = items[index] ?? null;

  const select = useCallback((id: number) => {
    setSelectedId(id);
    setRejecting(false);
  }, []);

  const advance = useCallback(() => {
    // After approving/rejecting, jump to the next clip of the queue (or the previous one).
    const next = items[index + 1] ?? items[index - 1] ?? null;
    setSelectedId(next?.id ?? null);
    setRejecting(false);
  }, [items, index]);

  // Keyboard shortcuts (ignored while typing or with a dialog open).
  useEffect(() => {
    if (editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowRight" || e.key === "j") {
        const next = items[index + 1];
        if (next) select(next.id);
      } else if (e.key === "ArrowLeft" || e.key === "k") {
        const prev = items[index - 1];
        if (prev) select(prev.id);
      } else if (tab === "pending_review" && selected) {
        if (e.key === "r" || e.key === "R") setRejecting(true);
        if ((e.key === "a" || e.key === "A") && selected.status === "pending_review") {
          document.getElementById("approve-shortcut")?.click();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, items, index, selected, tab, select]);

  const c = counts.data;
  return (
    <>
      <PageHeader
        title="Aprovação"
        description="Assista, edite, aprove ou rejeite cada corte. Nada é publicado sem a sua aprovação explícita."
      />
      <div className="animate-fade-in mb-6 flex gap-3 rounded-2xl border border-ok/25 bg-ok/[0.05] p-4 text-sm">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-ok" aria-hidden />
        <p className="text-ink-muted">
          <span className="font-medium text-ink">Regra do sistema:</span> aprovar{" "}
          <span className="text-ink">não publica nada</span>. Só um corte aprovado, com vídeo pronto
          e atualizado, pode ser enviado para publicação (Fase 7), e sempre por uma ação separada
          sua.
        </p>
      </div>

      <div role="tablist" aria-label="Filtrar por decisão" className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={tab === t.value}
            onClick={() => {
              setTab(t.value);
              setSelectedId(null);
              setRejecting(false);
            }}
            className={cx(
              "rounded-full border px-3.5 py-1.5 text-sm font-medium transition",
              tab === t.value
                ? "border-accent/40 bg-accent/15 text-ink"
                : "border-line text-ink-muted hover:border-line-strong hover:text-ink",
            )}
          >
            {t.label}
            {c ? <span className="ml-1.5 tabular-nums text-ink-faint">{c[t.value]}</span> : null}
          </button>
        ))}
        {c && c.draft > 0 ? (
          <Link
            href="/clips"
            className="ml-auto self-center text-xs text-accent-soft hover:text-ink"
          >
            {c.draft} sugestão(ões) sem vídeo em Clips →
          </Link>
        ) : null}
      </div>

      {list.error ? (
        <ErrorState message={list.error.message} onRetry={list.reload} />
      ) : !list.data ? (
        <Skeleton className="h-96" />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={CircleCheck}
            title={
              tab === "pending_review"
                ? "Nenhum corte aguardando aprovação"
                : tab === "approved"
                  ? "Nenhum corte aprovado ainda"
                  : "Nenhum corte rejeitado"
            }
          >
            {tab === "pending_review" ? (
              <>
                Gere o vídeo das sugestões em{" "}
                <Link href="/clips" className="text-accent-soft hover:text-ink">
                  Clips
                </Link>{" "}
                e eles aparecem aqui para a sua revisão.
              </>
            ) : (
              "Os cortes que passarem por essa decisão aparecem aqui."
            )}
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[19rem_1fr]">
          <Card title="Fila" icon={CircleCheck} className="xl:max-h-[80vh] xl:overflow-y-auto">
            <ul className="space-y-2">
              {items.map((clip) => (
                <QueueItem
                  key={clip.id}
                  clip={clip}
                  active={clip.id === selected?.id}
                  onSelect={() => select(clip.id)}
                />
              ))}
            </ul>
          </Card>
          <Card>
            {selected ? (
              <ReviewPanel
                key={selected.id}
                clip={selected}
                position={`${index + 1} de ${items.length}`}
                onChanged={refresh}
                onAdvance={advance}
                onEdit={() => setEditing(selected)}
                onJobStarted={refresh}
                rejecting={rejecting}
                setRejecting={setRejecting}
              />
            ) : null}
            <p className="mt-6 flex items-center gap-2 border-t border-line pt-3 text-[11px] text-ink-faint">
              <Keyboard className="size-3.5" aria-hidden />
              Atalhos: <kbd>←</kbd>/<kbd>→</kbd> navegar · <kbd>A</kbd> aprovar · <kbd>R</kbd>{" "}
              rejeitar
            </p>
          </Card>
        </div>
      )}

      {rendering.data && rendering.data.items.length > 0 ? (
        <p className="mt-3 flex items-center gap-2 text-xs text-accent-soft" role="status">
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
          {rendering.data.items.length} vídeo(s) sendo refeito(s)…
        </p>
      ) : null}

      {editing && settings.data ? (
        <ClipEditor
          clip={editing}
          defaults={settings.data.render}
          onClose={() => setEditing(null)}
          onSaved={() => refresh()}
        />
      ) : null}
    </>
  );
}
