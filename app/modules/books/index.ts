// The public books: rules, today's spending, and every money move, read straight from the contract.
import { contract, type Entry, type Rules, type Summary } from "../../lib/store";

export type Books = { summary: Summary; rules: Rules; suppliers: [string, string][]; ledger: Entry[] };

export const LEDGER_PAGE = 50;

/** Newest entries first. */
export async function books(): Promise<Books> {
  const summary = await contract.summary();
  const from = Math.max(0, summary.ledger_entries - LEDGER_PAGE);
  const [rules, suppliers, ledger] = await Promise.all([contract.rules(), contract.suppliers(), contract.ledger(from, LEDGER_PAGE)]);
  return { summary, rules, suppliers, ledger: ledger.reverse() };
}
