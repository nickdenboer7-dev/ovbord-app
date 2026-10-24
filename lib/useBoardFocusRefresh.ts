import { useCallback, useRef } from "react";
import { useFocusEffect } from "expo-router";
import { AppState } from "react-native";

/** Initial fetch is owned by the board; every subsequent focus/resume refreshes immediately. */
export function useBoardFocusRefresh(task: () => Promise<void>, stopId: string, enabled: boolean): void {
  const latest = useRef(task); latest.current = task;
  const previousStop = useRef<string | null>(null);
  useFocusEffect(useCallback(() => {
    if (!enabled) return;
    if (previousStop.current === stopId) void latest.current();
    previousStop.current = stopId;
    let previousState = AppState.currentState;
    const subscription = AppState.addEventListener("change", next => {
      if (next === "active" && previousState !== "active") void latest.current();
      previousState = next;
    });
    return () => subscription.remove();
  }, [stopId, enabled]));
}
