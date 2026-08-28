import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_STICKY_NOTE_SIZE,
  MIN_STICKY_NOTE_SIZE,
  constrainStickyNoteResize
} from "../src/renderer/src/features/notes/stickyNoteBounds.ts";

test("sticky-note resize preserves the opposite edge at minimum size", () => {
  const constrained = constrainStickyNoteResize({
    position: { x: 290, y: 180 },
    size: { width: 10, height: 20 }
  }, "nw");

  assert.deepEqual(constrained.size, MIN_STICKY_NOTE_SIZE);
  assert.deepEqual(constrained.position, { x: 120, y: 60 });
});

test("sticky-note resize has a generous maximum", () => {
  const constrained = constrainStickyNoteResize({
    position: { x: 10, y: 20 },
    size: { width: 4_000, height: 3_000 }
  }, "se");

  assert.deepEqual(constrained.position, { x: 10, y: 20 });
  assert.deepEqual(constrained.size, MAX_STICKY_NOTE_SIZE);
});
