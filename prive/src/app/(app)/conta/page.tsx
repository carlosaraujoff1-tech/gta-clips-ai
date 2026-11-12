"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bell, CalendarDays, ChevronRight, CircleHelp, Heart, LayoutDashboard, LogOut, MessageCircle, Settings, Trash2 } from "lucide-react";

import { Avatar, Crown } from "@/components/art";
import { useSession } from "@/components/guard";
import { Button, Field, Input, Notice, Sheet, Spinner, Toggle } from "@/components/ui";
import { DEMO_MODE } from "@/lib/config";
import { deleteMyAccount, isPremium, resetDemo, signOut, updateAccount } from "@/lib/db";
import { HOME_BY_ROLE } from "@/lib/routes";

const ROLE_LABEL = { client: "Cliente", professional: "Profissional", partner: "Estabelecimento parceiro", admin: "Administrador" };

export default function AccountPage() {
  const s = useSession();
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState("");
  const [del, setDel] = useState(false);
  const [confirm, setConfirm] = useState("");
  if (!s) return <Spinner />;
  const { db, me } = s;
  const favCount = db.favorites.filter((f) => f.userId === me.id).length;
  const bookingCount = db.bookings.filter((b) => b.clientId === me.id).length;

  const premium = isPremium(me);
  const rows = [
    ...(me.role === "client"
      ? [
          { href: "/reservas", icon: CalendarDays, label: "Minhas reservas", meta: String(bookingCount) },
          { href: "/favoritos", icon: Heart, label: "Meus favoritos", meta: String(favCount) },
          { href: "/mensagens", icon: MessageCircle, label: "Mensagens", meta: "" },
        ]
      : [
          { href: HOME_BY_ROLE[me.role], icon: LayoutDashboard, label: "Meu painel", meta: "" },
          ...(me.role === "professional" ? [{ href: "/mensagens", icon: MessageCircle, label: "Mensagens", meta: "" }] : []),
        ]),
    { href: "/notificacoes", icon: Bell, label: "Notificações", meta: "" },
    { href: "/conta/suporte", icon: CircleHelp, label: "Suporte", meta: "" },
    { href: "/conta/privacidade", icon: Settings, label: "Configurações e privacidade", meta: "" },
  ];

  return (
    <div className="safe-top pt-4">
      <div className="flex items-center gap-4 animate-rise">
        <Avatar hue={me.hue} name={me.name} size={68} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xl font-bold">{me.name}</p>
          {premium ? (
            <span className="mt-1 inline-flex items-center gap-1 rounded-md bg-gradient-to-b from-gold-2 to-gold px-2 py-0.5 text-xs font-semibold text-black">
              <Crown className="h-3 w-[18px]" /> {me.role === "client" ? "Cliente Premium" : "Perfil Premium"}
            </span>
          ) : (
            <span className="mt-1 inline-block text-xs text-ink-3">{ROLE_LABEL[me.role]}</span>
          )}
        </div>
        <button aria-label="Editar perfil" onClick={() => (setName(me.name), setEdit(true))} className="grid size-10 place-items-center text-gold">
          <Settings className="size-6" strokeWidth={1.6} />
        </button>
      </div>

      {me.role !== "admin" && me.role !== "partner" && (
        <div className="mt-5 flex items-center justify-between rounded-2xl bg-gradient-to-br from-gold-2 via-gold to-[#c38f2c] px-4 py-4 text-black shadow-[0_12px_40px_-16px_rgba(224,173,62,0.8)]">
          <div>
            <p className="text-sm">Seu plano</p>
            <p className="text-2xl font-bold">{premium ? "Premium" : "Gratuito"}</p>
            {premium && me.planUntil && <p className="text-xs">até {new Date(me.planUntil).toLocaleDateString("pt-BR")}</p>}
          </div>
          <Link href="/planos" className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-gold">
            {premium ? "Gerenciar" : "Assinar"}
          </Link>
        </div>
      )}

      <nav className="mt-5 divide-y divide-line">
        {rows.map((r) => (
          <Link key={r.href} href={r.href} className="flex items-center gap-3 py-3.5">
            <r.icon className="size-[22px] text-ink" strokeWidth={1.5} />
            <span className="flex-1 text-[15px]">{r.label}</span>
            {r.meta && <span className="text-sm text-ink-3">{r.meta}</span>}
            <ChevronRight className="size-4 text-ink-2" />
          </Link>
        ))}
        <div className="py-1">
          <Toggle checked={me.discreetMode} onChange={(v) => updateAccount({ discreetMode: v })} label="Modo discreto" hint="Desfoca imagens até você tocar nelas." />
        </div>
        <button onClick={() => (signOut(), router.replace("/entrar"))} className="flex w-full items-center gap-3 py-3.5 text-left">
          <LogOut className="size-[22px]" strokeWidth={1.5} />
          <span className="flex-1 text-[15px]">Sair</span>
          <ChevronRight className="size-4 text-ink-2" />
        </button>
      </nav>

      <div className="mt-6 grid gap-1">
        <button onClick={() => setDel(true)} className="flex items-center justify-center gap-2 py-2 text-sm text-bad">
          <Trash2 className="size-4" /> Excluir conta
        </button>
        {DEMO_MODE && (
          <button onClick={() => (resetDemo(), router.replace("/entrar"))} className="py-2 text-[11px] text-ink-3 underline-offset-4 hover:underline">
            Restaurar dados de demonstração
          </button>
        )}
        {me.role === "admin" && (
          <Link href="/admin" className="py-2 text-center text-sm text-gold">
            Voltar ao painel administrativo
          </Link>
        )}
      </div>

      <Sheet open={edit} onClose={() => setEdit(false)} title="Editar perfil">
        <div className="space-y-4 pb-4">
          <Field label="Nome de exibição">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Button className="w-full" disabled={!name.trim()} onClick={() => (updateAccount({ name: name.trim() }), setEdit(false))}>
            Salvar
          </Button>
        </div>
      </Sheet>

      <Sheet open={del} onClose={() => setDel(false)} title="Excluir conta">
        <div className="space-y-4 pb-4">
          <Notice tone="bad">
            Esta ação é permanente. Seus dados pessoais, favoritos, perfil e fotos serão apagados; reservas em aberto serão canceladas. Guardamos apenas o registro mínimo exigido por lei (Marco Civil, art. 15).
          </Notice>
          <Field label='Digite "EXCLUIR" para confirmar'>
            <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <Button variant="danger" className="w-full" disabled={confirm !== "EXCLUIR"} onClick={() => (deleteMyAccount(), router.replace("/entrar"))}>
            Excluir definitivamente
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
