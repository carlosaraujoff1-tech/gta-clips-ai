"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, Clock } from "lucide-react";

import { Calendar } from "./calendar";
import { Button, Chip, Field, LinkButton, Notice, Textarea, cn } from "./ui";
import { FEATURES } from "@/lib/config";
import { AppError, requestBooking, slotsFor } from "@/lib/db";
import { longDate } from "@/lib/format";
import type { DB, Establishment, Professional } from "@/lib/types";

const DURATIONS = [60, 120, 180];

export function BookingFlow({ db, professional, establishment }: { db: DB; professional?: Professional; establishment?: Establishment }) {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState(60);
  const [note, setNote] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneId, setDoneId] = useState<string | null>(null);
  const target = { professional, establishment };
  const slots = date ? slotsFor(db, target, date) : [];
  const name = professional?.displayName ?? establishment?.name ?? "";

  if (doneId) {
    return (
      <div className="pt-10 text-center animate-rise">
        <div className="mx-auto mb-5 grid size-20 place-items-center rounded-full border border-gold/40 text-gold">
          <CheckCircle2 className="size-9" strokeWidth={1.2} />
        </div>
        <h2 className="font-display text-3xl">Solicitação enviada</h2>
        <p className="mx-auto mt-3 max-w-xs text-sm text-ink-3">
          {name} vai confirmar a disponibilidade para <span className="text-ink-2">{longDate(date)}</span> às <span className="text-ink-2">{time}</span>. Você será notificado.
        </p>
        <div className="mt-8 grid gap-3">
          <LinkButton href="/reservas">Ver minhas reservas</LinkButton>
          <Button variant="ghost" onClick={() => router.back()}>
            Voltar
          </Button>
        </div>
      </div>
    );
  }

  function submit() {
    setError(null);
    try {
      setDoneId(requestBooking({ professionalId: professional?.id, establishmentId: establishment?.id, date, time, durationMin: duration, note }));
    } catch (e) {
      setError(e instanceof AppError ? e.message : "Não foi possível enviar.");
    }
  }

  return (
    <div className="space-y-6">
      <Calendar
        value={date}
        onChange={(d) => {
          setDate(d);
          setTime("");
        }}
        isAvailable={(iso) => slotsFor(db, target, iso).length > 0}
      />

      {date && (
        <section className="animate-rise">
          <h3 className="mb-3 text-[11px] tracking-[0.2em] text-ink-3 uppercase">{longDate(date)}</h3>
          {slots.length === 0 ? (
            <p className="text-sm text-ink-3">Sem horários livres nesse dia.</p>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {slots.map((t) => (
                <button key={t} onClick={() => setTime(t)} className={cn("rounded-xl border py-2.5 text-sm transition", t === time ? "border-gold bg-gold/15 text-gold-2" : "border-line hover:border-line-2")}>
                  {t}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {time && (
        <section className="space-y-5 animate-rise">
          {professional && (
            <div>
              <h3 className="mb-3 text-[11px] tracking-[0.2em] text-ink-3 uppercase">Duração estimada</h3>
              <div className="flex gap-2">
                {DURATIONS.map((d) => (
                  <Chip key={d} active={duration === d} onClick={() => setDuration(d)}>
                    <Clock className="mr-1 inline size-3" /> {d / 60}h
                  </Chip>
                ))}
              </div>
            </div>
          )}
          <Field label="Observação (opcional)" hint="Contatos, links e chaves de pagamento são ocultados automaticamente.">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder={establishment ? "Ex.: mesa para dois, aniversário" : "Ex.: jantar de negócios"} />
          </Field>
          <label className="flex items-start gap-3 text-[13px] text-ink-2">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[#e0ad3e]" />
            Entendo que esta é uma solicitação de disponibilidade, sujeita à aceitação livre de {name}, que pode recusar ou cancelar a qualquer momento.
          </label>
          {!FEATURES.payments && <Notice tone="mute">Nenhum pagamento é processado pelo PRIVÉ nesta versão.</Notice>}
          {error && <Notice tone="bad">{error}</Notice>}
          <Button disabled={!consent} onClick={submit} className="w-full">
            Enviar solicitação
          </Button>
        </section>
      )}
    </div>
  );
}
