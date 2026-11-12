"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Ban, Building2, CheckCircle2, Flag, Languages, MapPin, MessageCircle, MoreVertical, Share, ShieldCheck, Star } from "lucide-react";

import { Art } from "@/components/art";
import { useSession } from "@/components/guard";
import { FavButton, distanceKm } from "@/components/profile-card";
import { ReportSheet } from "@/components/report-sheet";
import { Button, Empty, Sheet, Spinner, Stars, TopBar, VerifiedSeal, cn } from "@/components/ui";
import { DEMO_MODE, FEATURES } from "@/lib/config";
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

  const kindLabel = p.kind === "Homens" ? "Verificado" : p.kind === "Casais" ? "Verificados" : "Verificada";

  return (
    <div className="-mx-5 pb-28">
      <div className="relative">
        <div className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto" onScroll={(e) => setPhoto(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}>
          {photos.map((ph) => (
            <Art key={ph.id} hue={ph.hue} src={ph.src} label={p.displayName} className="aspect-[4/4.2] w-full shrink-0 snap-center rounded-none" />
          ))}
        </div>
        <div className="safe-top absolute inset-x-0 top-0 flex h-14 items-center justify-between px-3">
          <button aria-label="Voltar" onClick={() => router.back()} className="grid size-10 place-items-center">
            <ArrowLeft className="size-6 drop-shadow" />
          </button>
          <div className="flex items-center">
            <button
              aria-label="Compartilhar"
              onClick={() => navigator.share?.({ title: "PRIVÉ", url: window.location.href }).catch(() => undefined)}
              className="grid size-10 place-items-center"
            >
              <Share className="size-[22px] drop-shadow" />
            </button>
            <FavButton active={fav} id={p.id} className="size-10" />
            <button aria-label="Mais opções" onClick={() => setMenu(true)} className="grid size-10 place-items-center">
              <MoreVertical className="size-[22px] drop-shadow" />
            </button>
          </div>
        </div>
        {DEMO_MODE && <span className="absolute bottom-4 left-4 text-[10px] text-white/50">Foto ilustrativa · demonstração</span>}
        <span className="absolute right-4 bottom-4 rounded-full bg-black/60 px-2.5 py-1 text-xs backdrop-blur">
          {photo + 1}/{photos.length}
        </span>
      </div>

      <div className="px-5 pt-4 animate-rise">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          {p.displayName} <VerifiedSeal compact />
        </h1>
        {count > 0 && (
          <p className="mt-1 flex items-center gap-1.5 text-[15px]">
            <Star className="size-4 fill-gold text-gold" /> <span className="text-gold">{avg.toFixed(1)}</span>
            <span className="text-ink-2">({count} avaliações)</span>
          </p>
        )}
        {FEATURES.priceInfo && p.priceFrom && (
          <p className="mt-2">
            <span className="text-[26px] font-bold text-gold">{brl(p.priceFrom)}</span> <span className="text-ink-2">/ 1h</span>
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line-2 px-3 py-1 text-[13px]">
            <CheckCircle2 className="size-4 fill-check text-black" /> {kindLabel}
          </span>
          {p.tags.map((t) => (
            <span key={t} className="rounded-full border border-line-2 px-3 py-1 text-[13px]">
              {t}
            </span>
          ))}
        </div>

        <h2 className="mt-6 text-[17px] font-bold">Sobre mim</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{p.bio}</p>

        <div className="mt-4 space-y-2 text-sm text-ink-2">
          <p className="flex items-center gap-2">
            <MapPin className="size-4 text-gold" /> {p.region}, {p.city} • {distanceKm(p.id)} km
          </p>
          <p className="flex items-center gap-2">
            <Languages className="size-4 text-gold" /> {p.languages.join(" · ")}
          </p>
          <p className="flex items-center gap-2">
            <Building2 className="size-4 text-gold" /> {p.serviceLocations.join(" · ")}
          </p>
        </div>

        <h2 className="mt-6 mb-3 text-[17px] font-bold">Disponibilidade</h2>
        <div className="grid grid-cols-7 gap-1.5">
          {WEEKDAYS.map((d, i) => (
            <div key={d} className={cn("rounded-lg border py-2 text-center text-[11px]", days.includes(i) ? "border-gold/60 text-gold" : "border-line text-ink-3/50")}>
              {d}
            </div>
          ))}
        </div>

        <h2 className="mt-6 mb-3 text-[17px] font-bold">Avaliações verificadas</h2>
        {reviews.length === 0 ? (
          <p className="text-sm text-ink-3">Ainda sem avaliações. Só quem teve reserva concluída pode avaliar.</p>
        ) : (
          <ul className="space-y-2.5">
            {reviews.slice(0, 4).map((r) => (
              <li key={r.id} className="rounded-xl border border-line bg-card p-3.5">
                <div className="flex items-center justify-between">
                  <Stars value={r.rating} size={12} />
                  <span className="text-[11px] text-ink-3">{relative(r.createdAt)}</span>
                </div>
                <p className="mt-1.5 text-sm text-ink-2">{r.text}</p>
                <p className="mt-1.5 flex items-center gap-1 text-[11px] text-ink-3">
                  <ShieldCheck className="size-3 text-gold" /> {userName(db, r.authorId).split(" ")[0]} · reserva verificada
                </p>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-6 text-center text-[11px] text-ink-3">Valor informado pelo perfil e combinado diretamente. O PRIVÉ não cobra nem intermedeia encontros.</p>
        {error && <p className="mt-2 text-center text-sm text-bad">{error}</p>}
      </div>

      <div className="safe-bottom fixed inset-x-0 bottom-0 z-40 bg-gradient-to-t from-black via-black/95 to-transparent pt-6">
        <div className="mx-auto flex max-w-lg gap-2 px-5">
          <button aria-label="Mensagem" onClick={contact} className="grid size-12 shrink-0 place-items-center rounded-xl border border-gold text-gold">
            <MessageCircle className="size-5" />
          </button>
          <Button onClick={() => router.push(`/perfil/${p.id}/agendar`)} className="flex-1">
            Reservar agora
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
            <Share className="size-4" /> Compartilhar com discrição
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
