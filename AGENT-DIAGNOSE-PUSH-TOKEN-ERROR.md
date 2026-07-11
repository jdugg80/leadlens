# AGENT BRIEFING: Diagnose Push Notification Token Error

## Context
Last night's `release.js` run completed the release successfully but
threw an error during the tester push notification step — "invalid or
missing tokens." Notifications go out to the three named beta testers
(Duane Pierre, David Rittenhouse, Jose Bueno) via the Expo Push API.
Diagnose only in this pass — do not change any code or send any test
notifications yet.

## What to investigate

1. **Where release.js sends push notifications** — find the function/
   section that handles tester push notifications. Report:
   - What table/column it reads push tokens from (likely a Supabase
     table with an `expo_push_token` or similar column, tied to
     tester/user records)
   - The exact error message and where in the flow it's thrown (does it
     fail per-tester and continue, or does it abort the whole batch?)

2. **Current token state for the three testers** — query the relevant
   table and report, for each of the three testers:
   - Whether a push token value exists at all (NULL/empty vs present)
   - If present, whether it matches the expected Expo push token format
     (`ExponentPushToken[...]`)
   - When it was last updated, if there's a timestamp column

3. **How/when tokens get registered in the first place** — find the
   client-side code (likely in the app's notification permission/
   registration flow) that calls
   `Notifications.getExpoPushTokenAsync()` (or equivalent) and writes the
   result to Supabase. Report:
   - Whether this only runs once (e.g. on first launch / permission
     grant) or re-registers on every app open
   - Whether there's any known reason a token could go stale (e.g. app
     reinstall, device change, EAS project ID mismatch between builds)

4. **Expo push token validity** — if tokens exist but the error still
   fired, check whether they're being validated before sending (Expo's
   API can flag tokens as invalid in the response, e.g.
   `DeviceNotRegistered`). Report whether the code checks the Expo push
   API's response for per-token errors, or just checks token existence
   before sending.

## Explicit non-actions
- Do NOT modify `release.js` or any notification code yet.
- Do NOT send any test push notifications to the real testers.
- Do NOT modify the Supabase tester/token table.

## Report back
Structured findings for all four points above, including exact table/
column names, the actual current token values' status (masked if
sensitive) for each of the three testers, and a clear statement of
whether this looks like a "tokens were never registered" problem, a
"tokens went stale" problem, or a "code isn't handling the Expo API
response correctly" problem — so the fix can be scoped precisely.
