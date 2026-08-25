import type { SessionMetadata, SessionSnapshot } from "../../../shared/contracts";

export function mergeSessionSnapshots(
  current: SessionSnapshot[],
  loaded: readonly SessionSnapshot[]
): SessionSnapshot[] {
  return loaded.reduce(upsertSnapshot, current);
}

export function upsertSession(
  sessions: SessionSnapshot[],
  metadata: SessionMetadata
): SessionSnapshot[] {
  const existing = sessions.find((session) => session.id === metadata.id);
  return upsertSnapshot(sessions, { ...metadata, buffer: existing?.buffer ?? "" });
}

export function upsertSnapshot(
  sessions: SessionSnapshot[],
  next: SessionSnapshot
): SessionSnapshot[] {
  const index = sessions.findIndex((session) => session.id === next.id);
  if (index < 0) return [...sessions, next];

  const existing = sessions[index];
  if (next.revision < existing.revision) {
    if (existing.buffer || !next.buffer) return sessions;
    return sessions.map((session) => session.id === next.id
      ? { ...existing, buffer: next.buffer }
      : session);
  }
  return sessions.map((session) => session.id === next.id ? next : session);
}
