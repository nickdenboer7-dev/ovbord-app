import * as Location from "expo-location";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { decideLiveFix, MOVEMENT_REFRESH_METERS } from "./liveLocation";
import { bepaalLocatie, LocatieFout, type LocatieFoutCode, type LocatieResultaat } from "./location";
import { hydrateNearbyCache, peekLastLocation, rememberLocation } from "./nearbyCache";

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

/** Foreground-only recovery: retry an aging fix every 20s, use precise GPS after one minute. */
export const LIVE_HEARTBEAT_MS = 20000;
export const LIVE_PRECISE_AFTER_MS = 60000;

/**
 * V5.9: the location permission dialog is shown at most once per app session by automatic
 * triggers (first open of Start or Buurtbord). Tab switches, resuming the app and the heartbeat
 * never ask again; only an explicit tap ("GPS opnieuw proberen", "Gebruik GPS", pull to refresh)
 * may show it once more. Shared between both screens so switching tabs never re-prompts.
 */
let permissionAskedThisSession = false;
export function resetLivePermissionSessionForTests(): void { permissionAskedThisSession = false; }

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
  const [state, setState] = useState<LiveLocationSnapshot>(() => {
    const cached = enabled ? peekLastLocation() : null;
    return cached ? { ...initialSnapshot, coords: cached.coords, bron: cached.bron, fixAt: cached.fixAt, loading: false, refreshToken: 1 } : initialSnapshot;
  });
  const stateRef = useRef(state);
  stateRef.current = state;
  const lastUsedCoords = useRef<{ latitude: number; longitude: number } | null>(null);
  const requestSeq = useRef(0);
  /** Starts the watch from outside the focus effect (after a fix), a no-op when not focused. */
  const kickWatch = useRef<() => void>(() => {});

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
    rememberLocation(result);
    if (shouldBump) lastUsedCoords.current = result.coords;
    // Keep the ref in step at once, so a second fix arriving before the re-render compares correctly.
    stateRef.current = { ...current, coords: result.coords, bron: result.bron, fixAt: result.fixAt };
    setState((previous) => ({
      coords: result.coords, bron: result.bron, fixAt: result.fixAt, loading: false, errorCode: null,
      refreshToken: shouldBump ? previous.refreshToken + 1 : previous.refreshToken
    }));
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void hydrateNearbyCache().then(() => {
      const cached = peekLastLocation();
      if (active && cached && (!stateRef.current.coords || cached.fixAt > (stateRef.current.fixAt || 0))) applyFix(cached);
    });
    return () => { active = false; };
  }, [enabled, applyFix]);

  /** ask: only for an explicit user action; automatic reads never show the permission dialog. */
  const readFresh = useCallback((ask: boolean) => {
    const seq = ++requestSeq.current;
    setState((previous) => (previous.coords ? previous : { ...previous, loading: true }));
    const precise = ask || stateRef.current.fixAt === null ||
      Date.now() - stateRef.current.fixAt > LIVE_PRECISE_AFTER_MS;
    void bepaalLocatie({ fallbackToExample: false, preferFresh: true, askPermission: ask, preferPrecise: precise })
      .then((result) => {
        if (seq !== requestSeq.current) return;
        applyFix(result);
        // Permission may have been granted just now (a retry tap): start following at once.
        kickWatch.current();
      })
      .catch((error: unknown) => {
        if (seq !== requestSeq.current) return;
        setState((previous) => ({
          ...previous, loading: false,
          errorCode: error instanceof LocatieFout ? error.code : previous.errorCode
        }));
      });
  }, [applyFix]);
  const requestFresh = useCallback(() => readFresh(true), [readFresh]);

  useFocusEffect(useCallback(() => {
    if (!enabled) return;
    let cancelled = false;
    let watchSub: Location.LocationSubscription | null = null;

    let starting = false;
    const startWatch = async () => {
      if (cancelled || starting || watchSub || AppState.currentState !== "active") return;
      starting = true;
      try {
        const permission = await Location.getForegroundPermissionsAsync();
        if (cancelled || !permission.granted || AppState.currentState !== "active") return;
        const sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: MOVEMENT_REFRESH_METERS, timeInterval: 20000 },
          (position) => {
            if (cancelled || AppState.currentState !== "active") return;
            applyFix({ coords: position.coords, bron: "gps", fixAt: position.timestamp });
          }
        );
        if (cancelled || AppState.currentState !== "active") sub.remove();
        else if (watchSub) sub.remove(); // concurrent activation must never create duplicate watches
        else watchSub = sub;
      } catch (error) {
        if (__DEV__) console.warn("Live locatie volgen mislukt", error);
      } finally {
        starting = false;
      }
    };

    kickWatch.current = () => { void startWatch(); };

    // Permission first, then the fresh read and the watch: on the very first consent the watch
    // used to check permission while the dialog was still open, and then never started.
    const activate = async () => {
      try {
        const current = await Location.getForegroundPermissionsAsync();
        if (!current.granted && current.canAskAgain && !permissionAskedThisSession) {
          permissionAskedThisSession = true;
          await Location.requestForegroundPermissionsAsync();
        }
      } catch (error) {
        if (__DEV__) console.warn("Locatietoestemming niet beschikbaar", error);
      }
      if (cancelled || AppState.currentState !== "active") return;
      readFresh(false); // never a second dialog right after the first
      void startWatch();
    };
    void activate();
    // If Android suppresses distance callbacks, retry within 20s. When the
    // last fix is more than a minute old, the one-shot read switches to High accuracy.
    // This is foreground-only; no background tracking or additional permission prompts.
    const heartbeat = setInterval(() => {
      if (cancelled || AppState.currentState !== "active") return;
      // Half the interval: also retry an aging fix instead of waiting minutes for movement.
      if (stateRef.current.fixAt === null || Date.now() - stateRef.current.fixAt > LIVE_HEARTBEAT_MS / 2) readFresh(false);
      if (!watchSub) void startWatch();
    }, LIVE_HEARTBEAT_MS);

    let previousAppState: AppStateStatus = AppState.currentState;
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active" && previousAppState !== "active") {
        void activate();
      } else if (next !== "active" && previousAppState === "active") {
        // Foreground-only: stop listening immediately when the app is backgrounded.
        watchSub?.remove();
        watchSub = null;
      }
      previousAppState = next;
    });

    return () => {
      cancelled = true;
      kickWatch.current = () => {};
      watchSub?.remove();
      clearInterval(heartbeat);
      subscription.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]));

  return { ...state, requestFresh };
}
