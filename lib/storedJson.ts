/**
 * Parse a stored JSON list without letting one corrupt AsyncStorage value
 * block the rest of the app settings. Invalid JSON, non-arrays and invalid
 * items are dropped; valid items are kept in their original order.
 */
export function parseStoredList<T>(raw: string | null | undefined, isItem: (value: unknown) => value is T): T[] | undefined {
  if (typeof raw !== "string" || raw === "") return undefined;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!Array.isArray(value)) return undefined;
  return value.filter(isItem);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isStoredString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** Minimal shape check for StopSummary-like entries (favorites and recents). */
export function isStoredStop<T extends { id: string; name: string }>(value: unknown): value is T {
  return isRecord(value) && isStoredString(value.id) && typeof value.name === "string";
}

/** Minimal shape check for SavedJourney entries. */
export function isStoredJourney<T extends { key: string; line: string; stop: unknown }>(value: unknown): value is T {
  return isRecord(value) && isStoredString(value.key) && typeof value.line === "string" && isStoredStop(value.stop);
}

/**
 * Stored lists load asynchronously at startup. Items added before loading
 * finished come first; stored items follow without duplicates, so an early tap
 * (e.g. opening a stop right after launch) cannot wipe saved favorites or recents.
 */
export function mergeLoadedList<T>(current: readonly T[], stored: readonly T[], keyOf: (item: T) => string, limit?: number): T[] {
  const seen = new Set(current.map(keyOf));
  const merged = [...current, ...stored.filter((item) => !seen.has(keyOf(item)))];
  return typeof limit === "number" ? merged.slice(0, limit) : merged;
}
