/** From this system font scale on, one-line names get a second line instead of being cut off. */
export const LARGE_TEXT_SCALE = 1.3;

export function largeText(fontScale: number | undefined): boolean {
  return typeof fontScale === "number" && Number.isFinite(fontScale) && fontScale >= LARGE_TEXT_SCALE;
}

/** Rough width of one character in em (Roboto), a little on the safe side. */
const EM_PER_CHAR = 0.6;

/**
 * Largest font scale at which the longest word of `text` still fits on one line of
 * `width` dp. Android breaks a word that is wider than the line in the middle
 * ("Rembr" / "andtplein"); a slightly smaller font keeps it whole. Never below 1
 * (the normal size) and never above `cap`. Without a width yet: `cap`.
 */
export function wordFitScale(text: string, width: number | undefined, fontSize: number, cap: number): number {
  if (typeof width !== "number" || !Number.isFinite(width) || width <= 0) return cap;
  const longest = text.split(/[\s\-/]+/).reduce((max, word) => Math.max(max, word.length), 0);
  if (longest === 0) return cap;
  const scale = Math.floor((width / (longest * EM_PER_CHAR * fontSize)) * 100) / 100;
  return Math.min(cap, Math.max(1, scale));
}
