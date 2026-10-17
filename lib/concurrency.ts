/**
 * Runs worker for every item with at most `limit` running at the same time, in
 * list order. Errors stay inside the worker: the caller handles them per item.
 */
export async function runLimited<T>(items: readonly T[], limit: number, worker: (item: T, index: number) => Promise<void>): Promise<void> {
  const size = Math.max(1, Math.floor(limit) || 1);
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const index = next++;
      try { await worker(items[index], index); } catch { /* Handled by the worker. */ }
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, lane));
}
