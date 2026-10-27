const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const entries = new Map();
const scheduled = new Map();
const channels = new Map();
const deliveries = [];
let nextId = 0;
const storage = {
  getItem: async key => entries.get(key) ?? null,
  setItem: async (key, value) => { entries.set(key, value); },
  removeItem: async key => { entries.delete(key); }
};
const notifications = {
  AndroidImportance: { HIGH: 4 },
  AndroidNotificationPriority: { HIGH: "high" },
  SchedulableTriggerInputTypes: { DATE: "date" },
  setNotificationHandler: () => {},
  getPermissionsAsync: async () => ({ granted: true }),
  requestPermissionsAsync: async () => ({ granted: true }),
  setNotificationChannelAsync: async (id, config) => { channels.set(id, config); },
  scheduleNotificationAsync: async request => {
    const id = "notification-" + ++nextId;
    scheduled.set(id, request);
    deliveries.push({ id, request });
    return id;
  },
  cancelScheduledNotificationAsync: async id => { scheduled.delete(id); },
  getAllScheduledNotificationsAsync: async () => [...scheduled.keys()].map(identifier => ({ identifier }))
};
const originalLoad = Module._load;
const previousTs = Module._extensions[".ts"];
Module._extensions[".ts"] = (mod, filename) => mod._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText, filename
);
Module._load = function (request, parent, isMain) {
  if (request === "@react-native-async-storage/async-storage") return storage;
  if (request === "expo-notifications") return notifications;
  if (request === "react-native") return { Platform: { OS: "android" } };
  return originalLoad.call(this, request, parent, isMain);
};
const reminders = require(path.resolve(__dirname, "../lib/journeyReminders.ts"));
Module._load = originalLoad;
if (previousTs) Module._extensions[".ts"] = previousTs;
else delete Module._extensions[".ts"];

test("Android reminder survives ETA changes, fires once and exposes its real scheduled status", async () => {
  const originalNow = Date.now;
  let now = Date.parse("2026-10-26T11:00:00Z"); // 12:00 Amsterdam
  Date.now = () => now;
  const trip = {
    tripId: "rit-11", line: "17", destination: "Centraal Station",
    alighting: { id: "stop-7", name: "Leidseplein", index: 7 },
    alightName: "Leidseplein", alightClock: "12:11"
  };
  try {
    assert.equal(await reminders.enableNativeReminders(), true);
    await reminders.syncNativeAlightReminder(trip);
    assert.equal(scheduled.size, 1);
    assert.equal(deliveries[0].request.trigger.date.getTime(), Date.parse("2026-10-26T11:06:00Z"));
    assert.equal(deliveries[0].request.trigger.channelId, "ovbord-uitstappen-v2");
    assert.equal(deliveries[0].request.content.sound, "default");
    assert.equal(channels.get("ovbord-uitstappen-v2").importance, 4);
    assert.deepEqual(await reminders.nativeAlightReminderStatus(), {
      state: "scheduled", at: Date.parse("2026-10-26T11:06:00Z"), stopName: "Leidseplein"
    });

    // Vehicle ETA moves forward into the last 6 minutes: do NOT lose the alarm.
    now += 4 * 60_000 + 30_000;
    await reminders.syncNativeAlightReminder({ ...trip, alightClock: "12:10" });
    assert.equal(scheduled.size, 1);
    assert.equal(deliveries.length, 2);
    const adjusted = deliveries[1];
    assert.equal(adjusted.request.trigger.date.getTime(), Date.parse("2026-10-26T11:05:00Z"));

    // Android loses the scheduled alarm: a sync should repair it.
    scheduled.delete(adjusted.id);
    await reminders.syncNativeAlightReminder({ ...trip, alightClock: "12:10" });
    assert.equal(deliveries.length, 3);
    assert.equal(scheduled.size, 1);

    // After the alarm time, timetable refreshes may not trigger another alert.
    now = Date.parse("2026-10-26T11:05:10Z");
    await reminders.syncNativeAlightReminder({ ...trip, alightClock: "12:12" });
    assert.equal(deliveries.length, 3);

    // Selecting a different stop starts a fresh, independent reminder.
    const changed = { ...trip, alighting: { id: "stop-8", name: "Museumplein", index: 8 },
      alightName: "Museumplein", alightClock: "12:16" };
    await reminders.syncNativeAlightReminder(changed);
    assert.equal(deliveries.length, 4);
    assert.equal(scheduled.size, 1);
    assert.equal((await reminders.nativeAlightReminderStatus()).stopName, "Museumplein");

    await reminders.disableNativeReminders();
    assert.equal(scheduled.size, 0);
    assert.deepEqual(await reminders.nativeAlightReminderStatus(), { state: "disabled" });
  } finally {
    Date.now = originalNow;
  }
});
