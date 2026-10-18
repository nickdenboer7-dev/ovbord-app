import * as Location from "expo-location";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { decideLiveFix, MOVEMENT_REFRESH_METERS } from "./liveLocation";
import { bepaalLocatie, LocatieFout, type LocatieFoutCode, type LocatieResultaat } from "./location";

export type LiveLocationSnapshot = {
  coords: { latitude: number; longitude: number } | null;
  bron: LocatieResultaat["bron"] | null;
  fixAt: number | null;
  loading: boolean;
  errorCode: LocatieFoutCode | null;
  /** Bumps only on a fix worth acting on: the first one, a move of ~150m, or an upgrade from a
   *  last-known read to a live GPS one. Screens refetch nearby stops on this, not on every GPS tick. */
  refreshToken: number;
};

const initialSnapshot: LiveLocationSnapshot = {
  coords: null, bron: null, fixAt: null, loading: true, errorCode: null, refreshToken: 0
};

/**
 * Foreground-only live location (V5.8.1), shared logic for Start and Buurtbord.
 *
 * - Tracks GPS with expo-location's watchPositionAsync while `enabled` and the screen is focused,
 *   with a ~150m distanceInterval so movement below that does not even reach JS.
 * - Asks for a fresh fix on mount, on regaining focus, and on returning from the background
 *   ("bij openen, terugkeren naar het tabblad en hervatten van de app").
 * - Only foreground permissions are ever requested; the watch is torn down the moment the app
 *   leaves the foreground and restarted on return, so no background location access is used.
 * - A manually chosen city should pass enabled=false: GPS is left alone entirely until the
 *   caller turns this back on ("Gebruik GPS").
 */
export function useLiveLocation(enabled: boolean): LiveLocationSnapshot & { requestFresh: () => void } {
  const [state, setState] = useState<LiveLocationSnapshot>(initialSnapshot);
  const stateRef = useRef(state);
  stateRef.current = state;
  const lastUsedCoords = useRef<{ latitude: number; longitude: number } | null>(null);
  const requestSeq = useRef(0);

  // Re-arm when the screen is disabled (manual city chosen) so a later "Gebruik GPS" starts clean.
  useEffect(() => {
    if (!enabled) { lastUsedCoords.current = null; setState(initialSnapshot); }
  }, [enabled]);

  const applyFix = useCallback((result: LocatieResultaat) => {
    const current = stateRef.current;
    const currentFix = current.fixAt !== null && current.bron ? { fixAt: current.fixAt, bron: current.bron } : null;
    const { accept, refresh: shouldBump } = decideLiveFix(currentFix, lastUsedCoords.current,
      { fixAt: result.fixAt, bron: result.bron, coords: result.coords });
    if (!accept) return;
    if (shouldBump) lastUsedCoords.current = result.coords;
    // Keep the ref in step at once, so a second fix arriving before the re-render compares correctly.
    stateRef.current = { ...current, coords: result.coords, bron: result.bron, fixAt: result.fixAt };
    setState((previous) => ({
      coords: result.coords, bron: result.bron, fixAt: result.fixAt, loading: false, errorCode: null,
      refreshToken: shouldBump ? previous.refreshToken + 1 : previous.refreshToken
    }));
  }, []);

  const requestFresh = useCallback(() => {
    const seq = ++requestSeq.current;
    setState((previous) => (previous.coords ? previous : { ...previous, loading: true }));
    void bepaalLocatie({ fallbackToExample: false, preferFresh: true })
      .then((result) => { if (seq === requestSeq.current) applyFix(result); })
      .catch((error: unknown) => {
        if (seq !== requestSeq.current) return;
        setState((previous) => ({
          ...previous, loading: false,
          errorCode: error instanceof LocatieFout ? error.code : previous.errorCode
        }));
      });
  }, [applyFix]);

  useFocusEffect(useCallback(() => {
    if (!enabled) return;
    let cancelled = false;
    let watchSub: Location.LocationSubscription | null = null;

    const startWatch = async () => {
      try {
        const permission = await Location.getForegroundPermissionsAsync();
        if (cancelled || !permission.granted) return;
        watchSub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: MOVEMENT_REFRESH_METERS, timeInterval: 20000 },
          (position) => {
            if (cancelled) return;
            applyFix({ coords: position.coords, bron: "gps", fixAt: position.timestamp });
          }
        );
      } catch (error) {
        if (__DEV__) console.warn("Live locatie volgen mislukt", error);
      }
    };

    requestFresh();
    void startWatch();

    let previousAppState: AppStateStatus = AppState.currentState;
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active" && previousAppState !== "active") {
        requestFresh();
        void startWatch();
      } else if (next !== "active" && previousAppState === "active") {
        // Foreground-only (requirement 8): stop watching the moment the app backgrounds.
        watchSub?.remove();
        watchSub = null;
      }
      previousAppState = next;
    });

    return () => {
      cancelled = true;
      watchSub?.remove();
      subscription.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]));

  return { ...state, requestFresh };
}
