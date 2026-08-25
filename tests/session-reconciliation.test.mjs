import assert from "node:assert/strict";
import test from "node:test";

import {
  mergeSessionSnapshots,
  upsertSnapshot
} from "../src/renderer/src/lib/sessionReconciliation.ts";

function session(overrides = {}) {
  return {
    id: "session-one",
    revision: 1,
    provider: "codex",
    profile: "normal",
    title: "project · Codex",
    titleCustomized: false,
    cwd: "/project",
    position: { x: 0, y: 0 },
    size: { width: 700, height: 430 },
    status: "unavailable",
    startedAt: 100,
    exitCode: null,
    failureDetails: null,
    buffer: "",
    ...overrides
  };
}

test("a delayed initial snapshot cannot replace a newer lifecycle state", () => {
  const current = [session({ revision: 3, status: "idle" })];
  const delayed = session({ revision: 1, status: "unavailable", buffer: "boot output" });

  assert.deepEqual(mergeSessionSnapshots(current, [delayed]), [
    session({ revision: 3, status: "idle", buffer: "boot output" })
  ]);
});

test("a newer session revision still advances normal lifecycle transitions", () => {
  const current = [session({ revision: 3, status: "working", buffer: "existing" })];
  const next = session({ revision: 4, status: "idle", buffer: "existing" });

  assert.deepEqual(upsertSnapshot(current, next), [next]);
});

test("an initial list does not discard a session created after its snapshot", () => {
  const live = session({ id: "session-two", revision: 1, status: "idle" });

  assert.deepEqual(mergeSessionSnapshots([live], []), [live]);
});
