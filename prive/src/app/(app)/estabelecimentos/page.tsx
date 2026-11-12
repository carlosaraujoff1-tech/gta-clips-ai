"use client";

import Link from "next/link";
import { Building2, MapPin } from "lucide-react";

import { Art } from "@/components/art";
import { useSession } from "@/components/guard";
import { Empty, Spinner, TopBar } from "@/components/ui";

export default function EstablishmentsPage() {
  const s = useSession(["client"]);
  if (!s) return <Spinner />;
  const list = s.db.establishments.filter((e) => e.status === "approved");
  return (
    <>
      <TopBar title="Parceiros" back />
      <p className="mb-5 text-sm text-ink-3">Hotéis, lounges e spas com alvará verificado e entrada discreta.</p>
      {list.length === 0 ? (
        <Empty icon={<Building2 className="size-5" />} title="Nenhum parceiro ainda" />
      ) : (
        <div className="space-y-4">
          {list.map((e, i) => (
            <Link key={e.id} href={`/estabelecimentos/${e.id}`} className="block animate-rise" style={{ animationDelay: `${i * 50}ms` }}>
              <Art hue={e.hue} label={e.name} className="aspect-[16/9]">
                <div className="absolute inset-x-0 bottom-0 p-4">
                  <p className="text-[10px] tracking-[0.25em] text-gold uppercase">{e.kind}</p>
                  <p className="font-display text-2xl">{e.name}</p>
                  <p className="flex items-center gap-1 text-xs text-ink-3">
                    <MapPin className="size-3" /> {e.region}, {e.city}
                  </p>
                </div>
              </Art>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
