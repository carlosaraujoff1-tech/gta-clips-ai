"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Building2, CalendarDays, Heart, House, LayoutGrid, MessageCircle, Search, UserRound } from "lucide-react";

import { cn } from "./ui";
import type { Role } from "@/lib/types";

const NAV: Record<Role, { href: string; label: string; icon: typeof House }[]> = {
  client: [
    { href: "/inicio", label: "Início", icon: House },
    { href: "/buscar", label: "Buscar", icon: Search },
    { href: "/favoritos", label: "Favoritos", icon: Heart },
    { href: "/reservas", label: "Reservas", icon: CalendarDays },
    { href: "/conta", label: "Conta", icon: UserRound },
  ],
  professional: [
    { href: "/profissional", label: "Painel", icon: LayoutGrid },
    { href: "/mensagens", label: "Mensagens", icon: MessageCircle },
    { href: "/notificacoes", label: "Alertas", icon: Bell },
    { href: "/conta", label: "Conta", icon: UserRound },
  ],
  partner: [
    { href: "/parceiro", label: "Painel", icon: Building2 },
    { href: "/notificacoes", label: "Alertas", icon: Bell },
    { href: "/conta", label: "Conta", icon: UserRound },
  ],
  admin: [],
};

export function BottomNav({ role, unread = 0 }: { role: Role; unread?: number }) {
  const path = usePathname();
  const items = NAV[role];
  const detail = /^\/(perfil|mensagens|estabelecimentos)\/[^/]+|^\/(pagamento|planos)/.test(path);
  if (!items.length || detail) return null;
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-black/90 backdrop-blur-xl">
      <ul className="mx-auto flex max-w-lg justify-around px-2 pt-2">
        {items.map(({ href, label, icon: Icon }) => {
          const active = path === href || path.startsWith(`${href}/`);
          return (
            <li key={href} className="flex-1">
              <Link href={href} className={cn("relative flex flex-col items-center gap-1 py-1 text-[11px] transition", active ? "font-semibold text-gold" : "text-ink-2 hover:text-ink")}>
                <Icon className={cn("size-6", active && Icon !== Search && Icon !== CalendarDays && "fill-gold")} strokeWidth={active ? 1.8 : 1.5} />
                {label}
                {href === "/notificacoes" && unread > 0 && <span className="absolute top-0 right-[calc(50%-16px)] size-2 rounded-full bg-gold" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
