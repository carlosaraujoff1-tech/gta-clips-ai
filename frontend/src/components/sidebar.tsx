"use client";

import {
  CircleCheck,
  Clapperboard,
  LayoutDashboard,
  Menu,
  Scissors,
  Send,
  Settings,
  Video,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { cx } from "@/components/ui";
import { useApi } from "@/lib/use-api";
import type { Health } from "@/lib/types";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/lives", label: "Lives", icon: Video },
  { href: "/clips", label: "Clips", icon: Scissors },
  { href: "/aprovacao", label: "Aprovação", icon: CircleCheck },
  { href: "/publicacoes", label: "Publicações", icon: Send },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];

function BackendIndicator() {
  const { data, error } = useApi<Health>("/health", { pollMs: 15_000 });
  const online = data !== null && error === null;
  const label = online ? "Backend conectado" : error ? "Backend offline" : "Verificando…";
  return (
    <div className="flex items-center gap-2 rounded-xl border border-line bg-surface/60 px-3 py-2 text-xs text-ink-muted">
      <span className="relative flex size-2">
        {online ? (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-ok opacity-50" />
        ) : null}
        <span
          className={cx(
            "relative inline-flex size-2 rounded-full",
            online ? "bg-ok" : error ? "bg-bad" : "bg-ink-faint",
          )}
        />
      </span>
      <span>{label}</span>
      {online ? <span className="ml-auto text-ink-faint">v{data.version}</span> : null}
    </div>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Navegação principal" className="flex flex-col gap-1">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cx(
              "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
              active
                ? "bg-gradient-to-r from-accent/15 to-violet/10 text-ink"
                : "text-ink-muted hover:bg-white/[0.04] hover:text-ink",
            )}
          >
            {active ? (
              <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-gradient-to-b from-accent to-violet" />
            ) : null}
            <Icon
              className={cx(
                "size-4 transition",
                active ? "text-accent-soft" : "text-ink-faint group-hover:text-ink-muted",
              )}
              aria-hidden
            />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-3 px-2">
      <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-accent to-violet shadow-lg shadow-violet/25">
        <Clapperboard className="size-5 text-white" aria-hidden />
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold text-ink">GTA Clips AI</span>
        <span className="block text-[11px] text-ink-faint">Cortes automáticos de RP</span>
      </span>
    </Link>
  );
}

export function Sidebar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* Desktop: fixed sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-surface/80 px-4 py-6 backdrop-blur-xl lg:flex">
        <Brand />
        <div className="mt-8 flex-1">
          <NavLinks />
        </div>
        <BackendIndicator />
      </aside>

      {/* Mobile / tablet: top bar + drawer */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface/90 px-4 py-3 backdrop-blur-xl lg:hidden">
        <Brand />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg p-2 text-ink-muted hover:bg-white/[0.05] hover:text-ink"
          aria-label="Abrir menu"
          aria-expanded={open}
        >
          <Menu className="size-5" aria-hidden />
        </button>
      </div>
      {open ? (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
        >
          <button
            type="button"
            aria-label="Fechar menu"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="animate-fade-in absolute inset-y-0 left-0 flex w-72 flex-col border-r border-line bg-surface px-4 py-6">
            <div className="flex items-center justify-between">
              <Brand />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-ink-muted hover:bg-white/[0.05]"
                aria-label="Fechar menu"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <div className="mt-8 flex-1">
              <NavLinks key={pathname} onNavigate={() => setOpen(false)} />
            </div>
            <BackendIndicator />
          </div>
        </div>
      ) : null}
    </>
  );
}
