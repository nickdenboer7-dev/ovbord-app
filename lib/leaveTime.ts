import type { DepartureItem } from "../types/api";
import { departureTimeRemainingMs } from "./boardSmartness";
import { distanceMeters } from "./boardingMatch";
import { departurePresentation } from "./departurePresentation";

/** 4.5 km/h = 75 m/min, with a 1.3 detour factor for streets. */
export const WALK_METERS_PER_MINUTE = 75;
export const WALK_DETOUR_FACTOR = 1.3;
/** Walking minutes to a stop; null without both positions. */
export function walkMinutesTo(from: { lat?: number; lon?: number } | null, to: { lat?: number; lon?: number }): number | null {
  if (!from) return null;
  const meters = distanceMeters(from, to);
  if (!Number.isFinite(meters)) return null;
  return Math.ceil(meters * WALK_DETOUR_FACTOR / WALK_METERS_PER_MINUTE);
}

/** A cautious label, calculated against the same expected time as the departure row. */
export function walkingDepartureAdvice(item: DepartureItem, from: {lat:number;lon:number}|null,
  stop: {lat?:number;lon?:number}, nowMs: number): {text:string;tight:boolean;label:string}|null {
  if (item.cancelled || item.departed || item.liveDataStale) return null;
  const walk=walkMinutesTo(from,stop), ms=departureTimeRemainingMs(item,nowMs);
  if(walk===null || ms===null || ms<0)return null;
  const minutes=Math.ceil(ms/60000), tight=ms/60000-walk<3;
  return {text:walk+" min lopen · vertrekt over "+minutes+" min",tight,label:tight?"Krap":"Haalbaar"};
}

/**
 * "6 min lopen · vertrek over 4 min" for the first departure the user can still
 * reach on foot. Cancelled and departed trips are skipped; when the first one is
 * too tight, the advice names the next one.
 */
export function leaveAdvice(rows: readonly DepartureItem[], walkMinutes: number | null, nowMs: number): { text: string; tight: boolean } | null {
  if (walkMinutes === null) return null;
  if (walkMinutes === 0) return { text: "Je bent bij de halte", tight: false };
  const candidates = rows
    .filter((item) => item.cancelled !== true && item.departed !== true)
    .map((item) => ({ item, ms: departureTimeRemainingMs(item, nowMs) }))
    .filter((entry): entry is { item: DepartureItem; ms: number } => entry.ms !== null);
  if (!candidates.length) return null;
  const walk = walkMinutes + " min lopen";
  const leaveIn = (ms: number) => Math.floor(ms / 60000 - walkMinutes);
  const when = (minutes: number) => minutes <= 0 ? "vertrek nu" : "vertrek over " + minutes + " min";
  const first = candidates[0];
  if (leaveIn(first.ms) >= 0) return { text: walk + " · " + when(leaveIn(first.ms)), tight: false };
  const next = candidates.find((entry) => leaveIn(entry.ms) >= 0);
  const firstClock = departurePresentation(first.item, nowMs).clock;
  if (!next) return { text: walk + " · te krap voor " + firstClock, tight: true };
  return { text: walk + " · te krap voor " + firstClock + ", " + when(leaveIn(next.ms)) + " voor " +
    departurePresentation(next.item, nowMs).clock, tight: true };
}
