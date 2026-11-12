"use client";

import { LifeBuoy, PhoneCall, ShieldAlert } from "lucide-react";

import { Card, Notice, TopBar } from "@/components/ui";

const FAQ = [
  ["Como funciona a verificação?", "Perfis profissionais enviam documento oficial com foto e uma selfie. Nossa equipe confere identidade e maioridade antes de publicar. O selo dourado indica perfil verificado."],
  ["O PRIVÉ processa pagamentos?", "Não. Nesta versão a plataforma não intermedeia pagamentos nem cobra comissões. Nunca envie dinheiro antecipado."],
  ["Quem vê meus dados?", "Seu nome de exibição aparece apenas para quem você interage. E-mail, data de nascimento e documentos nunca são públicos."],
  ["Como denuncio algo?", "Use o menu ⋯ em qualquer perfil ou conversa. Denúncias envolvendo menores ou exploração são tratadas com prioridade máxima e encaminhadas às autoridades."],
];

export default function SupportPage() {
  return (
    <>
      <TopBar title="Suporte" back="/conta" />
      <Notice tone="bad">
        <span className="flex items-start gap-2">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            Risco imediato: ligue <strong>190</strong>. Exploração sexual de crianças e adolescentes ou tráfico de pessoas: <strong>Disque 100</strong> (gratuito, anônimo, 24h). Violência contra a mulher: <strong>180</strong>.
          </span>
        </span>
      </Notice>
      <Card className="mt-4 divide-y divide-line px-4">
        {FAQ.map(([q, a]) => (
          <details key={q} className="group py-4">
            <summary className="cursor-pointer list-none text-[15px] marker:hidden">{q}</summary>
            <p className="mt-2 text-sm leading-relaxed text-ink-3">{a}</p>
          </details>
        ))}
      </Card>
      <Card className="mt-4 space-y-3 p-4 text-sm text-ink-2">
        <p className="flex items-center gap-2">
          <LifeBuoy className="size-4 text-gold" /> suporte@prive.app — resposta em até 24h
        </p>
        <p className="flex items-center gap-2">
          <PhoneCall className="size-4 text-gold" /> Canal de segurança prioritário 24h no menu de denúncia
        </p>
      </Card>
    </>
  );
}
