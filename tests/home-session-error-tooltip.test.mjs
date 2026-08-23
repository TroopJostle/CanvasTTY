import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const homeZonePath = new URL("../src/renderer/src/features/home/HomeZone.tsx", import.meta.url);
const appStylesPath = new URL("../src/renderer/src/styles/app.css", import.meta.url);

test("Home exposes failed session details from the error mark with a Copy action", async () => {
  const source = await readFile(homeZonePath, "utf8");

  assert.match(source, /session\.failureDetails \?\? `\$\{t\(locale, "failureOutputUnavailable"\)\}\$\{session\.exitCode \?\? "unknown"\}`/);
  assert.match(source, /className="usage-row__failure-tooltip"/);
  assert.match(source, /className="usage-row__failure-trigger"/);
  assert.match(source, /<UiIcon name="error" size=\{24\} \/>/);
  assert.match(source, /window\.canvasTTY\.clipboard\.writeText\(details\)/);
  assert.match(source, /<UiIcon name="copy" size=\{16\} \/>/);
});

test("Home opens failure details from hover or keyboard focus in a top-layer popover", async () => {
  const source = await readFile(homeZonePath, "utf8");
  const styles = await readFile(appStylesPath, "utf8");

  assert.match(source, /popover="manual"/);
  assert.match(source, /onMouseEnter=\{openTooltip\}/);
  assert.match(source, /onFocus=\{openTooltip\}/);
  assert.match(source, /tooltip\.showPopover\(\)/);
  assert.match(styles, /\.usage-row__failure-tooltip \{ position: fixed;/);
  assert.match(styles, /\.usage-row__failure-tooltip:popover-open \{ display: grid; \}/);
});

test("failure popover preserves the three-row scroll viewport and danger rail", async () => {
  const styles = await readFile(appStylesPath, "utf8");

  assert.match(styles, /\.usage-list \{[^}]*overflow-y: auto;/);
  assert.doesNotMatch(styles, /\.usage-list:has\([^}]+overflow: visible;/);
  assert.match(styles, /\.usage-row-wrap:has\(\.ui-icon--error\) \.usage-row::before \{ background: var\(--danger\); \}/);
});
