/** A new Android binary cannot be installed with EAS OTA. This feed announces an approved APK only. */
export const APK_RELEASE_MANIFEST_URL = "https://ovspot.nl/ovbord/android-release.json";
export const APK_DISMISS_MS = 24 * 60 * 60_000;
export const APK_POLL_MS = 6 * 60 * 60_000;

export type ApkRelease = {
  version: string;
  versionCode: number;
  apkUrl: string;
  notes: string;
};

const OWNED_HOSTS = new Set(["ovspot.nl", "www.ovspot.nl", "ovbord.nl", "www.ovbord.nl"]);
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Only fully approved releases and URLs on our HTTPS domains can show an install button. */
export function parseApkRelease(value: unknown, installedVersionCode: number): ApkRelease | null {
  if (!isObject(value) || value.schema !== 1 || value.platform !== "android" || value.status !== "published") return null;
  const code = value.versionCode;
  const version = value.version;
  const apkUrl = value.apkUrl;
  if (!Number.isSafeInteger(code) || (code as number) <= installedVersionCode ||
      typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version) ||
      typeof apkUrl !== "string" || apkUrl.length > 2048) return null;
  try {
    const url = new URL(apkUrl);
    if (url.protocol !== "https:" || !OWNED_HOSTS.has(url.hostname.toLowerCase()) ||
        url.port || url.username || url.password ||
        !url.pathname.toLowerCase().endsWith(".apk")) return null;
  } catch { return null; }
  return {
    version,
    versionCode: code as number,
    apkUrl,
    notes: typeof value.notes === "string" ? value.notes.trim().slice(0, 160) : ""
  };
}

export type ApkDismissal = { versionCode: number; until: number };
export function parseApkDismissal(value: string | null): ApkDismissal | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isObject(parsed) || !Number.isSafeInteger(parsed.versionCode) ||
        typeof parsed.until !== "number" || !Number.isFinite(parsed.until)) return null;
    return { versionCode: parsed.versionCode as number, until: parsed.until };
  } catch { return null; }
}
export function shouldShowApkRelease(release: ApkRelease | null, dismissed: ApkDismissal | null, now: number): boolean {
  return Boolean(release) && (!dismissed || dismissed.versionCode !== release!.versionCode || now >= dismissed.until);
}

export function createApkReleasePoller(options: {
  check: () => Promise<void>;
  now?: () => number;
  pollMs?: number;
}) {
  let last = -Infinity;
  let running = false;
  return async () => {
    const now = (options.now ?? Date.now)();
    if (running || now - last < (options.pollMs ?? APK_POLL_MS)) return;
    running = true;
    last = now;
    try { await options.check(); } catch { /* Offline and missing manifest are normal before rollout. */ }
    finally { running = false; }
  };
}
