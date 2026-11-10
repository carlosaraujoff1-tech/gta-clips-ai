/**
 * Small design-system primitives shared by every page.
 */
import {
  Construction,
  LoaderCircle,
  RefreshCw,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

/* ---------------------------------------------------------------- Layout */

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">{description}</p>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Card({
  children,
  className,
  title,
  icon: Icon,
  action,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  icon?: LucideIcon;
  action?: ReactNode;
}) {
  return (
    <section
      className={cx(
        "animate-fade-in rounded-2xl border border-line bg-card/80 p-5 shadow-[0_1px_0_0_rgb(255_255_255/0.03)_inset] backdrop-blur-sm",
        className,
      )}
    >
      {title ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
            {Icon ? <Icon className="size-4 text-accent-soft" aria-hidden /> : null}
            {title}
          </h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/* ---------------------------------------------------------------- Badges */

export type Tone = "neutral" | "accent" | "violet" | "ok" | "warn" | "bad";

const TONES: Record<Tone, string> = {
  neutral: "border-line-strong bg-white/[0.03] text-ink-muted",
  accent: "border-accent/30 bg-accent/10 text-accent-soft",
  violet: "border-violet/30 bg-violet/10 text-violet-soft",
  ok: "border-ok/30 bg-ok/10 text-ok",
  warn: "border-warn/30 bg-warn/10 text-warn",
  bad: "border-bad/30 bg-bad/10 text-bad",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium",
        TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

export function PhaseBadge({ phase }: { phase: number }) {
  return (
    <Badge tone="violet">
      <Construction className="size-3" aria-hidden />
      Fase {phase}
    </Badge>
  );
}

/* --------------------------------------------------------------- Buttons */

type ButtonVariant = "primary" | "secondary" | "ghost";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-r from-accent to-violet text-white shadow-lg shadow-violet/20 hover:brightness-110",
  secondary: "border border-line-strong bg-white/[0.03] text-ink hover:bg-white/[0.07]",
  ghost: "text-ink-muted hover:bg-white/[0.05] hover:text-ink",
};

export function Button({
  variant = "secondary",
  icon: Icon,
  loading = false,
  children,
  className,
  disabled,
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  icon?: LucideIcon;
  loading?: boolean;
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cx(
        "inline-flex h-9 items-center justify-center gap-2 rounded-xl px-3.5 text-sm font-medium transition duration-150",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        "disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:brightness-100",
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
      ) : Icon ? (
        <Icon className="size-4" aria-hidden />
      ) : null}
      {children}
    </button>
  );
}

/**
 * A visible but disabled action for features of a later phase.
 * Makes it explicit that the button does nothing yet.
 */
export function PlannedButton({
  icon,
  children,
  phase,
}: {
  icon?: LucideIcon;
  children: ReactNode;
  phase: number;
}) {
  return (
    <span className="inline-flex items-center gap-2" title={`Disponível na Fase ${phase}`}>
      <Button icon={icon} disabled aria-describedby={`phase-${phase}-hint`}>
        {children}
      </Button>
      <span id={`phase-${phase}-hint`} className="sr-only">
        Ainda não implementado. Disponível na Fase {phase}.
      </span>
      <PhaseBadge phase={phase} />
    </span>
  );
}

/* ------------------------------------------------------- Feedback states */

export function PhaseNotice({
  phase,
  title,
  children,
}: {
  phase: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="animate-fade-in mb-6 flex gap-3 rounded-2xl border border-violet/25 bg-gradient-to-r from-violet/[0.08] to-accent/[0.05] p-4">
      <Construction className="mt-0.5 size-5 shrink-0 text-violet-soft" aria-hidden />
      <div className="text-sm">
        <p className="font-medium text-ink">
          {title} <span className="text-violet-soft">— disponível na Fase {phase}</span>
        </p>
        <div className="mt-1 text-ink-muted">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line-strong px-6 py-12 text-center">
      <div className="mb-3 rounded-2xl border border-line bg-surface p-3">
        <Icon className="size-6 text-ink-faint" aria-hidden />
      </div>
      <p className="text-sm font-medium text-ink">{title}</p>
      {children ? <div className="mt-1 max-w-md text-sm text-ink-muted">{children}</div> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-xl border border-bad/30 bg-bad/[0.06] p-4 text-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <span className="flex items-center gap-2 text-bad">
        <TriangleAlert className="size-4 shrink-0" aria-hidden />
        {message}
      </span>
      {onRetry ? (
        <Button variant="ghost" icon={RefreshCw} onClick={onRetry}>
          Tentar novamente
        </Button>
      ) : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-lg bg-white/[0.05]", className)} />;
}

/* ----------------------------------------------------------------- Forms */

export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: ReactNode;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-xs font-medium text-ink-muted">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-ink-faint">{hint}</p> : null}
    </div>
  );
}

export const inputClass =
  "h-10 w-full rounded-xl border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-faint transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25";
