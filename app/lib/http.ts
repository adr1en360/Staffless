// Shared bits for API routes: JSON body parsing at the trust boundary and rate-limit responses.
import { allow, visitor } from "./limit";

export const json = (body: unknown, status = 200) => Response.json(body, { status });

export async function body<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

/** Returns a 429 response when the visitor is over the limit, otherwise null. */
export function limited(req: Request, bucket: string, max: number, windowMs = 60 * 60 * 1000): Response | null {
  return allow(`${bucket}:${visitor(req)}`, max, windowMs) ? null : json({ error: "Too many requests. Try again in a bit." }, 429);
}
