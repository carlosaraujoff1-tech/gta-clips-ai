"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bell, ChevronDown, MapPin, Search, SlidersHorizontal } from "lucide-react";

import { Art, Logo } from "@/components/art";
import { CitySheet } from "@/components/city-sheet";
import { useSession } from "@/components/guard";
import { ProfileCard } from "@/components/profile-card";
import { Chip, Empty, SectionTitle, Spinner } from "@/components/ui";
import { CATEGORIES } from "@/lib/config";
import { searchProfessionals } from "@/lib/db";
import { usePref } from "@/lib/prefs";

export default function HomePage() {
  const s = useSession(["client"]);
  const router = useRouter();
  const [city, setCity] = usePref("city", "São Paulo");
  const [cat, setCat] = useState("");
  const [cityOpen, setCityOpen] = useState(false);
  if (!s) return <Spinner />;
  const { db, me } = s;

  const favs = new Set(db.favorites.filter((f) => f.userId === me.id).map((f) => f.professionalId));
  const list = searchProfessionals(db, { city, category: cat || undefined }, me.id);
  const featured = searchProfessionals(db, { city }, me.id).slice(0, 5);
  const today = new Date().getDay();
  const availableToday = list.filter((p) => p.availability.some((a) => a.weekday === today));
  const unread = db.notifications.filter((n) => n.userId === me.id && !n.read).length;
  const partners = db.establishments.filter((e) => e.status === "approved");

  return (
    <div className="safe-top">
      <header className="flex items-center justify-between pt-4 pb-5">
        <button onClick={() => setCityOpen(true)} className="text-left">
          <span className="block text-[10px] tracking-[0.25em] text-ink-3 uppercase">Localização</span>
          <span className="flex items-center gap-1 text-[15px]">
            <MapPin className="size-4 text-gold" strokeWidth={1.6} /> {city} <ChevronDown className="size-4 text-ink-3" />
          </span>
        </button>
        <Logo className="text-xl" />
        <Link href="/notificacoes" aria-label="Notificações" className="relative grid size-10 place-items-center rounded-full border border-line">
          <Bell className="size-[18px]" strokeWidth={1.5} />
          {unread > 0 && <span className="absolute top-2 right-2.5 size-2 rounded-full bg-gold" />}
        </Link>
      </header>

      <h1 className="font-display text-[34px] leading-[1.05] animate-rise">
        {greeting()}, <span className="gold-text italic">{me.name.split(" ")[0]}</span>
      </h1>
      <p className="mt-1 text-sm text-ink-3">Perfis verificados, com total discrição.</p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const q = new FormData(e.currentTarget).get("q");
          router.push(`/buscar?q=${encodeURIComponent(String(q ?? ""))}`);
        }}
        className="mt-5 flex gap-2"
      >
        <label className="flex h-12 flex-1 items-center gap-3 rounded-2xl border border-line bg-card px-4 focus-within:border-gold-3">
          <Search className="size-4 text-ink-3" />
          <input name="q" placeholder="Nome, bairro ou experiência" className="w-full bg-transparent text-[15px] outline-none placeholder:text-ink-3" />
        </label>
        <Link href="/buscar" aria-label="Filtros" className="grid size-12 place-items-center rounded-2xl border border-line bg-card text-gold">
          <SlidersHorizontal className="size-[18px]" strokeWidth={1.5} />
        </Link>
      </form>

      <div className="no-scrollbar -mx-5 mt-5 flex gap-2 overflow-x-auto px-5">
        <Chip active={!cat} onClick={() => setCat("")}>
          Todos
        </Chip>
        {CATEGORIES.map((c) => (
          <Chip key={c} active={cat === c} onClick={() => setCat(cat === c ? "" : c)}>
            {c}
          </Chip>
        ))}
      </div>

      {!cat && featured.length > 0 && (
        <section className="mt-8">
          <SectionTitle>Em destaque</SectionTitle>
          <div className="no-scrollbar -mx-5 flex snap-x gap-3 overflow-x-auto px-5 pb-1">
            {featured.map((p, i) => (
              <div key={p.id} className="snap-start">
                <ProfileCard db={db} p={p} fav={favs.has(p.id)} wide index={i} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-8">
        <SectionTitle
          action={
            <Link href="/buscar" className="text-xs text-gold">
              Ver todos
            </Link>
          }
        >
          {cat || "Disponíveis hoje"}
        </SectionTitle>
        {(cat ? list : availableToday).length === 0 ? (
          <Empty icon={<Search className="size-5" />} title="Nenhum perfil por aqui" text="Experimente outra cidade ou categoria." />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {(cat ? list : availableToday).map((p, i) => (
              <ProfileCard key={p.id} db={db} p={p} fav={favs.has(p.id)} index={i} />
            ))}
          </div>
        )}
      </section>

      {partners.length > 0 && (
        <section className="mt-10">
          <SectionTitle
            action={
              <Link href="/estabelecimentos" className="text-xs text-gold">
                Ver todos
              </Link>
            }
          >
            Parceiros PRIVÉ
          </SectionTitle>
          <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5">
            {partners.map((e) => (
              <Link key={e.id} href={`/estabelecimentos/${e.id}`} className="w-60 shrink-0">
                <Art hue={e.hue} label={e.name} className="aspect-[16/10]">
                  <div className="absolute inset-x-0 bottom-0 p-3">
                    <p className="text-[10px] tracking-[0.2em] text-gold uppercase">{e.kind}</p>
                    <p className="font-display text-xl">{e.name}</p>
                    <p className="text-[11px] text-ink-3">
                      {e.region}, {e.city}
                    </p>
                  </div>
                </Art>
              </Link>
            ))}
          </div>
        </section>
      )}

      <CitySheet open={cityOpen} onClose={() => setCityOpen(false)} value={city} onChange={setCity} />
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}
