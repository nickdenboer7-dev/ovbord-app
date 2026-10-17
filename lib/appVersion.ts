export type UpdateInfo = {
  isDev: boolean;
  isEnabled: boolean;
  isEmbeddedLaunch: boolean;
  createdAt: Date | null;
  channel: string | null;
  updateId: string | null;
};

/**
 * Human-readable description of the running JavaScript bundle, so a tester can
 * see at a glance whether an EAS Update (OTA) has actually been applied.
 */
export function describeUpdate(info: UpdateInfo): { label: string; detail: string } {
  if (info.isDev) return { label: "Ontwikkelversie", detail: "Lokale ontwikkelserver" };
  if (!info.isEnabled) return { label: "Updates uitgeschakeld", detail: "" };
  if (info.isEmbeddedLaunch || !info.createdAt || !Number.isFinite(info.createdAt.getTime())) {
    return { label: "Ingebouwde versie", detail: "Nog geen OTA-update geladen" };
  }
  // Assemble from parts: ICU versions differ in commas and month abbreviation dots.
  const parts = new Intl.DateTimeFormat("nl-NL", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Amsterdam"
  }).formatToParts(info.createdAt);
  const part = (type: string) => parts.find((p) => p.type === type)?.value || "";
  const when = `${part("day")} ${part("month").replace(/\.$/, "")} ${part("hour")}:${part("minute")}`;
  const detail = [info.channel ? "kanaal " + info.channel : "", info.updateId ? "id " + info.updateId.slice(0, 8) : ""]
    .filter(Boolean).join(" · ");
  return { label: "Update van " + when, detail };
}
