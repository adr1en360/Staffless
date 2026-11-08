import { test } from "node:test";
import assert from "node:assert/strict";
import { fulfil, type Deps } from "./index";
import { parseDecision, type Decision, type Situation } from "./decide";
import { parseReview } from "./review";
import type { Supplier } from "../suppliers";

const N = 10n ** 18n; // keeps numbers readable
const A: Supplier = { id: "a", name: "A", account: "a.t", perWordYocto: 50n * N, minPerWordYocto: 40n * N, specialties: [], style: "" };
const B: Supplier = { id: "b", name: "B", account: "b.t", perWordYocto: 90n * N, minPerWordYocto: 70n * N, specialties: ["yoruba"], style: "" };
const ok = (hash = "tx") => ({ ok: true as const, value: undefined, hash });

/** A scripted AI: returns the given decisions in order and records what it was shown. */
function deps(decisions: Array<[string | null, bigint]>, over: Partial<Deps> = {}) {
  const paid: string[] = [];
  const seen: Situation[] = [];
  let i = 0;
  const d: Deps = {
    suppliers: [A, B],
    decide: async (s): Promise<Decision> => {
      seen.push(s);
      const [supplierId, offer] = decisions[i++] ?? [null, 0n];
      return { supplierId, offerYocto: offer * N, reason: "because", costYocto: 1n };
    },
    translate: async (s) => ({ translation: `by ${s.id}`, costYocto: 1n }),
    review: async () => ({ pass: true, score: 9, reason: "good", costYocto: 1n }),
    paySupplier: async (account, amount) => (paid.push(`${account}:${amount / N}`), ok("pay")),
    recordCost: async () => ok("cost"),
    refund: async () => ok("refund"),
    ...over,
  };
  return { d, paid, seen };
}

// 2 words: A quotes 100 (min 80), B quotes 180 (min 140). Sale 400 means a budget of 240.
const job = (sale: bigint) => ({ orderId: 1, text: "one two", language: "Yoruba", priceYocto: sale * N, maxRefundYocto: 1000n * N });

test("pays the supplier the AI chose, at its offer, once the review passes", async () => {
  const { d, paid } = deps([["b", 180n]]);
  const r = await fulfil(job(400n), d);
  assert.equal(r.delivered?.translation, "by b");
  assert.deepEqual(paid, ["b.t:180"]);
  assert.equal(r.refund, undefined);
});

test("a counter the supplier accepts is what gets paid", async () => {
  const { d, paid } = deps([["b", 150n]]);
  await fulfil(job(400n), d);
  assert.deepEqual(paid, ["b.t:150"]);
});

test("the AI can never pay above the quote or the budget", async () => {
  const overQuote = deps([["a", 999n]]);
  await fulfil(job(400n), overQuote.d);
  assert.deepEqual(overQuote.paid, ["a.t:100"]);

  const overBudget = deps([["b", 999n]]); // sale 250 means a budget of 150, still above B's minimum of 140
  await fulfil(job(250n), overBudget.d);
  assert.deepEqual(overBudget.paid, ["b.t:150"]);
});

test("a declined offer is shown to the AI before it chooses again", async () => {
  const { d, paid, seen } = deps([["b", 100n], ["a", 100n]]);
  const r = await fulfil(job(400n), d);
  assert.deepEqual(r.attempts.map((a) => a.outcome), ["offer-declined", "accepted"]);
  assert.deepEqual(seen[1].tried.map((t) => t.outcome), ["offer-declined"]);
  assert.deepEqual(seen[1].options.map((o) => o.id), ["a"]);
  assert.deepEqual(paid, ["a.t:100"]);
});

test("buying from nobody refunds the customer and pays no one", async () => {
  const { d, paid } = deps([[null, 0n]]);
  const r = await fulfil(job(400n), d);
  assert.equal(r.stopped, "because");
  assert.equal(r.refund?.ok, true);
  assert.deepEqual(paid, []);
});

test("an unknown supplier id stops buying instead of paying anyone", async () => {
  const { d, paid } = deps([["scammer", 100n]]);
  const r = await fulfil(job(400n), d);
  assert.equal(r.refund?.ok, true);
  assert.deepEqual(paid, []);
});

test("work that fails review is not paid; the AI tries the other supplier", async () => {
  let n = 0;
  const { d, paid } = deps([["b", 180n], ["a", 100n]], {
    review: async () => ({ pass: n++ > 0, score: n > 1 ? 8 : 3, reason: "x", costYocto: 1n }),
  });
  const r = await fulfil(job(400n), d);
  assert.deepEqual(r.attempts.map((a) => a.outcome), ["failed-review", "accepted"]);
  assert.deepEqual(paid, ["a.t:100"]);
});

test("decision parsing fails closed", () => {
  assert.equal(parseDecision("not json", 0n).supplierId, null);
  assert.equal(parseDecision('{"supplier": "a", "offer_near": "lots", "reason": "x"}', 0n).supplierId, null);
  assert.equal(parseDecision('{"supplier": null, "reason": "too pricey"}', 0n).reason, "too pricey");
  const d = parseDecision('{"supplier": "b", "offer_near": 0.0002, "reason": "specialist"}', 0n);
  assert.deepEqual([d.supplierId, d.offerYocto], ["b", 200_000_000_000_000_000_000n]);
});

test("review parsing fails closed on bad JSON", () => {
  assert.equal(parseReview("not json", 0n).pass, false);
  assert.equal(parseReview('{"score": 8, "reason": "fine"}', 0n).pass, true);
  assert.equal(parseReview('{"score": 6, "reason": "meh"}', 0n).pass, false);
});
