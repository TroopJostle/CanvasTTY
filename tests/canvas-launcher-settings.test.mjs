import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeCanvasLauncherItems,
  normalizeStickyNotes,
  normalizeUiScale
} from "../src/main/services/SettingsStore.ts";
import { setCanvasLauncherItemEnabled } from "../src/renderer/src/features/launcher/canvasLauncher.ts";

test("canvas launcher entries are unique, valid, and preserve configured order", () => {
  assert.deepEqual(
    normalizeCanvasLauncherItems(["terminal", "codex", "unknown", "terminal"]),
    ["terminal", "codex"]
  );
  assert.deepEqual(normalizeCanvasLauncherItems([]), ["codex", "claude", "qwen", "opencode", "terminal"]);
});

test("launcher settings never disable the final available action", () => {
  assert.deepEqual(setCanvasLauncherItemEnabled(["terminal"], "terminal", false), ["terminal"]);
  assert.deepEqual(setCanvasLauncherItemEnabled(["terminal"], "codex", true), ["terminal", "codex"]);
});

test("UI scale is clamped and snapped to the documented step", () => {
  assert.equal(normalizeUiScale(0.2), 0.85);
  assert.equal(normalizeUiScale(1.23), 1.25);
  assert.equal(normalizeUiScale(1.12), 1.1);
  assert.equal(normalizeUiScale("large", 1), 1);
});

test("sticky-note persistence bounds count, text, and geometry", () => {
  const notes = normalizeStickyNotes([{
    id: "note-1",
    text: "x".repeat(20_100),
    position: { x: 10, y: 20 },
    size: { width: 40, height: 2_000 }
  }]);
  assert.equal(notes[0].text.length, 20_000);
  assert.deepEqual(notes[0].size, { width: 180, height: 800 });
});

test("sticky-note persistence caps valid notes instead of raw input rows", () => {
  const valid = (index) => ({
    id: `note-${index}`,
    text: "",
    position: { x: index, y: index },
    size: { width: 300, height: 220 }
  });
  const notes = normalizeStickyNotes([
    ...Array.from({ length: 128 }, () => null),
    ...Array.from({ length: 140 }, (_, index) => valid(index))
  ]);
  assert.equal(notes.length, 128);
  assert.equal(notes[0].id, "note-0");
  assert.equal(notes.at(-1).id, "note-127");
});
