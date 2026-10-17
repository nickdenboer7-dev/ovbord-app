import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "./AppProvider";
import { getHalte, searchStops } from "../lib/api";
import { FAVORITE_BOARDS_STORAGE_KEY, favoriteBoardStops, parseStoredFavoriteBoards, serializeFavoriteBoards } from "../lib/favoritesLive";
import { failureKind } from "../lib/offline";
import { runLimited } from "../lib/concurrency";
import type { FailureKind } from "../lib/offline";
import type { HalteBoardData, StopSummary } from "../types/api";

/**
 * Last loaded board of a favourite stop. stale: the times are not confirmed by
 * a refresh right now (stored from an earlier session, or the latest refresh failed).
 */
export type FavoriteBoard = { board?: HalteBoardData; failure?: FailureKind; stale?: boolean; fetchedAt?: number };

type FavoritesLiveValue = {
  boards: Record<string, FavoriteBoard>;
  refreshFailure: FailureKind | null;
  /** Last moment all favourite boards were loaded successfully. */
  updatedAt: number | null;
  /** Reload all favourite boards. Without force it is skipped when a reload started less than 15 s ago. */
  refresh: (force?: boolean) => Promise<void>;
  /** Changes when the set of favourite stops changes, not when their order changes. */
  stopsKey: string;
};

const MIN_REFRESH_GAP_MS = 15000;
/** Fewer parallel requests at startup leave room for "Haltes in de buurt" and the first screen. */
export const MAX_PARALLEL_BOARDS = 3;
const BOARD_UPDATE_BATCH_MS = 150;
const Context = createContext<FavoritesLiveValue | undefined>(undefined);

async function loadFavoriteBoard(stop: StopSummary): Promise<HalteBoardData> {
  try {
    return await getHalte(stop.id);
  } catch (firstError) {
    // A trip saved without a public stop ID is found by name, as on the stop board.
    if (failureKind(firstError) === "offline") throw firstError;
    const normalize = (value: string) => value.toLocaleLowerCase("nl").trim();
    const found = (await searchStops(stop.name)).find((match) => normalize(match.name) === normalize(stop.name));
    if (!found) throw firstError;
    return await getHalte(found.id);
  }
}

/** One loader for the favourite boards, shared by Start ("Mijn ritten") and the Favorieten tab. */
export function FavoritesLiveProvider({ children }: { children: React.ReactNode }) {
  const { favoriteStops, favoriteJourneys } = useApp();
  const stops = useMemo(() => favoriteBoardStops(favoriteJourneys, favoriteStops), [favoriteJourneys, favoriteStops]);
  const stopsKey = useMemo(() => stops.map((stop) => stop.id).sort().join("|"), [stops]);
  const stopsRef = useRef(stops);
  stopsRef.current = stops;
  const [boards, setBoards] = useState<Record<string, FavoriteBoard>>({});
  const boardsRef = useRef(boards);
  boardsRef.current = boards;
  const [refreshFailure, setRefreshFailure] = useState<FailureKind | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const inFlight = useRef(false);
  const loadAgain = useRef(false);
  const lastStart = useRef(0);

  // Boards stored in an earlier session are shown as last known until a refresh confirms them.
  useEffect(() => {
    void AsyncStorage.getItem(FAVORITE_BOARDS_STORAGE_KEY).catch(() => null).then((raw) => {
      const stored = parseStoredFavoriteBoards(raw, Date.now());
      const ids = Object.keys(stored);
      if (!ids.length) return;
      setBoards((current) => {
        const next = { ...current };
        for (const id of ids) {
          if (!next[id]?.board) next[id] = { board: stored[id].board, fetchedAt: stored[id].fetchedAt, stale: true };
        }
        return next;
      });
      setUpdatedAt((current) => current ?? Math.max(...ids.map((id) => stored[id].fetchedAt)));
    });
  }, []);

  const refresh = useCallback(async (force = false) => {
    if (inFlight.current) { if (force) loadAgain.current = true; return; }
    if (!force && Date.now() - lastStart.current < MIN_REFRESH_GAP_MS) return;
    inFlight.current = true;
    try {
      do {
        loadAgain.current = false;
        lastStart.current = Date.now();
        const list = stopsRef.current;
        if (!list.length) break;
        let failed: FailureKind | null = null;
        const loaded: Record<string, FavoriteBoard> = {};
        // Results are applied in batches: one re-render of Start per batch instead of one per stop.
        let pending: Record<string, (current: FavoriteBoard | undefined) => FavoriteBoard> = {};
        let flushTimer: ReturnType<typeof setTimeout> | null = null;
        const flush = () => {
          if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
          const updates = pending;
          pending = {};
          if (!Object.keys(updates).length) return;
          setBoards((current) => {
            const next = { ...current };
            for (const [id, update] of Object.entries(updates)) next[id] = update(current[id]);
            return next;
          });
        };
        const queue = (id: string, update: (current: FavoriteBoard | undefined) => FavoriteBoard) => {
          pending[id] = update;
          if (!flushTimer) flushTimer = setTimeout(flush, BOARD_UPDATE_BATCH_MS);
        };
        // At most a few requests at once, in favourites order: the first ones are ready first.
        await runLimited(list, MAX_PARALLEL_BOARDS, async (stop) => {
          try {
            const board = await loadFavoriteBoard(stop);
            const entry = { board, fetchedAt: Date.now() };
            loaded[stop.id] = entry;
            queue(stop.id, () => entry);
          } catch (error) {
            const kind = failureKind(error);
            failed = failed || kind;
            // Keep the last loaded departures, marked as no longer checked.
            queue(stop.id, (before) => ({ board: before?.board, fetchedAt: before?.fetchedAt, failure: kind, stale: Boolean(before?.board) }));
          }
        });
        flush();
        setRefreshFailure(failed);
        if (!failed) setUpdatedAt(Date.now());
        if (Object.keys(loaded).length) {
          const ids = list.map((stop) => stop.id);
          void AsyncStorage.setItem(FAVORITE_BOARDS_STORAGE_KEY, serializeFavoriteBoards({ ...boardsRef.current, ...loaded }, ids))
            .catch(() => { /* Storage is a convenience; the live view does not depend on it. */ });
        }
      } while (loadAgain.current);
    } finally {
      inFlight.current = false;
    }
  }, []);

  // Load when the set of favourite stops changes (also once favourites are read at startup).
  useEffect(() => { void refresh(true); }, [stopsKey, refresh]);

  const value = useMemo(() => ({ boards, refreshFailure, updatedAt, refresh, stopsKey }),
    [boards, refreshFailure, updatedAt, refresh, stopsKey]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useFavoritesLive(): FavoritesLiveValue {
  const value = useContext(Context);
  if (!value) throw Error("FavoritesLiveProvider ontbreekt");
  return value;
}
