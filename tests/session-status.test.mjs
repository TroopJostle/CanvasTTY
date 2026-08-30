import assert from "node:assert/strict";
import test from "node:test";
import { sessionStatusTone } from "../src/renderer/src/lib/sessionStatusTone.ts";

test("session rows map lifecycle states to the three requested background tones", () => {
  assert.equal(sessionStatusTone("idle"), "idle");
  assert.equal(sessionStatusTone("working"), "working");
  assert.equal(sessionStatusTone("needs_approval"), "waiting");
  assert.equal(sessionStatusTone("unavailable"), "idle");
  assert.equal(sessionStatusTone("done"), "idle");
  assert.equal(sessionStatusTone("failed"), "idle");
});
