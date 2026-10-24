import type { DepartureItem } from "../types/api";
import { departurePresentation } from "./departurePresentation";
import { staleCountdown } from "./offline";
import { departureCountdown } from "./format";

/**
 * One calm departure row (V5.4 "Rustig"): a large time, the line, the destination
 * and one status line such as "Live · over 2 min" or "Gepland · over 8 min".
 */
export type DepartureTone = "live" | "planned" | "estimated" | "stale" | "cancelled" | "departed" | "muted";
export type DepartureLineStatus = { tone: DepartureTone; text: string };

function joined(...parts: (string | undefined | null | false)[]): string {
  return parts.filter((part): part is string => Boolean(part)).join(" · ");
}

/**
 * Status line under the destination. Only a fresh live feed says "Live"; after a
 * failed refresh (stale) the countdown becomes an estimate ("± 4 min").
 */
export function departureLineStatus(item: DepartureItem, nowMs: number, options: {
  stale?: boolean; tooTight?: boolean; platform?: boolean; note?: string;
} = {}): DepartureLineStatus {
  const { cancelled } = departurePresentation(item, nowMs);
  const countdown = departureCountdown(item, nowMs, 180);
  const platform = options.platform !== false && item.platform
    ? (item.mode === "train" ? "spoor " : "perron ") + item.platform : "";
  if (cancelled) return { tone: "cancelled", text: joined("Rijdt niet", platform) };
  if (item.departed === true) return { tone: "departed", text: "Vertrokken" };
  if (options.stale) return { tone: "stale", text: joined("Laatst bekend", staleCountdown(countdown), platform, options.note) };
  if (item.liveDataStale === true) return { tone: "stale", text: joined("Live-info oud", staleCountdown(countdown), platform, options.note) };
  if (options.tooTight) return { tone: "muted", text: joined("Te krap om te lopen", platform) };
  const estimated = item.reliabilityDetail?.estimatedPosition === true ||
    (item.isLive === undefined && Boolean(item.expectedTime && item.expectedTime !== item.plannedTime));
  const tone: DepartureTone = estimated ? "estimated" : item.isLive === true ? "live" : "planned";
  const label = estimated ? "Geschat" : item.isLive === true ? "Live" : "Gepland";
  return { tone, text: joined(label, countdown, platform, options.note) };
}

/** "+3 min" (late) or "−1 min" (early) under the time; nothing for cancelled or departed trips. */
export function departureDelayLabel(item: DepartureItem): { text: string; late: boolean } | null {
  if (item.cancelled === true || item.departed === true) return null;
  const delay = item.delayMinutes;
  if (typeof delay !== "number" || !Number.isFinite(delay) || Math.abs(delay) < 1) return null;
  return delay > 0 ? { text: "+" + Math.round(delay) + " min", late: true } : { text: "−" + Math.round(Math.abs(delay)) + " min", late: false };
}

/** What a screen reader says for one row. */
export function departureLineLabel(item: DepartureItem, nowMs: number, status: DepartureLineStatus, opensTrip: boolean): string {
  const { clock } = departurePresentation(item, nowMs);
  const delay = departureDelayLabel(item);
  const delayText = delay ? (delay.late ? ", " + delay.text.slice(1) + " vertraging" : ", " + delay.text.slice(1) + " eerder") : "";
  return "Lijn " + item.line + " naar " + item.destination + ", " + clock + delayText + ", " +
    status.text.toLocaleLowerCase("nl") + (opensTrip ? ", ritverloop openen" : "");
}

/**
 * Big text on the right of a row (OVinfo style): "2 min", "nu", or the clock when
 * the departure is more than an hour away. Last-known times get "±".
 */
export function departureRightText(item: DepartureItem, nowMs: number, options: { stale?: boolean; tooTight?: boolean } = {}):
  { text: string; tone: "normal" | "cancelled" | "departed" | "stale" | "muted" } {
  const { cancelled, clock, countdown } = departurePresentation(item, nowMs);
  if (cancelled) return { text: "Rijdt niet", tone: "cancelled" };
  if (item.departed === true) return { text: "Vertrokken", tone: "departed" };
  const minutes = /^over (\d+) min$/.exec(countdown.trim());
  const short = minutes ? minutes[1] + " min" : countdown.trim() === "nu" ? "nu" : clock;
  if (options.stale || item.liveDataStale === true) {
    return { text: minutes || countdown.trim() === "nu" ? "± " + short : short, tone: "stale" };
  }
  return { text: short, tone: options.tooTight ? "muted" : "normal" };
}

/** Small line under the destination: "09:44 +3 · spoor 5". */
export function departureSubParts(item: DepartureItem, nowMs: number, note?: string): { clock: string; delay: string; late: boolean; rest: string } {
  const { clock } = departurePresentation(item, nowMs);
  const delay = departureDelayLabel(item);
  const platform = item.platform ? (item.mode === "train" ? "spoor " : "perron ") + item.platform : "";
  return { clock, delay: delay ? delay.text.replace(" min", "") : "", late: Boolean(delay?.late), rest: joined(platform, note) };
}

/** Live icon next to the destination: only a confirmed, current live time. */
export function showsLive(item: DepartureItem, stale = false): boolean {
  return item.isLive === true && !stale && item.liveDataStale !== true && item.cancelled !== true && item.departed !== true;
}
