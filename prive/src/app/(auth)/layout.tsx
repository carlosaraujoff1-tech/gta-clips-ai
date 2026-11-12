import { AgeGate } from "@/components/age-gate";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <AgeGate>
      <main className="relative min-h-dvh overflow-hidden bg-void">
        <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(201,169,97,0.18),transparent_65%)]" />
        <div className="safe-top relative mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-10">{children}</div>
      </main>
    </AgeGate>
  );
}
