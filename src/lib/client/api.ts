"use client";

import type { RaffleEnv } from "../domain/types";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function withEnv(path: string, env: RaffleEnv) {
  return `${path}${path.includes("?") ? "&" : "?"}env=${env}`;
}

async function parse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = data?.error;
    throw new ApiError(res.status, err?.code ?? "HTTP_ERROR", err?.message ?? `Request failed (${res.status})`);
  }
  return data as T;
}

export async function apiGet<T>(path: string, env: RaffleEnv): Promise<T> {
  const res = await fetch(withEnv(path, env), { cache: "no-store", credentials: "same-origin" });
  if (res.status === 401 && typeof window !== "undefined") {
    window.location.replace(new URL(`/login?next=${encodeURIComponent(window.location.pathname)}`, window.location.origin).toString());
  }
  return parse<T>(res);
}

export async function apiSend<T>(path: string, env: RaffleEnv, method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(withEnv(path, env), {
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, env }),
  });
  return parse<T>(res);
}

export function newIdempotencyKey(): string {
  return `spin_${crypto.randomUUID().replace(/-/g, "")}`;
}

/**
 * Sends a draw request, retrying with the SAME idempotency key on network
 * failure or "in progress" responses to a retry — so a flaky connection can
 * never create two draws, and a lost response is recovered.
 */
export async function requestDraw<T>(env: RaffleEnv, prizeId: string, idempotencyKey: string, attempts = 4): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await apiSend<T>("/api/admin/draws", env, "POST", { prizeId, idempotencyKey });
    } catch (e) {
      lastError = e;
      const retriable = !(e instanceof ApiError) || e.status >= 500 || (i > 0 && e.code === "DRAW_IN_PROGRESS");
      if (!retriable) throw e;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw lastError;
}

export function downloadText(filename: string, text: string, type = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
