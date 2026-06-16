# LeadLens — 48-Hour Update Summary

## Features Built

### 1. ProspectQueue Import System (`ProspectQueueScreen.js`)
- **Import button** — cyan `#00C9FF` button in header next to "Prospect Queue" title
- **Import modal** with 4 options: Photo Gallery, Take New Photo, Documents/Files, Cloud Storage (placeholder)
- **expo-image-picker** for gallery (multi-select up to 10) and camera
- **expo-document-picker** for file selection (filters to images only)
- **AI extraction** — reads images as base64 via `expo-file-system`, processes through `extractLeadsWithDebugFromImage` (Claude AI), normalizes via `normalizeLead`, navigates to `BatchReviewScreen`
- **Processing overlay** — `ActivityIndicator` with progress messages ("Processing file 2 of 5...", "Found 3 prospect(s)...")
- **Source badges** — purple `#7B3FBE` badge on imported prospects ("Imported: gallery")
- **Permission handling** — requests gallery/camera permissions with themed alerts on denial

### 2. Navigator Registration (`App.js`)
- Added `ProspectQueueScreen` import and `<Stack.Screen name="ProspectQueue">` registration

### 3. Dashboard MANAGE Link (`DashboardScreen.js`)
- Added "MANAGE ›" link in the Prospect Queue section header that navigates to ProspectQueueScreen
- **Layout fix** — `SectionLabel` component's `sectionLine` has `flex: 1` which was consuming all horizontal space, pushing the MANAGE button off-screen. Restructured queue header into two rows: `queueHeaderWrap` → `queueHeaderRow` (label + help) + `queueActions` (MANAGE + other buttons below)

---

## Bug Fixes

### 4. LeadLock Camera Zip Crash Fix (`LeadLockCameraScreen.js`)
- **Root cause**: Two competing location acquisition paths (`getLocation()` useEffect + `useLeadLockLocationSnapshot(true)` hook) both requesting GPS and reverse-geocoding simultaneously, exhausting the rate-limited Nominatim API
- **Fix**: Removed duplicate `getLocation()` call; single source from the hook's `leadLockGps`; added `mountedRef` guard on all async operations to prevent state updates after unmount; added `resolvedZipRef` session cache to avoid duplicate `resolveZipFromLeadLockPhoto` calls; guarded MMKV parse/write in queue save
- **Reactive GPS effect** — added `useEffect` that listens for `leadLockGps` arrival after mount to fill `location.zip` when GPS resolves later

### 5. Zip Resolution TTL Cache (`resolveZipFromLeadLockPhoto.ts`)
- Added 30-second in-memory cache keyed by rounded lat/lon to prevent duplicate reverse-geocode calls under rate limiting

### 6. SupportScreen Version Fix (`SupportScreen.js`)
- Replaced hardcoded `'v2.0.1-BETA-43'` with dynamic read from `Constants.expoConfig.version` + runtime version + beta build number
- Added `import Constants from 'expo-constants'`
- Expected display: `v2.0.50 (runtime 2.0.50) · BETA-50`

---

## Crash Prevention & Stability

### 7. Global Error Boundary (`App.js`)
- `AppErrorBoundary` class component wrapping the entire app — catches React render errors, shows recovery UI with "Reload" button
- `installGlobalErrorHandlers()` — hooks into `global.ErrorUtils.setGlobalHandler` for JS errors + `promise/setimmediate/rejection-tracking` for unhandled promise rejections
- `reportGlobalCrash()` helper — logs to console + sends to `BetaTracker.trackError` (Supabase `beta_events` table)

### 8. Memory Monitoring (`App.js` + `TerritoryMapScreen.js`)
- `AppState.addEventListener('memoryWarning')` in App.js — logs memory warnings to BetaTracker
- TerritoryMap low-memory mode — `lowMemoryMode` state driven by `memoryWarning`; hides nearby markers, lens signal markers, compliance polygons, and ZIP boundary overlays to reduce Google Maps memory pressure

### 9. API Error Hardening (`claudeApi.js`)
- Wrapped `extractLeadsFromImage`, `extractLeadsWithDebugFromImage`, and `extractRawOcrFromImage` with try/catch to prevent unhandled promise rejections

### 10. Startup Hardening (`App.js`)
- Wrapped all startup async calls (`checkForUpdate`, `updateGlobalLocation`, `registerBackgroundAutoExport`, `BetaTracker.init`) in try/catch with `reportGlobalCrash`
- Wrapped AppState listener in try/catch
- Wrapped MMKV write in `updateGlobalLocation` with try/catch
- `memoryWarning` listener cleanup on unmount

---

## Scroll Fix

### 11. Skip-to-Bottom Button (`ProspectQueueScreen.js`)
- Added `ScrollView` ref, scroll lock ref, and timer ref
- `scrollToBottom()` uses `scrollToEnd({ animated: true })` with lock to prevent rapid-fire presses
- `handleScrollEnd()` clears lock on `onMomentumScrollEnd` + `onScrollEndDrag`
- Floating "↓ Skip to Bottom" button — absolutely positioned bottom-right, hidden when 0 leads, disabled (opacity 0.4) during scroll animation
- Safety fallback: 500ms timeout clears lock if scroll end event doesn't fire

---

## Commits & Deploys

| Commit | Message | OTA |
|---|---|---|
| `eeef8586` | ProspectQueue import feature + navigator + Dashboard MANAGE link | ✅ `029af561` |
| `02138714` | Queue header layout fix (SectionLabel line hiding MANAGE) | ✅ `ede9204f` |
| `343122ae` | SupportScreen app version fix | ✅ `b3132f79` |
| `e2a553a0` | LeadLockCamera zip crash fix | ✅ `711abcb1` |
| `48dfa3cc` | LeadLockCamera reactive GPS effect for zip | ✅ `4dd9c738` |
| `6b5ba6af` | Global crash prevention (error boundary, memory, API hardening) | ✅ `1e456e52` |
| `e66c795c` | Skip-to-bottom button with scroll lock | ✅ `0cb29eca` |

---

## Files Modified

| File | Changes |
|---|---|
| `App.js` | Navigator registration, error boundary, global handlers, memory warning, startup hardening |
| `src/screens/ProspectQueueScreen.js` | Import feature, import modal, processing pipeline, skip-to-bottom button |
| `src/screens/DashboardScreen.js` | MANAGE link, queue header layout restructure |
| `src/screens/LeadLockCameraScreen.js` | Zip crash fix (single GPS source, mounted guard, reactive GPS effect) |
| `src/screens/SupportScreen.js` | Dynamic version from expo-constants |
| `src/screens/TerritoryMapScreen.js` | Single-pass zip activity, low-memory mode |
| `src/utils/claudeApi.js` | try/catch around all AI extraction calls |
| `src/utils/location/resolveZipFromLeadLockPhoto.ts` | 30s TTL reverse-geocode cache |
| `src/utils/territoryUtils.js` | Timestamp fallback expansion |
| `src/utils/backendSync.js` | `buildRow` uses `lead.updatedAt` |
| `src/utils/leadHelpers.js` | `getLeadId`, `matchLeadByAnyId` |
