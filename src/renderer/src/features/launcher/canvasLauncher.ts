import type { CanvasLauncherItemId } from "../../../../shared/contracts";

// The configurable launcher model is adapted from @TroopJostle's PR #23.
export function setCanvasLauncherItemEnabled(
  current: readonly CanvasLauncherItemId[],
  item: CanvasLauncherItemId,
  enabled: boolean
): CanvasLauncherItemId[] {
  if (!enabled) {
    const next = current.filter((candidate) => candidate !== item);
    return next.length > 0 ? next : [...current];
  }
  if (current.includes(item)) return [...current];
  return [...current, item];
}
