import type { ActiveTrip } from "./activeTrip";
import { clockRemainingMs } from "./alighting";
import type { JourneyStop } from "../types/api";

/** Timetable countdown, without implying that the vehicle's GPS is live. */
export function alightTimeLabel(trip: ActiveTrip, nowMs: number): string {
  const remaining = clockRemainingMs(trip.alightClock, nowMs);
  if (remaining === null) return trip.alightClock ? "verwacht " + trip.alightClock : "Tijd onbekend";
  if (remaining < -60_000) return "Geplande aankomst voorbij";
  if (remaining <= 0) return "rond nu";
  return "over " + Math.ceil(remaining / 60_000) + " min";
}

/** Only return a stop count when the saved trip actually contains a current or passed stop. */
export function alightRemainingStops(stops: readonly JourneyStop[], trip: ActiveTrip): number | null {
  const alight = trip.alighting;
  if (!alight || !stops.length) return null;
  const index = stops[alight.index]?.id === alight.id ? alight.index :
    stops.findIndex((stop) => stop.id === alight.id && stop.name === alight.name);
  if (index < 0) return null;
  const at = stops.findIndex(stop => stop.state === "current");
  const passed = stops.reduce((last, stop, i) => stop.state === "passed" ? i : last, -1);
  const progress = at >= 0 ? at : passed;
  if (progress < 0) return null;
  return Math.max(0, index - progress);
}
