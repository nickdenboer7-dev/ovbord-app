import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { ActiveTrip } from "./activeTrip";
import { plannedAlightReminder } from "./journeyReminderPlan";

const ENABLED_KEY = "ovbord.nativeAlightReminders";
const PENDING_KEY = "ovbord.nativeAlightReminderPending";
const CHANNEL_ID = "ovbord-uitstappen";
type Pending = { id: string; key: string; tripId: string; at: number };
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
      typeof raw.tripId === "string" && typeof raw.at === "number" ? raw : null;
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

/** Only called from an explicit user toggle. Never prompt at startup or when opening a trip. */
export async function enableNativeReminders(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "Uitstapherinneringen",
    importance: Notifications.AndroidImportance.DEFAULT
  });
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

async function applyReminder(trip: ActiveTrip | null): Promise<void> {
  if (!await nativeRemindersEnabled()) { await cancelPending(); return; }
  const plan = plannedAlightReminder(trip, Date.now());
  const current = await getPending();
  if (current && plan && current.key === plan.key && current.at > Date.now()) return;
  if (current) await cancelPending();
  if (!plan) return;
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) return; // no unsolicited permission dialogs
  const id = await Notifications.scheduleNotificationAsync({
    content: { title: plan.title, body: plan.body, data: { tripId: trip!.tripId } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(plan.at), channelId: CHANNEL_ID }
  });
  await AsyncStorage.setItem(PENDING_KEY, JSON.stringify({ id, key: plan.key, at: plan.at, tripId: trip!.tripId }));
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
