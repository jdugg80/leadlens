# LeadLens Integrity Sweep — 2026-08-07

## 1. Known Flagged Items

### ZipResolver Vestigial Calls

| File | Line(s) | Description | Severity |
|------|---------|-------------|----------|
| `src\screens\LeadLockCameraScreen.js` | 531 | `resolveZipFromLeadLockPhoto` called inside `handleDetectBusinesses` — redundant because Path A (useEffect at line 183) already populates `resolvedZipRef` before detection runs | CONFIRMED |
| `src\screens\LeadLockCameraScreen.js` | 654 | `resolveZipFromLeadLockPhoto` called inside `handleAddToQueue` as fallback — redundant because enrichment already populates lat/lon/city/zip via `convertSelectedBusinessesToProspects` | CONFIRMED |

### `duplicate_of` Column / Dedupe Handling

| File | Line(s) | Description | Severity |
|------|---------|-------------|----------|
| `supabase\migrations\DIAGNOSIS-PROSPECT-SCHEMA.md` | 88-89 | `duplicate_of` column exists on `prospects` (all 1582 rows NULL); never written by any code path | CONFIRMED |
| `src\utils\backendSync.js` | 23-66 | `buildRow()` — sole write path to `prospects` — does NOT include `duplicate_of`, `discovery_signal`, `confidence_score`, `enrichment_status`, or `source_type`; all remain NULL forever | CONFIRMED |
| `src\screens\BatchReviewScreen.js` | 155-157 | Client-side `findDuplicateInLeads` check writes `duplicateWarning` text only; never writes to Supabase `duplicate_of` column | INFO |

### ProspectQueueScreen Header-Clipping Bug

| File | Line(s) | Description | Severity |
|------|---------|-------------|----------|
| `src\screens\ProspectQueueScreen.js` | 944 | SafeAreaView wraps screen with `edges={['top']}`; content paddingTop is 12px. Header is not clipped — the SafeAreaView properly handles it | INFO |
| `src\screens\ProspectQueueScreen.js` | 815, 897 | Edit and Import modals rendered outside SafeAreaView; bottom-sheet modals may not account for notch on Android | CANDIDATE |
| `src\screens\ProspectQueueScreen.js` | 819 | Edit modal title reads `"TEST123 TEST123 Edit Prospect"` — stale debug text in production code | CONFIRMED |

### TargetLens `targetlens_permits` Filter Logic

| File | Line(s) | Description | Severity |
|------|---------|-------------|----------|
| `src\utils\buildingPermitsService.js` | 48 | References `r.issue_date` (snake_case) alongside `r.issueDate` — dual-format adapter pattern, not a bug | INFO |
| `src\utils\buildingPermitsService.js` | 1-93 | No references to `work_class`, `upgrade_category`, `is_efficiency_related`, or `linked_prospect_id` — no stale field references | INFO |

---

## 2. Silent Failure / Error Handling Regression Check

### Empty Catch Blocks

| File | Line(s) | Description | Severity |
|------|---------|-------------|----------|
| `src\screens\LoginScreen.js` | 374 | `catch (_) {}` — BetaTracker.init failure silently swallowed during login | CANDIDATE |
| `src\screens\GeoTargetReviewScreen.js` | 84 | Inner `catch {}` — Overpass API result-parsing silently fails; outer catch shows alert but inner geocode failures invisible | CANDIDATE |
| `src\utils\aiWelcome.js` | 51 | `catch {}` — `markAIWelcomeShownToday()` write to raw AsyncStorage silently swallowed | CANDIDATE |
| `src\utils\tutorialManager.js` | 14 | `catch {}` — silent failure reading tutorial state from raw AsyncStorage | CANDIDATE |
| `src\utils\storage.js` | 493 | `catch {}` — silent failure during prefix-key enumeration in `removeByPrefix()` | CANDIDATE |
| `src\utils\soundEffects.ts` | 119 | `catch {}` — silent failure on `sound.unloadAsync()` during replay fallback | INFO |
| `src\utils\aiWelcome.js` | 20 | `catch { return true; }` — safe default; acceptable | INFO |
| `src\utils\aiWelcome.js` | 39 | `catch { return false; }` — safe default; acceptable | INFO |
| `src\context\ProcessingContext.js` | 14 | `catch { return false; }` — default "not processing" on read failure | INFO |
| `src\utils\backendEmail.js` | 27 | `catch { data = null; }` — non-JSON response handled gracefully | INFO |
| `src\utils\autoExport.js` | 145 | `catch { usedComposer = false; }` — MailComposer falls through to Sharing | INFO |
| `src\utils\auth.js` | 195 | `catch { /* invalid % sequences */ }` — intentionally bare for `decodeURIComponent` | INFO |
| `src\features\cardScan\processing\scanQueueProcessor.js` | 60 | `catch { return false; }` — `fileExists()` returning false on error is correct semantics | INFO |
| `src\utils\nearbySearch.js` | 623 | `catch { return null; }` — Google Places details failure returns null | INFO |
| `src\utils\geoEnrich.js` | 161, 209 | `catch { return null; }` — Nominatim geocoding failure returns null | INFO |
| `src\utils\socialEnrichment.js` | multiple | Multiple `catch {}` / `catch { return ''; }` in URL-parsing and email-extraction helpers | INFO |
| `src\utils\templateSettings.js` | 61, 90, 120 | `catch { return DEFAULT_...; }` — parse failures return defaults | INFO |
| `src\utils\territoryUtils.js` | 66, 81, 90 | `catch { return []; }` / `catch {}` — returns empty array on error | INFO |
| `src\utils\permissionManager.js` | 18 | `catch { return false; }` — permission flag read failure defaults to "not requested" | INFO |
| `src\utils\backgroundStability.js` | 77, 86 | `catch {}` — internal URL-opening failures silently caught; best-effort OS intents | INFO |
| `src\screens\DashboardScreen.js` | 297, 332 | `catch { rawLeads = []; }` — MMKV sync parse failure defaults to empty array | INFO |

### Fire-and-Forget `.catch(() => {})` — Regression Candidates

| File | Line(s) | Description | Severity |
|------|---------|-------------|----------|
| `src\screens\DashboardScreen.js` | 618 | `AsyncStorage.clearUserSession().catch(() => {})` — session clear failure silently swallowed during logout | CONFIRMED |
| `src\screens\DashboardScreen.js` | 772 | `processQueue().catch(() => {})` — background enrichment queue failure silent | CANDIDATE |
| `src\screens\BatchReviewScreen.js` | 432 | `processQueue().catch(() => {})` — background processing failure after save silent | CANDIDATE |
| `src\screens\ExportScreen.js` | 229 | `processQueue().catch(() => {})` — post-export queue processing failure silent | CANDIDATE |
| `src\screens\CaptureScreen.js` | 555 | `updateScanSessionStatus(...FAILED).catch(() => {})` — scan session stuck in wrong state | CANDIDATE |
| `src\screens\CaptureScreen.js` | 1294, 1464 | `updateScanSessionStatus(...COMPLETED).catch(() => {})` — session marked complete but write failure leaves stale state | CANDIDATE |
| `src\screens\BatchReviewScreen.js` | 430 | `enqueueEnrichLead(lead).catch(() => {})` — enrichment request silently lost | CANDIDATE |
| `src\screens\TerritoryMapScreen.js` | 212-232 | Five `AsyncStorage.setItem(...).catch(() => {})` — map filter/region/prefs saves silently lost | CANDIDATE |
| `src\screens\TerritoryMapScreen.js` | 641 | `saveMyZips(resolvedMyZips).catch(() => {})` — territory ZIP assignments silently lost | CANDIDATE |
| `src\screens\TerritoryMapScreen.js` | 927 | Broader `.catch(() => {})` — silent swallowing of an entire operation block | CANDIDATE |
| `src\screens\ReviewScreen.js` | 549 | `AsyncStorage.setJSON(LEADS_STORAGE_KEY, updatedLeads).catch(() => {})` — lead data write failure silent | CANDIDATE |
| `src\screens\LeadLockCameraScreen.js` | 223, 281, 307, 405 | `storageBridge.setItem('currentLocation', ...).catch(() => {})` — location data write failure silent | CANDIDATE |
| `src\screens\DashboardScreen.js` | 359 | `AsyncStorage.setItem(goalKey, 'true').catch(() => {})` — daily goal chime flag write failure | INFO |
| `src\screens\SettingsScreen.js` | 307 | `loadAIRecommendationSettings().then(...).catch(() => {})` — settings load failure silent | CANDIDATE |
| `src\screens\ExportScreen.js` | 424 | `RawStorage.removeItem(LEADS_STORAGE_KEY).catch(() => {})` — leads backup cleanup failure | CANDIDATE |
| `src\utils\autoExport.js` | 204 | `maybeRunAutoExport(user).catch(() => {})` — auto-export failure silent | CANDIDATE |

### Fire-and-Forget `.catch(() => {})` — Acceptable (UI/Sound/Telemetry)

| Description | Severity |
|-------------|----------|
| `.catch(() => {})` on `playSoundEffect(...)`, `playErrorSound(...)`, `Linking.openURL(...)`, `Linking.openSettings(...)`, `recordUserActivityEvent(...)`, `BetaTracker.endSession()`, `registerLensSignalPushToken()`, `markAIWelcomeShownToday()`, `preloadSoundEffects()` | INFO |

---

## 3. Storage Access Convention Violations

### Direct Imports of AsyncStorage Outside storageBridge

| File | Line(s) | Description | Severity |
|------|---------|-------------|----------|
| `src\screens\BugReportScreen.js` | 19 | `import AsyncStorage from '@react-native-async-storage/async-storage'` — bypasses storageBridge entirely | CONFIRMED |
| `src\screens\FeatureRequestScreen.js` | 16 | `import AsyncStorage from '@react-native-async-storage/async-storage'` — same pattern | CONFIRMED |
| `src\utils\supabaseClient.js` | 3 | `import AsyncStorage from '@react-native-async-storage/async-storage'` — used for Supabase auth adapter; justified in comments | CANDIDATE |

### `require()` of Raw AsyncStorage Outside storageBridge

| File | Line(s) | Description | Severity |
|------|---------|-------------|----------|
| `src\utils\aiWelcome.js` | 27 | `require('@react-native-async-storage/async-storage').default` — bypasses storageBridge | CONFIRMED |
| `src\utils\auth.js` | 114 | `require('@react-native-async-storage/async-storage').default` — raw storage for PKCE key cleanup | CANDIDATE |
| `src\screens\DashboardScreen.js` | 294, 329 | `require('@react-native-async-storage/async-storage').default` — raw storage fallback in MMKV parse error paths | CANDIDATE |
| `src\screens\ExportScreen.js` | 423 | `require('@react-native-async-storage/async-storage').default` — raw `removeItem` to clean leads backup | CANDIDATE |
| `src\screens\LeadLockCameraScreen.js` | 699 | `require('@react-native-async-storage/async-storage').default` — raw fallback for leads queue read | CANDIDATE |
| `src\screens\LoginScreen.js` | 389 | `require('@react-native-async-storage/async-storage').default` — raw storage for leads backup during user-switch | CANDIDATE |
| `src\screens\SettingsScreen.js` | 456, 718 | `require('@react-native-async-storage/async-storage').default` — raw storage for queue clear and data wipe | CANDIDATE |
| `src\screens\TerritoryMapScreen.js` | 533, 655 | `require('@react-native-async-storage/async-storage').default` — raw storage fallback for leads reload | CANDIDATE |
| `src\utils\permissionManager.js` | 15, 29 | `require('@react-native-async-storage/async-storage').default` — bypasses storageBridge for permission flags | CANDIDATE |
| `src\utils\territoryUtils.js` | 9 | `require('@react-native-async-storage/async-storage').default` — raw storage for territory ZIP reads | CANDIDATE |
| `src\utils\territoryZipLoader.js` | 154 | `require('@react-native-async-storage/async-storage').default` — raw storage fallback for ZIP boundary cache | CANDIDATE |
| `src\utils\tutorialManager.js` | 30, 48 | `require('@react-native-async-storage/async-storage').default` — bypasses storageBridge for tutorial seen flags | CONFIRMED |
| `src\utils\zipBoundaryCache.js` | 43, 79 | `require('@react-native-async-storage/async-storage').default` — raw storage for ZIP boundary cache | CANDIDATE |

---

## 4. Modal / Camera Conflict Convention

| File | Line(s) | Description | Severity |
|------|---------|-------------|----------|
| `src\components\CameraModal.js` | 214, 233, 260 | `<Modal>` with CameraView — in-app modal (not Android intent), correct pattern | INFO |
| `src\components\ScanCameraModal.js` | 59, 71, 95 | `<Modal>` with CameraView — in-app modal, correct pattern | INFO |
| `src\components\ExportModal.tsx` | 197 | `<Modal visible animationType="slide" transparent>` — non-camera UI modal, no conflict | INFO |
| `src\components\LeadFiltersBottomSheet.js` | 259 | `<Modal visible transparent animationType="slide">` — non-camera filter sheet, no conflict | INFO |
| `src\components\ProspectOutreachModal.js` | 146 | `<Modal>` with `statusBarTranslucent` — non-camera outreach dialog, no conflict | INFO |
| `src\components\ThemedAlert.js` | 82 | `<Modal>` with `statusBarTranslucent` — global alert host, no conflict | INFO |
| `src\components\TutorialOverlay.js` | 66 | `<Modal animationType="none">` — overlay tutorial, no conflict | INFO |
| `src\screens\ProspectQueueScreen.js` | 815, 897 | Two `<Modal>` instances — non-camera UI, no conflict | INFO |
| `src\screens\CaptureScreen.js` | 1839, 1898, 1925 | Three `<Modal>` instances — data-management modals, not camera modals | INFO |
| `src\screens\CardGalleryScreen.js` | 261 | `<Modal>` for full-screen card preview — non-camera, no conflict | INFO |
| `src\screens\ExportScreen.js` | 755, 797 | Two `<Modal>` instances — non-camera data-mapping modals | INFO |
| `src\screens\SettingsScreen.js` | 1713 | `<Modal>` for admin authentication — non-camera, no conflict | INFO |
| `src\screens\TerritoryMapScreen.js` | 1935 | `<Modal>` for TargetLens profile selector — non-camera, no conflict | INFO |
| `App.js` | 495 | `<Modal>` for update notification — non-camera, no conflict | INFO |

**No violations found.** All Modal usages are non-camera UI overlays or properly designed in-app camera modals.

---

## 5. Version Sync Integrity

| File | Line(s) | Value | Severity |
|------|---------|-------|----------|
| `app.json` | 5 | `"version": "2.0.62"` | INFO |
| `app.json` | 22 | `"versionCode": 62` | INFO |
| `app.json` | 15 | `"runtimeVersion": "2.0.62"` | INFO |
| `app.json` | 95 | `"betaBuild": 62` | INFO |
| `android\app\build.gradle` | 118 | `versionCode 62` — matches app.json | INFO |
| `android\app\build.gradle` | 119 | `versionName "2.0.62"` — matches app.json | INFO |
| `package.json` | 3 | `"version": "2.0.62"` — matches app.json | INFO |
| `eas.json` | 4 | `"appVersionSource": "local"` — version managed locally | INFO |
| `eas.json` | 7-31 | All three profiles use `android.buildType: "apk"` — production should typically use AAB | CANDIDATE |
| `eas.json` | 21 | Preview has `autoIncrement: true`, production has `autoIncrement: false` — potential drift risk | CANDIDATE |

---

## 6. Dead Code & Stale Artifacts

### Exported Functions/Components with Zero Import References

| File | Line(s) | Description | Severity |
|------|---------|-------------|----------|
| `src\utils\addressGeocoder.js` | 250 | `export function clearGeocodeCache()` — never imported | CONFIRMED |
| `src\utils\addressGeocoder.js` | 257 | `export function getGeocachStats()` — never imported (also typo: "Geocach") | CONFIRMED |
| `src\services\enrichmentProviders\index.js` | 59 | `export function getProviderStatus()` — never imported | CONFIRMED |
| `src\utils\buildingPermitsService.js` | 92 | `export function clearPermitsCache()` — never imported | CONFIRMED |
| `src\utils\buildingPermitsService.js` | 93 | `export function getPermitsCacheStats()` — never imported | CONFIRMED |
| `src\utils\businessCardEnricher.js` | 223 | `export function scoreEnrichmentQuality()` — never imported | CONFIRMED |
| `src\components\AppScreenBackground.js` | 10 | `export const DEFAULT_BACKGROUND_VARIANT = 'original'` — never imported | CONFIRMED |
| `src\screens\PlaceholderScreen.js` | 4 | `export default function PlaceholderScreen` — entire file unreferenced | CONFIRMED |

### Orphaned Files

| File | Description | Severity |
|------|-------------|----------|
| `src\examples\ProspectQueueScreen.example.js` | Example file never imported | CONFIRMED |
| `src\examples\DashboardScreen.example.js` | Example file never imported | CONFIRMED |
| `src\examples\SettingsScreen.example.js` | Example file never imported | CONFIRMED |
| `src\examples\TerritoryMapScreen.example.js` | Example file never imported | CONFIRMED |
| `src\examples\TerritoryMap_static_activity_example.js` | Example file never imported | CONFIRMED |
| `src\screens\PlaceholderScreen.js` | Placeholder screen never referenced | CONFIRMED |

### Stale Root-Level Fix Scripts

| File | Severity |
|------|----------|
| `fix-beta-55.js` | CONFIRMED |
| `fix-leadlock-orbit-dots-fallback.js` | CONFIRMED |
| `fix-leadlock-radar-animation.js` | CONFIRMED |
| `fix-leadlock-orbit-arc-native-driver.js` | CONFIRMED |
| `fix-leadlock-header-zip-badge.js` | CONFIRMED |
| `fix-leadlock-camera-overlay-structure.js` | CONFIRMED |
| `fix-leadlock-zip-ux.js` | CONFIRMED |

### `utils/updateChecker.js` — Dead File

| File | Line(s) | Description | Severity |
|------|---------|-------------|----------|
| `utils\updateChecker.js` | 20-89 | `checkForUpdate()` export — never imported in `src/`; App.js defines its own inline version | CANDIDATE |

### Backup Files

| File | Description | Severity |
|------|-------------|----------|
| `src\screens\LeadLockCameraScreen.js.bak-1783636732611` | Committed backup | CANDIDATE |
| `src\screens\LeadLockCameraScreen.js.bak-1783630542001` | Committed backup | CANDIDATE |
| `src\screens\LeadLockCameraScreen.js.bak-1783636727752` | Committed backup | CANDIDATE |

### Commented-Out Code (>5 lines)

| File | Line(s) | Description | Severity |
|------|---------|-------------|----------|
| `src\services\enrichmentProviders\index.js` | 18-19 | Commented-out imports for future providers | INFO |

### TODO/FIXME/HACK/XXX Comments

| File | Line(s) | Description | Severity |
|------|---------|-------------|----------|
| `src\features\lenssignal\lenssignalScoring.ts` | 63 | `// TODO: Add support for active profile emoji once state is available here` | INFO |
| `src\utils\buildingPermitsService.js` | 5 | Comment mentions "Original resource IDs were placeholders" — stale design note | INFO |

### AGENT-DIAGNOSE-* / AGENT-FIX-* References

No references found.

---

## 7. Debug/Leftover Statement Sweep

### `console.log` Calls Outside Logging Utilities

| File | Line(s) | Description | Severity |
|------|---------|-------------|----------|
| `src\utils\auth.js` | 20 | `console.log('OAUTH_REDIRECT_URL', AUTH_REDIRECT_URL)` — logs full redirect URL | CONFIRMED |
| `src\utils\auth.js` | 109-110 | `console.log('OAUTH_START_GOOGLE')` / `console.log('OAUTH_START_MICROSOFT')` | CANDIDATE |
| `src\utils\auth.js` | 119 | `console.log('[Auth] Cleared stale PKCE keys:', pkceKeys)` — logs key data | CANDIDATE |
| `src\utils\auth.js` | 153, 165, 215, 235 | `console.log('OAUTH_RESULT_TYPE', ...)`, `console.log('OAUTH_SESSION_RECOVERED', ...)`, `console.log('OAUTH_SESSION_CREATED', ...)` | CANDIDATE |
| `src\auth\microsoftAuth.ts` | 51 | `console.log('USING SUPABASE URL:', settings.supabaseUrl)` — logs Supabase URL on every auth attempt | CONFIRMED |
| `src\auth\microsoftAuth.ts` | 94 | `console.log('MICROSOFT / OAUTH AUTH URL:', data?.url)` — logs full OAuth URL | CONFIRMED |
| `src\auth\microsoftAuth.ts` | 107 | `console.log('OAUTH RESULT:', result)` — logs entire OAuth result object | CONFIRMED |
| `src\screens\BatchReviewScreen.js` | 369 | `console.log('[BatchReview][SAVE_DEBUG] reconciled read:', ...)` — tagged SAVE_DEBUG | CONFIRMED |
| `src\screens\BatchReviewScreen.js` | 373 | `console.log('[BatchReview][SAVE_DEBUG] LEADS_STORAGE_KEY:', ...)` — tagged SAVE_DEBUG | CONFIRMED |
| `src\utils\territoryZipLoader.js` | 181 | `console.log('[DEBUG] Attempting to create Supabase client...')` — tagged DEBUG | CONFIRMED |
| `src\utils\territoryZipLoader.js` | 182 | `console.log('[DEBUG] EXPO_PUBLIC_SUPABASE_URL:', ...)` — logs env var | CONFIRMED |
| `src\utils\territoryZipLoader.js` | 183 | `console.log('[DEBUG] EXPO_PUBLIC_SUPABASE_ANON_KEY:', ...)` — truncates and logs Supabase anon key | CONFIRMED |
| `src\utils\territoryZipLoader.js` | 186, 189 | `console.log('[DEBUG] Client created:', ...)` / `console.log('[DEBUG] Error creating client:', ...)` | CONFIRMED |
| `src\components\LeadFiltersBottomSheet.js` | 295 | `{console.log('[LeadFiltersBottomSheet] rendering filter sections')}` — console.log inside JSX render | CONFIRMED |
| `src\screens\CaptureScreen.js` | multiple | ~45 `console.log` calls across CaptureScreen.js — massive debug logging in production code | CONFIRMED |
| `src\screens\DashboardScreen.js` | 710-749 | `console.log("BATCH DELETE BUTTON PRESSED FOR PROSPECTS:", ...)`, `console.log("DELETE BUTTON PRESSED FOR PROSPECT:", ...)`, `console.log("DELETE TARGET ID:", ...)` — UI action debug logging | CONFIRMED |
| `src\hooks\useLeadLockLocationSnapshot.ts` | 23, 27, 44, 50, 67, 70, 82 | 7 `console.log` calls for location permission/position flow | CANDIDATE |
| `src\components\CameraModal.js` | 179, 192 | `console.log('[CameraModal] Starting capture...')` / `console.log('[CameraModal] Capture successful...')` | CANDIDATE |
| `src\context\ProcessingContext.js` | 47, 57 | `console.log('[ProcessingContext] Lock acquired:', ...)` / `console.log('[ProcessingContext] Lock released')` | CANDIDATE |
| `src\features\cardScan\storage\scanCards.js` | 32 | `console.log('[scanCards] Created card:', ...)` | CANDIDATE |
| `src\features\cardScan\storage\scanDb.js` | 48 | `console.log('[scanDb] Database initialized')` | CANDIDATE |
| `src\features\cardScan\storage\scanSessions.js` | 23, 59 | `console.log('[scanSessions] Created session:', ...)` / `console.log('[scanSessions] Updated session', ...)` | CANDIDATE |
| `src\services\comptrollerEnrichment.ts` | 24 | `console.log('[ComptrollerEnrichment] Searching for:', ...)` | CANDIDATE |
| `src\services\contactSignal\contactSignalService.ts` | 41, 118 | `console.log('[ContactSignal] Starting enrichment...')` / `console.log('[ContactSignal] Enrichment complete:', ...)` | CANDIDATE |
| `src\services\enrichmentProviders\bizcollectProvider.js` | 199, 238, 242, 248 | `console.log('[BizCollect] Searching:', ...)`, `console.log('[BizCollect] Found', ...)` | CANDIDATE |
| `src\services\enrichmentProviders\index.js` | 48, 52 | `console.log('[Enrichment] No contact enrichment provider available')` / `console.log('[Enrichment] Using provider:', ...)` | CANDIDATE |
| `src\utils\backendSync.js` | 248, 312, 492, 510 | `console.log('[PullSync] Starting deep sync...')`, `console.log('[PullSync] Restored', ...)`, `console.log('[FullSync] Pushing/Pulling...')` | CANDIDATE |
| `src\utils\claudeApi.js` | 137 | `console.log('[extractProspectRobust] image_type=', ...)` — logs parsed AI output | CANDIDATE |
| `src\screens\DashboardScreen.js` | 287, 289, 304, 318 | `console.log('[DashboardScreen] Subscribing...')`, `console.log('[DashboardScreen] Territory zips changed...', ...)` | CANDIDATE |
| `src\screens\SettingsScreen.js` | 313, 324 | `console.log("[Settings] Loading remote preferences for:", ...)` / `console.log("[Settings] Remote preferences loaded successfully")` | CANDIDATE |

### Hardcoded API Keys / Secrets

| File | Line(s) | Description | Severity |
|------|---------|-------------|----------|
| `src\screens\BetaFeedbackScreen.js` | 17 | `const SCARLETT_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'` — Full JWT token hardcoded in source; should use `process.env.EXPO_PUBLIC_SCARLETT_ANON_KEY` | CONFIRMED |
| `src\screens\BetaFeedbackScreen.js` | 16 | `const SCARLETT_URL = 'https://dlntgyhfxxbcwwcxaorn.supabase.co'` — Supabase project URL hardcoded | CONFIRMED |
| `src\screens\LoginScreen.js` | 595 | `process.env.SCARLETT_SUPABASE_URL || 'https://dlntgyhfxxbcwwcxaorn.supabase.co'` — hardcoded fallback URL for Scarlett | CANDIDATE |
| `src\screens\AdminScreen.js` | 33 | `const DEFAULT_PIN = '1234'` — hardcoded default admin PIN | CANDIDATE |

### Hardcoded Test/Fake Data (Non-Test Source)

| File | Line(s) | Description | Severity |
|------|---------|-------------|----------|
| `src\screens\ManualEntryScreen.js` | 136 | `placeholder="(555) 555-5555"` — UI placeholder hint | INFO |
| `src\screens\SettingsScreen.js` | 774, 783, 1464, 1533 | `placeholder="you@example.com"`, `placeholder="(555) 555-5555"`, `placeholder="ops@example.com"` — UI input placeholders | INFO |
| `src\screens\SupportScreen.js` | 149 | `placeholder="jane@example.com"` — UI placeholder | INFO |

### Duplicate `react-native-url-polyfill` Imports

| File | Line(s) | Description | Severity |
|------|---------|-------------|----------|
| `App.js` | 1 | `import 'react-native-url-polyfill/auto'` at app entry point | INFO |
| `src\lib\supabase.ts` | 1 | Same import — duplicate | INFO |
| `src\utils\auth.js` | 1 | Same import — third duplicate | INFO |
| `src\utils\supabaseClient.js` | 1 | Same import — fourth duplicate | INFO |

---

## 8. React Native / Expo Pattern Consistency

### GPS Calls with Timeout Race

| File | Line(s) | Description | Severity |
|------|---------|-------------|----------|
| `App.js` | 227-230 | `getCurrentCoords()` wrapped in `Promise.race` with 5s timeout — correct | INFO |
| `src\screens\CaptureScreen.js` | 578-581 | `getCurrentCoords()` wrapped in `Promise.race` with 5s timeout — correct | INFO |
| `src\utils\geoEnrich.js` | 42-44 | `getCurrentCoords()` itself calls `Location.getCurrentPositionAsync()` WITHOUT internal timeout; relies on caller to wrap with race — can hang indefinitely if caller forgets | CANDIDATE |
| `src\utils\geoTargetLocation.js` | 11-13, 162-168 | Uses `withTimeout()` helper with `Promise.race` — self-contained timeout, correct | INFO |
| `src\hooks\useLeadLockLocationSnapshot.ts` | 24 | Calls `Location.requestForegroundPermissionsAsync()` — timeout wrapping needs verification | CANDIDATE |
| `src\features\lenssignal\saveUserLocationStatus.ts` | 31 | Calls `Location.getCurrentPositionAsync()` — unclear if wrapped in timeout | CANDIDATE |

### MapView initialRegion + region Conflict

| File | Line(s) | Description | Severity |
|------|---------|-------------|----------|
| `src\screens\TerritoryMapScreen.js` | 1622 | Uses `initialRegion` only — correct | INFO |
| `src\screens\TargetMapAdjusterScreen.js` | 119 | Uses `initialRegion` only — correct | INFO |
| `src\screens\GeoTargetReviewScreen.js` | 211 | Uses `region` only with `scrollEnabled={false}` — correct for controlled mini-map | INFO |
| `src\screens\LeadLockReviewScreen.js` | 453 | Uses `region` only with `scrollEnabled={false}` — correct | INFO |

### Circle onPress (Android-Unsupported)

| File | Line(s) | Description | Severity |
|------|---------|-------------|----------|
| `src\screens\TerritoryMapScreen.js` | 1519-1527 | `<Circle>` does NOT have `onPress` handler; adjacent `<Marker>` handles tap — no violation | INFO |

### checkForUpdate() Wrapped in `if (!__DEV__)`

| File | Line(s) | Description | Severity |
|------|---------|-------------|----------|
| `App.js` | 317 | `checkForUpdate(...)` wrapped in `if (!__DEV__)` — correct | INFO |
| `App.js` | 16-23 | `Sentry.init()` wrapped in `if (!__DEV__)` — correct | INFO |

---

## 9. Dependency & Config Hygiene

### package.json Dependencies with No Detected Import

| File | Line(s) | Description | Severity |
|------|---------|-------------|----------|
| `package.json` | 58 | `"resend": "^6.12.2"` — NO import found anywhere in src/ or App.js | CONFIRMED |
| `package.json` | 57 | `"react-native-webview": "^13.16.1"` — NO import found anywhere | CONFIRMED |
| `package.json` | 37 | `"expo-linking": "~6.3.1"` — NO import found; all Linking usage imports from react-native built-in | CONFIRMED |

### `newArchEnabled=false` Consistency

| File | Line(s) | Description | Severity |
|------|---------|-------------|----------|
| `app.json` | 78 | `"newArchEnabled": false` in expo-build-properties plugin | INFO |
| `android\gradle.properties` | 41 | `newArchEnabled=false` — matches app.json | INFO |

### eas.json Profiles and Sentry Env Var Scoping

| File | Line(s) | Description | Severity |
|------|---------|-------------|----------|
| `eas.json` | 7-15 | `development` profile: `channel: "development"`, APK, internal distribution | INFO |
| `eas.json` | 16-23 | `preview` profile: `channel: "production"` (not "preview"); `autoIncrement: true` | CANDIDATE |
| `eas.json` | 24-31 | `production` profile: `channel: "production"`; APK (not AAB); `autoIncrement: false` | CANDIDATE |
| `app.json` | 83-89 | Sentry plugin has empty strings for `organization`, `project`, `authToken` — must be populated via EAS env vars or symbol upload fails silently | CONFIRMED |
| `android\app\build.gradle` | 122-123 | `EXPO_PUBLIC_SENTRY_DSN` read from `System.getenv()` — no EAS env scoping in eas.json | CANDIDATE |

### Dead `src\App.js`

| File | Line(s) | Description | Severity |
|------|---------|-------------|----------|
| `src\App.js` | 1-139 | Entire secondary file wrapping `SafeAreaView` + `StatusBar` from react-native — NOT the real app entry point; dead code | CANDIDATE |

---

## 10. Supabase / Migration Integrity

### Schema Changes vs Tracked Migration Files

| File | Description | Severity |
|------|-------------|----------|
| `supabase\migrations\` | `prospects` table has no CREATE TABLE migration — base table must exist on Supabase from before migration tracking began | CONFIRMED |
| `supabase\migrations\20260526000000_create_enrichment_results_table.sql` | `enrichment_results` has FK to `leads(id)` — no CREATE TABLE migration for `leads` exists | CONFIRMED |
| `supabase\migrations\20260622000000_add_feature_requests_analyze_trigger.sql` | Trigger on `feature_requests` — no CREATE TABLE migration exists | CONFIRMED |
| `supabase\lens_signal_migration_v1.sql` | Not a tracked migration (outside `migrations/` folder); creates `lenssignal_records`, `user_push_tokens`, etc. | CONFIRMED |
| `supabase\migrations\create_comptroller_business_records.sql` | Unversioned filename; creates `comptroller_business_records` — duplicates existing migrations | CANDIDATE |
| `supabase\functions\process-leadlock-capture\index.ts` | References `leadlock_captures` — no CREATE TABLE migration exists | CONFIRMED |
| `supabase\functions\signal-ingest\index.ts` | References `lens_signals` — no CREATE TABLE migration exists | CONFIRMED |
| `supabase\functions\compliance-ingest\index.ts` | References `lens_signals` via REST insert — same orphan table | CONFIRMED |
| `supabase\functions\send-push-alert\index.ts` | References `territory_zips` — no CREATE TABLE migration exists | CONFIRMED |
| `supabase\functions\analyze-submission\index.ts` | References `push_subscriptions` — no CREATE TABLE migration exists | CONFIRMED |
| `src\features\lenssignal\registerPushToken.ts` | Upserts into `user_push_tokens` with columns not in v1 migration — schema drift | CANDIDATE |

### RLS Policy Gaps

| Table | Description | Severity |
|-------|-------------|----------|
| `feature_requests` | App code writes via `FeatureRequestScreen.js` and `BugReportScreen.js`; trigger exists; no RLS policy in any tracked migration | CONFIRMED |
| `territory_zips` | Read by `send-push-alert` edge function; no RLS policy | CONFIRMED |
| `leadlock_captures` | Read/written by `process-leadlock-capture` edge function; no RLS policy | CONFIRMED |
| `lens_signals` | Written by `signal-ingest` and `compliance-ingest` functions; no RLS policy | CONFIRMED |
| `push_subscriptions` | Read by `analyze-submission` function; no RLS policy | CONFIRMED |
| `contact_candidates` | No `user_id`/`rep_id` column — all authenticated users can see all candidates | INFO |
| `lenssignal_records` | No `user_id`/`rep_id` column — intentional for shared reference data | INFO |

### Cross-Check: LeadLens vs Scarlett Project Refs

| File | Line(s) | Description | Severity |
|------|---------|-------------|----------|
| `release.js` | 71, 74 | `SCARLETT_URL` = `dlntgyhfxxbcwwcxaorn` (for `app_config`/`beta_releases`); `LEADLENS_URL` = `qkbvwryucaakkkqaqvka` (for `user_push_tokens`) — correct separation | INFO |
| `utils\betaTracker.js` | 19 | Writes `beta_events` to Scarlett — correct (admin portal reads from Scarlett) | INFO |
| `utils\updateChecker.js` | 15 | Reads `app_config` from Scarlett — correct | INFO |
| `src\screens\LoginScreen.js` | 595 | Patches `beta_testers` on Scarlett — correct | INFO |
| `src\screens\BetaFeedbackScreen.js` | 4, 16 | Writes `feedback_reports` to Scarlett — correct | INFO |
| `App.js` | 167 | Update check reads from Scarlett — correct | INFO |
| `release.js` | 771 | Fallback: `LEADLENS_SERVICE_ROLE_KEY \|\| SCARLETT_SERVICE_ROLE_KEY` — if LeadLens key unset, Scarlett service key is used to query LeadLens; cross-project credential leak | CANDIDATE |
| `src\screens\FeatureRequestScreen.js` | 21 | Uses `EXPO_PUBLIC_SUPABASE_URL` (LeadLens) to insert into `feature_requests` — correct | INFO |
| `src\screens\BugReportScreen.js` | 22 | Uses `EXPO_PUBLIC_SUPABASE_URL` (LeadLens) to insert into `feature_requests` — correct | INFO |
| `supabase\functions\send-push-alert\index.ts` | 52 | Reads `user_push_tokens`; uses env `SUPABASE_URL` — correct only if deployed to LeadLens project | CANDIDATE |

### Foreign Key Type Mismatch

| File | Line(s) | Description | Severity |
|------|---------|-------------|----------|
| `supabase\migrations\20260532000000_create_outreach_messages_table.sql` | 8 | `prospect_id text references public.prospects(id)` — FK uses `text` type but `prospects.id` is likely UUID; type mismatch may cause FK constraint failure | CANDIDATE |

---

## 11. Release Pipeline Sanity

### Root `release.js`

| File | Line(s) | Description | Severity |
|------|---------|-------------|----------|
| `release.js` | 224-277 | `bumpVersions()` atomically writes both `app.json` and `android/app/build.gradle`, then read-back validates — throws on mismatch | CONFIRMED |

### Legacy `scripts/release.js`

| File | Line(s) | Description | Severity |
|------|---------|-------------|----------|
| `scripts\release.js` | 90-106 | `bumpAppJson()` only writes `app.json` — does NOT touch `android/app/build.gradle`; creates version drift | CONFIRMED |
| `scripts\release.js` | 96 | Hardcoded base version `'2.0.1'` in `bumpAppJson` — always resets version to 2.0.1 prefix regardless of current version | CONFIRMED |
| `scripts\release.js` | 243 | Hardcoded `version_name: \`v2.0.1-BETA.${buildNum}\`` in `updateAppConfig` — does not reflect actual version | CONFIRMED |

### poll-build.js Consistency

| File | Line(s) | Description | Severity |
|------|---------|-------------|----------|
| `poll-build.js` | 89-93 | `--run-release` flag spawns `node release.js` (root) — correctly wired to root script | INFO |
| `poll-build.js` | 96 | Without `--run-release`, prints manual instruction `node release.js` — consistent | INFO |

### Current Version State

| File | Line(s) | Value | Severity |
|------|---------|-------|----------|
| `app.json` | 5, 15, 22, 95 | version=`2.0.62`, runtimeVersion=`2.0.62`, versionCode=`62`, betaBuild=`62` — all in sync | INFO |
| `android\app\build.gradle` | 118-119 | `versionCode 62`, `versionName "2.0.62"` — matches exactly | INFO |

---

## Summary Statistics

| Category | CONFIRMED | CANDIDATE | INFO |
|----------|-----------|-----------|------|
| 1 - Known Flagged Items | 4 | 1 | 6 |
| 2 - Silent Failures | 1 | 14 | 21 |
| 3 - Storage Violations | 4 | 13 | 1 |
| 4 - Modal/Camera Convention | 0 | 0 | 14 |
| 5 - Version Sync | 0 | 2 | 7 |
| 6 - Dead Code/Stale Artifacts | 22 | 1 | 4 |
| 7 - Debug/Leftover | 14 | 20 | 8 |
| 8 - RN/Expo Patterns | 0 | 2 | 8 |
| 9 - Dependency/Config | 4 | 3 | 2 |
| 10 - Supabase/Migrations | 16 | 3 | 7 |
| 11 - Release Pipeline | 4 | 0 | 3 |
| **TOTAL** | **69** | **59** | **81** |

### Top Priority (CONFIRMED)

1. **7-31**: Hardcoded Supabase JWT in `BetaFeedbackScreen.js:17` — secrets in source
2. **7-12**: `[DEBUG]` console.log in `territoryZipLoader.js:183` leaks truncated Supabase anon key
3. **7-14**: `console.log` inside JSX render in `LeadFiltersBottomSheet.js:295` — fires every render cycle
4. **7-15**: ~45 `console.log` calls in `CaptureScreen.js` — massive debug logging in production
5. **7-08/7-09**: `[SAVE_DEBUG]` tagged console.log in `BatchReviewScreen.js:369,373`
6. **3-01/3-02**: `BugReportScreen.js` and `FeatureRequestScreen.js` import raw AsyncStorage, bypassing storageBridge
7. **2-22**: `clearUserSession().catch(() => {})` in `DashboardScreen.js:618` — logout session cleanup silently fails
8. **9-46/47/49**: Unused dependencies: `resend`, `react-native-webview`, `expo-linking`
9. **11.2/11.3/11.4**: Legacy `scripts/release.js` skips build.gradle sync and hardcodes version 2.0.1
10. **10A.1-10A.8**: Six tables referenced by code have no tracked migration
