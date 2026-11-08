// A customer pays for a quoted order, then the shop fulfils it.
import { createHash } from "node:crypto";
import { accountId } from "../../lib/near";
import { contract, type Order } from "../../lib/store";
import { fulfil as realFulfil, type Job, type Receipt } from "../procurement";

export type Deps = {
  order: typeof contract.order;
  maxRefund: () => Promise<bigint>;
  customer: () => string;
  pay: typeof contract.pay;
  fulfil: (job: Job) => Promise<Receipt>;
};

export const realDeps = (): Deps => ({
  order: contract.order,
  maxRefund: async () => BigInt((await contract.rules()).max_refund),
  customer: () => accountId("guest"),
  pay: contract.pay,
  fulfil: realFulfil,
});

export type Checkout = { ok: true; payTx: string; receipt: Receipt } | { ok: false; error: string; payTx?: string };

/** The text must hash to what the shopkeeper quoted on-chain, so nobody can swap in a longer text after pricing. */
export const sameText = (text: string, hash: Order["text_hash"]) =>
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
