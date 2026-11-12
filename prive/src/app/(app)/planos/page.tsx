"use client";

import Link from "next/link";
import { Check } from "lucide-react";

import { Crown } from "@/components/art";
import { useSession } from "@/components/guard";
import { Button, Spinner, TopBar, cn } from "@/components/ui";
import { PLANS, type PlanId } from "@/lib/config";
import { cancelPlan, isPremium } from "@/lib/db";
import { brlCents as brl } from "@/lib/format";

export default function PlansPage() {
  const s = useSession(["client", "professional"]);
  if (!s) return <Spinner />;
  const { me } = s;
  const premium = isPremium(me);
  const plans = (Object.keys(PLANS) as PlanId[]).filter((id) => PLANS[id].audience === me.role);

  return (
    <>
      <TopBar back title="Planos" />
      <div className="mb-6 text-center">
        <Crown className="mx-auto h-7 w-12" />
        <h2 className="mt-3 text-2xl font-bold">{me.role === "client" ? "PRIVÉ Premium" : "Mais visibilidade"}</h2>
        <p className="mt-1 text-sm text-ink-2">{me.role === "client" ? "Uma experiência ainda mais exclusiva." : "Apareça primeiro para quem procura na sua cidade."}</p>
      </div>
      <div className="space-y-3">
        {plans.map((id, i) => {
          const p = PLANS[id];
          return (
            <div key={id} className={cn("rounded-2xl border p-5", i === 0 ? "border-gold bg-gold/[0.06]" : "border-line bg-card")}>
              <div className="flex items-baseline justify-between">
                <p className="text-lg font-bold">{p.name}</p>
                <p>
                  <span className="text-2xl font-bold text-gold">{brl(p.price)}</span>
                  <span className="text-sm text-ink-2"> /{p.period}</span>
                </p>
              </div>
              <ul className="mt-3 space-y-2">
                {p.perks.map((perk) => (
                  <li key={perk} className="flex items-center gap-2 text-sm text-ink-2">
                    <Check className="size-4 text-gold" /> {perk}
                  </li>
                ))}
              </ul>
              <Link
                href={`/pagamento?plano=${id}`}
                className={cn(
                  "mt-4 flex h-11 items-center justify-center rounded-xl text-[15px] font-semibold",
                  i === 0 ? "bg-gradient-to-b from-gold-2 to-gold text-black" : "border border-gold text-gold",
                )}
              >
                {premium && id !== "pro-destaque-7d" ? "Renovar" : "Assinar"}
              </Link>
            </div>
          );
        })}
      </div>
      {premium && (
        <Button variant="ghost" className="mt-4 w-full" onClick={cancelPlan}>
          Cancelar assinatura
        </Button>
      )}
      <p className="mt-6 text-center text-[11px] leading-relaxed text-ink-3">
        Os planos dão acesso a recursos da plataforma. O PRIVÉ não cobra, não recebe e não intermedeia valores de encontros.
      </p>
    </>
  );
}
