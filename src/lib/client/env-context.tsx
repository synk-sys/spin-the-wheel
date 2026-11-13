"use client";

import { createContext, useCallback, useContext, useSyncExternalStore } from "react";
import type { RaffleEnv } from "../domain/types";

const KEY = "devfest-raffle-env";
const EVENT = "devfest-raffle-env-change";

interface EnvContextValue {
  env: RaffleEnv;
  setEnv: (env: RaffleEnv) => void;
  /** False during server render/hydration, so pages don't fetch the wrong env. */
  ready: boolean;
}

const EnvContext = createContext<EnvContextValue | null>(null);

function readEnv(): RaffleEnv {
  try {
    return localStorage.getItem(KEY) === "production" ? "production" : "demo";
  } catch {
    return "demo";
  }
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

const noopSubscribe = () => () => {};

/**
 * Which raffle the organizer is operating. Defaults to Demo so a fresh
 * browser can never accidentally act on production data.
 */
export function RaffleEnvProvider({ children }: { children: React.ReactNode }) {
  const env = useSyncExternalStore<RaffleEnv>(subscribe, readEnv, () => "demo");
  const ready = useSyncExternalStore(noopSubscribe, () => true, () => false);

  const setEnv = useCallback((next: RaffleEnv) => {
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // storage unavailable
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return <EnvContext.Provider value={{ env, setEnv, ready }}>{children}</EnvContext.Provider>;
}

export function useRaffleEnv(): EnvContextValue {
  const v = useContext(EnvContext);
  if (!v) throw new Error("useRaffleEnv must be used inside RaffleEnvProvider");
  return v;
}
