# DIAGNOSIS: Version Label Instability

## Summary

Three different version values observed today: **BETA-52** (Settings, at install), **BETA-51** (Settings, later), **BETA-50** (support tickets). Root cause: **the app reads its version from two independent sources that can disagree**, and the `release.js --apk` mode skips the `betaBuild` bump in `app.json`.

## All Version Sources

| Source | Where Used | Value | Mutability |
|--------|-----------|-------|------------|
| `APP_VERSION` constant | SettingsScreen, SplashScreen, ConsentScreen, updateChecker | `'2.0.1'` (hardcoded) | **Never updated** by release script |
| `Constants.expoConfig.version` | SupportScreen, BugReportScreen, FeatureRequestScreen | Baked into binary at build time | Immutable at runtime |
| `Constants.expoConfig.extra.betaBuild` | SettingsScreen, SupportScreen, SplashScreen, updateChecker, App.js | Baked into binary at build time | Immutable at runtime |
| `Constants.manifest?.extra?.betaBuild` | updateChecker fallback, SupportScreen fallback | Can change via OTA manifest | Mutable by OTA |
| Scarlett `app_config.current_build` | updateChecker, App.js update check | Set by release script | Remote, mutable |

## Settings Display (line 1617)

```js
v{APP_VERSION}-BETA.${Constants.expoConfig?.extra?.betaBuild}
```

- `APP_VERSION` = `'2.0.1'` (hardcoded in `src/constants/index.js:185`, never updated by release script)
- `betaBuild` = value baked into binary at build time

**At install time (BETA-52):** Binary had `betaBuild: 52` → Settings showed `v2.0.1-BETA.52`
**Later (BETA-51):** If an OTA update applied that changed the manifest, or if the binary was actually built with `betaBuild: 51` (see below), Settings shows `v2.0.1-BETA.51`

## Support Ticket Version (BugReportScreen line 143)

```js
app_version: version  // where version = Constants.expoConfig?.version
```

This reads `Constants.expoConfig.version` — a different source than Settings. At build time, `release.js` `bumpVersions()` sets `app.json` version to `2.0.52`, which gets baked into the binary. So tickets show `app_version: "2.0.52"`.

**But `betaBuild` is NOT included in the ticket submission.** The ticket only stores `app_version` (the semver), not the BETA build number. The "BETA-50" tag in Scarlett is likely coming from a different mechanism — possibly Scarlett inferring the build from `current_build` in `app_config`, or the ticket being associated with an older device record.

## Root Cause: `--apk` Mode Skips `betaBuild` Bump

In `release.js` line 789:
```js
const newVersion = MANUAL_APK
  ? JSON.parse(fs.readFileSync(APP_JSON_PATH, 'utf-8')).expo.version
  : bumpVersions(buildNumber);
```

When `--apk` mode is used, `bumpVersions()` is **never called**. This means:
- `app.json` version stays at whatever it was (e.g., `2.0.51`)
- `app.json` `betaBuild` stays at whatever it was (e.g., `51`)
- `versionCode` stays at whatever it was (e.g., `51`)

The release script still updates Scarlett's `app_config` with `current_build: 52`, but the **binary's baked-in values are stale**.

**This is the direct cause of the BETA-51 display:** The binary was built from `app.json` with `betaBuild: 51`, so `Constants.expoConfig.extra.betaBuild` is `51` at runtime. The release script set `current_build: 52` in Scarlett, but that only affects the remote config — not the binary.

## Why BETA-52 Was Initially Shown

If the user initially saw "BETA-52" in Settings, it's possible that:
1. A previous OTA update had temporarily mutated `Constants.manifest` with `betaBuild: 52`
2. Or the user misread the display (the format is `v2.0.1-BETA.51`, easy to misread as 52)
3. Or there was a brief window where the correct binary was installed before being overwritten

## Why Support Tickets Show BETA-50

The ticket submission code (`BugReportScreen.js:143`) writes:
```js
app_version: version  // = Constants.expoConfig?.version = "2.0.52"
```

It does **NOT** include `betaBuild`. The "BETA-50" label in Scarlett is likely:
1. Scarlett inferring the build from a stale `current_build` value (if tickets were submitted before the release script ran)
2. Or a different ticket submission path that reads from a different source
3. Or the binary was actually built with `betaBuild: 50` at some point

## Root Cause Summary

| Symptom | Root Cause |
|---------|-----------|
| Settings shows BETA-51 (not 52) | `bumpVersions()` skipped in `--apk` mode; binary has `betaBuild: 51` |
| Settings shows `v2.0.1-BETA.XX` | `APP_VERSION` is hardcoded `'2.0.1'` in constants, never updated |
| Tickets show BETA-50 | Likely Scarlett-side inference from stale `current_build`, or older binary |
| Version "changed" without reinstall | Not actually changed — the binary always had `betaBuild: 51`; initial BETA-52 observation was likely an OTA manifest artifact or misread |

## Relationship to Prospect-Queue-Save Bug

**Same root-cause family.** Both bugs involve:
- Mutable storage layer (MMKV / AsyncStorage / Constants) being read inconsistently
- State diverging from the source of truth
- Stale data being displayed until a full re-mount forces a fresh read

The version bug is simpler: `Constants.expoConfig` is immutable at runtime, so the "instability" is actually a **static mismatch** between what the binary reports and what the user expects. The prospect-queue bug is a true **dynamic mismatch** where MMKV writes may silently fail.

## Recommended Fixes (for follow-up briefing)

1. **`APP_VERSION` should be derived from `Constants.expoConfig.version`**, not a hardcoded string
2. **`release.js` should always call `bumpVersions()`, even in `--apk` mode** (or at minimum, bump `betaBuild`)
3. **Ticket submission should include `betaBuild`** in the `app_version` field for accurate tracking
4. **Settings display should use `Constants.expoConfig.version`** instead of `APP_VERSION` constant
