// After a customer pays: buy the job from a supplier, check the work, pay only for work that passes.
import { call, type TxResult } from "../../lib/near";
import { bps, formatNear, words } from "../../lib/money";
import * as supplierLib from "../suppliers";
import type { Supplier } from "../suppliers";
import { review as realReview, type Review } from "./review";

export type Job = { orderId: number; text: string; language: string; priceYocto: bigint; maxRefundYocto: bigint };

export type Attempt = {
  supplier: string;
  quotedYocto: string;
  counter?: { offeredYocto: string; reason: string; accepted: boolean };
  agreedYocto?: string;
  review?: { pass: boolean; score: number; reason: string };
  outcome: "accepted" | "walked-away" | "failed-review" | "payment-failed";
  error?: string;
};

export type Receipt = {
  orderId: number;
  attempts: Attempt[];
  delivered?: { supplier: string; translation: string; paidYocto: string; tx: string };
  refund?: TxResult<unknown>;
  cost?: TxResult<unknown>;
};

export type Deps = {
  suppliers: Supplier[];
  translate: (s: Supplier, text: string, language: string) => Promise<{ translation: string; costYocto: bigint }>;
  review: (text: string, language: string, translation: string) => Promise<Review>;
  paySupplier: (s: Supplier, amount: bigint, memo: string) => Promise<TxResult<unknown>>;
  recordCost: (amount: bigint, memo: string) => Promise<TxResult<unknown>>;
  refund: (orderId: number, amount: bigint) => Promise<TxResult<unknown>>;
};

/** The shop plans to spend at most this share of the sale price on the supplier. */
export const PLAN_BPS = 6_000;

export const realDeps = (): Deps => ({
  suppliers: supplierLib.suppliers(),
  translate: supplierLib.translate,
  review: realReview,
  paySupplier: (s, amount, memo) =>
    call("shopkeeper", "pay_supplier", { supplier: s.account, amount: amount.toString(), memo }),
  recordCost: (amount, memo) => call("shopkeeper", "record_cost", { amount: amount.toString(), memo }),
  refund: (orderId, amount) => call("shopkeeper", "refund", { order_id: orderId, amount: amount.toString() }),
});

/** Specialists for the job's language go first. */
export function shortlist(all: Supplier[], language: string): Supplier[] {
  return [...all].sort((x, y) => Number(supplierLib.isSpecialist(y, language)) - Number(supplierLib.isSpecialist(x, language)));
}

/** One counter, then accept or walk away. Returns the agreed price or undefined. */
export function negotiate(s: Supplier, wordCount: number, planYocto: bigint): Pick<Attempt, "quotedYocto" | "counter" | "agreedYocto"> {
  const quoted = supplierLib.quote(s, wordCount);
  if (quoted <= planYocto) return { quotedYocto: quoted.toString(), agreedYocto: quoted.toString() };
  const accepted = supplierLib.acceptsCounter(s, planYocto, wordCount);
  const reason =
    `Your quote of ${formatNear(quoted, 6)} NEAR is above my budget for this job ` +
    `(${PLAN_BPS / 100}% of the ${formatNear(planYocto * 10_000n / BigInt(PLAN_BPS), 6)} NEAR sale). ` +
    `I can pay ${formatNear(planYocto, 6)} NEAR.`;
  return {
    quotedYocto: quoted.toString(),
    counter: { offeredYocto: planYocto.toString(), reason, accepted },
    agreedYocto: accepted ? planYocto.toString() : undefined,
  };
}

export async function fulfil(job: Job, deps: Deps = realDeps()): Promise<Receipt> {
  const wordCount = words(job.text);
  const plan = bps(job.priceYocto, PLAN_BPS);
  const receipt: Receipt = { orderId: job.orderId, attempts: [] };
  let aiCost = 0n;

  for (const s of shortlist(deps.suppliers, job.language)) {
    const deal = negotiate(s, wordCount, plan);
    const attempt: Attempt = { supplier: s.name, ...deal, outcome: "walked-away" };
    receipt.attempts.push(attempt);
    if (!deal.agreedYocto) continue;

    const { translation, costYocto } = await deps.translate(s, job.text, job.language);
    const check = await deps.review(job.text, job.language, translation);
    aiCost += costYocto + check.costYocto;
    attempt.review = { pass: check.pass, score: check.score, reason: check.reason };
    if (!check.pass) {
      attempt.outcome = "failed-review";
      continue;
    }

    const agreed = BigInt(deal.agreedYocto);
    const paid = await deps.paySupplier(s, agreed, `order ${job.orderId}`);
    if (!paid.ok) {
      Object.assign(attempt, { outcome: "payment-failed", error: paid.error });
      break;
    }
    attempt.outcome = "accepted";
    receipt.delivered = { supplier: s.name, translation, paidYocto: agreed.toString(), tx: paid.hash };
    break;
  }

  if (!receipt.delivered) {
    const amount = job.priceYocto < job.maxRefundYocto ? job.priceYocto : job.maxRefundYocto;
    receipt.refund = await deps.refund(job.orderId, amount);
  }
  if (aiCost > 0n) receipt.cost = await deps.recordCost(aiCost, `AI for order ${job.orderId}`);
  return receipt;
}
