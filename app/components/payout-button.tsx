"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { TxLink } from "./tx-link";

/** Anyone can trigger a payout; the contract decides how much moves. */
export function PayoutButton() {
  const router = useRouter();
  const [state, setState] = useState<{ busy: boolean; hash?: string; error?: string }>({ busy: false });

  async function run() {
    setState({ busy: true });
    const res = await fetch("/api/payout", { method: "POST" });
    const data = (await res.json()) as { ok?: boolean; hash?: string; error?: string };
    setState({ busy: false, hash: data.hash, error: data.ok ? undefined : data.error });
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <button
        onClick={run}
        disabled={state.busy}
        className="rounded-full border border-zinc-300 px-4 py-2 transition hover:border-emerald-600 active:scale-[0.98] disabled:opacity-50 dark:border-zinc-700 dark:hover:border-emerald-400"
      >
        {state.busy ? "Paying out" : "Run payout"}
      </button>
      {state.error && <span className="text-rose-700 dark:text-rose-300">Contract said: {state.error}</span>}
      {state.hash && !state.error && <TxLink hash={state.hash} label="Payout sent" />}
    </div>
  );
}
