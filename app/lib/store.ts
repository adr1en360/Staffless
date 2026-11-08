// Typed mirror of the store contract (contract/src). The only place that knows its method names,
// argument shapes and return types. Amounts are bigint here and decimal strings on the wire.
import { call, view } from "./near";

export type Rules = {
  floor_per_word: string;
  list_per_word: string;
  max_refund: string;
  daily_spend_cap: string;
  reserve: string;
  contributor_bps: number;
  close_delay_ns: string;
};

export type Summary = {
  owner: string;
  shopkeeper: string;
  contributor: string;
  frozen: boolean;
  treasury: string;
  spend_today: string;
  daily_spend_cap: string;
  orders: number;
  ledger_entries: number;
};

export type Order = {
  customer: string;
  words: number;
  price: string;
  text_hash: number[];
  status: "Quoted" | "Paid" | "Refunded";
};

export type Tab = { public_key: string; balance: string; settled: string; last_settle_ns: number };

export type Entry = { kind: string; account: string; amount: string; memo: string; block: number };

const s = (n: bigint) => n.toString();

export const contract = {
  rules: () => view<Rules>("get_rules"),
  summary: () => view<Summary>("get_summary"),
  suppliers: () => view<[string, string][]>("get_suppliers"),
  order: (orderId: number) => view<Order | null>("get_order", { order_id: orderId }),
  tab: (customer: string) => view<Tab | null>("get_tab", { customer }),
  ledger: (from: number, limit: number) => view<Entry[]>("get_ledger", { from, limit }),

  // Signed with the shopkeeper's function-call key.
  quote: (customer: string, text: string, price: bigint) => call<number>("shopkeeper", "quote", { customer, text, price: s(price) }),
  refund: (orderId: number, amount: bigint) => call("shopkeeper", "refund", { order_id: orderId, amount: s(amount) }),
  paySupplier: (supplier: string, amount: bigint, memo: string) =>
    call("shopkeeper", "pay_supplier", { supplier, amount: s(amount), memo }),
  recordCost: (amount: bigint, memo: string) => call("shopkeeper", "record_cost", { amount: s(amount), memo }),
  settleTab: (customer: string, cumulative: bigint, signature: string) =>
    call("shopkeeper", "settle_tab", { customer, cumulative: s(cumulative), signature }),

  // Signed by customers. Anyone can trigger a payout; the guest account does it for the website.
  pay: (orderId: number, price: bigint) => call("guest", "pay", { order_id: orderId }, price),
  openTab: (publicKey: string, deposit: bigint) => call("agent", "open_tab", { public_key: publicKey }, deposit),
  payout: () => call("guest", "payout", {}),
};
