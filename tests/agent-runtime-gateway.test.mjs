import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { AGENT_RUNTIME_ENV, RUNTIME_PROTOCOL_VERSION } from "../src/agent-runtime/runtime-protocol.mjs";
import { RuntimeGateway } from "../src/main/services/agent-runtime/RuntimeGateway.ts";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "canvastty-runtime-gateway-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test("RuntimeGateway accepts one authenticated hook event over a mode-0600 local socket", async (t) => {
  const root = await fixture(t);
  const signals = [];
  const gateway = new RuntimeGateway({ runtimeDirectory: root, onSignal: (id, signal) => signals.push({ id, signal }) });
  const address = await gateway.start();
  t.after(() => gateway.close());
  assert.equal((await stat(address)).mode & 0o777, 0o600);

  const capability = gateway.registerSession("terminal-one", "claude");
  const helper = new URL("../src/agent-runtime/hook-helper.mjs", import.meta.url);
  const child = spawn(process.execPath, [helper.pathname, "working", "UserPromptSubmit"], {
    env: {
      ...process.env,
      [AGENT_RUNTIME_ENV.address]: capability.address,
      [AGENT_RUNTIME_ENV.terminalSessionId]: capability.terminalSessionId,
      [AGENT_RUNTIME_ENV.provider]: capability.provider,
      [AGENT_RUNTIME_ENV.capabilityToken]: capability.capabilityToken
    },
    stdio: ["pipe", "ignore", "pipe"]
  });
  child.stdin.end(JSON.stringify({ prompt: "must stay local", prompt_id: "turn-one" }));
  const result = await childResult(child);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(signals, [{
    id: "terminal-one",
    signal: { state: "working", event: "UserPromptSubmit", turnId: "turn-one" }
  }]);
  assert.equal(JSON.stringify(signals).includes("must stay local"), false);
});

test("RuntimeGateway rejects a wrong capability and ignores a stale turn completion", async (t) => {
  const root = await fixture(t);
  const signals = [];
  const gateway = new RuntimeGateway({ runtimeDirectory: root, onSignal: (id, signal) => signals.push({ id, signal }) });
  await gateway.start();
  t.after(() => gateway.close());
  const capability = gateway.registerSession("terminal-two", "codex");

  await send(capability.address, { ...message(capability, "working", "UserPromptSubmit", "turn-new") });
  await send(capability.address, { ...message(capability, "idle", "Stop", "turn-old") });
  await send(capability.address, {
    ...message(capability, "needs_approval", "PermissionRequest", "turn-new"),
    capabilityToken: "x".repeat(43)
  });

  assert.deepEqual(signals.map(({ signal }) => signal.state), ["working"]);
  assert.equal(gateway.currentStatus("terminal-two"), "working");
});

function message(capability, state, event, turnId) {
  return {
    v: RUNTIME_PROTOCOL_VERSION,
    type: "lifecycle",
    terminalSessionId: capability.terminalSessionId,
    provider: capability.provider,
    capabilityToken: capability.capabilityToken,
    state,
    event,
    turnId
  };
}

function send(address, value) {
  return new Promise((resolve) => {
    const socket = createConnection(address);
    socket.on("connect", () => socket.write(`${JSON.stringify(value)}\n`));
    socket.on("data", () => socket.destroy());
    socket.on("error", () => resolve());
    socket.on("close", () => resolve());
  });
}

function childResult(child) {
  return new Promise((resolve, reject) => {
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal, stderr }));
  });
}
