import assert from "node:assert/strict";
import test from "node:test";
import {
  constrainStickyNoteResize,
  MAX_STICKY_NOTE_SIZE,
  MIN_STICKY_NOTE_SIZE,
  stickyNoteAtPoint
} from "../src/renderer/src/features/notes/stickyNoteBounds.ts";
import { snapResize } from "../src/renderer/src/features/workspace/snap.ts";

test("a new sticky note is centered on the requested canvas point", () => {
  assert.deepEqual(stickyNoteAtPoint({ x: 500, y: 400 }, "note-1"), {
    id: "note-1",
    text: "",
    position: { x: 350, y: 290 },
    size: { width: 300, height: 220 }
  });
});

test("west and north note resize preserve the opposite edges at size limits", () => {
  assert.deepEqual(constrainStickyNoteResize({
    position: { x: 500, y: 400 },
    size: { width: 20, height: 30 }
  }, "nw"), {
    position: { x: 340, y: 290 },
    size: { width: 180, height: 140 }
  });
  assert.deepEqual(constrainStickyNoteResize({
    position: { x: 0, y: 0 },
    size: { width: 5_000, height: 4_000 }
  }, "se").size, { width: 1_000, height: 800 });
});

test("note snapping uses note limits instead of terminal-card limits", () => {
  assert.deepEqual(snapResize({
    position: { x: 13, y: 17 },
    size: { width: 180, height: 140 }
  }, "se", [], {
    min: MIN_STICKY_NOTE_SIZE,
    max: MAX_STICKY_NOTE_SIZE
  }), {
    position: { x: 13, y: 17 },
    size: { width: 180, height: 143 }
  });
});
