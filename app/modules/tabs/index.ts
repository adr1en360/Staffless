// Store side of agent tabs: check each voucher off-chain, serve at once, settle on-chain in one go.
import { store, type TxResult } from "../../lib/near";
import { contract } from "../../lib/store";
import { words } from "../../lib/money";
import { suppliers, translate } from "../suppliers";
import { verifyVoucher, voucherMessage } from "./voucher";

export type Purchase = { customer: string; text: string; language: string; cumulativeYocto: string; signature: string };

export type Served =
  | { ok: true; translation: string; priceYocto: string; cumulativeYocto: string; settleTx?: string }
  | { ok: false; error: string };

export type Deps = {
  store: () => string;
  tab: typeof contract.tab;
  listPerWord: () => Promise<bigint>;
  translate: (text: string, language: string) => Promise<string>;
  settle: typeof contract.settleTab;
};

export const MAX_SENTENCE_WORDS = 60;
/** Unsettled amount at which the shop collects on-chain without waiting for the session to end. */
export const SETTLE_AT_YOCTO = 100_000_000_000_000_000_000_000n; // 0.1 NEAR

export const realDeps = (): Deps => ({
  store,
  tab: contract.tab,
  listPerWord: async () => BigInt((await contract.rules()).list_per_word),
  translate: async (text, language) => (await translate(suppliers()[0], text, language)).translation,
  settle: contract.settleTab,
});

export function createTabs(deps: Deps = realDeps()) {
  // shortcut: the last served voucher per customer lives in this process's memory; persist it before scaling out.
  const served = new Map<string, { cumulative: bigint; signature: string }>();

  async function buy(p: Purchase): Promise<Served> {
    const count = words(p.text);
    if (count === 0 || count > MAX_SENTENCE_WORDS) return { ok: false, error: `sentence must be 1-${MAX_SENTENCE_WORDS} words` };
    let cumulative: bigint;
    try {
      cumulative = BigInt(p.cumulativeYocto);
    } catch {
      return { ok: false, error: "cumulativeYocto must be an integer string" };
    }

    const [tab, perWord] = await Promise.all([deps.tab(p.customer), deps.listPerWord()]);
    if (!tab) return { ok: false, error: "open a tab first" };
    const price = perWord * BigInt(count);
    const previous = served.get(p.customer)?.cumulative ?? BigInt(tab.settled);
    if (cumulative !== previous + price) return { ok: false, error: `voucher must total ${previous + price}` };
    if (cumulative - BigInt(tab.settled) > BigInt(tab.balance)) return { ok: false, error: "tab underfunded" };
    if (!verifyVoucher(tab.public_key, voucherMessage(deps.store(), p.customer, cumulative), p.signature))
      return { ok: false, error: "bad voucher signature" };

    served.set(p.customer, { cumulative, signature: p.signature });
    const translation = await deps.translate(p.text, p.language);
    let settleTx: string | undefined;
    if (cumulative - BigInt(tab.settled) >= SETTLE_AT_YOCTO) {
      const res = await deps.settle(p.customer, cumulative, p.signature);
      if (res.ok) settleTx = res.hash;
    }
    return { ok: true, translation, priceYocto: price.toString(), cumulativeYocto: cumulative.toString(), settleTx };
  }

  /** End of session: collect everything served so far with the latest voucher. */
  async function settle(customer: string): Promise<TxResult<unknown>> {
    const last = served.get(customer);
    const tab = await deps.tab(customer);
    if (!last || !tab || last.cumulative <= BigInt(tab.settled)) return { ok: false, error: "nothing to settle" };
    return deps.settle(customer, last.cumulative, last.signature);
  }

  return { buy, settle };
}

let shared: ReturnType<typeof createTabs> | undefined;
/** The one tab desk this server process uses. */
export const tabs = () => (shared ??= createTabs());
