# FIX-RESULTS-STORAGE-AND-SILENT-FAILURES — 2026-08-12

## Summary

This pass addressed the storage-bridge bypasses and fire-and-forget `.catch(() => {})` regressions identified in `SWEEP-RESULTS-2026-08-07.md` sections 2 and 3.

- **Phase 1** (confirmed, mechanical): 4 raw-AsyncStorage imports/requires converted to `storageBridge`; Dashboard logout silent failure now logs + surfaces to the user.
- **Phase 2** (candidate storage bypasses): Each item was investigated individually. Most were duplicating behavior `storageBridge.getItem`/`setItem` already provides and were converted. Three genuine gaps were left as raw AsyncStorage and are documented below.
- **Phase 3** (fire-and-forget catches): Each listed item was classified per the BETA-62 pattern. Background/cache operations now log only; no user-facing UI was added to background paths.
- **Build verification**: All modified files pass Babel syntax validation with `babel-preset-expo`. ESLint reports only pre-existing issues (see Build / Lint Notes).

Backups were created with timestamped `.bak-1786535988186` files before any edits. CRLF line endings were preserved on all modified files.

---

## Phase 1a — Confirmed storageBridge bypass conversions

| File | Before | After |
|------|--------|-------|
| `src/screens/BugReportScreen.js:19` | `import AsyncStorage from '@react-native-async-storage/async-storage'` | `import { storageBridge as AsyncStorage } from '../utils/storage';` |
| `src/screens/FeatureRequestScreen.js:16` | `import AsyncStorage from '@react-native-async-storage/async-storage'` | `import { storageBridge as AsyncStorage } from '../utils/storage';` |
| `src/utils/aiWelcome.js:27` | `const getRawStorage = () => require('@react-native-async-storage/async-storage').default;` | Removed; reads/writes now use the imported `storageBridge` (`AsyncStorage`) |
| `src/utils/tutorialManager.js:30,48` | `const RawStorage = require('@react-native-async-storage/async-storage').default;` (twice) | Removed; `markTutorialSeen` uses `await AsyncStorage.setItem(...)`, `resetAllTutorials` uses `await AsyncStorage.multiRemove(...)` |

Notes:
- `BugReportScreen.js` / `FeatureRequestScreen.js` only use the imported `AsyncStorage` as the Supabase auth adapter `storage` option. `storageBridge` exposes the same `getItem`/`setItem`/`removeItem` shape, so the substitution is compatible.
- `aiWelcome.js`: `hasAIWelcomeBeenShownToday` now uses `storageBridge.getItem` (MMKV + AsyncStorage reconciliation) instead of the manual MMKV-then-raw-AsyncStorage fallback. `markAIWelcomeShownToday` now uses `storageBridge.setItem`, which writes MMKV and awaits the AsyncStorage mirror — the same durability guarantee the raw call was providing.
- `tutorialManager.js`: `markTutorialSeen` now goes through `storageBridge.setItem`, which gives the awaited dual-store write the original code was trying to guarantee. `resetAllTutorials` removes from MMKV via `storageBridge.multiRemove`, which mirrors removals to AsyncStorage.

---

## Phase 1b — Confirmed logout silent failure fix

| File | Line | Change |
|------|------|--------|
| `src/screens/DashboardScreen.js` | `handleSignOut` | `AsyncStorage.clearUserSession().catch(() => {})` replaced with a catch that logs and shows a toast |

Added:
- `import useToast from '../hooks/useToast';`
- `const { showToast } = useToast();`

New catch body:

```js
await AsyncStorage.clearUserSession().catch((err) => {
  console.warn('[Dashboard] clearUserSession failed during sign out:', err?.message || String(err));
  showToast('Sign out cleanup incomplete. Some local data may remain.', 'error');
});
```

Navigation still always happens; the toast only warns the user that local cleanup was incomplete.

---

## Phase 2 — Candidate storage bypass investigation

For each candidate, the investigation asked: *is this raw call redundant with `storageBridge`, or is it filling a real gap?*

| File | Line(s) | Finding | Action Taken |
|------|---------|---------|--------------|
| `src/utils/auth.js` | 114 | **Genuine gap** — Supabase OAuth stores PKCE keys directly in AsyncStorage. `storageBridge.getAllKeys` only enumerates MMKV, so raw AsyncStorage enumeration is required to find and clear those keys. | **Left raw.** Added a clarifying comment and kept the existing `console.warn` on failure. |
| `src/screens/DashboardScreen.js` | 294, 329 | **Redundant** — `storageBridge.getItem` already reads MMKV, then AsyncStorage, and reconciles the two. | Converted both fallbacks to `await AsyncStorage.getItem(LEADS_STORAGE_KEY)`. |
| `src/screens/ExportScreen.js` | 423 | **Redundant** — `saveLeads([])` already writes an empty array through `storageBridge`; the raw `removeItem` was duplicating cleanup. | Converted to `await AsyncStorage.removeItem(LEADS_STORAGE_KEY)` with a log-on-failure catch. |
| `src/screens/LeadLockCameraScreen.js` | 699 | **Redundant** — the code did `setSync` plus an awaited raw `setItem`. `storageBridge.setItem` does exactly that (MMKV + awaited AsyncStorage mirror). | Replaced both write blocks with a single `await storageBridge.setItem(...)`. |
| `src/screens/LoginScreen.js` | 389 | **Redundant** — `storageBridge.getItem` reconciles both stores; `storageBridge.removeItem` removes from both. | Converted raw reads and backup removal to `AsyncStorage.getItem`/`removeItem`. Added log callbacks to the `.catch` handlers. |
| `src/screens/SettingsScreen.js` | 456 | **Redundant** — same MMKV-parse fallback pattern as Dashboard/TerritoryMap. | Converted to `await AsyncStorage.getItem(LEADS_STORAGE_KEY)`. |
| `src/screens/SettingsScreen.js` | 718 | **Genuine gap** — `storageBridge.removeSync`/`removeItem` schedules the AsyncStorage mirror removal fire-and-forget; this path wants the backup removed before telling the user the queue is cleared. | **Left raw** `AsyncStorage.removeItem`, but replaced the empty catch with a log + `showToast` so the failure is no longer silent. |
| `src/screens/TerritoryMapScreen.js` | 533, 655 | **Redundant** — `storageBridge.getItem` covers the dual-store read. | Converted both fallbacks to `await AsyncStorage.getItem(LEADS_STORAGE_KEY)`. |
| `src/utils/permissionManager.js` | 15, 29 | **Genuine gap** — the file intentionally bypasses MMKV (see comments "Bypass MMKV"). `storageBridge` has no AsyncStorage-only mode. | **Left raw.** |
| `src/utils/territoryUtils.js` | 9 | **Redundant** — `dualRead`/`dualWrite` were reimplementing `storageBridge.getItem`/`setItem`. | Removed `getRaw`, rewrote `dualRead` to `await AsyncStorage.getItem(key)` and `dualWrite` to `await AsyncStorage.setItem(key, value)`. |
| `src/utils/territoryZipLoader.js` | 154 | **Redundant** — the raw `setItem` duplicated the mirror write already performed by `storageBridge.setItem`. | Replaced with a single `await storageBridge.setItem(...)`. |
| `src/utils/zipBoundaryCache.js` | 43, 79 | **Redundant** — `storageBridge.setItem`/`getItem` already cover the dual-store write/read. | `persistBounds` now uses `await AsyncStorage.setItem(...)`; the raw AsyncStorage fallback read was replaced with `await AsyncStorage.getItem(...)`. |

### Phase 2 items explicitly left for convention-gap discussion

1. **`src/utils/auth.js:114`** — needs raw AsyncStorage enumeration for PKCE cleanup.
2. **`src/screens/SettingsScreen.js:718`** — needs an awaitable AsyncStorage removal that `storageBridge.removeSync`/`removeItem` does not currently guarantee.
3. **`src/utils/permissionManager.js:15,29`** — intentionally AsyncStorage-only by design.

If the project wants to eliminate these remaining raw calls, `storageBridge` would need new APIs: `getAllKeysAsync` that enumerates AsyncStorage, an awaitable `removeItem` variant, and an AsyncStorage-only read/write mode.

---

## Phase 3 — Fire-and-forget `.catch(() => {})` classification and remediation

Classification applied per BETA-62:
- **User-initiated actions** → log + surface to user.
- **Background/cache/telemetry** → log only.

| File | Line(s) | Operation | Classification | Catch body now logs |
|------|---------|-----------|----------------|---------------------|
| `src/screens/DashboardScreen.js` | 766 | `processQueue()` after enrich | background | `console.warn('[Dashboard] processQueue failed:', err)` |
| `src/screens/BatchReviewScreen.js` | 428 | `enqueueEnrichLead(lead)` | background | `console.warn('[BatchReview] enqueueEnrichLead failed:', err)` |
| `src/screens/BatchReviewScreen.js` | 430 | `processQueue()` after batch save | background | `console.warn('[BatchReview] processQueue failed:', err)` |
| `src/screens/ExportScreen.js` | 229 | `processQueue()` after `enqueueSyncAll()` | background | `console.warn('[Export] processQueue failed:', err)` |
| `src/screens/CaptureScreen.js` | 555 | `updateScanSessionStatus(...FAILED)` | telemetry | `console.warn('[Capture] Failed to mark recovery session failed:', sessionErr)` |
| `src/screens/CaptureScreen.js` | 1257, 1420 | `updateScanSessionStatus(...COMPLETED)` | telemetry | `console.warn('[Capture] Failed to mark scan session completed:', sessionErr)` |
| `src/screens/TerritoryMapScreen.js` | 212 | `AsyncStorage.setItem(MAP_FILTERS_KEY, ...)` | cache | `console.warn('[TerritoryMap] Failed to persist map filters:', err)` |
| `src/screens/TerritoryMapScreen.js` | 213 | `AsyncStorage.setItem(PROSPECT_FILTERS_KEY, ...)` | cache | `console.warn('[TerritoryMap] Failed to persist prospect filters:', err)` |
| `src/screens/TerritoryMapScreen.js` | 219 | `AsyncStorage.setItem(TARGET_LENS_MODE_KEY, ...)` | cache | `console.warn('[TerritoryMap] Failed to persist target lens mode:', err)` |
| `src/screens/TerritoryMapScreen.js` | 226 | `AsyncStorage.setItem(MAP_REGION_KEY, ...)` | cache | `console.warn('[TerritoryMap] Failed to persist map region:', err)` |
| `src/screens/TerritoryMapScreen.js` | 232 | `AsyncStorage.setItem(MAP_NEARBY_PLACES_KEY, ...)` | cache | `console.warn('[TerritoryMap] Failed to persist nearby places:', err)` |
| `src/screens/TerritoryMapScreen.js` | 641 | `saveMyZips(resolvedMyZips)` | background | `console.error('[TerritoryMap] Failed to persist territory ZIPs after remote fallback:', err)` |
| `src/screens/TerritoryMapScreen.js` | 927 | `AsyncStorage.getItem('leadlens_last_scan_time')` | ambiguous (see below) | `console.warn('[TerritoryMap] Failed to load last scan time:', err)` |
| `src/screens/LeadLockCameraScreen.js` | 223, 281, 307, 405 | `storageBridge.setItem('currentLocation', ...)` | cache | `console.warn('[LeadLockCamera] Failed to cache current location:', err)` |
| `src/screens/ExportScreen.js` | 424 | `AsyncStorage.removeItem(LEADS_STORAGE_KEY)` | background | `console.warn('[Export] Failed to clear AsyncStorage backup after export:', err)` |
| `src/utils/autoExport.js` | 204 | `maybeRunAutoExport(user)` on app resume | background | `console.error('[AutoExport] Resume-triggered auto-export failed:', err)` |
| `src/screens/ReviewScreen.js` | 549 | `AsyncStorage.setJSON(LEADS_STORAGE_KEY, updatedLeads)` | background | `console.warn('[Review] Failed to persist background enrichment updates:', err)` |
| `src/screens/SettingsScreen.js` | 307 | `loadAIRecommendationSettings()` | background | `console.warn('[Settings] Failed to load AI recommendation settings:', err)` |
| `src/screens/DashboardScreen.js` | 284 | `loadAIRecommendationSettings()` | background | `console.warn('[Dashboard] Failed to load AI recommendation settings:', err)` |

### Items called out for Joe's attention

1. **`src/screens/TerritoryMapScreen.js:641` — `saveMyZips(resolvedMyZips)`**
   - This runs inside the Supabase fallback branch of `loadMap()` and persists the remote territory assignment locally.
   - It is not directly user-initiated (the user is just opening the map), so the default BETA-62 treatment is **log only**.
   - **However**, a rep's territory silently failing to save is consequential. This is flagged as a strong candidate for future user-facing surfacing if Joe wants stronger signal here.

2. **`src/screens/TerritoryMapScreen.js:927` — `AsyncStorage.getItem('leadlens_last_scan_time')`**
   - This read feeds the `newSinceLastScan` filter. On failure, the filter silently stops filtering.
   - It is technically a cache read, so it was treated as **log only**.
   - **Ambiguity**: because the failure has a user-visible side effect, Joe should decide whether to also surface a toast when `newSinceLastScan` is enabled and the timestamp cannot be loaded.

---

## Build / lint verification

### Babel syntax validation

All 17 modified files were validated with `@babel/core` + `babel-preset-expo`:

```text
src/screens/BugReportScreen.js OK
src/screens/FeatureRequestScreen.js OK
src/utils/aiWelcome.js OK
src/utils/tutorialManager.js OK
src/screens/DashboardScreen.js OK
src/screens/ExportScreen.js OK
src/screens/LeadLockCameraScreen.js OK
src/screens/LoginScreen.js OK
src/screens/SettingsScreen.js OK
src/screens/TerritoryMapScreen.js OK
src/utils/territoryUtils.js OK
src/utils/territoryZipLoader.js OK
src/utils/zipBoundaryCache.js OK
src/screens/BatchReviewScreen.js OK
src/screens/CaptureScreen.js OK
src/screens/ReviewScreen.js OK
src/utils/autoExport.js OK
```

### Pre-existing issues discovered during verification

1. **`src/screens/DashboardScreen.js`** contained two pre-existing parse errors from an earlier fix pass:
   ```js
   if (__DEV__) {

   } catch (e) { ... }
   ```
   The `if (__DEV__) { ... }` block was missing its closing brace before the `try`/`catch`. These were corrected to valid syntax so the file would bundle:
   ```js
   if (__DEV__) {
     // no-op
   }
   } catch (e) { ... }
   ```
   Both occurrences (batch delete and single delete) were fixed.

2. **`src/utils/aiWelcome.js`** has a pre-existing `no-undef` lint error: `FALLBACK_AI_WELCOME` is used but never defined or imported. This was **not** introduced by this pass and was present in the backup file. It does not affect Babel parsing but will throw at runtime if that code path is reached.

### ESLint result on modified files

All modified files pass ESLint **except** the pre-existing `FALLBACK_AI_WELCOME` undefined-variable errors in `src/utils/aiWelcome.js`.

---

## Files modified

```
src/screens/BugReportScreen.js
src/screens/FeatureRequestScreen.js
src/utils/aiWelcome.js
src/utils/tutorialManager.js
src/screens/DashboardScreen.js
src/screens/ExportScreen.js
src/screens/LeadLockCameraScreen.js
src/screens/LoginScreen.js
src/screens/SettingsScreen.js
src/screens/TerritoryMapScreen.js
src/utils/territoryUtils.js
src/utils/territoryZipLoader.js
src/utils/zipBoundaryCache.js
src/screens/BatchReviewScreen.js
src/screens/CaptureScreen.js
src/screens/ReviewScreen.js
src/utils/autoExport.js
```

Timestamped `.bak-1786535988186` backups were created for each modified file.
