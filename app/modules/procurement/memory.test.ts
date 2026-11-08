import { test } from "node:test";
import assert from "node:assert/strict";
import type { Entry } from "../../lib/store";
import { costMemo, declinedNote, failedNote, payMemo, readTracks, summarize } from "./memory";

const N = 10n ** 18n;
const entry = (kind: string, account: string, amount: bigint, memo: string): Entry => ({ kind, account, amount: amount.toString(), memo, block: 1 });

test("notes the shop writes are read back into each supplier's track record", () => {
  const ledger = [
    entry("Supplier", "b.t", 540n * N, payMemo(1, "Yoruba", 6, 9)),
    entry("Cost", "owner.t", 1n, costMemo(1, [declinedNote("a.t", 40n * N), failedNote("a.t", 4, " YORUBA ")])),
    entry("Supplier", "b.t", 360n * N, payMemo(2, "French", 4, 7)),
  ];
  const t = readTracks(ledger);
  assert.equal(t.get("b.t")?.paidJobs, 2);
  assert.deepEqual(t.get("b.t")?.acceptedPerWord, [90n * N, 90n * N]);
  assert.equal(t.get("a.t")?.failedReviews, 1);
  assert.deepEqual(t.get("a.t")?.declinedPerWord, [40n * N]);

  const b = summarize(t.get("b.t"), "yoruba");
  assert.equal(b.average_score, 8);
  assert.equal(b.average_score_for_this_language, 9);
  assert.equal(b.lowest_paid_per_word_near, "0.00009");

  const a = summarize(t.get("a.t"), "Yoruba");
  assert.deepEqual([a.paid_jobs, a.failed_reviews, a.average_score_for_this_language], [0, 1, 4]);
  assert.deepEqual(a.declined_offers_per_word_near, ["0.00004"]);
});

test("older notes and unrelated entries are read safely", () => {
  const t = readTracks([
    entry("Supplier", "a.t", 850n * N, "order 2"),
    entry("Cost", "owner.t", 1n, "AI for order 1"),
    entry("Sale", "guest.t", 1n, "order 3"),
  ]);
  assert.equal(t.get("a.t")?.paidJobs, 1);
  assert.equal(summarize(t.get("a.t"), "French").average_score, null);
  assert.equal(t.size, 1);
});

test("a supplier with no history gets an empty summary", () => {
  assert.deepEqual(summarize(undefined, "French"), {
    paid_jobs: 0, failed_reviews: 0, average_score: null, average_score_for_this_language: null,
    lowest_paid_per_word_near: null, declined_offers_per_word_near: [],
  });
});

test("separators in a language can't break the note format", () => {
  const t = readTracks([entry("Supplier", "a.t", 10n * N, payMemo(1, "Pidgin; or, English", 1, 8))]);
  assert.equal(t.get("a.t")?.scores[0].language, "pidgin or english");
});
