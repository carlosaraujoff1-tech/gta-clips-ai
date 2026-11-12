"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarDays, Clock, MapPin, Star } from "lucide-react";

import { Avatar } from "@/components/art";
import { BookingStatusBadge } from "@/components/booking-status";
import { useSession } from "@/components/guard";
import { Button, Chip, Empty, Field, LinkButton, Notice, Sheet, Spinner, Textarea, TopBar, cn } from "@/components/ui";
import { AppError, addReview, bookingTitle, canReview, setBookingStatus } from "@/lib/db";
import { isoDate, longDate } from "@/lib/format";

export default function BookingsPage() {
  const s = useSession(["client"]);
  const [tab, setTab] = useState<"upcoming" | "history">("upcoming");
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!s) return <Spinner />;
  const { db, me } = s;

  const today = isoDate(new Date());
  const mine = db.bookings.filter((b) => b.clientId === me.id);
  const upcoming = mine.filter((b) => (b.status === "requested" || b.status === "accepted") && b.date >= today).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const history = mine.filter((b) => !upcoming.includes(b)).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  const list = tab === "upcoming" ? upcoming : history;

  function sendReview() {
    try {
      addReview(reviewing!, rating, text);
      setReviewing(null);
      setText("");
    } catch (e) {
      setError(e instanceof AppError ? e.message : "Erro");
    }
  }

  return (
    <>
      <TopBar title="Reservas" />
      <div className="mb-5 flex gap-2">
        <Chip active={tab === "upcoming"} onClick={() => setTab("upcoming")}>
          Próximas · {upcoming.length}
        </Chip>
        <Chip active={tab === "history"} onClick={() => setTab("history")}>
          Histórico de solicitações
        </Chip>
      </div>

      {list.length === 0 ? (
        <Empty icon={<CalendarDays className="size-5" />} title={tab === "upcoming" ? "Nenhuma reserva próxima" : "Sem histórico"} text="Encontre um perfil verificado e solicite um horário." action={<LinkButton href="/buscar">Explorar</LinkButton>} />
      ) : (
        <ul className="space-y-3">
          {list.map((b, i) => {
            const pro = db.professionals.find((p) => p.id === b.professionalId);
            const est = db.establishments.find((e) => e.id === b.establishmentId);
            const href = pro ? `/perfil/${pro.id}` : est ? `/estabelecimentos/${est.id}` : "#";
            return (
              <li key={b.id} className="rounded-3xl border border-line bg-card p-4 animate-rise" style={{ animationDelay: `${i * 40}ms` }}>
                <div className="flex items-start gap-3">
                  <Avatar hue={pro?.hue ?? est?.hue ?? 40} name={bookingTitle(db, b)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <Link href={href} className="font-display truncate text-xl">
                        {bookingTitle(db, b)}
                      </Link>
                      <BookingStatusBadge status={b.status} />
                    </div>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-3">
                      <CalendarDays className="size-3.5" /> {longDate(b.date)}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-3">
                      <Clock className="size-3.5" /> {b.time} · {b.durationMin / 60}h
                    </p>
                    {est && (
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-3">
                        <MapPin className="size-3.5" /> {est.address}
                      </p>
                    )}
                    {b.note && <p className="mt-2 text-xs text-ink-2 italic">“{b.note}”</p>}
                  </div>
                </div>
                <div className={cn("mt-4 flex gap-2", !(b.status === "requested" || b.status === "accepted" || canReview(db, b.id, me.id)) && "hidden")}>
                  {(b.status === "requested" || b.status === "accepted") && (
                    <Button variant="ghost" className="h-10 flex-1" onClick={() => setBookingStatus(b.id, "cancelled")}>
                      Cancelar
                    </Button>
                  )}
                  {pro && b.status === "accepted" && (
                    <LinkButton href={`/perfil/${pro.id}`} variant="outline" className="h-10 flex-1">
                      Ver perfil
                    </LinkButton>
                  )}
                  {canReview(db, b.id, me.id) && (
                    <Button variant="outline" className="h-10 flex-1" onClick={() => setReviewing(b.id)}>
                      <Star className="size-4" /> Avaliar
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Sheet open={!!reviewing} onClose={() => setReviewing(null)} title="Avaliar experiência">
        <div className="space-y-5 pb-4">
          <div className="flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} aria-label={`${n} estrelas`} onClick={() => setRating(n)}>
                <Star className={cn("size-9 transition", n <= rating ? "fill-gold text-gold" : "text-line-2")} strokeWidth={1.2} />
              </button>
            ))}
          </div>
          <Field label="Comentário">
            <Textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={600} placeholder="Pontualidade, respeito, discrição…" />
          </Field>
          <Notice tone="mute">Avaliações são verificadas: só quem teve uma reserva concluída pode avaliar, uma única vez. Não descreva atos íntimos.</Notice>
          {error && <Notice tone="bad">{error}</Notice>}
          <Button onClick={sendReview} className="w-full">
            Publicar avaliação
          </Button>
        </div>
      </Sheet>
    </>
  );
}
