"use client";

import { Download, FileText, Search, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";

import { ErrorState, Skeleton, cx, inputClass } from "@/components/ui";
import { formatDate, formatDuration } from "@/lib/format";
import type { Transcript } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const LANGUAGES: Record<string, string> = { pt: "Português", en: "Inglês", es: "Espanhol" };
const EXPORTS = [
  { format: "srt", label: "SRT", hint: "Legenda para editores de vídeo" },
  { format: "vtt", label: "VTT", hint: "Legenda para web" },
  { format: "txt", label: "TXT", hint: "Texto com horários" },
] as const;

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  // Accent-insensitive match: "helicoptero" finds "helicóptero".
  const haystack = normalize(text);
  const needle = normalize(query);
  const parts: Array<{ text: string; hit: boolean }> = [];
  let index = 0;
  while (index < text.length) {
    const found = haystack.indexOf(needle, index);
    if (found === -1 || needle.length === 0) {
      parts.push({ text: text.slice(index), hit: false });
      break;
    }
    if (found > index) parts.push({ text: text.slice(index, found), hit: false });
    parts.push({ text: text.slice(found, found + needle.length), hit: true });
    index = found + needle.length;
  }
  return (
    <>
      {parts.map((p, i) =>
        p.hit ? (
          <mark key={i} className="rounded bg-violet/30 px-0.5 text-ink">
            {p.text}
          </mark>
        ) : (
          <Fragment key={i}>{p.text}</Fragment>
        ),
      )}
    </>
  );
}

export function TranscriptViewer({
  recordingId,
  title,
  onClose,
}: {
  recordingId: number;
  title: string;
  onClose: () => void;
}) {
  const { data, error, reload } = useApi<Transcript>(`/recordings/${recordingId}/transcript`);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const trimmed = query.trim();
  const visible = useMemo(() => {
    if (!data) return [];
    if (!trimmed) return data.segments;
    const needle = normalize(trimmed);
    return data.segments.filter((s) => normalize(s.text).includes(needle));
  }, [data, trimmed]);

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center p-2 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="transcript-title"
    >
      <button
        type="button"
        aria-label="Fechar transcrição"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="animate-fade-in relative flex h-full max-h-[52rem] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-2xl shadow-black/60">
        <header className="flex items-start gap-3 border-b border-line p-5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-accent/25 to-violet/20">
            <FileText className="size-5 text-accent-soft" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-ink-faint">Transcrição</p>
            <h2 id="transcript-title" className="truncate text-lg font-semibold text-ink">
              {title}
            </h2>
            {data ? (
              <p className="mt-0.5 text-xs text-ink-muted">
                {data.segment_count} trechos · {data.word_count.toLocaleString("pt-BR")} palavras ·{" "}
                {LANGUAGES[data.language ?? ""] ?? data.language ?? "—"} · modelo {data.model} ·
                faixa de áudio {data.audio_track + 1}
                {data.processing_seconds
                  ? ` · processada em ${formatDuration(data.processing_seconds)}`
                  : ""}{" "}
                · {formatDate(data.created_at)}
              </p>
            ) : null}
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

        <div className="flex flex-col gap-2 border-b border-line px-5 py-3 sm:flex-row sm:items-center">
          <label className="relative flex-1">
            <span className="sr-only">Buscar na transcrição</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
              aria-hidden
            />
            <input
              type="search"
              className={cx(inputClass, "pl-9")}
              placeholder="Buscar palavras na live… (ex.: polícia, helicóptero)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              maxLength={100}
            />
          </label>
          <div className="flex gap-1.5">
            {EXPORTS.map((e) => (
              <a
                key={e.format}
                href={`/api/recordings/${recordingId}/transcript/export?format=${e.format}`}
                download
                title={e.hint}
                className={cx(
                  "inline-flex h-9 items-center gap-1.5 rounded-xl border border-line-strong bg-white/[0.03] px-3 text-sm font-medium text-ink transition hover:bg-white/[0.07]",
                  !data && "pointer-events-none opacity-45",
                )}
                aria-disabled={!data}
              >
                <Download className="size-3.5" aria-hidden />
                {e.label}
              </a>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {error ? (
            <ErrorState message={error.message} onRetry={reload} />
          ) : !data ? (
            <div className="space-y-2">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-6" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink-muted">
              {trimmed
                ? `Nenhum trecho contém “${trimmed}”.`
                : "A transcrição está vazia (nenhuma fala detectada)."}
            </p>
          ) : (
            <>
              {trimmed ? (
                <p className="mb-2 text-xs text-ink-faint">
                  {visible.length} trecho{visible.length === 1 ? "" : "s"} encontrado
                  {visible.length === 1 ? "" : "s"}
                </p>
              ) : null}
              <ol className="space-y-1">
                {visible.map((s) => (
                  <li
                    key={s.position}
                    className="flex gap-4 rounded-lg px-2 py-1.5 hover:bg-white/[0.03]"
                  >
                    <span className="w-16 shrink-0 pt-px font-mono text-xs tabular-nums text-accent-soft">
                      {formatDuration(s.start_seconds)}
                    </span>
                    <span className="text-sm leading-relaxed text-ink">
                      <Highlight text={s.text} query={trimmed} />
                    </span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
