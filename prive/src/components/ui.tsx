"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Loader2, ShieldCheck, Star, X } from "lucide-react";
import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";

export function cn(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Variant = "gold" | "ghost" | "outline" | "danger";

const variants: Record<Variant, string> = {
  gold: "bg-gradient-to-b from-gold-2 to-gold text-void font-semibold shadow-[0_8px_30px_-10px_rgba(201,169,97,0.6)] hover:brightness-110",
  outline: "border border-line-2 text-ink hover:border-gold-3 hover:bg-card-2",
  ghost: "text-ink-2 hover:text-ink hover:bg-card-2",
  danger: "border border-bad/40 text-bad hover:bg-bad/10",
};

export function Button({
  variant = "gold",
  loading,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={cn(
        "inline-flex h-12 items-center justify-center gap-2 rounded-2xl px-5 text-sm tracking-wide transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        className,
      )}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

export function LinkButton({ href, variant = "gold", className, children }: { href: string; variant?: Variant; className?: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-12 items-center justify-center gap-2 rounded-2xl px-5 text-sm tracking-wide transition active:scale-[0.98]",
        variants[variant],
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] font-medium tracking-[0.18em] text-ink-3 uppercase">{label}</span>
      {children}
      {hint && !error && <span className="block text-xs text-ink-3">{hint}</span>}
      {error && <span className="block text-xs text-bad">{error}</span>}
    </label>
  );
}

const inputCls =
  "w-full rounded-2xl border border-line bg-card px-4 text-[15px] text-ink placeholder:text-ink-3 outline-none transition focus:border-gold-3 focus:bg-card-2";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputCls, "h-12", props.className)} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(inputCls, "min-h-28 py-3", props.className)} />;
}

export function Select({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: string[]; placeholder?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={cn(inputCls, "h-12 appearance-none")}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-3xl border border-line bg-card", className)}>{children}</div>;
}

export function Chip({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-4 py-2 text-[13px] whitespace-nowrap transition",
        active ? "border-gold bg-gold/12 text-gold-2" : "border-line text-ink-2 hover:border-line-2 hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

const tones = {
  gold: "border-gold/40 text-gold-2 bg-gold/10",
  ok: "border-ok/40 text-ok bg-ok/10",
  warn: "border-warn/40 text-warn bg-warn/10",
  bad: "border-bad/40 text-bad bg-bad/10",
  mute: "border-line-2 text-ink-2 bg-card-2",
};

export function Badge({ tone = "mute", children, className }: { tone?: keyof typeof tones; children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium", tones[tone], className)}>{children}</span>;
}

export function VerifiedSeal({ compact }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 text-gold-2" title="Identidade e maioridade verificadas">
      <ShieldCheck className="size-4" strokeWidth={1.6} />
      {!compact && <span className="text-[11px] tracking-wide">Verificado</span>}
    </span>
  );
}

export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} style={{ width: size, height: size }} className={i <= Math.round(value) ? "fill-gold text-gold" : "text-line-2"} strokeWidth={1.5} />
      ))}
    </span>
  );
}

export function TopBar({ title, back, right }: { title?: ReactNode; back?: string | true; right?: ReactNode }) {
  const router = useRouter();
  return (
    <header className="safe-top sticky top-0 z-30 -mx-5 mb-2 bg-void/80 px-5 backdrop-blur-xl">
      <div className="flex h-14 items-center gap-2">
        {back && (
          <button
            aria-label="Voltar"
            onClick={() => (back === true ? router.back() : router.push(back))}
            className="-ml-2 grid size-10 place-items-center rounded-full text-ink-2 hover:bg-card-2 hover:text-ink"
          >
            <ChevronLeft className="size-5" />
          </button>
        )}
        {title && <h1 className="font-display flex min-w-0 items-center gap-3 truncate text-2xl">{title}</h1>}
        <div className="ml-auto flex items-center gap-1">{right}</div>
      </div>
    </header>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between">
      <h2 className="font-display text-[22px] leading-none">{children}</h2>
      {action}
    </div>
  );
}

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center animate-fade">
      <div className="mb-4 grid size-14 place-items-center rounded-full border border-line-2 text-gold">{icon}</div>
      <p className="font-display text-xl">{title}</p>
      {text && <p className="mt-1 max-w-xs text-sm text-ink-3">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Fechar" className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade" onClick={onClose} />
      <div className="safe-bottom relative max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-[28px] border border-line bg-night px-5 pt-3 animate-rise sm:rounded-[28px] sm:pb-6">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-2 sm:hidden" />
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-2xl">{title}</h3>
          <button aria-label="Fechar" onClick={onClose} className="grid size-9 place-items-center rounded-full text-ink-3 hover:bg-card-2 hover:text-ink">
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex w-full items-center justify-between gap-4 py-3 text-left">
      <span>
        <span className="block text-[15px]">{label}</span>
        {hint && <span className="block text-xs text-ink-3">{hint}</span>}
      </span>
      <span className={cn("relative h-7 w-12 shrink-0 rounded-full border transition", checked ? "border-gold bg-gold/30" : "border-line-2 bg-card-2")}>
        <span className={cn("absolute top-0.5 size-5.5 rounded-full transition-all", checked ? "left-6 bg-gold-2" : "left-0.5 bg-ink-3")} />
      </span>
    </button>
  );
}

export function Checkbox({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-[13px] leading-snug text-ink-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4.5 shrink-0 accent-[#c9a961]" />
      <span>{children}</span>
    </label>
  );
}

export function Notice({ tone = "gold", children }: { tone?: "gold" | "bad" | "mute"; children: ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-3 text-[13px] leading-relaxed",
        tone === "gold" && "border-gold/25 bg-gold/[0.06] text-ink-2",
        tone === "bad" && "border-bad/30 bg-bad/[0.08] text-bad",
        tone === "mute" && "border-line bg-card text-ink-3",
      )}
    >
      {children}
    </div>
  );
}

export function Spinner() {
  return (
    <div className="grid min-h-[60dvh] place-items-center">
      <Loader2 className="size-6 animate-spin text-gold" />
    </div>
  );
}
