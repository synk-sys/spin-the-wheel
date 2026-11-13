"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RaffleEnv } from "../domain/types";
import { apiGet } from "./api";

interface Result<T> {
  key: string;
  data: T | null;
  error: Error | null;
  receivedAt: number;
}

/**
 * Small fetch hook: loads on mount/env change, optional polling while the tab
 * is visible. Results are keyed by path+env so switching environments never
 * shows the other environment's data.
 */
export function useApi<T>(path: string | null, env: RaffleEnv, refreshMs?: number) {
  const key = `${env}:${path}`;
  const [res, setRes] = useState<Result<T>>({ key: "", data: null, error: null, receivedAt: 0 });
  const seq = useRef(0);

  const reload = useCallback(async () => {
    if (!path) return;
    const id = ++seq.current;
    try {
      const d = await apiGet<T>(path, env);
      if (id === seq.current) setRes({ key, data: d, error: null, receivedAt: Date.now() });
    } catch (e) {
      if (id === seq.current) setRes((r) => ({ key, data: r.key === key ? r.data : null, error: e as Error, receivedAt: r.receivedAt }));
    }
  }, [path, env, key]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!refreshMs) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void reload();
    }, refreshMs);
    return () => clearInterval(t);
  }, [reload, refreshMs]);

  const current = res.key === key;
  return {
    data: current ? res.data : null,
    error: current ? res.error : null,
    loading: !current,
    receivedAt: current ? res.receivedAt : 0,
    reload,
  };
}
