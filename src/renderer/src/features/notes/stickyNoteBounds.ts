import type { SessionBounds } from "../../../../shared/contracts";
import type { ResizeDirection } from "../workspace/snap";

export const MIN_STICKY_NOTE_SIZE = { width: 180, height: 140 };
export const MAX_STICKY_NOTE_SIZE = { width: 1_000, height: 800 };

export function constrainStickyNoteResize(
  bounds: SessionBounds,
  direction: ResizeDirection
): SessionBounds {
  const right = bounds.position.x + bounds.size.width;
  const bottom = bounds.position.y + bounds.size.height;
  const width = clamp(bounds.size.width, MIN_STICKY_NOTE_SIZE.width, MAX_STICKY_NOTE_SIZE.width);
  const height = clamp(bounds.size.height, MIN_STICKY_NOTE_SIZE.height, MAX_STICKY_NOTE_SIZE.height);
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
