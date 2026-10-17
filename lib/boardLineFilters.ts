import type { DepartureItem } from "../types/api";
import { compactTrainLineLabel } from "./trainLineLabel";

/** Filter labels match the short badges; the underlying API trip/line stays intact. */
export function boardLineFilterKey(line: string, carrier?: string): string {
  return compactTrainLineLabel(String(line || ""), carrier);
}

export function boardLineFilterChoices(rows: readonly DepartureItem[]): string[] {
  return [...new Set(rows.map(row => boardLineFilterKey(row.line, row.carrier)))]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "nl", { numeric: true }));
}

export function matchesBoardLineFilter(
  row: Pick<DepartureItem, "line" | "carrier">, selected: string | null
): boolean {
  return selected === null || boardLineFilterKey(row.line, row.carrier) === selected;
}
