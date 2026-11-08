// The only module that calls NEAR AI Cloud (OpenAI-compatible API, models run in TEEs).
import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { env } from "./near";

export type Message = ChatCompletionMessageParam;
export type Tool = ChatCompletionTool;

// GLM 5.3 Flash list price, USD per token.
const USD_PER_INPUT_TOKEN = 0.08 / 1e6;
const USD_PER_OUTPUT_TOKEN = 0.5 / 1e6;
// shortcut: fixed NEAR price for booking AI costs on-chain; use a price feed before handling real money.
const USD_PER_NEAR = 3;

let client: OpenAI | undefined;
const ai = () => (client ??= new OpenAI({ baseURL: "https://cloud-api.near.ai/v1", apiKey: env("NEARAI_API_KEY") }));

export type Completion = { message: OpenAI.Chat.Completions.ChatCompletionMessage; costYocto: bigint };

export async function chat(messages: Message[], tools?: Tool[], json = false): Promise<Completion> {
  const res = await ai().chat.completions.create({
    model: env("NEARAI_MODEL"),
    messages,
    tools,
    temperature: 0.2,
    response_format: json ? { type: "json_object" } : undefined,
  });
  return { message: res.choices[0].message, costYocto: costYocto(res.usage) };
}

export function costYocto(usage?: { prompt_tokens: number; completion_tokens: number } | null): bigint {
  if (!usage) return 0n;
  const usd = usage.prompt_tokens * USD_PER_INPUT_TOKEN + usage.completion_tokens * USD_PER_OUTPUT_TOKEN;
  return BigInt(Math.ceil((usd / USD_PER_NEAR) * 1e24));
}
