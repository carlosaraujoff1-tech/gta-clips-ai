"use client";

import { AgeGate } from "@/components/age-gate";
import { BottomNav } from "@/components/bottom-nav";
import { useSession } from "@/components/guard";
import { Spinner } from "@/components/ui";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AgeGate>
      <Shell>{children}</Shell>
    </AgeGate>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const s = useSession();
  if (!s) return <Spinner />;
  const unread = s.db.notifications.filter((n) => n.userId === s.me.id && !n.read).length;
  return (
    <>
      <main className="mx-auto min-h-dvh w-full max-w-lg px-5 pb-28">{children}</main>
      <BottomNav role={s.me.role} unread={unread} />
    </>
  );
}
