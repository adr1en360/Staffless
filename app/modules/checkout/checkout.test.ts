import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { checkout, type Deps } from "./index";
import type { Order } from "../../lib/store";

const hashOf = (t: string) => [...createHash("sha256").update(t).digest()];
const order = (over: Partial<Order> = {}): Order => ({
  customer: "guest.t", words: 2, price: "400", text_hash: hashOf("hello friend"), status: "Quoted", ...over,
});

function deps(o: Order | null, over: Partial<Deps> = {}): Deps & { paid: bigint[] } {
  const paid: bigint[] = [];
  return {
    paid,
    order: async () => o,
    maxRefund: async () => 1000n,
    customer: () => "guest.t",
    pay: async (_id, price) => (paid.push(price), { ok: true, value: undefined, hash: "pay" }),
    fulfil: async (job) => ({ orderId: job.orderId, attempts: [] }),
    ...over,
  };
}

test("pays the quoted price, then fulfils", async () => {
  const d = deps(order());
  const r = await checkout(3, "hello friend", "French", d);
  assert.equal(r.ok, true);
  assert.deepEqual(d.paid, [400n]);
});

test("refuses a text that differs from the quoted one, before paying", async () => {
  const d = deps(order());
  const r = await checkout(3, "hello friend and a much longer text", "French", d);
  assert.deepEqual(r, { ok: false, error: "text does not match the quote" });
  assert.deepEqual(d.paid, []);
});

test("refuses orders that are already paid or belong to someone else", async () => {
  assert.equal((await checkout(3, "hello friend", "French", deps(order({ status: "Paid" })))).ok, false);
  assert.equal((await checkout(3, "hello friend", "French", deps(order({ customer: "x.t" })))).ok, false);
  assert.equal((await checkout(3, "hello friend", "French", deps(null))).ok, false);
});
