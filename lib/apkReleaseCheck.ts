import { APK_RELEASE_MANIFEST_URL, parseApkRelease } from "./apkRelease";

export async function fetchApprovedApkRelease(installedVersionCode: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(APK_RELEASE_MANIFEST_URL, {
      headers: { Accept: "application/json", "Cache-Control": "no-cache" },
      signal: controller.signal
    });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    return parseApkRelease(data, installedVersionCode);
  } finally {
    clearTimeout(timeout);
  }
}
