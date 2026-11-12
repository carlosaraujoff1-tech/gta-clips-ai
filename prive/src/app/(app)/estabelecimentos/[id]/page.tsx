"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { BadgeCheck, Building2, Check, Flag, MapPin } from "lucide-react";

import { Art } from "@/components/art";
import { BookingFlow } from "@/components/booking-flow";
import { useSession } from "@/components/guard";
import { ReportSheet } from "@/components/report-sheet";
import { Button, Empty, Spinner, TopBar } from "@/components/ui";

export default function EstablishmentPage() {
  const { id } = useParams<{ id: string }>();
  const s = useSession(["client"]);
  const [booking, setBooking] = useState(false);
  const [report, setReport] = useState(false);
  if (!s) return <Spinner />;
  const e = s.db.establishments.find((x) => x.id === id && x.status === "approved");
  if (!e)
    return (
      <>
        <TopBar back />
        <Empty icon={<Building2 className="size-5" />} title="Estabelecimento indisponível" />
      </>
    );
  return (
    <>
      <TopBar
        back
        right={
          <button aria-label="Denunciar" onClick={() => setReport(true)} className="grid size-10 place-items-center rounded-full text-ink-3 hover:bg-card-2">
            <Flag className="size-4" />
          </button>
        }
      />
      <div className="no-scrollbar -mx-5 flex snap-x gap-3 overflow-x-auto px-5">
        {e.photos
          .filter((p) => p.status === "approved")
          .map((p) => (
            <Art key={p.id} hue={p.hue} label={e.name} className="aspect-[4/3] w-[85%] shrink-0 snap-center">
              <span className="absolute bottom-3 left-4 text-[10px] tracking-[0.25em] text-ink-3 uppercase">{p.caption}</span>
            </Art>
          ))}
      </div>
      <p className="mt-6 text-[10px] tracking-[0.25em] text-gold uppercase">{e.kind}</p>
      <h1 className="font-display text-3xl">{e.name}</h1>
      <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-3">
        <MapPin className="size-4" /> {e.address}
      </p>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-ok">
        <BadgeCheck className="size-4" /> Alvará verificado pela equipe PRIVÉ
      </p>
      <p className="mt-5 text-[15px] leading-relaxed text-ink-2">{e.description}</p>
      <ul className="mt-5 grid grid-cols-2 gap-2">
        {e.amenities.map((a) => (
          <li key={a} className="flex items-center gap-2 text-sm text-ink-2">
            <Check className="size-4 text-gold" /> {a}
          </li>
        ))}
      </ul>
      <div className="hairline my-7" />
      {booking ? (
        <BookingFlow db={s.db} establishment={e} />
      ) : (
        <Button className="w-full" onClick={() => setBooking(true)}>
          Ver disponibilidade
        </Button>
      )}
      <ReportSheet open={report} onClose={() => setReport(false)} targetType="establishment" targetId={e.id} name={e.name} />
    </>
  );
}
