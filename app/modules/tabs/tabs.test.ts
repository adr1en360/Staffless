import { test } from "node:test";
import assert from "node:assert/strict";
import { KeyPair } from "near-api-js";
import { createTabs, type Deps } from "./index";
import type { Tab } from "../../lib/store";
import { signVoucher, verifyVoucher, voucherMessage } from "./voucher";

const key = KeyPair.fromRandom("ed25519");
const secret = key.toString();
const PER_WORD = 2n;

function deps(tab: Tab | null, settled: bigint[] = []): Deps {
  return {
    store: () => "store.t",
    tab: async () => tab,
    listPerWord: async () => PER_WORD,
    translate: async (t) => `fr:${t}`,
    settle: async (_c, cumulative) => (settled.push(cumulative), { ok: true, value: undefined, hash: "s" }),
  };
}

const tab = (over: Partial<Tab> = {}): Tab => ({
  public_key: key.getPublicKey().toString(), balance: "1000", settled: "0", last_settle_ns: 0, ...over,
});

const voucher = (cumulative: bigint, signer = secret) => ({
  customer: "agent.t", text: "hello there", language: "French",
  cumulativeYocto: cumulative.toString(),
  signature: signVoucher(signer, voucherMessage("store.t", "agent.t", cumulative)),
});

test("voucher signatures verify, and fail for another message", () => {
  const sig = signVoucher(secret, "a");
  assert.equal(verifyVoucher(key.getPublicKey().toString(), "a", sig), true);
  assert.equal(verifyVoucher(key.getPublicKey().toString(), "b", sig), false);
});

test("serves each purchase whose voucher adds exactly its price", async () => {
  const { buy } = createTabs(deps(tab()));
  const first = await buy(voucher(4n)); // 2 words x 2
  const second = await buy(voucher(8n));
  assert.equal(first.ok && first.translation, "fr:hello there");
  assert.equal(second.ok && second.cumulativeYocto, "8");
});

test("rejects a voucher that pays too little or reuses the last total", async () => {
  const { buy } = createTabs(deps(tab()));
  assert.equal((await buy(voucher(3n))).ok, false);
  await buy(voucher(4n));
  assert.equal((await buy(voucher(4n))).ok, false);
});

test("rejects a forged voucher and an overdrawn tab", async () => {
  const forger = KeyPair.fromRandom("ed25519").toString();
  assert.deepEqual(await createTabs(deps(tab())).buy(voucher(4n, forger)), { ok: false, error: "bad voucher signature" });
  assert.deepEqual(await createTabs(deps(tab({ balance: "3" }))).buy(voucher(4n)), { ok: false, error: "tab underfunded" });
});

test("settles once with the latest voucher", async () => {
  const settled: bigint[] = [];
  const desk = createTabs(deps(tab(), settled));
  await desk.buy(voucher(4n));
  await desk.buy(voucher(8n));
  assert.equal((await desk.settle("agent.t")).ok, true);
  assert.deepEqual(settled, [8n]);
});
