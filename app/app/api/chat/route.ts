import { body, json, limited } from "../../../lib/http";
import { reply, type Turn } from "../../../modules/shopkeeper";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const blocked = limited(req, "chat", 40);
  if (blocked) return blocked;
  const input = await body<{ history?: Turn[] }>(req);
  if (!Array.isArray(input?.history) || input.history.length === 0) return json({ error: "history is required" }, 400);
  return json(await reply(input.history));
}
