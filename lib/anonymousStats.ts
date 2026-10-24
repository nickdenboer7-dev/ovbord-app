export const ANONYMOUS_ID_KEY = "ovbord.stats.anonymousId.v1";
const VALID_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> };
type Send = (url: string, init: RequestInit) => Promise<{ ok: boolean }>;

/** Random installation identifier only: no hardware identifier, model, location or account data. */
export function randomAnonymousId(random = Math.random): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const value = Math.floor(random() * 16);
    return (char === "x" ? value : (value & 3) | 8).toString(16);
  });
}

export function amsterdamDay(): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  return ["year", "month", "day"].map((type) => parts.find((part) => part.type === type)?.value).join("-");
}

/** At most one successful ping per day in this process; the server deduplicates across launches. */
export function createAnonymousSessionPing(storage: Storage, version: string, send: Send,
  day = amsterdamDay, random = Math.random) {
  let identifier: Promise<string> | undefined;
  let inFlight: Promise<void> | undefined;
  let sentDay: string | undefined;
  const getId = () => identifier ??= (async () => {
    const saved = await storage.getItem(ANONYMOUS_ID_KEY);
    if (saved && VALID_ID.test(saved)) return saved.toLowerCase();
    const id = randomAnonymousId(random);
    // Never send an unpersisted fallback ID: storage failure must not create a new device each time.
    await storage.setItem(ANONYMOUS_ID_KEY, id);
    return id;
  })().catch((error) => { identifier = undefined; throw error; });
  return () => {
    const currentDay = day();
    if (sentDay === currentDay) return Promise.resolve();
    return inFlight ??= (async () => {
      const id = await getId();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await send("https://ovspot.nl/api/ovbord-ping", {
          method: "POST", credentials: "omit", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, v: version }), signal: controller.signal
        });
        if (!response.ok) throw new Error("Anonieme statistiek nog niet ontvangen.");
        sentDay = currentDay;
      } finally { clearTimeout(timer); }
    })().finally(() => { inFlight = undefined; });
  };
}
