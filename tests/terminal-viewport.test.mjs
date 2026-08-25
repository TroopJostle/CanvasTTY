import assert from "node:assert/strict";
import test from "node:test";
import { fitTerminalPreservingViewport } from "../src/renderer/src/features/terminal/terminalViewport.ts";

function terminalFixture({
  type = "normal",
  cols = 80,
  cursorY = 3,
  viewportY = 12,
  baseY = 20,
  wrappedLines = new Set()
} = {}) {
  const calls = [];
  const marker = {
    line: viewportY,
    dispose() {
      calls.push(["dispose"]);
    }
  };
  const active = {
    type,
    cursorY,
    viewportY,
    baseY,
    getLine(line) {
      return { isWrapped: wrappedLines.has(line) };
    }
  };
  const terminal = {
    cols,
    buffer: { active },
    registerMarker(offset) {
      calls.push(["marker", offset]);
      return marker;
    },
    scrollToBottom() {
      calls.push(["bottom"]);
    },
    scrollToLine(line) {
      calls.push(["line", line]);
    }
  };
  return { active, calls, marker, terminal };
}

test("fit keeps a bottom-pinned terminal at the bottom", () => {
  const fixture = terminalFixture({ viewportY: 20, baseY: 20 });

  fitTerminalPreservingViewport(fixture.terminal, () => {
    fixture.calls.push(["fit"]);
    fixture.active.viewportY = 0;
    fixture.active.baseY = 26;
  });

  assert.deepEqual(fixture.calls, [["fit"], ["bottom"]]);
});

test("fit anchors a scrolled viewport to the same logical wrapped content", () => {
  const fixture = terminalFixture({ wrappedLines: new Set([12]) });

  fitTerminalPreservingViewport(fixture.terminal, () => {
    fixture.calls.push(["fit"]);
    fixture.terminal.cols = 40;
    fixture.active.viewportY = 0;
    fixture.active.baseY = 30;
    fixture.marker.line = 13;
  });

  assert.deepEqual(fixture.calls, [
    ["marker", -12],
    ["fit"],
    ["line", 15],
    ["dispose"]
  ]);
});

test("fit falls back to the bounded numeric viewport if its marker is trimmed", () => {
  const fixture = terminalFixture();

  fitTerminalPreservingViewport(fixture.terminal, () => {
    fixture.calls.push(["fit"]);
    fixture.active.viewportY = 0;
    fixture.active.baseY = 8;
    fixture.marker.line = -1;
  });

  assert.deepEqual(fixture.calls, [
    ["marker", -11],
    ["fit"],
    ["line", 8],
    ["dispose"]
  ]);
});

test("fit leaves alternate-buffer scrolling to the terminal application", () => {
  const fixture = terminalFixture({ type: "alternate" });

  fitTerminalPreservingViewport(fixture.terminal, () => fixture.calls.push(["fit"]));

  assert.deepEqual(fixture.calls, [["fit"]]);
});
