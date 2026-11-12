"use client";

import Link from "next/link";
import { MessageCircle, Lock } from "lucide-react";

import { Avatar } from "@/components/art";
import { useSession } from "@/components/guard";
import { Empty, Spinner, TopBar } from "@/components/ui";
import { myConversations } from "@/lib/db";
import { relative } from "@/lib/format";

export default function MessagesPage() {
  const s = useSession(["client", "professional"]);
  if (!s) return <Spinner />;
  const convs = myConversations(s.db, s.me);
  return (
    <>
      <TopBar title="Mensagens" />
      <p className="mb-4 flex items-center gap-2 text-xs text-ink-3">
        <Lock className="size-3.5 text-gold" /> Conversas privadas. Contatos externos e chaves de pagamento são ocultados.
      </p>
      {convs.length === 0 ? (
        <Empty icon={<MessageCircle className="size-5" />} title="Nenhuma conversa" text="Inicie uma conversa a partir de um perfil." />
      ) : (
        <ul className="divide-y divide-line">
          {convs.map((c) => (
            <li key={c.conversation.id}>
              <Link href={`/mensagens/${c.conversation.id}`} className="flex items-center gap-3 py-3.5">
                <Avatar hue={c.hue} name={c.name} size={50} src={c.src} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[15px]">{c.name}</span>
                    <span className="text-[11px] text-ink-3">{c.last ? relative(c.last.createdAt) : ""}</span>
                  </div>
                  <p className="truncate text-sm text-ink-3">{c.last ? c.last.text : "Diga olá com respeito."}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
