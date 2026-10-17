import type { Mode } from "../types/api";

/**
 * Badge colour per kind of transport. The feed has no colour per line, so metro
 * lines are red, trains yellow, ferries teal, and buses and trams blue.
 */
export const MODE_BADGE: Record<Mode, { bg: string; text: string }> = {
  metro: { bg: "#D7263D", text: "#FFFFFF" },
  train: { bg: "#FFC917", text: "#111111" },
  ferry: { bg: "#0B7A8F", text: "#FFFFFF" },
  tram: { bg: "#1767D2", text: "#FFFFFF" },
  bus: { bg: "#1767D2", text: "#FFFFFF" }
};

export function modeBadgeColors(mode: Mode | string | undefined): { bg: string; text: string } {
  return MODE_BADGE[(mode || "") as Mode] || MODE_BADGE.bus;
}
