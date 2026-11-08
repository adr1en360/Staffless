import { test } from "node:test";
import assert from "node:assert/strict";
import { bps, formatNear, toYocto, words } from "./money";

test("words matches the contract's whitespace split", () => {
  assert.equal(words("  hello   my\nfriend\t "), 3);
  assert.equal(words("   "), 0);
});

test("toYocto and formatNear round-trip", () => {
  assert.equal(toYocto("0.0001"), 100_000_000_000_000_000_000n);
  assert.equal(toYocto(2), 2_000_000_000_000_000_000_000_000n);
  assert.equal(formatNear(toYocto("0.01234")), "0.01234");
  assert.equal(formatNear(toYocto(3)), "3");
});

test("bps rounds down", () => {
  assert.equal(bps(100n, 6_000), 60n);
  assert.equal(bps(5n, 3_333), 1n);
});

test("fromNearNumber has no float noise and rejects junk", async () => {
  const { fromNearNumber } = await import("./money");
  assert.equal(fromNearNumber(0.0002), 200_000_000_000_000_000_000n);
  assert.throws(() => fromNearNumber("abc"));
  assert.throws(() => fromNearNumber(-1));
});
