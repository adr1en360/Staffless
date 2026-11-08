// A customer pays for a quoted order, then the shop fulfils it.
import { createHash } from "node:crypto";
import { accountId, call, view, type TxResult } from "../../lib/near";
import { fulfil as realFulfil, type Job, type Receipt } from "../procurement";

export type Order = { customer: string; words: number; price: string; text_hash: number[]; status: string };

export type Deps = {
  order: (id: number) => Promise<Order | null>;
  maxRefund: () => Promise<bigint>;
  customer: () => string;
  pay: (id: number, priceYocto: bigint) => Promise<TxResult<unknown>>;
  fulfil: (job: Job) => Promise<Receipt>;
};

export const realDeps = (): Deps => ({
  order: (id) => view<Order | null>("get_order", { order_id: id }),
  maxRefund: async () => BigInt((await view<{ max_refund: string }>("get_rules")).max_refund),
  customer: () => accountId("guest"),
  pay: (id, price) => call("guest", "pay", { order_id: id }, price),
  fulfil: realFulfil,
});

export type Checkout = { ok: true; payTx: string; receipt: Receipt } | { ok: false; error: string; payTx?: string };

/** The text must hash to what the shopkeeper quoted on-chain, so nobody can swap in a longer text after pricing. */
export const sameText = (text: string, hash: number[]) =>
  createHash("sha256").update(text).digest().equals(Buffer.from(hash));

export async function checkout(orderId: number, text: string, language: string, deps: Deps = realDeps()): Promise<Checkout> {
  const order = await deps.order(orderId);
  if (!order) return { ok: false, error: "no such order" };
  if (order.status !== "Quoted") return { ok: false, error: `order is ${order.status.toLowerCase()}` };
  if (order.customer !== deps.customer()) return { ok: false, error: "not your order" };
  if (!sameText(text, order.text_hash)) return { ok: false, error: "text does not match the quote" };

  const price = BigInt(order.price);
  const paid = await deps.pay(orderId, price);
  if (!paid.ok) return { ok: false, error: paid.error, payTx: paid.hash };
  const receipt = await deps.fulfil({ orderId, text, language, priceYocto: price, maxRefundYocto: await deps.maxRefund() });
  return { ok: true, payTx: paid.hash, receipt };
}
