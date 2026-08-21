## 2026-07-25
- Fixed Test — reported by a LeadLens user. Thank you!

# Changelog

## BETA-66 | 2026-08-20

### 🐛 Bug Fixes
- **Beta feedback button no longer crashes the app when the keyboard opens** — The Beta feedback button used a native-driver scale animation on the same node that its position animation later manipulated with JS driver. When the keyboard appeared (e.g., editing scheduled export recipients), this mismatch caused a red-screen crash. The scale animation now runs with JS driver, keeping the node on the same driver as its position animation.

## BETA-65 | 2026-08-20

### 🔧 Release Infrastructure
- **EAS Environment Variables for OTA** — Added `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_SCARLETT_SUPABASE_URL`, and `EXPO_PUBLIC_SCARLETT_ANON_KEY` to the EAS production environment. The previous BETA-64 OTA was built without these variables, so the JS bundle could not connect to Supabase. This follow-up OTA repackages the same code with the missing credentials baked into the bundle.

## BETA-64 | 2026-08-20

### 📤 Scheduled Export — Fully Automatic
- **Scheduled exports now send even when the app is closed** — Previously the scheduled export had no server-side scheduler, so it only ran when the app was open and a user manually triggered it. Now the schedule is honored automatically via a server-side job, so your daily/weekly export email arrives whether the app is foregrounded or not.
- **Custom export templates now sync properly, including uploaded files** — Custom template files and field mappings are now saved to Supabase and available for the scheduled export, so you don't have to recreate your custom template on each device.
- **Export settings are now stored server-side** — Scheduled export settings (time, days, recipients, format, timezone) are synced to Supabase, so the server-side scheduler knows exactly what to send and when.
- **Timezone support** — The device timezone is now captured automatically when you save scheduled export settings, so the export fires at the right time for your local clock instead of defaulting to a single fixed zone.

## BETA-63 | 2026-08-19

### 🏠 Property Data — Real County Records
- **Harris, Tarrant, Travis CAD Integration** — Property data now pulled live from official county appraisal district sources (HCAD, TAD, TCAD). Owner name, address, appraised/market value, and year built returned where available. Replaces the previous dead endpoint / AI-estimate-only fallback for these three counties.
- **"CAD VERIFIED" Badge** — Badge text updated from "HCAD VERIFIED" to "CAD VERIFIED" to accurately reflect real county data across all three counties.
- **Multi-County Routing** — ZIP-to-county lookup table routes addresses to the correct county API. AI-estimated property data remains the fallback for addresses outside these three counties, or when a county lookup returns no match.

### 💼 Business Enrichment — Closed Business Filtering
- **Permanently Closed Filtering** — Businesses marked permanently closed by Google Places are now filtered out before enrichment runs — no more wasted lookups or false leads on shuttered businesses. Detected at both the search stage (primary) and the details stage (safety net).
- **Temporarily Closed Flagging** — Temporarily closed businesses are now flagged in the app so reps can make an informed call on whether it's worth pursuing, rather than being enriched identically to an open business.

### 🛡️ Data Integrity
- **Seed Data Filter** — Fixed a gap where seed/test data could have appeared in production territory and signal views if seed files were ever run against the live database (defensive fix — confirmed zero seed rows currently exist in production).

### 🔧 Release Infrastructure
- **Release Script Hardening** — Removed stale duplicate `scripts/release.js` (which hardcoded version `v2.0.1` in Scarlett updates and had a build-download race condition). Wired up dynamic beta tester email queries from Scarlett's `beta_testers` table instead of a hardcoded list. Cross-project service key fallback at push-token lookup now fails fast with a clear error instead of silently falling back to the wrong Supabase project key.

## BETA-62 | 2026-07-30

### 🔧 Crash Reporting Infrastructure
- **Native Sentry Android SDK** — Manually integrated `sentry-android:7.10.0` and `sentry-android-gradle-plugin:4.14.0` directly into the committed `android/` project. The `@sentry/react-native` JS SDK (v5.24.3) could only capture JS-layer errors; native force-closes (Java exceptions, NDK crashes, OOM kills) occurring below the JS bridge were invisible. The native SDK now captures these at the Android runtime level. `io.sentry.dsn` and `io.sentry.auto-init` meta-data tags added to `AndroidManifest.xml`, DSN sourced from the same `EXPO_PUBLIC_SENTRY_DSN` env var used by the JS SDK — single source of truth, no duplicate config.
- **Root Cause** — EAS was skipping `expo prebuild` on every build because the `android/` directory is committed (bare workflow). The `@sentry/react-native/expo` config plugin only runs during prebuild, so the native SDK was never injected. Fixed by adding the Gradle plugin, dependency, and manifest entries by hand instead of regenerating `android/`.
- **Symbol Upload Config** — Gradle `sentry {}` block configured with `uploadNativeSymbols = true` and `includeNativeSources = true` for readable native stack traces. `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` set on EAS via `eas env:create`. Symbol upload should be functional on the next build; unverified until first post-build check in Sentry's Release Settings.

## BETA-61 | 2026-07-29

### 🔧 Crash Reporting Infrastructure
- **Sentry Integration** — Added `@sentry/react-native` with Expo config plugin for capturing native force-closes (NDK/Java crashes below the JS bridge), JS exceptions, and unhandled promise rejections. Initialized in `App.js` gated behind `!__DEV__` so dev-client builds never report to Sentry. Release and dist tagging uses existing version/versionCode stamping from `release.js`.
- **Parallel Pipeline** — Sentry runs alongside the existing `reportGlobalCrash` → `BetaTracker.trackError` → Supabase pipeline. Both `reportGlobalCrash()` and `AppErrorBoundary.componentDidCatch` now call `Sentry.captureException` in addition to BetaTracker. No existing error-handling behavior was removed or reordered.
- **DSN Configuration** — `EXPO_PUBLIC_SENTRY_DSN` added to `.env` following the existing `EXPO_PUBLIC_*` convention.

### 🐛 Error Handling
- **Silent Catch Remediation** — ~65 empty/silent `catch {}` blocks across 17 files now surface errors via `console.warn` or `console.error` instead of swallowing them silently. High-risk user-facing failures (logout, export preference save, audio permission request, location retrieval) now log with full context. Storage/cache-layer catches (`territoryUtils`, `zipBoundaryCache`, `territoryZipLoader`, `tutorialManager`) log read/write failures without altering the underlying dual-storage logic. Filter callback errors, settings parse failures, and background operation errors now visible in logs for debugging.
- **Files Changed** — `SettingsScreen.js`, `TerritoryMapScreen.js`, `userLearning.js`, `LeadFiltersBottomSheet.js`, `AdminScreen.js`, `auth.js`, `territoryUtils.js`, `zipBoundaryCache.js`, `territoryZipLoader.js`, `tutorialManager.js`, `ManualEntryScreen.js`, `ExportModal.tsx`, `LeadLockCameraScreen.js`, `useExportToOneDrive.ts`, `useExportToGoogleDrive.ts`, `useExportLocal.ts`, `ProspectQueueScreen.js`, `LeadLockReviewScreen.js`, `CardGalleryScreen.js`, `TerritoryManagerScreen.js`, `ReviewScreen.js`, `App.js`.

### 🧹 Cleanup
- **Removed Dead Code** — Deleted unused `src/components/ErrorBoundary.js` (generic component-level ErrorBoundary that was never imported anywhere; only console logging, no external reporting).

## BETA-60 | 2026-07-17

### 🎯 LeadLock
- **Detection Regression Fix** — `max_tokens` increased from 2000 to 4096 on both Claude Vision API calls, preventing response truncation that silently dropped business detections. `streetAddress` field from Claude's response now bridged to `address` for enrichment compatibility. API errors (HTTP status + response body) now surfaced to the user via toast instead of being silently swallowed.
- **Reacquire ZIP Button** — Pause and Stop buttons removed from camera header. Replaced with a persistent "Reacquire ZIP" button that fetches a fresh GPS position and reverse-geocodes it on tap, updating the ZIP indicator in place. Inline loading state on the button itself — no modal, no overlay.

### 🐛 Bug Fixes
- **Prospect Sync on Logout** — `clearUserSession()` in `storage.js` now backs up prospects to a temporary key before wiping session data, then restores them after auth completes. `LoginScreen.js` `afterSecureAuth()` restores the backup. `backendSync.js` `syncProspectsFromSupabase()` now filters to `queue_status = 'new'` only, preventing stale reviewed leads from being overwritten.
- **JSON Parse Errors in AI Enrichment** — Health department and property record AI enrichment prompts now request raw JSON only (no markdown). Response parsing strips `` ``` `` blocks, leading bullets, and asterisks before `JSON.parse()`. Nested try/catch prevents unhandled parse failures from crashing the enrichment pipeline.
- **Feedback Button Snap Position** — `findSafeCorner()` in `useFeedbackButtonPosition.js` now sorts corner candidates by Euclidean distance to the drop position instead of returning the first non-overlapping corner in a fixed order. Button now snaps to the nearest safe corner, not always top-left.
- **Territory Map Filters Modal** — Filters bottom sheet opened empty on Android due to `overflow: 'hidden'` clipping ScrollView content and `transform: [{translateY}]` preventing proper height measurement. Fixed by switching sheet animation from transform to `bottom` layout property, removing overflow clipping, and using `position: 'absolute'` on the sheet.
- **Address Autocomplete** — Migrated from legacy Google Places API (disabled) to new Places API (POST `places:autocomplete`). Error responses now logged with full HTTP status and body instead of being silently caught. Response parsing updated for new API shape (`suggestions[].placePrediction`).
- **Prospect Save Street Address** — `convertSelectedBusinessesToProspects()` now sets `streetAddress` from the full address string, allowing `normalizeLead()`'s existing parser to extract `streetNumber`/`streetName` when Google Places enrichment fails to provide them separately.

### 🗺️ Territory Map
- **Filter Button Style** — Converted from wide pill to 44px icon-only circle, matching the other floating action buttons.

### 💬 Enrichment Messages
- **Simplified Lookup Result** — "Look up business profile" success/failure messages no longer mention specific data sources (Google, Comptroller, HCAD, etc.). Success shows "Business profile updated"; failure shows "No additional business info found".

### 🔧 Release Infrastructure
- **Runtime Version Bump** — `expo_runtime_version` updated to `2.0.59`.

## BETA-59 | 2026-07-16

### 🔐 Auth & Security
- **Logout Flow Overhaul** — Centralized `clearUserSession()` in `storage.js` now wipes all 35+ user-session keys from both MMKV and AsyncStorage (prospects, leads, territory, auth tokens, map filters, AI settings, export prefs, push tokens). Supabase `signOut()` called first to clear auth tokens, then all local data cleared. `storage.clear()` also fixed to clear both MMKV *and* AsyncStorage (previously only cleared MMKV, leaving Supabase session tokens intact).
- **SettingsScreen Logout** — Rewritten to call `signOut()` → `unregisterPushToken()` → `BetaTracker.endSession()` → `clearUserSession()` → `navigation.reset()` in correct order. Previously only removed `@leadlens_user`.
- **DashboardScreen Logout** — Same 5-step cleanup. Changed `navigation.replace('Login')` to `navigation.reset()` so the back stack is fully cleared (Android back button no longer returns to Dashboard after logout). Added missing `unregisterPushToken` import.
- **Navigation Reset** — Both screens now use `navigation.reset({ index: 0, routes: [{ name: 'Login' }] })` instead of `replace()`, ensuring the entire navigation stack is cleared on logout.

### 🖼️ Login Screen
- **Responsive Logo Sizing** — Logo dimensions now scale with screen height using `Dimensions` API: height = 28% of screen (clamped 56–120px), width derived from actual image aspect ratio (2.79:1). `logoProfileImg` updated to match. Accent line width and wrap margin also responsive. Reduces logo footprint from ~15% to ~12% of screen height, improving form visibility on all device sizes.

### 🗺️ Territory Map
- **Button Styling Unification** — `actionBtn` and `filterBtn` now share consistent 44px height, `borderRadius: 22`, `COLORS.surface` background, and `COLORS.borderLit` border. Filter button lost oversized `minHeight: 48` and extra vertical padding.
- **Active Filter State** — New `filterBtnActive` style: cyan `#00C9FF` border + translucent cyan background when `activeFilterCount > 0`. `actionBtnActive` also available for future use.
- **Safe Area Fixes** — `activeProfileBadge` and `mapHintBar` no longer use hardcoded `top` values; now positioned dynamically via `insets.top`.

### 🔧 Release Infrastructure
- **release.js CRLF Fix** — CHANGELOG date stamping now preserves original CRLF line endings (was normalizing to LF and writing back, corrupting Windows-created files). Added dry-run guard for date stamping.
- **Runtime Version Bump** — `expo_runtime_version` updated to `2.0.58`.

## BETA-58 | 2026-07-15

### 🔧 Core App
- **Release Script Fix** — `release.js` now handles APK asset already_exists error by deleting the existing asset and re-uploading, preventing 422 failures on re-releases.

### 📤 Prospect Export
- **ExportModal Component** — New modal in ProspectQueueScreen with format selection (XLSX/CSV) and three destination buttons: OneDrive, Google Drive, and Local Storage.
- **Export Formatters** — New `exportFormatters.ts` utility with CSV and XLSX generation, file naming convention `leadlens-prospects-[territory]-[date]`, and base64/UTF-8 encoding support.
- **OneDrive Integration** — OAuth flow with Microsoft Graph API for direct uploads to OneDrive, with token refresh and folder creation.
- **Google Drive Integration** — OAuth flow with Google Drive API v3 for direct uploads, with automatic folder creation and token management.
- **Local Export** — Share sheet integration via `expo-sharing` for saving to device or sharing to other apps.
- **Export Preferences** — Last-used destination saved in MMKV for quick access.
- **Header Export Button** — Export button added to ProspectQueueScreen header (disabled when no prospects).

## BETA-57 | 2026-07-15

### 🎯 LeadLock
- **ZIP Acquisition UX Overhaul** — Capture now blocked until ZIP resolves; centered acquisition overlay with solid-orbiting-dots dual animation (replaced border-arc technique); 18s timeout + retry; header restructured as siblings of CameraView (fixed Android rendering bug); ZIP badge restored in header once acquired.

### 🗂️ Property Records
- **Source Labeling** — HCAD vs. AI-estimate source now shown consistently in ReviewScreen (fallback-safe resolution) and ProspectQueueScreen modal (lightweight badge).

### 🔧 Core App
- **Manual Entry Enrichment** — Manual entry in ReviewScreen now fires `enrichBusinessWithPublicSources()` after save, with race-condition-safe merge-back that re-reads current storage state before writing.

## BETA-56 | 2026-07-09

### Added
- BetaFeedbackScreen — full feedback form (bug, crash, UX, performance, feature, general) posting directly to Project Scarlett feedback_reports table
- BetaFeedbackFAB — floating 💬 BETA button rendered on every screen via App.js
- BetaFeedback stack screen wired into App.js navigation as modal presentation
- Personalized success screen: "Two Cents Deposited, {firstName}. The O-Kay-est Media team got your feedback loud and clear..."

### Fixed
- BetaFeedbackFAB now correctly reads repEmail and repName from user object (was incorrectly using email/name/fullName)
- Removed unused View import and pressed state from BetaFeedbackFAB

## BETA-55 | 2026-07-08

> Unreleased / development build

### 🚀 Milestone
- **First successful LeadLock usage** — LeadLock photo-to-queue pipeline verified end-to-end: multi-business detection, address preservation, MMKV/AsyncStorage round-trip, and Supabase `address` column mapping all confirmed working today.

### 🎯 LeadLock
- **Address Flow Hardening** — Added `address` column to the Supabase `prospects` table and local schema files; `backendSync.js`, `leadHelpers.js`, and `constants/index.js` now preserve the full `address` field throughout normalization and sync. `ProspectQueueScreen` renders the full address on each card and logs card rendering for observability.
- **Pipeline Verification** — Created `scripts/testLeadLockAddressFlow.js` to validate the complete LeadLock → ProspectQueue → Supabase address flow; test passes against the live database.

### 🗺️ Territory Map
- **ZIP Boundary Re-render on Mode Toggle** — `TerritoryMapScreen` now re-fetches ZIP boundaries in `silent: true` mode when `targetLensMode` changes and forces polygon remounts with mode-aware keys so boundaries redraw correctly across residential/commercial switches.
- **Boundary Loader Logging** — Added fetch lifecycle logging to `territoryZipLoader.js` and `zipBoundaryCache.js` to help diagnose missing polygons.

### 🎛️ Prospect Queue
- **Scrollable Filter Panel** — Added a filter panel to `ProspectQueueScreen` with status, radius, and recency filters inside a bounded, nested-scrollable `ScrollView` so filter UI no longer conflicts with the main list.

### 🔔 In-App Toast
- **Global Themed Toast Provider** — New `ToastContext` provider with `useToast()` hook and imperative `showToast()` / `hideToast()` API. `ThemedToast` is a custom `Animated` overlay with success/error variants, auto-dismiss, and safe-area handling.
- **Alert Replacement** — Replaced most simple `Alert` notifications with the global toast across `BugReportScreen`, `FeatureRequestScreen`, `CaptureScreen`, `LeadLockCameraScreen`, `PhotoIngestScreen`, `CameraModal`, `ScanCameraModal`, `TargetMapAdjusterScreen`, `SettingsScreen`, and `emailPicker.js`.

### 🔧 Core App
- **SettingsScreen Lint Cleanup** — Removed broken `queueScheduledExport` and `syncQueueToSupabase` imports (and their non-existent backend buttons) to resolve import/named lint errors.

### ⚠️ Known Issues
- (carried forward from BETA-54)

---

## BETA-54 | 2026-07-08

> Unreleased / development build

### 🗺️ Territory Map
- **TerritoryMap Filter Spec Implementation** — Rewrote `LeadFiltersBottomSheet` with a Residential/Commercial toggle, universal filters (status, radius, contact completeness, activity window, new-since-last-scan, signals), commercial filters (business type, rating), and residential filters (home value, sqft, occupancy, property type). Wired the filter state to `TerritoryMapScreen.isLeadVisible` and `safeNearbyPlaces`.
- **Commercial + Residential Taxonomy** — Replaced the old Google Places type mapping in `nearbySearch.js` with explicit commercial buckets (Food/Hospitality, Retail/Consumer, Industrial/Logistics, Office/Professional, Public/Facilities, Multi-Family/Residential-Adjacent, Institutional, Other) and added `classifyResidentialProperty` for residential property types.
- **Map Search Radius** — `searchNearbyBusinesses` now uses the selected filter radius (up to 25 mi / 50 km) instead of a fixed 2500 m radius.

### 🔧 Core App
- **LeadLock Business Data Pipeline** — New `businessDataPipeline.js` normalizes and persists Google Places results to a new `business_data` table. `enrichmentNormalizer.js` updated to flatten place fields and fire-and-forget upserts. Added a Google Places API health check and detailed logging across the zip-to-business pipeline.

### 🏗️ Infrastructure
- **New `business_data` Table** — Created `supabase/migrations/20260708000000_create_business_data.sql` with indexes, RLS, and an updated_at trigger; pushed to the live database.
- **Filter Schema Migration** — Added commercial/residential signal columns to `lenssignal_records` and `targetlens_prospects` via `20260708000001_add_filter_columns_for_signals_and_residential.sql`; applied to the live database.

### 🐛 Bug Fixes
- **Prospect Queue Header Safe Area** — Fixed the header being cut off by the status bar/notch in `ProspectQueueScreen` by switching to `react-native-safe-area-context` `SafeAreaView` with `edges={['top']}`, wrapping the entire screen content, and setting explicit ScrollView `contentInset`/`scrollIndicatorInsets`.

### ⚠️ Known Issues
- (carried forward from BETA-53)

---

## BETA-53 | 2026-07-02

> Unreleased / development build

### 🔧 Core App
- **Screenshot Enrichment Moved to Prospect Queue** — The "Search Business" and "Add Screenshot" fallback enrichment actions were removed from the map signal details card and added to the per-prospect edit view in `ProspectQueueScreen`. Merging now targets the unambiguous `editingLead` and leaves the edit Modal open so the user can review the merged data before saving.
- **MMKV Persistence Hardening** — `storageBridge` now dual-writes to MMKV and AsyncStorage and reconciles reads by recency (timestamp). This fixes prospect data loss that occurred when the app was force-closed and MMKV was not flushed.
- **Prospect Queue Save Verification** — `ProspectQueueScreen` saves now read back from storage and verify the write before updating state, preventing silent save failures.
- **Screenshot Merge Durability** — Screenshot enrichment in the prospect queue uses the same verified storageBridge write + read-back pattern as the regular save, and also syncs the merged prospect to Supabase via `upsertProspect`.

### 🐛 Bug Fixes
- **Prospect Queue Data Loss on Force-Close** — Fixed by the storageBridge dual-write + recency reconciliation above.
- **Version Label Instability** — Settings displayed a stale hardcoded `APP_VERSION` constant, and support tickets read a different version source, so three different version numbers appeared across the app. `release.js` now always calls `bumpVersions()` in `--apk` mode, and both Settings and the bug-report screen now read from a single canonical `getAppVersionString()` helper sourced from `Constants.expoConfig`.

### ⚠️ Known Issues
- (carried forward from BETA-52)

---

## BETA-52 | 2026-07-01

> Released via Project Scarlett — LeadLens_v2.0.52-BETA.52.apk

### 🚀 New Features
- **TX Permit Status Check** — New `txPermitCheck.js` utility with Edge Function integration checks Texas Comptroller permit status for prospects. `SettingsScreen` shows permit status labels; `ProspectQueueScreen` displays queue badges for permit status at a glance.
- **Pluggable Enrichment Provider Architecture** — New `enrichmentProviders/` module with a `providerInterface.js` contract and `bizcollectProvider.js` as the first pluggable enrichment source. `enrichmentNormalizer.js` updated to route through the provider system.
- **Background AI Enrichment** — Business card scan leads now route through a background AI enrichment queue after capture, improving data completeness without blocking the scan flow.

### 🔧 Core App
- **Front & Back Card Scan Merge** — Scanning both sides of a business card now produces one merged prospect instead of two separate entries. `mergeTwoSidedCardLeads()` is now correctly called after both sides are processed.
- **TaskQueue Observability** — Added logging to the background task processor (`taskRunner.js`): empty queue, task count, per-task execution, success, and failure are now visible in logcat. Previously the processor ran silently with zero log output.
- **Enrichment Error Propagation** — `enrichLead()` in `claudeApi.js` now re-throws errors instead of silently returning the unchanged lead. Failed enrichments are marked FAILED in the queue (retryable up to 3×) instead of silently marked COMPLETED.
- **Edge Function Error Detail** — `extractProspectAI.js` error messages now include the actual HTTP status and response body from the `extract-prospect` Edge Function.
- **Comptroller firstName/lastName Mapping** — Fixed field mapping so Comptroller API results correctly populate POC extraction fields; added `businessName` fallback logic.

### 🐛 Bug Fixes
- **Business Card Scan Crash** — Fixed crash in `BatchReviewScreen` where phone numbers returned as structured objects `{number, type, digits}` from `phoneExtraction.js` were rendered directly in `<Text>` components. Now correctly extracts `.number` string before rendering.
- **ProspectOutreachModal Hooks Violation** — Fixed Rules of Hooks crash: `useCallback` was declared after an early `return null` guard at line 82, causing React to throw "Rendered more hooks than during the previous render" when `prospect` transitioned from null to a value.
- **False "Leave Scanner?" Prompt** — Scan blocking state (`scanInProgress`, `processing`, `currentCardScanSessionId`) is now cleared before navigating to `BatchReview` instead of after, eliminating a timing window where the navigation guard incorrectly treated a completed scan as still active. Fix applied to single-sided, Front & Back, recovery, gallery, and spreadsheet import paths via new `clearScanBlockingState()` helper.
- **GPS Indefinite Hang** — Added 5-second `Promise.race` timeout to all unprotected `getCurrentCoords()` calls across `CaptureScreen.js` and remaining screens (`PhotoIngestScreen`, `BatchReviewScreen`, `App.js`, `LeadLockCameraScreen`). Processing pipeline no longer hangs indefinitely on slow or unavailable GPS — falls back gracefully and continues without location.
- **ExportScreen Clear Bug** — `clearExportedQueueItems` now clears both MMKV and AsyncStorage (matching `SettingsScreen.handleClearQueue`). Previously only MMKV was cleared, causing exported/cleared prospects to reappear from the AsyncStorage fallback after an Expo dev client rebuild.
- **BetaTracker Email Always Null** — `resolveEmail()` in `betaTracker.js` now reads from MMKV via `storageBridge` instead of raw AsyncStorage. `LoginScreen` writes to MMKV; the previous raw AsyncStorage read always returned null, causing every Scarlett event to show a blank Tester column.
- **BetaTracker Email Reverts to Stale Account** — Fixed spread order in `LoginScreen.js:349` — `setUser({ ...nextUser, ...saved, repEmail: email })` now pins the auth email last so it can't be overwritten by the cached previous-session user object during account switching.
- **Comptroller Write Path** — New `upsert-comptroller` Edge Function replaces direct client-side table upserts for Comptroller enrichment cache writes (required after RLS hardening locked `comptroller_business_records` to service_role writes only).
- **Comptroller Diagnostic Logging** — Added `console.error` logging to all failure paths in `comptroller-lookup` Edge Function so 500/403 errors now surface the actual upstream status and response body in Supabase dashboard logs.

### 🏗️ Infrastructure
- **Security: VAPID Key Hardening** — Removed hardcoded VAPID private/public keys from `analyze-submission` Edge Function; both now read from Supabase secrets with a startup guard.
- **Security: Supabase Anon Key Consolidation** — Replaced hardcoded anon key fallbacks with environment variable references across 9 files.
- **Security: Google Maps API Key Centralization** — Replaced hardcoded Google Maps API key with `EXPO_PUBLIC_GOOGLE_PLACES_API_KEY` env var across 4 source files and redacted from 2 doc files.
- **Security: RLS Policy Hardening** — Tightened `USING (true)` policies on 4 Supabase tables: `beta_testers` (own-email-only SELECT), `contact_candidates` (authenticated read-only, service_role write), `lenssignal_records` (authenticated-only), `comptroller_business_records` (authenticated read-only, service_role write). Migrations applied to live database.
- **Claude Model Update** — Updated model references from deprecated `claude-3-haiku-20240307` to `claude-haiku-4-5-20251001` across Edge Functions and web Roadmap page.

### ⚠️ Known Issues
- **Texas Comptroller API** — `comptroller-lookup` returning 403; pending valid API key activation through the Texas Comptroller developer portal.
- **Google Places Search** — `NearbySearch` returning "caller does not have permission"; pending Google Cloud billing account restoration.
- **Single-Sided Scan Lead Duplication** — Scanning a single card occasionally produces duplicate entries; root cause under investigation.

---

## BETA-51 | 2026-06-14

> Released via Project Scarlett — LeadLens_v2.0.51-BETA.51.apk

### 🚀 New Features
- ProspectQueue Import System: New import button (cyan) in ProspectQueueScreen header; import modal with 4 options — Photo Gallery (multi-select up to 10), Take New Photo, Documents/Files, Cloud Storage (placeholder)
- AI Photo Import: `expo-image-picker` and `expo-document-picker` integration; Claude AI extracts leads, normalizes via `normalizeLead`, routes to `BatchReviewScreen` with processing overlay and progress messages
- Source Badges: Imported prospects display purple source badge for visual differentiation
- Skip-to-Bottom Button: Floating bottom-right button in `ProspectQueueScreen` with scroll lock, `scrollToEnd()`, momentum/drag end handlers, and 500ms safety fallback

### 🔧 Core App
- Navigator Registration: `ProspectQueueScreen` added to `App.js` navigation stack
- Dashboard MANAGE Link: Added MANAGE link to Prospect Queue section header in `DashboardScreen.js`; restructured layout into two rows to fix flex pushing link off-screen
- Global Error Boundary: `AppErrorBoundary` catches React render errors and shows recovery UI; `installGlobalErrorHandlers()` hooks into `ErrorUtils` and promise rejection tracking; `reportGlobalCrash()` logs to console and `BetaTracker.trackError`
- Startup Hardening: All startup async calls in `App.js` wrapped in try/catch with `reportGlobalCrash`; AppState listener, MMKV writes in `updateGlobalLocation`, and `memoryWarning` cleanup all hardened
- Memory Monitoring: `AppState` memoryWarning listener logs to BetaTracker; TerritoryMap low-memory mode hides markers, signals, polygons, and overlays to reduce Google Maps memory pressure

### 🐛 Bug Fixes
- LeadLock Camera Zip Crash: Removed duplicate `getLocation()` call competing with Nominatim rate limits; single GPS source with `mountedRef` guards, `resolvedZipRef` cache, and MMKV write guards; reactive GPS effect fills `location.zip` when GPS resolves after mount
- Zip Resolution TTL Cache: 30-second in-memory cache in `resolveZipFromLeadLockPhoto.ts` keyed by rounded lat/lon prevents duplicate reverse-geocode calls
- SupportScreen Version: Replaced hardcoded `v2.0.1-BETA-43` with dynamic read from `Constants.expoConfig.version`; now displays `v2.0.50 (runtime 2.0.50) BETA-50` correctly

### 🏗️ Infrastructure
- API Error Hardening: `claudeApi.js` — wrapped `extractLeadsFromImage`, `extractLeadsWithDebugFromImage`, and `extractRawOcrFromImage` with try/catch for resilient error handling

---

## BETA-50 | 2026-06-14

> Released via Project Scarlett — LeadLens_v2.0.50-BETA.50.apk

### 🚀 New Features
- Photo Ingest Screen: New `PhotoIngestScreen.js` — capture or upload a photo, Claude AI extracts business details, confirmation modal before saving to queue
- Multi-Business Detection: Single photo can detect and enrich multiple storefronts simultaneously via `multiBusinessDetection.js`; all detected prospects shown in confirmation UI before batch save
- Background Stability System: New `backgroundStability.js` utility tracks last active route and timestamp; one-time Android battery optimization prompt on first launch to reduce background shutdowns
- Feature Flags: New `src/config/featureFlags.js` for runtime feature toggling without rebuilds
- Card Scan Architecture: Full card scan pipeline added — `scanQueueProcessor.js`, `scanCards.js`, `scanDb.js`, `scanSessions.js`, `scanStatuses.js` — structured processing queue for business card OCR
- Responsive Utilities: New `src/utils/responsive.js` for consistent cross-device sizing
- Address Row Component: New reusable `AddressRow.js` component for consistent address display

### 🗺️ Territory Map
- Complete floating search bar overlay with full-width map rendering
- Search input and Industry/Signals filter buttons now transparent overlay with integrated magnifying glass icon
- LensSignals MVP: Quick search button (🎯) for rapid signal discovery in current map area
- Signal Type Filtering: Filter by General Compliance, Health Code Violations, New Business, or All Types
- Alert Level Filtering: Filter by Priority Review, Monitor, Opportunity, Good Standing, or All Alerts
- Health Rating Filtering: Filter by A, B, C, D, F grades or All Ratings
- Contact Card Modal: Unified modal for both Search Results and LensSignal pins with flexible data mapping
- Map Markers: LensSignal results display as emoji icons based on signal type; business search results display emoji icons for visual categorization
- Action Button Framework: Add to Queue, View Details, Call, Email buttons wired and ready
- Real GPS Tracking: expo-location integration for actual device GPS with continuous 10-second updates
- GPS Permission Handling: Automatic foreground location permission request on app start
- GPS Map Marker: Cyan pulsing location indicator on map
- ScreenHeader Consistency: Territory Map matches Territory Manager style with back button and purple accent line
- Supabase PostGIS Integration: LensSignal queries with dynamic radius location filtering

### 🔧 Core App
- App.js: Added `PhotoIngestScreen` to navigation stack; integrated `backgroundStability` hooks into AppState listener and NavigationContainer; `navRef` added for route tracking; battery optimization prompt on first launch
- Navigation: `recordLastActiveRoute` called on every route change and app resume/background
- Global GPS: `updateGlobalLocation()` called on app launch and every app resume
- Update Check: Scarlett `checkForUpdate()` reads `current_build` and `apk_url` from `app_config` table; prompts download when newer build available

### 🏗️ Infrastructure
- ZIP Boundary Cache: Rewrote `zipBoundaryCache.js` and `territoryZipLoader.js` for improved reliability and cache hit rates
- Enrichment Normalizer: Major expansion of `enrichmentNormalizer.js` — improved field mapping and data normalization across all enrichment sources
- Lead Helpers: Significant refactor of `leadHelpers.js` for consistency and reliability
- Storage: Ongoing improvements to `storage.js` resilience and sync API
- Territory Utils: Updated `territoryUtils.js` with improved ZIP boundary handling
- Geo Enrich: Expanded `geoEnrich.js` with additional geocoding utilities
- Map Safety: Updated `mapSafety.js` with additional polygon safety checks
- Permission Manager: Expanded `permissionManager.js` for additional permission flows
- Claude API: Updated `claudeApi.js` model references and request handling
- Push Notifications: Minor updates to `pushNotifications.js`
- Scripts: Added `scripts/fill_missing_zip_boundaries.js` and `scripts/reupload_full_res_boundaries.js` for boundary data maintenance

### 🔨 Build
- NDK updated: `25.1.8937393` → `26.1.10909125`
- Gradle JVM memory tuned: `-Xmx4096m` → `-Xmx2048m` for build stability
- Android Gradle plugin version unpinned for compatibility

### ⚠️ Known Issues
- Camera: `ImagePicker.requestCameraPermissionsAsync()` hangs silently — requires Expo/native debugging
- Release automation: EAS APK download step rebuilt in `release.js` v3.1 — first production run pending

---

## BETA-49 | 2026-05-23

- ZIP Boundary Restoration: Restored full-resolution ZIP code boundary polygons after data loss
- Boundary Cache Rebuild: Migrated boundary data back to Supabase with verified integrity
- Map Stability: Fixed polygon rendering edge cases on TerritoryMapScreen

---

## BETA-48 | 2026-05-22

- Territory Map Redesign: Complete floating search bar overlay with full-width map rendering
- LensSignals Feature MVP: Signal discovery, type/alert/health filtering on map
- Contact Card Modal System: Unified modal for Search Results and LensSignal pins
- Real GPS Location Tracking: expo-location device GPS with 10-second updates
- GPS Permission Handling: Automatic foreground permission request on start
- ScreenHeader Consistency: Territory Map matches Territory Manager style
- Business Type Icons: Emoji icons for search result visual categorization
- Supabase PostGIS Integration: LensSignal queries with radius filtering
- Known Issue - Camera: Business card scanner camera permission hanging

---

## BETA-47 | 2026-05-21

- Login Authentication Fix: Fixed login button hanging issue
- BetaTracker Database Fix: Fixed null value constraint on metadata column
- Complete Release Automation: One-shot release script — build, GitHub upload, Scarlett update
- GitHub Release Integration: Automated APK upload to GitHub Releases
- Scarlett Auto-Update: Automatic app_config updates on every release
- Git Workflow Automation: Full commit, tag, and push automation in release process
- Environment Configuration: GITHUB_TOKEN and SUPABASE credentials support

---

## BETA-46 | 2026-05-21

- Territory Polygons Rendering: Restored ZIP code boundary polygon rendering with activity-based color coding
- 90-Day Activity Heat Mapping: Prospect count per ZIP with color-coded heat levels
- Intuitive Color Scheme: Green/blue for high activity, orange for low, red for none
- Nominatim API Rate Limiting: Fixed 429 errors with intelligent request queue
- Multi-Tier Caching System: Supabase → MMKV → Nominatim caching hierarchy
- Supabase ZIP Boundary Cache: First load 20-30s, subsequent loads under 1 second
- MMKV Local Caching: Instant Territory Map polygon loads via storageBridge
- All FAB Buttons Restored: Location, Search, Target, Settings, Reload
- Filter Modal Complete: LensSignal and Prospecting filter tabs with all business types
- Support Email Notifications: Resend integration for support ticket confirmations
- TerritoryManagerScreen Fixes: Fixed undefined color function calls

---

## BETA-45 | 2026-05-20

- Territory Map Restoration: Restored ZIP code boundary polygon rendering
- Heat Map Color Coding: Prospect activity-based color coding for territories
- Reversed Color Scheme: Green=high activity visualization
- Rate Limiting Fixes: Nominatim 429 errors fixed with request queue
- Fallback Polygons: 2.5-mile radius circle boundaries when GeoJSON unavailable
- Supabase Caching Layer: Persistent cloud cache for ZIP boundaries
- MMKV Integration: Switched from AsyncStorage to MMKV for local caching
- Filter UI Restoration: Complete filter modal with all business types and alert levels
- FAB Button Recovery: Restored all 5 action buttons

---

## BETA-44 | 2026-05-19

- LensSignal Push Alerts: Real-time push notifications for new leads in territory
- PostGIS Spatial Queries: PostGIS triggers for geographic-based alert routing
- Edge Function Pipeline: signal-ingest and send-push-alert Edge Functions deployed
- Push Token Management: Automatic push token registration on login/logout
- 30-Day Dedup Guard: Deduplication to prevent duplicate alerts within 30-day window
- LensSignal Details Card: Detailed signal information display in prospect queue
- Alert Filtering: Alert Level filters for priority management

---

## BETA-43 | 2026-05-18

- LeadLock Multi-Business Detection: Detects multiple storefronts in single photo
- Batch Business Enrichment: Enriches all detected businesses simultaneously with risk badges
- Risk Assessment: Risk indicators for multi-business properties
- Camera Improvements: Enhanced LeadLockCameraScreen for multi-business targeting
- Prospect Matching: Improved matching algorithm for multiple businesses per location

---

## BETA-42 | 2026-05-17

- JWT Authentication Fix: Fixed SupportScreen authentication token handling
- Territory Map Crash Fix: Fixed polygon rendering crash via makeSafePolygons
- Dark Theme FAB Buttons: Restored all 5 FAB buttons with dark theme and cyan borders
- Login Screen Redesign: Refactored to 3 animated provider cards (Google, Microsoft, Email)
- MMKV Storage Upgrade: Downgraded to v2.12.2 with stable AsyncStorage fallback
- Storage Bridge Implementation: Migrated all screens to storageBridge
- Google Maps API Fix: Corrected literal placeholder string in AndroidManifest.xml
- Batch Review Virtualization: Migrated BatchReviewScreen to virtualized FlatList
- Excel Import Optimization: Chunked async processing with O(1) column lookups
- Push Notification Framework: Push token registration and pushNotifications utility

---

## BETA-41 | 2026-05-16

- Prospect Queue Refinements: Improved lead card rendering and interactions
- Export Configuration: Enhanced export options with configurable templates
- Field Sales UI Polish: Minor UI improvements across prospecting screens
- Performance Tuning: Optimized screen navigation and state management
- Error Handling: Improved error messages and validation feedback
- Data Sync Stability: Fixed intermittent Supabase sync issues

---

## BETA-40 | 2026-05-15

- Batch Processing Framework: Foundation for batch lead operations
- Dashboard Analytics: Initial metrics dashboard with working days and prospect counts
- Territory Heat Map: Basic heat map visualization with activity levels
- Prospect Export: CSV export functionality for captured leads
- Multi-Photo Capture: Gallery support for batch image selection
- Business Card Recognition: AI-powered OCR for business card scanning via Claude API
- Location Tracking: GPS-based prospect capture with address lookup
- Push Notifications: Expo Push integration for beta event notifications
