import type { JourneyStop, RitData } from "../types/api";
import { distanceMeters } from "./boardingMatch";
import { directionMatches, normalizeText, sameLineName } from "./favoritesLive";

/**
 * Live trips are requested by vehicle ("GVB_1913" is bus 1913): after the last
 * stop the same ID returns the vehicle's next trip, possibly on another line.
 * Trip IDs from timetables (numbers, GVB_METRO_GTFS_…) never move on.
 */
export function vehicleBasedTripId(id: string): boolean {
  return /^[A-Z]{2,6}_\d{2,6}$/.test(String(id || "").trim());
}

/** What identifies one trip: its line, first stop and the planned departure there. */
export type TripSignature = { line: string; firstStop: string; firstPlanned: string; destination: string };

export function tripSignature(rit: Pick<RitData, "line" | "destination" | "stops">): TripSignature | null {
  const first: JourneyStop | undefined = rit.stops[0];
  if (!first) return null;
  const planned = first.plannedDepartureTime || first.plannedTime || "";
  return {
    line: String(rit.line || "").trim(),
    firstStop: normalizeText(first.name || ""),
    firstPlanned: /^\d{1,2}:\d{2}$/.test(planned) ? planned : "",
    destination: rit.destination || ""
  };
}

/**
 * True only when two responses clearly describe different trips: another line,
 * another planned first departure, or another start and destination together.
 * Missing data never counts as a difference.
 */
export function differentTrip(a: TripSignature | null, b: TripSignature | null): boolean {
  if (!a || !b) return false;
  if (a.line && b.line && a.line !== "?" && b.line !== "?" && !sameLineName(a.line, b.line)) return true;
  if (a.firstPlanned && b.firstPlanned && a.firstPlanned !== b.firstPlanned) return true;
  return Boolean(a.firstStop && b.firstStop && a.firstStop !== b.firstStop &&
    a.destination && b.destination && !directionMatches(a.destination, b.destination));
}

/** Minutes from a's planned start to b's (around midnight, within 12 h); null when either is unknown. */
export function startDifferenceMinutes(a: TripSignature | null, b: TripSignature | null): number | null {
  if (!a?.firstPlanned || !b?.firstPlanned) return null;
  const minutes = (clock: string) => { const [h, m] = clock.split(":").map(Number); return h * 60 + m; };
  let diff = minutes(b.firstPlanned) - minutes(a.firstPlanned);
  if (diff > 720) diff -= 1440;
  if (diff <= -720) diff += 1440;
  return diff;
}

export type NextTripDecision = "same" | "ignore" | "wait" | "continue";

/**
 * What to do with a refresh that may describe another trip of the same vehicle.
 * Around the last stop sources can lag and briefly report the previous trip again
 * (seen with GVB_2094 on 16-10): an earlier trip is ignored, and a later one must
 * be reported twice in a row before this trip is treated as finished.
 */
export function nextTripDecision(current: TripSignature | null, response: TripSignature | null,
  pending: TripSignature | null): NextTripDecision {
  if (!differentTrip(current, response)) return "same";
  const diff = startDifferenceMinutes(current, response);
  if (diff !== null && diff < 0) return "ignore";
  return pending && !differentTrip(pending, response) ? "continue" : "wait";
}

/** Short line codes (N85, 71, 14) that differ; names like IC/Intercity are not compared. */
export function otherLineThanExpected(expected: string, actual: string): boolean {
  const code = /^[A-Z]{0,3}\d{1,4}[A-Z]?$/i;
  const e = String(expected || "").trim(), a = String(actual || "").trim();
  return code.test(e) && code.test(a) && !sameLineName(e, a);
}

/**
 * A vehicle-based ID opened from a departure can still be on its previous trip
 * (or already on the next one): then the answer is another line or direction.
 */
export function notTheTappedTrip(tripId: string, expected: { line: string; destination: string },
  rit: Pick<RitData, "line" | "destination">): boolean {
  if (!vehicleBasedTripId(tripId)) return false;
  if (expected.line && otherLineThanExpected(expected.line, rit.line)) return true;
  return Boolean(expected.destination && rit.destination && !directionMatches(expected.destination, rit.destination));
}

/** "lijn 71 naar Osdorpplein Oost" */
export function tripLabel(rit: Pick<RitData, "line" | "destination">): string {
  return "lijn " + rit.line + " naar " + rit.destination;
}

/** Shown instead of a trip that the vehicle is not (yet) driving. */
export function otherTripMessage(rit: Pick<RitData, "line" | "destination">, expected: { line: string; destination: string }): string {
  const wanted = expected.destination ? (expected.line ? "lijn " + expected.line + " naar " : "je rit naar ") + expected.destination : "je rit";
  return "Deze bus rijdt nu " + tripLabel(rit) + ". " + wanted.charAt(0).toUpperCase() + wanted.slice(1) +
    " verschijnt hier zodra die begint.";
}

/** Banner on a finished trip whose vehicle now drives another one. */
export function continuationText(next: Pick<RitData, "line" | "destination">, firstDeparture: string): string {
  return "Rit beëindigd · deze bus rijdt verder als " + tripLabel(next) + (firstDeparture ? " (vertrek " + firstDeparture + ")" : "");
}

/** Where the vehicle is, from GPS-verified progress only. */
export function vehiclePlaceText(stopNames: readonly string[], progress: { kind: "at" | "between"; index: number } | null | undefined,
  lastKnown: boolean): string {
  if (!progress) return "";
  const here = stopNames[progress.index];
  if (!here) return "";
  const next = stopNames[progress.index + 1];
  if (progress.kind === "at" || !next) return (lastKnown ? "Laatst bij " : "Bij ") + here;
  return (lastKnown ? "Laatst tussen " : "Tussen ") + here + " en " + next;
}

/**
 * Speed between two GPS fixes, rounded to 5 km/h. Null when the fixes are too
 * close or too far apart in time, or the result is implausible (GPS jumps).
 */
export function estimatedSpeedKmh(previous: { lat: number; lon: number; observedMs: number } | null,
  current: { lat: number; lon: number; observedMs: number } | null): number | null {
  if (!previous || !current) return null;
  const seconds = (current.observedMs - previous.observedMs) / 1000;
  if (!Number.isFinite(seconds) || seconds < 8 || seconds > 120) return null;
  const meters = distanceMeters(previous, current);
  if (!Number.isFinite(meters)) return null;
  const kmh = meters / seconds * 3.6;
  if (kmh > 130) return null;
  return Math.round(kmh / 5) * 5;
}
