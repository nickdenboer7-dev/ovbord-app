import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { boardLineFilterKey } from "../lib/boardLineFilters";
import { failureKind, stopBoardLoadError } from "../lib/offline";
import { loadJourneyStopBoard } from "../lib/stopBoardLookup";
import type { HalteBoardData, JourneyStop, Mode, StopSummary } from "../types/api";

/** initialLine: a board line filter key to preselect (e.g. when opening a favourite trip). */
export type FlowScreen = { key: number; stop: StopSummary; initialBoard?: HalteBoardData;
  initialLine?: string; returnTrip?: Record<string, string> & { id: string } };
export type ShowStopOptions = { line?: string; carrier?: string };
/** Boards stay mounted for instant Back; cap the stack so long trip↔stop chains do not grow memory forever. */
export const MAX_FLOW_SCREENS = 8;
type FlowContextValue = {
  screens: FlowScreen[];
  pendingStopName: string | null;
  pendingStopError: string | null;
  clearPendingError: () => void;
  showStop: (stop: StopSummary, options?: ShowStopOptions) => void;
  followJourneyStop: (stop: JourneyStop, mode: Mode, returnTrip?: Record<string, string> & { id: string }) => void;
  back: () => void;
  close: () => void;
  /** Close the boards and open the search on Start (the search bar on a board). */
  requestSearch: () => void;
  /** Goes up by one for every request; Start opens its search when it changes. */
  searchRequest: number;
};
const Context = createContext<FlowContextValue | undefined>(undefined);
let nextScreenKey = 0;

export function FlowNavigationProvider({ children }: { children: React.ReactNode }) {
  const [screens, setScreens] = useState<FlowScreen[]>([]);
  const [pendingStopName, setPendingStopName] = useState<string | null>(null);
  const [pendingStopError, setPendingStopError] = useState<string | null>(null);
  const pendingSequence = useRef(0);
  const cancelPending = useCallback(() => {
    pendingSequence.current += 1;
    setPendingStopName(null);
    setPendingStopError(null);
  }, []);
  const showStop = useCallback((stop: StopSummary, options?: ShowStopOptions) => {
    cancelPending();
    const initialLine = options?.line ? boardLineFilterKey(options.line, options.carrier) : undefined;
    setScreens([{ key: ++nextScreenKey, stop, initialLine }]);
  }, [cancelPending]);
  const followJourneyStop = useCallback((stop: JourneyStop, mode: Mode, returnTrip?: Record<string, string> & { id: string }) => {
    if (!stop.name) return;
    const sequence = ++pendingSequence.current;
    setPendingStopError(null);
    setPendingStopName(stop.name);
    // Keep the current trip and its FlatList visible until this stop board has arrived.
    void (async () => {
      try {
        const board = await loadJourneyStopBoard(stop);
        if (sequence !== pendingSequence.current) return;
        setScreens((previous) => {
          if (sequence !== pendingSequence.current) return previous;
          // A fresh journey link must be added even when this stop is already open.
          // Back from that new screen returns to the selected trip, not another board.
          if (!returnTrip && previous.length && previous[previous.length - 1].stop.id === board.stop.id) return previous;
          return [...previous, { key: ++nextScreenKey, stop: { ...board.stop, mode: board.stop.mode || mode }, initialBoard: board, returnTrip }]
            .slice(-MAX_FLOW_SCREENS);
        });
        setPendingStopError(null);
      } catch (error) {
        if (sequence === pendingSequence.current) setPendingStopError(stopBoardLoadError(stop.name, failureKind(error)));
      } finally {
        if (sequence === pendingSequence.current) setPendingStopName(null);
      }
    })();
  }, []);
  const back = useCallback(() => { cancelPending(); setScreens((previous) => previous.slice(0, -1)); }, [cancelPending]);
  const close = useCallback(() => { cancelPending(); setScreens([]); }, [cancelPending]);
  const clearPendingError = useCallback(() => setPendingStopError(null), []);
  const [searchRequest, setSearchRequest] = useState(0);
  const requestSearch = useCallback(() => { cancelPending(); setScreens([]); setSearchRequest((n) => n + 1); }, [cancelPending]);
  const value = useMemo(() => ({ screens, pendingStopName, pendingStopError, clearPendingError, showStop, followJourneyStop, back, close, requestSearch, searchRequest }),
    [screens, pendingStopName, pendingStopError, clearPendingError, showStop, followJourneyStop, back, close, requestSearch, searchRequest]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useFlowNavigation() {
  const value = useContext(Context);
  if (!value) throw Error("FlowNavigationProvider ontbreekt");
  return value;
}
