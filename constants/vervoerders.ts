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
  RRReis: { bg: "#167A4A", text: "#FFFFFF" },
  Breng: { bg: "#E53935", text: "#FFFFFF" },
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

function normalizeCarrier(value?: string) {
  return (value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function getVervoerderStyle(name?: string, line?: string) {
  const carrier = normalizeCarrier(name);
  const normalizedLine = (line || "").trim().toUpperCase();

  if (carrier.includes("connexxion") || carrier === "cxx" || carrier.includes("transdev")) {
    return vervoerderColors.Connexxion;
  }
  if (carrier.includes("qbuzz")) return vervoerderColors.Qbuzz;
  if (carrier.includes("ebs") || carrier.includes("ebspublictransportation")) return vervoerderColors.EBS;
  if (carrier.includes("uov") || carrier.includes("utrechtov")) return vervoerderColors.UOV;
  if (carrier.includes("arriva")) return vervoerderColors.Arriva;
  if (carrier.includes("gvb")) return vervoerderColors.GVB;
  if (carrier.includes("ret")) return vervoerderColors.RET;
  if (carrier.includes("htm")) return vervoerderColors.HTM;
  if (carrier.includes("rrreis") || carrier.includes("keolis")) return vervoerderColors.RRReis;
  if (carrier.includes("breng")) return vervoerderColors.Breng;
  if (carrier === "ns" || carrier.includes("nederlandse spoorwegen")) return vervoerderColors.NS;

  if (/^N[A-Z0-9-]*$/.test(normalizedLine)) return vervoerderColors.Night;
  if (/^3\d{2}$/.test(normalizedLine) || normalizedLine === "394" || normalizedLine === "395") {
    return vervoerderColors.Connexxion;
  }
  if (normalizedLine.startsWith("IC") || normalizedLine.startsWith("SPR")) return vervoerderColors.NS;

  return vervoerderColors.Default;
}

export function inferCarrierFromLine(line?: string, carrier?: string) {
  const normalizedCarrier = (carrier || "").trim();
  if (normalizedCarrier && normalizedCarrier.toLowerCase() !== "default") return normalizedCarrier;

  const value = (line || "").trim().toUpperCase();
  if (value.startsWith("IC") || value.startsWith("SPR")) return "NS";
  if (/^3\d{2}$/.test(value) || value === "394" || value === "395") return "Connexxion";
  if (/^N[A-Z0-9-]*$/.test(value)) return "Night";
  return "Default";
}
