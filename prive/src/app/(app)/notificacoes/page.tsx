"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Bell } from "lucide-react";

import { useSession } from "@/components/guard";
import { Empty, Spinner, TopBar, cn } from "@/components/ui";
import { markNotificationsRead } from "@/lib/db";
import { relative } from "@/lib/format";

export default function NotificationsPage() {
  const s = useSession();
  const hasUnread = !!s?.db.notifications.some((n) => n.userId === s.me.id && !n.read);
  useEffect(() => {
    if (!hasUnread) return;
    const t = setTimeout(markNotificationsRead, 1500);
    return () => clearTimeout(t);
  }, [hasUnread]);
  if (!s) return <Spinner />;
  const list = s.db.notifications.filter((n) => n.userId === s.me.id);
  return (
    <>
      <TopBar title="Notificações" back={s.me.role === "client" ? true : undefined} />
      {list.length === 0 ? (
        <Empty icon={<Bell className="size-5" />} title="Tudo em dia" />
      ) : (
        <ul className="space-y-2">
          {list.map((n) => (
            <li key={n.id}>
              <Link href={n.href} className={cn("flex gap-3 rounded-2xl border p-4 transition", n.read ? "border-line bg-card" : "border-gold/30 bg-gold/[0.05]")}>
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-line-2" : "bg-gold")} />
                <span className="flex-1">
                  <span className="flex justify-between text-[15px]">
                    {n.title} <span className="text-[11px] text-ink-3">{relative(n.createdAt)}</span>
                  </span>
                  <span className="text-sm text-ink-3">{n.body}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
