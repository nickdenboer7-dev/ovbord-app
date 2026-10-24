export type FeedbackPayload = {
  source: "ovbord";
  client_id: string;
  category: "anders";
  message: string;
  contact: string;
  app_version: string;
  device_model: string;
  rating?: "positive" | "negative";
  stop_id?: string;
  stop_name?: string;
  reported_at?: string;
};

type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> };
export const FEEDBACK_QUEUE_KEY = "ovbord.feedback.queue.v1";
export const FEEDBACK_PROMPT_KEY = "ovbord.feedback.prompt.v1";

/** Persist before sending. Serialise edits so retry and submit cannot lose each other's messages. */
export function createFeedbackQueue(storage: Storage, send: (payload: FeedbackPayload) => Promise<void>) {
  let pending: Promise<unknown> = Promise.resolve();
  const serial = <T>(job: () => Promise<T>): Promise<T> => {
    const result = pending.then(job, job);
    pending = result.catch(() => {});
    return result;
  };
  async function read(): Promise<FeedbackPayload[]> {
    const raw = await storage.getItem(FEEDBACK_QUEUE_KEY);
    if (!raw) return [];
    const items: unknown = JSON.parse(raw);
    if (!Array.isArray(items)) throw new Error("Opgeslagen feedback kon niet worden gelezen.");
    return items;
  }
  async function deliver(items: FeedbackPayload[]) {
    const sent = new Set<string>();
    for (const item of [...items]) {
      try { await send(item); } catch { break; }
      items = items.filter((entry) => entry.client_id !== item.client_id);
      // The server deduplicates client_id if the app closes before this write finishes.
      await storage.setItem(FEEDBACK_QUEUE_KEY, JSON.stringify(items));
      sent.add(item.client_id);
    }
    return sent;
  }
  return {
    submit: (payload: FeedbackPayload) => serial(async () => {
      const items = await read();
      if (items.length >= 100) throw new Error("Er staan veel berichten klaar. Verbind eerst met internet.");
      items.push(payload);
      await storage.setItem(FEEDBACK_QUEUE_KEY, JSON.stringify(items));
      return { sent: (await deliver(items)).has(payload.client_id) };
    }),
    flush: () => serial(async () => { await deliver(await read()); })
  };
}

/** One call per cold launch. Mark consumed before showing, including dismissals and crashes. */
export function createFeedbackPrompt(storage: Storage) {
  let launch: Promise<boolean> | undefined;
  return () => launch ??= (async () => {
    const raw = await storage.getItem(FEEDBACK_PROMPT_KEY);
    let state = { opens: 0, shown: false };
    if (raw) {
      try { state = { ...state, ...JSON.parse(raw) }; } catch { return false; }
    }
    if (state.shown) return false;
    state.opens = Math.max(0, Number(state.opens) || 0) + 1;
    const show = state.opens >= 3;
    state.shown = show;
    await storage.setItem(FEEDBACK_PROMPT_KEY, JSON.stringify(state));
    return show;
  })();
}
