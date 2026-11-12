"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { Logo } from "@/components/art";
import { Button, Field, Input, Notice } from "@/components/ui";
import { DEMO_MODE } from "@/lib/config";
import { AppError, currentUser, signIn, useDB } from "@/lib/db";
import { HOME_BY_ROLE } from "@/lib/routes";
import { DEMO_PASSWORD } from "@/lib/seed";

const DEMOS = [
  { label: "Cliente", email: "cliente@demo.prive" },
  { label: "Profissional", email: "pro1@demo.prive" },
  { label: "Parceiro", email: "parceiro@demo.prive" },
  { label: "Admin", email: "admin@demo.prive" },
];

export default function LoginPage() {
  const router = useRouter();
  const db = useDB();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [submitted, setSubmitted] = useState(false);
  useEffect(() => {
    const u = currentUser(db);
    if (u && !submitted) router.replace(HOME_BY_ROLE[u.role]);
  }, [db, router, submitted]);

  async function submit(e?: React.FormEvent, override?: { email: string; password: string }) {
    e?.preventDefault();
    setError(null);
    setLoading(true);
    setSubmitted(true);
    try {
      const u = await signIn(override?.email ?? email, override?.password ?? password);
      const next = new URLSearchParams(window.location.search).get("next");
      router.replace(next?.startsWith("/") && !next.startsWith("//") ? next : HOME_BY_ROLE[u.role]);
    } catch (err) {
      setError(err instanceof AppError ? err.message : "Não foi possível entrar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="pt-16 pb-10 text-center animate-rise">
        <Logo className="text-4xl" />
        <p className="mt-4 text-sm text-ink-3">Bem-vindo de volta.</p>
      </div>

      <form onSubmit={submit} className="space-y-4 animate-rise [animation-delay:80ms]">
        <Field label="E-mail">
          <Input type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" required />
        </Field>
        <Field label="Senha">
          <div className="relative">
            <Input type={show ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required className="pr-12" />
            <button type="button" aria-label={show ? "Ocultar senha" : "Mostrar senha"} onClick={() => setShow(!show)} className="absolute top-0 right-0 grid h-12 w-12 place-items-center text-ink-3">
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>
        <div className="flex justify-end">
          <Link href="/recuperar" className="text-xs text-gold hover:text-gold-2">
            Esqueci minha senha
          </Link>
        </div>
        {error && <Notice tone="bad">{error}</Notice>}
        <Button type="submit" loading={loading} className="w-full">
          Entrar
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-3">
        Ainda não tem conta?{" "}
        <Link href="/cadastro" className="text-gold hover:text-gold-2">
          Criar cadastro
        </Link>
      </p>

      {DEMO_MODE && (
        <div className="mt-auto pt-10">
          <div className="mb-3 flex items-center gap-3 text-[10px] tracking-[0.3em] text-ink-3 uppercase">
            <span className="hairline flex-1" /> Demonstração <span className="hairline flex-1" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {DEMOS.map((d) => (
              <button key={d.email} onClick={() => submit(undefined, { email: d.email, password: DEMO_PASSWORD })} className="rounded-2xl border border-line bg-card px-3 py-2.5 text-left transition hover:border-gold-3">
                <span className="block text-sm">{d.label}</span>
                <span className="block truncate text-[11px] text-ink-3">{d.email}</span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-center text-[11px] text-ink-3">Senha das contas de teste: {DEMO_PASSWORD}</p>
        </div>
      )}

      <p className="mt-8 text-center text-[11px] leading-relaxed text-ink-3">Acesso exclusivo para maiores de 18 anos. Conexão criptografada.</p>
    </>
  );
}
