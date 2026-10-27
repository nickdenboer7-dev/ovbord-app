import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { ActiveTrip } from "./activeTrip";
import { plannedAlightReminder, sameAlightSelection } from "./journeyReminderPlan";

const ENABLED_KEY = "ovbord.nativeAlightReminders";
const PENDING_KEY = "ovbord.nativeAlightReminderPending";
// Android channel importance cannot be raised after creation: use a new channel for visible alerts.
const CHANNEL_ID = "ovbord-uitstappen-v2";
type Pending = { id: string; key: string; tripId: string; at: number; stopId?: string; stopName?: string; channelId?: string };
export type NativeAlightReminderStatus =
  | { state: "disabled" | "blocked" | "ready" | "error" }
  | { state: "scheduled"; at: number; stopName: string };

async function ensureReminderChannel(): Promise<void> {
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "Uitstapherinneringen", importance: Notifications.AndroidImportance.HIGH,
    sound: "default", vibrationPattern: [0, 250, 150, 250]
  });
}
let queue: Promise<void> = Promise.resolve();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false
  })
});

async function getPending(): Promise<Pending | null> {
  try {
    const raw = JSON.parse(await AsyncStorage.getItem(PENDING_KEY) || "null");
    return raw && typeof raw.id === "string" && typeof raw.key === "string" &&
      typeof raw.tripId === "string" && typeof raw.at === "number" ? {
        id: raw.id, key: raw.key, tripId: raw.tripId, at: raw.at,
        stopId: typeof raw.stopId === "string" ? raw.stopId : undefined,
        stopName: typeof raw.stopName === "string" ? raw.stopName : undefined,
        channelId: typeof raw.channelId === "string" ? raw.channelId : undefined
      } : null;
  } catch { return null; }
}

async function cancelPending(tripId?: string): Promise<void> {
  const pending = await getPending();
  if (pending && (!tripId || pending.tripId === tripId)) {
    try { await Notifications.cancelScheduledNotificationAsync(pending.id); } catch { /* already delivered */ }
    await AsyncStorage.removeItem(PENDING_KEY);
  }
}

export async function nativeRemindersEnabled(): Promise<boolean> {
  if (Platform.OS !== "android" || (await AsyncStorage.getItem(ENABLED_KEY)) !== "1") return false;
  return (await Notifications.getPermissionsAsync()).granted;
}

/** Verify the actual Android alarm, not just our saved notification ID. */
export async function nativeAlightReminderStatus(): Promise<NativeAlightReminderStatus> {
  if (Platform.OS !== "android" || (await AsyncStorage.getItem(ENABLED_KEY)) !== "1") return { state: "disabled" };
  if (!(await Notifications.getPermissionsAsync()).granted) return { state: "blocked" };
  const current = await getPending();
  if (!current) return { state: "ready" };
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    if (scheduled.some(item => item.identifier === current.id)) {
      return { state: "scheduled", at: current.at, stopName: current.stopName || "je uitstaphalte" };
    }
    return { state: "ready" };
  } catch {
    return { state: "error" };
  }
}

/** Only called from an explicit user toggle. Never prompt at startup or when opening a trip. */
export async function enableNativeReminders(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  await ensureReminderChannel();
  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) return false;
  await AsyncStorage.setItem(ENABLED_KEY, "1");
  return true;
}

export async function disableNativeReminders(): Promise<void> {
  await AsyncStorage.setItem(ENABLED_KEY, "0");
  await cancelPending();
}

/** An already-sent reminder never rearms during live timetable refreshes. */
async function applyReminder(trip: ActiveTrip | null): Promise<void> {
  if (!await nativeRemindersEnabled()) { await cancelPending(); return; }
  const nowMs = Date.now();
  const current = await getPending();
  const sameStop = current ? sameAlightSelection(current, trip) : false;
  // Keep a delivered reminder as a one-time record for this stop, even if the ETA changes.
  if (current && sameStop && current.at <= nowMs) return;
  const plan = plannedAlightReminder(trip, nowMs);
  if (!plan) { if (current) await cancelPending(); return; }

  if (current && sameStop && current.key === plan.key && current.channelId === CHANNEL_ID && current.at > nowMs) {
    // Recover if Android lost the scheduled alarm despite our persisted bookkeeping.
    const scheduled = await Notifications.getAllScheduledNotificationsAsync().catch(() => null);
    if (scheduled === null || scheduled.some(item => item.identifier === current.id)) return;
  }
  if (current) await cancelPending();
  await ensureReminderChannel();
  const id = await Notifications.scheduleNotificationAsync({
    content: { title: plan.title, body: plan.body, sound: "default",
      priority: Notifications.AndroidNotificationPriority.HIGH, data: { tripId: trip!.tripId } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(plan.at), channelId: CHANNEL_ID }
  });
  await AsyncStorage.setItem(PENDING_KEY, JSON.stringify({
    id, key: plan.key, at: plan.at, tripId: trip!.tripId,
    stopId: trip!.alighting!.id, stopName: trip!.alightName, channelId: CHANNEL_ID
  }));
}

/** Serialize scheduling while live trip refreshes update the expected arrival. */
export function syncNativeAlightReminder(trip: ActiveTrip | null): Promise<void> {
  queue = queue.catch(() => {}).then(() => applyReminder(trip));
  return queue;
}
export function cancelNativeAlightReminder(tripId?: string): Promise<void> {
  queue = queue.catch(() => {}).then(() => cancelPending(tripId));
  return queue;
}
