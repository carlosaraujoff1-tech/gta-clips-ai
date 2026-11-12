"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "./ui";
import { MONTHS, WEEKDAYS, isoDate } from "@/lib/format";

export function Calendar({ value, onChange, isAvailable }: { value: string; onChange: (d: string) => void; isAvailable: (iso: string) => boolean }) {
  const today = new Date();
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const first = cursor.getDay();
  const daysIn = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const todayIso = isoDate(today);
  const canPrev = cursor > new Date(today.getFullYear(), today.getMonth(), 1);
  const maxMonth = new Date(today.getFullYear(), today.getMonth() + 2, 1);

  return (
    <div className="rounded-3xl border border-line bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <button aria-label="Mês anterior" disabled={!canPrev} onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} className="grid size-9 place-items-center rounded-full text-ink-2 hover:bg-card-2 disabled:opacity-30">
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-lg font-semibold capitalize">
          {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
        </span>
        <button aria-label="Próximo mês" disabled={cursor >= maxMonth} onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} className="grid size-9 place-items-center rounded-full text-ink-2 hover:bg-card-2 disabled:opacity-30">
          <ChevronRight className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] tracking-wider text-ink-3 uppercase">
        {WEEKDAYS.map((d) => (
          <span key={d} className="py-1">
            {d.slice(0, 1)}
          </span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {Array.from({ length: first }).map((_, i) => (
          <span key={`e${i}`} />
        ))}
        {Array.from({ length: daysIn }).map((_, i) => {
          const iso = isoDate(new Date(cursor.getFullYear(), cursor.getMonth(), i + 1));
          const past = iso < todayIso;
          const ok = !past && isAvailable(iso);
          const sel = iso === value;
          return (
            <button
              key={iso}
              disabled={!ok}
              onClick={() => onChange(iso)}
              className={cn(
                "relative aspect-square rounded-full text-sm transition",
                sel ? "bg-gradient-to-b from-gold-2 to-gold font-semibold text-void" : ok ? "text-ink hover:bg-card-2" : "text-ink-3/40",
                iso === todayIso && !sel && "ring-1 ring-gold-3",
              )}
            >
              {i + 1}
              {ok && !sel && <span className="absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-gold/70" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
