import type { DepartureItem, RitData, StopSummary, JourneyStop } from "../types/api";
import { departureTimeRemainingMs, DEPARTURE_GRACE_MS } from "./boardSmartness";

/** Keep a confirmed departure on the screen briefly, then remove it. */
export const DEPARTED_VISIBLE_MS = 60 * 1000;
export const DEPARTURE_CHECK_COOLDOWN_MS = 45 * 1000;
export const MAX_DEPARTURE_CHECKS = 2;

export function departedNoticeVisible(confirmedAt: number | undefined, nowMs: number): boolean {
  return typeof confirmedAt === "number" && Number.isFinite(confirmedAt) &&
    nowMs >= confirmedAt && nowMs - confirmedAt < DEPARTED_VISIBLE_MS;
}

/** Only check near the scheduled departure. An early login is never a departure event. */
export function shouldVerifyDeparture(item: DepartureItem, nowMs: number): boolean {
  if (!item.ritId || item.cancelled === true || item.departed === true ||
      item.isLive !== true || (item.mode !== "bus" && item.mode !== "tram")) return false;
  const until = departureTimeRemainingMs(item, nowMs);
  return until !== null && until <= 60_000 && until >= -DEPARTURE_GRACE_MS;
}

function normalized(value: string): string {
  return value.toLocaleLowerCase("nl").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

function distanceMeters(a: Pick<StopSummary, "lat" | "lon">, b: Pick<JourneyStop, "lat" | "lon">): number {
  if (![a.lat, a.lon, b.lat, b.lon].every((v) => typeof v === "number" && Number.isFinite(v))) return Infinity;
  const rad = Math.PI / 180;
  const dLat = (b.lat! - a.lat!) * rad, dLon = (b.lon! - a.lon!) * rad;
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat! * rad) * Math.cos(b.lat! * rad) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(x)));
}

/** A passed stop alone can be estimated. Demand fresh live GPS and matching boarding stop. */
export function journeyConfirmsDeparture(journey: RitData, boardStop: StopSummary): boolean {
  if (journey.live !== true || journey.estimatedPosition === true ||
      !journey.vehicle || !Number.isFinite(journey.gpsAgeSeconds) ||
      journey.gpsAgeSeconds! < 0 || journey.gpsAgeSeconds! > 60) return false;
  return journey.stops.some((stop, i) => {
    if (stop.state !== "passed") return false;
    // A timetable-only progress estimate may mark a stop as passed while the
    // logged-in vehicle is still standing there. Require movement away too.
    const movedMeters = distanceMeters(journey.vehicle!, stop);
    if (!Number.isFinite(movedMeters) || movedMeters < 140) return false;
    if (stop.id && boardStop.id && stop.id === boardStop.id) return true;
    if (normalized(stop.name) === normalized(boardStop.name)) return true;
    // Public station areas can aggregate platform IDs. The first route stop at
    // the same coordinates is unambiguous; do not match arbitrary nearby stops.
    return i === 0 && distanceMeters(boardStop, stop) <= 130;
  });
}
