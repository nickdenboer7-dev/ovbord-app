import type { HalteBoardData } from "../types/api";
import { getHalte, searchStops } from "./api";
import { BOARDING_MATCH_RADIUS_M, distanceMeters } from "./boardingMatch";
import { failureKind } from "./offline";

const normalize = (value: string) => value.toLocaleLowerCase("nl").replace(/\s+/g, " ").trim();

/**
 * Departure board for a stop from a trip timeline. Trip feeds may use a local
 * stop ID or another name for a station ("Utrecht Centraal" vs "Utrecht,
 * Centraal Station"): then the stop is found by name, or the nearest search
 * result within a station radius.
 */
export async function loadJourneyStopBoard(stop: { id?: string; name: string; lat?: number; lon?: number }): Promise<HalteBoardData> {
  try {
    if (!stop.id || /^\d{1,3}$/.test(stop.id)) throw Error("Geen publieke halte-ID");
    return await getHalte(stop.id);
  } catch (firstError) {
    // Offline, a name search cannot help either.
    if (failureKind(firstError) === "offline") throw firstError;
    const matches = await searchStops(stop.name);
    const found = matches.find((match) => normalize(match.name) === normalize(stop.name)) ||
      matches
        .map((match) => ({ match, d: distanceMeters(stop, match) }))
        .filter((candidate) => candidate.d <= BOARDING_MATCH_RADIUS_M)
        .sort((a, b) => a.d - b.d)[0]?.match;
    if (!found) throw firstError;
    return await getHalte(found.id);
  }
}
