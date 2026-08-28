import assert from "node:assert/strict";
import test from "node:test";
import {
  displayCanvasNavigationBinding,
  matchesPointerShortcut,
  matchesShortcut,
  shortcutFromKeyboardEvent,
  shortcutFromPointerEvent
} from "../src/renderer/src/lib/shortcuts.ts";

const keyEvent = (key, modifiers = {}) => ({
  key,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...modifiers
});

test("captures and matches middle, back, and forward mouse buttons", () => {
  const pointerEvent = (button, modifiers = {}) => ({
    button,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...modifiers
  });
  assert.equal(shortcutFromPointerEvent(pointerEvent(1)), "Mouse3");
  assert.equal(shortcutFromPointerEvent(pointerEvent(3)), "Mouse4");
  assert.equal(shortcutFromPointerEvent(pointerEvent(4, { ctrlKey: true })), "Ctrl+Mouse5");
  assert.equal(shortcutFromPointerEvent(pointerEvent(0)), null);
  assert.equal(matchesPointerShortcut(pointerEvent(3), "Mouse4"), true);
});

test("captures plain defaults and canonical modifier order", () => {
  assert.equal(shortcutFromKeyboardEvent(keyEvent("Home")), "Home");
  assert.equal(shortcutFromKeyboardEvent(keyEvent("F2")), "F2");
  assert.equal(
    shortcutFromKeyboardEvent(keyEvent("r", { altKey: true, ctrlKey: true, shiftKey: true })),
    "Ctrl+Alt+Shift+R"
  );
});

test("ignores modifier-only and unsupported keys", () => {
  assert.equal(shortcutFromKeyboardEvent(keyEvent("Control", { ctrlKey: true })), null);
  assert.equal(shortcutFromKeyboardEvent(keyEvent("Unidentified")), null);
});

test("matches shortcuts without casing drift", () => {
  assert.equal(matchesShortcut(keyEvent("h", { ctrlKey: true }), "Ctrl+H"), true);
  assert.equal(matchesShortcut(keyEvent("h", { ctrlKey: true }), "Alt+H"), false);
});

test("displays platform-neutral canvas navigation bindings with macOS key names", () => {
  assert.equal(displayCanvasNavigationBinding("Ctrl+Alt+Meta+Space", true), "Ctrl+Option+Command+Space");
  assert.equal(displayCanvasNavigationBinding("Ctrl+Alt", false), "Ctrl+Alt");
});
