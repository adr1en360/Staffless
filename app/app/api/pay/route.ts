import { body, json, limited } from "../../../lib/http";
import { checkout } from "../../../modules/checkout";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const blocked = limited(req, "pay", 10);
  if (blocked) return blocked;
  const input = await body<{ orderId?: number; text?: string; language?: string }>(req);
  if (!Number.isInteger(input?.orderId) || typeof input?.text !== "string" || typeof input?.language !== "string")
    return json({ error: "orderId, text and language are required" }, 400);
  const result = await checkout(input.orderId as number, input.text, input.language);
  return json(result, result.ok ? 200 : 409);
}
