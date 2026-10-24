import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Device from "expo-device";
import appConfig from "../app.json";
import { createFeedbackPrompt, createFeedbackQueue, type FeedbackPayload } from "./feedbackQueue";

export type FeedbackInput = Pick<FeedbackPayload, "message"> & Partial<Pick<FeedbackPayload,
  "contact" | "rating" | "stop_id" | "stop_name" | "reported_at">>;

const queue = createFeedbackQueue(AsyncStorage, async (payload) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch("https://ovspot.nl/api/ovbord-feedback", {
      method: "POST", headers: { "Content-Type": "application/json" },
      credentials: "omit", body: JSON.stringify(payload), signal: controller.signal
    });
    if (!response.ok || (await response.json()).ok !== true) throw new Error("Feedback nog niet ontvangen.");
  } finally { clearTimeout(timer); }
});

export const registerFeedbackLaunch = createFeedbackPrompt(AsyncStorage);
export const retryFeedback = queue.flush;
export function submitFeedback(input: FeedbackInput) {
  // A fresh ID per message, never an installation or advertising identifier.
  return queue.submit({
    source: "ovbord", client_id: Date.now().toString(36) + "-" + Math.random().toString(36).slice(2),
    category: "anders", message: input.message.trim(), contact: input.contact?.trim() || "",
    app_version: appConfig.expo.version, device_model: Device.modelName || "Onbekend",
    ...(input.rating ? { rating: input.rating } : {}),
    ...(input.stop_id ? { stop_id: input.stop_id, stop_name: input.stop_name || "", reported_at: input.reported_at || "" } : {})
  });
}
