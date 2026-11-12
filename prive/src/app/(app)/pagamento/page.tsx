"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { CheckCircle2, CreditCard, Lock, QrCode, WalletCards } from "lucide-react";

import { useSession } from "@/components/guard";
import { Button, Empty, LinkButton, Notice, Spinner, TopBar, cn } from "@/components/ui";
import { DEMO_MODE, PLANS, type PlanId } from "@/lib/config";
import { AppError, subscribePlan } from "@/lib/db";
import { brlCents as brl } from "@/lib/format";

const METHODS = [
  { id: "pix", label: "Pix", icon: QrCode, color: "text-[#32bcad]" },
  { id: "credit", label: "Cartão de crédito", icon: CreditCard, color: "text-[#60a5fa]" },
  { id: "debit", label: "Cartão de débito", icon: WalletCards, color: "text-ink" },
] as const;

export default function PaymentPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const s = useSession(["client", "professional"]);
  const params = useSearchParams();
  const router = useRouter();
  const [method, setMethod] = useState<(typeof METHODS)[number]["id"]>("pix");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!s) return <Spinner />;
  const id = params.get("plano") as PlanId | null;
  const plan = id && PLANS[id] && PLANS[id].audience === s.me.role ? PLANS[id] : null;

  if (!plan)
    return (
      <>
        <TopBar back title="Pagamento" />
        <Empty icon={<Lock className="size-5" />} title="Plano não encontrado" action={<LinkButton href="/planos">Ver planos</LinkButton>} />
      </>
    );

  if (done)
    return (
      <div className="pt-20 text-center animate-rise">
        <CheckCircle2 className="mx-auto size-16 text-gold" strokeWidth={1.2} />
        <h2 className="mt-5 text-2xl font-bold">{plan.name} ativado</h2>
        {DEMO_MODE && <p className="mt-2 text-sm text-ink-3">Pagamento simulado — nenhum valor foi cobrado.</p>}
        <Button className="mt-8 w-full" onClick={() => router.replace("/conta")}>
          Ir para minha conta
        </Button>
      </div>
    );

  async function pay() {
    setError(null);
    setLoading(true);
    await new Promise((r) => setTimeout(r, 900));
    try {
      subscribePlan(id!, method);
      setDone(true);
    } catch (e) {
      setError(e instanceof AppError ? e.message : "Falha no pagamento.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <TopBar back title="Pagamento" />
      <h3 className="mt-2 mb-3 text-[15px] font-semibold">Forma de pagamento</h3>
      <div className="space-y-2.5">
        {METHODS.map((m) => (
          <button
            key={m.id}
            onClick={() => setMethod(m.id)}
            className={cn("flex h-14 w-full items-center gap-4 rounded-xl border px-4 text-left text-[15px] transition", method === m.id ? "border-gold bg-gold/[0.06]" : "border-line bg-card")}
          >
            <m.icon className={cn("size-6", m.color)} />
            <span className="flex-1">{m.label}</span>
            {method === m.id && <CheckCircle2 className="size-6 fill-gold text-black" />}
          </button>
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-line bg-card p-4">
        <p className="flex justify-between text-sm text-ink-2">
          <span>{plan.name}</span> <span>{brl(plan.price)}</span>
        </p>
        <p className="mt-1 flex justify-between text-sm text-ink-2">
          <span>Período</span> <span>{plan.period}</span>
        </p>
        <div className="my-3 h-px bg-line" />
        <p className="flex justify-between text-lg font-bold">
          <span>Total</span> <span className="text-gold">{brl(plan.price)}</span>
        </p>
      </div>
      <p className="mt-3 text-center text-[11px] text-ink-3">Cobrança discreta na fatura. Cancele quando quiser.</p>
      {DEMO_MODE && (
        <div className="mt-4">
          <Notice tone="mute">Modo demonstração: o pagamento é simulado e nenhum valor é cobrado.</Notice>
        </div>
      )}
      {error && (
        <div className="mt-3">
          <Notice tone="bad">{error}</Notice>
        </div>
      )}
      <Button className="mt-5 w-full" loading={loading} onClick={pay}>
        <Lock className="size-4" /> Finalizar pagamento
      </Button>
    </>
  );
}
