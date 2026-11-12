"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { CalendarDays, CalendarX, CheckCircle2, Clock, MapPin, ShieldCheck, Star } from "lucide-react";

import { Art } from "@/components/art";
import { useSession } from "@/components/guard";
import { Button, Empty, LinkButton, Notice, Sheet, Spinner, Textarea, TopBar, cn } from "@/components/ui";
import { FEATURES } from "@/lib/config";
import { AppError, ratingOf, requestBooking, slotsFor } from "@/lib/db";
import { brl, isoDate, longDate, shortDate } from "@/lib/format";

const DURATIONS = [
  { min: 60, label: "1 hora" },
  { min: 120, label: "2 horas" },
  { min: 180, label: "3 horas" },
];

export default function ReservePage() {
  const { id } = useParams<{ id: string }>();
  const s = useSession(["client"]);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState(60);
  const [location, setLocation] = useState("");
  const [locOpen, setLocOpen] = useState(false);
  const [note, setNote] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [now] = useState(() => Date.now());

  const db = s?.db;
  const p = db?.professionals.find((x) => x.id === id && x.status === "published");

  const dates = useMemo(() => {
    if (!db || !p) return [];
    const out: string[] = [];
    for (let i = 0; i < 45 && out.length < 21; i++) {
      const iso = isoDate(new Date(now + i * 86400000));
      if (slotsFor(db, { professional: p }, iso).length) out.push(iso);
    }
    return out;
  }, [db, p, now]);

  if (!s) return <Spinner />;
  if (!p)
    return (
      <>
        <TopBar back title="Reserva" />
        <Empty icon={<CalendarX className="size-5" />} title="Perfil indisponível" />
      </>
    );

  const day = date || dates[0] || "";
  const slots = day ? slotsFor(s.db, { professional: p }, day) : [];
  const loc = location || p.serviceLocations[0] || "A combinar";
  const { avg, count } = ratingOf(s.db, p.id);
  const total = p.priceFrom ? (p.priceFrom * duration) / 60 : null;

  if (done)
    return (
      <div className="pt-16 text-center animate-rise">
        <CheckCircle2 className="mx-auto mb-5 size-16 text-gold" strokeWidth={1.2} />
        <h2 className="text-2xl font-bold">Solicitação enviada</h2>
        <p className="mx-auto mt-3 max-w-xs text-sm text-ink-2">
          {p.displayName} vai confirmar a disponibilidade para {longDate(day)} às {time}. Você será notificado.
        </p>
        <div className="mt-8 grid gap-3">
          <LinkButton href="/reservas">Ver minhas reservas</LinkButton>
          <LinkButton href="/inicio" variant="outline">
            Voltar ao início
          </LinkButton>
        </div>
      </div>
    );

  function submit() {
    setError(null);
    try {
      requestBooking({ professionalId: p!.id, date: day, time, durationMin: duration, location: loc, note });
      setDone(true);
    } catch (e) {
      setError(e instanceof AppError ? e.message : "Não foi possível enviar.");
    }
  }

  return (
    <div className="pb-6">
      <TopBar back title="Reserva" />

      <Link href={`/perfil/${p.id}`} className="mb-6 flex items-center gap-4">
        <Art hue={p.hue} label={p.displayName} className="size-20 shrink-0 rounded-2xl" />
        <div>
          <p className="text-lg font-bold">{p.displayName}</p>
          {count > 0 && (
            <p className="flex items-center gap-1 text-sm">
              <Star className="size-4 fill-gold text-gold" /> <span className="text-gold">{avg.toFixed(1)}</span>
              <span className="text-ink-2">({count})</span>
            </p>
          )}
        </div>
      </Link>

      <h3 className="mb-2 flex items-center gap-2 text-[15px] font-semibold">
        <CalendarDays className="size-[18px] text-gold" /> Data e horário
      </h3>
      {dates.length === 0 ? (
        <p className="text-sm text-ink-3">Sem horários disponíveis nas próximas semanas.</p>
      ) : (
        <>
          <label className="flex h-12 items-center gap-3 rounded-xl border border-line-2 bg-card px-4">
            <CalendarDays className="size-[18px] text-ink-2" />
            <select
              value={day}
              onChange={(e) => {
                setDate(e.target.value);
                setTime("");
              }}
              className="w-full appearance-none bg-transparent text-[15px] outline-none"
            >
              {dates.map((d) => (
                <option key={d} value={d}>
                  {shortDate(d)}/{d.slice(0, 4)} — {longDate(d).split(",")[0]}
                </option>
              ))}
            </select>
            <span className="text-ink-2">⌄</span>
          </label>
          <div className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5">
            {slots.map((t) => (
              <button
                key={t}
                onClick={() => setTime(t)}
                className={cn(
                  "shrink-0 rounded-full border px-4 py-2 text-[15px] transition",
                  t === time ? "border-transparent bg-gradient-to-b from-gold-2 to-gold font-semibold text-black" : "border-line-2 bg-card text-ink",
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </>
      )}

      <h3 className="mt-6 mb-2 flex items-center gap-2 text-[15px] font-semibold">
        <ShieldCheck className="size-[18px] text-gold" /> Local de atendimento
      </h3>
      <div className="flex h-12 items-center gap-3 rounded-xl border border-line-2 bg-card px-4">
        <MapPin className="size-[18px] fill-gold text-black" />
        <span className="flex-1 truncate text-[15px]">
          {loc} - {p.region}
        </span>
        {p.serviceLocations.length > 1 && (
          <button onClick={() => setLocOpen(true)} className="text-sm font-semibold text-gold">
            Alterar
          </button>
        )}
      </div>

      <div className="mt-3 flex h-12 items-center gap-3 rounded-xl border border-line-2 bg-card px-4">
        <Clock className="size-[18px] fill-gold text-black" />
        <span className="flex-1 text-[15px] font-semibold">Duração</span>
        <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="appearance-none rounded-lg border border-line-2 bg-card-2 px-3 py-1.5 text-sm outline-none">
          {DURATIONS.map((d) => (
            <option key={d.min} value={d.min}>
              {d.label}
            </option>
          ))}
        </select>
      </div>

      <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Observação (opcional)" className="mt-3 min-h-20 rounded-xl" />

      {FEATURES.priceInfo && total && (
        <div className="mt-6 flex items-end justify-between">
          <span className="text-[17px]">
            Total estimado
            <span className="block text-[11px] text-ink-3">Combinado e pago diretamente ao perfil</span>
          </span>
          <span className="text-[30px] font-bold text-gold">{brl(total)}</span>
        </div>
      )}

      <label className="mt-5 flex items-start gap-3 text-[13px] text-ink-2">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[#e0ad3e]" />
        Entendo que é uma solicitação, sujeita à aceitação livre de {p.displayName}, que pode recusar ou cancelar a qualquer momento.
      </label>
      {error && (
        <div className="mt-3">
          <Notice tone="bad">{error}</Notice>
        </div>
      )}
      <Button className="mt-4 w-full" disabled={!time || !consent} onClick={submit}>
        Confirmar reserva
      </Button>

      <Sheet open={locOpen} onClose={() => setLocOpen(false)} title="Local de atendimento">
        <div className="grid gap-2 pb-4">
          {p.serviceLocations.map((l) => (
            <button
              key={l}
              onClick={() => (setLocation(l), setLocOpen(false))}
              className={cn("rounded-xl border px-4 py-3 text-left text-[15px]", l === loc ? "border-gold text-gold" : "border-line-2")}
            >
              {l}
            </button>
          ))}
          <p className="pt-1 text-xs text-ink-3">Opções informadas pelo próprio perfil. O PRIVÉ não reserva locais para encontros.</p>
        </div>
      </Sheet>
    </div>
  );
}
