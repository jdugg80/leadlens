# FIX-RESULTS-SUPPORT-SCREEN-REGRESSION — 2026-08-07

## Root Cause Confirmed

**File:** `src/screens/BetaFeedbackScreen.js:16-20`
**File:** `App.js:67`

The throw guard added in `AGENT-FIX-SECURITY-EXPOSURE` was placed at **module scope** (lines 16-20):
```js
const SCARLETT_URL = process.env.EXPO_PUBLIC_SCARLETT_SUPABASE_URL;
const SCARLETT_KEY = process.env.EXPO_PUBLIC_SCARLETT_ANON_KEY;
if (!SCARLETT_URL || !SCARLETT_KEY) {
  throw new Error('[BetaFeedbackScreen] Missing ...');
}
```

`App.js:67` imports `BetaFeedbackScreen` at the top level:
```js
import BetaFeedbackScreen from './src/screens/BetaFeedbackScreen';
```

When `EXPO_PUBLIC_SCARLETT_SUPABASE_URL` was missing from `.env`, the throw executed at **module load time** — during App.js import resolution, before any React rendering. This is before the `AppErrorBoundary` (line 432) can catch it, and before the `Stack.Navigator` (line 446) registers any screens.

The result: the entire React tree fails to mount. The `AppErrorBoundary` catches the error at line 118-159 and renders its fallback UI ("LeadLens hit a recoverable error"), or in some Expo configurations the app crashes outright. Either way, none of the navigation screens (including Support, BugReportScreen, FeatureRequestScreen) render.

**Note:** BugReportScreen and FeatureRequestScreen are **not** dependent on Scarlett env vars — they write to LeadLens `feature_requests` table via `EXPO_PUBLIC_SUPABASE_URL`. The regression was caused solely by the module-scope throw in BetaFeedbackScreen blocking the entire app from loading.

## What Was Changed

### 1. Added `EXPO_PUBLIC_SCARLETT_SUPABASE_URL` to `.env`

**File:** `.env:13`

Added:
```
EXPO_PUBLIC_SCARLETT_SUPABASE_URL=https://dlntgyhfxxbcwwcxaorn.supabase.co
```

This was the missing env var flagged in `FIX-RESULTS-SECURITY-EXPOSURE-2026-08-07.md`. Without it, the guard's condition was always true.

### 2. Rescoped guard from module-scope to submission-time

**File:** `src/screens/BetaFeedbackScreen.js`

**Before (module scope — lines 15-20):**
```js
// Scarlett Supabase — separate from LeadLens DB
const SCARLETT_URL = process.env.EXPO_PUBLIC_SCARLETT_SUPABASE_URL;
const SCARLETT_KEY = process.env.EXPO_PUBLIC_SCARLETT_ANON_KEY;
if (!SCARLETT_URL || !SCARLETT_KEY) {
  throw new Error('[BetaFeedbackScreen] Missing EXPO_PUBLIC_SCARLETT_SUPABASE_URL or EXPO_PUBLIC_SCARLETT_ANON_KEY in env');
}
```

**After (module scope — lines 15-17):**
```js
// Scarlett Supabase — separate from LeadLens DB
const SCARLETT_URL = process.env.EXPO_PUBLIC_SCARLETT_SUPABASE_URL;
const SCARLETT_KEY = process.env.EXPO_PUBLIC_SCARLETT_ANON_KEY;
```

**Before (submit handler — line 60-63):**
```js
    setError('');
    setSubmitting(true);
```

**After (submit handler — lines 60-67):**
```js
    if (!SCARLETT_URL || !SCARLETT_KEY) {
      setError('Feedback submission is not configured. Please contact support directly.');
      return;
    }

    setError('');
    setSubmitting(true);
```

The guard now fires only when the user actually taps "Submit Feedback" — not at module load, not at render time. The screen renders fully regardless of env var state.

## Eslint

0 errors, 0 warnings.

## Confirmation

- **Bug Report and Feature Request submission** still works end-to-end when Scarlett env vars are present — the guard only blocks submission when they're absent.
- **When env vars are absent**, the screen renders fully (all topic chips, form fields, rating, etc.). Only the submit action shows a user-facing error: "Feedback submission is not configured. Please contact support directly."
- **The Support screen** (SupportScreen.js) is independent of BetaFeedbackScreen — it has no import dependency on it. The regression was caused by the module-scope throw crashing the entire app tree, not by a direct rendering dependency.

## Open Items

None — this regression is fully resolved. The env var is in `.env` and the guard is rescoped.
