import { reportLifecycle } from "./runtime-client.mjs";

let rootSessionId = null;

export const CanvasTTYLifecycle = async () => ({
  event: async ({ event }) => {
    if (!event || typeof event !== "object") return;
    const properties = event.properties && typeof event.properties === "object"
      ? event.properties
      : {};
    const sessionId = stringField(properties.sessionID, properties.sessionId, properties.id);

    if (event.type === "session.created") {
      const info = properties.info && typeof properties.info === "object" ? properties.info : properties;
      if (!info.parentID && !info.parentId) rootSessionId = stringField(info.id, sessionId);
      if (rootSessionId) await reportLifecycle({ state: "idle", event: event.type, turnId: rootSessionId });
      return;
    }
    if (rootSessionId && sessionId && sessionId !== rootSessionId) return;

    if (event.type === "session.status") {
      const statusValue = properties.status;
      const status = typeof statusValue === "string"
        ? statusValue
        : statusValue && typeof statusValue === "object"
          ? statusValue.type
          : null;
      if (status === "busy" || status === "retry") {
        await reportLifecycle({ state: "working", event: `session.status:${status}`, turnId: rootSessionId });
      } else if (status === "idle") {
        await reportLifecycle({ state: "idle", event: "session.status:idle", turnId: rootSessionId });
      }
      return;
    }
    if (event.type === "session.idle") {
      await reportLifecycle({ state: "idle", event: event.type, turnId: rootSessionId });
    } else if (event.type === "permission.asked") {
      await reportLifecycle({ state: "needs_approval", event: event.type, turnId: rootSessionId });
    } else if (event.type === "permission.replied") {
      await reportLifecycle({ state: "working", event: event.type, turnId: rootSessionId });
    } else if (event.type === "session.error") {
      await reportLifecycle({ state: "idle", event: event.type, turnId: rootSessionId });
    }
  }
});

function stringField(...values) {
  return values.find((value) => typeof value === "string" && value.length > 0) ?? null;
}
