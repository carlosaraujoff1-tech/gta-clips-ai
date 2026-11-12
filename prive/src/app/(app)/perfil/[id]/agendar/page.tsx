"use client";

import { useParams } from "next/navigation";

import { Avatar } from "@/components/art";
import { BookingFlow } from "@/components/booking-flow";
import { useSession } from "@/components/guard";
import { Empty, Spinner, TopBar, VerifiedSeal } from "@/components/ui";
import { CalendarX } from "lucide-react";

export default function SchedulePage() {
  const { id } = useParams<{ id: string }>();
  const s = useSession(["client"]);
  if (!s) return <Spinner />;
  const p = s.db.professionals.find((x) => x.id === id && x.status === "published");
  return (
    <>
      <TopBar back title="Agendamento" />
      {!p ? (
        <Empty icon={<CalendarX className="size-5" />} title="Perfil indisponível" />
      ) : (
        <>
          <div className="mb-5 flex items-center gap-3">
            <Avatar hue={p.hue} name={p.displayName} size={48} />
            <div>
              <p className="flex items-center gap-1.5 text-[15px]">
                {p.displayName} <VerifiedSeal compact />
              </p>
              <p className="text-xs text-ink-3">
                {p.region}, {p.city}
              </p>
            </div>
          </div>
          <BookingFlow db={s.db} professional={p} />
        </>
      )}
    </>
  );
}
