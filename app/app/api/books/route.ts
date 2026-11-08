import { json } from "../../../lib/http";
import { books } from "../../../modules/books";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return json(await books());
}
