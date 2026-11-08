import { json, limited } from "../../../lib/http";
import { contract } from "../../../lib/store";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const blocked = limited(req, "payout", 10);
  if (blocked) return blocked;
  const result = await contract.payout();
  return json(result, result.ok ? 200 : 409);
}
