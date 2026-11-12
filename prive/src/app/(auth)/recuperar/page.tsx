"use client";

import { useState } from "react";
import { MailCheck } from "lucide-react";

import { Button, Field, Input, LinkButton, TopBar } from "@/components/ui";
import { requestPasswordReset } from "@/lib/db";

export default function RecoverPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await requestPasswordReset(email);
    setLoading(false);
    setSent(true);
  }

  return (
    <>
      <TopBar back="/entrar" />
      {sent ? (
        <div className="pt-16 text-center animate-rise">
          <div className="mx-auto mb-5 grid size-16 place-items-center rounded-full border border-gold/40 text-gold">
            <MailCheck className="size-7" strokeWidth={1.4} />
          </div>
          <h1 className="font-display text-3xl">Verifique seu e-mail</h1>
          <p className="mx-auto mt-3 max-w-xs text-sm text-ink-3">
            Se houver uma conta para <span className="text-ink-2">{email}</span>, você receberá um link seguro para criar uma nova senha. O link expira em 1 hora.
          </p>
          <LinkButton href="/entrar" variant="outline" className="mt-8 w-full">
            Voltar para o login
          </LinkButton>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5 animate-rise">
          <div>
            <h1 className="font-display text-4xl">Recuperar senha</h1>
            <p className="mt-2 text-sm text-ink-3">Informe o e-mail da sua conta.</p>
          </div>
          <Field label="E-mail">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </Field>
          <Button type="submit" loading={loading} className="w-full">
            Enviar link
          </Button>
        </form>
      )}
    </>
  );
}
