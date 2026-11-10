"use client";

import { Eraser, MousePointerSquareDashed } from "lucide-react";
import { useRef, useState, type PointerEvent } from "react";

import { Button, Field, inputClass } from "@/components/ui";
import type { Page, Recording, Region } from "@/lib/types";
import { useApi } from "@/lib/use-api";

function clamp(v: number) {
  return Math.min(1, Math.max(0, v));
}

/**
 * Lets the streamer draw where the webcam sits in the live (normalised 0-1 region).
 * Used by the "Câmera + jogo" layout.
 */
export function FacecamPicker({
  value,
  onChange,
}: {
  value: Region | null;
  onChange: (region: Region | null) => void;
}) {
  const recordings = useApi<Page<Recording>>("/recordings?limit=50&sort=recent");
  const usable = (recordings.data?.items ?? []).filter(
    (r) => r.file_exists && r.width && r.height && r.width >= r.height,
  );
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const rec = usable.find((r) => r.id === selectedId) ?? usable[0] ?? null;
  const [position, setPosition] = useState(0.3);
  const boxRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  function point(e: PointerEvent<HTMLDivElement>) {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: clamp((e.clientX - rect.left) / rect.width),
      y: clamp((e.clientY - rect.top) / rect.height),
    };
  }

  function onDown(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = point(e);
    setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  }
  function onMove(e: PointerEvent<HTMLDivElement>) {
    if (!drag) return;
    const p = point(e);
    setDrag({ ...drag, x1: p.x, y1: p.y });
  }
  function onUp() {
    if (!drag) return;
    const x = Math.min(drag.x0, drag.x1);
    const y = Math.min(drag.y0, drag.y1);
    const w = Math.abs(drag.x1 - drag.x0);
    const h = Math.abs(drag.y1 - drag.y0);
    setDrag(null);
    if (w > 0.03 && h > 0.03) {
      const r = (n: number) => Math.round(n * 1000) / 1000;
      onChange({ x: r(x), y: r(y), w: r(Math.min(w, 1 - x)), h: r(Math.min(h, 1 - y)) });
    }
  }

  const shown = drag
    ? {
        x: Math.min(drag.x0, drag.x1),
        y: Math.min(drag.y0, drag.y1),
        w: Math.abs(drag.x1 - drag.x0),
        h: Math.abs(drag.y1 - drag.y0),
      }
    : value;

  if (recordings.data && usable.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line-strong p-4 text-sm text-ink-muted">
        Importe uma live horizontal (16:9) para marcar onde fica a sua câmera.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
        <Field label="Live usada como referência" htmlFor="facecam-rec">
          <select
            id="facecam-rec"
            className={inputClass}
            value={rec?.id ?? ""}
            onChange={(e) => setSelectedId(Number(e.target.value))}
          >
            {usable.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Momento da live" htmlFor="facecam-t">
          <input
            id="facecam-t"
            type="range"
            min={0.02}
            max={0.98}
            step={0.01}
            value={position}
            onChange={(e) => setPosition(Number(e.target.value))}
            className="mt-3 w-full accent-violet"
          />
        </Field>
      </div>
      {rec ? (
        <div
          ref={boxRef}
          className="relative cursor-crosshair touch-none select-none overflow-hidden rounded-xl border border-line bg-black"
          style={{ aspectRatio: `${rec.width! / rec.height!}` }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          role="application"
          aria-label="Arraste um retângulo sobre a sua câmera"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- local API frame */}
          <img
            src={`/api/recordings/${rec.id}/frame?t=${((rec.duration_seconds ?? 10) * position).toFixed(1)}&width=960`}
            alt="Quadro da live"
            className="pointer-events-none h-full w-full object-contain"
            draggable={false}
          />
          {shown ? (
            <div
              className="pointer-events-none absolute border-2 border-violet bg-violet/15"
              style={{
                left: `${shown.x * 100}%`,
                top: `${shown.y * 100}%`,
                width: `${shown.w * 100}%`,
                height: `${shown.h * 100}%`,
              }}
            >
              <span className="absolute left-1 top-1 rounded bg-violet px-1.5 text-[11px] font-semibold text-white">
                câmera
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex flex-1 items-center gap-1.5 text-xs text-ink-faint">
          <MousePointerSquareDashed className="size-4" aria-hidden />
          Clique e arraste sobre a sua câmera. Ela vai para a parte de cima do vídeo vertical.
        </p>
        {value ? (
          <Button variant="ghost" icon={Eraser} onClick={() => onChange(null)}>
            Limpar
          </Button>
        ) : null}
      </div>
    </div>
  );
}
