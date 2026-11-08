"use client";
import { CircleNotch } from "@phosphor-icons/react";
import type { ShopEvent } from "../modules/shopkeeper";
import { formatNear } from "../lib/money";
import { TxLink } from "./tx-link";

type Quote = Extract<ShopEvent, { type: "quote" }>;

export function QuoteCard({ quote, state, onPay }: { quote: Quote; state: "open" | "paying" | "done"; onPay: () => void }) {
  const total = formatNear(quote.priceYocto, 6);
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Order {quote.orderId}, {quote.words} words into {quote.language}
        </p>
        <p className="font-mono text-lg font-medium">{total} NEAR</p>
      </div>
      <div className="mt-4 flex items-center justify-between gap-4 text-xs">
        <TxLink hash={quote.hash} label="Quote on-chain" />
        {state === "open" && (
          <button
            onClick={onPay}
            className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 active:scale-[0.98] dark:bg-emerald-500 dark:text-zinc-950 dark:hover:bg-emerald-400"
          >
            Pay {total} NEAR
          </button>
        )}
        {state === "paying" && (
          <span className="inline-flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
            <CircleNotch size={16} className="animate-spin motion-reduce:animate-none" />
            Paying and hiring a translator
          </span>
        )}
        {state === "done" && <span className="text-sm text-zinc-500">Paid</span>}
      </div>
    </div>
  );
}
