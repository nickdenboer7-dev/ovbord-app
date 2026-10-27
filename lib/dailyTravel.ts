/** Two opt-in shortcuts pointing at existing saved journeys; never guess someone's home or work. */
export const DAILY_TRAVEL_STORAGE_KEY = "ovbord.dailyTravel.v1";
export type DailySlot = "morning" | "evening";
export type DailyTravelChoices = Record<DailySlot, string | null>;
export const EMPTY_DAILY_TRAVEL: DailyTravelChoices = { morning: null, evening: null };

export function parseDailyTravel(raw: string | null | undefined): DailyTravelChoices {
  if (!raw) return { ...EMPTY_DAILY_TRAVEL };
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ...EMPTY_DAILY_TRAVEL };
    const record = value as Record<string, unknown>;
    const key = (entry: unknown) => typeof entry === "string" && entry.trim().length > 0 && entry.length < 300 ? entry : null;
    return { morning: key(record.morning), evening: key(record.evening) };
  } catch { return { ...EMPTY_DAILY_TRAVEL }; }
}

export function availableDailyJourney<T extends { key: string }>(items: readonly T[], key: string | null): T | null {
  return key ? items.find(item => item.key === key) || null : null;
}

export function dailyTravelLabel(slot: DailySlot): string {
  return slot === "morning" ? "Thuis → Werk" : "Werk → Thuis";
}
