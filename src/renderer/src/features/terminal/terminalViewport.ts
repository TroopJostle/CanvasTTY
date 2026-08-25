interface TerminalViewportLine {
  readonly isWrapped: boolean;
}

interface TerminalViewportBuffer {
  readonly type: "normal" | "alternate";
  readonly cursorY: number;
  readonly viewportY: number;
  readonly baseY: number;
  getLine(line: number): TerminalViewportLine | undefined;
}

interface TerminalViewportMarker {
  readonly line: number;
  dispose(): void;
}

interface TerminalViewport {
  readonly cols: number;
  readonly buffer: { readonly active: TerminalViewportBuffer };
  registerMarker(cursorYOffset?: number): TerminalViewportMarker;
  scrollToBottom(): void;
  scrollToLine(line: number): void;
}

/**
 * Fits xterm without losing the reader's place in normal-buffer scrollback.
 * A marker follows the logical line through xterm's width reflow while the
 * wrapped-row offset keeps the same visible fragment as close to the top as
 * the new column count allows.
 */
export function fitTerminalPreservingViewport(terminal: TerminalViewport, fit: () => void): void {
  const before = terminal.buffer.active;
  if (before.type !== "normal") {
    fit();
    return;
  }

  const pinnedToBottom = before.viewportY >= before.baseY;
  const fallbackLine = before.viewportY;
  let marker: TerminalViewportMarker | undefined;
  let wrappedCellOffset = 0;

  if (!pinnedToBottom) {
    let logicalLineStart = before.viewportY;
    while (logicalLineStart > 0 && before.getLine(logicalLineStart)?.isWrapped) {
      logicalLineStart -= 1;
    }
    wrappedCellOffset = (before.viewportY - logicalLineStart) * terminal.cols;
    const cursorLine = before.baseY + before.cursorY;
    marker = terminal.registerMarker(logicalLineStart - cursorLine);
  }

  try {
    fit();
    const after = terminal.buffer.active;
    if (after.type !== "normal") return;

    if (pinnedToBottom) {
      terminal.scrollToBottom();
      return;
    }

    const anchoredLine = marker && marker.line >= 0
      ? marker.line + Math.floor(wrappedCellOffset / Math.max(terminal.cols, 1))
      : fallbackLine;
    terminal.scrollToLine(Math.max(0, Math.min(anchoredLine, after.baseY)));
  } finally {
    marker?.dispose();
  }
}
