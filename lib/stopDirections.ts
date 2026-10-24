import type { HalteBoardData, StopSummary } from "../types/api";
import { departurePresentation } from "./departurePresentation";
import { distanceMeters } from "./boardingMatch";
import { departureTimeRemainingMs, sortBoardDepartures } from "./boardSmartness";

const normalize = (s: string) => s.toLocaleLowerCase("nl").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g," ").trim();
/** Only explicit API platforms, or same-name nearby quays. Their boards stay separate. */
export function directionStops(stop: StopSummary, nearby: readonly StopSummary[] = []): StopSummary[] {
  const area = nearby.find(s => s.id === stop.id || s.variants?.some(v => v.id === stop.id)) ||
    nearby.find(s => normalize(s.name) === normalize(stop.name) && distanceMeters(s,stop) <= 200);
  const members = stop.variants?.length ? stop.variants : area?.variants?.length ? area.variants : [stop];
  return members.filter((s,i,all) => s.id && s.id !== "unknown" && all.findIndex(v => v.id === s.id) === i);
}
export function directionDescription(board: HalteBoardData | undefined, now: number): { label: string; next?: string } {
  if (!board) return { label: "Richting nog niet beschikbaar" };
  const rows = sortBoardDepartures(board.departures.filter(d => !d.cancelled && !d.departed && (departureTimeRemainingMs(d,now) ?? -1) >= 0),now);
  const counts = new Map<string, { name: string; count: number }>();
  for (const row of rows) {
    const key = normalize(row.destination); if (!key) continue;
    const before = counts.get(key); counts.set(key,{ name:row.destination,count:(before?.count || 0)+1 });
  }
  const names = [...counts.values()].sort((a,b)=>b.count-a.count).slice(0,2).map(d=>d.name);
  return { label:names.length ? "Richting " + names.join(" / ") : "Geen komende vertrekken", next:rows[0] ? departurePresentation(rows[0],now).clock : undefined };
}
