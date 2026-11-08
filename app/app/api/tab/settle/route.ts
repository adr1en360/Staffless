import { body, json, limited } from "../../../../lib/http";
import { tabs } from "../../../../modules/tabs";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const blocked = limited(req, "settle", 30);
  if (blocked) return blocked;
  const input = await body<{ customer?: string }>(req);
  if (typeof input?.customer !== "string") return json({ error: "customer is required" }, 400);
  const result = await tabs().settle(input.customer);
  return json(result, result.ok ? 200 : 409);
}
