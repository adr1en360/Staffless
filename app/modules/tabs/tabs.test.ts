import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { KeyPair } from "near-api-js";
import { buy, resetServed, settle, type Deps, type Tab } from "./index";
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

beforeEach(resetServed);

test("voucher signatures verify, and fail for another message", () => {
  const sig = signVoucher(secret, "a");
  assert.equal(verifyVoucher(key.getPublicKey().toString(), "a", sig), true);
  assert.equal(verifyVoucher(key.getPublicKey().toString(), "b", sig), false);
});

test("serves each purchase whose voucher adds exactly its price", async () => {
  const d = deps(tab());
  const first = await buy(voucher(4n), d); // 2 words x 2
  const second = await buy(voucher(8n), d);
  assert.equal(first.ok && first.translation, "fr:hello there");
  assert.equal(second.ok && second.cumulativeYocto, "8");
});

test("rejects a voucher that pays too little or reuses the last total", async () => {
  const d = deps(tab());
  assert.equal((await buy(voucher(3n), d)).ok, false);
  await buy(voucher(4n), d);
  assert.equal((await buy(voucher(4n), d)).ok, false);
});

test("rejects a forged voucher and an overdrawn tab", async () => {
  const forger = KeyPair.fromRandom("ed25519").toString();
  assert.deepEqual(await buy(voucher(4n, forger), deps(tab())), { ok: false, error: "bad voucher signature" });
  assert.deepEqual(await buy(voucher(4n), deps(tab({ balance: "3" }))), { ok: false, error: "tab underfunded" });
});

test("settles once with the latest voucher", async () => {
  const settled: bigint[] = [];
  const d = deps(tab(), settled);
  await buy(voucher(4n), d);
  await buy(voucher(8n), d);
  assert.equal((await settle("agent.t", d)).ok, true);
  assert.deepEqual(settled, [8n]);
});
