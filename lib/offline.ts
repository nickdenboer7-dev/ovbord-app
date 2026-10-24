export type FailureKind = "offline" | "server";

/**
 * A request that never reached the server (no internet, Wi-Fi switch, flight
 * mode) is "offline"; anything else — timeouts, HTTP errors, bad data — is
 * "server". Duck-typed on the RequestFailure produced by lib/api.ts.
 */
export function failureKind(error: unknown): FailureKind {
  const failure = error as { name?: string; network?: boolean } | null;
  return failure && failure.name === "RequestFailure" && failure.network === true ? "offline" : "server";
}

/** "HH:MM" in Amsterdam time, or "" for an unknown moment. */
export function clockLabel(ms: number | null | undefined): string {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit", hour12: false
  }).formatToParts(new Date(ms));
  const h = parts.find((p) => p.type === "hour")?.value, m = parts.find((p) => p.type === "minute")?.value;
  return h && m ? h + ":" + m : "";
}

/** Banner on a stop board whose refresh failed; the shown times are no longer being checked. */
export function boardRefreshNotice(kind: FailureKind, lastUpdatedMs: number | null): string {
  const at = clockLabel(lastUpdatedMs);
  return kind === "offline"
    ? "Geen verbinding · laatst bijgewerkt" + (at ? " om " + at : " op een onbekend tijdstip")
    : "Verversen mislukt · laatst geladen tijden" + (at ? " (" + at + ")" : "") + " blijven zichtbaar";
}

/** Line under the trip page when a refresh failed but earlier data is shown. */
export function ritRefreshNotice(kind: FailureKind, lastUpdatedMs: number | null): string {
  const at = clockLabel(lastUpdatedMs);
  return kind === "offline"
    ? "Geen internet · ritgegevens" + (at ? " van " + at : "") + ". OVbord ververst automatisch zodra er weer verbinding is."
    : "Ritgegevens tijdelijk niet beschikbaar · laatst opgehaald" + (at ? " om " + at : "") + ".";
}

/** Trip page without any data to show. */
export function ritUnavailableMessage(kind: FailureKind | null): string {
  if (kind === "offline") return "Je bent offline. Dit ritverloop is nog niet op dit toestel geladen.";
  if (kind === "server") return "Ritgegevens tijdelijk niet beschikbaar.";
  return "Geen gegevens beschikbaar";
}

function ageText(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return s < 60 ? s + " sec geleden" : Math.round(s / 60) + " min geleden";
}

/**
 * Position line on the trip page. When the last refresh failed, a GPS fix that
 * was fresh is presented as "last known" instead of "live": OVbord can no longer
 * confirm it.
 */
export function ritPositionText(input: {
  ended: boolean; gpsFresh: boolean; gpsAgeSeconds?: number; estimated?: boolean; lastKnown: boolean;
}): string {
  if (input.ended) return "Rit beëindigd";
  const age = input.gpsAgeSeconds;
  if (input.gpsFresh && typeof age === "number") {
    return input.lastKnown ? "Laatst bekende GPS · " + ageText(age) : "Live GPS · " + Math.round(age) + " sec geleden";
  }
  if (typeof age === "number" && age >= 45) return "GPS niet actueel · positie niet bevestigd";
  if (input.estimated) return "Geschatte positie · geen live GPS";
  return "GPS-positie niet bevestigd";
}

/**
 * While refreshing fails, a countdown is an estimate from the last known time:
 * "over 3 min" becomes "± 3 min" (and "nu" becomes "± nu").
 */
export function staleCountdown(countdown: string): string {
  const match = /^over (\d+) min$/.exec(countdown.trim());
  if (match) return "± " + match[1] + " min";
  return countdown.trim() === "nu" ? "± nu" : countdown;
}

/** Trip status chip: a live claim becomes "Laatst: …" once it can no longer be confirmed. */
export function lastKnownStatus(status: string, lastKnown: boolean): string {
  if (!lastKnown || (status !== "Onderweg" && status !== "Bij halte")) return status;
  return "Laatst: " + status.charAt(0).toLocaleLowerCase("nl") + status.slice(1);
}

/** Summary line for the next stop on the trip page. */
export function nextStopSummary(input: { lastKnown: boolean; isBoarding: boolean; name: string }): string {
  if (input.lastKnown) {
    return input.isBoarding ? "Laatst bekend: jouw halte was de volgende" : "Laatst bekend: volgende halte " + input.name;
  }
  return input.isBoarding ? "Jouw halte is de volgende" : "Volgende halte · " + input.name;
}

/** "Haltes in de buurt" on Start when the list could not be loaded at all. */
export function nearbyUnavailableMessage(kind: FailureKind): string {
  return kind === "offline"
    ? "Je bent offline. Haltes in de buurt laden zodra er weer verbinding is."
    : "Haltes ophalen is mislukt. Probeer het opnieuw.";
}

/** Notice above a list that stays visible after its refresh failed. */
export function listRefreshNotice(kind: FailureKind, lastUpdatedMs: number | null): string {
  const at = clockLabel(lastUpdatedMs);
  return kind === "offline"
    ? "Geen internet · lijst" + (at ? " van " + at : "") + " niet ververst"
    : "Verversen mislukt · lijst" + (at ? " van " + at : "") + " blijft zichtbaar";
}

/** A stop board opened from a trip page could not be loaded. */
export function stopBoardLoadError(stopName: string, kind: FailureKind): string {
  return kind === "offline"
    ? "Geen internet · vertrektijden voor " + stopName + " niet geladen."
    : "Vertrektijden voor " + stopName + " konden niet worden geladen.";
}
