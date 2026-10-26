/** Persisted user controls. Defaults preserve existing departure-board behaviour. */
export type DepartureTimeMode = "both" | "clock" | "minutes";
export type WalkBufferMinutes = 3 | 5 | 10;
export type MaxWalkMinutes = 5 | 10 | 15;
export type UserSettings = {
  departureTimeMode: DepartureTimeMode;
  smartStopChoice: boolean;
  maxWalkMinutes: MaxWalkMinutes;
  walkBufferMinutes: WalkBufferMinutes;
  liveFirst: boolean;
  daySeparators: boolean;
  buurtbordMap: boolean;
};
export const DEFAULT_USER_SETTINGS: UserSettings = {
  departureTimeMode: "both",
  smartStopChoice: true,
  maxWalkMinutes: 10,
  walkBufferMinutes: 5,
  liveFirst: false,
  daySeparators: true,
  buurtbordMap: true
};

export function parseUserSettings(value: string | null): UserSettings {
  if (!value) return { ...DEFAULT_USER_SETTINGS };
  try {
    const raw: unknown = JSON.parse(value);
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ...DEFAULT_USER_SETTINGS };
    const data = raw as Partial<UserSettings>;
    const pick = <T extends string | number>(candidate: unknown, allowed: readonly T[], fallback: T): T =>
      allowed.includes(candidate as T) ? candidate as T : fallback;
    const bool = (candidate: unknown, fallback: boolean) => typeof candidate === "boolean" ? candidate : fallback;
    return {
      departureTimeMode: pick(data.departureTimeMode, ["both", "clock", "minutes"], "both"),
      smartStopChoice: bool(data.smartStopChoice, true),
      maxWalkMinutes: pick(data.maxWalkMinutes, [5, 10, 15], 10),
      walkBufferMinutes: pick(data.walkBufferMinutes, [3, 5, 10], 5),
      liveFirst: bool(data.liveFirst, false),
      daySeparators: bool(data.daySeparators, true),
      buurtbordMap: bool(data.buurtbordMap, true)
    };
  } catch {
    return { ...DEFAULT_USER_SETTINGS };
  }
}
