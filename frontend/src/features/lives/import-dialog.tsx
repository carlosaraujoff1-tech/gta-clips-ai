"use client";

import { FileVideo, Info, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Button, Field, inputClass, cx } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { Job } from "@/lib/types";

export function ImportDialog({
  onClose,
  onStarted,
}: {
  onClose: () => void;
  onStarted: (job: Job) => void;
}) {
  const [path, setPath] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const sourcePath = path.trim().replace(/^"+|"+$/g, "");
    if (!sourcePath) return;
    setSubmitting(true);
    setError(null);
    try {
      const job = await api.post<Job>("/imports/file", { source_path: sourcePath });
      onStarted(job);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro ao iniciar a importação.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-title"
    >
      <button
        type="button"
        aria-label="Fechar"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <form
        onSubmit={submit}
        className="animate-fade-in relative w-full max-w-xl rounded-2xl border border-line-strong bg-surface p-6 shadow-2xl shadow-black/50"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-accent/25 to-violet/20">
              <FileVideo className="size-5 text-accent-soft" aria-hidden />
            </span>
            <div>
              <h2 id="import-title" className="text-base font-semibold text-ink">
                Importar gravação
              </h2>
              <p className="text-xs text-ink-muted">O vídeo é copiado para a pasta de originais.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-faint hover:bg-white/[0.06] hover:text-ink"
            aria-label="Fechar"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <Field
          label="Caminho completo do arquivo"
          htmlFor="import-path"
          hint="Formatos: .mp4, .mkv, .mov, .flv, .ts, .m2ts, .mpg, .mpeg, .webm, .avi, .m4v"
        >
          <input
            ref={inputRef}
            id="import-path"
            className={cx(inputClass, "font-mono text-[13px]")}
            placeholder="D:\OBS\2026-11-10 20-15-33.mkv"
            value={path}
            onChange={(e) => {
              setPath(e.target.value);
              setError(null);
            }}
            spellCheck={false}
            autoComplete="off"
          />
        </Field>

        <div className="mt-4 flex gap-3 rounded-xl border border-accent/20 bg-accent/[0.05] p-3 text-xs text-ink-muted">
          <Info className="mt-0.5 size-4 shrink-0 text-accent-soft" aria-hidden />
          <div className="space-y-1">
            <p>
              <span className="text-ink">Dica:</span> no Explorador de Arquivos, segure{" "}
              <kbd className="rounded border border-line-strong px-1 font-mono text-ink">Shift</kbd>
              , clique com o botão direito no vídeo e escolha{" "}
              <span className="text-ink">“Copiar como caminho”</span>. Depois cole aqui.
            </p>
            <p>
              O arquivo original <span className="text-ink">nunca é movido nem apagado</span>. Para
              registrar vários vídeos de uma vez, coloque-os na pasta de originais e use{" "}
              <span className="text-ink">Escanear pasta</span>.
            </p>
          </div>
        </div>

        {error ? (
          <p role="alert" className="mt-4 text-sm text-bad">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="primary"
            icon={FileVideo}
            loading={submitting}
            disabled={!path.trim()}
          >
            Importar
          </Button>
        </div>
      </form>
    </div>
  );
}
