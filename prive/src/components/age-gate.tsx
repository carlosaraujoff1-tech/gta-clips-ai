"use client";

import { useState, useSyncExternalStore } from "react";

import { Logo } from "./art";
import { Button } from "./ui";
import { ageConfirmed, confirmAge } from "@/lib/routes";

const noop = () => () => {};

/** Aviso de acesso exclusivo para adultos, exibido antes de qualquer conteúdo. */
export function AgeGate({ children }: { children: React.ReactNode }) {
  const stored = useSyncExternalStore<boolean | null>(noop, ageConfirmed, () => null);
  const [ok, setOk] = useState(false);
  const [denied, setDenied] = useState(false);

  if (stored || ok) return <>{children}</>;
  if (stored === null) return <div className="min-h-dvh bg-void" />;

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-void px-6">
      <div className="w-full max-w-sm text-center animate-rise">
        <Logo className="text-4xl" />
        <div className="hairline mx-auto my-8 w-24" />
        <p className="text-[11px] tracking-[0.3em] text-gold uppercase">Conteúdo restrito · 18+</p>
        <h1 className="font-display mt-3 text-3xl leading-tight">Acesso exclusivo para maiores de 18 anos</h1>
        <p className="mt-4 text-sm leading-relaxed text-ink-3">
          O PRIVÉ é destinado somente a adultos. A participação de menores de idade é proibida e denunciada às
          autoridades. Ao continuar, você declara ter 18 anos ou mais.
        </p>
        {denied ? (
          <p className="mt-8 text-sm text-bad">Este conteúdo não está disponível para você.</p>
        ) : (
          <div className="mt-8 grid gap-3">
            <Button onClick={() => (confirmAge(), setOk(true))}>Tenho 18 anos ou mais</Button>
            <Button variant="ghost" onClick={() => setDenied(true)}>
              Sou menor de 18 anos
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
