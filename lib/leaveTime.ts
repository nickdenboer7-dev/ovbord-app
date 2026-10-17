import type { DepartureItem } from "../types/api";
import { departureTimeRemainingMs } from "./boardSmartness";
import { distanceMeters } from "./boardingMatch";
import { departurePresentation } from "./departurePresentation";

/** Same walking pace as the nearby list (80 m per minute), with a detour factor for streets. */
export const WALK_METERS_PER_MINUTE = 80;
export const WALK_DETOUR_FACTOR = 1.3;
/** Further away a walking advice means little: the user is probably not walking there. */
export const MAX_WALK_ADVICE_METERS = 2500;
export const AT_STOP_METERS = 80;

/** Walking minutes to a stop; null without both positions or when too far for walking advice. */
export function walkMinutesTo(from: { lat?: number; lon?: number } | null, to: { lat?: number; lon?: number }): number | null {
  if (!from) return null;
  const meters = distanceMeters(from, to);
  if (!Number.isFinite(meters) || meters > MAX_WALK_ADVICE_METERS) return null;
  if (meters <= AT_STOP_METERS) return 0;
  return Math.max(1, Math.round(meters * WALK_DETOUR_FACTOR / WALK_METERS_PER_MINUTE));
}

/**
 * "6 min lopen · vertrek over 4 min" for the first departure the user can still
 * reach on foot. Cancelled and departed trips are skipped; when the first one is
 * too tight, the advice names the next one.
 */
export function leaveAdvice(rows: readonly DepartureItem[], walkMinutes: number | null, nowMs: number): { text: string; tight: boolean } | null {
  if (walkMinutes === null) return null;
  if (walkMinutes === 0) return { text: "Je bent bij de halte", tight: false };
  const candidates = rows
    .filter((item) => item.cancelled !== true && item.departed !== true)
    .map((item) => ({ item, ms: departureTimeRemainingMs(item, nowMs) }))
    .filter((entry): entry is { item: DepartureItem; ms: number } => entry.ms !== null);
  if (!candidates.length) return null;
  const walk = walkMinutes + " min lopen";
  const leaveIn = (ms: number) => Math.floor(ms / 60000 - walkMinutes);
  const when = (minutes: number) => minutes <= 0 ? "vertrek nu" : "vertrek over " + minutes + " min";
  const first = candidates[0];
  if (leaveIn(first.ms) >= 0) return { text: walk + " · " + when(leaveIn(first.ms)), tight: false };
  const next = candidates.find((entry) => leaveIn(entry.ms) >= 0);
  const firstClock = departurePresentation(first.item, nowMs).clock;
  if (!next) return { text: walk + " · te krap voor " + firstClock, tight: true };
  return { text: walk + " · te krap voor " + firstClock + ", " + when(leaveIn(next.ms)) + " voor " +
    departurePresentation(next.item, nowMs).clock, tight: true };
}
