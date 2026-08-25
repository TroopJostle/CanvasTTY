import type { LocaleId, ProviderId, SessionStatus } from "../../../shared/contracts";
import type { UiIconName } from "../components/UiIcon";
import { t, type TranslationKey } from "./i18n";

const STATUS_KEYS: Record<SessionStatus, TranslationKey> = {
  idle: "statusIdle",
  working: "statusWorking",
  needs_approval: "statusNeedsApproval",
  unavailable: "statusUnavailable",
  done: "statusDone",
  failed: "statusFailed"
};

const STATUS_ICONS: Record<SessionStatus, UiIconName | null> = {
  idle: null,
  working: "working",
  needs_approval: "attention",
  unavailable: null,
  done: "done",
  failed: "error"
};

export function sessionStatusLabel(locale: LocaleId, status: SessionStatus, provider?: ProviderId): string {
  if (status === "idle" && provider === "terminal") return t(locale, "statusOpen");
  return t(locale, STATUS_KEYS[status]);
}

export function sessionStatusIcon(status: SessionStatus): UiIconName | null {
  return STATUS_ICONS[status];
}
