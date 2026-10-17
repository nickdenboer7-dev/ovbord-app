import type { RitData } from "../types/api";
import { linesConflict } from "./flowRitQuality";
import { directionMatches } from "./favoritesLive";

/** A cached trip for a vehicle-based ID may be the vehicle's previous trip: the destination must match too. */
function sameDirection(entry: { data: RitData }, expectedDestination: string): boolean {
  return !expectedDestination || !entry.data.destination || directionMatches(expectedDestination, entry.data.destination);
}

export const RIT_RETURN_CACHE_MAX_AGE_MS = 14_000;

/** Only an already-opened matching trip may skip its initial network request. */
export function usableRitReturnCache(
  entry: { data: RitData; fetchedAt: number } | undefined,
  tripId: string,
  expectedLine: string,
  nowMs: number,
  expectedDestination = ""
): boolean {
  if (!entry || !tripId || entry.data?.id !== tripId ||
      !Number.isFinite(entry.fetchedAt) || nowMs < entry.fetchedAt ||
      nowMs - entry.fetchedAt >= RIT_RETURN_CACHE_MAX_AGE_MS) return false;
  return (!expectedLine || !linesConflict(expectedLine, entry.data.line)) && sameDirection(entry, expectedDestination);
}

/**
 * Offline fallback: a trip opened earlier may be shown again when the network
 * request fails, clearly marked as last known. Never used to skip a request.
 */
export const RIT_OFFLINE_CACHE_MAX_AGE_MS = 30 * 60_000;

export function usableOfflineRitCache(
  entry: { data: RitData; fetchedAt: number } | undefined,
  tripId: string,
  expectedLine: string,
  nowMs: number,
  expectedDestination = ""
): boolean {
  if (!entry || !tripId || entry.data?.id !== tripId ||
      !Number.isFinite(entry.fetchedAt) || nowMs < entry.fetchedAt ||
      nowMs - entry.fetchedAt >= RIT_OFFLINE_CACHE_MAX_AGE_MS) return false;
  return (!expectedLine || !linesConflict(expectedLine, entry.data.line)) && sameDirection(entry, expectedDestination);
}

export const RIT_RETURN_CACHE_MAX_ENTRIES = 25;

/**
 * Drop entries that can never be reused (older than the offline window, invalid
 * or future timestamps) and cap the size, keeping the most recently stored trips.
 * Mutates the map.
 */
export function pruneRitReturnCache(
  cache: Map<string, { fetchedAt: number }>,
  nowMs: number,
  maxEntries = RIT_RETURN_CACHE_MAX_ENTRIES
): void {
  for (const [key, entry] of cache) {
    const age = nowMs - entry.fetchedAt;
    if (!Number.isFinite(age) || age < 0 || age >= RIT_OFFLINE_CACHE_MAX_AGE_MS) cache.delete(key);
  }
  while (cache.size > maxEntries) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}
