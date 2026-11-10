"use client";

import {
  AudioLines,
  Check,
  Copy,
  FileText,
  LoaderCircle,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

import { RecordingStatusBadge } from "@/components/status";
import { Button, Field, inputClass, cx } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { formatBytes, formatDate, formatDuration } from "@/lib/format";
import type { Job, Recording } from "@/lib/types";

import { TranscriptViewer } from "./transcript-viewer";

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-canvas/40 px-3 py-2">
      <dt className="text-[11px] text-ink-faint">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink">{value}</dd>
    </div>
  );
}

type Busy = "save" | "probe" | "delete" | "transcribe" | "analyze";

export function RecordingDrawer({
  recording,
  onClose,
  onChanged,
  onJobStarted,
}: {
  recording: Recording;
  onClose: () => void;
  onChanged: () => void;
  onJobStarted: (job: Job) => void;
}) {
  const [title, setTitle] = useState(recording.title);
  const [notes, setNotes] = useState(recording.notes ?? "");
  const [busy, setBusy] = useState<Busy | null>(null);
  const [audioTrack, setAudioTrack] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const dirty = title !== recording.title || notes !== (recording.notes ?? "");

  useEffect(() => {
    if (viewerOpen) return; // Escape closes the transcript viewer first
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, viewerOpen]);

  async function run(kind: Busy, action: () => Promise<void>) {
    setBusy(kind);
    setMessage(null);
    try {
      await action();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof ApiError ? err.message : "Erro inesperado." });
    } finally {
      setBusy(null);
    }
  }

  const save = (event: FormEvent) => {
    event.preventDefault();
    void run("save", async () => {
      await api.patch<Recording>(`/recordings/${recording.id}`, {
        title: title.trim(),
        notes: notes.trim() || null,
      });
      setMessage({ ok: true, text: "Alterações salvas." });
      onChanged();
    });
  };

  const probe = () =>
    run("probe", async () => {
      const job = await api.post<Job>(`/recordings/${recording.id}/probe`);
      onJobStarted(job);
      setMessage({ ok: true, text: "Leitura de metadados iniciada. Acompanhe em Tarefas." });
    });

  const remove = () =>
    run("delete", async () => {
      await api.delete(`/recordings/${recording.id}`);
      onChanged();
      onClose();
    });

  const transcribe = () =>
    run("transcribe", async () => {
      const job = await api.post<Job>(`/recordings/${recording.id}/transcribe`, {
        audio_track: audioTrack,
      });
      onJobStarted(job);
      setMessage({ ok: true, text: "Transcrição adicionada à fila. Acompanhe em Tarefas." });
    });

  const analyze = (mode: "ai" | "heuristic") =>
    run("analyze", async () => {
      const job = await api.post<Job>(`/recordings/${recording.id}/analyze`, { mode });
      onJobStarted(job);
      setMessage({
        ok: true,
        text: "Análise adicionada à fila. Os momentos encontrados aparecem em Clips.",
      });
    });

  async function copyPath() {
    try {
      await navigator.clipboard.writeText(recording.file_path);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setMessage({ ok: false, text: "Não foi possível copiar para a área de transferência." });
    }
  }

  const r = recording;
  const resolution = r.width && r.height ? `${r.width}×${r.height}` : "—";

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-title"
    >
      <button
        type="button"
        aria-label="Fechar detalhes"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <aside className="animate-fade-in absolute inset-y-0 right-0 flex w-full max-w-lg flex-col border-l border-line-strong bg-surface shadow-2xl shadow-black/60">
        <header className="flex items-start justify-between gap-3 border-b border-line p-5">
          <div className="min-w-0">
            <p className="text-xs text-ink-faint">Gravação #{r.id}</p>
            <h2 id="drawer-title" className="truncate text-lg font-semibold text-ink">
              {r.title}
            </h2>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <RecordingStatusBadge status={r.status} />
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-faint hover:bg-white/[0.06] hover:text-ink"
            aria-label="Fechar"
          >
            <X className="size-5" aria-hidden />
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          {!r.file_exists ? (
            <div className="flex gap-2 rounded-xl border border-bad/30 bg-bad/[0.06] p-3 text-xs text-bad">
              <TriangleAlert className="size-4 shrink-0" aria-hidden />
              Arquivo não encontrado no disco. O HD externo está conectado? O arquivo foi movido?
            </div>
          ) : r.error_message ? (
            <div className="flex gap-2 rounded-xl border border-warn/30 bg-warn/[0.06] p-3 text-xs text-warn">
              <TriangleAlert className="size-4 shrink-0" aria-hidden />
              {r.error_message}
            </div>
          ) : null}

          <form onSubmit={save} className="space-y-4">
            <Field label="Título" htmlFor="rec-title">
              <input
                id="rec-title"
                className={inputClass}
                value={title}
                maxLength={200}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
            <Field
              label="Anotações"
              htmlFor="rec-notes"
              hint="Ex.: personagens, eventos marcantes, horário de algo engraçado."
            >
              <textarea
                id="rec-notes"
                className={cx(inputClass, "h-24 resize-y py-2")}
                value={notes}
                maxLength={5000}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
            <div className="flex justify-end">
              <Button
                type="submit"
                variant="primary"
                icon={Save}
                loading={busy === "save"}
                disabled={!dirty || !title.trim()}
              >
                Salvar
              </Button>
            </div>
          </form>

          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-faint">
              Transcrição
            </h3>
            <div className="rounded-xl border border-line bg-canvas/40 p-3">
              {r.status === "transcribing" ? (
                <p className="flex items-center gap-2 text-sm text-accent-soft">
                  <LoaderCircle className="size-4 animate-spin" aria-hidden />
                  Transcrevendo… acompanhe o progresso em Tarefas.
                </p>
              ) : (
                <>
                  <p className="text-sm text-ink-muted">
                    {r.has_transcript
                      ? "Esta gravação já foi transcrita."
                      : r.audio_tracks === 0
                        ? "Esta gravação não tem áudio para transcrever."
                        : "Ainda não transcrita."}
                  </p>
                  {(r.audio_tracks ?? 0) > 1 ? (
                    <div className="mt-3">
                      <Field
                        label="Faixa de áudio"
                        htmlFor="rec-track"
                        hint="No OBS, a faixa 1 normalmente tem tudo misturado (jogo + microfone)."
                      >
                        <select
                          id="rec-track"
                          className={inputClass}
                          value={audioTrack}
                          onChange={(e) => setAudioTrack(Number(e.target.value))}
                        >
                          {Array.from({ length: r.audio_tracks ?? 1 }, (_, i) => (
                            <option key={i} value={i}>
                              Faixa {i + 1}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {r.has_transcript ? (
                      <Button variant="primary" icon={FileText} onClick={() => setViewerOpen(true)}>
                        Ver transcrição
                      </Button>
                    ) : null}
                    {r.audio_tracks !== 0 ? (
                      <Button
                        variant={r.has_transcript ? "secondary" : "primary"}
                        icon={AudioLines}
                        onClick={transcribe}
                        loading={busy === "transcribe"}
                        disabled={busy !== null || !r.file_exists}
                      >
                        {r.has_transcript ? "Transcrever novamente" : "Transcrever"}
                      </Button>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-faint">
              Melhores momentos
            </h3>
            <div className="rounded-xl border border-line bg-canvas/40 p-3">
              {r.status === "analyzing" ? (
                <p className="flex items-center gap-2 text-sm text-accent-soft">
                  <LoaderCircle className="size-4 animate-spin" aria-hidden />A IA está procurando
                  os melhores momentos… acompanhe em Tarefas.
                </p>
              ) : !r.has_transcript ? (
                <p className="text-sm text-ink-muted">
                  Transcreva a gravação primeiro: a IA encontra os momentos lendo o que foi falado.
                </p>
              ) : (
                <>
                  <p className="text-sm text-ink-muted">
                    {r.status === "analyzed"
                      ? "Já analisada. Analisar de novo substitui as sugestões não usadas; cortes já gerados são mantidos."
                      : "A IA lê a transcrição, mede a emoção do áudio e sugere os cortes com nota."}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      variant="primary"
                      icon={Sparkles}
                      onClick={() => analyze("ai")}
                      loading={busy === "analyze"}
                      disabled={busy !== null}
                    >
                      Encontrar melhores momentos
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => analyze("heuristic")}
                      disabled={busy !== null}
                      title="Usa só o volume do áudio e palavras-chave. Não precisa do Ollama."
                    >
                      Análise rápida (sem IA)
                    </Button>
                    {r.status === "analyzed" ? (
                      <Link
                        href="/clips"
                        className="inline-flex h-9 items-center gap-1 px-2 text-sm text-accent-soft hover:text-ink"
                      >
                        Ver cortes →
                      </Link>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-faint">
              Metadados
            </h3>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Meta label="Duração" value={formatDuration(r.duration_seconds)} />
              <Meta label="Resolução" value={resolution} />
              <Meta label="FPS" value={r.fps ? r.fps.toLocaleString("pt-BR") : "—"} />
              <Meta label="Tamanho" value={formatBytes(r.file_size_bytes)} />
              <Meta label="Vídeo" value={r.video_codec?.toUpperCase() ?? "—"} />
              <Meta
                label="Áudio"
                value={
                  r.audio_codec
                    ? `${r.audio_codec.toUpperCase()} · ${r.audio_tracks} faixa${r.audio_tracks === 1 ? "" : "s"}`
                    : r.audio_tracks === 0
                      ? "Sem áudio"
                      : "—"
                }
              />
              <Meta
                label="Taxa de bits"
                value={
                  r.bitrate_kbps
                    ? `${(r.bitrate_kbps / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} Mbps`
                    : "—"
                }
              />
              <Meta label="Gravada em" value={formatDate(r.recorded_at)} />
              <Meta label="Importada em" value={formatDate(r.created_at)} />
            </dl>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-faint">
              Arquivo
            </h3>
            <div className="flex items-center gap-2 rounded-xl border border-line bg-canvas/40 p-2 pl-3">
              <code className="min-w-0 flex-1 break-all font-mono text-xs text-ink-muted">
                {r.file_path}
              </code>
              <button
                type="button"
                onClick={copyPath}
                className="shrink-0 rounded-lg p-1.5 text-ink-faint hover:bg-white/[0.06] hover:text-ink"
                aria-label="Copiar caminho"
                title="Copiar caminho"
              >
                {copied ? <Check className="size-4 text-ok" /> : <Copy className="size-4" />}
              </button>
            </div>
          </section>

          {message ? (
            <p role="status" className={cx("text-sm", message.ok ? "text-ok" : "text-bad")}>
              {message.text}
              {!message.ok && message.text.includes("Configurações") ? (
                <Link
                  href="/configuracoes"
                  className="ml-1 text-accent-soft underline hover:text-ink"
                >
                  Abrir Configurações
                </Link>
              ) : null}
            </p>
          ) : null}
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-line p-4">
          <Button
            icon={RefreshCw}
            onClick={probe}
            loading={busy === "probe"}
            disabled={busy !== null}
          >
            Reler metadados
          </Button>
          <div className="ml-auto flex items-center gap-2">
            {confirmDelete ? (
              <>
                <span className="text-xs text-ink-muted">Remover? O vídeo continua no disco.</span>
                <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                  Não
                </Button>
                <Button
                  icon={Trash2}
                  onClick={remove}
                  loading={busy === "delete"}
                  className="border-bad/40 text-bad hover:bg-bad/10"
                >
                  Sim, remover
                </Button>
              </>
            ) : (
              <Button
                variant="ghost"
                icon={Trash2}
                onClick={() => setConfirmDelete(true)}
                disabled={busy !== null}
                className="hover:text-bad"
              >
                Remover da biblioteca
              </Button>
            )}
          </div>
        </footer>
      </aside>
      {viewerOpen ? (
        <TranscriptViewer recordingId={r.id} title={r.title} onClose={() => setViewerOpen(false)} />
      ) : null}
    </div>
  );
}
