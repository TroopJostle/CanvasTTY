import assert from "node:assert/strict";
import test from "node:test";
import {
  HermesHudService,
  parseHermesDesktopRuntimeState
} from "../src/main/services/HermesHudService.ts";

const availableHermes = {
  state: "available",
  provider: "hermes",
  executable: "/opt/hermes/bin/hermes",
  launcher: "native",
  environment: { PATH: "/opt/hermes/bin:/usr/bin" },
  checked: []
};

function registry(resolution = availableHermes) {
  return {
    get(provider) {
      assert.equal(provider, "hermes");
      return resolution;
    },
    snapshot() {
      throw new Error("not used");
    }
  };
}

function runtime(hudOpen) {
  return JSON.stringify({
    version: 1,
    pid: 4242,
    hudOpen,
    startedAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_100
  });
}

test("parses only the bounded Hermes Desktop runtime-state contract", () => {
  assert.equal(parseHermesDesktopRuntimeState(runtime(true)).hudOpen, true);
  assert.throws(() => parseHermesDesktopRuntimeState(JSON.stringify({
    version: 1,
    pid: 4242,
    hudOpen: true,
    startedAt: 1,
    updatedAt: 2,
    command: "arbitrary"
  })));
  assert.throws(() => parseHermesDesktopRuntimeState("{}"));
});

test("opens Hermes in HUD mode through one fixed detached command", async () => {
  let state = null;
  const launches = [];
  const service = new HermesHudService(registry(), "/var/lib/hermes-test", {
    readText: async () => {
      if (state === null) throw Object.assign(new Error("missing"), { code: "ENOENT" });
      return state;
    },
    processAlive: () => true,
    spawnProcess: (command, args, options) => {
      launches.push({ command, args, options });
      state = runtime(true);
      return { pid: 9001, unref() {} };
    },
    sleep: async () => {},
    pollIntervalMs: 0,
    openTimeoutMs: 50
  });

  assert.deepEqual(await service.open(), { state: "running", hudOpen: true });
  assert.equal(launches.length, 1);
  assert.equal(launches[0].command, availableHermes.executable);
  assert.deepEqual(launches[0].args, ["desktop", "--skip-build", "--hud"]);
  assert.equal(launches[0].options.detached, true);
  assert.equal(launches[0].options.stdio, "ignore");
});

test("closes the live Hermes process through its fixed quit control", async () => {
  let state = runtime(true);
  const launches = [];
  const service = new HermesHudService(registry(), "/var/lib/hermes-test", {
    readText: async () => {
      if (state === null) throw Object.assign(new Error("missing"), { code: "ENOENT" });
      return state;
    },
    processAlive: () => true,
    spawnProcess: (_command, args) => {
      launches.push(args);
      state = null;
      return { pid: 9002, unref() {} };
    },
    sleep: async () => {},
    pollIntervalMs: 0,
    closeTimeoutMs: 50
  });

  assert.deepEqual(await service.close(), { state: "stopped" });
  assert.deepEqual(launches, [["desktop", "--skip-build", "--quit"]]);
});

test("reports CLI absence and stale runtime records explicitly", async () => {
  const unavailable = {
    state: "unavailable",
    provider: "hermes",
    reason: "cli-not-found",
    checked: [],
    diagnostic: "Hermes CLI was not found."
  };
  const missing = new HermesHudService(registry(unavailable), "/var/lib/hermes-test");
  assert.deepEqual(await missing.status(), {
    state: "unavailable",
    reason: "cli-not-found",
    message: "Hermes CLI was not found."
  });

  const stale = new HermesHudService(registry(), "/var/lib/hermes-test", {
    readText: async () => runtime(true),
    processAlive: () => false
  });
  assert.deepEqual(await stale.status(), { state: "stopped" });
});
