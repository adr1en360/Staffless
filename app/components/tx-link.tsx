"use client";
import { ArrowUpRight } from "@phosphor-icons/react";
import { explorerTx } from "../lib/links";

export function TxLink({ hash, label }: { hash?: string; label: string }) {
  if (!hash) return <span className="text-zinc-500">{label}</span>;
  return (
    <a
      href={explorerTx(hash)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-0.5 text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
    >
      {label}
      <ArrowUpRight size={12} weight="bold" />
    </a>
  );
}
