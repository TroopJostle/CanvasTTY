import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const settingsPanelPath = new URL("../src/renderer/src/features/settings/SettingsPanel.tsx", import.meta.url);
const agentHooksPath = new URL("../src/renderer/src/features/settings/AgentHooksSettings.tsx", import.meta.url);
const aboutPath = new URL("../src/renderer/src/features/settings/AboutSettings.tsx", import.meta.url);
const workspacePath = new URL("../src/renderer/src/features/workspace/WorkspaceCanvas.tsx", import.meta.url);
const minimapPath = new URL("../src/renderer/src/features/workspace/CanvasMinimap.tsx", import.meta.url);
const homeZonePath = new URL("../src/renderer/src/features/home/HomeZone.tsx", import.meta.url);
const appStylesPath = new URL("../src/renderer/src/styles/app.css", import.meta.url);

test("About is the final Settings tab and owns the expandable hook FAQ", async () => {
  const [settings, about] = await Promise.all([
    readFile(settingsPanelPath, "utf8"),
    readFile(aboutPath, "utf8")
  ]);
  assert.match(settings, /"browser", "plugins", "about"/);
  assert.match(settings, /section === "about" && <AboutSettings/);
  assert.match(about, /<details key=\{question\}>/);
  assert.match(about, /aboutFaqPluginHooksQuestion/);
});

test("Hooks stays concise while detailed safety copy is available in About", async () => {
  const hooks = await readFile(agentHooksPath, "utf8");
  assert.match(hooks, /pluginHookSecuritySummary/);
  assert.doesNotMatch(hooks, /agentHooksRestartNote|agentHooksProviderTrustNote|pluginHookActivationNote/);
  assert.doesNotMatch(hooks, /pluginHookSecurityWarning/);
});

test("HOME and rename are independent shortcut settings with mouse capture", async () => {
  const settings = await readFile(settingsPanelPath, "utf8");
  assert.doesNotMatch(settings, /<SettingGroup label=\{t\(locale, "keyboardShortcuts"\)\}>/);
  assert.match(settings, /label=\{t\(locale, "homeShortcut"\)\} description=\{t\(locale, "homeShortcutDescription"\)\}/);
  assert.match(settings, /label=\{t\(locale, "renameWindow"\)\} description=\{t\(locale, "renameWindowDescription"\)\}/);
  assert.match(settings, /capturePointerShortcut\("home", event\)/);
  assert.match(settings, /capturePointerShortcut\("renameWindow", event\)/);
});

test("canvas overlays share configurable collision-safe corner slots", async () => {
  const [settings, workspace, minimap] = await Promise.all([
    readFile(settingsPanelPath, "utf8"),
    readFile(workspacePath, "utf8"),
    readFile(minimapPath, "utf8")
  ]);
  assert.match(settings, /settings\.minimapPlacement/);
  assert.match(settings, /settings\.minimapInteractionMode/);
  assert.match(settings, /settings\.shortcutHintsPlacement/);
  assert.match(settings, /settings\.canvasControlsPlacement/);
  assert.match(workspace, /CANVAS_OVERLAY_PLACEMENTS\.map/);
  assert.match(workspace, /<CanvasMinimap/);
  assert.match(workspace, /interactionMode=\{settings\.minimapInteractionMode\}/);
  assert.match(minimap, /setPointerCapture/);
  assert.match(minimap, /interactionMode === "drag"/);
  assert.match(minimap, /data-interaction-mode=\{interactionMode\}/);
  assert.match(minimap, /applyCamera\(\{/);
});

test("General keeps terminal restore opt-in", async () => {
  const settings = await readFile(settingsPanelPath, "utf8");
  assert.match(settings, /settings\.restoreTerminalSessions \? "save" : "discard"/);
  assert.match(settings, /restoreTerminalSessions: value === "save"/);
});

test("Appearance controls whole-row session status colors", async () => {
  const [settings, home, styles] = await Promise.all([
    readFile(settingsPanelPath, "utf8"),
    readFile(homeZonePath, "utf8"),
    readFile(appStylesPath, "utf8")
  ]);
  assert.match(settings, /value=\{settings\.sessionRowColorMode\}/);
  assert.match(settings, /sessionRowColorsByStatus/);
  assert.match(settings, /sessionRowColorsMonochrome/);
  assert.match(home, /data-session-row-colors=\{settings\.sessionRowColorMode\}/);
  assert.match(home, /data-session-tone=\{sessionStatusTone\(session\.status\)\}/);
  assert.match(styles, /data-session-tone="working"/);
  assert.match(styles, /data-session-tone="waiting"/);
});

test("empty-canvas context menu creates persisted named color regions", async () => {
  const workspace = await readFile(workspacePath, "utf8");
  assert.match(workspace, /onContextMenu=/);
  assert.match(workspace, /<CanvasRegionMenu/);
  assert.match(workspace, /canvasRegionAtPoint/);
  assert.match(workspace, /settings\.canvasRegions\.map/);
  assert.match(workspace, /onCreateCanvasRegion/);
});
