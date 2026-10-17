import type { DepartureItem, JourneyStop } from "../types/api";

/** Remember that a journey had live timing without displaying stale positions as live. */
export function withBoardFreshness(item: DepartureItem, feedIsCurrent: boolean): DepartureItem {
  if (feedIsCurrent || item.cancelled || item.departed || item.isLive !== true) return item;
  return { ...item, isLive: false, liveDataStale: true, reliabilityDetail: undefined,
    trend: undefined, trendDeltaMinutes: undefined, trendWindowSeconds: undefined, trendSamples: undefined };
}

export function boardingDepartureNote(stop: JourneyStop | null | undefined): string | null {
  if (!stop) return null;
  const arrival = stop.expectedTime || stop.plannedTime;
  const departure = stop.expectedDepartureTime || stop.plannedDepartureTime;
  return departure && departure !== "--:--" && departure !== arrival ? "Vertrek " + departure : null;
}
