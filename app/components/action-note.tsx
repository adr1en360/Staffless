"use client";
import { CheckCircle, Prohibit } from "@phosphor-icons/react";
import type { ShopEvent } from "../modules/shopkeeper";
import { TxLink } from "./tx-link";

type Action = Extract<ShopEvent, { type: "action" }>;

const NAMES: Record<string, string> = { quote_price: "a quote", refund: "a refund", pay_supplier: "a payment" };

/** Shows what the contract did when the AI tried to move money or set a price. */
export function ActionNote({ action }: { action: Action }) {
  const what = NAMES[action.tool] ?? action.tool;
  return action.ok ? (
    <p className="flex items-center gap-2 text-xs text-zinc-500">
      <CheckCircle size={14} weight="fill" className="text-emerald-600 dark:text-emerald-400" />
      The AI made {what}.
      <TxLink hash={action.hash} label="View" />
    </p>
  ) : (
    <p className="flex flex-wrap items-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
      <Prohibit size={14} weight="bold" />
      The AI tried {what}. The contract blocked it: {action.detail}.
      <TxLink hash={action.hash} label="View" />
    </p>
  );
}
