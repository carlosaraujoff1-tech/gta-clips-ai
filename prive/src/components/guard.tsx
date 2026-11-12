"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { Spinner } from "./ui";
import { currentUser, justSignedOut, useDB } from "@/lib/db";
import { HOME_BY_ROLE } from "@/lib/routes";
import type { DB, Role, User } from "@/lib/types";

/** Controle de acesso por função no cliente. No banco, a RLS garante o mesmo. */
export function useSession(roles?: Role[]): { db: DB; me: User } | null {
  const db = useDB();
  const router = useRouter();
  const path = usePathname();
  const me = currentUser(db);
  const allowed = !!me && (!roles || roles.includes(me.role));

  useEffect(() => {
    if (!db) return;
    if (!me) router.replace(justSignedOut() ? "/entrar" : `/entrar?next=${encodeURIComponent(path)}`);
    else if (!allowed) router.replace(HOME_BY_ROLE[me.role]);
  }, [db, me, allowed, router, path]);

  if (!db || !me || !allowed) return null;
  return { db, me };
}

export function Guard({ roles, children }: { roles?: Role[]; children: (s: { db: DB; me: User }) => React.ReactNode }) {
  const s = useSession(roles);
  if (!s) return <Spinner />;
  return <>{children(s)}</>;
}
