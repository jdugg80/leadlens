# DIAGNOSIS-TESTER-CRASH-EXPOSURE — 2026-08-07

## Verdict: NO TESTER EXPOSURE

The throw-introducing change was **never committed, never built, and never deployed**. Testers were not exposed.

---

## Step 1: EAS Env Var State

**Could not query EAS env vars directly** — `eas env:list` requires interactive stdin which is unavailable in this context. However, this is moot because:

- The security fix (AGENT-FIX-SECURITY-EXPOSURE) that introduced the module-scope throw is **uncommitted** — only local working tree changes to `BetaFeedbackScreen.js` and `territoryZipLoader.js`
- `git status` confirms these files as modified but not staged/committed
- `git log --oneline -20` shows no commit containing the throw guard
- Therefore, no EAS build was ever triggered with the throw guard in the codebase

**Current `.env` state:** `EXPO_PUBLIC_SCARLETT_SUPABASE_URL` was added to `.env` in this session (line 13). Before today's fix, it was missing from `.env`. But since no build was deployed with the throw, this is informational only.

**EAS build profiles:** Both `preview` and `production` use `channel: "production"` (eas.json lines 17, 25). The last release was BETA-61 on 2026-07-29 (commit `88c20652`). No builds have been triggered since.

---

## Step 2: Build/OTA Timeline

| Event | Timestamp | Deployed? |
|-------|-----------|-----------|
| BETA-61 release | 2026-07-29 | YES — last native build to testers |
| Employee number fix (`5c13c8c1`) | 2026-08-07 00:59 CDT | Committed but **no build/OTA triggered** |
| Security fix (throw guard) | 2026-08-07 (this session) | **NOT committed** |
| Support screen regression fix | 2026-08-07 (this session) | **NOT committed** |

**Key finding:** The throw guard was introduced and removed within the same session, all uncommitted. No native build or OTA update was ever deployed containing the throw.

**OTA mechanics (for reference):** Even if an OTA had been pushed, the Expo OTA cycle requires two app launches (download on first, apply on second). But this is irrelevant — no OTA was pushed.

---

## Step 3: Sentry Check

**Could not query Sentry directly** — `SENTRY_AUTH_TOKEN` is empty in `.env` (line 44). Sentry API requires authentication.

**BetaTracker data (Project Scarlett) confirms no crash events:**

| Check | Result |
|-------|--------|
| Error events since Aug 5 | 2 events — both `AudioFocusNotAcquiredException` (audio focus, not crash) |
| Crash/fatal events | **None** |
| AppErrorBoundary triggers | **None** since Jul 17 (pre-existing `reacquiringZip` bug, unrelated) |
| Session starts from testers | Jose Bueno: 1 session on Aug 4; Duane Pierre: **0 sessions since Aug 1**; David Rittenhouse: **0 sessions since Aug 1** |
| Session starts from Joe | 4 sessions on Aug 7 (app is working) |

**Tester activity:**
- `dpdivers01@gmail.com` (Duane Pierre): No activity since before Aug 1 — likely hasn't opened the app recently, not a crash symptom
- `ritzob4life@gmail.com` (David Rittenhouse): No activity since before Aug 1 — same
- `josecbueno22@gmail.com` (Jose Bueno): 1 session_start on Aug 4, no activity since — normal usage pattern, no crash indicators

---

## Summary

| Question | Answer |
|----------|--------|
| Was the throw guard ever committed? | **NO** — uncommitted local changes only |
| Was a native build ever deployed with the throw? | **NO** — last build was BETA-61 on Jul 29 |
| Was an OTA update ever pushed with the throw? | **NO** — no OTA was triggered |
| Are EAS env vars missing `EXPO_PUBLIC_SCARLETT_SUPABASE_URL`? | **Moot** — no build was deployed with the guard |
| Did any tester experience a launch crash? | **NO** — BetaTracker shows no crash events from any tester |
| Is Sentry data available? | **Partial** — can't query API, but BetaTracker confirms no crashes |

**Conclusion:** No tester-facing heads-up or apology is warranted. The throw guard existed only in the local working tree for a brief period during this session and was never deployed to any build or OTA update. The fix (rescoping to submission-time + adding env var) is already in place locally and ready for the next commit/build.
