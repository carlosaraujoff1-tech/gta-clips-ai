"use client";

import Link from "next/link";
import { Heart, MapPin, Star } from "lucide-react";

import { Art } from "./art";
import { VerifiedSeal, cn } from "./ui";
import { FEATURES } from "@/lib/config";
import { ratingOf, toggleFavorite } from "@/lib/db";
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
      className={cn("grid size-9 place-items-center rounded-full bg-black/40 backdrop-blur-md transition active:scale-90", className)}
    >
      <Heart className={cn("size-4", active ? "fill-gold text-gold" : "text-ink")} strokeWidth={1.6} />
    </button>
  );
}

export function ProfileCard({ db, p, fav, wide, index = 0 }: { db: DB; p: Professional; fav: boolean; wide?: boolean; index?: number }) {
  const { avg, count } = ratingOf(db, p.id);
  return (
    <Link href={`/perfil/${p.id}`} className={cn("group block animate-rise", wide ? "w-64 shrink-0" : "")} style={{ animationDelay: `${index * 50}ms` }}>
      <Art hue={p.hue} label={p.displayName} className={cn("transition duration-500 group-hover:scale-[1.01]", wide ? "aspect-[4/5]" : "aspect-[3/4]")}>
        <FavButton active={fav} id={p.id} className="absolute top-3 right-3" />
        <div className="absolute inset-x-0 bottom-0 p-3.5">
          <div className="flex items-center gap-1.5">
            <span className="font-display text-[22px] leading-none">{p.displayName}</span>
            <VerifiedSeal compact />
          </div>
          <p className="mt-1 line-clamp-1 text-xs text-ink-2">{p.headline}</p>
          <div className="mt-2 flex items-center justify-between text-[11px] text-ink-3">
            <span className="flex items-center gap-1">
              <MapPin className="size-3" /> {p.region}
            </span>
            {count > 0 ? (
              <span className="flex items-center gap-1 text-gold-2">
                <Star className="size-3 fill-gold text-gold" /> {avg.toFixed(1)}
              </span>
            ) : (
              FEATURES.priceInfo && p.priceFrom && <span>a partir de {brl(p.priceFrom)}</span>
            )}
          </div>
        </div>
      </Art>
    </Link>
  );
}
