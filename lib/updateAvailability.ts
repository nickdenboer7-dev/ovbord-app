/** Native startup downloads are observed separately through useUpdates(). */
export function createUpdatePoller(options: {
  enabled: boolean;
  busy: () => boolean;
  pending: () => boolean;
  check: () => Promise<{ isAvailable: boolean }>;
  download: () => Promise<unknown>;
  now?: () => number;
}) {
  let running = false;
  let lastAttempt = -Infinity;
  return async () => {
    const now = (options.now ?? Date.now)();
    if (!options.enabled || running || options.busy() || options.pending() || now - lastAttempt < 300000) return;
    running = true;
    lastAttempt = now;
    try {
      const update = await options.check();
      if (update.isAvailable) await options.download();
    } catch { /* Offline or failed download: retry at a later check, without blocking the app. */ }
    finally { running = false; }
  };
}
