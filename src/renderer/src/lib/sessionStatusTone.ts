import type { SessionStatus } from "../../../shared/contracts";

export type SessionStatusTone = "idle" | "working" | "waiting";

const STATUS_TONES: Record<SessionStatus, SessionStatusTone> = {
  idle: "idle",
  working: "working",
  needs_approval: "waiting",
  unavailable: "idle",
  done: "idle",
  failed: "idle"
};

export function sessionStatusTone(status: SessionStatus): SessionStatusTone {
  return STATUS_TONES[status];
}
