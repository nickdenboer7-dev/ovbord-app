import type { Mode } from "../types/api";

export type VehicleIconName = "bus" | "train" | "subway" | "boat";

/** Ionicons glyph for the vehicle on the trip page. Unknown modes fall back to bus. */
export function vehicleIcon(mode: Mode | string | undefined): VehicleIconName {
  switch (mode) {
    case "train": return "train";
    case "tram": return "train";
    case "metro": return "subway";
    case "ferry": return "boat";
    default: return "bus";
  }
}

/** Dutch noun for spoken/accessibility text, e.g. "Tram tussen deze halte en de volgende". */
export function vehicleNoun(mode: Mode | string | undefined): string {
  switch (mode) {
    case "train": return "Trein";
    case "tram": return "Tram";
    case "metro": return "Metro";
    case "ferry": return "Veerboot";
    default: return "Bus";
  }
}
