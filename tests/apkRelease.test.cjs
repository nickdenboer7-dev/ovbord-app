const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const previous = Module._extensions[".ts"];
Module._extensions[".ts"] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText, filename);
};
const {
  parseApkRelease, parseApkDismissal, shouldShowApkRelease, createApkReleasePoller,
  APK_RELEASE_MANIFEST_URL
} = require(path.resolve(__dirname, "../lib/apkRelease.ts"));
if (previous) Module._extensions[".ts"] = previous;
else delete Module._extensions[".ts"];

const release = (rest = {}) => ({
  schema: 1, platform: "android", status: "published", version: "1.0.5",
  versionCode: 6, apkUrl: "https://ovspot.nl/downloads/ovbord-1.0.5.apk",
  notes: "Android-widget en uitstapherinneringen", ...rest
});

test("Android 1.0.4 sees only an explicitly approved newer APK", () => {
  const row = parseApkRelease(release(), 5);
  assert.equal(row.version, "1.0.5");
  assert.equal(row.versionCode, 6);
  assert.equal(parseApkRelease(release({ status: "draft" }), 5), null);
  assert.equal(parseApkRelease(release({ status: "approved" }), 5), null);
  assert.equal(parseApkRelease(release(), 6), null);
  assert.equal(parseApkRelease(release({ versionCode: 4 }), 5), null);
});
test("Update feed and APK URL must use approved own HTTPS origin", () => {
  assert.equal(APK_RELEASE_MANIFEST_URL, "https://ovspot.nl/ovbord/android-release.json");
  for (const url of [
    "http://ovspot.nl/downloads/app.apk", "https://evil.com/app.apk",
    "https://ovspot.nl.evil.com/app.apk", "https://expo.dev/artifacts/example.apk",
    "https://ovspot.nl:8443/app.apk", "https://user:pass@ovspot.nl/app.apk",
    "https://ovspot.nl/downloads/app.zip"
  ]) assert.equal(parseApkRelease(release({ apkUrl: url }), 5), null, url);
  assert.ok(parseApkRelease(release({ apkUrl: "https://ovbord.nl/downloads/app.apk" }), 5));
});
test("Reject malformed manifests and truncate overly long notes", () => {
  assert.equal(parseApkRelease(null, 5), null);
  assert.equal(parseApkRelease({}, 5), null);
  assert.equal(parseApkRelease(release({ version: "1.0.5-rc" }), 5), null);
  assert.equal(parseApkRelease(release({ versionCode: 6.2 }), 5), null);
  assert.equal(parseApkRelease(release({ apkUrl: 123 }), 5), null);
  assert.equal(parseApkRelease(release({ notes: "a".repeat(500) }), 5).notes.length, 160);
});
test("Later button hides same version for 24 hours, but not a subsequent release", () => {
  const row = parseApkRelease(release(), 5), now = 123000;
  const dismissal = parseApkDismissal(JSON.stringify({ versionCode: 6, until: now + 1000 }));
  assert.equal(shouldShowApkRelease(row, dismissal, now), false);
  assert.equal(shouldShowApkRelease(row, dismissal, now + 1000), true);
  assert.equal(shouldShowApkRelease({ ...row, versionCode: 7 }, dismissal, now), true);
  assert.equal(parseApkDismissal("{broken"), null);
  assert.equal(shouldShowApkRelease(null, null, now), false);
});
test("Poller throttles checks and recovers when a request fails", async () => {
  let now = 1000, attempts = 0;
  const poll = createApkReleasePoller({ now: () => now, pollMs: 60,
    check: async () => { attempts++; if (attempts === 1) throw Error("offline"); }
  });
  await poll();
  now += 50; await poll();
  assert.equal(attempts, 1);
  now += 11; await poll();
  assert.equal(attempts, 2);
});
