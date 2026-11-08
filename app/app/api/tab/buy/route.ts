import { body, json, limited } from "../../../../lib/http";
import { buy, type Purchase } from "../../../../modules/tabs";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const blocked = limited(req, "tab", 300);
  if (blocked) return blocked;
  const p = await body<Purchase>(req);
  const fields = ["customer", "text", "language", "cumulativeYocto", "signature"] as const;
  if (!p || fields.some((f) => typeof p[f] !== "string")) return json({ error: `required: ${fields.join(", ")}` }, 400);
  const result = await buy(p);
  return json(result, result.ok ? 200 : 409);
}
