import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readClaudeUsage } from "../src/main/services/LimitsService.ts";

test("Claude limits use the current user's OAuth token and perform the usage request", async () => {
  const configRoot = await mkdtemp(join(tmpdir(), "canvastty-claude-limits-"));
  try {
    const userToken = ["test", "oauth", "token"].join("-");
    await writeFile(join(configRoot, ".credentials.json"), JSON.stringify({
      claudeAiOauth: { accessToken: userToken }
    }), "utf8");
    const payload = {
      five_hour: { utilization: 12, resets_at: "2026-08-28T18:00:00Z" },
      seven_day: { utilization: 34, resets_at: "2026-09-01T18:00:00Z" }
    };
    let request = null;

    const result = await readClaudeUsage("1.3.0", {
      configRoot,
      request: async (url, accessToken, headers) => {
        request = { url, accessToken, headers };
        return payload;
      }
    });

    assert.equal(result, payload);
    assert.deepEqual(request, {
      url: "https://api.anthropic.com/api/oauth/usage",
      accessToken: userToken,
      headers: {
        "anthropic-beta": "oauth-2025-04-20",
        "user-agent": "canvastty/1.3.0"
      }
    });
  } finally {
    await rm(configRoot, { recursive: true, force: true });
  }
});

test("missing Claude credentials mean sign-in is unavailable, not that a subscription is required", async () => {
  const missingRoot = await mkdtemp(join(tmpdir(), "canvastty-claude-missing-"));
  const emptyRoot = await mkdtemp(join(tmpdir(), "canvastty-claude-empty-"));
  try {
    await writeFile(join(emptyRoot, ".credentials.json"), JSON.stringify({
      claudeAiOauth: { accessToken: "" }
    }), "utf8");

    await assert.rejects(
      readClaudeUsage("1.3.0", { configRoot: missingRoot }),
      (error) => error instanceof Error && error.message === "not-authenticated"
    );
    await assert.rejects(
      readClaudeUsage("1.3.0", { configRoot: emptyRoot }),
      (error) => error instanceof Error && error.message === "not-authenticated"
    );
  } finally {
    await Promise.all([
      rm(missingRoot, { recursive: true, force: true }),
      rm(emptyRoot, { recursive: true, force: true })
    ]);
  }
});
