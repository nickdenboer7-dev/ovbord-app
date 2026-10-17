import type { SavedAlighting } from "./alighting";
import { clockRemainingMs } from "./alighting";

/** The trip last opened on the trip page, so Start can offer to return to it after a restart. */
export const ACTIVE_TRIP_STORAGE_KEY = "ovbord.activeTrip";
export const ACTIVE_TRIP_MAX_AGE_MS = 3 * 60 * 60_000;
/** Still offered for a short while after arrival (at the alighting stop, or the last stop). */
export const ACTIVE_TRIP_GRACE_MS = 10 * 60_000;

export type ActiveTrip = {
  tripId: string;
  /** Route params to reopen the trip page exactly as before. */
  params: Record<string, string>;
  line: string;
  destination: string;
  carrier: string;
  boardingName: string;
  /** Expected arrival at the last stop. */
  endClock: string;
  alighting: SavedAlighting | null;
  alightName: string;
  alightClock: string;
  savedAt: number;
};

const text = (value: unknown): string => typeof value === "string" ? value : "";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Stored value back to an ActiveTrip; anything unreadable gives null instead of throwing. */
export function parseActiveTrip(raw: string | null | undefined): ActiveTrip | null {
  if (typeof raw !== "string" || !raw) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!isRecord(value) || !text(value.tripId) || typeof value.savedAt !== "number" || !isRecord(value.params)) return null;
  const params: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value.params)) if (typeof entry === "string") params[key] = entry;
  if (params.id !== value.tripId) return null;
  const alighting = isRecord(value.alighting) && text(value.alighting.id) && text(value.alighting.name) &&
    typeof value.alighting.index === "number"
    ? { id: text(value.alighting.id), name: text(value.alighting.name), index: value.alighting.index } : null;
  return {
    tripId: text(value.tripId), params, line: text(value.line), destination: text(value.destination),
    carrier: text(value.carrier), boardingName: text(value.boardingName), endClock: text(value.endClock),
    alighting, alightName: alighting ? text(value.alightName) : "", alightClock: alighting ? text(value.alightClock) : "",
    savedAt: value.savedAt
  };
}

/** Offered on Start until shortly after arrival, and never longer than three hours. */
export function activeTripValid(trip: ActiveTrip | null, nowMs: number): trip is ActiveTrip {
  if (!trip || !trip.tripId) return false;
  const age = nowMs - trip.savedAt;
  if (!Number.isFinite(age) || age < 0 || age >= ACTIVE_TRIP_MAX_AGE_MS) return false;
  const remaining = clockRemainingMs(trip.alightClock || trip.endClock, nowMs);
  return remaining === null || remaining > -ACTIVE_TRIP_GRACE_MS;
}

/** One compact line on Start: "Je rit: 14 naar Centraal Station · uitstappen 09:56". */
export function activeTripLine(trip: ActiveTrip): { lead: string; line: string; text: string } {
  const destination = trip.destination || "Ritverloop";
  const tail = trip.alighting && trip.alightClock ? " · uitstappen " + trip.alightClock
    : trip.alighting && trip.alightName ? " · uitstappen bij " + trip.alightName
    : trip.boardingName ? " · vanaf " + trip.boardingName : "";
  return { lead: trip.alighting ? "Je rit: " : "Laatst bekeken: ", line: trip.line, text: " naar " + destination + tail };
}

/** Card text on Start. */
export function activeTripSummary(trip: ActiveTrip): { title: string; destination: string; detail: string } {
  return {
    title: trip.alighting ? "Je rit" : "Laatst bekeken rit",
    destination: trip.destination || "Ritverloop",
    detail: trip.alighting && trip.alightName
      ? "Uitstappen bij " + trip.alightName + (trip.alightClock ? " · " + trip.alightClock : "")
      : trip.boardingName ? "Vanaf " + trip.boardingName : ""
  };
}
