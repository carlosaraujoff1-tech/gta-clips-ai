"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bell, ChevronDown, MapPin, MessageCircle, Search } from "lucide-react";

import { Art } from "@/components/art";
import { CitySheet } from "@/components/city-sheet";
import { useSession } from "@/components/guard";
import { ProfileCard } from "@/components/profile-card";
import { Chip, Empty, SectionTitle, Spinner } from "@/components/ui";
import { KINDS } from "@/lib/config";
import { isPremium, searchProfessionals } from "@/lib/db";
import { usePref } from "@/lib/prefs";

const UF: Record<string, string> = { "São Paulo": "SP", "Rio de Janeiro": "RJ", "Belo Horizonte": "MG", Curitiba: "PR" };

export default function HomePage() {
  const s = useSession(["client"]);
  const router = useRouter();
  const [city, setCity] = usePref("city", "São Paulo");
  const [kind, setKind] = useState("");
  const [cityOpen, setCityOpen] = useState(false);
  if (!s) return <Spinner />;
  const { db, me } = s;

  const favs = new Set(db.favorites.filter((f) => f.userId === me.id).map((f) => f.professionalId));
  const list = searchProfessionals(db, { city, kind: kind || undefined }, me.id);
  // Perfis com plano de destaque aparecem primeiro (receita por visibilidade).
  const proUserPremium = (uid: string) => isPremium(db.users.find((u) => u.id === uid) ?? null);
  const sorted = [...list].sort((a, b) => Number(proUserPremium(b.userId)) - Number(proUserPremium(a.userId)));
  const unread = db.notifications.filter((n) => n.userId === me.id && !n.read).length;
  const partners = db.establishments.filter((e) => e.status === "approved" && e.city === city);

  return (
    <div className="safe-top">
      <header className="flex items-center justify-between pt-3 pb-4">
        <button onClick={() => setCityOpen(true)} className="flex items-center gap-1.5 text-[15px] font-medium">
          <MapPin className="size-5 fill-gold text-black" strokeWidth={1.5} />
          {city} - {UF[city] ?? ""}
          <ChevronDown className="size-4" />
        </button>
        <div className="flex items-center gap-1">
          <Link href="/mensagens" aria-label="Mensagens" className="grid size-10 place-items-center">
            <MessageCircle className="size-[22px]" strokeWidth={1.6} />
          </Link>
          <Link href="/notificacoes" aria-label="Notificações" className="relative grid size-10 place-items-center">
            <Bell className="size-[22px]" strokeWidth={1.6} />
            {unread > 0 && <span className="absolute top-2 right-2.5 size-2 rounded-full bg-gold" />}
          </Link>
        </div>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const q = new FormData(e.currentTarget).get("q");
          router.push(`/buscar?q=${encodeURIComponent(String(q ?? ""))}`);
        }}
      >
        <label className="flex h-11 items-center gap-3 rounded-full bg-card-2 px-4 focus-within:ring-1 focus-within:ring-gold-3">
          <Search className="size-[18px] text-ink-2" />
          <input name="q" placeholder="Buscar por nome, região..." className="w-full bg-transparent text-[15px] outline-none placeholder:text-ink-3" />
        </label>
      </form>

      <div className="no-scrollbar -mx-5 mt-4 flex gap-2 overflow-x-auto px-5">
        <Chip active={!kind} onClick={() => setKind("")}>
          Todos
        </Chip>
        {KINDS.map((k) => (
          <Chip key={k} active={kind === k} onClick={() => setKind(kind === k ? "" : k)}>
            {k}
          </Chip>
        ))}
      </div>

      <section className="mt-4">
        {sorted.length === 0 ? (
          <Empty icon={<Search className="size-5" />} title="Nenhum perfil por aqui" text="Experimente outra cidade ou categoria." />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {sorted.map((p, i) => (
              <ProfileCard key={p.id} db={db} p={p} fav={favs.has(p.id)} index={i} />
            ))}
          </div>
        )}
      </section>

      {partners.length > 0 && (
        <section className="mt-8">
          <SectionTitle
            action={
              <Link href="/estabelecimentos" className="text-sm text-gold">
                Ver todos
              </Link>
            }
          >
            Parceiros PRIVÉ
          </SectionTitle>
          <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5">
            {partners.map((e) => (
              <Link key={e.id} href={`/estabelecimentos/${e.id}`} className="w-60 shrink-0">
                <Art hue={e.hue} label={e.name} className="aspect-[16/10] rounded-2xl">
                  <div className="absolute inset-x-0 bottom-0 p-3">
                    <p className="text-[11px] text-gold">{e.kind}</p>
                    <p className="font-bold">{e.name}</p>
                    <p className="text-xs text-ink-2">{e.region}</p>
                  </div>
                </Art>
              </Link>
            ))}
          </div>
        </section>
      )}

      {!isPremium(me) && (
        <Link href="/planos" className="mt-8 flex items-center justify-between rounded-2xl bg-gradient-to-r from-gold-2 to-gold px-4 py-3.5 text-black">
          <span>
            <span className="block text-[15px] font-bold">Seja Cliente Premium</span>
            <span className="text-xs">Filtros avançados, selo e suporte prioritário</span>
          </span>
          <span className="rounded-full bg-black px-3 py-1.5 text-xs font-semibold text-gold">Conhecer</span>
        </Link>
      )}

      <CitySheet open={cityOpen} onClose={() => setCityOpen(false)} value={city} onChange={setCity} />
    </div>
  );
}
