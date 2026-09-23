# DIAGNOSIS — Support Screen Still Broken
## August 7, 2026

---

## VERDICT

**The fix did not address the real cause.** The Bug Report / Feature Request buttons are missing because `SupportScreen.js` was completely overwritten by a different component. The previous OTA (credential removal + crash guard fix) was delivered successfully, but it fixed the wrong file — `BetaFeedbackScreen.js` — not `SupportScreen.js`.

---

## STEP 1: DID THE OTA DELIVER?

**Yes.** The OTA was delivered successfully.

| Check | Result |
|---|---|
| Commit `7831dcd2` exists | ✅ Confirmed — `git log` shows it at HEAD |
| Diff matches expected fix | ✅ `git diff` confirms: hardcoded credentials removed from `BetaFeedbackScreen.js`, debug logs removed from `territoryZipLoader.js` |
| EAS published to correct branch | ✅ Update group `640f57fc` published to `production` branch, runtime `2.0.62` |
| Channel match | ✅ Both `preview` and `production` profiles use `channel: "production"` in `eas.json` |
| Delivery chain intact | ✅ No native-file guard violations, no branch mismatch |

**Conclusion:** The OTA delivery chain is not the problem. The code was pushed to the correct branch. The fix simply didn't address the actual cause of the missing buttons.

---

## STEP 2: ROOT CAUSE

### What happened

Commit `ac74b68a` (July 26, 2026) — message: *"Pop-up notification uses native style instead of themed design"* — **completely replaced `SupportScreen.js`** with an entirely different component.

| Before (`ac74b68a`^) | After (`ac74b68a`) |
|---|---|
| Hub screen with **2 nav buttons** → `BugReportScreen` + `FeatureRequestScreen` | Simple contact form with topic chips |
| Back button, header, App Info card | "Contact Support" heading, name/email/topic/message fields |
| Supabase client initialized, device info gathered | Simulated API call (`setTimeout`), no real backend |
| `navigation.navigate('BugReportScreen', {...})` | No navigation calls to either screen |
| `navigation.navigate('FeatureRequestScreen', {...})` | No navigation calls to either screen |

### Evidence

**Git blame on `SupportScreen.js`:**
- `36ef4c2c` (Jul 29) — Fixed unescaped apostrophe in the **new** contact-form version
- `ac74b68a` (Jul 26) — **Complete replacement** of the file (472 lines changed, 15 files in commit)
- Before that: `2063eb75` → `b6f623bb` → `338334d4` → `30a246b4` → `fd50a1e8` — all preserved the nav-button design

**Navigation grep:**
- `grep` for `navigate.*BugReport` / `navigate.*FeatureRequest` across entire `src/` returns **zero matches**
- The nav calls existed in the BETA-51 version but were removed with the overwrite

**Commit `ac74b68a` was a 15-file, 1,397-line commit** that appears to be an accidental bulk overwrite. The commit message ("Pop-up notification uses native style") does not describe replacing the SupportScreen — suggesting this was an unintended side effect of a larger change.

### What the previous fix actually did

The previous OTA (`7831dcd2`) fixed two issues in `BetaFeedbackScreen.js`:
1. Removed hardcoded Scarlett credentials → replaced with env vars
2. Rescoped module-scope throw → moved to submission-time guard

`BetaFeedbackScreen.js` is a **separate screen** accessible only via `BetaFeedbackFAB` (the floating feedback button). It is NOT the SupportScreen and does NOT contain the Bug Report / Feature Request navigation buttons. The fix was correct for what it addressed, but it addressed the wrong component.

---

## STEP 3: CACHING

**Not a factor.** Since the root cause is a code-level issue (wrong file overwritten), no amount of cache clearing, re-installation, or repeated OTA application will restore the buttons. The code simply doesn't contain them anymore.

---

## NEXT STEP

**Restore the navigation buttons to `SupportScreen.js`.**

Two options:

### Option A: Restore the BETA-51 version (full revert)
- `git show fd50a1e8:src/screens/SupportScreen.js` → restore the hub-screen design with 2 nav buttons
- Requires: re-apply env-var credentials (done in `338334d4`), re-apply version label fix (`b6f623bb`), re-apply iOS header fix (`30a246b4`)
- Risk: may lose any improvements made after BETA-51

### Option B: Merge nav buttons into current design (targeted fix)
- Add the two `TouchableOpacity` nav buttons (from BETA-51) into the current contact-form `SupportScreen.js`
- Add `navigation` prop support (currently `SupportScreen()` takes no props)
- Keep the contact form as a third option (or replace it entirely)
- Lower risk, preserves current form design

**Recommended: Option B** — restore just the nav buttons while keeping the current design intact. This is a minimal, targeted fix.

---

## FILES INVOLVED

| File | Status | Role |
|---|---|---|
| `src/screens/SupportScreen.js` | **BROKEN** — overwritten at `ac74b68a` | Parent screen — missing nav buttons to BugReport/FeatureRequest |
| `src/screens/BugReportScreen.js` | Intact — registered in App.js:466 | Target of nav button (exists, no code issues) |
| `src/screens/FeatureRequestScreen.js` | Intact — registered in App.js:467 | Target of nav button (exists, no code issues) |
| `App.js` | Intact — both screens registered at lines 466-467 | Navigation stack has both screens |
| `src/screens/BetaFeedbackScreen.js` | Fixed by previous OTA | Separate screen — NOT the SupportScreen |
| `src/utils/territoryZipLoader.js` | Fixed by previous OTA | Debug logs removed — unrelated to this issue |
