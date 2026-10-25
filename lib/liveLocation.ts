import type { LocatieResultaat } from "./location";

export type Coords = { latitude: number; longitude: number };

/** How far (metres) the user must move before nearby stops are refetched (V5.8.1). */
export const MOVEMENT_REFRESH_METERS = 150;

const EARTH_RADIUS_M = 6371000;
function toRad(deg: number): number { return (deg * Math.PI) / 180; }

/** Great-circle distance between two coordinates, in metres. */
export function haversineMeters(a: Coords, b: Coords): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** No previous position (first fix) always counts as "moved enough" so nearby stops load. */
export function hasMovedEnough(from: Coords | null, to: Coords, thresholdMeters = MOVEMENT_REFRESH_METERS): boolean {
  if (!from) return true;
  return haversineMeters(from, to) >= thresholdMeters;
}

export type TimedFix = { fixAt: number; bron: LocatieResultaat["bron"] };

/**
 * Whether `candidate` should replace `current` as the location shown on screen (V5.8.1).
 * Fixes are ordered by the real moment the position was taken (fixAt), not by when the request
 * that fetched it happened to resolve: a delayed response for an older city, or a stale
 * "laatst-bekend" read racing a fresher GPS fix, both lose to whichever fix is actually newer.
 * Equal timestamps are accepted (idempotent re-application of the same fix).
 */
export function isFresherFix(candidate: TimedFix, current: TimedFix | null): boolean {
  if (!current) return true;
  return candidate.fixAt >= current.fixAt;
}

/**
 * What the live-location hook does with an incoming fix (V5.8.1):
 * - accept: show it (only when it is at least as fresh as the fix on screen);
 * - refresh: also refetch nearby stops — on the first fix, a move of ~150m from the position the
 *   stops were last loaded for, or an upgrade from a last-known read to a live GPS fix. Smaller
 *   movements (GPS jitter, walking around a platform) do not cost an API call.
 */
export function decideLiveFix(
  current: TimedFix | null,
  lastLoadedAt: Coords | null,
  incoming: TimedFix & { coords: Coords },
  thresholdMeters = MOVEMENT_REFRESH_METERS
): { accept: boolean; refresh: boolean } {
  if (!isFresherFix(incoming, current)) return { accept: false, refresh: false };
  const upgraded = current?.bron === "laatst-bekend" && incoming.bron === "gps";
  return { accept: true, refresh: !lastLoadedAt || upgraded || hasMovedEnough(lastLoadedAt, incoming.coords, thresholdMeters) };
}

/** Dutch, compact age label for a fix, e.g. "nu", "3 min geleden", "2 uur geleden". */
export function describeLocationAge(fixAt: number, nowMs: number): string {
  const ms = Math.max(0, nowMs - fixAt);
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "nu";
  if (minutes < 60) return minutes + " min geleden";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + " uur geleden";
  const days = Math.floor(hours / 24);
  return days + (days === 1 ? " dag geleden" : " dagen geleden");
}

/** A "laatst-bekend" fix, or a "gps" fix old enough to no longer count as live (V5.9).
 *  Balk verschijnt pas na 5 minuten (was 2 minuten in V5.8.1). */
export function isLocationStale(bron: LocatieResultaat["bron"] | null, fixAt: number | null, nowMs: number, staleAfterMs = 300000): boolean {
  if (!bron || fixAt === null) return false;
  if (bron === "laatst-bekend") return true;
  if (bron === "gps") return nowMs - fixAt > staleAfterMs;
  return false;
}

/**
 * Race guard for API responses that follow a location fetch (V5.8.1, requirement 9): a response
 * is only applied when its request token is still the most recently issued one. Using a counter
 * (rather than a single boolean) stays correct across any number of overlapping in-flight requests,
 * which a continuously-updating GPS position can produce.
 */
export function shouldApplyResponse(requestToken: number, latestToken: number): boolean {
  return requestToken === latestToken;
}
