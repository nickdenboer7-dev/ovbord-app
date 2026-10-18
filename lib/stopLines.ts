import type { HalteBoardData, LineInfo, StopSummary } from "../types/api";
import { runLimited } from "./concurrency";
import { haversineMeters } from "./liveLocation";
import { mergeLines } from "./lineSet";

/**
 * V5.9.1: /api/nearby keeps only the nearest platform of each stop name, with only that
 * platform's lines (Floraweg: "36" instead of 36, 39, 391, 394, N93, N94). Until the backend
 * sends complete lines per stop area, Start fills in the lines that run from the same stop area
 * now: /api/halte/{id} already answers for the whole area. Bounded on purpose:
 * - at most one board per nearby entry, cached per stop ID (15 min) and shared while in flight;
 * - at most 2 requests at a time and 10 per minute for this purpose, whatever the GPS does;
 * - nothing at all for entries the backend marks complete ("lines_complete") or sends with all
 *   their platforms ("quays");
 * - only lines of a board whose centre lies near the platform (a long street such as Klaprozenweg
 *   has one board for stops 650 m apart: those lines do not belong to this platform).
 * Lines are only ever added, never removed: a line the API lists without a departure now stays.
 */
export type AreaLinesLoaderOptions = {
  fetchBoard: (stopId: string) => Promise<HalteBoardData>;
  now?: () => number;
  ttlMs?: number;
  failureTtlMs?: number;
  maxPerMinute?: number;
  concurrency?: number;
  maxEntries?: number;
  maxBoardDistanceMeters?: number;
};

export type AreaLinesLoader = {
  /** Lines per stop ID for these nearby entries (cached, bounded); missing IDs have nothing to add. */
  load: (stops: readonly StopSummary[]) => Promise<Record<string, LineInfo[]>>;
  /** Cached lines only, without any request: for an instant first render. */
  peek: (stops: readonly StopSummary[]) => Record<string, LineInfo[]>;
  /** Requests made so far (for tests and diagnostics). */
  requestCount: () => number;
};

type CacheEntry = { lines: LineInfo[] | null; at: number };

export const AREA_LINES_TTL_MS = 15 * 60 * 1000;
export const AREA_LINES_MAX_PER_MINUTE = 10;
export const AREA_LINES_CONCURRENCY = 2;
export const AREA_BOARD_MAX_DISTANCE_M = 300;

/** The distinct lines that depart from a stop area's board, each with its own mode and carrier. */
export function linesFromBoard(board: HalteBoardData): LineInfo[] {
  return mergeLines(board.departures
    .filter((departure) => String(departure.line || "").trim())
    .map((departure) => ({ line: departure.line, ...(departure.carrier ? { carrier: departure.carrier } : {}), ...(departure.mode ? { mode: departure.mode } : {}) })));
}

export function needsAreaLines(stop: StopSummary): boolean {
  return !stop.linesComplete && !stop.variants?.length && stop.id !== "unknown";
}

export function createAreaLinesLoader(options: AreaLinesLoaderOptions): AreaLinesLoader {
  const now = options.now ?? (() => Date.now());
  const ttlMs = options.ttlMs ?? AREA_LINES_TTL_MS;
  const failureTtlMs = options.failureTtlMs ?? 2 * 60 * 1000;
  const maxPerMinute = options.maxPerMinute ?? AREA_LINES_MAX_PER_MINUTE;
  const concurrency = options.concurrency ?? AREA_LINES_CONCURRENCY;
  const maxEntries = options.maxEntries ?? 60;
  const maxDistance = options.maxBoardDistanceMeters ?? AREA_BOARD_MAX_DISTANCE_M;
  const cache = new Map<string, CacheEntry>();
  const inFlight = new Map<string, Promise<LineInfo[] | null>>();
  const recent: number[] = [];
  let requests = 0;

  const fresh = (id: string): CacheEntry | undefined => {
    const entry = cache.get(id);
    if (!entry) return undefined;
    const age = now() - entry.at;
    return age <= (entry.lines ? ttlMs : failureTtlMs) ? entry : undefined;
  };
  const remember = (id: string, lines: LineInfo[] | null) => {
    cache.delete(id);
    cache.set(id, { lines, at: now() });
    while (cache.size > maxEntries) cache.delete(cache.keys().next().value as string);
  };
  const withinBudget = () => {
    const t = now();
    while (recent.length && t - recent[0] > 60000) recent.shift();
    return recent.length < maxPerMinute;
  };
  const fetchLines = (stop: StopSummary): Promise<LineInfo[] | null> => {
    const running = inFlight.get(stop.id);
    if (running) return running;
    recent.push(now());
    requests += 1;
    const task = options.fetchBoard(stop.id)
      .then((board) => {
        const near = board.stop.lat === undefined || board.stop.lon === undefined || stop.lat === undefined || stop.lon === undefined
          || haversineMeters({ latitude: board.stop.lat, longitude: board.stop.lon }, { latitude: stop.lat, longitude: stop.lon }) <= maxDistance;
        const lines = near ? linesFromBoard(board) : [];
        remember(stop.id, lines);
        return lines;
      })
      .catch(() => { remember(stop.id, null); return null; })
      .finally(() => { inFlight.delete(stop.id); });
    inFlight.set(stop.id, task);
    return task;
  };

  const peek = (stops: readonly StopSummary[]) => {
    const out: Record<string, LineInfo[]> = {};
    for (const stop of stops) {
      const entry = fresh(stop.id);
      if (entry?.lines?.length) out[stop.id] = entry.lines;
    }
    return out;
  };

  const load = async (stops: readonly StopSummary[]) => {
    const out = peek(stops);
    const todo = stops.filter((stop, index) => needsAreaLines(stop) && !fresh(stop.id) &&
      stops.findIndex((other) => other.id === stop.id) === index);
    await runLimited(todo, concurrency, async (stop) => {
      if (!inFlight.has(stop.id) && !withinBudget()) return; // over budget: show the API lines only, try again later
      const lines = await fetchLines(stop);
      if (lines?.length) out[stop.id] = lines;
    });
    return out;
  };

  return { load, peek, requestCount: () => requests };
}
