"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Logo } from "@/components/art";
import { AgeGate } from "@/components/age-gate";
import { currentUser, useDB } from "@/lib/db";
import { HOME_BY_ROLE } from "@/lib/routes";

export default function Splash() {
  return (
    <AgeGate>
      <SplashInner />
    </AgeGate>
  );
}

function SplashInner() {
  const db = useDB();
  const router = useRouter();

  useEffect(() => {
    if (!db) return;
    const u = currentUser(db);
    const t = setTimeout(() => router.replace(u ? HOME_BY_ROLE[u.role] : "/entrar"), 1600);
    return () => clearTimeout(t);
  }, [db, router]);

  return (
    <main className="grid min-h-dvh place-items-center bg-void">
      <div className="text-center">
        <div className="animate-[fade_1.2s_ease_both]">
          <Logo className="text-5xl" />
        </div>
        <div className="hairline mx-auto mt-6 w-0 animate-[grow_1.4s_0.3s_cubic-bezier(.2,.7,.2,1)_forwards]" />
        <p className="mt-5 text-[10px] tracking-[0.5em] text-ink-3 uppercase animate-[fade_1s_0.7s_ease_both]">Discrição · Confiança · Exclusividade</p>
      </div>
      <style>{`@keyframes grow{to{width:9rem}}`}</style>
    </main>
  );
}
