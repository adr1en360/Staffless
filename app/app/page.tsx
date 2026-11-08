import Link from "next/link";
import { Prohibit, Scales, ShieldCheck } from "@phosphor-icons/react/ssr";
import { view } from "../lib/near";
import { formatNear } from "../lib/money";
import { Chat } from "../components/chat";

export const dynamic = "force-dynamic";

export default async function ShopPage() {
  const rules = await view<{ floor_per_word: string; list_per_word: string }>("get_rules");
  const floor = formatNear(rules.floor_per_word, 6);
  const list = formatNear(rules.list_per_word, 6);

  const facts = [
    { icon: Scales, text: `Haggle all you want. Any price under ${floor} NEAR a word fails on-chain.` },
    { icon: ShieldCheck, text: "The AI pays a translator only after the work passes review." },
    { icon: Prohibit, text: "The AI's key can't withdraw money. Only the owner's can." },
  ];

  return (
    <main className="mx-auto grid max-w-6xl gap-10 px-4 pb-16 pt-6 md:px-8 lg:grid-cols-[5fr_7fr] lg:gap-16 lg:pt-12">
      <section className="lg:pt-6">
        <h1 className="text-4xl font-semibold leading-[1.05] tracking-tighter md:text-5xl">A translation shop with no staff</h1>
        <p className="mt-5 max-w-[46ch] text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
          An AI runs it. A NEAR contract holds the money and checks every payment against the owner&apos;s rules.
        </p>
        <ul className="mt-10 space-y-5">
          {facts.map(({ icon: Icon, text }) => (
            <li key={text} className="flex gap-3 text-[15px] leading-snug text-zinc-700 dark:text-zinc-300">
              <Icon size={22} weight="duotone" className="mt-px shrink-0 text-emerald-600 dark:text-emerald-400" />
              {text}
            </li>
          ))}
        </ul>
        <p className="mt-10 max-w-[46ch] text-sm leading-relaxed text-zinc-500">
          List price is {list} NEAR a word. This runs on NEAR testnet, and a shared guest account pays, so you don&apos;t
          need a wallet. Every payment shows up in the{" "}
          <Link href="/books" className="text-zinc-900 underline underline-offset-4 dark:text-zinc-100">
            books
          </Link>
          .
        </p>
      </section>
      <Chat />
    </main>
  );
}
