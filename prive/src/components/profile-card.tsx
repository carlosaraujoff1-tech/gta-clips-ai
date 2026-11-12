"use client";

import Link from "next/link";
import { ArrowRight, Heart, MapPin, Star } from "lucide-react";

import { Art } from "./art";
import { CheckDot, cn } from "./ui";
import { FEATURES } from "@/lib/config";
import { coverOf, ratingOf, toggleFavorite } from "@/lib/db";
import { brl } from "@/lib/format";
import type { DB, Professional } from "@/lib/types";

export function FavButton({ active, id, className }: { active: boolean; id: string; className?: string }) {
  return (
    <button
      aria-label={active ? "Remover dos favoritos" : "Adicionar aos favoritos"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFavorite(id);
      }}
      className={cn("grid size-9 place-items-center rounded-full transition active:scale-90", className)}
    >
      <Heart className={cn("size-6 drop-shadow", active ? "fill-gold text-gold" : "text-white")} strokeWidth={1.8} />
    </button>
  );
}

/** Distância ilustrativa (no Supabase vem de PostGIS a partir da localização autorizada). */
export function distanceKm(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 997;
  return 1 + (h % 9);
}

export function ProfileCard({ db, p, fav, wide, index = 0 }: { db: DB; p: Professional; fav: boolean; wide?: boolean; index?: number }) {
  const { avg, count } = ratingOf(db, p.id);
  return (
    <Link
      href={`/perfil/${p.id}`}
      className={cn("group block overflow-hidden rounded-2xl border border-line bg-card animate-rise", wide && "w-60 shrink-0")}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <Art hue={p.hue} label={p.displayName} src={coverOf(p)} className="aspect-[4/5] rounded-none rounded-t-2xl">
        <FavButton active={fav} id={p.id} className="absolute top-1.5 left-1.5" />
        <CheckDot className="absolute top-2.5 right-2.5" />
        <div className="absolute inset-x-0 bottom-0 px-3 pb-2">
          <p className="truncate text-[17px] font-bold">{p.displayName}</p>
          {count > 0 && (
            <p className="flex items-center gap-1 text-[13px]">
              <Star className="size-3.5 fill-gold text-gold" />
              <span className="text-gold">{avg.toFixed(1)}</span>
              <span className="text-ink-2">({count})</span>
            </p>
          )}
        </div>
      </Art>
      <div className="space-y-1.5 px-3 pt-2 pb-3">
        {FEATURES.priceInfo && p.priceFrom ? (
          <p className="text-[13px] text-ink-2">
            A partir de <span className="font-bold text-ink">{brl(p.priceFrom)}</span>
          </p>
        ) : (
          <p className="truncate text-[13px] text-ink-2">{p.headline}</p>
        )}
        <p className="flex items-center gap-1 text-[12px] text-ink-2">
          <MapPin className="size-3.5 text-gold" /> {p.region} • {distanceKm(p.id)} km
        </p>
        <span className="mt-1 flex h-9 items-center justify-center gap-1 rounded-lg bg-gradient-to-b from-gold-2 to-gold text-[13px] font-semibold text-black">
          Ver perfil <ArrowRight className="size-4" />
        </span>
      </div>
    </Link>
  );
}
