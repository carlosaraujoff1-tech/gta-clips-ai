"use client";

import { Minus, Plus, Save, Wand2, X } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { Button, Field, cx, inputClass } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import type { Clip, ClipEdit, Job, Recording, RenderSettings, VerticalLayout } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const LAYOUTS: Array<{ value: VerticalLayout; label: string; hint: string }> = [
  { value: "blur", label: "Fundo desfocado", hint: "Gameplay central, mostra mais do jogo" },
  { value: "crop", label: "Tela cheia", hint: "Corte 9:16 do gameplay" },
  { value: "facecam", label: "Câmera + jogo", hint: "Sua câmera em cima, jogo embaixo" },
];

/** Aspect ratio (w/h) of the gameplay window each layout takes from the source. */
const TARGET_ASPECT: Record<VerticalLayout, number> = {
  blur: 4 / 3,
  crop: 9 / 16,
  facecam: 1080 / 1280,
};

function visibleArea(sourceAspect: number, layout: VerticalLayout, focus: number) {
  const target = TARGET_ASPECT[layout];
  if (sourceAspect > target) {
    const w = target / sourceAspect;
    return { x: (1 - w) * focus, y: 0, w, h: 1 };
  }
  const h = sourceAspect / target;
  return { x: 0, y: (1 - h) / 2, w: 1, h };
}

function TimeInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <Field label={label} htmlFor={id} hint={formatDuration(value)}>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="grid size-10 shrink-0 place-items-center rounded-xl border border-line-strong text-ink-muted hover:text-ink"
          onClick={() => onChange(Math.max(0, +(value - 0.5).toFixed(2)))}
          aria-label={`${label}: menos 0,5 segundo`}
        >
          <Minus className="size-4" aria-hidden />
        </button>
        <input
          id={id}
          type="number"
          step="any"
          min={0}
          className={cx(inputClass, "text-center tabular-nums")}
          value={value}
          onChange={(e) => onChange(Math.round(Number(e.target.value) * 100) / 100)}
        />
        <button
          type="button"
          className="grid size-10 shrink-0 place-items-center rounded-xl border border-line-strong text-ink-muted hover:text-ink"
          onClick={() => onChange(+(value + 0.5).toFixed(2))}
          aria-label={`${label}: mais 0,5 segundo`}
        >
          <Plus className="size-4" aria-hidden />
        </button>
      </div>
    </Field>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-canvas/40 p-3">
      <input
        type="checkbox"
        className="mt-0.5 size-4 accent-violet"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="block text-sm text-ink">{label}</span>
        <span className="block text-xs text-ink-faint">{hint}</span>
      </span>
    </label>
  );
}

export function ClipEditor({
  clip,
  defaults,
  onClose,
  onSaved,
}: {
  clip: Clip;
  defaults: RenderSettings;
  onClose: () => void;
  onSaved: (rendering: boolean) => void;
}) {
  const recording = useApi<Recording>(`/recordings/${clip.recording_id}`);
  const initial: ClipEdit = clip.edit ?? {
    layout: null,
    focus_x: 0.5,
    zoom: null,
    subtitles: true,
    jump_cuts: null,
  };
  const [title, setTitle] = useState(clip.title);
  const [start, setStart] = useState(clip.start_seconds);
  const [end, setEnd] = useState(clip.end_seconds);
  const [layout, setLayout] = useState<VerticalLayout>(initial.layout ?? defaults.layout);
  const [focus, setFocus] = useState(initial.focus_x);
  const [zoom, setZoom] = useState(initial.zoom ?? defaults.zoom);
  const [jumpCuts, setJumpCuts] = useState(initial.jump_cuts ?? defaults.jump_cuts);
  const [subtitles, setSubtitles] = useState(initial.subtitles);
  const [previewAt, setPreviewAt] = useState(0.3);
  const [frameTime, setFrameTime] = useState(
    clip.start_seconds + (clip.end_seconds - clip.start_seconds) * 0.3,
  );
  const [busy, setBusy] = useState<"save" | "render" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Debounce the preview frame so dragging the slider doesn't fire a request per pixel.
  useEffect(() => {
    const t = setTimeout(() => setFrameTime(start + Math.max(end - start, 0) * previewAt), 250);
    return () => clearTimeout(t);
  }, [start, end, previewAt]);

  const rec = recording.data;
  const portrait = rec?.width && rec.height ? rec.height > rec.width * 1.2 : false;
  const aspect = rec?.width && rec.height ? rec.width / rec.height : 16 / 9;
  const area = useMemo(
    () => (portrait ? { x: 0, y: 0, w: 1, h: 1 } : visibleArea(aspect, layout, focus)),
    [aspect, layout, focus, portrait],
  );
  const cam = layout === "facecam" && !portrait ? defaults.facecam : null;
  const duration = end - start;
  const maxEnd = clip.recording_duration ?? Infinity;
  const invalid =
    !title.trim() || duration < 3 || duration > 180 || start < 0 || end > maxEnd + 0.01;

  async function save(renderAfter: boolean, event?: FormEvent) {
    event?.preventDefault();
    setBusy(renderAfter ? "render" : "save");
    setError(null);
    try {
      await api.patch<Clip>(`/clips/${clip.id}`, {
        title: title.trim(),
        start_seconds: start,
        end_seconds: end,
        edit: {
          layout,
          focus_x: focus,
          zoom,
          subtitles,
          jump_cuts: jumpCuts,
        } satisfies ClipEdit,
      });
      if (renderAfter) await api.post<Job>(`/clips/${clip.id}/render`);
      onSaved(renderAfter);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro ao salvar.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-2 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="editor-title"
    >
      <button
        type="button"
        aria-label="Fechar editor"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <form
        onSubmit={(e) => save(false, e)}
        noValidate
        className="animate-fade-in relative flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-2xl shadow-black/60"
      >
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs text-ink-faint">Editar corte · {clip.recording_title}</p>
            <h2 id="editor-title" className="truncate text-lg font-semibold text-ink">
              {title || "Sem título"}
            </h2>
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

        <div className="grid flex-1 gap-6 overflow-y-auto p-5 lg:grid-cols-[1.3fr_1fr]">
          {/* ---------- preview ---------- */}
          <div className="space-y-3">
            <div
              className="relative overflow-hidden rounded-xl border border-line bg-black"
              style={{ aspectRatio: `${aspect}` }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- local API frame, not a static asset */}
              <img
                src={`/api/recordings/${clip.recording_id}/frame?t=${frameTime.toFixed(2)}&width=960`}
                alt="Quadro da gravação no ponto escolhido"
                className="h-full w-full object-contain"
              />
              {/* area outside the frame is dimmed */}
              <div
                className="pointer-events-none absolute border-2 border-accent shadow-[0_0_0_9999px_rgb(0_0_0/0.55)] transition-all duration-200"
                style={{
                  left: `${area.x * 100}%`,
                  top: `${area.y * 100}%`,
                  width: `${area.w * 100}%`,
                  height: `${area.h * 100}%`,
                }}
              />
              {cam ? (
                <div
                  className="pointer-events-none absolute border-2 border-violet bg-violet/10"
                  style={{
                    left: `${cam.x * 100}%`,
                    top: `${cam.y * 100}%`,
                    width: `${cam.w * 100}%`,
                    height: `${cam.h * 100}%`,
                  }}
                >
                  <span className="absolute left-1 top-1 rounded bg-violet px-1 text-[10px] font-semibold text-white">
                    câmera
                  </span>
                </div>
              ) : null}
            </div>
            <Field
              label="Ver quadro em"
              htmlFor="preview-at"
              hint={`${formatDuration(frameTime)} da live`}
            >
              <input
                id="preview-at"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={previewAt}
                onChange={(e) => setPreviewAt(Number(e.target.value))}
                className="w-full accent-violet"
              />
            </Field>
            {portrait ? (
              <p className="text-xs text-ink-muted">
                Esta gravação já é vertical: o vídeo inteiro é usado, sem recorte.
              </p>
            ) : (
              <p className="text-xs text-ink-faint">
                A área destacada é o que aparece no vídeo vertical.
                {layout === "facecam" && !defaults.facecam
                  ? " Marque a posição da sua câmera em Configurações para usar este layout."
                  : ""}
              </p>
            )}
          </div>

          {/* ---------- form ---------- */}
          <div className="space-y-5">
            <Field label="Título (aparece no topo do vídeo)" htmlFor="clip-title">
              <input
                id="clip-title"
                className={inputClass}
                value={title}
                maxLength={120}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <TimeInput id="clip-start" label="Início (s)" value={start} onChange={setStart} />
              <TimeInput id="clip-end" label="Fim (s)" value={end} onChange={setEnd} />
            </div>
            <p
              className={cx(
                "text-xs",
                duration < 3 || duration > 180 ? "text-bad" : "text-ink-faint",
              )}
            >
              Duração: {duration.toFixed(1).replace(".", ",")}s (entre 3 e 180 s)
            </p>

            <fieldset>
              <legend className="mb-2 text-xs font-medium text-ink-muted">Enquadramento</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {LAYOUTS.map((l) => (
                  <button
                    key={l.value}
                    type="button"
                    onClick={() => setLayout(l.value)}
                    aria-pressed={layout === l.value}
                    disabled={portrait}
                    className={cx(
                      "rounded-xl border p-2.5 text-left transition disabled:opacity-40",
                      layout === l.value
                        ? "border-accent/50 bg-accent/10"
                        : "border-line hover:border-line-strong",
                    )}
                  >
                    <span className="block text-sm text-ink">{l.label}</span>
                    <span className="block text-[11px] text-ink-faint">{l.hint}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <Field
              label="Foco horizontal"
              htmlFor="focus"
              hint="Arraste para mostrar mais à esquerda ou à direita do jogo."
            >
              <input
                id="focus"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={focus}
                disabled={portrait}
                onChange={(e) => setFocus(Number(e.target.value))}
                className="w-full accent-violet"
              />
            </Field>

            <div className="grid gap-2">
              <Toggle
                label="Cortar pausas (jump cuts)"
                checked={jumpCuts}
                onChange={setJumpCuts}
                hint="Remove silêncios sem som do jogo; deixa o ritmo mais rápido."
              />
              <Toggle
                label="Zoom e movimento"
                checked={zoom}
                onChange={setZoom}
                hint="Zoom lento, ou zoom alternado entre os cortes."
              />
              <Toggle
                label="Legendas"
                checked={subtitles}
                onChange={setSubtitles}
                hint="Legendas sincronizadas palavra por palavra."
              />
            </div>
          </div>
        </div>

        <footer className="flex flex-col gap-3 border-t border-line px-5 py-4 sm:flex-row sm:items-center">
          <p className="min-w-0 flex-1 text-sm text-bad" role="alert">
            {error}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              icon={Save}
              loading={busy === "save"}
              disabled={invalid || busy !== null}
            >
              Salvar
            </Button>
            <Button
              variant="primary"
              icon={Wand2}
              loading={busy === "render"}
              disabled={invalid || busy !== null}
              onClick={() => save(true)}
            >
              Salvar e gerar vídeo
            </Button>
          </div>
        </footer>
      </form>
    </div>
  );
}
