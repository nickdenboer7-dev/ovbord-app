import { effectiveDepartureClock } from "./format";
import type { DepartureItem } from "../types/api";

/** A small tolerance covers the actual departure and short API refresh delays. */
export const DEPARTURE_GRACE_MS = 2 * 60 * 1000;
export const TIME_CHANGE_VISIBLE_MS = 60 * 1000;

export type DepartureTimeChange = { before: string; changedAt: number };
export type DepartureTimeChanges = Record<string, DepartureTimeChange>;

/** Stable trip identity: the displayed time must NOT be part of the key. */
export function boardDepartureIdentity(item: DepartureItem): string {
  return item.ritId
    ? ["rit", item.ritId, item.line, item.destination].join("|")
    : ["row", item.id, item.line, item.destination].join("|");
}

/** A known absolute timestamp wins; never guess a service date from the wall clock. */
export function departureTimeRemainingMs(item: DepartureItem, nowMs: number): number | null {
  if (item.effectiveAt) {
    const at = Date.parse(item.effectiveAt);
    if (Number.isFinite(at)) return at - nowMs;
  }
  const clock = effectiveDepartureClock(item);
  const match = /^(\d{1,2}):(\d{2})$/.exec(clock);
  if (!match) return null;
  const hour = Number(match[1]), minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
  }).formatToParts(new Date(nowMs));
  const number = (field: string) => Number(parts.find(p => p.type === field)?.value ?? NaN);
  const h = number("hour"), m = number("minute"), s = number("second");
  if (![h, m, s].every(Number.isFinite)) return null;
  let delta = ((hour - h) * 60 + (minute - m)) * 60000 - s * 1000;
  // A clock shortly after midnight is tomorrow when it is now late evening.
  if (delta < -12 * 60 * 60000) delta += 24 * 60 * 60000;
  // Conversely, an old 23:55 clock after midnight is yesterday, not 23h away.
  // Without an absolute date, prefer removing obviously stale night services.
  if (h < 6 && hour >= 18 && delta > 12 * 60 * 60000) delta -= 24 * 60 * 60000;
  return delta;
}

export function keepBoardDeparture(item: DepartureItem, nowMs: number): boolean {
  const remaining = departureTimeRemainingMs(item, nowMs);
  // If the feed supplies neither a usable date nor clock, do not invent a departure.
  return remaining === null || remaining >= -DEPARTURE_GRACE_MS;
}

/** Compare successful snapshots only. Never mark first load or missing rows as changed. */
export function refreshDepartureTimeChanges(
  previous: readonly DepartureItem[] | null,
  current: readonly DepartureItem[],
  oldNotices: DepartureTimeChanges,
  nowMs: number
): DepartureTimeChanges {
  const previousById = new Map((previous || []).map(row => [boardDepartureIdentity(row), row]));
  const next: DepartureTimeChanges = {};
  for (const row of current) {
    const id = boardDepartureIdentity(row);
    const before = previousById.get(id);
    const prior = oldNotices[id];
    if (before) {
      const oldClock = effectiveDepartureClock(before), clock = effectiveDepartureClock(row);
      if (oldClock !== "--:--" && clock !== "--:--" && oldClock !== clock) {
        next[id] = { before: oldClock, changedAt: nowMs };
        continue;
      }
    }
    if (prior && nowMs - prior.changedAt < TIME_CHANGE_VISIBLE_MS) next[id] = prior;
  }
  return next;
}

export function departureTimeChangeLabel(
  item: DepartureItem,
  changes: DepartureTimeChanges,
  nowMs: number
): string {
  const change = changes[boardDepartureIdentity(item)];
  return change && nowMs - change.changedAt < TIME_CHANGE_VISIBLE_MS && nowMs >= change.changedAt
    ? "was " + change.before : "";
}
