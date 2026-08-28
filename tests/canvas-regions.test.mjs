import assert from "node:assert/strict";
import test from "node:test";
import {
  boundsCenterInsideRegion,
  canvasRegionAtPoint,
  constrainCanvasRegionBounds,
  translateBounds
} from "../src/renderer/src/features/workspace/canvasRegions.ts";

const region = {
  id: "region-1",
  title: "Backend",
  color: "#B8CF99",
  position: { x: 100, y: 200 },
  size: { width: 960, height: 600 }
};

test("a named region is centered on the canvas context-menu point", () => {
  assert.deepEqual(canvasRegionAtPoint("Backend", "#B8CF99", { x: 500, y: 400 }, "region-1"), {
    ...region,
    position: { x: 20, y: 100 }
  });
});

test("window membership follows spatial containment of its center", () => {
  assert.equal(boundsCenterInsideRegion({
    position: { x: 180, y: 260 },
    size: { width: 700, height: 430 }
  }, region), true);
  assert.equal(boundsCenterInsideRegion({
    position: { x: 980, y: 740 },
    size: { width: 700, height: 430 }
  }, region), false);
});

test("moving a region translates contained window bounds without resizing them", () => {
  const bounds = { position: { x: 180, y: 260 }, size: { width: 700, height: 430 } };
  assert.deepEqual(translateBounds(bounds, { x: 80, y: -30 }), {
    position: { x: 260, y: 230 },
    size: { width: 700, height: 430 }
  });
});

test("region resize keeps the opposite edge while enforcing a usable minimum", () => {
  assert.deepEqual(constrainCanvasRegionBounds({
    position: { x: 700, y: 500 },
    size: { width: 120, height: 100 }
  }, "nw"), {
    position: { x: 460, y: 360 },
    size: { width: 360, height: 240 }
  });
});
