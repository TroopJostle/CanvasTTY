import assert from "node:assert/strict";
import test from "node:test";
import {
  MINIMAP_SURFACE_SIZE,
  MINIMAP_VIEWPORT_MARKER_SIZE,
  cameraWorldViewport,
  minimapCameraForPointerDrag,
  minimapAreaForBounds,
  minimapEdgePointForBounds,
  minimapPointForBounds,
  minimapWorldBounds
} from "../src/renderer/src/features/workspace/minimapGeometry.ts";

const home = {
  position: { x: 0, y: 0 },
  size: { width: 1_582, height: 1_062 }
};
const viewportSize = { width: 1_400, height: 820 };

test("camera pan moves HOME through a fixed-scale minimap window", () => {
  const initialViewport = cameraWorldViewport({ x: 0, y: 0, zoom: 1 }, viewportSize);
  const movedViewport = cameraWorldViewport({ x: -2_400, y: -600, zoom: 1 }, viewportSize);
  const initialWorld = minimapWorldBounds(initialViewport);
  const movedWorld = minimapWorldBounds(movedViewport);
  const initialHomePoint = minimapPointForBounds(home, initialWorld);
  const movedHomePoint = minimapPointForBounds(home, movedWorld);

  assert.deepEqual(movedWorld.size, initialWorld.size);
  assert.equal(movedHomePoint.x < initialHomePoint.x, true);
  assert.equal(movedHomePoint.y < initialHomePoint.y, true);
  assert.deepEqual(MINIMAP_VIEWPORT_MARKER_SIZE, { width: 46, height: 30 });
  assert.deepEqual(minimapPointForBounds(initialViewport, initialWorld), { x: 0.5, y: 0.5 });
  assert.deepEqual(minimapPointForBounds(movedViewport, movedWorld), { x: 0.5, y: 0.5 });
});

test("minimap projection uses one scale for both axes and never stretches objects", () => {
  const viewport = cameraWorldViewport({ x: 0, y: 0, zoom: 0.75 }, viewportSize);
  const world = minimapWorldBounds(viewport);
  const worldUnitsPerPixelX = world.size.width / MINIMAP_SURFACE_SIZE.width;
  const worldUnitsPerPixelY = world.size.height / MINIMAP_SURFACE_SIZE.height;
  const square = {
    position: { x: 500, y: 240 },
    size: { width: 240, height: 240 }
  };
  const projected = minimapAreaForBounds(square, world);

  assert.equal(worldUnitsPerPixelX, worldUnitsPerPixelY);
  assert.ok(projected);
  assert.equal(
    Math.round(projected.width * MINIMAP_SURFACE_SIZE.width * 1_000),
    Math.round(projected.height * MINIMAP_SURFACE_SIZE.height * 1_000)
  );
});

test("HOME edge marker exists only after HOME has left the minimap", () => {
  const viewport = cameraWorldViewport({ x: 0, y: 0, zoom: 1 }, viewportSize);
  const world = minimapWorldBounds(viewport);
  const partlyVisibleHome = {
    position: { x: world.position.x + world.size.width - 40, y: 200 },
    size: { width: 200, height: 300 }
  };
  const outsideHome = {
    position: { x: world.position.x + world.size.width + 80, y: 200 },
    size: { width: 200, height: 300 }
  };

  assert.ok(minimapAreaForBounds(home, world));
  assert.equal(minimapEdgePointForBounds(home, world), null);
  assert.ok(minimapAreaForBounds(partlyVisibleHome, world));
  assert.equal(minimapEdgePointForBounds(partlyVisibleHome, world), null);
  assert.equal(minimapAreaForBounds(outsideHome, world), null);

  const edge = minimapEdgePointForBounds(outsideHome, world);
  assert.ok(edge);
  assert.equal(edge.x > 0.9, true);
  assert.equal(edge.x < 1, true);
});

test("HOME and windows are allowed to leave instead of sticking to a clamped edge", () => {
  const viewport = cameraWorldViewport({ x: -8_000, y: 0, zoom: 1 }, viewportSize);
  const world = minimapWorldBounds(viewport);
  const point = minimapPointForBounds(home, world);

  assert.equal(point.x < 0, true);
  assert.equal(minimapAreaForBounds(home, world), null);
});

test("minimap drag follows the same grab direction as empty-canvas drag", () => {
  const camera = { x: 100, y: 200, zoom: 0.5 };
  const pointerDelta = { x: 17.2, y: 10.4 };
  const surfaceSize = { width: 172, height: 104 };
  const worldBounds = {
    position: { x: -500, y: -300 },
    size: { width: 1_720, height: 1_040 }
  };

  assert.equal(
    minimapCameraForPointerDrag("click", camera, pointerDelta, surfaceSize, worldBounds),
    null
  );
  const dragged = minimapCameraForPointerDrag("drag", camera, pointerDelta, surfaceSize, worldBounds);
  assert.ok(dragged);
  assert.equal(Math.abs(dragged.x - 186) < 1e-9, true);
  assert.equal(Math.abs(dragged.y - 252) < 1e-9, true);
  assert.equal(dragged.zoom, 0.5);
});
