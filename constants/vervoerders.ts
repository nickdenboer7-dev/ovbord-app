import { Mode } from "../types/api";

export const vervoerderColors: Record<string, { bg: string; text: string }> = {
  NS: { bg: "#ffc917", text: "#111111" },
  GVB: { bg: "#009fe3", text: "#FFFFFF" },
  RET: { bg: "#e6007e", text: "#FFFFFF" },
  Arriva: { bg: "#d92b2b", text: "#FFFFFF" },
  HTM: { bg: "#2a9d55", text: "#FFFFFF" },
  Qbuzz: { bg: "#7a2cff", text: "#FFFFFF" },
  Connexxion: { bg: "#0066CC", text: "#FFFFFF" },
  EBS: { bg: "#FF6B00", text: "#FFFFFF" },
  UOV: { bg: "#FFCC00", text: "#000000" },
  Night: { bg: "#343A40", text: "#FFFFFF" },
  Default: { bg: "#495057", text: "#FFFFFF" }
};

export const modaliteitColors: Record<Mode, string> = {
  bus: "#ff8a00",
  tram: "#00bcd4",
  metro: "#5c6cff",
  train: "#ffc917",
  ferry: "#26c6da"
};

export function getVervoerderStyle(name?: string, line?: string) {
  const normalized = (name || "").trim().toLowerCase();
  const normalizedLine = (line || "").trim().toUpperCase();

  if (normalized.includes("connexxion") || normalized.includes("cxx")) return vervoerderColors.Connexxion;
  if (normalized.includes("qbuzz")) return vervoerderColors.Qbuzz;
  if (normalized.includes("ebs")) return vervoerderColors.EBS;
  if (normalized.includes("u-ov") || normalized.includes("uov")) return vervoerderColors.UOV;
  if (normalized.includes("ns")) return vervoerderColors.NS;
  if (normalized.includes("gvb")) return vervoerderColors.GVB;
  if (normalized.includes("ret")) return vervoerderColors.RET;
  if (normalized.includes("arriva")) return vervoerderColors.Arriva;
  if (normalized.includes("htm")) return vervoerderColors.HTM;

  if (/^3\d{2}$/.test(normalizedLine) || normalizedLine === "394" || normalizedLine === "395") {
    return vervoerderColors.Connexxion;
  }
  if (/^N(?:\d+|[A-Z0-9-]*)$/.test(normalizedLine)) return vervoerderColors.Night;

  return vervoerderColors.Default;
}

export function inferCarrierFromLine(line?: string, carrier?: string) {
  const normalizedCarrier = (carrier || "").trim();
  if (normalizedCarrier && normalizedCarrier.toLowerCase() !== "default") return normalizedCarrier;

  const value = (line || "").trim().toUpperCase();
  if (value.startsWith("IC") || value.startsWith("SPR")) return "NS";
  if (/^3\d{2}$/.test(value) || value === "394" || value === "395") return "Connexxion";
  if (/^N(?:\d+|[A-Z0-9-]*)$/.test(value)) return "Night";
  return "Default";
}
