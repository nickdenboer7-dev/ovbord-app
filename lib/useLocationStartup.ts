import { useEffect, useState } from "react";

export const LOCATION_STARTUP_WAIT_MS = 10000;
/** Give GPS ten seconds on first open and on each explicit retry before showing recovery buttons. */
export function useLocationStartup(retry: number, enabled: boolean): boolean {
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    setExpired(false);
    if (!enabled) return;
    const timer = setTimeout(() => setExpired(true), LOCATION_STARTUP_WAIT_MS);
    return () => clearTimeout(timer);
  }, [retry, enabled]);
  return expired;
}
