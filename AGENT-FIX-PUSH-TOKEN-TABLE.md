# AGENT BRIEFING: Fix Push Notification Token Table Mismatch + Response Parsing

## Context
Diagnosis confirmed two issues in `release.js`'s push notification block
(lines ~672-729):

1. **Critical — wrong table/column.** It queries `push_tokens` /
   `token` / `is_active=eq.true`, but the client
   (`pushNotifications.js:48-63`) actually writes to `user_push_tokens` /
   `push_token`, keyed by `user_id`, with an `enabled` column (not
   `is_active`). This is why every push has been failing — it's reading
   from the wrong place, not a token-validity problem.

2. **Medium — no per-token response parsing.** The code only checks
   `pushRes.ok` (HTTP 200) and reports "sent to N/N device(s)" without
   parsing Expo's actual per-ticket response body, which can report
   `status: "error"` (e.g. `DeviceNotRegistered`) for individual tokens
   even on a 200 response. This means a "success" log could be
   misleading even after the table fix.

There is a reference implementation with the correct table/column names
at `scripts/release.js:260` (an older script) — use it as a reference for
the correct query shape, but verify independently rather than copying
blindly, since the two scripts may have diverged in other ways since.

## Step 1 — Fix the table/column mismatch

In `release.js` around line 682, change the query to read from
`user_push_tokens`, selecting the `push_token` column, filtered on
`enabled=eq.true` (confirm this is the exact column name/value by
checking `pushNotifications.js`'s upsert shape again before assuming).

Update line 697's `rows.map(r => r.token)` to
`rows.map(r => r.push_token)` (or whatever the confirmed column name is)
to match.

## Step 2 — Add Expo response parsing

After the `fetch('https://exp.host/--/api/v2/push/send', ...)` call,
parse the JSON response body's `data` array. For each ticket:
- `status: "ok"` → count as a real success
- `status: "error"` → count as a failure, log the `message` (e.g.
  `DeviceNotRegistered`) and which token it corresponds to (masked/
  truncated is fine, don't log full tokens in plaintext logs)

Update the final log line to report the real per-ticket success count,
not just "HTTP request succeeded." If any ticket comes back
`DeviceNotRegistered`, note in the log that the corresponding tester's
token is stale and may need re-registration (they'd need to log out and
back in per the current registration flow, since there's no automatic
refresh).

## Step 3 — Verify without spamming real testers

Do not fire a real push to the three testers as part of this fix. Instead:
1. After the table/column fix, do a read-only query against
   `user_push_tokens` to confirm real token values now come back
   (mask/truncate them in your report — don't paste full tokens).
2. Confirm the code change bundles/runs without syntax errors (this is a
   plain Node script, not part of the Expo bundle — run it with
   whatever syntax-check method is appropriate, e.g. `node --check
   release.js`).
3. Leave the actual live-fire test to Joe's next real release run, where
   he can watch the real output and confirm which testers received it.

## Explicit non-actions
- Do NOT send a real push notification during this fix.
- Do NOT modify `pushNotifications.js`, `registerLensSignalPushToken.ts`,
  or any client-side registration code — the registration flow itself
  is correct, only `release.js`'s read side is wrong.
- Do NOT modify `scripts/release.js` (the older script) — reference only.
- Do NOT add automatic token-refresh/re-registration logic — that's a
  separate, lower-priority item flagged in the diagnosis, not in scope
  here.

## Report back
- Step 1: exact before/after of the table/column/filter change
- Step 2: exact before/after of the response-parsing addition
- Step 3: confirm real (masked) token values now come back from
  `user_push_tokens`, and confirm `node --check release.js` (or
  equivalent) passes clean
