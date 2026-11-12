"use client";

import { useState } from "react";
import { Download, KeyRound } from "lucide-react";

import { useSession } from "@/components/guard";
import { Button, Card, Field, Input, Notice, Spinner, Toggle, TopBar } from "@/components/ui";
import { AppError, changePassword, exportMyData, unblockUser, updateConsent, userName } from "@/lib/db";

export default function PrivacyPage() {
  const s = useSession();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!s) return <Spinner />;
  const { db, me } = s;
  const blocked = db.blocks.filter((b) => b.userId === me.id);

  function download() {
    const blob = new Blob([exportMyData()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "prive-meus-dados.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function savePassword() {
    try {
      await changePassword(cur, next);
      setMsg({ ok: true, text: "Senha alterada." });
      setCur("");
      setNext("");
    } catch (e) {
      setMsg({ ok: false, text: e instanceof AppError ? e.message : "Erro" });
    }
  }

  return (
    <>
      <TopBar title="Privacidade" back="/conta" />

      <h2 className="mt-2 mb-2 text-[11px] tracking-[0.2em] text-ink-3 uppercase">Consentimentos (LGPD)</h2>
      <Card className="divide-y divide-line px-4">
        <Toggle checked onChange={() => undefined} label="Termos e Política de Privacidade" hint={`Aceitos em ${new Date(me.consent.updatedAt).toLocaleDateString("pt-BR")} · obrigatório`} />
        <Toggle checked={me.consent.analytics} onChange={(v) => updateConsent({ analytics: v })} label="Métricas de uso anônimas" hint="Ajuda a melhorar o app. Opcional." />
        <Toggle checked={me.consent.marketing} onChange={(v) => updateConsent({ marketing: v })} label="Comunicações por e-mail" hint="Novidades discretas. Opcional." />
      </Card>

      <h2 className="mt-6 mb-2 text-[11px] tracking-[0.2em] text-ink-3 uppercase">Seus dados</h2>
      <Card className="space-y-3 p-4">
        <p className="text-sm text-ink-2">Baixe uma cópia de todos os dados que o PRIVÉ guarda sobre você.</p>
        <Button variant="outline" onClick={download} className="w-full">
          <Download className="size-4" /> Exportar meus dados
        </Button>
        <p className="text-[11px] text-ink-3">
          Data de nascimento e documentos ficam em área protegida e nunca aparecem no perfil público. Encarregado de dados (DPO): privacidade@prive.app
        </p>
      </Card>

      <h2 className="mt-6 mb-2 text-[11px] tracking-[0.2em] text-ink-3 uppercase">Senha</h2>
      <Card className="space-y-3 p-4">
        <Field label="Senha atual">
          <Input type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" />
        </Field>
        <Field label="Nova senha">
          <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        </Field>
        {msg && <Notice tone={msg.ok ? "gold" : "bad"}>{msg.text}</Notice>}
        <Button variant="outline" onClick={savePassword} disabled={!cur || !next} className="w-full">
          <KeyRound className="size-4" /> Alterar senha
        </Button>
      </Card>

      <h2 className="mt-6 mb-2 text-[11px] tracking-[0.2em] text-ink-3 uppercase">Bloqueados</h2>
      <Card className="divide-y divide-line px-4">
        {blocked.length === 0 ? (
          <p className="py-4 text-sm text-ink-3">Ninguém bloqueado.</p>
        ) : (
          blocked.map((b) => (
            <div key={b.blockedUserId} className="flex items-center justify-between py-3">
              <span className="text-[15px]">{db.professionals.find((p) => p.userId === b.blockedUserId)?.displayName ?? userName(db, b.blockedUserId)}</span>
              <button onClick={() => unblockUser(b.blockedUserId)} className="text-xs text-gold">
                Desbloquear
              </button>
            </div>
          ))
        )}
      </Card>
    </>
  );
}
