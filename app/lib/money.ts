// yoctoNEAR helpers. Amounts stay bigint in code and decimal strings on the wire.
export const YOCTO_PER_NEAR = 10n ** 24n;

export const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

export function toYocto(near: number | string): bigint {
  const [whole, frac = ""] = String(near).split(".");
  return BigInt(whole || "0") * YOCTO_PER_NEAR + BigInt((frac + "0".repeat(24)).slice(0, 24));
}

export function formatNear(yocto: bigint | string, digits = 5): string {
  const v = BigInt(yocto);
  const whole = v / YOCTO_PER_NEAR;
  const frac = (v % YOCTO_PER_NEAR).toString().padStart(24, "0").slice(0, digits).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

/** `part` of `total` as a fraction in basis points, rounded down. */
export const bps = (total: bigint, points: number) => (total * BigInt(points)) / 10_000n;

/** NEAR amounts the AI gives as JS numbers; 12 decimals avoids float noise like 0.0002 -> 0.000200000000000000009584. */
export function fromNearNumber(n: unknown): bigint {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) throw new Error("amount must be a non-negative number");
  return toYocto(v.toFixed(12));
}
