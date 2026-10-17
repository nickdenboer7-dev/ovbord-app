import type { JourneyStop } from "../types/api";

/**
 * What the stop board knows about where the traveller boards.
 * Stop boards and trip feeds do not always share IDs or names (e.g. the board's
 * "Utrecht, Centraal Station" 2993985 vs the trip's "Utrecht Centraal" 2994010),
 * so position and planned departure time are used as fallback evidence.
 */
export type BoardingHint = {
  id?: string;
  name?: string;
  lat?: number;
  lon?: number;
  /** Planned departure clock at the boarding stop, "HH:MM". */
  time?: string;
};

/** Station areas (all platforms of one station) stay within this radius. */
export const BOARDING_MATCH_RADIUS_M = 400;
/** Without a matching time, only an unambiguous nearby stop is accepted. */
export const BOARDING_NEAREST_RADIUS_M = 250;

function normalizedName(value: string | undefined): string {
  return String(value || "").toLocaleLowerCase("nl").normalize("NFD")
    .replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
}

function clock(value: string | undefined): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());
  return m ? m[1].padStart(2, "0") + ":" + m[2] : "";
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function distanceMeters(a: { lat?: number; lon?: number }, b: { lat?: number; lon?: number }): number {
  if (!finite(a.lat) || !finite(a.lon) || !finite(b.lat) || !finite(b.lon)) return Infinity;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(x)));
}

function timeMatches(stop: JourneyStop, time: string): boolean {
  if (!time) return false;
  return clock(stop.plannedDepartureTime) === time || clock(stop.plannedTime) === time;
}

/** Among several candidates (e.g. a loop line visiting a stop twice) prefer the planned time. */
function pick(indices: number[], stops: JourneyStop[], time: string): number {
  if (!indices.length) return -1;
  return indices.find((i) => timeMatches(stops[i], time)) ?? indices[0];
}

/**
 * Index of the boarding stop in a trip, or -1. Order of evidence:
 * 1. same stop ID, 2. same normalised name, 3. within a station radius at the
 * same planned time, 4. the single nearest stop within a short radius.
 */
export function findBoardingIndex(stops: readonly JourneyStop[], hint: BoardingHint): number {
  const list = stops as JourneyStop[];
  if (!list.length) return -1;
  const time = clock(hint.time);

  if (hint.id) {
    const byId = list.map((s, i) => (s.id === hint.id ? i : -1)).filter((i) => i >= 0);
    if (byId.length) return pick(byId, list, time);
  }

  const name = normalizedName(hint.name);
  if (name) {
    const byName = list.map((s, i) => (normalizedName(s.name) === name ? i : -1)).filter((i) => i >= 0);
    if (byName.length) return pick(byName, list, time);
  }

  if (!finite(hint.lat) || !finite(hint.lon)) return -1;
  const nearby = list
    .map((s, i) => ({ i, d: distanceMeters(hint, s) }))
    .filter((c) => c.d <= BOARDING_MATCH_RADIUS_M)
    .sort((a, b) => a.d - b.d);
  const timed = nearby.filter((c) => timeMatches(list[c.i], time));
  if (timed.length) return timed[0].i;
  const close = nearby.filter((c) => c.d <= BOARDING_NEAREST_RADIUS_M);
  return close.length === 1 ? close[0].i : -1;
}

/** Route params arrive as strings; keep invalid numbers absent. */
export function boardingHintFromParams(params: {
  boardingId?: string; boardingName?: string; boardingLat?: string; boardingLon?: string; boardingTime?: string;
}): BoardingHint {
  const num = (value: string | undefined) => {
    if (value === undefined || value === "") return undefined;
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  };
  return {
    id: params.boardingId || undefined,
    name: params.boardingName || undefined,
    lat: num(params.boardingLat),
    lon: num(params.boardingLon),
    time: params.boardingTime || undefined
  };
}
