/** Moves one item up (delta -1) or down (delta 1); out-of-range moves leave the list unchanged. */
export function moveItem<T>(list: readonly T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (!Number.isInteger(index) || !Number.isInteger(target) || index < 0 || index >= list.length ||
      target < 0 || target >= list.length || delta === 0) return [...list];
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}
