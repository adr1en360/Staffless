import { books } from "../../modules/books";
import { formatNear } from "../../lib/money";
import { explorerAccount, explorerBlock } from "../../lib/links";
import { PayoutButton } from "../../components/payout-button";

export const dynamic = "force-dynamic";

const KIND: Record<string, string> = {
  Sale: "Sale",
  TabSettle: "Agent tab settled",
  Refund: "Refund",
  Supplier: "Translator paid",
  Cost: "AI cost",
  Payout: "Payout",
  Withdraw: "Owner withdrawal",
};
const MONEY_IN = new Set(["Sale", "TabSettle"]);

const near = (yocto: string) => formatNear(yocto, 6);

export default async function BooksPage() {
  const { summary, rules, suppliers, ledger } = await books();
  const store = process.env.STORE_CONTRACT_ID ?? "";

  const stats = [
    { label: "Treasury", value: `${near(summary.treasury)} NEAR` },
    { label: "Spent today", value: `${near(summary.spend_today)} of ${near(summary.daily_spend_cap)} NEAR` },
    { label: "Orders quoted", value: String(summary.orders) },
  ];
  const ruleRows = [
    ["Lowest price a person can haggle to", `${near(rules.floor_per_word)} NEAR a word`],
    ["Price for AI agents on a tab", `${near(rules.list_per_word)} NEAR a word`],
    ["Largest refund per order", `${near(rules.max_refund)} NEAR`],
    ["Daily limit on translators and AI costs", `${near(rules.daily_spend_cap)} NEAR`],
    ["Cash kept in reserve", `${near(rules.reserve)} NEAR`],
    ["Contributor's share of each payout", `${rules.contributor_bps / 100}%`],
    ["Approved translators", suppliers.map(([id]) => id.split(".")[0]).join(", ")],
  ];

  return (
    <main className="mx-auto max-w-6xl px-4 pb-20 pt-6 md:px-8 lg:pt-12">
      <h1 className="text-4xl font-semibold tracking-tighter md:text-5xl">The books</h1>
      <p className="mt-4 max-w-[60ch] leading-relaxed text-zinc-600 dark:text-zinc-400">
        Read live from{" "}
        <a href={explorerAccount(store)} target="_blank" rel="noreferrer" className="font-mono text-sm underline underline-offset-4">
          {store}
        </a>
        . Every sale, translator payment, refund and payout the contract allowed is listed here.
        {summary.frozen && " The owner has frozen the shop, so it is not taking orders."}
      </p>

      <dl className="mt-10 grid gap-6 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <dt className="text-sm text-zinc-500">{s.label}</dt>
            <dd className="mt-1 font-mono text-2xl">{s.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-14 grid gap-12 lg:grid-cols-[4fr_8fr]">
        <section>
          <h2 className="text-lg font-semibold">Owner&apos;s rules</h2>
          <p className="mt-1 text-sm text-zinc-500">Enforced by the contract. The AI can&apos;t change them.</p>
          <dl className="mt-5 space-y-4 text-sm">
            {ruleRows.map(([k, v]) => (
              <div key={k}>
                <dt className="text-zinc-500">{k}</dt>
                <dd className="mt-0.5 font-mono">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-8">
            <PayoutButton />
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Ledger</h2>
          {ledger.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500">Nothing yet. Place an order in the shop and it will show up here.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="text-zinc-500">
                  <tr>
                    <th className="pb-3 font-normal">What</th>
                    <th className="pb-3 font-normal">Account</th>
                    <th className="pb-3 text-right font-normal">Amount</th>
                    <th className="pb-3 pl-6 font-normal">Block</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200/70 dark:divide-zinc-800/70">
                  {ledger.map((e, i) => (
                    <tr key={`${e.block}-${i}`}>
                      <td className="py-2.5">
                        {KIND[e.kind] ?? e.kind}
                        {e.memo && e.memo !== "tab" && <span className="ml-2 text-zinc-500">{e.memo}</span>}
                      </td>
                      <td className="py-2.5 font-mono text-xs text-zinc-600 dark:text-zinc-400">{e.account}</td>
                      <td className={`py-2.5 text-right font-mono ${MONEY_IN.has(e.kind) ? "text-emerald-700 dark:text-emerald-400" : ""}`}>
                        {MONEY_IN.has(e.kind) ? "+" : "-"}
                        {near(e.amount)}
                      </td>
                      <td className="py-2.5 pl-6 font-mono text-xs">
                        <a href={explorerBlock(e.block)} target="_blank" rel="noreferrer" className="text-zinc-500 underline-offset-4 hover:underline">
                          {e.block}
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
