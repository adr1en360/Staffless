// Per-visitor rate limit for the public demo, so judges can play without draining the AI credits.
// shortcut: counts live in this server process's memory; use a shared store if the app runs on many instances.
const hits = new Map<string, number[]>();

export function allow(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) return false;
  recent.push(now);
  hits.set(key, recent);
  return true;
}

export const visitor = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
