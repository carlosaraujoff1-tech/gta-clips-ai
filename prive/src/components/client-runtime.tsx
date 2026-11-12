"use client";

import { useEffect } from "react";

import { currentUser, useDB } from "@/lib/db";

/** Registra o service worker (PWA) e aplica o modo discreto. */
export function ClientRuntime() {
  const db = useDB();
  const discreet = currentUser(db)?.discreetMode ?? false;

  useEffect(() => {
    document.documentElement.classList.toggle("discreet", discreet);
  }, [discreet]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  return null;
}
