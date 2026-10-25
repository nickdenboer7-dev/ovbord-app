import { departureTimeRemainingMs } from "./boardSmartness";
import { effectiveDepartureClock } from "./format";
import type { DepartureItem } from "../types/api";

export const DEPARTURE_DAY_GAP_MS = 60 * 60 * 1000;

export type BoardDisplayDeparture = DepartureItem & {
  /** Displayed only when more than an hour separates adjacent visible departures. */
  gapStartClock?: string;
  /** Legacy field; separate planned rows do not use it (variant B: no folding). */
  groupedTimes?: string[];
};

/**
 * All trips remain separate rows, including planned siblings of the same line.
 * The day divider precedes the first visible row after a >60-minute real gap.
 * Never mutate the input (the same feed may be used for pinned line previews).
 */
export function groupBoardDepartures(rows: readonly DepartureItem[], nowMs: number): BoardDisplayDeparture[] {
  let previousMs: number | null = null;
  return rows.map((item) => {
    const ms = departureTimeRemainingMs(item, nowMs);
    const clock = effectiveDepartureClock(item);
    const validClock = /^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(clock);
    const gap = previousMs !== null && ms !== null && ms - previousMs > DEPARTURE_DAY_GAP_MS;
    previousMs = ms;
    return { ...item, ...(gap && validClock ? { gapStartClock: clock } : {}) };
  });
}
