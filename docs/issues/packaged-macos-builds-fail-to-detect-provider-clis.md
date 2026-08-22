# Packaged macOS builds fail to detect installed provider CLIs

## Bug

Codex launches in development but the installed macOS app reports `Codex · CLI not found` and
creates an empty `Failed` terminal.

In the reproduced case, Codex was installed at `/opt/homebrew/bin/codex`, but the Finder-launched
app did not inherit that directory in `PATH`. Adding it to the main-process environment restored
Codex launch and limits.

Expected: CLI availability must be identical in development and packaged builds. If a CLI is
unavailable, `(!)` must show a copyable diagnostic even when the PTY is empty.

## Reproduction

1. Install Codex at `/opt/homebrew/bin/codex`.
2. Confirm it works through `npm run dev`.
3. Build, install, and launch the macOS `.app` from Finder.
4. Launch Codex from HOME.

## Root cause

Provider CLI discovery has no single owner:

- POSIX terminal launch delegates command lookup to `node-pty`.
- `LimitsService` and `ProviderLaunch` perform separate command lookups.
- Provider smoke tests launch development Electron with the caller's `PATH`, not the packaged app
  with a Finder-like environment.

The current PATH augmentation fixes known Homebrew locations but does not guarantee that all
consumers use the same executable or produce useful errors.

## Proposed solution

- Resolve every provider CLI once at startup to either an absolute executable or a structured
  `cli-not-found` result containing the paths checked.
- Search in this order: test override, input `PATH`, platform defaults, then known user/provider
  directories. Validate that the selected file is executable. Do not use a login shell as the primary
  resolver.
- Pass the same resolved executable to terminal launch, limits, and agent-browser integration.
- Fail before creating the PTY when resolution fails. Show the structured error in `(!)` and make
  the complete text copyable.
- Add a packaged macOS smoke test with a minimal Finder-like `PATH`, no credentials, and no network.

The initial implementation may require restarting CanvasTTY after installing a new CLI.

## Acceptance criteria

- [ ] Terminal launch, limits, and agent-browser integration use one resolved executable.
- [ ] A packaged macOS app finds supported Homebrew CLIs with a minimal `PATH`.
- [ ] Missing or non-executable CLIs report the paths actually checked.
- [ ] `(!)` and Copy work when the PTY produced no output.
- [ ] HOME limits and agent launch cannot disagree about `cli-not-found`.
- [ ] Unit tests and a packaged smoke test cover successful and failed resolution.
