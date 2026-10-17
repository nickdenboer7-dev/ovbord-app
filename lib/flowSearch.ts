import type { StopSummary } from "../types/api";

// Show locally saved matches before waiting for the network.
function normalizeTerm(value: string): string {
  return value.toLocaleLowerCase("nl").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

/** Explicit Dutch station aliases and a few frequent misspellings. */
const SEARCH_ALIASES: Record<string, string> = {
  "utrecht cs": "Utrecht Centraal",
  "utrecht centraal station": "Utrecht Centraal",
  "amsterdam cs": "Amsterdam Centraal",
  "amsterdam centraal station": "Amsterdam Centraal",
  "rotterdam cs": "Rotterdam Centraal",
  "rotterdam centraal station": "Rotterdam Centraal",
  "den haag cs": "Den Haag Centraal",
  "den haag centraal station": "Den Haag Centraal",
  "groningen cs": "Groningen",
  "leeuwarden cs": "Leeuwarden",
  "utrect": "Utrecht",
  "amsterdm": "Amsterdam",
  "leeuwrden": "Leeuwarden"
};

export function resolveSearchTerm(value: string): string {
  return SEARCH_ALIASES[normalizeTerm(value)] || value.trim();
}

/** Rank remote matches only; favorite/recent results retain their priority. */
export function rankSearchStops(stops: readonly StopSummary[], query: string): StopSummary[] {
  const term = normalizeTerm(query);
  const rank = (stop: StopSummary): number => {
    const name = normalizeTerm(stop.name);
    const city = normalizeTerm(stop.city || "");
    const withoutCity = city && name.startsWith(city + " ") ? name.slice(city.length + 1) : name;
    if (name === term || withoutCity === term) return 0;
    if (city === term) return 1;
    if (name.startsWith(term)) return 2;
    if (withoutCity.startsWith(term)) return 3;
    if (name.includes(term) || withoutCity.includes(term)) return 4;
    return 5;
  };
  return [...stops].sort((a, b) => rank(a) - rank(b));
}

export function searchSavedStops(favorites: readonly StopSummary[], recents: readonly StopSummary[], query: string): StopSummary[] {
  const term = normalizeTerm(query);
  if (!term) return [];
  const seen = new Set<string>();
  return [...favorites, ...recents].filter((stop) => {
    if (seen.has(stop.id)) return false;
    seen.add(stop.id);
    return normalizeTerm([stop.name, stop.city].filter(Boolean).join(" ")).includes(term);
  });
}

export function mergeStopResults(saved: readonly StopSummary[], online: readonly StopSummary[]): StopSummary[] {
  const seenId = new Set<string>();
  const seenName = new Set<string>();
  return [...saved, ...online].filter((stop) => {
    if (seenId.has(stop.id)) return false;
    const nameKey = normalizeTerm([stop.name, stop.city].filter(Boolean).join(" "));
    if (nameKey && seenName.has(nameKey)) return false;
    seenId.add(stop.id);
    if (nameKey) seenName.add(nameKey);
    return true;
  });
}
