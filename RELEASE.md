# OVbord preview

Native app version 1.0.4 (Android versionCode 5) includes the in-app feedback screen,
durable feedback queue, one-time third-launch prompt and expo-device model metadata.
Only the user-entered message/email, app version, model, optional rating and explicitly
reported stop/time are sent to the existing private OVspot inbox.

The preview APK uses the existing EAS project and signing credentials. Runtime policy
`appVersion` isolates 1.0.4 from older 1.0.3 updates. Updates are checked on launch,
downloaded in the background and applied on the next cold launch. Native dependency
changes require a new version and APK; compatible JavaScript changes use preview OTA.

`.eas/workflows/preview-update.yml` publishes checked Android updates after pushes to
`feature/v591-complete-lijnen` when the repository is connected to the EAS GitHub app.
It can also be started with `eas workflow:run preview-update.yml --non-interactive`.

Build once in EAS with `eas build --platform android --profile preview`.
After publishing the backend and APK, the same APK can be tested in EAS with
`eas workflow:run ovbord-release.yml -F build_id=BUILD_ID --non-interactive`.
This workflow takes actual screenshots and sends exactly one identified QA feedback
message, which the release operator must verify in the authenticated OVbord inbox
and remove after verification. It does not make a second build.

Countdowns: up to 60 minutes in minutes, 61–180 in hours/minutes, above 180 only the
live/planned status. Arrivals are shown only when the API supplies arrivals.
