"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarDays, ChevronRight, EyeOff, Heart, LayoutDashboard, LifeBuoy, LogOut, Pencil, Shield, Trash2 } from "lucide-react";

import { Avatar } from "@/components/art";
import { useSession } from "@/components/guard";
import { Button, Card, Field, Input, Notice, Sheet, Spinner, Toggle, TopBar } from "@/components/ui";
import { DEMO_MODE } from "@/lib/config";
import { deleteMyAccount, resetDemo, signOut, updateAccount } from "@/lib/db";
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

  const rows = [
    ...(me.role === "client"
      ? [
          { href: "/favoritos", icon: Heart, label: "Favoritos", meta: String(favCount) },
          { href: "/reservas", icon: CalendarDays, label: "Histórico de reservas", meta: String(bookingCount) },
        ]
      : [{ href: HOME_BY_ROLE[me.role], icon: LayoutDashboard, label: "Meu painel", meta: "" }]),
    { href: "/conta/privacidade", icon: Shield, label: "Privacidade e dados", meta: "" },
    { href: "/conta/suporte", icon: LifeBuoy, label: "Suporte e segurança", meta: "" },
  ];

  return (
    <>
      <TopBar title="Minha conta" back={me.role === "admin" ? "/admin" : undefined} />
      <div className="flex flex-col items-center pt-2 pb-6 text-center animate-rise">
        <Avatar hue={me.hue} name={me.name} size={88} />
        <h2 className="font-display mt-4 text-3xl">{me.name}</h2>
        <p className="text-xs tracking-[0.2em] text-gold uppercase">{ROLE_LABEL[me.role]}</p>
        <p className="mt-1 text-sm text-ink-3">{me.email}</p>
        <button onClick={() => (setName(me.name), setEdit(true))} className="mt-3 flex items-center gap-1.5 text-xs text-ink-2 hover:text-gold">
          <Pencil className="size-3" /> Editar perfil
        </button>
      </div>

      <Card className="divide-y divide-line px-4">
        {rows.map((r) => (
          <Link key={r.href} href={r.href} className="flex items-center gap-3 py-4">
            <r.icon className="size-[18px] text-gold" strokeWidth={1.5} />
            <span className="flex-1 text-[15px]">{r.label}</span>
            {r.meta && <span className="text-sm text-ink-3">{r.meta}</span>}
            <ChevronRight className="size-4 text-ink-3" />
          </Link>
        ))}
      </Card>

      <Card className="mt-4 px-4">
        <Toggle checked={me.discreetMode} onChange={(v) => updateAccount({ discreetMode: v })} label="Modo discreto" hint="Desfoca imagens até você tocar nelas." />
      </Card>
      <p className="mt-2 flex items-center gap-1.5 px-1 text-[11px] text-ink-3">
        <EyeOff className="size-3" /> Dica: instale o PRIVÉ na tela inicial para abrir sem histórico do navegador.
      </p>

      <div className="mt-6 grid gap-2">
        <Button variant="outline" onClick={() => (signOut(), router.replace("/entrar"))}>
          <LogOut className="size-4" /> Sair
        </Button>
        <Button variant="ghost" className="text-bad hover:text-bad" onClick={() => setDel(true)}>
          <Trash2 className="size-4" /> Excluir conta
        </Button>
        {DEMO_MODE && (
          <button onClick={() => (resetDemo(), router.replace("/entrar"))} className="py-2 text-[11px] text-ink-3 underline-offset-4 hover:underline">
            Restaurar dados de demonstração
          </button>
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
    </>
  );
}
