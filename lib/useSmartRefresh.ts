import { useFocusEffect } from "expo-router";
import { useCallback, useRef } from "react";
import { AppState } from "react-native";

/**
 * Poll only while this route is focused AND Android is in the foreground.
 * Skip overlapping requests, and refresh after returning from the background
 * when the last scheduled refresh is already overdue.
 *
 * The screen retains responsibility for its initial fetch.
 */
export function useSmartRefresh(task: () => Promise<void>, intervalMs: number, key: string, enabled = true): void {
  const taskRef = useRef(task);
  taskRef.current = task;

  const lastRun = useRef(Date.now());
  const previousKey = useRef(key);
  if (previousKey.current !== key) {
    previousKey.current = key;
    lastRun.current = Date.now();
  }

  useFocusEffect(useCallback(() => {
    if (!enabled) return;
    let active = true;
    let inFlight = false;
    let previousState = AppState.currentState;

    const maybeRefresh = async () => {
      if (!active || AppState.currentState !== "active" || inFlight) return;
      const now = Date.now();
      if (now - lastRun.current < intervalMs) return;
      inFlight = true;
      lastRun.current = now;
      // Development builds only: makes automatic refreshes visible in the Metro log for testing.
      if (__DEV__) console.log("[OVbord] automatisch verversen", key);
      try {
        await taskRef.current();
      } catch (error) {
        if (__DEV__) console.warn("OVbord slim verversen mislukt", error);
      } finally {
        inFlight = false;
      }
    };

    void maybeRefresh();
    const timer = setInterval(() => { void maybeRefresh(); }, intervalMs);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && previousState !== "active") void maybeRefresh();
      previousState = state;
    });
    return () => {
      active = false;
      clearInterval(timer);
      subscription.remove();
    };
  }, [intervalMs, key, enabled]));
}
