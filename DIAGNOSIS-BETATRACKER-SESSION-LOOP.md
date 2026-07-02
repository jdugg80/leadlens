# DIAGNOSIS: BetaTracker Session Loop

## Summary

`BetaTracker.init()` and `BetaTracker.endSession()` are called on every `AppState` transition (active/background). The `AppState.addEventListener('change')` callback in `App.js:312-333` fires `init()` on every `active` event and `endSession()` on every `background`/`inactive` event. There is **no debounce, no guard against rapid cycling, and no cooldown** between sessions. Each `init()` call unconditionally creates a new `session_id` and inserts a `session_start` row. Each `endSession()` call inserts a `session_end` row and clears state.

In dev-client/Metro live-reload mode, `AppState` can toggle rapidly between `active` and `background` (e.g., Fast Refresh causing brief background transitions, or Expo dev-client native shell behavior). This creates a tight loop: `active → init() → background → endSession() → active → init() → ...`

## Root Cause

### The trigger chain (App.js:312-333)

```javascript
const sub = AppState.addEventListener('change', async (nextState) => {
    const prev = appState.current;
    appState.current = nextState;

    if (nextState === 'active') {
        recordLastActiveAt();
        processQueue().catch(...);
        updateGlobalLocation().catch(...);
        await BetaTracker.init();           // ← writes session_start EVERY time
    }

    if (prev === 'active' && nextState.match(/inactive|background/)) {
        ...
        await BetaTracker.endSession();     // ← writes session_end EVERY time
    }
});
```

### Why it loops (utils/betaTracker.js:104-152)

- `init()` (line 104): Creates a **new `_sessionId`** on every call. No guard like `if (_ready) return`. Inserts `session_start` unconditionally.
- `endSession()` (line 129): Has a guard `if (!_ready || !_sessionId) return`, inserts `session_end`, then sets `_ready = false` and `_sessionId = null`.
- After `endSession()` clears state, the next `active` event calls `init()` again → new session → new `session_start`. The cycle repeats indefinitely.

### What causes rapid AppState cycling

In dev-client mode (`npx expo start --dev-client`), Expo's development shell can cause brief `background ↔ active` transitions during:
1. **Fast Refresh / Hot Module Replacement** — when a file is saved, the JS bundle is reloaded. On Android, this can briefly trigger a `background` event followed by `active`.
2. **Dev-client native shell behavior** — the Expo dev menu, debugger attachment, or bundler connection can cause transient AppState changes.
3. **React Native StrictMode (dev only)** — React 18 StrictMode double-invokes effects in development, which could cause extra mount/unmount cycles of the `App` component, re-registering the AppState listener.

The log pattern confirms this:
```
session_end ok → session_start ok → GPS → TaskQueue → session_start inserting → session_end inserting → session_end ok → session_start ok → ...
```
GPS and TaskQueue fire from the `active` handler (lines 319-320). Then `session_start` and `session_end` are inserted almost simultaneously, meaning both `active` and `background` events fired in rapid succession.

## Is this caused by today's App.js changes?

**No.** Today's App.js changes were:
1. `7ec99afc`: Replaced `Alert.alert()` with custom `<Modal>` for What's New popup. Added `useState`, `Modal`, `ScrollView` imports.
2. `8c4c6b13`: Added `BetaTracker.setEmail(user.email)` before `init()` on startup.
3. `f75c2b2b`: Added `if (!__DEV__)` guard around `checkForUpdate`.
4. `186b7109`: Added GPS timeout `Promise.race`.

None of these changed the `AppState.addEventListener` callback (lines 312-333) or the BetaTracker session logic. The `AppState` listener and the `init()`/`endSession()` calls have been unchanged since `6b5ba6af` (BETA-51 crash prevention feature).

**This is a pre-existing design issue** that was likely always present but only became visible now because this is the first live Metro/dev-client session run recently. OTA/production builds don't surface it because AppState transitions in production are driven by normal user interactions (opening/closing the app), which don't happen "multiple times per second."

## Is this dev-client-only or production-affecting?

**Primarily dev-client-only**, but the underlying code flaw could theoretically be triggered in production if something causes rapid foreground/background transitions (e.g., a push notification arriving while the app is being backgrounded, or a background fetch task completing rapidly).

In production, `AppState` changes are driven by:
- User opens the app → `active`
- User switches apps / locks phone → `background`
- User returns → `active`

These don't happen "multiple times per second" in normal use.

However, the **lack of debounce/guard** means that even a single rapid `active → background → active` cycle (which CAN happen in production — e.g., user accidentally taps home button and immediately returns) would create a duplicate `session_start`/`session_end` pair.

## Affected files

| File | Line(s) | Role |
|------|---------|------|
| `App.js` | 312-333 | `AppState.addEventListener('change')` — calls `init()` on active, `endSession()` on background |
| `App.js` | 268-271 | Startup `useEffect` — calls `init(user.email)` on mount |
| `utils/betaTracker.js` | 104-123 | `init()` — creates new session, inserts `session_start` (no guard) |
| `utils/betaTracker.js` | 129-152 | `endSession()` — inserts `session_end`, clears state |

## Blast radius — data impact

Each cycle writes **2 rows** to Scarlett's `beta_events` table (`session_start` + `session_end`). At "multiple times per second," a 30-second observation window could produce **60–180+ junk rows**. The affected email is `theokaymediafam@gmail.com`, target project is Scarlett (`dlntgyhfxxbcwwcxaarn`).

**Cleanup**: Rows can be identified by:
- `tester_email = 'theokaymediafam@gmail.com'`
- `event_name IN ('session_start', 'session_end')`
- `created_at` within today's date range
- `duration_seconds` near 0 (rapid sessions)

## What the fix should address (for follow-up)

1. **Debounce `init()`**: Skip if last `session_start` was inserted < N seconds ago (e.g., 5s cooldown).
2. **Guard `init()`**: If `_ready === true && _sessionId !== null`, skip (session already active).
3. **Debounce `endSession()`**: If `_ready === false`, skip (already ended).
4. **Optional: batch or throttle inserts**: Don't fire a Supabase insert on every single AppState change.
