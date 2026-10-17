export function hasAvailableArrivals(board: { arrivals?: readonly unknown[] } | null | undefined): boolean {
  return Array.isArray(board?.arrivals) && board.arrivals.length > 0;
}
