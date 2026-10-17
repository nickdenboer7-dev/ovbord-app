import AsyncStorage from "@react-native-async-storage/async-storage";
import { PermissionsAndroid, Platform, Vibration } from "react-native";

/** Setting under ⋮ on the trip page; on unless the user turned it off. */
export const ALIGHT_VIBRATION_STORAGE_KEY = "ovbord.alightVibrate";
let enabled: boolean | null = null;

export async function loadAlightVibration(): Promise<boolean> {
  if (enabled !== null) return enabled;
  try { enabled = (await AsyncStorage.getItem(ALIGHT_VIBRATION_STORAGE_KEY)) !== "0"; } catch { enabled = true; }
  return enabled;
}

export function saveAlightVibration(value: boolean): void {
  enabled = value;
  void AsyncStorage.setItem(ALIGHT_VIBRATION_STORAGE_KEY, value ? "1" : "0").catch(() => { /* Setting stays for this session. */ });
}

let allowed: Promise<boolean> | null = null;

/**
 * Two short pulses. Android needs the VIBRATE permission in the installed build; it
 * is checked first, so a build without it simply does not vibrate (no crash).
 */
export function vibrateForAlighting(): void {
  if (Platform.OS !== "android") return;
  if (!allowed) {
    const check = PermissionsAndroid.check.bind(PermissionsAndroid) as unknown as (permission: string) => Promise<boolean>;
    allowed = check("android.permission.VIBRATE").catch(() => false);
  }
  void allowed.then((ok) => {
    if (!ok) return;
    try { Vibration.vibrate([0, 220, 140, 220]); } catch { /* Vibration unavailable. */ }
  });
}
