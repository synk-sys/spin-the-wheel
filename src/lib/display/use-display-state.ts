"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicDisplayState, RaffleEnv } from "../domain/types";
import { displaySyncMode, firebaseClientApp } from "../firebase/client";
import { clockOffset } from "./phase";

export type ConnectionStatus = "connecting" | "live" | "reconnecting" | "offline";

const POLL_MS = 1000;
const STALE_MS = 5000;

/**
 * Keeps the projector in sync with the latest public raffle state.
 * Uses a Firestore real-time listener when configured, else polls the public
 * API. Either way, on reconnect it simply adopts the latest state — spins are
 * time-based (see derivePhase) so nothing is replayed.
 */
export function useDisplayState(env: RaffleEnv) {
  const [state, setState] = useState<PublicDisplayState | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [offset, setOffset] = useState(0);
  const lastOk = useRef(0);
  const mode = displaySyncMode();

  const fetchOnce = useCallback(async () => {
    const sentAt = Date.now();
    const res = await fetch(`/api/display?env=${env}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { state: PublicDisplayState; serverNow: number };
    setOffset(clockOffset(body.serverNow, sentAt, Date.now()));
    lastOk.current = Date.now();
    return body.state;
  }, [env]);

  // Polling transport (and initial load / clock sync for both transports).
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const s = await fetchOnce();
        if (!cancelled && mode === "poll") setState((prev) => (prev && prev.updatedAt > s.updatedAt ? prev : s));
        if (!cancelled && mode === "poll") setStatus("live");
        if (!cancelled && mode === "firestore") setState((prev) => prev ?? s);
      } catch {
        if (!cancelled && mode === "poll") setStatus(navigator.onLine ? "reconnecting" : "offline");
      }
      // In Firestore mode only re-sync the clock occasionally.
      if (!cancelled) timer = setTimeout(tick, mode === "poll" ? POLL_MS : 60_000);
    };
    void tick();
    const wake = () => {
      clearTimeout(timer);
      void tick();
    };
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [fetchOnce, mode]);

  // Firestore real-time transport.
  useEffect(() => {
    if (mode !== "firestore") return;
    let unsub: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      const app = firebaseClientApp();
      if (!app) return;
      const { getFirestore, doc, onSnapshot } = await import("firebase/firestore");
      if (cancelled) return;
      unsub = onSnapshot(
        doc(getFirestore(app), "publicDisplay", env),
        { includeMetadataChanges: true },
        (snap) => {
          if (snap.exists()) setState(snap.data() as PublicDisplayState);
          setStatus(snap.metadata.fromCache ? "reconnecting" : "live");
          if (!snap.metadata.fromCache) lastOk.current = Date.now();
        },
        () => setStatus("reconnecting"),
      );
    })();
    const onOffline = () => setStatus("offline");
    window.addEventListener("offline", onOffline);
    return () => {
      cancelled = true;
      unsub?.();
      window.removeEventListener("offline", onOffline);
    };
  }, [env, mode]);

  // Watchdog: polling mode marks the link stale if updates stop arriving.
  useEffect(() => {
    if (mode !== "poll") return;
    const t = setInterval(() => {
      if (lastOk.current && Date.now() - lastOk.current > STALE_MS) setStatus(navigator.onLine ? "reconnecting" : "offline");
    }, 1000);
    return () => clearInterval(t);
  }, [mode]);

  return { state, status, offset, mode };
}
