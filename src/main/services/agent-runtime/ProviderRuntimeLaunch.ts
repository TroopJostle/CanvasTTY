import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, win32 } from "node:path";
import { pathToFileURL } from "node:url";
import { parseDocument } from "yaml";
import type { ProviderId } from "../../../shared/contracts.ts";

const FILE_MODE = 0o600;
const DIRECTORY_MODE = 0o700;
const HOOK_TIMEOUT_SECONDS = 3;
const OPENCODE_CONFIG_CONTENT = "OPENCODE_CONFIG_CONTENT";
const QWEN_SYSTEM_SETTINGS = "QWEN_CODE_SYSTEM_SETTINGS_PATH";
const QWEN_HOOK_TIMEOUT_MILLISECONDS = 3_000;
const KIMI_MARKER_START = "# >>> CanvasTTY lifecycle hooks >>>";
const KIMI_MARKER_END = "# <<< CanvasTTY lifecycle hooks <<<";

type AgentProvider = Exclude<ProviderId, "terminal">;
type RuntimeState = "idle" | "working" | "needs_approval";

interface HookMapping {
  event: string;
  state: RuntimeState;
  matcher?: string;
}

export interface RuntimeHookHelperLaunch {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface ProviderRuntimeLaunchOptions {
  helper: RuntimeHookHelperLaunch;
  runtimeDirectory: string;
  openCodePluginPath: string;
  kimiHomeDirectory?: string;
  hermesHomeDirectory?: string;
  grokHomeDirectory?: string;
  qwenSystemSettingsPath?: string;
  environment?: Readonly<Record<string, string | undefined>>;
  platform?: NodeJS.Platform;
}

export interface PreparedProviderRuntimeLaunch {
  args: string[];
  environment: Record<string, string>;
  releaseConfiguration(): void;
}

export class ProviderRuntimeLaunchAdapters {
  private readonly options: ProviderRuntimeLaunchOptions;
  private readonly environment: Readonly<Record<string, string | undefined>>;
  private readonly platform: NodeJS.Platform;
  private readonly kimiHomeDirectory: string;
  private readonly hermesHomeDirectory: string;
  private readonly grokHomeDirectory: string;
  private readonly qwenSystemSettingsPath: string | null;
  private kimiOverlay: KimiRuntimeHooks | null = null;
  private kimiUsers = 0;
  private hermesOverlay: HermesRuntimeHooks | null = null;
  private hermesUsers = 0;
  private grokOverlay: GrokRuntimeHooks | null = null;
  private grokUsers = 0;

  constructor(options: ProviderRuntimeLaunchOptions) {
    validateHelper(options.helper);
    if (!isAbsolute(options.runtimeDirectory)) {
      throw new Error("Agent runtime directory must be absolute.");
    }
    if (!isAbsolute(options.openCodePluginPath)) {
      throw new Error("OpenCode lifecycle plugin path must be absolute.");
    }
    this.options = options;
    this.environment = options.environment ?? process.env;
    this.platform = options.platform ?? process.platform;
    this.kimiHomeDirectory = absoluteHome(
      options.kimiHomeDirectory ?? this.environment.KIMI_CODE_HOME ?? join(homedir(), ".kimi-code"),
      "KIMI_CODE_HOME"
    );
    this.hermesHomeDirectory = absoluteHome(
      options.hermesHomeDirectory ?? this.environment.HERMES_HOME ?? join(homedir(), ".hermes"),
      "HERMES_HOME"
    );
    this.grokHomeDirectory = absoluteHome(
      options.grokHomeDirectory ?? join(homedir(), ".grok"),
      "Grok home"
    );
    this.qwenSystemSettingsPath = resolveQwenSystemSettingsPath(
      options.qwenSystemSettingsPath ?? this.environment[QWEN_SYSTEM_SETTINGS],
      this.environment,
      this.platform
    );
  }

  prepare(provider: AgentProvider, terminalSessionId: string): PreparedProviderRuntimeLaunch {
    const environment = { ...(this.options.helper.env ?? {}) };
    if (provider === "claude") {
      return prepared(claudeLifecycleArgs(this.options.helper, this.platform), environment);
    }
    if (provider === "codex") {
      return prepared(codexLifecycleArgs(this.options.helper, this.platform), environment);
    }
    if (provider === "qwen") {
      const path = createQwenHookSettings({
        helper: this.options.helper,
        platform: this.platform,
        runtimeDirectory: this.options.runtimeDirectory,
        terminalSessionId,
        baseSettingsPath: this.qwenSystemSettingsPath
      });
      return prepared([], { ...environment, [QWEN_SYSTEM_SETTINGS]: path }, () => unlinkIfOwned(path));
    }
    if (provider === "opencode") {
      return prepared([], {
        ...environment,
        [OPENCODE_CONFIG_CONTENT]: openCodeLifecycleConfig(
          this.environment[OPENCODE_CONFIG_CONTENT],
          this.options.openCodePluginPath
        )
      });
    }
    if (provider === "kimi") {
      return prepared([], environment, this.acquireKimi());
    }
    if (provider === "hermes") {
      return prepared([], environment, this.acquireHermes());
    }
    return prepared([], environment, this.acquireGrok());
  }

  recoverConfigurations(): void {
    recoverQwenHookSettings(this.options.runtimeDirectory);
    KimiRuntimeHooks.recover(this.kimiHomeDirectory);
    HermesRuntimeHooks.recover(this.hermesHomeDirectory);
    GrokRuntimeHooks.recover(this.grokHomeDirectory);
  }

  private acquireKimi(): () => void {
    if (!this.kimiOverlay) {
      this.kimiOverlay = KimiRuntimeHooks.begin(
        this.kimiHomeDirectory,
        this.options.helper,
        this.platform
      );
    }
    this.kimiUsers += 1;
    return once(() => {
      this.kimiUsers -= 1;
      if (this.kimiUsers !== 0) return;
      const overlay = this.kimiOverlay;
      this.kimiOverlay = null;
      overlay?.cleanup();
    });
  }

  private acquireHermes(): () => void {
    if (!this.hermesOverlay) {
      this.hermesOverlay = HermesRuntimeHooks.begin(
        this.hermesHomeDirectory,
        this.options.helper,
        this.platform
      );
    }
    this.hermesUsers += 1;
    return once(() => {
      this.hermesUsers -= 1;
      if (this.hermesUsers !== 0) return;
      const overlay = this.hermesOverlay;
      this.hermesOverlay = null;
      overlay?.cleanup();
    });
  }

  private acquireGrok(): () => void {
    if (!this.grokOverlay) {
      this.grokOverlay = GrokRuntimeHooks.begin(
        this.grokHomeDirectory,
        this.options.helper,
        this.platform
      );
    }
    this.grokUsers += 1;
    return once(() => {
      this.grokUsers -= 1;
      if (this.grokUsers !== 0) return;
      const overlay = this.grokOverlay;
      this.grokOverlay = null;
      overlay?.cleanup();
    });
  }
}

const CLAUDE_HOOKS: readonly HookMapping[] = [
  { event: "SessionStart", state: "idle" },
  { event: "UserPromptSubmit", state: "working" },
  { event: "PermissionRequest", state: "needs_approval" },
  { event: "PostToolUse", state: "working" },
  { event: "Stop", state: "idle" },
  { event: "StopFailure", state: "idle" },
  { event: "SessionEnd", state: "idle" },
  { event: "Notification", matcher: "permission_prompt", state: "needs_approval" }
];

const CODEX_HOOKS: readonly HookMapping[] = [
  { event: "SessionStart", state: "idle" },
  { event: "UserPromptSubmit", state: "working" },
  { event: "PermissionRequest", state: "needs_approval" },
  { event: "PostToolUse", state: "working" },
  { event: "Stop", state: "idle" },
  { event: "SessionEnd", state: "idle" }
];

const QWEN_HOOKS: readonly HookMapping[] = [
  { event: "SessionStart", state: "idle" },
  { event: "UserPromptSubmit", state: "working" },
  { event: "PermissionRequest", state: "needs_approval" },
  { event: "PostToolUse", state: "working" },
  { event: "Stop", state: "idle" },
  { event: "StopFailure", state: "idle" },
  { event: "Notification", matcher: "permission_prompt", state: "needs_approval" },
  { event: "Notification", matcher: "idle_prompt", state: "idle" }
];

const KIMI_HOOKS: readonly HookMapping[] = [
  { event: "SessionStart", state: "idle" },
  { event: "TurnStarted", state: "working" },
  { event: "PermissionRequest", state: "needs_approval" },
  { event: "PermissionResult", state: "working" },
  { event: "Stop", state: "idle" },
  { event: "StopFailure", state: "idle" },
  { event: "Interrupt", state: "idle" },
  { event: "SessionEnd", state: "idle" }
];

const HERMES_HOOKS: readonly HookMapping[] = [
  { event: "on_session_start", state: "idle" },
  { event: "pre_llm_call", state: "working" },
  { event: "pre_approval_request", state: "needs_approval" },
  { event: "post_approval_response", state: "working" },
  { event: "on_session_end", state: "idle" }
];

const GROK_HOOKS: readonly HookMapping[] = [
  { event: "SessionStart", state: "idle" },
  { event: "UserPromptSubmit", state: "working" },
  { event: "PostToolUse", state: "working" },
  { event: "Stop", state: "idle" },
  { event: "StopFailure", state: "idle" },
  { event: "StopCancelled", state: "idle" },
  { event: "SessionEnd", state: "idle" },
  { event: "Notification", matcher: "permission_prompt", state: "needs_approval" },
  { event: "Notification", matcher: "idle_prompt", state: "idle" }
];

export function claudeLifecycleArgs(
  helper: RuntimeHookHelperLaunch,
  platform: NodeJS.Platform = process.platform
): string[] {
  validateHelper(helper);
  return [
    "--settings",
    JSON.stringify({
      showStatusInTerminalTab: true,
      hooks: groupedCommandHooks(CLAUDE_HOOKS, helper, platform)
    })
  ];
}

export function codexLifecycleArgs(
  helper: RuntimeHookHelperLaunch,
  platform: NodeJS.Platform = process.platform
): string[] {
  validateHelper(helper);
  return CODEX_HOOKS.flatMap((mapping) => {
    const matcher = mapping.matcher ? `matcher=${tomlString(mapping.matcher)},` : "";
    const hook = `type="command",command=${tomlString(hookCommand(helper, mapping, platform))},timeout=${HOOK_TIMEOUT_SECONDS}`;
    return ["-c", `hooks.${mapping.event}=[{${matcher}hooks=[{${hook}}]}]`];
  });
}

export function createQwenHookSettings(options: {
  helper: RuntimeHookHelperLaunch;
  platform?: NodeJS.Platform;
  runtimeDirectory: string;
  terminalSessionId: string;
  baseSettingsPath?: string | null;
}): string {
  validateHelper(options.helper);
  mkdirPrivate(options.runtimeDirectory);
  const path = join(options.runtimeDirectory, `qwen-hooks-${safeId(options.terminalSessionId)}.json`);
  const base = readQwenSettings(options.baseSettingsPath ?? null);
  const lifecycleHooks = groupedCommandHooks(
      QWEN_HOOKS,
      options.helper,
      options.platform ?? process.platform,
      QWEN_HOOK_TIMEOUT_MILLISECONDS
  );
  const document = {
    ...base,
    hooks: mergeHookConfiguration(base.hooks, lifecycleHooks)
  };
  atomicWrite(path, `${JSON.stringify(document, null, 2)}\n`);
  return path;
}

export function recoverQwenHookSettings(runtimeDirectory: string): void {
  if (!existsSync(runtimeDirectory)) return;
  for (const name of readdirSync(runtimeDirectory)) {
    if (/^qwen-hooks-[a-f0-9]{24}\.json$/u.test(name)) unlinkIfOwned(join(runtimeDirectory, name));
  }
}

export function openCodeLifecycleConfig(raw: string | undefined, pluginPath: string): string {
  const config = parseJsonObject(raw, OPENCODE_CONFIG_CONTENT);
  const pluginUrl = pathToFileURL(pluginPath).href;
  const current = config.plugin;
  let plugins: string[];
  if (current === undefined) plugins = [];
  else if (Array.isArray(current) && current.every((value) => typeof value === "string")) {
    plugins = [...current];
  } else {
    throw new Error("OpenCode inline config field plugin must be an array of strings.");
  }
  if (!plugins.includes(pluginUrl)) plugins.push(pluginUrl);
  return JSON.stringify({ ...config, plugin: plugins });
}

export function mergeOpenCodeLaunchEnvironment(
  browser: Readonly<Record<string, string>>,
  runtime: Readonly<Record<string, string>>
): Record<string, string> {
  const browserRaw = browser[OPENCODE_CONFIG_CONTENT];
  const runtimeRaw = runtime[OPENCODE_CONFIG_CONTENT];
  if (!browserRaw || !runtimeRaw) return { ...browser, ...runtime };
  const browserConfig = parseJsonObject(browserRaw, OPENCODE_CONFIG_CONTENT);
  const runtimeConfig = parseJsonObject(runtimeRaw, OPENCODE_CONFIG_CONTENT);
  return {
    ...browser,
    ...runtime,
    [OPENCODE_CONFIG_CONTENT]: JSON.stringify({
      ...browserConfig,
      ...runtimeConfig,
      ...(browserConfig.mcp ? { mcp: browserConfig.mcp } : {}),
      ...(browserConfig.permission ? { permission: browserConfig.permission } : {})
    })
  };
}

class KimiRuntimeHooks {
  private cleaned = false;
  private readonly path: string;
  private readonly journalPath: string;
  private readonly journal: TextOverlayJournal;

  private constructor(path: string, journalPath: string, journal: TextOverlayJournal) {
    this.path = path;
    this.journalPath = journalPath;
    this.journal = journal;
  }

  static begin(home: string, helper: RuntimeHookHelperLaunch, platform: NodeJS.Platform): KimiRuntimeHooks {
    mkdirPrivate(home);
    const path = join(home, "config.toml");
    const journalPath = join(home, ".canvastty-runtime-kimi.json");
    this.recover(home);
    const original = readOptional(path);
    const block = kimiHookBlock(helper, platform);
    if (original?.includes(KIMI_MARKER_START)) {
      throw new Error("Kimi already contains an unowned CanvasTTY lifecycle hook block.");
    }
    const mutated = `${original ?? ""}${original && !original.endsWith("\n") ? "\n" : ""}${block}`;
    const journal = createTextJournal(home, "kimi", original, mutated, { block });
    atomicWrite(journalPath, `${JSON.stringify(journal)}\n`);
    atomicWrite(path, mutated, modeOf(path));
    return new KimiRuntimeHooks(path, journalPath, journal);
  }

  static recover(home: string): void {
    const journalPath = join(home, ".canvastty-runtime-kimi.json");
    const journal = readJournal(journalPath);
    if (!journal) return;
    const path = join(home, "config.toml");
    cleanupTextOverlay(path, journal, String(journal.extra.block ?? ""));
    removeJournal(journalPath, journal);
  }

  cleanup(): void {
    if (this.cleaned) return;
    cleanupTextOverlay(this.path, this.journal, String(this.journal.extra.block ?? ""));
    removeJournal(this.journalPath, this.journal);
    this.cleaned = true;
  }
}

class HermesRuntimeHooks {
  private cleaned = false;
  private readonly path: string;
  private readonly journalPath: string;
  private readonly journal: TextOverlayJournal;

  private constructor(path: string, journalPath: string, journal: TextOverlayJournal) {
    this.path = path;
    this.journalPath = journalPath;
    this.journal = journal;
  }

  static begin(home: string, helper: RuntimeHookHelperLaunch, platform: NodeJS.Platform): HermesRuntimeHooks {
    mkdirPrivate(home);
    const path = join(home, "config.yaml");
    const journalPath = join(home, ".canvastty-runtime-hermes.json");
    this.recover(home);
    const original = readOptional(path);
    const commands = Object.fromEntries(HERMES_HOOKS.map((mapping) => [
      mapping.event,
      hookCommand(helper, mapping, platform)
    ]));
    const mutated = mutateHermesHooks(original ?? "", commands, false);
    const journal = createTextJournal(home, "hermes", original, mutated, { commands });
    atomicWrite(journalPath, `${JSON.stringify(journal)}\n`);
    atomicWrite(path, mutated, modeOf(path));
    return new HermesRuntimeHooks(path, journalPath, journal);
  }

  static recover(home: string): void {
    const journalPath = join(home, ".canvastty-runtime-hermes.json");
    const journal = readJournal(journalPath);
    if (!journal) return;
    cleanupHermes(join(home, "config.yaml"), journal);
    removeJournal(journalPath, journal);
  }

  cleanup(): void {
    if (this.cleaned) return;
    cleanupHermes(this.path, this.journal);
    removeJournal(this.journalPath, this.journal);
    this.cleaned = true;
  }
}

class GrokRuntimeHooks {
  private cleaned = false;
  private readonly path: string;
  private readonly expected: string;

  private constructor(path: string, expected: string) {
    this.path = path;
    this.expected = expected;
  }

  static begin(home: string, helper: RuntimeHookHelperLaunch, platform: NodeJS.Platform): GrokRuntimeHooks {
    const hooksDirectory = join(home, "hooks");
    mkdirPrivate(hooksDirectory);
    const path = join(hooksDirectory, "canvastty-runtime-hooks.json");
    this.recover(home);
    if (existsSync(path)) throw new Error("Grok CanvasTTY lifecycle hook path is already occupied.");
    const expected = `${JSON.stringify({ hooks: groupedCommandHooks(GROK_HOOKS, helper, platform) }, null, 2)}\n`;
    atomicWrite(path, expected);
    return new GrokRuntimeHooks(path, expected);
  }

  static recover(home: string): void {
    const path = join(home, "hooks", "canvastty-runtime-hooks.json");
    const current = readOptional(path);
    if (current === null) return;
    if (!current.includes("hook-helper.mjs") || !current.includes('"hooks"')) {
      throw new Error("Grok CanvasTTY lifecycle hook path is occupied by an unowned file.");
    }
    unlinkSync(path);
  }

  cleanup(): void {
    if (this.cleaned) return;
    const current = readOptional(this.path);
    if (current === this.expected) unlinkSync(this.path);
    else if (current !== null) {
      console.warn("CanvasTTY did not remove Grok lifecycle hooks because the owned file changed.");
    }
    this.cleaned = true;
  }
}

interface TextOverlayJournal {
  version: 1;
  provider: "kimi" | "hermes";
  originalHash: string | null;
  mutatedHash: string;
  backupPath: string;
  extra: Record<string, unknown>;
}

function createTextJournal(
  home: string,
  provider: "kimi" | "hermes",
  original: string | null,
  mutated: string,
  extra: Record<string, unknown>
): TextOverlayJournal {
  const backupDirectory = join(home, ".canvastty-runtime-backups");
  mkdirPrivate(backupDirectory);
  const backupPath = join(backupDirectory, `${provider}-${randomUUID()}.bak`);
  if (original !== null) atomicWrite(backupPath, original, modeOf(join(home, provider === "kimi" ? "config.toml" : "config.yaml")));
  return {
    version: 1,
    provider,
    originalHash: original === null ? null : hash(original),
    mutatedHash: hash(mutated),
    backupPath,
    extra
  };
}

function cleanupTextOverlay(path: string, journal: TextOverlayJournal, block: string): void {
  const current = readOptional(path);
  if (current === null) return;
  if (hash(current) === journal.mutatedHash) {
    restoreOriginal(path, journal);
    return;
  }
  if (block && current.includes(block)) {
    atomicWrite(path, current.replace(block, ""), modeOf(path));
    return;
  }
  if (current.includes(KIMI_MARKER_START) || current.includes(KIMI_MARKER_END)) {
    throw new Error("CanvasTTY Kimi lifecycle hook ownership changed before cleanup.");
  }
}

function cleanupHermes(path: string, journal: TextOverlayJournal): void {
  const current = readOptional(path);
  if (current === null) return;
  if (hash(current) === journal.mutatedHash) {
    restoreOriginal(path, journal);
    return;
  }
  const commands = journal.extra.commands;
  if (!isRecord(commands)) throw new Error("Hermes lifecycle recovery journal is invalid.");
  atomicWrite(path, mutateHermesHooks(current, commands as Record<string, string>, true), modeOf(path));
}

function mutateHermesHooks(raw: string, commands: Record<string, string>, remove: boolean): string {
  let document = parseDocument(raw, { strict: true, uniqueKeys: true });
  if (document.errors.length > 0) throw new Error("Hermes YAML lifecycle configuration is invalid.");
  let value = document.toJS({ maxAliasCount: 100 }) as unknown;
  if (value === null || value === undefined) {
    value = {};
    document = parseDocument("{}\n", { strict: true, uniqueKeys: true });
  }
  if (!isRecord(value)) throw new Error("Hermes YAML lifecycle configuration must be an object.");
  const hooksValue = value.hooks;
  if (hooksValue !== undefined && !isRecord(hooksValue)) {
    throw new Error("Hermes YAML hooks field must be an object.");
  }
  for (const [event, command] of Object.entries(commands)) {
    const current = hooksValue && isRecord(hooksValue) ? hooksValue[event] : undefined;
    if (current !== undefined && !Array.isArray(current)) {
      throw new Error(`Hermes hook ${event} must be an array.`);
    }
    const entries = Array.isArray(current) ? [...current] : [];
    const owned = (entry: unknown) => isRecord(entry)
      && entry.command === command
      && entry.timeout === HOOK_TIMEOUT_SECONDS;
    const related = (entry: unknown) => isRecord(entry)
      && typeof entry.command === "string"
      && entry.command.includes("hook-helper.mjs")
      && entry.command.includes(event);
    if (remove && entries.some((entry) => related(entry) && !owned(entry))) {
      throw new Error(`CanvasTTY Hermes lifecycle hook ownership changed for ${event}.`);
    }
    const next = remove
      ? entries.filter((entry) => !owned(entry))
      : owned(entries.at(-1)) ? entries : [...entries, { command, timeout: HOOK_TIMEOUT_SECONDS }];
    if (next.length > 0) document.setIn(["hooks", event], next);
    else document.deleteIn(["hooks", event]);
  }
  const nextValue = document.toJS({ maxAliasCount: 100 }) as unknown;
  if (isRecord(nextValue) && isRecord(nextValue.hooks) && Object.keys(nextValue.hooks).length === 0) {
    document.delete("hooks");
  }
  return document.toString({ lineWidth: 0 });
}

function kimiHookBlock(helper: RuntimeHookHelperLaunch, platform: NodeJS.Platform): string {
  const hooks = KIMI_HOOKS.map((mapping) => [
    "[[hooks]]",
    `event = ${tomlString(mapping.event)}`,
    `command = ${tomlString(hookCommand(helper, mapping, platform))}`,
    `timeout = ${HOOK_TIMEOUT_SECONDS}`
  ].join("\n")).join("\n\n");
  return `${KIMI_MARKER_START}\n${hooks}\n${KIMI_MARKER_END}\n`;
}

function groupedCommandHooks(
  mappings: readonly HookMapping[],
  helper: RuntimeHookHelperLaunch,
  platform: NodeJS.Platform,
  timeout = HOOK_TIMEOUT_SECONDS
): Record<string, unknown[]> {
  const grouped: Record<string, unknown[]> = {};
  for (const mapping of mappings) {
    (grouped[mapping.event] ??= []).push({
      ...(mapping.matcher ? { matcher: mapping.matcher } : {}),
      hooks: [{
        type: "command",
        command: hookCommand(helper, mapping, platform),
        timeout
      }]
    });
  }
  return grouped;
}

function hookCommand(
  helper: RuntimeHookHelperLaunch,
  mapping: HookMapping,
  platform: NodeJS.Platform
): string {
  const args = [helper.command, ...helper.args, mapping.state, mapping.event];
  return platform === "win32" ? windowsCommand(args) : args.map(shellQuote).join(" ");
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function windowsCommand(args: string[]): string {
  return args.map((value) => `"${value.replaceAll("%", "%%").replaceAll('"', '\\"')}"`).join(" ");
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function prepared(
  args: string[],
  environment: Record<string, string>,
  cleanup: () => void = () => undefined
): PreparedProviderRuntimeLaunch {
  return { args, environment, releaseConfiguration: once(cleanup) };
}

function once(action: () => void): () => void {
  let called = false;
  return () => {
    if (called) return;
    called = true;
    action();
  };
}

function validateHelper(helper: RuntimeHookHelperLaunch): void {
  if (!helper || typeof helper.command !== "string" || helper.command.length === 0) {
    throw new Error("Agent runtime hook helper command is invalid.");
  }
  if (!Array.isArray(helper.args) || helper.args.some((arg) => typeof arg !== "string")) {
    throw new Error("Agent runtime hook helper arguments are invalid.");
  }
  if (helper.env && Object.keys(helper.env).some((key) => key !== "ELECTRON_RUN_AS_NODE")) {
    throw new Error("Agent runtime hook helper environment is not allow-listed.");
  }
}

function absoluteHome(path: string, name: string): string {
  if (!isAbsolute(path)) throw new Error(`${name} must be an absolute path.`);
  return path;
}

function mkdirPrivate(path: string): void {
  const existed = existsSync(path);
  mkdirSync(path, { recursive: true, mode: DIRECTORY_MODE });
  if (!existed) chmodSync(path, DIRECTORY_MODE);
}

function atomicWrite(path: string, value: string, mode = FILE_MODE): void {
  mkdirPrivate(dirname(path));
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporary, value, { mode });
  chmodSync(temporary, mode);
  renameSync(temporary, path);
}

function readOptional(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function modeOf(path: string): number {
  try {
    return statSync(path).mode & 0o777;
  } catch {
    return FILE_MODE;
  }
}

function hash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function safeId(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 24);
}

function restoreOriginal(path: string, journal: TextOverlayJournal): void {
  if (journal.originalHash === null) {
    rmSync(path, { force: true });
    return;
  }
  const original = readOptional(journal.backupPath);
  if (original === null || hash(original) !== journal.originalHash) {
    throw new Error("CanvasTTY lifecycle backup is missing or invalid.");
  }
  atomicWrite(path, original, modeOf(path));
}

function readJournal(path: string): TextOverlayJournal | null {
  const raw = readOptional(path);
  if (raw === null) return null;
  const value: unknown = JSON.parse(raw);
  if (
    !isRecord(value)
    || value.version !== 1
    || (value.provider !== "kimi" && value.provider !== "hermes")
    || (value.originalHash !== null && typeof value.originalHash !== "string")
    || typeof value.mutatedHash !== "string"
    || typeof value.backupPath !== "string"
    || !isRecord(value.extra)
  ) throw new Error("CanvasTTY lifecycle recovery journal is invalid.");
  return value as unknown as TextOverlayJournal;
}

function removeJournal(path: string, journal: TextOverlayJournal): void {
  unlinkIfOwned(path);
  unlinkIfOwned(journal.backupPath);
  try {
    const backupDirectory = dirname(journal.backupPath);
    if (existsSync(backupDirectory) && readFileNames(backupDirectory).length === 0) rmSync(backupDirectory);
  } catch {
    // A concurrently active overlay may still own the shared backup directory.
  }
}

function readFileNames(path: string): string[] {
  return readdirSync(path);
}

function unlinkIfOwned(path: string): void {
  try {
    unlinkSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function parseJsonObject(raw: string | undefined, name: string): Record<string, unknown> {
  if (!raw || raw.trim().length === 0) return {};
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(`${name} must contain valid JSON before CanvasTTY can extend it.`);
  }
  if (!isRecord(value)) throw new Error(`${name} must contain a JSON object.`);
  return value;
}

function resolveQwenSystemSettingsPath(
  configured: string | undefined,
  environment: Readonly<Record<string, string | undefined>>,
  platform: NodeJS.Platform
): string | null {
  const explicit = configured?.trim();
  if (explicit) {
    if (!isAbsolute(explicit)) throw new Error(`${QWEN_SYSTEM_SETTINGS} must be an absolute path.`);
    return explicit;
  }
  const defaultPath = platform === "win32"
    ? win32.join(environment.ProgramData?.trim() || "C:\\ProgramData", "qwen-code", "settings.json")
    : platform === "darwin"
      ? "/Library/Application Support/QwenCode/settings.json"
      : "/etc/qwen-code/settings.json";
  return existsSync(defaultPath) ? defaultPath : null;
}

function readQwenSettings(path: string | null): Record<string, unknown> {
  if (!path) return {};
  const raw = readOptional(path);
  if (raw === null) {
    throw new Error(`Qwen system settings file does not exist: ${path}`);
  }
  return parseJsonObject(raw, "Qwen system settings file");
}

function mergeHookConfiguration(
  current: unknown,
  lifecycle: Record<string, unknown[]>
): Record<string, unknown[]> {
  if (current !== undefined && !isRecord(current)) {
    throw new Error("Qwen system settings hooks field must be an object.");
  }
  const result: Record<string, unknown[]> = {};
  if (isRecord(current)) {
    for (const [event, entries] of Object.entries(current)) {
      if (!Array.isArray(entries)) {
        throw new Error(`Qwen system settings hook ${event} must be an array.`);
      }
      result[event] = [...entries];
    }
  }
  for (const [event, entries] of Object.entries(lifecycle)) {
    result[event] = [...(result[event] ?? []), ...entries];
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
