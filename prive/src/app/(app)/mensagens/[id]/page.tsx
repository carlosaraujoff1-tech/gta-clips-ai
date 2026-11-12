"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Ban, Flag, MoreHorizontal, SendHorizontal, ShieldCheck } from "lucide-react";

import { Avatar } from "@/components/art";
import { useSession } from "@/components/guard";
import { ReportSheet } from "@/components/report-sheet";
import { Button, Empty, Sheet, Spinner, TopBar, cn } from "@/components/ui";
import { AppError, blockUser, conversationPeer, isBlockedBetween, sendMessage } from "@/lib/db";

export default function ConversationPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const s = useSession(["client", "professional"]);
  const [text, setText] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [report, setReport] = useState<{ type: "user" | "message"; id: string } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const count = s?.db.messages.filter((m) => m.conversationId === id).length ?? 0;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [count]);

  if (!s) return <Spinner />;
  const { db, me } = s;
  const peer = conversationPeer(db, id, me);
  if (!peer || isBlockedBetween(db, me.id, peer.peerUserId)) {
    return (
      <>
        <TopBar back="/mensagens" />
        <Empty icon={<ShieldCheck className="size-5" />} title="Conversa indisponível" />
      </>
    );
  }
  const msgs = db.messages.filter((m) => m.conversationId === id);

  function send(e: React.FormEvent) {
    e.preventDefault();
    try {
      const r = sendMessage(id, text);
      setText("");
      setHint(r.masked ? "Por segurança, contatos externos e dados de pagamento foram ocultados." : null);
    } catch (err) {
      setHint(err instanceof AppError ? err.message : "Erro ao enviar.");
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar
        back="/mensagens"
        right={
          <button aria-label="Opções" onClick={() => setMenu(true)} className="grid size-10 place-items-center rounded-full hover:bg-card-2">
            <MoreHorizontal className="size-5" />
          </button>
        }
        title={
          <>
            <Avatar hue={peer.hue} name={peer.name} size={34} />
            <span className="truncate text-xl">{peer.name}</span>
          </>
        }
      />

      <div className="mb-4 rounded-2xl border border-gold/20 bg-gold/[0.05] px-4 py-3 text-center text-[11px] leading-relaxed text-ink-3">
        Mantenha a conversa respeitosa. Nunca envie dinheiro antecipado ou documentos. Toque em ⋯ para denunciar ou bloquear.
      </div>

      <div className="flex-1 space-y-2 pb-28">
        {msgs.map((m) => {
          const mine = m.senderId === me.id;
          return (
            <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div
                onContextMenu={(e) => {
                  if (mine) return;
                  e.preventDefault();
                  setReport({ type: "message", id: m.id });
                }}
                className={cn("max-w-[78%] rounded-3xl px-4 py-2.5 text-[15px] leading-snug animate-rise", mine ? "rounded-br-lg bg-gradient-to-b from-gold-2 to-gold text-void" : "rounded-bl-lg border border-line bg-card")}
              >
                {m.text}
                <span className={cn("mt-1 block text-[10px]", mine ? "text-void/60" : "text-ink-3")}>
                  {new Date(m.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  {m.masked && " · dados ocultados"}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <form onSubmit={send} className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-void/90 backdrop-blur-xl">
        <div className="mx-auto max-w-lg px-5 pt-3">
          {hint && <p className="mb-2 text-xs text-warn">{hint}</p>}
          <div className="flex gap-2">
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="Mensagem" className="h-12 flex-1 rounded-full border border-line bg-card px-5 text-[15px] outline-none focus:border-gold-3" />
            <button aria-label="Enviar" disabled={!text.trim()} className="grid size-12 place-items-center rounded-full bg-gradient-to-b from-gold-2 to-gold text-void disabled:opacity-40">
              <SendHorizontal className="size-5" />
            </button>
          </div>
        </div>
      </form>

      <Sheet open={menu} onClose={() => setMenu(false)} title="Segurança">
        <div className="grid gap-2 pb-4">
          <Button variant="outline" className="justify-start" onClick={() => (setMenu(false), setReport({ type: "user", id: peer.peerUserId }))}>
            <Flag className="size-4" /> Denunciar {peer.name}
          </Button>
          <Button variant="danger" className="justify-start" onClick={() => (blockUser(peer.peerUserId), router.replace("/mensagens"))}>
            <Ban className="size-4" /> Bloquear e sair da conversa
          </Button>
          <p className="pt-2 text-center text-[11px] text-ink-3">Dica: mantenha pressionada uma mensagem para denunciá-la.</p>
        </div>
      </Sheet>
      {report && (
        <ReportSheet open onClose={() => setReport(null)} targetType={report.type} targetId={report.id} blockUserId={peer.peerUserId} name={peer.name} onBlocked={() => router.replace("/mensagens")} />
      )}
    </div>
  );
}
