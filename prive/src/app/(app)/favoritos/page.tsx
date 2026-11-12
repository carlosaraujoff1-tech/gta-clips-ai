"use client";

import { Heart } from "lucide-react";

import { useSession } from "@/components/guard";
import { ProfileCard } from "@/components/profile-card";
import { Empty, LinkButton, Spinner, TopBar } from "@/components/ui";
import { searchProfessionals } from "@/lib/db";

export default function FavoritesPage() {
  const s = useSession(["client"]);
  if (!s) return <Spinner />;
  const ids = new Set(s.db.favorites.filter((f) => f.userId === s.me.id).map((f) => f.professionalId));
  const list = searchProfessionals(s.db, {}, s.me.id).filter((p) => ids.has(p.id));
  return (
    <>
      <TopBar title="Favoritos" back />
      {list.length === 0 ? (
        <Empty icon={<Heart className="size-5" />} title="Nenhum favorito" text="Toque no coração de um perfil para salvá-lo aqui." action={<LinkButton href="/inicio">Explorar</LinkButton>} />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {list.map((p, i) => (
            <ProfileCard key={p.id} db={s.db} p={p} fav index={i} />
          ))}
        </div>
      )}
    </>
  );
}
