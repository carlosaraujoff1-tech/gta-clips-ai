"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Ban, CalendarDays, Flag, Languages, MapPin, MessageCircle, MoreHorizontal, ShieldCheck, Share2 } from "lucide-react";

import { Art } from "@/components/art";
import { useSession } from "@/components/guard";
import { FavButton } from "@/components/profile-card";
import { ReportSheet } from "@/components/report-sheet";
import { Badge, Button, Empty, Sheet, Spinner, Stars, TopBar, VerifiedSeal, cn } from "@/components/ui";
import { FEATURES } from "@/lib/config";
import { AppError, blockUser, isBlockedBetween, openConversation, ratingOf, userName } from "@/lib/db";
import { WEEKDAYS, brl, relative } from "@/lib/format";

export default function ProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const s = useSession(["client"]);
  const [photo, setPhoto] = useState(0);
  const [menu, setMenu] = useState(false);
  const [report, setReport] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!s) return <Spinner />;
  const { db, me } = s;

  const p = db.professionals.find((x) => x.id === id);
  if (!p || p.status !== "published" || p.verification !== "verified" || isBlockedBetween(db, me.id, p.userId)) {
    return (
      <>
        <TopBar back />
        <Empty icon={<ShieldCheck className="size-5" />} title="Perfil indisponível" text="Este perfil não está mais disponível." />
      </>
    );
  }

  const photos = p.photos.filter((ph) => ph.status === "approved");
  const fav = db.favorites.some((f) => f.userId === me.id && f.professionalId === p.id);
  const { avg, count, reviews } = ratingOf(db, p.id);
  const days = [...new Set(p.availability.map((a) => a.weekday))];

  const contact = () => {
    try {
      router.push(`/mensagens/${openConversation(p.id)}`);
    } catch (e) {
      setError(e instanceof AppError ? e.message : "Erro");
    }
  };

  return (
    <div className="-mx-5">
      <div className="relative">
        <div
          className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto"
          onScroll={(e) => setPhoto(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        >
          {photos.map((ph) => (
            <Art key={ph.id} hue={ph.hue} label={p.displayName} className="aspect-[4/5] w-full shrink-0 snap-center rounded-none">
              <span className="absolute bottom-24 left-5 text-[10px] tracking-[0.25em] text-ink-3 uppercase">{ph.caption}</span>
            </Art>
          ))}
        </div>
        <div className="absolute inset-x-0 top-0 px-5">
          <TopBar
            back
            right={
              <>
                <FavButton active={fav} id={p.id} />
                <button aria-label="Mais opções" onClick={() => setMenu(true)} className="grid size-9 place-items-center rounded-full bg-black/40 backdrop-blur-md">
                  <MoreHorizontal className="size-4" />
                </button>
              </>
            }
          />
        </div>
        <div className="absolute inset-x-0 bottom-20 flex justify-center gap-1.5">
          {photos.map((ph, i) => (
            <span key={ph.id} className={cn("h-1 rounded-full transition-all", i === photo ? "w-5 bg-gold" : "w-1.5 bg-white/30")} />
          ))}
        </div>
      </div>

      <div className="relative -mt-16 rounded-t-[32px] border-t border-line bg-void px-5 pt-6 animate-rise">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-[40px] leading-none">{p.displayName}</h1>
            <p className="mt-2 text-sm text-ink-2">{p.headline}</p>
          </div>
          {FEATURES.priceInfo && p.priceFrom && (
            <div className="shrink-0 text-right">
              <span className="block text-[10px] tracking-[0.2em] text-ink-3 uppercase">a partir de</span>
              <span className="font-display text-2xl text-gold-2">{brl(p.priceFrom)}</span>
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-3">
          <VerifiedSeal />
          <span className="flex items-center gap-1">
            <MapPin className="size-3.5" /> {p.region}, {p.city}
          </span>
          {count > 0 && (
            <span className="flex items-center gap-1.5">
              <Stars value={avg} size={12} /> {avg.toFixed(1)} ({count})
            </span>
          )}
        </div>

        <div className="hairline my-6" />

        <section>
          <h2 className="mb-2 text-[11px] tracking-[0.2em] text-ink-3 uppercase">Sobre</h2>
          <p className="text-[15px] leading-relaxed text-ink-2">{p.bio}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {p.categories.map((c) => (
              <Badge key={c} tone="gold">
                {c}
              </Badge>
            ))}
          </div>
          <p className="mt-4 flex items-center gap-2 text-sm text-ink-3">
            <Languages className="size-4" /> {p.languages.join(" · ")}
          </p>
        </section>

        <section className="mt-7">
          <h2 className="mb-3 text-[11px] tracking-[0.2em] text-ink-3 uppercase">Disponibilidade</h2>
          <div className="grid grid-cols-7 gap-1.5">
            {WEEKDAYS.map((d, i) => (
              <div key={d} className={cn("rounded-xl border py-2 text-center text-[11px]", days.includes(i) ? "border-gold/40 text-gold-2" : "border-line text-ink-3/50")}>
                {d}
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-3">
            {p.availability
              .filter((a, i, arr) => arr.findIndex((x) => x.start === a.start && x.end === a.end) === i)
              .map((a) => `${a.start}–${a.end}`)
              .join(" · ")}
          </p>
        </section>

        <section className="mt-7">
          <h2 className="mb-3 text-[11px] tracking-[0.2em] text-ink-3 uppercase">Avaliações verificadas</h2>
          {reviews.length === 0 ? (
            <p className="text-sm text-ink-3">Ainda sem avaliações. Somente clientes com reserva concluída podem avaliar.</p>
          ) : (
            <ul className="space-y-3">
              {reviews.map((r) => (
                <li key={r.id} className="rounded-2xl border border-line bg-card p-4">
                  <div className="flex items-center justify-between">
                    <Stars value={r.rating} size={12} />
                    <span className="text-[11px] text-ink-3">{relative(r.createdAt)}</span>
                  </div>
                  <p className="mt-2 text-sm text-ink-2">{r.text}</p>
                  <p className="mt-2 flex items-center gap-1 text-[11px] text-ink-3">
                    <ShieldCheck className="size-3 text-gold" /> {userName(db, r.authorId).split(" ")[0]} · reserva verificada
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="mt-8 text-center text-[11px] leading-relaxed text-ink-3">
          Toda interação depende de consentimento mútuo. O PRIVÉ não intermedeia pagamentos.
        </p>
        {error && <p className="mt-2 text-center text-sm text-bad">{error}</p>}
      </div>

      <div className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-void/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-lg gap-3 px-5 pt-3">
          <Button variant="outline" onClick={contact} className="flex-1">
            <MessageCircle className="size-4" /> Mensagem
          </Button>
          <Button onClick={() => router.push(`/perfil/${p.id}/agendar`)} className="flex-[1.6]">
            <CalendarDays className="size-4" /> Solicitar horário
          </Button>
        </div>
      </div>

      <Sheet open={menu} onClose={() => setMenu(false)} title="Opções">
        <div className="grid gap-2 pb-4">
          <Button
            variant="outline"
            className="justify-start"
            onClick={() => {
              navigator.share?.({ title: "PRIVÉ", url: window.location.href }).catch(() => undefined);
              setMenu(false);
            }}
          >
            <Share2 className="size-4" /> Compartilhar com discrição
          </Button>
          <Button
            variant="outline"
            className="justify-start"
            onClick={() => {
              setMenu(false);
              setReport(true);
            }}
          >
            <Flag className="size-4" /> Denunciar perfil
          </Button>
          <Button
            variant="danger"
            className="justify-start"
            onClick={() => {
              blockUser(p.userId);
              router.replace("/inicio");
            }}
          >
            <Ban className="size-4" /> Bloquear {p.displayName}
          </Button>
        </div>
      </Sheet>
      <ReportSheet open={report} onClose={() => setReport(false)} targetType="professional" targetId={p.id} blockUserId={p.userId} name={p.displayName} onBlocked={() => router.replace("/inicio")} />
    </div>
  );
}
