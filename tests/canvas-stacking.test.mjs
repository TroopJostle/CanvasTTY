import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  boundsOverlap,
  bringCanvasLayerToFront,
  canvasLayerIsOccluded,
  canvasLayerZIndex,
  reconcileCanvasLayerOrder
} from "../src/renderer/src/features/workspace/canvasStacking.ts";

const bounds = (x, y, width = 200, height = 120) => ({
  position: { x, y },
  size: { width, height }
});

test("an ordinary activation moves the selected canvas window to the front", () => {
  const initial = ["terminal:a", "browser", "note:n"];
  const raised = bringCanvasLayerToFront(initial, "terminal:a");
  assert.deepEqual(raised, ["browser", "note:n", "terminal:a"]);
  assert.equal(canvasLayerZIndex(raised, "terminal:a"), 3);
  assert.deepEqual(initial, ["terminal:a", "browser", "note:n"]);
});

test("layer reconciliation keeps user order and appends only new live windows", () => {
  assert.deepEqual(
    reconcileCanvasLayerOrder(["browser", "terminal:a", "stale", "terminal:a"], ["terminal:a", "browser", "note:n"]),
    ["browser", "terminal:a", "note:n"]
  );
});

test("the native Browser surface is hidden only under a higher overlapping layer", () => {
  const map = new Map([
    ["browser", bounds(0, 0)],
    ["terminal:a", bounds(150, 40)],
    ["note:n", bounds(500, 500)]
  ]);
  assert.equal(boundsOverlap(map.get("browser"), map.get("terminal:a")), true);
  assert.equal(canvasLayerIsOccluded("browser", ["browser", "terminal:a", "note:n"], map), true);
  assert.equal(canvasLayerIsOccluded("browser", ["terminal:a", "browser", "note:n"], map), false);
});

test("embedded plugin focus participates in ordinary click-to-front activation", async () => {
  const source = await readFile(new URL(
    "../src/renderer/src/features/plugins/PluginFrame.tsx",
    import.meta.url
  ), "utf8");
  assert.match(source, /<iframe[\s\S]*?onFocus=\{onFocus\}/);
});
