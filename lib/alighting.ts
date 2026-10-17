import type { DepartureItem, JourneyStop } from "../types/api";
import { departureTimeRemainingMs, keepBoardDeparture } from "./boardSmartness";
import { normalizeText, sameLineName } from "./favoritesLive";

/** Verified vehicle progress on the trip page (GPS-confirmed only). */
export type JourneyProgress = { kind: "at" | "between"; index: number } | null | undefined;
/** The stop where the user gets off, identified by position, ID and name. */
export type SavedAlighting = { id: string; name: string; index: number };
export type AlightingStatus = "approaching" | "next" | "at" | "passed";

export const MAX_REMEMBERED_ALIGHTINGS = 30;
const remembered = new Map<string, SavedAlighting>();

/** Keeps the choice while the app runs, so leaving and reopening the trip keeps it. */
export function rememberAlighting(tripId: string, value: SavedAlighting | null): void {
  if (!tripId) return;
  remembered.delete(tripId);
  if (value) remembered.set(tripId, value);
  while (remembered.size > MAX_REMEMBERED_ALIGHTINGS) {
    const oldest = remembered.keys().next();
    if (oldest.done) break;
    remembered.delete(oldest.value);
  }
}

export function recallAlighting(tripId: string): SavedAlighting | null {
  return remembered.get(tripId) || null;
}

/**
 * Finds the chosen stop again after a refresh: the same position first, then the
 * same ID and name, then the same name, always after the boarding stop (loop routes
 * pass some stops twice).
 */
export function findAlightingIndex(stops: readonly Pick<JourneyStop, "id" | "name">[], saved: SavedAlighting | null, after = -1): number {
  if (!saved) return -1;
  const exact = stops[saved.index];
  if (exact && saved.index > after && exact.id === saved.id && exact.name === saved.name) return saved.index;
  const byId = stops.findIndex((stop, index) => index > after && stop.id === saved.id && stop.name === saved.name);
  if (byId >= 0) return byId;
  return stops.findIndex((stop, index) => index > after && stop.name === saved.name);
}

/** Milliseconds until a "HH:MM" clock today (around midnight handled as on the stop board); null without a clock. */
export function clockRemainingMs(clock: string, nowMs: number): number | null {
  if (!/^\d{1,2}:\d{2}$/.test(clock || "")) return null;
  return departureTimeRemainingMs({ plannedTime: clock } as DepartureItem, nowMs);
}

/** Last stop whose (expected) time has passed: the schedule's idea of where the trip is. */
export function scheduleIndex(clocks: readonly string[], nowMs: number): number {
  let last = -1;
  clocks.forEach((clock, index) => {
    const remaining = clockRemainingMs(clock, nowMs);
    if (remaining !== null && remaining <= 0) last = index;
  });
  return last;
}

/**
 * Where the user is relative to the alighting stop. Only GPS-verified progress can
 * say "next", "at" or "passed"; without it the stop count is an estimate from the
 * boarding stop or the timetable, and nothing is claimed as passed.
 */
export function alightingState(alightIndex: number, progress: JourneyProgress, fallbackIndex: number): { status: AlightingStatus; remaining: number | null } {
  if (alightIndex < 0) return { status: "approaching", remaining: null };
  if (progress) {
    if (progress.kind === "at" && progress.index === alightIndex) return { status: "at", remaining: 0 };
    if (progress.index >= alightIndex) return { status: "passed", remaining: null };
    const remaining = alightIndex - progress.index;
    return { status: remaining === 1 ? "next" : "approaching", remaining };
  }
  return { status: "approaching", remaining: fallbackIndex >= 0 && fallbackIndex < alightIndex ? alightIndex - fallbackIndex : null };
}

function countdownText(minutes: number | null, lastKnown: boolean): string {
  if (minutes === null || minutes > 90) return "";
  if (minutes <= 0) return lastKnown ? "± nu" : "nu";
  return (lastKnown ? "± " : "over ") + minutes + " min";
}

/** Text for the alighting row in the trip summary. */
export function alightingSummary(input: {
  name: string; clock: string; minutes: number | null; status: AlightingStatus; remaining: number | null; lastKnown: boolean;
}): { title: string; detail: string } {
  const { name, clock, status, remaining, lastKnown } = input;
  const countdown = countdownText(input.minutes, lastKnown);
  if (status === "at") {
    return { title: lastKnown ? "Laatst bekend: bij je uitstaphalte" : "Stap hier uit", detail: name + " · " + clock };
  }
  if (status === "passed") return { title: "Uitstaphalte gepasseerd", detail: name + " · " + clock };
  if (status === "next") {
    return {
      title: lastKnown ? "Laatst bekend: volgende halte is je uitstaphalte" : "Volgende halte: uitstappen",
      detail: [name, clock, countdown].filter(Boolean).join(" · ")
    };
  }
  const stops = remaining === null ? "" : "nog " + remaining + (remaining === 1 ? " halte" : " haltes");
  return { title: "Uitstappen bij " + name, detail: [clock, countdown, stops].filter(Boolean).join(" · ") };
}

export const MIN_TRANSFER_MINUTES = 2;
/** Longer waits are not shown as a connection: the board has all other departures. */
export const MAX_TRANSFER_WAIT_MINUTES = 30;
export type TransferOption = { item: DepartureItem; marginMinutes: number; tight: boolean };

/**
 * Useful connections at the alighting stop: departures leaving after the user
 * arrives and within MAX_TRANSFER_WAIT_MINUTES, the first one per line and
 * direction, soonest first. The current line is left out in both directions
 * (riding back is not a transfer). Less than MIN_TRANSFER_MINUTES is "te krap";
 * cancelled trips stay, marked.
 */
export function transferOptions(
  departures: readonly DepartureItem[],
  input: { arrivalClock: string; tripId: string; line: string; destination: string },
  nowMs: number,
  limit = 3,
  maxWaitMinutes = MAX_TRANSFER_WAIT_MINUTES
): TransferOption[] {
  const arrival = clockRemainingMs(input.arrivalClock, nowMs);
  if (arrival === null) return [];
  // input.destination is kept for callers; the whole line is excluded, whatever its direction.
  const ownLine = (item: DepartureItem) => (Boolean(item.ritId) && item.ritId === input.tripId) ||
    sameLineName(item.line, input.line);
  const seen = new Set<string>();
  return departures
    .filter((item) => item.departed !== true && keepBoardDeparture(item, nowMs) && !ownLine(item))
    .map((item) => ({ item, ms: departureTimeRemainingMs(item, nowMs) }))
    .filter((entry): entry is { item: DepartureItem; ms: number } => entry.ms !== null && entry.ms >= arrival &&
      entry.ms - arrival <= maxWaitMinutes * 60000)
    .sort((a, b) => a.ms - b.ms)
    .filter(({ item }) => {
      const key = item.line.trim().toUpperCase() + "|" + normalizeText(item.destination);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit)
    .map(({ item, ms }) => {
      const marginMinutes = Math.floor((ms - arrival) / 60000);
      return { item, marginMinutes, tight: item.cancelled !== true && marginMinutes < MIN_TRANSFER_MINUTES };
    });
}

/** Collapsed transfer header: "2 aansluitingen · eerste 53 om 02:08". */
export function transferSummary(options: readonly TransferOption[], firstClock: string): string {
  if (!options.length) return "";
  const first = options[0].item;
  return options.length + (options.length === 1 ? " aansluiting" : " aansluitingen") +
    " · eerste " + first.line + " om " + firstClock + (options[0].tight ? " (te krap)" : "");
}

/** Message for sharing the expected arrival at the alighting stop. */
export function arrivalShareText(input: {
  stopName: string; clock: string; line: string; destination: string;
  delayMinutes?: number; live: boolean; lastKnown: boolean;
}): string {
  const delay = input.live && typeof input.delayMinutes === "number" && Number.isFinite(input.delayMinutes) && input.delayMinutes !== 0
    ? ", " + Math.abs(input.delayMinutes) + " min " + (input.delayMinutes > 0 ? "vertraging" : "eerder") : "";
  const when = input.lastKnown ? "rond " + input.clock : "om " + input.clock;
  return "Ik ben " + when + " bij " + input.stopName + " (lijn " + input.line + " naar " + input.destination + delay + ")." +
    (input.live ? "" : " Volgens de dienstregeling.");
}
