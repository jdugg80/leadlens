# FIX-RESULTS-SECURITY-EXPOSURE — 2026-08-07

## Task 1: Remove hardcoded Scarlett credentials from `BetaFeedbackScreen.js`

### Diff Summary

**Before (lines 15-17):**
```js
// Scarlett Supabase — separate from LeadLens DB
const SCARLETT_URL = 'https://dlntgyhfxxbcwwcxaorn.supabase.co';
const SCARLETT_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsbnRneWhmeHhiY3d3Y3hhb3JuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyODE5NjQsImV4cCI6MjA5Mzg1Nzk2NH0.sN8lupQFAGGsPr_UuEQGqm9JYMASP8D0wyPfCxIMaAw';
```

**After (lines 15-20):**
```js
// Scarlett Supabase — separate from LeadLens DB
const SCARLETT_URL = process.env.EXPO_PUBLIC_SCARLETT_SUPABASE_URL;
const SCARLETT_KEY = process.env.EXPO_PUBLIC_SCARLETT_ANON_KEY;
if (!SCARLETT_URL || !SCARLETT_KEY) {
  throw new Error('[BetaFeedbackScreen] Missing EXPO_PUBLIC_SCARLETT_SUPABASE_URL or EXPO_PUBLIC_SCARLETT_ANON_KEY in env');
}
```

### Env Var Status

| Variable | Exists in `.env` | Used by other files |
|----------|-------------------|---------------------|
| `EXPO_PUBLIC_SCARLETT_ANON_KEY` | YES (line 17) | App.js:168, LoginScreen.js:596, betaTracker.js:20, updateChecker.js:16 |
| `EXPO_PUBLIC_SCARLETT_SUPABASE_URL` | **NO** | N/A |

**FLAG:** `EXPO_PUBLIC_SCARLETT_SUPABASE_URL` does NOT exist in `.env`. Only `SCARLETT_SUPABASE_URL` (without `EXPO_PUBLIC_` prefix) exists at line 12. In Expo, non-`EXPO_PUBLIC_` env vars are NOT available in client-side code via `process.env`. The hardcoded credentials have been replaced with env var reads, and a runtime guard will throw if either is undefined. **Joe must add `EXPO_PUBLIC_SCARLETT_SUPABASE_URL=https://dlntgyhfxxbcwwcxaorn.supabase.co` to `.env` and to EAS secrets before the next build.**

### Eslint
0 errors, 0 new warnings.

---

## Task 2: Remove debug logging that leaks the Supabase anon key

### Diff Summary

**Before (`src\utils\territoryZipLoader.js` lines 179-192):**
```js
async function getSupabaseClient() {
  try {
    console.log('[DEBUG] Attempting to create Supabase client...');
    console.log('[DEBUG] EXPO_PUBLIC_SUPABASE_URL:', process.env.EXPO_PUBLIC_SUPABASE_URL);
    console.log('[DEBUG] EXPO_PUBLIC_SUPABASE_ANON_KEY:', process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.substring(0, 20) + '...');
    
    const client = createSupabaseClient();
    console.log('[DEBUG] Client created:', !!client);
    return client;
  } catch (error) {
    console.log('[DEBUG] Error creating client:', error?.message);
    return null;
  }
}
```

**After (lines 179-185):**
```js
async function getSupabaseClient() {
  try {
    return createSupabaseClient();
  } catch {
    return null;
  }
}
```

All five `[DEBUG]` console.log statements removed. The function still returns `null` on error (handled by callers). No replacement logging added — the try/catch signal is the return value, not a log line.

### Eslint
0 errors, 0 new warnings (pre-existing warnings unchanged).

---

## Decision 3 Grep Pass: Additional JWT / supabase.co Hits

| File | Line | Match | Action |
|------|------|-------|--------|
| `src\screens\BetaFeedbackScreen.js` | 17 | `eyJhbGciOiJIUzI1NiIs...` (JWT) | FIXED in Task 1 |
| `src\screens\BetaFeedbackScreen.js` | 16 | `https://dlntgyhfxxbcwwcxaorn.supabase.co` | FIXED in Task 1 |
| `src\screens\LoginScreen.js` | 595 | `process.env.SCARLETT_SUPABASE_URL \|\| 'https://dlntgyhfxxbcwwcxaorn.supabase.co'` | CANDIDATE — hardcoded fallback URL (not a key); lower severity. Uses non-EXPO_PUBLIC_ env var which is undefined client-side, so always falls through to hardcoded value. Same env-var-only treatment recommended. |
| `src\screens\SettingsScreen.js` | 1430 | `placeholder="https://your-project.supabase.co"` | INFO — UI placeholder text, not a real credential |

No other hardcoded JWTs or Supabase URLs found in `src/`.

---

## Decisions for Joe

### Decision 1 — Key rotation
The Scarlett anon key has been in source (and git history) for an unknown period. Removing it from current source does not invalidate it. Joe needs to decide:
- Whether to rotate the Scarlett anon key via the Supabase dashboard
- If rotated, all places consuming `EXPO_PUBLIC_SCARLETT_ANON_KEY` (local `.env` + EAS secrets) need the new value before the next build

### Decision 2 — Git history
The hardcoded JWT is committed to git history even after Task 1 removes it from the working file. considerations:
- Supabase anon keys are designed to be client-embedded by default — the real security boundary is RLS on the tables the key can reach
- Scarlett's RLS status was not confirmed in the sweep (only LeadLens tables were checked)
- Rewriting history is disruptive (force-push, all collaborators/CI need to re-clone) and may not be necessary if RLS is solid
- No action taken in this pass

### Decision 3 — `EXPO_PUBLIC_SCARLETT_SUPABASE_URL` missing
`EXPO_PUBLIC_SCARLETT_SUPABASE_URL` does not exist in `.env`. Only `SCARLETT_SUPABASE_URL` (no `EXPO_PUBLIC_` prefix) exists. In Expo, non-`EXPO_PUBLIC_` vars are not available in client-side code. Joe must add `EXPO_PUBLIC_SCARLETT_SUPABASE_URL=https://dlntgyhfxxbcwwcxaorn.supabase.co` to `.env` and EAS secrets before the next build, or the `BetaFeedbackScreen` will throw at runtime.

### Decision 4 — `LoginScreen.js:595` hardcoded fallback
`LoginScreen.js:595` uses `process.env.SCARLETT_SUPABASE_URL || 'https://dlntgyhfxxbcwwcxaorn.supabase.co'`. Since `SCARLETT_SUPABASE_URL` is not `EXPO_PUBLIC_` prefixed, it's undefined client-side, so the hardcoded fallback is always used. Same env-var-only treatment recommended for a follow-up pass. Not changed in this briefing (out of scope).
