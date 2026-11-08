// The AI shopkeeper: chats, haggles and acts through tools. The contract decides what actually happens.
import { chat as realChat, type Completion, type Message, type Tool } from "../../lib/ai";
import { accountId, type TxResult } from "../../lib/near";
import { contract, type Rules } from "../../lib/store";
import { formatNear, fromNearNumber, words } from "../../lib/money";

export const MAX_WORDS = 150;
const MAX_TURNS = 20;
const MAX_CHARS = 2_000;
const MAX_TOOL_ROUNDS = 4;

export type Turn = { role: "user" | "assistant"; content: string };

export type ShopEvent =
  | { type: "quote"; orderId: number; text: string; language: string; words: number; priceYocto: string; hash: string }
  | { type: "action"; tool: string; ok: boolean; detail: string; hash?: string };

export type Deps = {
  chat: (messages: Message[], tools: Tool[]) => Promise<Completion>;
  rules: () => Promise<Pick<Rules, "list_per_word">>;
  customer: () => string;
  quote: typeof contract.quote;
  refund: typeof contract.refund;
  paySupplier: typeof contract.paySupplier;
};

export const realDeps = (): Deps => ({
  chat: (m, t) => realChat(m, t),
  rules: contract.rules,
  customer: () => accountId("guest"),
  quote: contract.quote,
  refund: contract.refund,
  paySupplier: contract.paySupplier,
});

type Args = Record<string, unknown>;
type ToolDef = {
  description: string;
  parameters: Record<string, unknown>;
  run: (args: Args, deps: Deps, events: ShopEvent[]) => Promise<string>;
};

/** Records what the contract did with a money move and tells the model in plain words. */
function report(tool: string, res: TxResult<unknown>, events: ShopEvent[]): string {
  events.push({ type: "action", tool, ok: res.ok, detail: res.ok ? "done" : res.error, hash: res.hash });
  return res.ok ? "done" : `rejected by the contract: ${res.error}`;
}

const object = (properties: Record<string, unknown>) => ({ type: "object", properties, required: Object.keys(properties) });

// One entry per tool: the schema the model sees and the code that runs it.
const TOOL_DEFS: Record<string, ToolDef> = {
  quote_price: {
    description: "Register a price for translating a text. Returns an order number, or the contract's reason for rejecting it.",
    parameters: object({
      text: { type: "string", description: "The exact text to translate, copied from the customer" },
      language: { type: "string", description: "Target language" },
      price_per_word_near: { type: "number", description: "Price per word in NEAR" },
    }),
    async run(args, deps, events) {
      const text = String(args.text ?? "");
      const language = String(args.language ?? "");
      const count = words(text);
      if (count === 0 || !language) return "error: need both a text and a language";
      if (count > MAX_WORDS) return `error: text has ${count} words; the limit is ${MAX_WORDS}`;
      const price = fromNearNumber(args.price_per_word_near) * BigInt(count);
      const res = await deps.quote(deps.customer(), text, price);
      if (!res.ok) return report("quote_price", res, events);
      events.push({ type: "quote", orderId: res.value, text, language, words: count, priceYocto: price.toString(), hash: res.hash });
      return `order ${res.value}: ${count} words, total ${formatNear(price, 6)} NEAR`;
    },
  },
  refund: {
    description: "Refund part or all of a paid order.",
    parameters: object({ order_id: { type: "integer" }, amount_near: { type: "number" }, reason: { type: "string" } }),
    run: async (args, deps, events) =>
      report("refund", await deps.refund(Number(args.order_id), fromNearNumber(args.amount_near)), events),
  },
  pay_supplier: {
    description: "Pay a supplier from the shop's treasury.",
    parameters: object({ account_id: { type: "string" }, amount_near: { type: "number" }, reason: { type: "string" } }),
    run: async (args, deps, events) =>
      report(
        "pay_supplier",
        await deps.paySupplier(String(args.account_id ?? ""), fromNearNumber(args.amount_near), String(args.reason ?? "")),
        events,
      ),
  },
};

const TOOLS: Tool[] = Object.entries(TOOL_DEFS).map(([name, t]) => ({
  type: "function",
  function: { name, description: t.description, parameters: t.parameters },
}));

async function runTool(name: string, rawArgs: string, deps: Deps, events: ShopEvent[]): Promise<string> {
  const def = TOOL_DEFS[name];
  if (!def) return `error: unknown tool ${name}`;
  let args: Args;
  try {
    args = JSON.parse(rawArgs || "{}");
  } catch {
    return "error: arguments were not valid JSON";
  }
  return def.run(args, deps, events).catch((err: Error) => `error: ${err.message}`);
}

export function systemPrompt(r: Pick<Rules, "list_per_word">): string {
  const list = formatNear(r.list_per_word, 6);
  return [
    "You are the shopkeeper of Staffless, a translation shop with no other staff.",
    "Customers send a text and a target language; you price it, they pay, and the shop delivers the translation.",
    `List price: ${list} NEAR per word. You may give a discount if the customer haggles.`,
    "The owner set a minimum price that only the shop's contract knows. If the contract rejects a quote, call quote_price again with a higher price, then tell the customer the new total.",
    `Texts can be up to ${MAX_WORDS} words.`,
    "To give a price, call quote_price with the customer's exact text, the language and the per-word price. Only quote once you know both the text and the language.",
    "After a successful quote, tell the customer the total and that they can press Pay. If a tool fails, tell the customer plainly what the shop's rules allowed.",
    "Keep replies to one to three short sentences. Plain and friendly, no emojis, no dashes between clauses.",
  ].join("\n");
}

function clean(history: Turn[]): Message[] {
  return history
    .slice(-MAX_TURNS)
    .filter((t) => t.role === "user" || t.role === "assistant")
    .map((t) => ({ role: t.role, content: String(t.content).slice(0, MAX_CHARS) }));
}

export async function reply(history: Turn[], deps: Deps = realDeps()): Promise<{ reply: string; events: ShopEvent[] }> {
  const messages: Message[] = [{ role: "system", content: systemPrompt(await deps.rules()) }, ...clean(history)];
  const events: ShopEvent[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const { message } = await deps.chat(messages, TOOLS);
    const calls = message.tool_calls ?? [];
    // The page bans em and en dashes; swap any the model still writes for a comma.
    if (calls.length === 0) return { reply: (message.content ?? "").trim().replace(/\s*[–—]\s*/g, ", "), events };
    messages.push({ role: "assistant", content: message.content ?? "", tool_calls: calls });
    for (const c of calls) {
      if (c.type !== "function") continue;
      messages.push({ role: "tool", tool_call_id: c.id, content: await runTool(c.function.name, c.function.arguments, deps, events) });
    }
  }
  return { reply: "Sorry, I got stuck. Could you say that again?", events };
}
