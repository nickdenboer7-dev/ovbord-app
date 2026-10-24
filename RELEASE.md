# OVbord preview

Native app version 1.0.4 (Android versionCode 5) includes the in-app feedback screen,
durable feedback queue, one-time third-launch prompt and expo-device model metadata.
Only the user-entered message/email, app version, model, optional rating and explicitly
reported stop/time are sent to the existing private OVspot inbox.

The preview APK uses the existing EAS project and signing credentials. Runtime policy
`appVersion` isolates 1.0.4 from older 1.0.3 updates. Updates are checked on launch,
downloaded in the background and applied on the next cold launch. Native dependency
changes require a new version and APK; compatible JavaScript changes use preview OTA.

The automatic EAS push trigger is disabled. `.eas/workflows/preview-update.yml`
is manual-only so pushes do not consume workflow minutes. Publish compatible
Android JavaScript changes directly without starting an EAS workflow:

`eas update --channel preview --message "Anoniem toestel-ID voor statistiek" --environment preview --platform android`

The anonymous statistics ping sends only a random installation ID persisted in
AsyncStorage and the app version. It sends no hardware ID, model, location or account
data. One successful ping per Amsterdam day is sent while the app is opened;
the server deduplicates across launches and versions.

Build once in EAS with `eas build --platform android --profile preview`.
After publishing the backend and APK, the same APK can be tested in EAS with
`eas workflow:run ovbord-release.yml -F build_id=BUILD_ID --non-interactive`.
This workflow takes actual screenshots and sends exactly one identified QA feedback
message, which the release operator must verify in the authenticated OVbord inbox
and remove after verification. It does not make a second build.

Countdowns: up to 60 minutes in minutes, 61–180 in hours/minutes, above 180 only the
live/planned status. Arrivals are shown only when the API supplies arrivals.

Preview OTA: confirmed bus/tram departures keep their clock, line, destination and
observed delay with an explicit blue `Vertrokken` label for one minute. A successful
board refresh may omit the row without removing that notice early. Recent missing
live rows can still be verified against fresh GPS and passed-stop progress; neither
the timetable nor disappearance alone confirms departure. Cancellation wins, stale
or estimated GPS is rejected, and repeated feed entries never extend the notice.
The existing calm Start list, nearby line counts, updated-at clock and 180-minute
countdown remain in place. No native dependencies or runtime changes are required.

Shared six-point release: the app now puts clock, line badge and single-line
destination on the same primary row, including narrow mobile screens. Status stays
under the destination. Start shows metres below 1 km and counts the actual rendered
nearby rows. The app has no browser-notification prompt or floating feedback button;
feedback stays in Meer and the stop menu. Runtime and preview channel remain 1.0.4.

Expected-clock release: line left, destination/status in the middle, expected clock
large on the right. Positive delay sits below it as +3, orange through +4 and red
from +5; zero and early running leave it empty. The blue Vertrokken block stays in
the middle. Clock and countdown use the same expected instant, without adding delay
again to an API-supplied ETA. Runtime and preview channel remain 1.0.4.
