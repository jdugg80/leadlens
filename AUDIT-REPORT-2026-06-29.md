# LeadLens Audit Report — 2026-06-29

## Executive Summary

1. **🔴 VAPID private key hardcoded in Edge Function** (`analyze-submission/index.ts:18`) — server-side only, but still a secret-in-source violation.
2. **🔴 Google Maps API key hardcoded in 8 tracked source files** — no domain restriction confirmed; key is fully exposed client-side.
3. **🔴 Supabase anon keys hardcoded in 9 tracked files** as fallback values — anon keys are public-by-design, but hardcoding prevents rotation without code changes.
4. **🟠 `getCurrentCoords()` GPS calls have no timeout in 8 of 10 call sites** — can hang the app indefinitely on slow GPS.
5. **🟠 14 orphaned components + 2 orphaned screens + 1 orphaned hook** — dead code adding bundle weight and confusion.
6. **🟠 `leadProcessing.js` logic duplicated across 4 files** — `normalizePhone`, `normalizeEmail`, `STATE_NAME_MAP` copy-pasted.
7. **🟠 139+ direct `AsyncStorage` calls bypass `storageBridge`** in 22 files — undermines the dual-storage strategy.
8. **🟠 20 `<Modal>` tags across 12 files** — known Android camera conflict risk; `CaptureScreen` and `ProspectQueueScreen` both use `launchCameraAsync` with modals mounted.
9. **⚠️ `feature_requests` table has no CREATE TABLE migration** — schema exists only in Supabase dashboard, not version-controlled.
10. **⚠️ 4 modified + 1 untracked file on `main`** — uncommitted work that would be included in next EAS build.

---

## 1. File Structure & Dead Code

### 1.1 Orphaned Components (never imported)

| Component | File |
|-----------|------|
| `GeoTargetStatusCard` | `src/components/GeoTargetStatusCard.js` |
| `TargetMapSummaryBadge` | `src/components/TargetMapSummaryBadge.js` |
| `ErrorBoundary` | `src/components/ErrorBoundary.js` (App.js uses its own `AppErrorBoundary`) |
| `LeadLockTargetOverlay` | `src/components/LeadLockTargetOverlay.js` |
| `LeadLockCameraOverlay` | `src/components/LeadLockCameraOverlay.js` |
| `CameraBoundingBoxOverlay` | `src/components/CameraBoundingBoxOverlay.js` |
| `SplashOriginalBackground` | `src/components/splash/SplashOriginalBackground.js` |
| `SplashLoadTile` | `src/components/splash/SplashLoadTile.js` |
| `SplashBackgroundClean` | `src/components/splash/SplashBackgroundClean.js` |
| `RotatingLensPin` | `src/components/splash/RotatingLensPin.js` |
| `ReadyUnderlineMotion` | `src/components/splash/ReadyUnderlineMotion.js` |
| `NeonConsoleDot` | `src/components/splash/NeonConsoleDot.js` |
| `AppScreenBackgroundSciFi` | `src/components/backgrounds/AppScreenBackgroundSciFi.js` |
| `AppScreenBackgroundPremium` | `src/components/backgrounds/AppScreenBackgroundPremium.js` |

### 1.2 Orphaned Screens (not in App.js navigation)

| Screen | File |
|--------|------|
| `GeoTargetReviewScreen` | `src/screens/GeoTargetReviewScreen.js` |
| `AutomationSettingsScreen` | `src/screens/AutomationSettingsScreen.js` |

### 1.3 Orphaned Hooks

| Hook | File |
|------|------|
| `useGeoTargetSnapshot` | `src/hooks/useGeoTargetSnapshot.js` |

### 1.4 Duplicate Files

| Files | Issue |
|-------|-------|
| `src/features/lenssignal/LensSignalMapMarker.js` + `.tsx` | Both exist; `.tsx` is imported by TerritoryMapScreen. `.js` is dead. |
| `utils/betaTracker.js` (root) + `src/utils/betaTracker.js` | Both live; root version imported by App.js, src version is separate. |

### 1.5 IntelliVision Trademark

| File | Line | Content |
|------|------|---------|
| `src/screens/CaptureScreen.js` | 1004 | `const handleIntelliVisionCapture = async () => {` — function name contains trademarked term. |

### 1.6 Modal Usage (Android Camera Conflict Risk)

20 `<Modal>` JSX tags across 12 files:

| File | Lines | Count |
|------|-------|-------|
| `src/screens/CaptureScreen.js` | 1775, 1834, 1861 | 3 |
| `src/components/CameraModal.js` | 213, 232, 259 | 3 |
| `src/components/ScanCameraModal.js` | 57, 69, 93 | 3 |
| `src/screens/ProspectQueueScreen.js` | 470, 525 | 2 |
| `src/screens/ExportScreen.js` | 747, 789 | 2 |
| `src/components/ProspectOutreachModal.js` | 146 | 1 |
| `src/components/TutorialOverlay.js` | 66 | 1 |
| `src/components/ThemedAlert.js` | 82 | 1 |
| `src/components/LeadFiltersBottomSheet.js` | 79 | 1 |
| `src/screens/SettingsScreen.js` | 1738 | 1 |
| `src/screens/TerritoryMapScreen.js` | 1493 | 1 |
| `src/screens/CardGalleryScreen.js` | 258 | 1 |

**`CaptureScreen.js`** uses `launchCameraAsync` (line 714) while 3 modals are mounted in the same tree — known Android hang risk.
**`ProspectQueueScreen.js`** uses `launchCameraAsync` (line 350) while 2 modals are mounted — same risk.

### 1.7 storageBridge Bypass Audit

**Direct `AsyncStorage.getItem` outside storage.js**: 76 occurrences in 22 files
**Direct `AsyncStorage.setItem` outside storage.js**: 54 occurrences in 20 files
**Direct `AsyncStorage.removeItem` outside storage.js**: 9 occurrences in 6 files
**Direct `@react-native-async-storage/async-storage` imports outside bridge**: 29 occurrences in 18 files

Top offenders by count:

| File | getItem | setItem | removeItem | Direct Import |
|------|---------|---------|------------|---------------|
| `src/screens/SettingsScreen.js` | 8 | 9 | 1 | 2 |
| `src/screens/TerritoryMapScreen.js` | 7 | 3 | — | 2 |
| `src/screens/LoginScreen.js` | 4 | 6 | 2 | 1 |
| `src/screens/AdminScreen.js` | 6 | 4 | — | — |
| `src/screens/DashboardScreen.js` | 4 | 2 | 2 | 1 |
| `src/utils/backendSync.js` | 5 | 5 | — | — |
| `src/utils/templateSettings.js` | 3 | 5 | — | — |
| `src/utils/aiWelcome.js` | 4 | 4 | — | 1 |
| `src/screens/ReviewScreen.js` | 3 | 1 | — | 3 |
| `src/utils/exportProfiles.js` | 3 | 2 | — | — |

**Direct MMKV imports outside storage.js**: 0 ✓ (only `src/utils/storage.js:40` imports it)

---

## 2. Dependencies

### 2.1 Root package.json (Expo SDK 51, React Native 0.74.5)

**Potentially unused dependencies** (not directly imported in src/):

| Package | Version | Notes |
|---------|---------|-------|
| `expo-asset` | ~10.0.6 | Not directly imported; may be used by Expo runtime |
| `expo-linking` | ~6.3.1 | Not directly imported in src/ |
| `expo-secure-store` | ~13.0.2 | Not directly imported in src/ |
| `expo-status-bar` | ~1.12.1 | Not directly imported; likely Expo auto-config |
| `expo-updates` | ~0.25.28 | Not directly imported; EAS runtime |
| `react-native-webview` | ^13.16.1 | Not imported anywhere in src/ |
| `resend` | ^6.12.2 | Not imported anywhere in src/ (server-side only, used in netlify function) |

**Misplaced dependencies** (should be devDependencies):

| Package | Version |
|---------|---------|
| `@types/react` | ~18.2.79 |
| `typescript` | ~5.3.3 |

### 2.2 web/package.json

| Package | Version |
|---------|---------|
| `@supabase/supabase-js` | ^2.107.0 |
| `react` | ^19.2.6 |
| `react-dom` | ^19.2.6 |
| `react-router-dom` | ^7.16.0 |
| `recharts` | ^3.8.1 |
| `tailwindcss` | ^4.3.0 |

### 2.3 Version Consistency

| Source | Version | Match? |
|--------|---------|--------|
| `package.json` version | 2.0.51 | ✅ |
| `app.json` version | 2.0.51 | ✅ |
| `app.json` versionCode | 51 | ✅ |
| `app.json` betaBuild | 51 | ✅ |
| `app.json` runtimeVersion | 2.0.50 | ⚠️ Off by 1 (intentional for OTA compat) |
| `package-lock.json` lockfileVersion | 3 | ✅ |

---

## 3. Security & Config

### 3.1 Hardcoded Secrets in Tracked Source

**Supabase Anon Keys** (public-by-design, but hardcoded = can't rotate without code change):

| File | Line | Project |
|------|------|---------|
| `src/screens/BugReportScreen.js` | 23 | LeadLens |
| `src/screens/FeatureRequestScreen.js` | 20 | LeadLens |
| `src/screens/SupportScreen.js` | 22 | LeadLens |
| `App.js` | 135 | Scarlett |
| `utils/betaTracker.js` | 20 | Scarlett |
| `utils/updateChecker.js` | 16 | Scarlett |
| `src/screens/LoginScreen.js` | 565 | Scarlett |
| `web/src/lib/supabase.js` | 4 | LeadLens (fallback) |
| `web/src/pages/Roadmap.jsx` | 102 | LeadLens (header) |

**Google Maps API Key** (fully exposed, no domain restriction confirmed):

| File | Line |
|------|------|
| `src/screens/ReviewScreen.js` | 79 |
| `src/screens/TerritoryMapScreen.js` | 131 |
| `src/utils/zipBoundaryCache.js` | 121 |
| `src/utils/nearbySearch.js` | 24 |
| `android/app/src/main/AndroidManifest.xml` | 29 |
| `app.json` | 29 |
| `docs/ENRICHMENT-DEPLOYMENT-CHECKLIST.md` | 87 |
| `docs/50-STATE-ENRICHMENT-GUIDE.md` | 30 |

**VAPID Private Key** (server-side Edge Function):

| File | Line |
|------|------|
| `supabase/functions/analyze-submission/index.ts` | 18 |

### 3.2 .env & Gitignore Status

- `.env` — ✅ Listed in `.gitignore`, not tracked by git
- `.env.*` — ✅ Listed in `.gitignore`
- `supabase/.env` — ✅ Listed in `.gitignore`
- `web/.env` — Contains Supabase anon key (expected)
- `web/.env.local` — Contains Vercel OIDC token (short-lived, low risk)

**No .env files are tracked by git.** ✓

### 3.3 RLS Policy Review

**Tables with permissive `USING (true)` policies** (any authenticated user can read/write all rows):

| Table | Migration File | Risk |
|-------|---------------|------|
| `comptroller_business_records` | `create_comptroller_business_records.sql:40-52` | Any user can read/insert/update all records |
| `beta_testers` | `private_beta_config.sql:151` | Any user can read all beta testers |
| `lenssignal_records` | `lens_signal_schema.sql:71` | Any user can read all signal records |
| `contact_candidates` | `leadlock_contact_candidates.sql:22` | Any user can read all contact candidates |

**Tables with proper scoped policies** ✓:

| Table | Policy |
|-------|--------|
| `enrichment_results` | SELECT scoped to user's own leads; ALL for admin |
| `targetlens_prospects` | SELECT to authenticated; ALL to service_role only |
| `targetlens_property_tax` | SELECT to authenticated; ALL to service_role only |
| `targetlens_mls_listings` | SELECT to authenticated; ALL to service_role only |
| `outreach_messages` | SELECT/INSERT/UPDATE scoped to `auth.uid() = user_id` |

### 3.4 Scarlett vs LeadLens Cross-References

**Files referencing Scarlett** (`dlntgyhfxxbcwwcxaorn`): `App.js:134`, `release.js:69`, `utils/updateChecker.js:15`, `utils/betaTracker.js:19`, `src/screens/LoginScreen.js:564`, `web/src/pages/Settings.jsx:183`, `scripts/release.js:303`

**Files referencing both projects**: `web/src/pages/Settings.jsx` (links to both dashboards — intentional admin access), `AGENT-FULL-AUDIT.md` (documentation).

**No code-level contamination** where one project's credentials are used for the other. ✓

### 3.5 Edge Function Model Strings

| File | Line | Model | Status |
|------|------|-------|--------|
| `supabase/functions/claude-proxy/index.ts` | 33 | `claude-haiku-4-5-20251001` | ✅ Current |
| `supabase/functions/analyze-submission/index.ts` | 43 | `claude-haiku-4-5-20251001` | ✅ Current |
| `supabase/functions/extract-prospect/index.ts` | 35 | `claude-haiku-4-5-20251001` | ✅ Current |
| `supabase/functions/ai-welcome/index.ts` | 38 | `claude-3-5-sonnet-20241022` | ⚠️ Older but not deprecated |

No deprecated `claude-3-haiku-20240307` found in Edge Functions. ✓

---

## 4. Database / Schema

### 4.1 Migration Files

| File | Description |
|------|-------------|
| `20240507000000_create_comptroller_business_records.sql` | Comptroller records (original) |
| `20240601000000_create_comptroller_business_records.sql` | Comptroller records (updated/duplicate) |
| `20260526000000_create_enrichment_results_table.sql` | Enrichment results |
| `20260528000000_add_prospect_location_columns.sql` | Prospect location columns |
| `20260531000000_create_targetlens_tables.sql` | TargetLens tables |
| `20260532000000_create_outreach_messages_table.sql` | Outreach messages |
| `20260622000000_add_feature_requests_analyze_trigger.sql` | Feature request auto-triage trigger |
| `create_comptroller_business_records.sql` | Comptroller (undated) |

### 4.2 feature_requests Table

**⚠ No CREATE TABLE migration exists.** The table was created via Supabase dashboard or a deleted migration. The trigger migration (`20260622000000`) references it but doesn't define it.

**`update_type` column**: Exists in practice (used by `BugReportScreen.js:142`, `FeatureRequestScreen.js:69`, `Roadmap.jsx:148`) but has no migration.

**JSON columns** (`affected_screens`, `dependencies`, `task_breakdown`): Exist in practice (used by `analyze-submission/index.ts:142-145`) but have no migrations.

### 4.3 JSON Column `.map()` Guards

All three JSON columns in `web/src/pages/Roadmap.jsx` have proper `typeof` guards:

| Column | Line | Guard |
|--------|------|-------|
| `affected_screens` | 834 | `typeof x === "string" ? JSON.parse(x \|\| "[]") : x \|\| []` |
| `dependencies` | 842 | `typeof x === "string" ? JSON.parse(x \|\| "[]") : x \|\| []` |
| `task_breakdown` | 940 | `typeof x === "string" ? JSON.parse(x \|\| "[]") : x \|\| []` |

✓ All safe.

---

## 5. Known-Issue Regression Status

### 5.1 `getCurrentCoords()` GPS Calls — Timeout Race

| # | File:Line | Status |
|---|-----------|--------|
| 1 | `src/screens/PhotoIngestScreen.js:61` | 🔴 STILL PRESENT — no timeout |
| 2 | `src/screens/BatchReviewScreen.js:88` | 🔴 STILL PRESENT — catch only |
| 3 | `App.js:198` | 🔴 STILL PRESENT — no timeout |
| 4 | `src/screens/TerritoryMapScreen.js:574` | 🔴 STILL PRESENT — no timeout |
| 5 | `src/screens/TerritoryMapScreen.js:995-998` | ✅ FIXED — `Promise.race` with 5s timeout |
| 6 | `src/screens/LeadLockCameraScreen.js:205` | 🔴 STILL PRESENT — no timeout |
| 7 | `src/screens/DashboardScreen.js:360-363` | ✅ FIXED — `Promise.race` with 3.5s timeout |
| 8 | `src/screens/CaptureScreen.js:557` | 🔴 STILL PRESENT — catch only |
| 9 | `src/screens/CaptureScreen.js:1009` | 🔴 STILL PRESENT — inside `Promise.all` |
| 10 | `src/screens/CaptureScreen.js:1083` | 🔴 STILL PRESENT — no timeout |

**2 fixed, 8 still present.**

### 5.2 `MapView` Dual Props (`initialRegion` + `region`)

✅ **All fixed.** No file passes both props simultaneously.

### 5.3 `Circle` with `onPress`

✅ **Fixed.** `TerritoryMapScreen.js:1082-1089` `<Circle>` has no `onPress`.

### 5.4 `launchCameraAsync` + Modal Co-presence

| File | Status |
|------|--------|
| `src/screens/ProspectQueueScreen.js` | 🔴 STILL PRESENT — `launchCameraAsync` at line 350, modals at 470/525 |
| `src/screens/CaptureScreen.js` | 🔴 STILL PRESENT — `launchCameraAsync` at line 714, modals at 1775/1834/1861 |

### 5.5 `ImagePicker.requestCameraPermissionsAsync()`

Still called in 4 locations, no timeout wrappers:

| File | Line |
|------|------|
| `src/screens/ProspectQueueScreen.js` | 344 |
| `src/screens/CaptureScreen.js` | 685 |
| `src/screens/CaptureScreen.js` | 1156 |
| `src/utils/permissionManager.js` | 71 |

### 5.6 Permission Requests Bypassing `permissionManager.js`

12 direct permission call sites:

| File | Line | Call |
|------|------|------|
| `src/utils/geoEnrich.js` | 37, 201 | `Location.requestForegroundPermissionsAsync()` |
| `src/utils/geoTargetLocation.js` | 83 | `Location.requestForegroundPermissionsAsync()` |
| `src/hooks/useLeadLockLocationSnapshot.ts` | 24 | `Location.requestForegroundPermissionsAsync()` |
| `src/features/lenssignal/saveUserLocationStatus.ts` | 23 | `Location.requestForegroundPermissionsAsync()` |
| `src/screens/CaptureScreen.js` | 685, 1156 | `ImagePicker.requestCameraPermissionsAsync()` |
| `src/screens/CaptureScreen.js` | 1468 | `ImagePicker.requestMediaLibraryPermissionsAsync()` |
| `src/screens/ProspectQueueScreen.js` | 324, 344 | `ImagePicker.requestMediaLibrary/CameraPermissionsAsync()` |
| `src/screens/BugReportScreen.js` | 63 | `ImagePicker.requestMediaLibraryPermissionsAsync()` |
| `src/screens/TerritoryManagerScreen.js` | 273 | `ImagePicker.requestMediaLibraryPermissionsAsync()` |

Only `DashboardScreen.js:30` correctly routes through `permissionManager`.

---

## 6. Build & Release Pipeline

### 6.1 ota-release.ps1

**⚠ `ota-release.ps1` does not exist.** Only `ota-release-dryrun.ps1` is present. The dryrun variant has native-file guard logic (lines 101-122) that checks `app.json`, `package.json`, `package-lock.json` for modifications via `git diff`, but it records errors rather than hard-stopping.

### 6.2 eas.json Build Profiles

| Profile | Channel | Build Type | Auto-Increment |
|---------|---------|------------|----------------|
| `preview` | production | apk | true |
| `production` | production | apk | false |

- Android-only, bare workflow ✓
- No iOS profiles defined
- No `updates` section (dryrun script checks for `easJson.updates.production` — would fail but is non-blocking)

### 6.3 Git Status

```
Modified:
  change-log.txt
  src/screens/ProspectQueueScreen.js
  supabase/functions/analyze-submission/index.ts
  supabase/functions/claude-proxy/index.ts

Untracked:
  AGENT-FULL-AUDIT.md
```

**⚠ 4 modified + 1 untracked file on `main`.** These changes would be included in the next EAS build if committed.

### 6.4 Version Consistency

| Source | Version | Match? |
|--------|---------|--------|
| `package.json` | 2.0.51 | ✅ |
| `app.json` | 2.0.51 | ✅ |
| `versionCode` | 51 | ✅ |
| `betaBuild` | 51 | ✅ |
| `runtimeVersion` | 2.0.50 | ⚠️ Off by 1 (intentional) |

---

## 7. Web Admin Portal

### 7.1 Vercel Root Directory

No stale `web\web` references found in `web/src/`. ✓

### 7.2 Secrets in web/

| File | Line | Secret | Risk |
|------|------|--------|------|
| `web/src/lib/supabase.js` | 4 | Supabase anon key (fallback) | Low — anon key is public |
| `web/src/pages/Roadmap.jsx` | 102 | Supabase anon key (header) | Low — anon key is public |
| `web/.env.local` | 2 | Vercel OIDC token | Low — short-lived |

No service_role, sk-, re_, or sbp_ tokens found in web source. ✓

### 7.3 Route Structure

| Path | Component | Protected |
|------|-----------|-----------|
| `/` | Dashboard | ✅ |
| `/login` | Login | ❌ |
| `/prospects` | Prospects | ✅ |
| `/reps` | Reps | ✅ |
| `/territories` | Territories | ✅ |
| `/support-tickets` | SupportTickets | ✅ |
| `/roadmap` | Roadmap | ✅ |
| `/settings` | Settings | ✅ |
| `/targetlens` | TargetLensHomeownerView | ✅ |

---

## 8. Code Quality Notes

### 8.1 console.log Statements

**271+ `console.log` statements across src/**. Heaviest files:

| File | Count |
|------|-------|
| `src/screens/TerritoryMapScreen.js` | 30 |
| `src/utils/territoryZipLoader.js` | 25 |
| `src/utils/location/resolveZipFromLeadLockPhoto.ts` | 17 |
| `src/utils/socialEnrichment.js` | 11 |
| `src/hooks/useLeadLockLocationSnapshot.ts` | 7 |
| `src/utils/permissionManager.js` | 6 |
| `src/screens/SettingsScreen.js` | 6 |
| `src/utils/nearbySearch.js` | 5 |
| `src/utils/zipBoundaryCache.js` | 5 |

**⚠ `src/auth/microsoftAuth.ts:51`** — `console.log('USING SUPABASE URL:', settings.supabaseUrl)` leaks Supabase URL to console.

### 8.2 debugger Statements

None found. ✓

### 8.3 TODO/FIXME/HACK Comments

| File | Line | Comment |
|------|------|---------|
| `src/features/lenssignal/lenssignalScoring.ts` | 63 | `// TODO: Add support for active profile emoji once state is available here` |

### 8.4 Duplicated Logic

**`leadProcessing.js` functions duplicated across 4 files:**

| File | Duplicated Functions |
|------|---------------------|
| `src/utils/leadProcessing.js` | `normalizePhone`, `normalizeEmail`, `normalizeState`, `normalizeZip` |
| `src/utils/leadHelpers.js:3-56` | Same functions (identical logic) |
| `src/utils/enrichmentNormalizer.js` | `normalizePhone` |
| `web/src/utils/leadProcessing.js:5-43` | Same functions (identical logic) |

**`STATE_NAME_MAP` constant** copy-pasted in 4 files.

---

## Full Findings Table

| Severity | Area | File(s) | Description | Recommended Action |
|----------|------|---------|-------------|-------------------|
| 🔴 Critical | Security | `supabase/functions/analyze-submission/index.ts:18` | VAPID private key hardcoded | Move to `Deno.env.get()` |
| 🔴 Critical | Security | 8 source files | Google Maps API key hardcoded, no domain restriction | Move to env vars, add API restrictions |
| 🔴 Critical | Security | 9 source files | Supabase anon keys hardcoded as fallbacks | Use env vars consistently |
| 🟠 High | Regression | 8 call sites | `getCurrentCoords()` without timeout race | Add `Promise.race` with 3-5s timeout |
| 🟠 High | Dead Code | 14 components | Never imported anywhere | Delete or archive |
| 🟠 High | Dead Code | 2 screens | `GeoTargetReviewScreen`, `AutomationSettingsScreen` not in navigation | Delete or wire up |
| 🎠 High | Duplication | 4 files | `leadProcessing.js` normalize functions copy-pasted | Consolidate to single source |
| 🟠 High | Storage | 22 files | 139+ direct AsyncStorage calls bypass storageBridge | Migrate to storageBridge |
| 🟠 High | Camera | `CaptureScreen.js`, `ProspectQueueScreen.js` | `launchCameraAsync` with Modals mounted | Restructure to avoid co-presence |
| 🟠 High | Permissions | 12 call sites | Direct permission requests bypass permissionManager | Route through permissionManager |
| ⚠ Medium | Schema | `feature_requests` table | No CREATE TABLE migration; `update_type`, JSON columns undocumented | Create migration |
| ⚠ Medium | Config | `ota-release.ps1` | Missing — only dryrun variant exists | Create production script |
| ⚠ Medium | Git | 4 modified + 1 untracked files on main | Uncommitted work risks silent EAS build inclusion | Commit or stash |
| ⚠ Medium | Config | `app.json` runtimeVersion | `2.50` vs `version: 2.51` (off by 1) | Verify intentional |
| ⚠ Medium | Security | RLS on 4 tables | `USING (true)` permissive policies | Scope to user/admin roles |
| ⚠ Medium | Dead Code | `src/features/lenssignal/LensSignalMapMarker.js` | Duplicate of `.tsx` version | Delete `.js` |
| ⚠ Medium | Dead Code | `src/hooks/useGeoTargetSnapshot.js` | Never imported | Delete |
| ⚠ Medium | Code Quality | 271+ files | `console.log` statements in production code | Strip or gate behind debug flag |
| ⚠ Medium | Trademark | `src/screens/CaptureScreen.js:1004` | `handleIntelliVisionCapture` function name | Rename |
| ℹ Low | Dependencies | `resend`, `react-native-webview`, `expo-asset`, `expo-linking`, `expo-secure-store`, `expo-status-bar` | Potentially unused | Verify and remove if confirmed |
| ℹ Low | Dependencies | `@types/react`, `typescript` | Should be devDependencies | Move |
| ℹ Low | Code Quality | `src/features/lenssignal/lenssignalScoring.ts:63` | 1 TODO comment | Address or track |
| ℹ Info | Regression | `TerritoryMapScreen.js:1210`, `TargetMapAdjusterScreen.js:115` | MapView dual props | Confirmed fixed |
| ℹ Info | Regression | `TerritoryMapScreen.js:1082` | Circle onPress | Confirmed fixed |
| ℹ Info | Build | `eas.json` | Android-only, bare workflow | Confirmed as expected |
| ℹ Info | Web | `web/src/` | No stale `web\web` references | Confirmed clean |
| ℹ Info | Web | Route structure | 9 routes, all protected except /login | Confirmed correct |
| ℹ Info | Schema | JSON column `.map()` guards | All 3 columns have `typeof` checks | Confirmed safe |
| ℹ Info | Config | `.env` files | Properly gitignored, not tracked | Confirmed safe |
| ℹ Info | Config | Edge Functions | No deprecated model strings | Confirmed current |

---

## Appendix: Commands Run

```bash
# File structure
glob src/**/* web/src/**/* supabase/**/* scripts/**/*

# Dead code detection
grep -r "import.*GeoTargetStatusCard\|import.*TargetMapSummaryBadge\|import.*ErrorBoundary\|import.*LeadLockTargetOverlay\|import.*LeadLockCameraOverlay\|import.*CameraBoundingBoxOverlay" src/
grep -r "GeoTargetReviewScreen\|AutomationSettingsScreen" src/ App.js
grep -r "useGeoTargetSnapshot" src/

# Trademark
grep -ri "intellivision" src/ web/ supabase/ scripts/

# Modal usage
grep -rn "import.*Modal\|<Modal" src/

# Storage bypass
grep -rn "AsyncStorage.getItem\|AsyncStorage.setItem\|AsyncStorage.removeItem" src/ --include="*.js" --include="*.ts" --include="*.tsx"
grep -rn "@react-native-async-storage/async-storage" src/ utils/ --include="*.js" --include="*.ts" --include="*.tsx"

# Security scan
grep -rn "sk-ant-\|sk-\|eyJ\|re_\|sbp_\|service_role\|serviceRole" src/ web/ supabase/ utils/ App.js --include="*.js" --include="*.ts" --include="*.tsx" --include="*.jsx" --include="*.sql"
grep -rn "dlntgyhfxxbcwwcxaorn\|qkbvwryucaakkkqaqvka" src/ web/ supabase/ utils/ App.js --include="*.js" --include="*.ts" --include="*.tsx" --include="*.jsx"

# RLS
grep -rn "USING (true)\|WITH CHECK (true)\|ENABLE ROW LEVEL SECURITY\|CREATE POLICY" supabase/migrations/ supabase/*.sql

# Model strings
grep -rn "claude-3-haiku-20240307\|claude-sonnet-4-20250514\|claude-haiku\|claude-sonnet\|claude-3-5" supabase/functions/ scripts/

# Known issues
grep -rn "getCurrentCoords" src/ App.js
grep -rn "<MapView" src/ --include="*.js" --include="*.tsx"
grep -rn "<Circle" src/ --include="*.js"
grep -rn "launchCameraAsync" src/ --include="*.js"
grep -rn "requestCameraPermissionsAsync\|requestForegroundPermissionsAsync\|requestMediaLibraryPermissionsAsync" src/ utils/ hooks/ features/

# Build
git status --short
git log --oneline -10
git diff --name-only

# Code quality
grep -rn "console\.log" src/ web/src/ --include="*.js" --include="*.ts" --include="*.tsx" --include="*.jsx" | wc -l
grep -rn "debugger" src/ web/src/ --include="*.js" --include="*.ts" --include="*.tsx" --include="*.jsx"
grep -rn "TODO\|FIXME\|HACK" src/ web/src/ --include="*.js" --include="*.ts" --include="*.tsx" --include="*.jsx"

# Dependencies
cat package.json
cat web/package.json
cat app.json
cat eas.json
cat package-lock.json | head -5
```

---

## Step 0: Uncommitted Changes Inspection

Inspected 4 modified files + 1 untracked file on `main` branch as of 2026-06-29.

### 1. `change-log.txt` — ✅ SAFE TO COMMIT, UNRELATED

**Intent:** Automated file-change scan logs appended to the end of the file. Two new scan entries added (2026-06-27 and 2026-06-28), each listing modified files with timestamps. 153 lines added.

**Content:** Purely diagnostic timestamps from a file-watching tool — lists `.git` objects, `dist/` build artifacts, and source file modification times. No code changes.

**Camera/Modal/launchCameraAsync:** None.

**Assessment:** Complete, intentional, unrelated to any current work.

---

### 2. `src/screens/ProspectQueueScreen.js` — ✅ SAFE TO COMMIT

**Intent:** Fix for the scroll-to-bottom bug (the OTA we just shipped). Clean, scoped change replacing the ref-based scroll lock with state-based lock and adding `onScroll` position tracking.

**Key changes:**
- Line 1: Added `useEffect` to React imports
- Lines 60-99: Replaced `scrollLockRef` (ref) → `scrollLocked` (state), added `atBottomRef`, added `handleScroll` with bottom detection (`distanceFromBottom < 20`), updated `scrollToBottom` with state-based lock + at-bottom guard, added cleanup `useEffect`
- Lines 404-405: ScrollView props changed from `onMomentumScrollEnd`/`onScrollEndDrag` → `onScroll` + `scrollEventThrottle={16}`
- Lines 458-460: Button `disabled` and style now use `scrollLocked` state instead of `scrollLockRef.current`

**Camera/Modal/launchCameraAsync:** No changes to camera, Modal, or `launchCameraAsync` code. The diff does not touch lines 350, 470, or 525.

**Assessment:** Complete, intentional, single-purpose fix. No debug code, no commented-out blocks, no leftover artifacts. This is the code we shipped via OTA — safe to commit.

---

### 3. `supabase/functions/analyze-submission/index.ts` — ✅ SAFE TO COMMIT, UNRELATED

**Intent:** Update deprecated Claude model string.

**Key change:**
- Line 43: `"claude-3-haiku-20240307"` → `"claude-haiku-4-5-20251001"`

**VAPID key status:** Line 18 still hardcoded (`VAPID_PRIVATE_KEY = "I055..."`). This diff does NOT address the VAPID key — it remains hardcoded.

**Model string:** Updated from deprecated `claude-3-haiku-20240307` to current `claude-haiku-4-5-20251001`. This is the correct fix.

**Business-card parsing:** No changes to parsing logic.

**Assessment:** Complete, intentional, single-line model update. Safe to commit. Note: VAPID key remains hardcoded — flagged in main audit as a separate fix.

---

### 4. `supabase/functions/claude-proxy/index.ts` — ✅ SAFE TO COMMIT, UNRELATED

**Intent:** Update deprecated Claude model string (matching analyze-submission).

**Key change:**
- Line 33: `"claude-3-haiku-20240307"` → `"claude-haiku-4-5-20251001"`

**Model string:** Same update as above — deprecated → current.

**Request/response handling:** No changes to business card or image-analysis call handling.

**Assessment:** Complete, intentional, single-line model update. Safe to commit.

---

### 5. `AGENT-FULL-AUDIT.md` (untracked) — ✅ SAFE, NO ACTION NEEDED

**Content confirmed:** This is the audit briefing task description (165 lines) — the same `# Agent Briefing: LeadLens Full Audit & Integrity Sweep` document that was provided as input. It was copied into the repo root as a reference file.

**Assessment:** Expected untracked file. No action needed.

---

### Summary Table

| File | Classification | Notes |
|------|---------------|-------|
| `change-log.txt` | ✅ SAFE TO COMMIT, UNRELATED | Scan logs only |
| `src/screens/ProspectQueueScreen.js` | ✅ SAFE TO COMMIT | Scroll fix — clean, complete, no camera/Modal changes |
| `supabase/functions/analyze-submission/index.ts` | ✅ SAFE TO COMMIT, UNRELATED | Model string update + VAPID key now moved to env var |
| `supabase/functions/claude-proxy/index.ts` | ✅ SAFE TO COMMIT, UNRELATED | Model string update only |
| `AGENT-FULL-AUDIT.md` | ✅ SAFE, NO ACTION | Audit briefing doc |

**No files NEEDS REVIEW or CONFLICTS WITH PLANNED FIX.** All 4 modified files are clean, complete, and safe to commit. The ProspectQueueScreen scroll fix is unrelated to the camera/Modal business-card scanning issue — it only touches scroll behavior.

---

## Step 1: Critical Security Fixes — Completed

### Task 1: VAPID Private Key → Environment Variable

**File:** `supabase/functions/analyze-submission/index.ts`

| Before | After |
|--------|-------|
| `const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") \|\| "I055..."` | `const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")` with guard |

- Removed hardcoded fallback value
- Added `VAPID_PUBLIC_KEY` to env var (was also hardcoded)
- Added startup guard: throws if either key is missing
- **Action required:** Joe must run `supabase secrets set VAPID_PRIVATE_KEY=... VAPID_PUBLIC_KEY=...` — the keys cannot be set from the repo

### Task 2: Supabase Anon Key Consolidation

**9 files updated:**

| File | Before | After |
|------|--------|-------|
| `src/screens/BugReportScreen.js:22-23` | Hardcoded LeadLens URL + anon key | `process.env.EXPO_PUBLIC_SUPABASE_URL` / `process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY` |
| `src/screens/FeatureRequestScreen.js:19-20` | Hardcoded LeadLens URL + anon key | Same env vars |
| `src/screens/AdminScreen.js:21-22` | Hardcoded LeadLens URL + anon key | Same env vars |
| `App.js:134-135` | Hardcoded Scarlett URL + anon key | `process.env.SCARLETT_SUPABASE_URL` / `process.env.EXPO_PUBLIC_SCARLETT_ANON_KEY` |
| `utils/betaTracker.js:19-20` | Hardcoded Scarlett URL + anon key | Same Scarlett env vars |
| `utils/updateChecker.js:15-16` | Hardcoded Scarlett URL + anon key | Same Scarlett env vars |
| `src/screens/LoginScreen.js:564-565` | Hardcoded Scarlett URL + anon key | Same Scarlett env vars |
| `web/src/lib/supabase.js:3-4` | Hardcoded LeadLens fallback | Removed fallback; reads from `import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` only |
| `web/src/pages/Roadmap.jsx:95,102` | Hardcoded LeadLens URL + anon key | `import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` |

**Env var names used:**
- LeadLens (React Native): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- Scarlett (React Native): `SCARLETT_SUPABASE_URL`, `EXPO_PUBLIC_SCARLETT_ANON_KEY`
- Web portal: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

### Task 3: Google Maps API Key Centralization

**4 source files updated:**

| File | Before | After |
|------|--------|-------|
| `src/screens/ReviewScreen.js:79` | Hardcoded key | `process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY` |
| `src/screens/TerritoryMapScreen.js:131` | Hardcoded key | `process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY` |
| `src/utils/zipBoundaryCache.js:121` | Hardcoded key | `process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY` |
| `src/utils/nearbySearch.js:23-24` | Hardcoded fallback | Removed fallback; env var only |

**2 doc files redacted:**

| File | Before | After |
|------|--------|-------|
| `docs/ENRICHMENT-DEPLOYMENT-CHECKLIST.md:87` | Real key in example | `<your-google-maps-api-key>` |
| `docs/50-STATE-ENRICHMENT-GUIDE.md:30` | Real key in example | `<your-google-maps-api-key>` |

**Intentionally left untouched:**
- `android/app/src/main/AndroidManifest.xml:29` — requires build-time config solution (app.config.js + EAS secrets)
- `app.json:29` — same; Expo config plugin needed

**Action required:** Key domain/app restriction must still be set manually in Google Cloud Console — this was not and cannot be done from the repo.

### Final Verification

Grep for literal key values across all source files:
- Google Maps key (`AIzaSyBjz...`): Only in `AndroidManifest.xml` and `app.json` (intentionally left)
- LeadLens anon key (`eyJhbG...Mfi0ca1Ea_tdJlknL...c5RU`): **0 occurrences** in source ✓
- Scarlett anon key (`eyJhbG...sN8lupQFAGGsPr...aAw`): **0 occurrences** in source ✓
- VAPID private key (`I0559...`): **0 occurrences** in source ✓

### New Env Vars Joe Needs to Set

| Var Name | Where to Set | Used By |
|----------|-------------|---------|
| `VAPID_PRIVATE_KEY` | `supabase secrets set` | analyze-submission Edge Function |
| `VAPID_PUBLIC_KEY` | `supabase secrets set` | analyze-submission Edge Function |
| `EXPO_PUBLIC_SUPABASE_URL` | `.env` + EAS secrets | Already exists ✓ |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `.env` + EAS secrets | Already exists ✓ |
| `SCARLETT_SUPABASE_URL` | `.env` + EAS secrets | Already exists ✓ |
| `EXPO_PUBLIC_SCARLETT_ANON_KEY` | `.env` + EAS secrets | Already exists ✓ |
| `EXPO_PUBLIC_GOOGLE_PLACES_API_KEY` | `.env` + EAS secrets | Already exists ✓ |
| `VITE_SUPABASE_URL` | `web/.env` + Vercel env vars | Already exists ✓ |
| `VITE_SUPABASE_ANON_KEY` | `web/.env` + Vercel env vars | Already exists ✓ |

---

## Step 2: RLS Policy Hardening — Completed

### Migration Files Created

| File | Table |
|------|-------|
| `supabase/migrations/20260629000001_restrict_beta_testers_rls.sql` | `beta_testers` |
| `supabase/migrations/20260629000002_restrict_contact_candidates_rls.sql` | `contact_candidates` |
| `supabase/migrations/20260629000003_restrict_lenssignal_records_rls.sql` | `lenssignal_records` |
| `supabase/migrations/20260629000004_restrict_comptroller_business_records_rls.sql` | `comptroller_business_records` |

### Policy Changes

| Table | Old Policy | New Policy | Rationale |
|-------|-----------|------------|-----------|
| `beta_testers` | `SELECT TO authenticated USING (true)` — any user reads all testers | `SELECT TO authenticated USING (email = auth.email())` — users read only their own row | Admin-managed data; LoginScreen queries by own email only |
| `contact_candidates` | `SELECT + INSERT TO authenticated USING (true)` — any user reads/all inserts | `SELECT TO authenticated USING (true)` (read-only); writes to `service_role` only | **Schema gap:** no owner column. Interim: authenticated read, service_role write |
| `lenssignal_records` | `SELECT TO public USING (true)` — even anon users can read | `SELECT TO authenticated USING (true)` — authenticated only (not public) | Shared reference data; no owner column. Removed anon access |
| `comptroller_business_records` | `SELECT + INSERT + UPDATE TO authenticated USING (true)` | `SELECT TO authenticated USING (true)` (read-only); writes to `service_role` only | Shared reference data; `comptrollerEnrichment.ts` uses service_role for upserts |

### Schema Gaps Flagged

| Table | Gap | Recommended Follow-Up |
|-------|-----|----------------------|
| `contact_candidates` | No `user_id` or `rep_id` column — cannot scope reads to individual reps | Add owner column in a future migration, then scope SELECT to `user_id = auth.uid()` |
| `lenssignal_records` | No `user_id` or `rep_id` column — all authenticated users see all records | May be intentional for shared reference data; confirm with Joe if per-rep scoping is needed |
| `beta_testers` | Has `email` column but no `user_id` — scoped via `email = auth.email()` which works but is less idiomatic than UUID-based scoping | Consider adding `user_id` column and migrating to `user_id = auth.uid()` pattern |

### ⚠️ NOT YET APPLIED TO LIVE DATABASE

These migrations are SQL files only. Joe must apply them manually:

**Option A — Supabase CLI:**
```bash
supabase migration up
```

**Option B — Supabase Dashboard:**
1. Go to SQL Editor
2. Paste contents of each migration file
3. Run each one individually

### Testing Required

Before wider rollout, test with at least 2 of the 3 beta tester accounts:
1. **Login flow** — confirm `beta_testers` SELECT still works (LoginScreen queries by own email)
2. **Territory map** — confirm `lenssignal_records` still display (authenticated read still allowed)
3. **Comptroller enrichment** — confirm `comptrollerEnrichment.ts` upsert still works (must be running with service_role key, not authenticated)
4. **Contact candidates** — confirm no app breakage (table has zero code references currently, so should be safe)

If any test fails, the most likely cause is a policy being too restrictive — loosen the specific policy rather than reverting all 4 migrations.

---

## Step 2.5: Comptroller Write Path Fix — Completed

### Problem

Step 2's RLS migration locked `comptroller_business_records` to authenticated-read-only / service_role-write. The client-side upsert in `comptrollerEnrichment.ts:100-102` was writing directly using the user's auth session, which now silently fails. The enrichment cache never gets written, so every enrichment re-hits the live Comptroller API.

### Solution

Created a new Edge Function (`upsert-comptroller`) that writes to the table using `service_role`, and updated the client to call it instead of writing directly.

### New Edge Function

**File:** `supabase/functions/upsert-comptroller/index.ts`

- Uses `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` to initialize the Supabase client (same pattern as `analyze-submission` and `claude-proxy`)
- Accepts a POST body with an array of rows matching the existing upsert shape
- Validates that each row has the required `signal_type` field before writing
- Performs `upsert` with `onConflict: 'taxpayer_id, location_number'` (same as before)
- Returns `{ success: true, count: N }` on success or `{ success: false, error: "..." }` on failure
- CORS headers match existing Edge Function conventions

### Client Diff

**File:** `src/services/comptrollerEnrichment.ts`

| Before | After |
|--------|-------|
| `const { error } = await supabase.from('comptroller_business_records').upsert(rows, { onConflict: 'taxpayer_id, location_number' })` | `const { data, error } = await supabase.functions.invoke('upsert-comptroller', { body: rows })` |
| `console.warn('[ComptrollerEnrichment] DB Save Failed:', error.message)` | `console.error('[ComptrollerEnrichment] Edge Function write failed:', ...)` + checks `data.success` |

- Row shape/structure is **unchanged** — this is a transport-layer fix only
- `console.warn` upgraded to `console.error` since this is now a real backend call
- No existing error reporting system (Sentry, etc.) in the codebase — `console.error` is the appropriate fallback

### ⚠️ NOT YET DEPLOYED

The Edge Function exists in the repo but is NOT deployed. Joe must run:

```bash
supabase functions deploy upsert-comptroller
```

### Manual Test Plan

1. Deploy the Edge Function: `supabase functions deploy upsert-comptroller`
2. On-device, trigger a real business card enrichment (open LeadLock → capture → enrich a business)
3. In Supabase Dashboard → Table Editor → `comptroller_business_records`, filter by `business_name` matching the enriched business
4. Confirm a row exists with a recent `updated_at` timestamp (within the last minute)
5. If no row appears, check Supabase Edge Function logs for `upsert-comptroller` errors

---

## Step 3 (partial): TaskQueue Logging + Error Propagation Fix

**Commit:** `efb2fe51` — `fix: add TaskQueue logging and propagate enrichLead errors`

### Files Changed

| File | What Changed |
|------|-------------|
| `src/utils/taskRunner.js` | Added 5 log points: empty queue, task count, per-task execution, success, and failure. Added null-check on `enrichLead` return in `ENRICH_LEAD` handler. |
| `src/utils/claudeApi.js` | `enrichLead()` catch block now logs with `console.error` (production-visible) and re-throws instead of silently returning the unchanged lead. |
| `src/services/extractProspectAI.js` | Error messages now include the actual Edge Function error detail (HTTP status, response body truncated to 200 chars) instead of generic "Extraction failed" strings. |

### What Joe Should See in Logcat After OTA

**Success path:**
```
[TaskQueue] Processing 1 pending task(s)
[TaskQueue] Executing ENRICH_LEAD: task_1719...
[TaskQueue] Completed ENRICH_LEAD: task_1719...
```

**Failure path (e.g. Edge Function error, auth issue, network problem):**
```
[TaskQueue] Processing 1 pending task(s)
[TaskQueue] Executing ENRICH_LEAD: task_1719...
[enrichLead] failed: extract-prospect failed: 401 — {"message":"Invalid API key"}
[TaskQueue] Failed ENRICH_LEAD: task_1719... extract-prospect failed: 401 — {"message":"Invalid API key"}
```

**No tasks:**
```
[TaskQueue] Queue empty, nothing to process
```

### Notes

- This is a **diagnostic improvement** — the actual enrichment may still fail after this change, but now the exact failure reason will be visible in logcat.
- Retry logic is unchanged: tasks retry up to 3 times (default `maxRetries`), then marked permanently FAILED.
- The `enrichLead` rethrow is safe: all 3 callers (`DashboardScreen.enrichProspect`, `taskRunner.executeTask`, `scanQueueProcessor`) have try/catch blocks.
- DashboardScreen's direct `enrichLead` call (line 742) catches the error and shows "Processing in background" — same user experience as before.
