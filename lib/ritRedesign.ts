/** Small, pure calculations shared by the trip timeline and its pinned footer. */
export type JourneyProgress = { kind: "at" | "between"; index: number } | null | undefined;

/** How many extra rows above the window are shown to keep the vehicle in view. */
export const MAX_EXTRA_VEHICLE_ROWS = 3;

export function visibleTimelineWindow(
  stopCount: number,
  boardingIndex: number,
  location: JourneyProgress,
  showAll: boolean,
  /** A stop that must stay in view, e.g. where the user gets off (-1: none). */
  includeIndex = -1
): { start: number; end: number; hiddenFollowing: number } {
  // Focus on the boarding stop; once the vehicle is past it (the user is on board), on the vehicle.
  const vehicleIndex = location?.index ?? -1;
  const rawFocus = boardingIndex >= 0 ? Math.max(boardingIndex, vehicleIndex) : (location?.index ?? 0);
  const focusIndex = Math.max(0, rawFocus);
  let start = !showAll && stopCount > 10 ? Math.max(0, focusIndex - 2) : 0;
  // A vehicle a few stops before that window is shown too: the marker sits on its row.
  if (vehicleIndex >= 0 && vehicleIndex < start && start - vehicleIndex <= MAX_EXTRA_VEHICLE_ROWS) start = vehicleIndex;
  const end = showAll || stopCount <= 10
    ? stopCount
    : Math.min(stopCount, Math.max(start + 9, focusIndex + 6, includeIndex >= 0 ? includeIndex + 2 : 0));
  return { start, end, hiddenFollowing: Math.max(0, stopCount - end) };
}

/** Returns no countdown if the clock does not plausibly describe this journey's imminent arrival.
 * Handles crossing midnight for Netherlands local times.
 */
export function minutesUntilArrival(clock: string, nowMs: number): number | null {
  if (!/^\d{1,2}:\d{2}$/.test(clock)) return null;
  const [h, m] = clock.split(":").map(Number);
  if (h > 23 || m > 59) return null;
  const parts = new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date(nowMs));
  const nowHour = Number(parts.find(p => p.type === "hour")?.value);
  const nowMinute = Number(parts.find(p => p.type === "minute")?.value);
  if (!Number.isFinite(nowHour) || !Number.isFinite(nowMinute)) return null;
  let diff = h * 60 + m - (nowHour * 60 + nowMinute);
  if (diff < -720) diff += 1440;
  if (diff < -1 || diff > 180) return null;
  return Math.max(0, diff);
}
