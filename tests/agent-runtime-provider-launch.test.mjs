import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { parse as parseYaml } from "yaml";

import {
  ProviderRuntimeLaunchAdapters,
  claudeLifecycleArgs,
  codexLifecycleArgs,
  mergeOpenCodeLaunchEnvironment,
  openCodeLifecycleConfig
} from "../src/main/services/agent-runtime/ProviderRuntimeLaunch.ts";

const helper = Object.freeze({
  command: "/opt/CanvasTTY Agent/electron",
  args: ["/opt/CanvasTTY Agent/agent-runtime/hook-helper.mjs"],
  env: { ELECTRON_RUN_AS_NODE: "1" }
});

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "canvastty-runtime-launch-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test("Claude and Codex receive automatic lifecycle hooks without prompt or response forwarding", () => {
  const claude = claudeLifecycleArgs(helper, "linux");
  assert.equal(claude[0], "--settings");
  const settings = JSON.parse(claude[1]);
  assert.equal(settings.showStatusInTerminalTab, true);
  assert.match(settings.hooks.UserPromptSubmit[0].hooks[0].command, /working.*UserPromptSubmit/u);
  assert.match(settings.hooks.PermissionRequest[0].hooks[0].command, /needs_approval.*PermissionRequest/u);
  assert.match(settings.hooks.Stop[0].hooks[0].command, /idle.*Stop/u);
  assert.equal(JSON.stringify(settings).includes('"prompt":'), false);
  assert.equal(JSON.stringify(settings).includes('"response":'), false);

  const codex = codexLifecycleArgs(helper, "linux");
  assert.ok(codex.includes("-c"));
  assert.ok(codex.some((value) => value.startsWith("hooks.UserPromptSubmit=")));
  assert.ok(codex.some((value) => value.startsWith("hooks.PermissionRequest=")));
  assert.ok(codex.some((value) => value.startsWith("hooks.Stop=")));
});

test("OpenCode lifecycle plugin merges with browser MCP inline config", () => {
  const pluginPath = "/opt/CanvasTTY/agent-runtime/opencode-plugin.mjs";
  const runtime = {
    OPENCODE_CONFIG_CONTENT: openCodeLifecycleConfig(
      JSON.stringify({ model: "provider/model", plugin: ["file:///existing.mjs"] }),
      pluginPath
    )
  };
  const browser = {
    OPENCODE_CONFIG_CONTENT: JSON.stringify({
      model: "provider/model",
      mcp: { canvastty_browser: { type: "local" } },
      permission: { canvastty_browser: "allow" }
    })
  };
  const merged = JSON.parse(mergeOpenCodeLaunchEnvironment(browser, runtime).OPENCODE_CONFIG_CONTENT);
  assert.deepEqual(merged.mcp, { canvastty_browser: { type: "local" } });
  assert.deepEqual(merged.permission, { canvastty_browser: "allow" });
  assert.deepEqual(merged.plugin, [
    "file:///existing.mjs",
    pathToFileURL(pluginPath).href
  ]);
});

test("Qwen uses a private per-session settings file and removes it on cleanup", async (t) => {
  const root = await fixture(t);
  const systemSettingsPath = join(root, "qwen-system-settings.json");
  await writeFile(systemSettingsPath, JSON.stringify({
    theme: "user-theme",
    hooks: { UserPromptSubmit: [{ hooks: [{ type: "command", command: "existing-hook" }] }] }
  }));
  const adapters = adaptersFor(root, systemSettingsPath);
  const launch = adapters.prepare("qwen", "session-qwen");
  const path = launch.environment.QWEN_CODE_SYSTEM_SETTINGS_PATH;
  const config = JSON.parse(await readFile(path, "utf8"));
  assert.equal(config.theme, "user-theme");
  assert.equal(config.hooks.UserPromptSubmit[0].hooks[0].command, "existing-hook");
  assert.match(config.hooks.UserPromptSubmit[1].hooks[0].command, /working.*UserPromptSubmit/u);
  assert.equal(config.hooks.UserPromptSubmit[1].hooks[0].timeout, 3000);
  launch.releaseConfiguration();
  await assert.rejects(readFile(path, "utf8"), /ENOENT/u);
});

test("Kimi, Hermes, and Grok restore only their temporary hook configuration", async (t) => {
  const root = await fixture(t);
  const kimiHome = join(root, "kimi");
  const hermesHome = join(root, "hermes");
  const grokHome = join(root, "grok");
  await Promise.all([
    mkdir(kimiHome, { recursive: true }),
    mkdir(hermesHome, { recursive: true }),
    mkdir(grokHome, { recursive: true })
  ]);
  const kimiOriginal = "# original kimi\n";
  const hermesOriginal = "model:\n  default: provider/model\n";
  await writeFile(join(kimiHome, "config.toml"), kimiOriginal);
  await writeFile(join(hermesHome, "config.yaml"), hermesOriginal);

  const adapters = new ProviderRuntimeLaunchAdapters({
    helper,
    runtimeDirectory: join(root, "runtime"),
    openCodePluginPath: join(root, "opencode-plugin.mjs"),
    kimiHomeDirectory: kimiHome,
    hermesHomeDirectory: hermesHome,
    grokHomeDirectory: grokHome,
    platform: "linux",
    environment: {}
  });
  const kimi = adapters.prepare("kimi", "session-kimi");
  assert.match(await readFile(join(kimiHome, "config.toml"), "utf8"), /\[\[hooks\]\][\s\S]*TurnStarted/u);
  kimi.releaseConfiguration();
  assert.equal(await readFile(join(kimiHome, "config.toml"), "utf8"), kimiOriginal);

  const hermes = adapters.prepare("hermes", "session-hermes");
  const hermesDuring = parseYaml(await readFile(join(hermesHome, "config.yaml"), "utf8"));
  assert.match(hermesDuring.hooks.pre_llm_call[0].command, /working.*pre_llm_call/u);
  assert.equal("type" in hermesDuring.hooks.pre_llm_call[0], false);
  hermes.releaseConfiguration();
  assert.equal(await readFile(join(hermesHome, "config.yaml"), "utf8"), hermesOriginal);

  const grok = adapters.prepare("grok", "session-grok");
  const grokPath = join(grokHome, "hooks", "canvastty-runtime-hooks.json");
  const grokDuring = JSON.parse(await readFile(grokPath, "utf8"));
  assert.match(grokDuring.hooks.Notification[0].hooks[0].command, /needs_approval.*Notification/u);
  grok.releaseConfiguration();
  await assert.rejects(readFile(grokPath, "utf8"), /ENOENT/u);
});

function adaptersFor(root, qwenSystemSettingsPath) {
  return new ProviderRuntimeLaunchAdapters({
    helper,
    runtimeDirectory: join(root, "runtime"),
    openCodePluginPath: join(root, "opencode-plugin.mjs"),
    kimiHomeDirectory: join(root, "kimi"),
    hermesHomeDirectory: join(root, "hermes"),
    grokHomeDirectory: join(root, "grok"),
    ...(qwenSystemSettingsPath ? { qwenSystemSettingsPath } : {}),
    platform: "linux",
    environment: {}
  });
}
