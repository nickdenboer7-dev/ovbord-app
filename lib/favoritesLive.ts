import type { DepartureItem, HalteBoardData, StopSummary } from "../types/api";
import { boardLineFilterKey } from "./boardLineFilters";
import { buurtbordPreviewRows } from "./buurtbord";
import { isStoredStop } from "./storedJson";

/** Upper bound on stop boards loaded for the Favorieten tab at once. */
export const MAX_FAVORITE_BOARDS = 8;

/** A saved trip as far as live matching is concerned. */
export type FavoriteJourneyMatch = {
  line: string;
  direction: string;
  carrier?: string;
  /** Line and destination as the stop board showed them when the trip was saved (V4.9+). */
  boardLine?: unknown;
  boardDirection?: unknown;
  stop: StopSummary;
};

/** Stops whose departures the Favorieten tab needs: saved trips first, then saved stops, each once. */
export function favoriteBoardStops(
  journeys: readonly { stop: StopSummary }[],
  stops: readonly StopSummary[],
  max = MAX_FAVORITE_BOARDS
): StopSummary[] {
  const seen = new Set<string>();
  const result: StopSummary[] = [];
  for (const stop of [...journeys.map((journey) => journey.stop), ...stops]) {
    if (!stop?.id || seen.has(stop.id)) continue;
    seen.add(stop.id);
    result.push(stop);
    if (result.length >= max) break;
  }
  return result;
}

/** Lower case, no accents, punctuation as spaces: for comparing names from different feeds. */
export function normalizeText(value: string): string {
  return value.toLocaleLowerCase("nl").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Stop boards and trip feeds may name one destination differently
 * ("Centraal Station" vs "Amsterdam Centraal Station"). Whole words must match:
 * "Zuid" matches "Amsterdam Zuid" but not "Zuidplein".
 */
export function directionMatches(a: string, b: string): boolean {
  const x = normalizeText(a || ""), y = normalizeText(b || "");
  if (!x || !y) return false;
  return x === y || (" " + x + " ").includes(" " + y + " ") || (" " + y + " ").includes(" " + x + " ");
}

/** Same line name, ignoring case and leading zeros ("012" is line 12). */
export function sameLineName(a: string, b: string): boolean {
  const normal = (value: string) => value.trim().replace(/^0+(?=\d)/, "").toUpperCase();
  return Boolean(normal(a)) && normal(a) === normal(b);
}

function texts(...values: unknown[]): string[] {
  return values.filter((value): value is string => typeof value === "string" && value.trim() !== "");
}

/** Next departures of a saved trip (same line, same direction) at its stop; cancelled rows stay, marked. */
export function favoriteJourneyDepartures(
  departures: readonly DepartureItem[],
  journey: FavoriteJourneyMatch,
  nowMs: number,
  limit = 3
): DepartureItem[] {
  const lines = texts(journey.line, journey.boardLine);
  const directions = texts(journey.direction, journey.boardDirection);
  const matching = departures.filter((item) =>
    lines.some((line) => sameLineName(item.line, line) ||
      boardLineFilterKey(item.line, item.carrier) === boardLineFilterKey(line, journey.carrier)) &&
    directions.some((direction) => directionMatches(item.destination, direction)));
  return buurtbordPreviewRows(matching, nowMs, limit);
}

/** Last loaded favourite boards are kept on the device for a cold start without internet. */
export const FAVORITE_BOARDS_STORAGE_KEY = "ovbord.favoriteBoards";
/** Older boards are not shown at all: their times say too little about now. */
export const FAVORITE_BOARDS_MAX_AGE_MS = 3 * 60 * 60_000;
export const STORED_DEPARTURES_PER_STOP = 20;
export type StoredFavoriteBoard = { board: HalteBoardData; fetchedAt: number };

/** Only what the Favorieten views need: the first departures, no arrivals or notices. */
export function serializeFavoriteBoards(
  boards: Readonly<Record<string, { board?: HalteBoardData; fetchedAt?: number } | undefined>>,
  stopIds: readonly string[]
): string {
  const stored: Record<string, StoredFavoriteBoard> = {};
  for (const id of stopIds) {
    const entry = boards[id];
    if (!entry?.board || typeof entry.fetchedAt !== "number" || !Number.isFinite(entry.fetchedAt)) continue;
    stored[id] = { fetchedAt: entry.fetchedAt, board: { ...entry.board,
      departures: entry.board.departures.slice(0, STORED_DEPARTURES_PER_STOP), arrivals: [], disruptions: [] } };
  }
  return JSON.stringify(stored);
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStoredDeparture(value: unknown): value is DepartureItem {
  return isRecord(value) && typeof value.id === "string" && typeof value.line === "string" &&
    typeof value.destination === "string" && typeof value.plannedTime === "string";
}

/** Stored boards younger than maxAgeMs; anything unreadable is skipped, never thrown. */
export function parseStoredFavoriteBoards(raw: string | null | undefined, nowMs: number,
  maxAgeMs = FAVORITE_BOARDS_MAX_AGE_MS): Record<string, StoredFavoriteBoard> {
  if (typeof raw !== "string" || !raw) return {};
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return {}; }
  if (!isRecord(value)) return {};
  const result: Record<string, StoredFavoriteBoard> = {};
  for (const [id, entry] of Object.entries(value)) {
    if (!isRecord(entry) || typeof entry.fetchedAt !== "number" || !Number.isFinite(entry.fetchedAt)) continue;
    const age = nowMs - entry.fetchedAt;
    if (age < 0 || age >= maxAgeMs) continue;
    const board = entry.board;
    if (!isRecord(board) || !isStoredStop(board.stop) || !Array.isArray(board.departures)) continue;
    // The stop is reused for navigation and recents: make sure the fields lists rely on exist.
    const raw = board.stop as Record<string, any>;
    const stop = { ...raw, city: typeof raw.city === "string" ? raw.city : "",
      mode: typeof raw.mode === "string" ? raw.mode : "bus",
      lines: Array.isArray(raw.lines) ? raw.lines : [] } as StopSummary;
    result[id] = { fetchedAt: entry.fetchedAt, board: { ...(board as HalteBoardData), stop,
      departures: board.departures.filter(isStoredDeparture), arrivals: [], disruptions: [] } };
  }
  return result;
}
