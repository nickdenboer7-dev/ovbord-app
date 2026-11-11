import type { RitData } from "../types/api";

/**
 * A vehicle GPS position can belong to the previous journey of the same bus.
 * Geometry alone cannot prove that a future timetable journey has begun.
 *
 * Only compare full, timezone-aware timetable timestamps. A bare HH:mm clock
 * cannot safely be compared near midnight and must never create a false gate.
 */
/** Convert an explicitly timezone-aware API departure to a precise instant. */
export function plannedDepartureAtMs(value: unknown): number | null {
  if (typeof value !== "string" || !/[zZ]|[+-]\d{2}:\d{2}$/.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

export function firstPlannedDepartureMs(journey: Pick<RitData, "stops"> | null | undefined): number | null {
  return plannedDepartureAtMs(journey?.stops?.[0]?.plannedDepartureAt);
}

/** Never label a journey as already underway before its first scheduled departure. */
export function tripNotYetStarted(journey: Pick<RitData, "stops"> | null | undefined, nowMs: number): boolean {
  const start = firstPlannedDepartureMs(journey);
  return start !== null && Number.isFinite(nowMs) && nowMs < start;
}

export function firstDepartureClock(journey: Pick<RitData, "stops"> | null | undefined): string | null {
  const time = journey?.stops?.[0]?.plannedDepartureTime;
  if (time && /^\d{1,2}:\d{2}$/.test(time)) return time;
  const date = journey?.stops?.[0]?.plannedDepartureAt;
  return date && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(date) ? date.slice(11, 16) : null;
}
