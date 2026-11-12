"use client";

import { useCallback, useSyncExternalStore } from "react";

const listeners = new Set<() => void>();

/** Preferência local simples (ex.: cidade selecionada). */
export function usePref(key: string, fallback: string): [string, (v: string) => void] {
  const value = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => {
      try {
        return localStorage.getItem(`prive.pref.${key}`) ?? fallback;
      } catch {
        return fallback;
      }
    },
    () => fallback,
  );
  const set = useCallback(
    (v: string) => {
      try {
        localStorage.setItem(`prive.pref.${key}`, v);
      } catch {
        /* ignora */
      }
      listeners.forEach((l) => l());
    },
    [key],
  );
  return [value, set];
}
