// The AI shopkeeper: chats, haggles and acts through tools. The contract decides what actually happens.
import { chat as realChat, type Completion, type Message, type Tool } from "../../lib/ai";
import { accountId, call, view, type TxResult } from "../../lib/near";
import { formatNear, fromNearNumber, words } from "../../lib/money";

export const MAX_WORDS = 150;
const MAX_TURNS = 20;
const MAX_CHARS = 2_000;
const MAX_TOOL_ROUNDS = 4;

export type Turn = { role: "user" | "assistant"; content: string };

export type ShopEvent =
  | { type: "quote"; orderId: number; text: string; language: string; words: number; priceYocto: string; hash: string }
  | { type: "action"; tool: string; ok: boolean; detail: string; hash?: string };

export type Rules = { floor_per_word: string; list_per_word: string; max_refund: string };

export type Deps = {
  chat: (messages: Message[], tools: Tool[]) => Promise<Completion>;
  rules: () => Promise<Rules>;
  customer: () => string;
  quote: (customer: string, text: string, priceYocto: bigint) => Promise<TxResult<number>>;
  refund: (orderId: number, amountYocto: bigint) => Promise<TxResult<unknown>>;
  paySupplier: (account: string, amountYocto: bigint, memo: string) => Promise<TxResult<unknown>>;
};

export const realDeps = (): Deps => ({
  chat: (m, t) => realChat(m, t),
  rules: () => view<Rules>("get_rules"),
  customer: () => accountId("guest"),
  quote: (customer, text, price) => call<number>("shopkeeper", "quote", { customer, text, price: price.toString() }),
  refund: (orderId, amount) => call("shopkeeper", "refund", { order_id: orderId, amount: amount.toString() }),
  paySupplier: (supplier, amount, memo) =>
    call("shopkeeper", "pay_supplier", { supplier, amount: amount.toString(), memo }),
});

const TOOLS: Tool[] = [
  {
    type: "function",
    function: {
      name: "quote_price",
      description: "Register a price for translating a text. Returns an order number, or the contract's reason for rejecting it.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "The exact text to translate, copied from the customer" },
          language: { type: "string", description: "Target language" },
          price_per_word_near: { type: "number", description: "Price per word in NEAR" },
        },
        required: ["text", "language", "price_per_word_near"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "refund",
      description: "Refund part or all of a paid order.",
      parameters: {
        type: "object",
        properties: { order_id: { type: "integer" }, amount_near: { type: "number" }, reason: { type: "string" } },
        required: ["order_id", "amount_near", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "pay_supplier",
      description: "Pay a supplier from the shop's treasury.",
      parameters: {
        type: "object",
        properties: { account_id: { type: "string" }, amount_near: { type: "number" }, reason: { type: "string" } },
        required: ["account_id", "amount_near", "reason"],
      },
    },
  },
];

export function systemPrompt(r: Rules): string {
  const list = formatNear(r.list_per_word, 6);
  const floor = formatNear(r.floor_per_word, 6);
  return [
    "You are the shopkeeper of Staffless, a translation shop with no other staff.",
    "Customers send a text and a target language; you price it, they pay, and the shop delivers the translation.",
    `List price: ${list} NEAR per word. You may discount if the customer haggles, but the owner's floor is ${floor} NEAR per word.`,
    `Texts can be up to ${MAX_WORDS} words.`,
    "To give a price, call quote_price with the customer's exact text, the language and the per-word price. Only quote once you know both the text and the language.",
    "After a successful quote, tell the customer the total and that they can press Pay. If a tool fails, tell the customer plainly what the shop's rules allowed.",
    "Keep replies to one to three short sentences. Plain and friendly, no emojis.",
  ].join("\n");
}

function clean(history: Turn[]): Message[] {
  return history
    .slice(-MAX_TURNS)
    .filter((t) => t.role === "user" || t.role === "assistant")
    .map((t) => ({ role: t.role, content: String(t.content).slice(0, MAX_CHARS) }));
}

async function runTool(name: string, rawArgs: string, deps: Deps, events: ShopEvent[]): Promise<string> {
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(rawArgs || "{}");
  } catch {
    return "error: arguments were not valid JSON";
  }

  if (name === "quote_price") {
    const text = String(args.text ?? "");
    const language = String(args.language ?? "");
    const count = words(text);
    if (count === 0 || !language) return "error: need both a text and a language";
    if (count > MAX_WORDS) return `error: text has ${count} words; the limit is ${MAX_WORDS}`;
    const price = fromNearNumber(args.price_per_word_near) * BigInt(count);
    const res = await deps.quote(deps.customer(), text, price);
    if (!res.ok) {
      events.push({ type: "action", tool: name, ok: false, detail: res.error, hash: res.hash });
      return `rejected by the contract: ${res.error}`;
    }
    events.push({ type: "quote", orderId: res.value, text, language, words: count, priceYocto: price.toString(), hash: res.hash });
    return `order ${res.value}: ${count} words, total ${formatNear(price, 6)} NEAR`;
  }

  if (name === "refund" || name === "pay_supplier") {
    const amount = fromNearNumber(args.amount_near);
    const res =
      name === "refund"
        ? await deps.refund(Number(args.order_id), amount)
        : await deps.paySupplier(String(args.account_id ?? ""), amount, String(args.reason ?? ""));
    events.push({ type: "action", tool: name, ok: res.ok, detail: res.ok ? "done" : res.error, hash: res.hash });
    return res.ok ? "done" : `rejected by the contract: ${res.error}`;
  }

  return `error: unknown tool ${name}`;
}

export async function reply(history: Turn[], deps: Deps = realDeps()): Promise<{ reply: string; events: ShopEvent[] }> {
  const messages: Message[] = [{ role: "system", content: systemPrompt(await deps.rules()) }, ...clean(history)];
  const events: ShopEvent[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const { message } = await deps.chat(messages, TOOLS);
    const calls = message.tool_calls ?? [];
    if (calls.length === 0) return { reply: (message.content ?? "").trim(), events };
    messages.push({ role: "assistant", content: message.content ?? "", tool_calls: calls });
    for (const c of calls) {
      if (c.type !== "function") continue;
      const result = await runTool(c.function.name, c.function.arguments, deps, events).catch(
        (err: Error) => `error: ${err.message}`,
      );
      messages.push({ role: "tool", tool_call_id: c.id, content: result });
    }
  }
  return { reply: "Sorry, I got stuck. Could you say that again?", events };
}
