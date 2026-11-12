"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { RotateCcw, Search } from "lucide-react";

import { useSession } from "@/components/guard";
import { ProfileCard } from "@/components/profile-card";
import { Chip, Empty, Field, Select, Sheet, Spinner, TopBar, Button } from "@/components/ui";
import { CATEGORIES, CITIES, FEATURES } from "@/lib/config";
import { ratingOf, searchProfessionals } from "@/lib/db";
import { WEEKDAYS, brl } from "@/lib/format";
import { usePref } from "@/lib/prefs";

export default function SearchPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <SearchInner />
    </Suspense>
  );
}

const PRICES = [300, 500, 800];

function SearchInner() {
  const s = useSession(["client"]);
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [city, setCity] = usePref("city", "São Paulo");
  const [region, setRegion] = useState("");
  const [category, setCategory] = useState("");
  const [weekday, setWeekday] = useState<number | null>(null);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [sort, setSort] = useState<"relevance" | "rating" | "price">("relevance");
  const [open, setOpen] = useState(false);
  if (!s) return <Spinner />;
  const { db, me } = s;

  const favs = new Set(db.favorites.filter((f) => f.userId === me.id).map((f) => f.professionalId));
  let results = searchProfessionals(db, { q, city, region: region || undefined, category: category || undefined, weekday, maxPrice }, me.id);
  if (sort === "rating") results = [...results].sort((a, b) => ratingOf(db, b.id).avg - ratingOf(db, a.id).avg);
  if (sort === "price") results = [...results].sort((a, b) => (a.priceFrom ?? 0) - (b.priceFrom ?? 0));
  const activeCount = [region, category, weekday !== null, maxPrice].filter(Boolean).length;

  const reset = () => {
    setRegion("");
    setCategory("");
    setWeekday(null);
    setMaxPrice(null);
  };

  return (
    <>
      <TopBar title="Buscar" />
      <label className="flex h-12 items-center gap-3 rounded-2xl border border-line bg-card px-4 focus-within:border-gold-3">
        <Search className="size-4 text-ink-3" />
        <input autoFocus={!!params.get("q")} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, bairro ou experiência" className="w-full bg-transparent text-[15px] outline-none placeholder:text-ink-3" />
      </label>

      <div className="no-scrollbar -mx-5 mt-4 flex gap-2 overflow-x-auto px-5">
        <Chip active={activeCount > 0} onClick={() => setOpen(true)}>
          Filtros{activeCount ? ` · ${activeCount}` : ""}
        </Chip>
        {Object.keys(CITIES).map((c) => (
          <Chip
            key={c}
            active={city === c}
            onClick={() => {
              setCity(c);
              setRegion("");
            }}
          >
            {c}
          </Chip>
        ))}
      </div>

      <div className="mt-5 mb-3 flex items-center justify-between text-xs text-ink-3">
        <span>
          {results.length} {results.length === 1 ? "perfil verificado" : "perfis verificados"}
        </span>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="bg-transparent text-gold outline-none">
          <option value="relevance">Relevância</option>
          <option value="rating">Melhor avaliados</option>
          {FEATURES.priceInfo && <option value="price">Menor valor</option>}
        </select>
      </div>

      {results.length === 0 ? (
        <Empty icon={<Search className="size-5" />} title="Nada encontrado" text="Ajuste os filtros para ver mais perfis." action={<Button variant="outline" onClick={reset}>Limpar filtros</Button>} />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {results.map((p, i) => (
            <ProfileCard key={p.id} db={db} p={p} fav={favs.has(p.id)} index={i} />
          ))}
        </div>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} title="Filtros">
        <div className="space-y-5 pb-4">
          <Field label="Cidade">
            <Select value={city} onChange={(v) => (setCity(v), setRegion(""))} options={Object.keys(CITIES)} />
          </Field>
          <Field label="Região">
            <Select value={region} onChange={setRegion} options={CITIES[city] ?? []} placeholder="Todas as regiões" />
          </Field>
          <Field label="Categoria">
            <Select value={category} onChange={setCategory} options={[...CATEGORIES]} placeholder="Todas" />
          </Field>
          <div>
            <p className="mb-2 text-[11px] font-medium tracking-[0.18em] text-ink-3 uppercase">Disponibilidade</p>
            <div className="flex flex-wrap gap-2">
              <Chip active={weekday === null} onClick={() => setWeekday(null)}>
                Qualquer dia
              </Chip>
              {WEEKDAYS.map((d, i) => (
                <Chip key={d} active={weekday === i} onClick={() => setWeekday(i)}>
                  {d}
                </Chip>
              ))}
            </div>
          </div>
          {FEATURES.priceInfo && (
            <div>
              <p className="mb-2 text-[11px] font-medium tracking-[0.18em] text-ink-3 uppercase">Faixa de valor (informativa)</p>
              <div className="flex flex-wrap gap-2">
                <Chip active={!maxPrice} onClick={() => setMaxPrice(null)}>
                  Qualquer
                </Chip>
                {PRICES.map((p) => (
                  <Chip key={p} active={maxPrice === p} onClick={() => setMaxPrice(p)}>
                    até {brl(p)}
                  </Chip>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-ink-3">Valores informados pelo próprio perfil. Nenhum pagamento é feito pela plataforma.</p>
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <Button variant="ghost" onClick={reset} className="flex-1">
              <RotateCcw className="size-4" /> Limpar
            </Button>
            <Button onClick={() => setOpen(false)} className="flex-[2]">
              Ver {results.length} perfis
            </Button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
