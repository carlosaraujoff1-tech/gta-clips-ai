"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { api, ApiError } from "@/lib/api";

export interface ApiState<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  reload: () => void;
}

/** Fetches `path` on mount (and when it changes). `reload()` fetches again. */
export function useApi<T>(path: string, options: { pollMs?: number } = {}): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    let cancelled = false;
    const run = () => {
      setLoading(true);
      api
        .get<T>(path)
        .then((result) => {
          if (cancelled || id !== requestId.current) return;
          setData(result);
          setError(null);
        })
        .catch((err: unknown) => {
          if (cancelled || id !== requestId.current) return;
          setError(err instanceof ApiError ? err : new ApiError(0, "unknown", String(err)));
        })
        .finally(() => {
          if (!cancelled && id === requestId.current) setLoading(false);
        });
    };
    run();
    const timer = options.pollMs ? setInterval(run, options.pollMs) : undefined;
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [path, nonce, options.pollMs]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, error, loading, reload };
}
