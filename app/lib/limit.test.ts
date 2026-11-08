import { test } from "node:test";
import assert from "node:assert/strict";
import { allow } from "./limit";

test("allows up to max hits per window, then frees up as the window moves", () => {
  assert.equal(allow("v", 2, 1000, 0), true);
  assert.equal(allow("v", 2, 1000, 10), true);
  assert.equal(allow("v", 2, 1000, 20), false);
  assert.equal(allow("v", 2, 1000, 1001), true);
  assert.equal(allow("other", 2, 1000, 20), true);
});
