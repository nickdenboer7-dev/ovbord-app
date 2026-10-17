import type { DepartureItem } from "../types/api";
import { departureCountdown, effectiveDepartureClock } from "./format";

/** Keep scheduled time for a cancelled trip and never present an ETA. */
export function departurePresentation(item: DepartureItem, nowMs = Date.now()) {
  const cancelled = item.cancelled === true;
  return {
    cancelled,
    clock: cancelled ? item.plannedTime : effectiveDepartureClock(item),
    countdown: cancelled ? "" : departureCountdown(item, nowMs)
  };
}
