import type { DepartureItem, StopSummary } from "../types/api";
import { departureTimeRemainingMs, keepBoardDeparture } from "./boardSmartness";
import { formatDutchClock } from "./format";

/** Rows shown under a nearby stop: upcoming only, departed trips removed, cancelled kept (marked). */
export function buurtbordPreviewRows(departures: readonly DepartureItem[], nowMs: number, limit = 3): DepartureItem[] {
  return departures
    .filter((item) => item.departed !== true && keepBoardDeparture(item, nowMs))
    .slice(0, limit);
}

/**
 * The stop with the earliest departure you can still reach on foot.
 * Uses the effective (delayed) time and never recommends a cancelled or departed trip.
 */
export function bestNearbyStopId(
  stops: readonly StopSummary[],
  departuresByStop: Readonly<Record<string, readonly DepartureItem[] | undefined>>,
  nowMs: number
): string {
  let best: { id: string; score: number } | null = null;
  for (const stop of stops) {
    const walk = stop.walkMinutes ?? 1;
    const reachable = (departuresByStop[stop.id] || [])
      .filter((item) => item.cancelled !== true && item.departed !== true)
      .map((item) => departureTimeRemainingMs(item, nowMs))
      .filter((ms): ms is number => ms !== null && ms / 60000 >= walk)
      .map((ms) => ms / 60000);
    if (!reachable.length) continue;
    const score = Math.min(...reachable) + walk;
    if (!best || score < best.score) best = { id: stop.id, score };
  }
  return best?.id || "";
}


export type NearbyDepartureOption = {
  stop: StopSummary;
  departure: DepartureItem;
  walkMinutes: number;
  departureInMinutes: number;
  spareMinutes: number;
  tight: boolean;
  withinHour: boolean;
};

export const NEARBY_ADVICE_HORIZON_MS = 60 * 60 * 1000;
export const NEARBY_WALK_BUFFER_MINUTES = 5;

/**
 * Reachable first departure per nearby stop; no GPS guess if walk time is unknown.
 * Stale stop data, cancelled/departed trips and stale live items are excluded.
 * A comfortable (>=3 min spare) option outranks a tight connection.
 */
export function compareNearbyDepartures(
  stops: readonly StopSummary[],
  departuresByStop: Readonly<Record<string, readonly DepartureItem[] | undefined>>,
  nowMs: number,
  staleStopIds: ReadonlySet<string> = new Set()
): NearbyDepartureOption[] {
  const options: NearbyDepartureOption[] = [];
  for (const stop of stops) {
    const walk = stop.walkMinutes;
    if (staleStopIds.has(stop.id) || typeof walk !== "number" || !Number.isFinite(walk) || walk < 0) continue;
    const first = (departuresByStop[stop.id] || [])
      .filter((item) => !item.cancelled && !item.departed && !item.liveDataStale)
      .map((item) => ({ item, ms: departureTimeRemainingMs(item, nowMs) }))
      .filter((entry): entry is { item: DepartureItem; ms: number } =>
        entry.ms !== null && entry.ms >= walk * 60000)
      // An early tight connection must not hide a comfortable one at the same stop.
      .sort((a, b) => Number(a.ms > NEARBY_ADVICE_HORIZON_MS) - Number(b.ms > NEARBY_ADVICE_HORIZON_MS)
        || Number(a.ms / 60000 - walk < 3) - Number(b.ms / 60000 - walk < 3)
        || a.ms - b.ms)[0];
    if (!first) continue;
    const spareMinutes = Math.floor(first.ms / 60000 - walk);
    options.push({ stop, departure: first.item, walkMinutes: walk,
      departureInMinutes: Math.max(0, Math.floor(first.ms / 60000)),
      spareMinutes, tight: spareMinutes < 3, withinHour: first.ms <= NEARBY_ADVICE_HORIZON_MS });
  }
  // A departure within the next hour outranks a comfortable but hours-later journey.
  return options.sort((a, b) => Number(b.withinHour) - Number(a.withinHour)
    || Number(a.tight) - Number(b.tight)
    || a.departureInMinutes - b.departureInMinutes
    || a.walkMinutes - b.walkMinutes
    || a.stop.name.localeCompare(b.stop.name, "nl"));
}

/** When to begin walking, with five minutes extra margin when the connection allows it. */
export function nearbyLeaveAdvice(option: NearbyDepartureOption, nowMs: number) {
  const leaveInMinutes = Math.max(0, option.spareMinutes - NEARBY_WALK_BUFFER_MINUTES);
  const leaveText = leaveInMinutes <= 2 ? "Vertrek nu"
    : option.withinHour || leaveInMinutes <= 30 ? `Vertrek over ${leaveInMinutes} min`
    : `Vertrek rond ${formatDutchClock(nowMs + leaveInMinutes * 60000)}`;
  const marginText = option.spareMinutes < NEARBY_WALK_BUFFER_MINUTES ? `slechts ${option.spareMinutes} min speling`
    : `circa ${NEARBY_WALK_BUFFER_MINUTES} min extra marge`;
  return { leaveInMinutes, leaveText, marginText, later: !option.withinHour };
}

/** Whether a departure can still be reached on foot; null when its time is unknown. */
export function reachableOnFoot(item: DepartureItem, walkMinutes: number | undefined, nowMs: number): boolean | null {
  const ms = departureTimeRemainingMs(item, nowMs);
  if (ms === null) return null;
  return ms / 60000 >= (walkMinutes ?? 1);
}
