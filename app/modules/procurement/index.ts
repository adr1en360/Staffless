// After a customer pays: the AI hires a supplier, the work is checked, and the supplier is paid only if it passes.
import type { TxResult } from "../../lib/near";
import { contract } from "../../lib/store";
import { bps, words } from "../../lib/money";
import * as supplierLib from "../suppliers";
import type { Supplier } from "../suppliers";
import { decide as realDecide, type Decision, type Situation } from "./decide";
import { review as realReview, type Review } from "./review";

export type Job = { orderId: number; text: string; language: string; priceYocto: bigint; maxRefundYocto: bigint };

export type Attempt = {
  supplier: string;
  quotedYocto: string;
  offeredYocto: string;
  /** The AI's own reason for this choice. */
  reason: string;
  review?: { pass: boolean; score: number; reason: string };
  outcome: "accepted" | "offer-declined" | "failed-review" | "payment-failed";
  error?: string;
};

export type Receipt = {
  orderId: number;
  attempts: Attempt[];
  /** Set when the AI decided to buy from nobody. */
  stopped?: string;
  delivered?: { supplier: string; translation: string; paidYocto: string; tx: string };
  refund?: TxResult<unknown>;
  cost?: TxResult<unknown>;
};

export type Deps = {
  suppliers: Supplier[];
  decide: (s: Situation) => Promise<Decision>;
  translate: (s: Supplier, text: string, language: string) => Promise<{ translation: string; costYocto: bigint }>;
  review: (text: string, language: string, translation: string) => Promise<Review>;
  paySupplier: typeof contract.paySupplier;
  recordCost: typeof contract.recordCost;
  refund: typeof contract.refund;
};

/** Hard ceiling on what the AI may pay a supplier: this share of the sale price. */
export const BUDGET_BPS = 6_000;

export const realDeps = (): Deps => ({
  suppliers: supplierLib.suppliers(),
  decide: realDecide,
  translate: supplierLib.translate,
  review: realReview,
  paySupplier: contract.paySupplier,
  recordCost: contract.recordCost,
  refund: contract.refund,
});

const min = (...xs: bigint[]) => xs.reduce((a, b) => (b < a ? b : a));

export async function fulfil(job: Job, deps: Deps = realDeps()): Promise<Receipt> {
  const wordCount = words(job.text);
  const budget = bps(job.priceYocto, BUDGET_BPS);
  const receipt: Receipt = { orderId: job.orderId, attempts: [] };
  const remaining = [...deps.suppliers];
  let aiCost = 0n;

  // One offer per supplier; the AI sees every earlier outcome before choosing again.
  while (remaining.length > 0 && !receipt.delivered) {
    const decision = await deps.decide({
      words: wordCount,
      language: job.language,
      saleYocto: job.priceYocto,
      budgetYocto: budget,
      options: remaining.map((s) => ({ id: s.id, name: s.name, specialties: s.specialties, quoteYocto: supplierLib.quote(s, wordCount) })),
      tried: receipt.attempts.map((a) => ({ supplier: a.supplier, offeredYocto: BigInt(a.offeredYocto), outcome: a.outcome })),
    });
    aiCost += decision.costYocto;
    const s = remaining.find((x) => x.id === decision.supplierId);
    if (!s) {
      receipt.stopped = decision.reason;
      break;
    }
    remaining.splice(remaining.indexOf(s), 1);

    // The AI never pays more than the quote or the budget.
    const quoted = supplierLib.quote(s, wordCount);
    const offered = min(decision.offerYocto, quoted, budget);
    const attempt: Attempt = {
      supplier: s.name,
      quotedYocto: quoted.toString(),
      offeredYocto: offered.toString(),
      reason: decision.reason,
      outcome: "offer-declined",
    };
    receipt.attempts.push(attempt);
    if (!supplierLib.acceptsCounter(s, offered, wordCount)) continue;

    const { translation, costYocto } = await deps.translate(s, job.text, job.language);
    const check = await deps.review(job.text, job.language, translation);
    aiCost += costYocto + check.costYocto;
    attempt.review = { pass: check.pass, score: check.score, reason: check.reason };
    if (!check.pass) {
      attempt.outcome = "failed-review";
      continue;
    }

    const paid = await deps.paySupplier(s.account, offered, `order ${job.orderId}`);
    if (!paid.ok) {
      Object.assign(attempt, { outcome: "payment-failed", error: paid.error });
      break;
    }
    attempt.outcome = "accepted";
    receipt.delivered = { supplier: s.name, translation, paidYocto: offered.toString(), tx: paid.hash };
  }

  if (!receipt.delivered) receipt.refund = await deps.refund(job.orderId, min(job.priceYocto, job.maxRefundYocto));
  if (aiCost > 0n) receipt.cost = await deps.recordCost(aiCost, `order ${job.orderId}`);
  return receipt;
}
