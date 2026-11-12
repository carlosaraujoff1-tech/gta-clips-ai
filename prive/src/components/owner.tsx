"use client";

import { useState } from "react";
import { Inbox } from "lucide-react";

import { Avatar } from "./art";
import { BookingStatusBadge } from "./booking-status";
import { Button, Card, Chip, Empty, cn } from "./ui";
import { bookingsForOwner, setBookingStatus, userName } from "@/lib/db";
import { WEEKDAYS_LONG, longDate } from "@/lib/format";
import type { DB, User, WeeklySlot } from "@/lib/types";

export function Requests({ db, me }: { db: DB; me: User }) {
  const [filter, setFilter] = useState<"requested" | "accepted" | "all">("requested");
  const all = bookingsForOwner(db, me).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const list = filter === "all" ? all : all.filter((b) => b.status === filter);
  return (
    <>
      <div className="mb-4 flex gap-2">
        <Chip active={filter === "requested"} onClick={() => setFilter("requested")}>
          Pendentes
        </Chip>
        <Chip active={filter === "accepted"} onClick={() => setFilter("accepted")}>
          Confirmadas
        </Chip>
        <Chip active={filter === "all"} onClick={() => setFilter("all")}>
          Todas
        </Chip>
      </div>
      {list.length === 0 ? (
        <Empty icon={<Inbox className="size-5" />} title="Nada por aqui" />
      ) : (
        <ul className="space-y-3">
          {list.map((b) => {
            const client = db.users.find((u) => u.id === b.clientId);
            return (
              <li key={b.id} className="rounded-3xl border border-line bg-card p-4">
                <div className="flex items-center gap-3">
                  <Avatar hue={client?.hue ?? 0} name={client?.name ?? "?"} size={40} />
                  <div className="flex-1">
                    <p className="text-[15px]">{userName(db, b.clientId)}</p>
                    <p className="text-xs text-ink-3">
                      {longDate(b.date)} · {b.time} · {b.durationMin / 60}h
                    </p>
                  </div>
                  <BookingStatusBadge status={b.status} />
                </div>
                {b.establishmentId && <p className="mt-2 text-xs text-ink-3">{db.establishments.find((e) => e.id === b.establishmentId)?.name}</p>}
                {b.note && <p className="mt-3 text-sm text-ink-2 italic">“{b.note}”</p>}
                {b.status === "requested" && (
                  <div className="mt-4 flex gap-2">
                    <Button variant="ghost" className="h-10 flex-1" onClick={() => setBookingStatus(b.id, "declined")}>
                      Recusar
                    </Button>
                    <Button className="h-10 flex-1" onClick={() => setBookingStatus(b.id, "accepted")}>
                      Confirmar
                    </Button>
                  </div>
                )}
                {b.status === "accepted" && (
                  <div className="mt-4 flex gap-2">
                    <Button variant="ghost" className="h-10 flex-1" onClick={() => setBookingStatus(b.id, "cancelled")}>
                      Cancelar
                    </Button>
                    <Button variant="outline" className="h-10 flex-1" onClick={() => setBookingStatus(b.id, "completed")}>
                      Marcar como concluída
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-5 text-center text-[11px] text-ink-3">Você pode recusar ou cancelar qualquer solicitação, a qualquer momento, sem justificativa.</p>
    </>
  );
}

export function WeeklyEditor({ value, onChange }: { value: WeeklySlot[]; onChange: (v: WeeklySlot[]) => void }) {
  return (
    <Card className="divide-y divide-line px-4">
      {WEEKDAYS_LONG.map((d, wd) => {
        const slot = value.find((s) => s.weekday === wd);
        return (
          <div key={d} className="flex items-center gap-3 py-3">
            <button
              onClick={() => onChange(slot ? value.filter((s) => s.weekday !== wd) : [...value, { weekday: wd, start: "18:00", end: "23:00" }])}
              className={cn("w-[88px] shrink-0 rounded-full border px-3 py-1.5 text-left text-sm transition", slot ? "border-gold/50 text-gold-2" : "border-line text-ink-3")}
            >
              {d}
            </button>
            {slot ? (
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                <TimeSelect value={slot.start} onChange={(v) => onChange(value.map((s) => (s.weekday === wd ? { ...s, start: v } : s)))} />
                <span className="text-ink-3">–</span>
                <TimeSelect value={slot.end} onChange={(v) => onChange(value.map((s) => (s.weekday === wd ? { ...s, end: v } : s)))} />
              </div>
            ) : (
              <span className="text-sm text-ink-3">Indisponível</span>
            )}
          </div>
        );
      })}
    </Card>
  );
}


const TIMES = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);

function TimeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 min-w-0 flex-1 appearance-none rounded-xl border border-line bg-card-2 px-2 text-center text-sm text-ink outline-none focus:border-gold-3"
    >
      {TIMES.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );
}
