import type { DepartureItem, StopSummary } from "../types/api";

/**
 * Route params for opening a trip from a departure row. Position and planned
 * time let the trip page find the boarding stop when the trip feed uses a
 * different stop ID or name (e.g. train stations).
 */
export function ritParamsForDeparture(item: DepartureItem, boardStop: StopSummary): Record<string, string> & { id: string } {
  return {
    id: item.ritId || "", line: item.line, destination: item.destination,
    carrier: item.carrier || "", boardingName: boardStop.name,
    boardingId: boardStop.id,
    boardingLat: typeof boardStop.lat === "number" ? String(boardStop.lat) : "",
    boardingLon: typeof boardStop.lon === "number" ? String(boardStop.lon) : "",
    boardingTime: item.plannedTime || "",
    // /api/rit does not always report a cancellation that /api/halte reports.
    boardCancelled: item.cancelled === true ? "1" : ""
  };
}
