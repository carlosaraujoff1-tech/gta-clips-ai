"use client";

import { useState } from "react";
import { ShieldAlert } from "lucide-react";

import { Button, Field, Notice, Sheet, Textarea, cn } from "./ui";
import { REPORT_REASONS, URGENT_REASONS } from "@/lib/config";
import { AppError, blockUser, fileReport } from "@/lib/db";
import type { ReportTarget } from "@/lib/types";

export function ReportSheet({
  open,
  onClose,
  targetType,
  targetId,
  blockUserId,
  name,
  onBlocked,
}: {
  open: boolean;
  onClose: () => void;
  targetType: ReportTarget;
  targetId: string;
  blockUserId?: string;
  name: string;
  onBlocked?: () => void;
}) {
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    onClose();
    setTimeout(() => {
      setDone(false);
      setReason("");
      setDetails("");
    }, 300);
  };

  function submit() {
    try {
      fileReport(targetType, targetId, reason, details);
      if (alsoBlock && blockUserId) {
        blockUser(blockUserId);
        onBlocked?.();
      }
      setDone(true);
    } catch (e) {
      setError(e instanceof AppError ? e.message : "Erro ao enviar.");
    }
  }

  return (
    <Sheet open={open} onClose={close} title={done ? "Denúncia enviada" : `Denunciar ${name}`}>
      {done ? (
        <div className="space-y-4 pb-4">
          <p className="text-sm text-ink-2">Obrigado. Nossa equipe de moderação vai analisar com prioridade e sigilo. Você não será identificado para a outra parte.</p>
          {URGENT_REASONS.has(reason) && (
            <Notice tone="bad">
              Em caso de risco imediato, ligue <strong>190</strong>. Para denunciar exploração sexual de crianças e adolescentes ou tráfico de pessoas, use o <strong>Disque 100</strong> (gratuito e anônimo).
            </Notice>
          )}
          <Button onClick={close} className="w-full">
            Fechar
          </Button>
        </div>
      ) : (
        <div className="space-y-4 pb-4">
          <div className="grid gap-2">
            {REPORT_REASONS.map((r) => (
              <button
                key={r}
                onClick={() => setReason(r)}
                className={cn(
                  "flex items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm transition",
                  reason === r ? "border-gold bg-gold/[0.07]" : "border-line hover:border-line-2",
                  URGENT_REASONS.has(r) && "text-bad",
                )}
              >
                {URGENT_REASONS.has(r) && <ShieldAlert className="size-4 shrink-0" />}
                {r}
              </button>
            ))}
          </div>
          <Field label="Detalhes (opcional)">
            <Textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} placeholder="Conte o que aconteceu" />
          </Field>
          {blockUserId && (
            <label className="flex items-center gap-3 text-sm text-ink-2">
              <input type="checkbox" checked={alsoBlock} onChange={(e) => setAlsoBlock(e.target.checked)} className="size-4 accent-[#e0ad3e]" />
              Também bloquear {name}
            </label>
          )}
          {error && <Notice tone="bad">{error}</Notice>}
          <Button disabled={!reason} onClick={submit} className="w-full">
            Enviar denúncia
          </Button>
        </div>
      )}
    </Sheet>
  );
}
