import { cn } from "./ui";

/**
 * Arte de capa gerada (sem fotos reais). Em produção, as fotos autorizadas vêm do
 * bucket privado do Supabase via URL assinada; este componente é o placeholder.
 */
export function Art({ hue, label, className, arch, children }: { hue: number; label: string; className?: string; arch?: boolean; children?: React.ReactNode }) {
  const initial = label.trim().charAt(0).toUpperCase() || "P";
  return (
    <div
      className={cn("art-blur relative isolate overflow-hidden bg-night", arch ? "rounded-t-[999px] rounded-b-3xl" : "rounded-3xl", className)}
      style={{
        backgroundImage: `radial-gradient(120% 80% at 30% 15%, hsl(${hue} 45% 32% / 0.95), transparent 60%),
          radial-gradient(90% 70% at 85% 90%, hsl(${(hue + 30) % 360} 40% 18%), transparent 70%),
          linear-gradient(160deg, hsl(${hue} 25% 9%), #070707)`,
      }}
    >
      <svg aria-hidden className="absolute inset-0 h-full w-full opacity-[0.35] mix-blend-overlay" viewBox="0 0 100 140" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id={`g${hue}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#f1dda6" stopOpacity="0.9" />
            <stop offset="1" stopColor="#f1dda6" stopOpacity="0" />
          </linearGradient>
        </defs>
        <ellipse cx="50" cy="52" rx="17" ry="21" fill={`url(#g${hue})`} />
        <path d="M14 140 C18 98 34 84 50 84 C66 84 82 98 86 140 Z" fill={`url(#g${hue})`} />
      </svg>
      <span className="font-display pointer-events-none absolute right-3 bottom-1 text-[72px] leading-none text-white/[0.07] select-none">{initial}</span>
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
      {children}
    </div>
  );
}

export function Avatar({ hue, name, size = 44 }: { hue: number; name: string; size?: number }) {
  return (
    <span
      className="font-display grid shrink-0 place-items-center rounded-full border border-gold/30 text-gold-2"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: `radial-gradient(circle at 30% 25%, hsl(${hue} 40% 30%), hsl(${hue} 30% 10%))`,
      }}
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

export function Crown({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 28" className={className} aria-hidden>
      <defs>
        <linearGradient id="crown-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f7dc8f" />
          <stop offset="1" stopColor="#b8862a" />
        </linearGradient>
      </defs>
      <path d="M4 24 L2 6 L14 15 L24 2 L34 15 L46 6 L44 24 Z" fill="url(#crown-g)" />
      <rect x="4" y="25" width="40" height="3" rx="1" fill="url(#crown-g)" />
      <circle cx="2" cy="5" r="2" fill="#f7dc8f" />
      <circle cx="24" cy="2" r="2" fill="#f7dc8f" />
      <circle cx="46" cy="5" r="2" fill="#f7dc8f" />
    </svg>
  );
}

export function Logo({ className, crown }: { className?: string; crown?: boolean }) {
  return (
    <span className={cn("inline-flex flex-col items-center leading-none", className)}>
      {crown && <Crown className="mb-[0.18em] h-[0.42em] w-[0.72em]" />}
      <span className="gold-text font-brand font-semibold tracking-[0.06em]">PRIVÉ</span>
    </span>
  );
}
