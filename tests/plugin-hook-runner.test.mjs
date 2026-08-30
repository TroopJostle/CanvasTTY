import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const runner = fileURLToPath(new URL("../src/agent-runtime/plugin-hook-runner.mjs", import.meta.url));

test("plugin hook runner correlates the CanvasTTY session and strips host capabilities", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "canvastty-plugin-hook-runner-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const pluginRoot = join(root, "plugin");
  const entry = join(pluginRoot, "hook.mjs");
  const output = join(root, "hook-output.json");
  const registry = join(root, "plugin-hooks.json");
  await mkdir(pluginRoot, { recursive: true });
  await writeFile(entry, `
    import { readFileSync, writeFileSync } from "node:fs";
    const input = JSON.parse(readFileSync(0, "utf8"));
    writeFileSync(process.env.CANVASTTY_TEST_HOOK_OUTPUT, JSON.stringify({
      input,
      environment: {
        terminalSessionId: process.env.CANVASTTY_PLUGIN_HOOK_TERMINAL_SESSION_ID ?? null,
        capability: process.env.CANVASTTY_RUNTIME_CAPABILITY ?? null
      }
    }));
  `);
  await writeFile(registry, JSON.stringify({
    version: 1,
    hooks: {
      "com.example.audit:audit": {
        pluginId: "com.example.audit",
        hookId: "audit",
        root: pluginRoot,
        entry: "hook.mjs",
        providers: ["codex"],
        events: ["prompt-submit"]
      }
    }
  }));

  const result = runHook(registry, output, JSON.stringify({ prompt: "local payload" }));
  assert.equal(result.status, 0, result.stderr);
  const received = JSON.parse(await readFile(output, "utf8"));
  assert.deepEqual(received.input, {
    apiVersion: 1,
    pluginId: "com.example.audit",
    hookId: "audit",
    terminalSessionId: "terminal-session-one",
    provider: "codex",
    event: "prompt-submit",
    providerEvent: "UserPromptSubmit",
    payload: { prompt: "local payload" }
  });
  assert.deepEqual(received.environment, {
    terminalSessionId: "terminal-session-one",
    capability: null
  });

  await writeFile(registry, JSON.stringify({ version: 1, hooks: {} }));
  await rm(output);
  const revoked = runHook(registry, output, "{}");
  assert.equal(revoked.status, 0, revoked.stderr);
  await assert.rejects(readFile(output, "utf8"), /ENOENT/u);
});

function runHook(registry, output, input) {
  return spawnSync(process.execPath, [
    runner,
    registry,
    "com.example.audit:audit",
    "codex",
    "prompt-submit",
    "UserPromptSubmit"
  ], {
    env: {
      ...process.env,
      CANVASTTY_TEST_HOOK_OUTPUT: output,
      CANVASTTY_PLUGIN_HOOK_TERMINAL_SESSION_ID: "terminal-session-one",
      CANVASTTY_RUNTIME_CAPABILITY: "must-not-reach-plugin"
    },
    input,
    encoding: "utf8"
  });
}
