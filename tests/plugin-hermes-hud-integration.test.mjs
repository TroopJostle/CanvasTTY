import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const framePath = new URL("../src/renderer/src/features/plugins/PluginFrame.tsx", import.meta.url);
const ipcPath = new URL("../src/main/ipc/registerIpc.ts", import.meta.url);
const sdkPath = new URL("../src/main/services/PluginManager.ts", import.meta.url);

test("hermesHud has one permission-gated route from every plugin surface", async () => {
  const [frame, ipc, sdk] = await Promise.all([
    readFile(framePath, "utf8"),
    readFile(ipcPath, "utf8"),
    readFile(sdkPath, "utf8")
  ]);

  for (const method of ["getState", "open", "close"]) {
    assert.match(frame, new RegExp(`method === \\"hermesHud\\.${method}\\"`));
    assert.match(ipc, new RegExp(`method === \\"hermesHud\\.${method}\\"`));
    assert.match(sdk, new RegExp(`request\\(\\"hermesHud\\.${method}\\"\\)`));
  }
  assert.ok(frame.match(/requirePermission\(plugin, "hermes:hud"\)/g).length >= 3);
  assert.ok(ipc.match(/assertPermission\(pluginId, "hermes:hud"\)/g).length >= 6);
});
