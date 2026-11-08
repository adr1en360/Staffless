// The public books: rules, today's spending, and every money move, read straight from the contract.
import { view } from "../../lib/near";

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

export type Entry = { kind: string; account: string; amount: string; memo: string; block: number };

export type Books = { summary: Summary; rules: Rules; suppliers: [string, string][]; ledger: Entry[] };

export const LEDGER_PAGE = 50;

/** Newest entries first. */
export async function books(): Promise<Books> {
  const summary = await view<Summary>("get_summary");
  const from = Math.max(0, summary.ledger_entries - LEDGER_PAGE);
  const [rules, suppliers, ledger] = await Promise.all([
    view<Rules>("get_rules"),
    view<[string, string][]>("get_suppliers"),
    view<Entry[]>("get_ledger", { from, limit: LEDGER_PAGE }),
  ]);
  return { summary, rules, suppliers, ledger: ledger.reverse() };
}
