"use client";
import type { Checkout } from "../modules/checkout";
import { formatNear } from "../lib/money";
import { TxLink } from "./tx-link";

export function ReceiptView({ result }: { result: Checkout }) {
  if (!result.ok) {
    return (
      <p className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
        The payment didn&apos;t go through: {result.error}
      </p>
    );
  }
  const { receipt, payTx } = result;
  const delivered = receipt.delivered;
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      {delivered ? (
        <p className="text-lg leading-relaxed">{delivered.translation}</p>
      ) : (
        <p className="text-sm">
          {receipt.stopped ? `The shop decided not to hire anyone: ${receipt.stopped}` : "No translator passed review."} You were
          refunded{receipt.refund?.ok ? "." : `, but the refund failed: ${receipt.refund?.error}`}
        </p>
      )}

      <ul className="mt-5 space-y-3 border-t border-zinc-100 pt-4 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
        {receipt.attempts.map((a) => (
          <li key={a.supplier}>
            <span className="text-zinc-900 dark:text-zinc-100">{a.supplier}</span> quoted{" "}
            <span className="font-mono">{formatNear(a.quotedYocto, 6)}</span> NEAR. The AI offered{" "}
            <span className="font-mono">{formatNear(a.offeredYocto, 6)}</span>
            {a.outcome === "offer-declined" ? " and they said no." : "."}
            {a.review && ` Review: ${a.review.score}/10, ${a.review.reason}`}
            {a.outcome === "payment-failed" && ` Payment blocked: ${a.error}`}
            {a.reason && <span className="mt-1 block text-zinc-500">Why: {a.reason}</span>}
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs">
        <TxLink hash={payTx} label="Your payment" />
        {delivered && <TxLink hash={delivered.tx} label={`Translator paid ${formatNear(delivered.paidYocto, 6)} NEAR`} />}
        {receipt.refund?.ok && <TxLink hash={receipt.refund.hash} label="Refund" />}
        {receipt.cost?.ok && <TxLink hash={receipt.cost.hash} label="AI cost booked" />}
      </div>
    </div>
  );
}
