"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Building2, Sparkles, User } from "lucide-react";

import { Logo } from "@/components/art";
import { Button, Checkbox, Field, Input, Notice, TopBar, cn } from "@/components/ui";
import { AppError, signUp } from "@/lib/db";
import { HOME_BY_ROLE } from "@/lib/routes";

const ROLES = [
  { id: "client", label: "Cliente", text: "Descobrir perfis e solicitar reservas", icon: User },
  { id: "professional", label: "Profissional", text: "Perfil independente verificado", icon: Sparkles },
  { id: "partner", label: "Estabelecimento", text: "Hotel, lounge ou spa parceiro", icon: Building2 },
] as const;

export default function SignUpPage() {
  const router = useRouter();
  const [role, setRole] = useState<(typeof ROLES)[number]["id"]>("client");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [adult, setAdult] = useState(false);
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signUp({ name, email, password, birthdate, role, confirmAdult: adult, acceptTerms: terms });
      router.replace(HOME_BY_ROLE[role]);
    } catch (err) {
      setError(err instanceof AppError ? err.message : "Não foi possível criar a conta.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <TopBar back="/entrar" right={<Logo className="text-lg" />} />
      <h1 className="font-display text-4xl leading-tight animate-rise">Criar cadastro</h1>
      <p className="mt-2 mb-6 text-sm text-ink-3">Seus dados são protegidos e nunca exibidos publicamente.</p>

      <form onSubmit={submit} className="space-y-4 animate-rise [animation-delay:60ms]">
        <div className="grid gap-2">
          {ROLES.map((r) => (
            <button
              type="button"
              key={r.id}
              onClick={() => setRole(r.id)}
              className={cn("flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition", role === r.id ? "border-gold bg-gold/[0.07]" : "border-line bg-card hover:border-line-2")}
            >
              <r.icon className={cn("size-5", role === r.id ? "text-gold" : "text-ink-3")} strokeWidth={1.5} />
              <span>
                <span className="block text-[15px]">{r.label}</span>
                <span className="block text-xs text-ink-3">{r.text}</span>
              </span>
            </button>
          ))}
        </div>

        <Field label={role === "partner" ? "Nome do responsável" : "Nome"}>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
        </Field>
        <Field label="E-mail">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </Field>
        <Field label="Senha" hint="Mínimo de 8 caracteres, com letras e números.">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
        </Field>
        <Field label="Data de nascimento" hint="Usada apenas para confirmar a maioridade.">
          <Input type="date" value={birthdate} onChange={(e) => setBirthdate(e.target.value)} max={new Date().toISOString().slice(0, 10)} required />
        </Field>

        <div className="space-y-3 pt-1">
          <Checkbox checked={adult} onChange={setAdult}>
            Declaro, sob as penas da lei, que tenho <strong className="text-ink">18 anos ou mais</strong>.
          </Checkbox>
          <Checkbox checked={terms} onChange={setTerms}>
            Li e aceito os <span className="text-gold">Termos de Uso</span> e a <span className="text-gold">Política de Privacidade</span> (LGPD).
          </Checkbox>
        </div>

        {role !== "client" && (
          <Notice>
            {role === "professional"
              ? "Para publicar seu perfil, você enviará um documento oficial com foto e uma selfie. Perfis só ficam visíveis após a verificação de identidade e maioridade."
              : "Estabelecimentos passam por análise documental (CNPJ e alvará de funcionamento) antes de ficarem visíveis."}
          </Notice>
        )}
        {error && <Notice tone="bad">{error}</Notice>}
        <Button type="submit" loading={loading} className="w-full">
          Criar conta
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-3">
        Já tem conta?{" "}
        <Link href="/entrar" className="text-gold">
          Entrar
        </Link>
      </p>
    </>
  );
}
