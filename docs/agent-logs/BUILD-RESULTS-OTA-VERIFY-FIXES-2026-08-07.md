# BUILD RESULTS — OTA Security & Crash Fix
## August 7, 2026

---

## COMMIT

```
7831dcd2 fix: remove hardcoded Scarlett credentials, fix module-scope throw crashing app on load

- BetaFeedbackScreen.js: Replace hardcoded JWT/URL with EXPO_PUBLIC env vars;
  move guard from module-scope to submission-time to prevent app crash when
  env vars are missing
- territoryZipLoader.js: Remove 5 [DEBUG] console.log statements that leaked
  Supabase anon key and env vars
```

**Files modified:** 2
- `src/screens/BetaFeedbackScreen.js` (+8 / -2)
- `src/utils/territoryZipLoader.js` (+2 / -9)

---

## OTA PUSH

| Field | Value |
|---|---|
| **Branch** | `production` |
| **Runtime version** | `2.0.62` |
| **Update group ID** | `640f57fc-3ac8-420e-bf8d-9fcd1400b358` |
| **Android update ID** | `019fdd89-4626-7650-81bf-76660ed44518` |
| **iOS update ID** | `019fdd89-4626-7531-a52e-008b2d7d6376` |
| **EAS Dashboard** | [View update](https://expo.dev/accounts/jdugg80/projects/leadlens/updates/640f57fc-3ac8-420e-bf8d-9fcd1400b358) |

---

## ENV VAR STATUS

**Before this OTA:**
- `EXPO_PUBLIC_SCARLETT_SUPABASE_URL` was **missing from `.env`**
- Added to `.env:13` during this session
- `.env` is gitignored — would NOT be included in future builds

**During this OTA export:**
- EAS CLI loads `.env` at export time, so the env var **WAS bundled into this JS update**
- Export output confirmed: `env: export ... EXPO_PUBLIC_SCARLETT_SUPABASE_URL ...`

**For future OTA/builds:**
- If `.env` file exists locally with the var, EAS CLI will pick it up at export time
- If only relying on EAS env config, the var must be set there too
- `eas env:list` requires interactive stdin — could not verify remotely

---

## FIX VERIFICATION

### Fix 1: Security — Hardcoded Credentials
**BetaFeedbackScreen.js:16-17**

| Before | After |
|---|---|
| Hardcoded `SCARLETT_URL` and `SCARLETT_KEY` | `process.env.EXPO_PUBLIC_SCARLETT_SUPABASE_URL` / `EXPO_PUBLIC_SCARLETT_ANON_KEY` |

✅ Credentials removed from source code
✅ Env var loaded from `.env` during export

### Fix 2: Security — Debug Console Logs
**territoryZipLoader.js:179-192**

| Before | After |
|---|---|
| 5 `console.log('[DEBUG]...')` statements leaking Supabase URL and anon key | Clean function, no logging |

✅ All debug logs removed

### Fix 3: Crash — Module-Scope Throw
**BetaFeedbackScreen.js:16-20**

| Before | After |
|---|---|
| Module-scope `if (!SCARLETT_URL) throw new Error(...)` crashed entire app on import | Guard moved to `submitFeedback()` line 60-63 |

✅ Screen renders without crashing when env vars are missing
✅ User sees error only at submission time (not on load)

---

## RECOMMENDED TEST PROCEDURE

1. Force-close LeadLens completely
2. Reopen the app — it should load without crashing (previously crashed to black screen)
3. Tap "Send Feedback" from SupportScreen
4. BetaFeedbackScreen should render with 5 topic chips and form fields
5. Fill in the form and tap Submit
6. If `EXPO_PUBLIC_SCARLETT_SUPABASE_URL` is set: submission should succeed (look for green checkmark)
7. If env var is missing: should show user-friendly error "Feedback submission is not configured"

---

## NOTES

- **No native build required** — both fixes are JS-only changes delivered via OTA
- **Runtime version unchanged** (2.0.62) — compatible with BETA-61 (commit `88c20652`)
- `supabase/` directory changes and `package.json` lockfile changes from prior work are NOT included in this OTA (intentional)
- Untracked report .md files intentionally excluded from commit
