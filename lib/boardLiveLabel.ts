import type { DepartureItem } from "../types/api";

/**
 * A live departure estimate is not automatically a verified vehicle position.
 * Only explicitly sourced, recent GPS may receive the GPS label.
 */
export function boardLiveLabel(
  item: Pick<DepartureItem, "cancelled" | "departed" | "liveDataStale" | "isLive" | "reliabilityDetail">,
  nowMs: number,
  stale = false
): string {
  if (item.cancelled) return "Rijdt niet";
  if (item.departed) return "Vertrokken";
  if (stale) return "Laatst bekende tijd";
  if (item.liveDataStale) return "Live-info oud";
  if (!item.isLive) return "Gepland";

  const gps = item.reliabilityDetail;
  const age = gps && typeof gps.ageSeconds === "number" && Number.isFinite(gps.ageSeconds)
    ? gps.ageSeconds + Math.max(0, (nowMs - (gps.receivedAt ?? nowMs)) / 1000)
    : Infinity;
  if (gps && !gps.estimatedPosition && gps.level !== "low" && age >= 0 && age < 45) {
    return "Live · GPS";
  }
  return "Live tijd";
}
