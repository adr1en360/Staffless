// The shopkeeper AI decides who to hire and what to offer. Code enforces the limits around that choice.
import { chat } from "../../lib/ai";
import { formatNear, fromNearNumber } from "../../lib/money";
import type { TrackSummary } from "./memory";

export type Option = { id: string; name: string; specialties: string[]; quoteYocto: bigint; track: TrackSummary };
export type Tried = { supplier: string; offeredYocto: bigint; outcome: string };
export type Situation = {
  words: number;
  language: string;
  saleYocto: bigint;
  budgetYocto: bigint;
  options: Option[];
  tried: Tried[];
};
/** `supplierId: null` means the AI chose to buy from nobody. */
export type Decision = { supplierId: string | null; offerYocto: bigint; reason: string; costYocto: bigint };

const near = (y: bigint) => formatNear(y, 6);

export async function decide(s: Situation): Promise<Decision> {
  const { message, costYocto } = await chat(
    [
      {
        role: "system",
        content:
          "You are the shopkeeper of Staffless, buying a translation job from a supplier. You keep the difference between the sale price and what you pay. " +
          `You can pay at most ${near(s.budgetYocto)} NEAR; anything above that is cut to it. ` +
          "Pick one supplier and an offer. Offer their quote to accept it, or less to counter. Each supplier has a private minimum and refuses offers below it, and you only get one offer per supplier. " +
          "The work is reviewed before you pay and you pay nothing for work that fails, but a failure makes the waiting customer wait longer. " +
          "Each supplier comes with its track record from the shop's public ledger: paid jobs, review scores overall and for this language, failed reviews, the lowest price per word it accepted, and offers per word it declined. Learn from it: favour suppliers that pass reviews for this language, and don't repeat offers they already refused. " +
          'Reply as JSON: {"supplier": "<id>", "offer_near": number, "reason": "one sentence"}, or {"supplier": null, "reason": "one sentence"} to buy from nobody and refund the customer.',
      },
      {
        role: "user",
        content: JSON.stringify({
          job: { words: s.words, language: s.language, sale_near: near(s.saleYocto), budget_near: near(s.budgetYocto) },
          suppliers: s.options.map((o) => ({ id: o.id, name: o.name, specialties: o.specialties, quote_near: near(o.quoteYocto), track_record: o.track })),
          already_tried: s.tried.map((t) => ({ supplier: t.supplier, offered_near: near(t.offeredYocto), outcome: t.outcome })),
        }),
      },
    ],
    undefined,
    true,
  );
  return parseDecision(message.content ?? "", costYocto);
}

/** Anything unusable becomes "buy from nobody", so a confused model refunds the customer instead of spending. */
export function parseDecision(raw: string, costYocto: bigint): Decision {
  const nobody = (reason: string): Decision => ({ supplierId: null, offerYocto: 0n, reason, costYocto });
  try {
    const d = JSON.parse(raw) as { supplier?: unknown; offer_near?: unknown; reason?: unknown };
    const reason = String(d.reason ?? "");
    if (d.supplier === null || d.supplier === undefined) return nobody(reason || "chose not to buy");
    const offer = fromNearNumber(d.offer_near);
    if (offer === 0n) return nobody("offer was zero");
    return { supplierId: String(d.supplier), offerYocto: offer, reason, costYocto };
  } catch {
    return nobody("the buying decision was not valid JSON");
  }
}
