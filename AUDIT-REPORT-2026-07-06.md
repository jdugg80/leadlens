# LeadLens Full Project Audit & Integrity Sweep

**Date:** 2026-07-06
**Project:** LeadLens v2.0.53 (BETA-53)
**Branch:** `main` (commit `f7c893df`, 2026-07-02)
**Remote:** https://github.com/jdugg80/leadlens.git
**Scope:** Full codebase audit — security, code quality, git integrity

---

## Findings Summary

| Severity | Count |
|----------|-------|
| **CRITICAL** | 6 |
| **HIGH** | 10 |
| **MEDIUM** | 15 |
| **LOW** | 10 |
| **Total** | **41** |

---

## CRITICAL SEVERITY

### [C1] Git-Tracked Keystore + Plaintext Credentials

**Files:** `@jdugg80__leadlens.jks`, `credentials.json`

`credentials.json` contains the plaintext keystore password `JJ.0324!!!!`. Anyone with repo access can sign APKs as the developer identity. The `.gitignore` has `*.jks` but these were committed before the rule was added.

**Action:** `git rm --cached` both files, rotate keystore passwords immediately. Consider regenerating the keystore entirely.

---

### [C2] Hardcoded Admin Password in Client Code

**File:** `src/screens/SettingsScreen.js:272`

```javascript
if (adminPasswordInput === 'JJ.0324!!!!') {
```

The admin password for protected settings is hardcoded directly in client-side JavaScript. Visible to anyone who decompiles the APK. Same password used for the Android keystore.

**Action:** Move to a server-side check or use a hashed comparison.

---

### [C3] Anthropic API Key Exposed to Client via EXPO_PUBLIC_ Prefix

**Files:**

| File | Line |
|------|------|
| `src/utils/claudeApi.js` | 6 |
| `src/utils/businessCardEnricher.js` | 8 |
| `src/utils/buildingPermitsService.js` | 13 |
| `src/utils/healthDepartmentService.js` | 15 |
| `src/utils/multiBusinessDetection.js` | 13 |
| `src/utils/propertyRecordsService.js` | 12 |

The `EXPO_PUBLIC_` prefix causes React Native to embed the value directly in the client bundle. Anyone decompiling the APK can extract this key and make Anthropic API calls billed to your account. The `claude-proxy` and `extract-prospect` Edge Functions already exist for this purpose.

**Action:** Move all Anthropic calls to Edge Functions, remove client-side key.

---

### [C4] Unauthenticated claude-proxy Edge Function

**File:** `supabase/functions/claude-proxy/index.ts`

- Accepts requests from **any origin** (CORS `*`)
- Has **no JWT verification** — does not check the `Authorization` header
- Passes the request body directly to Anthropic's API
- Returns the full Claude response

An attacker could write a script to call this endpoint thousands of times, running up a massive Anthropic bill.

**Action:** Add authentication check, restrict CORS to own domains.

---

### [C5] PIN Stored in Plaintext AsyncStorage

**File:** `src/screens/LoginScreen.js:547`

```javascript
await AsyncStorage.setItem(USER_PIN_KEY, pinInput);
```

The user's login PIN is stored as plaintext. On rooted/jailbroken devices or via backup extraction, this is trivially accessible.

**Action:** Hash PIN before storing, compare hashes on login.

---

### [C6] 13+ Production Secrets in .env File

**File:** `.env` (not tracked by git, but present on disk)

| Secret | Risk |
|--------|------|
| `SUPABASE_SERVICE_ROLE_KEY` | Full admin access to Supabase |
| `SCARLETT_SERVICE_ROLE_KEY` | Full admin access to Scarlett project |
| `GITHUB_TOKEN` (`ghp_ClP1C...`) | Full GitHub PAT — repo write access |
| `EXPO_TOKEN` | EAS build token |
| `NETLIFY_AUTH_TOKEN` | Deployment access |
| `RESEND_API_KEY` | Email sending |
| `EXPO_PUBLIC_ANTHROPIC_API_KEY` | Claude API (client-exposed) |
| `EXPO_PUBLIC_GOOGLE_PLACES_API_KEY` | Google Maps |
| `NETLIFY_SITE_ID` | Site management |
| + 4 more | Various services |

If this file is ever leaked (backup, screen share, accidental git add), **every service is compromised simultaneously**.

**Action:** Consider using a secrets manager, audit file access permissions.

---

## HIGH SEVERITY

### [H1] Wildcard CORS on All 11 Supabase Edge Functions

Every Edge Function uses `Access-Control-Allow-Origin: *`:

| Function | File |
|----------|------|
| ai-welcome | `supabase/functions/ai-welcome/index.ts:2` |
| upsert-comptroller | `supabase/functions/upsert-comptroller/index.ts:12` |
| extract-prospect | `supabase/functions/extract-prospect/index.ts:2` |
| signal-ingest | `supabase/functions/signal-ingest/index.ts:5` |
| send-support-ticket | `supabase/functions/send-support-ticket/index.ts:2` |
| send-push-alert | `supabase/functions/send-push-alert/index.ts:5` |
| process-leadlock-capture | `supabase/functions/process-leadlock-capture/index.ts:5` |
| comptroller-lookup | `supabase/functions/comptroller-lookup/index.ts:12` |
| compliance-ingest | `supabase/functions/compliance-ingest/index.ts:2` |
| maps-proxy | `supabase/functions/maps-proxy/index.ts:4` |
| claude-proxy | `supabase/functions/claude-proxy/index.ts:10` |

**Action:** Restrict CORS to own domains only.

---

### [H2] Unauthenticated Netlify send-email Function

**File:** `netlify/functions/send-email.js`

Accepts any `to`, `subject`, `html`/`text` payload and sends it via Resend with no authentication. An attacker could use it to send arbitrary emails from your domain.

**Action:** Add authentication or API key check.

---

### [H3] enrich-lead-batch Uses Anon Key (Bypasses RLS)

**File:** `supabase/functions/enrich-lead-batch/index.ts:50`

```typescript
const client = createClient(supabaseUrl, supabaseAnonKey);
```

Uses the **anon key** instead of the service role key. Combined with no authentication check and CORS `*`, this could allow unauthenticated batch enrichment operations.

**Action:** Use service role key and add authentication.

---

### [H4] Sensitive Data Leaked via console.log (100+ Instances)

High-risk instances that leak sensitive information:

| File | Line | What's Leaked |
|------|------|---------------|
| `src/utils/auth.js` | 20 | `OAUTH_REDIRECT_URL` logged at module load |
| `src/utils/auth.js` | 119 | PKCE keys logged |
| `src/utils/auth.js` | 240 | Full OAuth callback URL with tokens |
| `src/screens/LoginScreen.js` | 412 | User email on login attempt |
| `src/screens/LoginScreen.js` | 418 | Full auth failure response (may contain tokens) |
| `src/screens/LoginScreen.js` | 433 | User UID logged |
| `src/screens/LoginScreen.js` | 450 | Full OAuth failure response |
| `src/utils/territoryZipLoader.js` | 178 | `EXPO_PUBLIC_SUPABASE_URL` |
| `src/utils/territoryZipLoader.js` | 179 | First 20 chars of anon key |
| `src/utils/territoryZipLoader.js` | 206 | User email |
| `src/features/cardScan/storage/scanSessions.js` | 23, 59 | Session IDs |
| `src/auth/microsoftAuth.ts` | 51 | Supabase URL |
| `src/auth/microsoftAuth.ts` | 107 | Full OAuth result object |

**Action:** Remove all `console.log` from production code. Use a logging abstraction.

---

### [H5] Upstream API Errors Leaked to Clients

| Function | Line | Leaked |
|----------|------|--------|
| `ai-welcome` | 106-111 | Full Anthropic error response |
| `analyze-submission` | 163 | `String(err)` — stack traces |
| `send-support-ticket` | 119 | Full Resend API error |
| `extract-prospect` | 176-183 | Full Claude API error response |
| `maps-proxy` | 107 | Full Google Maps API response |

**Action:** Return generic error messages, log details server-side only.

---

### [H6] Zero Test Files in Entire Project

No `.test.js`, `.test.ts`, `.spec.js`, `.spec.ts`, or `__tests__/` directories found anywhere. No `test` script in `package.json`.

**Action:** Add test infrastructure (Jest/Vitest), write critical-path tests.

---

### [H7] Duplicate normalizePhone Defined in 5 Files

| File | Line | Exported? |
|------|------|-----------|
| `src/utils/enrichmentNormalizer.js` | 8 | Yes |
| `src/utils/leadHelpers.js` | 3 | Yes |
| `src/utils/leadProcessing.js` | 3 | Yes |
| `src/utils/leadLockOcrPipeline.js` | 32 | No (local) |
| `src/utils/phoneExtraction.js` | 12 | No (local) |

Also duplicated: `normalizeEmail`, `normalizeFixedFieldValue`, `normalizeState`, `normalizeZip` (each in 2 files).

**Action:** Consolidate into a single canonical module.

---

### [H8] 39 Empty Catch Blocks (Silent Error Swallowing)

**28 instances** of `catch {}` (no error variable):

| File | Lines |
|------|-------|
| `src/screens/SettingsScreen.js` | 421, 445, 454, 603 |
| `src/screens/TerritoryMapScreen.js` | 930, 991 |
| `src/utils/territoryZipLoader.js` | 149, 154, 393 |
| `src/utils/tutorialManager.js` | 23, 30, 39, 46 |
| `src/utils/zipBoundaryCache.js` | 45, 71, 85 |
| `src/utils/auth.js` | 145, 248 |
| `src/screens/CardGalleryScreen.js` | 76 |
| `src/screens/GeoTargetReviewScreen.js` | 84 |
| `src/screens/LeadLockReviewScreen.js` | 87 |
| `src/screens/ManualEntryScreen.js` | 56 |
| `src/screens/ProspectQueueScreen.js` | 85 |
| `src/utils/aiWelcome.js` | 51 |
| `src/utils/socialEnrichment.js` | 124 |
| `src/utils/territoryUtils.js` | 16, 24, 25 |

**11 instances** of `catch (_) {}` or `catch (e) {}`:

| File | Lines |
|------|-------|
| `src/screens/TerritoryMapScreen.js` | 220, 307, 469, 726, 788, 1228 |
| `src/screens/LeadLockCameraScreen.js` | 247 |
| `src/screens/LoginScreen.js` | 362 |
| `src/utils/auth.js` | 121, 164 |
| `src/components/LeadFiltersBottomSheet.js` | 63 |

**Action:** Add proper error handling or at minimum log the error.

---

### [H9] ~70 Swallowed Errors via .catch(() => {})

| File | Count | Example Lines |
|------|-------|---------------|
| `src/screens/DashboardScreen.js` | ~25 | 276, 281, 306, 315, 316, 328, 330, 331, 335, 341 |
| `src/screens/CaptureScreen.js` | ~15 | 290, 553, 579, 962, 1002, 1036, 1065, 1114 |
| `src/screens/BatchReviewScreen.js` | ~6 | 96, 426, 430, 432, 440 |
| `src/screens/ExportScreen.js` | ~4 | 227, 250, 324, 421 |
| `src/screens/ReviewScreen.js` | ~3 | 531, 593, 649 |

Includes critical operations: `supabase.auth.signOut().catch(() => {})`, data removal failures silently ignored.

**Action:** Add proper error handling to each.

---

### [H10] 21 Files Exceed 500 Lines (8 Exceed 1000)

| File | Lines |
|------|-------|
| `src/screens/CaptureScreen.js` | **2,002** |
| `src/screens/SettingsScreen.js` | **1,950** |
| `src/screens/TerritoryMapScreen.js` | **1,527** |
| `src/screens/DashboardScreen.js` | **1,438** |
| `src/screens/ReviewScreen.js` | **1,346** |
| `src/utils/enrichmentNormalizer.js` | **1,038** |
| `src/screens/LoginScreen.js` | **1,007** |
| `src/screens/LeadLockCameraScreen.js` | **1,002** |
| `src/screens/ExportScreen.js` | 896 |
| `src/screens/ProspectQueueScreen.js` | 891 |
| `src/screens/SplashScreen.js` | 847 |
| `src/screens/AdminScreen.js` | 709 |
| `src/screens/BatchReviewScreen.js` | 699 |
| `src/screens/PhotoIngestScreen.js` | 671 |
| `src/screens/TerritoryManagerScreen.js` | 651 |
| `src/utils/multiBusinessDetection.js` | 615 |
| `src/utils/socialEnrichment.js` | 606 |
| `src/utils/nearbySearch.js` | 585 |
| `src/screens/LeadLockReviewScreen.js` | 572 |
| `src/utils/exportProfiles.js` | 550 |
| `src/utils/leadLockOcrPipeline.js` | 529 |

**Action:** Break into smaller components/modules.

---

## MEDIUM SEVERITY

### [M1] Duplicate LensSignalMapMarker Component (.js AND .tsx)

| File | Lines |
|------|-------|
| `src/features/lenssignal/LensSignalMapMarker.js` | 102 |
| `src/features/lenssignal/LensSignalMapMarker.tsx` | 145 |

**Action:** Remove the unused duplicate.

---

### [M2] Duplicate betaTracker.js at Root and src Level

| File |
|------|
| `utils/betaTracker.js` |
| `src/utils/betaTracker.js` |

**Action:** Consolidate to one location.

---

### [M3] 5 Example Files Never Imported

| File |
|------|
| `src/examples/DashboardScreen.example.js` |
| `src/examples/SettingsScreen.example.js` |
| `src/examples/ProspectQueueScreen.example.js` |
| `src/examples/TerritoryMapScreen.example.js` |
| `src/examples/TerritoryMap_static_activity_example.js` |

Zero imports found anywhere in the codebase.

**Action:** Remove dead files or document their purpose.

---

### [M4] Hardcoded Supabase URLs in 10+ Source Files

| File | Line | URL |
|------|------|-----|
| `release.js` | 69 | `https://dlntgyhfxxbcwwcxaorn.supabase.co` |
| `release.js` | 72 | `https://qkbvwryucaakkkqaqvka.supabase.co` |
| `src/screens/LoginScreen.js` | 565 | `https://dlntgyhfxxbcwwcxaorn.supabase.co` |
| `utils/updateChecker.js` | 15 | `https://dlntgyhfxxbcwwcxaorn.supabase.co` |
| `utils/betaTracker.js` | 19 | `https://dlntgyhfxxbcwwcxaorn.supabase.co` |
| `scripts/generate-changelog.js` | 16 | `https://qkbvwryucaakkkqaqvka.supabase.co` |
| `scripts/release.js` | 303-304 | Both URLs hardcoded |
| `App.js` | 134 | `https://dlntgyhfxxbcwwcxaorn.supabase.co` (fallback) |

**Action:** Centralize in a config module.

---

### [M5] Hardcoded API Base URLs in Source

| File | Line | URL |
|------|------|-----|
| `src/constants/index.js` | 181 | `https://okayestmedia.netlify.app/.netlify/functions/send-email` |
| `src/screens/SettingsScreen.js` | 158 | Same URL duplicated |
| `src/utils/businessCardEnricher.js` | 7 | `https://api.anthropic.com/v1/messages` |
| `src/utils/claudeApi.js` | 5 | `https://api.anthropic.com/v1/messages` |
| `src/utils/buildingPermitsService.js` | 11-12 | Houston permits + Anthropic URLs |

**Action:** Centralize in environment config.

---

### [M6] 44 Excessive `any` Types in TypeScript Files

| File | Count |
|------|-------|
| `src/features/lenssignal/LensSignalDetailsCard.tsx` | ~20 |
| `src/services/targetLens/targetLensMatcher.ts` | 5 |
| `src/lib/supabase.ts` | 4 |
| `src/utils/location/resolveZipFromLeadLockPhoto.ts` | 4 |
| `src/services/comptrollerNormalizer.ts` | 3 |
| `src/features/lenssignal/lenssignalTypes.ts` | 2 |
| 8 other files | 1 each |

**Action:** Add proper TypeScript interfaces.

---

### [M7] 604 console.* Calls Across src/ (~279 console.log)

| File | Approx Count |
|------|-------------|
| `src/utils/enrichmentNormalizer.js` | ~30 |
| `src/utils/leadLockUpdates.js` | ~20 |
| `src/utils/geoEnrich.js` | ~10 |
| `src/services/enrichmentProviders/bizcollectProvider.js` | ~10 |
| `src/utils/zipBoundaryCache.js` | ~8 |
| `src/components/CameraModal.js` | 4 |
| `src/screens/CaptureScreen.js` | ~5 |

**Action:** Remove from production, use a logging abstraction.

---

### [M8] Floating Promises (Missing await/.catch)

15+ instances of `recordUserActivityEvent()` called without `await` or `.catch()`:

| File | Lines |
|------|-------|
| `src/screens/AdminScreen.js` | 181 |
| `src/screens/BatchReviewScreen.js` | 435 |
| `src/screens/DashboardScreen.js` | 337, 385, 476, 510, 524, 537, 664, 704, 762 |
| `src/screens/ExportScreen.js` | 210, 216, 312 |
| `src/screens/ReviewScreen.js` | 359, 378, 397, 470, 585, 607 |
| `src/features/cardScan/processing/scanQueueProcessor.js` | 510 |

**Action:** Add `await` or `.catch()` to all async calls.

---

### [M9] 15+ Magic Numbers / Inline Literals

| File | Line | Value | Context |
|------|------|-------|---------|
| `src/utils/buildingPermitsService.js` | 16 | `14 * 24 * 60 * 60 * 1000` | 14-day cache TTL |
| `src/utils/addressGeocoder.js` | 9 | `24 * 60 * 60 * 1000` | 24-hour cache TTL |
| `src/utils/zipBoundaryCache.js` | 13 | `30 * 24 * 60 * 60 * 1000` | 30-day cache TTL |
| `src/utils/geoEnrich.js` | 3-5 | `10 * 60 * 1000`, `1500`, `60 * 1000` | Rate limiting |
| `src/utils/geoEnrich.js` | 154 | `120`, `350` | Distance thresholds |
| `src/utils/geoEnrich.js` | 234-242 | `25, 10, 20, 15, 30, 20, 10` | Scoring weights |
| `src/utils/enrichmentNormalizer.js` | 646-652 | `45, 20, 20, 15, 10, 10, 10` | Enrichment weights |
| `src/services/targetLens/targetLensMatcher.ts` | 94-96 | `30, 20, 50` | Data quality scores |
| `src/utils/backgroundStability.js` | 9 | `12 * 60 * 60 * 1000` | 12-hour workday |

**Action:** Extract to named constants.

---

### [M10] HTTP (Non-TLS) URL for External Service

**File:** `src/services/lensSignal/lensSignalSourceRegistry.ts:44`

```typescript
sourceUrl: 'http://houston-tx.healthinspections.us/',
```

Plain HTTP is used. Data is transmitted in cleartext.

**Action:** Upgrade to HTTPS.

---

### [M11] Inconsistent Import Styles

Some files use `storageBridge as AsyncStorage`, some use `storage as AsyncStorage`, some use `require()` directly. No consistent pattern.

**Action:** Standardize imports across the codebase.

---

### [M12] .exec() on User-Influenced Patterns (Regex DoS Risk)

**File:** `src/utils/socialEnrichment.js:95,274,288,291,296,502,537`

Multiple `regex.exec()` calls on user-supplied or scraped HTML content. Could lead to ReDoS (Regular Expression Denial of Service).

**Action:** Audit regex patterns for ReDoS vulnerabilities.

---

### [M13] child_process Usage in Scripts

| File | Line | Usage |
|------|------|-------|
| `scripts/generate-changelog.js` | 12 | `execSync` |
| `scripts/release.js` | 16 | `execSync`, `spawnSync` |
| `release.js` | 31 | `execSync` |

Build/release scripts only (not runtime), but if any user-controlled input reaches these, it could enable command injection.

**Action:** Sanitize inputs, prefer `spawn` over `exec`.

---

### [M14] Silent Error Swallowing Masking Security Failures

Critical operations with silent error handling:
- `supabase.auth.signOut().catch(() => {})` — sign-out failure silently ignored
- `RawStorage.removeItem(LEADS_STORAGE_KEY).catch(() => {})` — data removal failure ignored
- Memory warning BetaTracker call silently ignored

**Action:** Log errors at minimum, handle where possible.

---

### [M15] web/.idea/ Files Tracked Despite .gitignore

| File |
|------|
| `web/.idea/.gitignore` |
| `web/.idea/caches/deviceStreaming.xml` |
| `web/.idea/modules.xml` |
| `web/.idea/vcs.xml` |
| `web/.idea/web.iml` |

Committed before `web/.gitignore` rule for `.idea` was added.

**Action:** `git rm --cached web/.idea/`

---

## LOW SEVERITY

### [L1] No Prettier Configuration

No `.prettierrc` or `prettier.config.js` anywhere in the project.

**Action:** Add Prettier config for consistent formatting.

---

### [L2] No typecheck Script in package.json

TypeScript files exist but no `tsc`/`typecheck` script defined.

**Action:** Add `"typecheck": "tsc --noEmit"` script.

---

### [L3] No format Script in package.json

**Action:** Add `"format": "prettier --write ."` script.

---

### [L4] CRLF Warning on change-log.txt

Benign with `core.autocrlf=true` but consider adding `*.txt text eol=lf` rule for consistency.

---

### [L5] Stale Git Stash from BETA-49 Era

```
stash@{0}: WIP on main: e4e89c01 BETA-49: Fix export crash
```

**Action:** Run `git stash drop stash@{0}`.

---

### [L6] assets/zip_boundaries.json Is 4.3 MB

Large JSON blob in repo. Should ideally be loaded from a CDN or Supabase Storage at runtime.

**Action:** Move to CDN or Supabase Storage.

---

### [L7] assets/NeuroArc_splashscreen.mp4 Is 5.1 MB

**Action:** Use Git LFS for video/media assets, or host externally.

---

### [L8] android/app/debug.keystore Is Tracked

Low risk (debug keystore), but should be gitignored.

**Action:** `git rm --cached android/app/debug.keystore`.

---

### [L9] One TODO Comment

**File:** `src/features/lenssignal/lenssignalScoring.ts:63`

```typescript
// TODO: Add support for active profile emoji once state is available here
```

**Action:** Address or track in issue tracker.

---

### [L10] feature/targetlens-homeowner Branch Exists

Both local and remote. Verify if still active or can be cleaned up.

**Action:** Merge or delete if stale.

---

## Git Repository Status

| Item | Value |
|------|-------|
| Current Branch | `main` |
| Tracking | Up to date with `origin/main` |
| Latest Commit | `f7c893df` — `chore(release): BETA-53 -- 2026-07-02` |
| Unstaged Changes | None (change-log.txt committed) |
| Untracked Files | None |
| Stale Stash | 1 (from BETA-49 era) |
| Branches | `main`, `feature/targetlens-homeowner` |

---

*Report generated by automated audit sweep — 2026-07-06*
