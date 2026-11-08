import { json, limited } from "../../../lib/http";
import { call } from "../../../lib/near";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const blocked = limited(req, "payout", 10);
  if (blocked) return blocked;
  const result = await call("guest", "payout", {});
  return json(result, result.ok ? 200 : 409);
}
