/** Display-only: the original service/line stays unchanged in navigation and API calls. */
export function compactTrainLineLabel(line: string, carrier?: string): string {
  const original = String(line || "").trim();
  const match = /^(sprinter|sneltrein|stoptrein|intercity)(?=$|[\s-])/i.exec(original);
  if (!match) return original;

  const kind = match[1].toLowerCase();
  const suffix = original.slice(match[0].length).replace(/^[\s-]+/, "");
  // Explicit route codes from the feed take precedence over descriptive labels:
  // "Sneltrein RE1" -> "RE1", "Stoptrein RS1" -> "RS1".
  if (/^(RS|RE|IC)\d+(?:\b|$)/i.test(suffix)) return suffix;

  const regional = /arriva|blauwnet|rrreis|keolis/i.test(carrier || "");
  const short = kind === "sprinter" ? "SPR"
    : kind === "intercity" ? "IC"
    : kind === "stoptrein" ? (regional ? "RS" : "ST")
    : regional ? "RE" : "SN";

  return suffix ? short + " " + suffix : short;
}
