import { Mode } from "../types/api";

export const vervoerderColors: Record<string, { bg: string; text: string }> = {
  NS: { bg: "#ffc917", text: "#111111" },
  GVB: { bg: "#009fe3", text: "#FFFFFF" },
  RET: { bg: "#e6007e", text: "#FFFFFF" },
  Arriva: { bg: "#d92b2b", text: "#FFFFFF" },
  HTM: { bg: "#2a9d55", text: "#FFFFFF" },
  Qbuzz: { bg: "#7a2cff", text: "#FFFFFF" },
  Default: { bg: "#495057", text: "#FFFFFF" }
};

export const modaliteitColors: Record<Mode, string> = {
  bus: "#ff8a00",
  tram: "#00bcd4",
  metro: "#5c6cff",
  train: "#ffc917",
  ferry: "#26c6da"
};

export function getVervoerderStyle(name?: string) {
  const normalized = (name || "").toLowerCase();
  if (normalized.includes("ns")) return vervoerderColors.NS;
  if (normalized.includes("gvb")) return vervoerderColors.GVB;
  if (normalized.includes("ret")) return vervoerderColors.RET;
  if (normalized.includes("arriva")) return vervoerderColors.Arriva;
  if (normalized.includes("htm")) return vervoerderColors.HTM;
  if (normalized.includes("qbuzz")) return vervoerderColors.Qbuzz;
  return vervoerderColors.Default;
}

export function inferCarrierFromLine(line?: string, carrier?: string) {
  if (carrier) return carrier;
  const value = (line || "").toUpperCase();
  if (value.startsWith("IC") || value.startsWith("SPR")) return "NS";
  return "Default";
}
