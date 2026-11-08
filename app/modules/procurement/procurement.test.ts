import { test } from "node:test";
import assert from "node:assert/strict";
import { fulfil, negotiate, shortlist, type Deps } from "./index";
import { parseReview } from "./review";
import type { Supplier } from "../suppliers";

const N = 10n ** 18n; // 1e18 yocto keeps numbers readable
const A: Supplier = { id: "a", name: "A", account: "a.t", perWordYocto: 50n * N, minPerWordYocto: 40n * N, specialties: [], style: "" };
const B: Supplier = { id: "b", name: "B", account: "b.t", perWordYocto: 90n * N, minPerWordYocto: 70n * N, specialties: ["yoruba"], style: "" };
const ok = (hash = "tx") => ({ ok: true as const, value: undefined, hash });

function deps(over: Partial<Deps> = {}): Deps & { paid: string[] } {
  const paid: string[] = [];
  return {
    paid,
    suppliers: [A, B],
    translate: async (s) => ({ translation: `by ${s.id}`, costYocto: 1n }),
    review: async () => ({ pass: true, score: 9, reason: "good", costYocto: 1n }),
    paySupplier: async (account, amount) => (paid.push(`${account}:${amount / N}`), ok("pay")),
    recordCost: async () => ok("cost"),
    refund: async () => ok("refund"),
    ...over,
  };
}

const job = (text: string, language: string, priceWei: bigint) => ({
  orderId: 1, text, language, priceYocto: priceWei * N, maxRefundYocto: 1000n * N,
});

test("specialist goes first for its language", () => {
  assert.deepEqual(shortlist([A, B], "Yoruba").map((s) => s.id), ["b", "a"]);
  assert.deepEqual(shortlist([A, B], "French").map((s) => s.id), ["a", "b"]);
});

test("a quote within budget is accepted without a counter", () => {
  const deal = negotiate(A, 2, 400n * N); // budget 240, A quotes 100
  assert.equal(deal.counter, undefined);
  assert.equal(deal.agreedYocto, (100n * N).toString());
});

test("a quote above budget gets one counter at the budget", () => {
  const deal = negotiate(B, 2, 250n * N); // budget 150, B quotes 180, min 140
  assert.equal(deal.counter?.accepted, true);
  assert.equal(deal.agreedYocto, (150n * N).toString());
});

test("a counter below the supplier's minimum means walking away", () => {
  const deal = negotiate(B, 2, 200n * N); // budget 120, min 140
  assert.equal(deal.counter?.accepted, false);
  assert.equal(deal.agreedYocto, undefined);
});

test("delivers and pays the supplier once the review passes", async () => {
  const d = deps();
  const r = await fulfil(job("one two", "French", 400n), d); // plan 240, A quotes 100
  assert.equal(r.delivered?.translation, "by a");
  assert.deepEqual(d.paid, ["a.t:100"]);
  assert.equal(r.refund, undefined);
  assert.equal(r.cost?.ok, true);
});

test("walks away from the specialist and falls back to the other supplier", async () => {
  const d = deps();
  const r = await fulfil(job("one two", "Yoruba", 200n), d); // plan 120: B min 140 walks away, A at 100 fits
  assert.equal(r.attempts[0].outcome, "walked-away");
  assert.equal(r.delivered?.supplier, "A");
});

test("refunds the customer when no supplier passes review, and pays nobody", async () => {
  const d = deps({ review: async () => ({ pass: false, score: 3, reason: "bad", costYocto: 1n }) });
  const r = await fulfil(job("one two", "French", 400n), d);
  assert.equal(r.delivered, undefined);
  assert.equal(r.refund?.ok, true);
  assert.deepEqual(d.paid, []);
  assert.deepEqual(r.attempts.map((a) => a.outcome), ["failed-review", "failed-review"]);
});

test("review parsing fails closed on bad JSON", () => {
  assert.equal(parseReview("not json", 0n).pass, false);
  assert.equal(parseReview('{"score": 8, "reason": "fine"}', 0n).pass, true);
  assert.equal(parseReview('{"score": 6, "reason": "meh"}', 0n).pass, false);
});
