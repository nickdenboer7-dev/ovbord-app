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
  staleStopIds: ReadonlySet<string> = new Set(),
  preferences: { maxWalkMinutes?: number; smartStopChoice?: boolean } = {}
): NearbyDepartureOption[] {
  const options: NearbyDepartureOption[] = [];
  for (const stop of stops) {
    const walk = stop.walkMinutes;
    if (staleStopIds.has(stop.id) || typeof walk !== "number" || !Number.isFinite(walk) || walk < 0
      || walk > (preferences.maxWalkMinutes ?? Infinity)) continue;
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
  const ranked = options.sort((a, b) => Number(b.withinHour) - Number(a.withinHour)
    || Number(a.tight) - Number(b.tight)
    || a.departureInMinutes - b.departureInMinutes
    || a.walkMinutes - b.walkMinutes
    || a.stop.name.localeCompare(b.stop.name, "nl"));

  // For the same line and destination, a nearby stop is worth a few minutes'
  // later departure when the saved walk exceeds that delay. For example:
  // Rokin: N85 in 12 min, 5 min walking; Dam: N85 in 14 min, 1 min walking.
  // Prefer Dam; do not trade a quick connection for a much later/different bus.
  const first = ranked[0];
  if (preferences.smartStopChoice === false || !first?.withinHour || first.tight) return ranked;
  const serviceKey = (option: NearbyDepartureOption) =>
    option.departure.line.trim().toLocaleLowerCase("nl") + "|" +
    option.departure.destination.trim().toLocaleLowerCase("nl");
  const matching = ranked.slice(1)
    .filter((option) => option.withinHour && !option.tight
      && serviceKey(option) === serviceKey(first)
      && option.departureInMinutes >= first.departureInMinutes
      && option.departureInMinutes - first.departureInMinutes <= 5
      && option.walkMinutes < first.walkMinutes
      && option.departureInMinutes + option.walkMinutes <
        first.departureInMinutes + first.walkMinutes)
    .sort((a, b) => a.departureInMinutes + a.walkMinutes -
      (b.departureInMinutes + b.walkMinutes)
      || b.spareMinutes - a.spareMinutes);
  if (!matching.length) return ranked;
  const better = matching[0];
  return [better, ...ranked.filter((option) => option !== better)];
}

/** A recommendation is comfortable only if the user's chosen walking buffer still fits. */
export function nearbyAdviceStatus(option: NearbyDepartureOption, bufferMinutes = NEARBY_WALK_BUFFER_MINUTES): {
  label: "Haalbaar" | "Weinig marge" | "Krap" | "Later";
  tone: "success" | "warning" | "neutral";
} {
  if (!option.withinHour) return { label: "Later", tone: "neutral" };
  if (option.tight || option.spareMinutes < 3) return { label: "Krap", tone: "warning" };
  if (option.spareMinutes < bufferMinutes) return { label: "Weinig marge", tone: "warning" };
  return { label: "Haalbaar", tone: "success" };
}

/** When to begin walking, with five minutes extra margin when the connection allows it. */
export function nearbyLeaveAdvice(option: NearbyDepartureOption, nowMs: number, bufferMinutes = NEARBY_WALK_BUFFER_MINUTES) {
  const leaveInMinutes = Math.max(0, option.spareMinutes - bufferMinutes);
  const leaveText = leaveInMinutes <= 2 ? "Vertrek nu"
    : option.withinHour || leaveInMinutes <= 30 ? `Vertrek over ${leaveInMinutes} min`
    : `Vertrek rond ${formatDutchClock(nowMs + leaveInMinutes * 60000)}`;
  const marginText = option.spareMinutes < bufferMinutes ? `slechts ${option.spareMinutes} min speling`
    : `circa ${bufferMinutes} min extra marge`;
  return { leaveInMinutes, leaveText, marginText, later: !option.withinHour };
}

/** Whether a departure can still be reached on foot; null when its time is unknown. */
export function reachableOnFoot(item: DepartureItem, walkMinutes: number | undefined, nowMs: number): boolean | null {
  const ms = departureTimeRemainingMs(item, nowMs);
  if (ms === null) return null;
  return ms / 60000 >= (walkMinutes ?? 1);
}
