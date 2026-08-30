import type { Point, SessionBounds, StickyNote } from "../../../../shared/contracts";
import {
  STICKY_NOTE_DEFAULT_SIZE,
  STICKY_NOTE_MAX_SIZE,
  STICKY_NOTE_MIN_SIZE
} from "../../../../shared/contracts.ts";
import type { ResizeDirection } from "../workspace/snap";

// Bounds behavior is adapted from @TroopJostle's sticky-note work in PR #23.
export const MIN_STICKY_NOTE_SIZE = STICKY_NOTE_MIN_SIZE;
export const MAX_STICKY_NOTE_SIZE = STICKY_NOTE_MAX_SIZE;

export function stickyNoteAtPoint(point: Point, id: string): StickyNote {
  return {
    id,
    text: "",
    position: {
      x: point.x - STICKY_NOTE_DEFAULT_SIZE.width / 2,
      y: point.y - STICKY_NOTE_DEFAULT_SIZE.height / 2
    },
    size: { ...STICKY_NOTE_DEFAULT_SIZE }
  };
}

export function constrainStickyNoteResize(
  bounds: SessionBounds,
  direction: ResizeDirection
): SessionBounds {
  const right = bounds.position.x + bounds.size.width;
  const bottom = bounds.position.y + bounds.size.height;
  const width = clamp(bounds.size.width, STICKY_NOTE_MIN_SIZE.width, STICKY_NOTE_MAX_SIZE.width);
  const height = clamp(bounds.size.height, STICKY_NOTE_MIN_SIZE.height, STICKY_NOTE_MAX_SIZE.height);
  return {
    position: {
      x: direction.includes("w") ? right - width : bounds.position.x,
      y: direction.includes("n") ? bottom - height : bounds.position.y
    },
    size: { width, height }
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
