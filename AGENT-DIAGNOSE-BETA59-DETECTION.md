# DIAGNOSIS: Business Detection Regression Since BETA-59

## Commit Range

| Anchor | Commit | Date |
|--------|--------|------|
| Last known-good (inferred) | `e1b557be` (BETA-55) | 2026-07-08 |
| Detection code last modified | `e466fa63` (BETA-58) | 2026-07-14 |
| Current HEAD | `c71b5e26` (BETA-59) | 2026-07-16 |

**BETA-58→BETA-59 diff** (`dc16ce88..c71b5e26`): 10 files changed. **Zero files in the detection call path were touched.** The BETA-59 release commit modified only `DashboardScreen.js`, `LoginScreen.js`, `SettingsScreen.js`, `TerritoryMapScreen.js`, `storage.js`, `app.json`, `package.json`, and `release.js`.

**BETA-56→BETA-58 diff** (`e3e78892..dc16ce88`): This is where the detection-path changes live. Two files were modified:
- `src/screens/LeadLockCameraScreen.js` — 540+ lines changed (CameraView restructuring, pause/stop, ZIP overlay)
- `src/utils/multiBusinessDetection.js` — 17 lines changed (Claude prompt expansion)

---

## Ranked Suspects

### #1 (HIGH LIKELIHOOD): Claude Prompt Expansion in `multiBusinessDetection.js`

**File:** `src/utils/multiBusinessDetection.js:76-112`
**Commit:** `e466fa63` (BETA-58)

**What changed:**

The system prompt sent to Claude Vision was modified in three ways:

1. **Instruction broadened** (line 78): Added "and extract as much contact and location data as possible from signage, windows, doors, and surrounding context"

2. **JSON schema expanded** (lines 86-92): Seven new fields per business object:
   - `streetAddress` (replacing the old `address` field name)
   - `city`
   - `state`
   - `zip`
   - `phoneNumber`
   - `website`
   - `email`

3. **"CRITICAL RULES" block added** (lines 104-109): Five bullet points mandating strict extraction behavior:
   - Phone formatting rules
   - Website extraction rules
   - Address extraction from building numbers/plaques
   - "do NOT guess or fabricate data"
   - "Business names must come from ACTUAL signage visible in the photo, not inference"

**Why this breaks detection:**

The expanded prompt has two compounding effects:

**A. Token budget exhaustion.** The `max_tokens: 2000` limit (line 123) is unchanged. The expanded schema adds ~80-120 tokens per detected business (7 new fields × ~15 tokens each). For a typical strip-center photo with 3-5 businesses, the JSON response grows from ~400 tokens to ~800-1000 tokens. Combined with the now-longer system prompt (~400→~550 tokens), the response may be hitting the output ceiling. When `max_tokens` truncates JSON mid-object, the parse at line 160 (`JSON.parse(clean)`) throws `"Claude returned non-JSON response"`, which is caught at line 176 and returns `{ success: false, businesses: [] }`.

**B. Strictness creep.** The "CRITICAL RULES" block — particularly "do NOT guess or fabricate data" and "Business names must come from ACTUAL signage visible in the photo, not inference" — instructs Claude to be maximally conservative. Combined with the requirement to extract phone, website, email, and full address for each business (fields often not visible on storefront signage), Claude may be rejecting detections it would have previously returned. A business whose name is partially obscured by a tree or whose sign is at an angle may now be classified under the `{"businesses": [], ...}` fallback.

**C. Field name mismatch (secondary).** The prompt now returns `streetAddress` but the downstream enrichment code at `multiBusinessDetection.js:194` still reads `business.address`. This means `fullAddress` always falls through to `"${context.city || 'Houston'}, TX"` with no street component. Geocoding at line 201 receives a city-only address and likely fails silently (`.catch(() => null)`). This degrades enrichment quality but does **not** prevent detection results from being returned to the UI — it's a post-detection issue.

**Evidence the error is swallowed:**

In `LeadLockCameraScreen.js:608-611`:
```js
} else {
  console.warn('[LeadLockCamera] Detection failed:', result.error);
  showToast('No businesses detected. Try a clearer angle...', 'error');
  stopProcessing();
}
```

When `detectMultipleBusinessesInPhoto` returns `{ success: false }` — whether from a JSON parse error, API error, or empty array — the camera screen shows the generic "No businesses detected" message. The actual error message from Claude (e.g., "Claude returned non-JSON response" or "Claude API 400: ...") is logged via `console.warn` but **never surfaced to the user**. The user sees only the generic empty-state message.

---

### #2 (MEDIUM LIKELIHOOD): CameraView Restructuring — Overlay Rendered Into Capture Frame

**File:** `src/screens/LeadLockCameraScreen.js:804-923`
**Commit:** `e466fa63` (BETA-58)

**What changed:**

The CameraView was changed from containing children (header, footer) as React children to being self-closing (`<CameraView ... />`), with all UI overlays moved to absolute-positioned sibling `<View>` elements. The comment at line 809 explicitly states: "sibling overlay, not a CameraView child (Android camera views can misrender complex nested children)."

**Why this might affect detection:**

On Android, the `CameraView` native component may render React children inside the camera preview surface. In the old structure, the header `<View>` and capture button `<View>` were CameraView children, rendered inside the camera's view hierarchy. In the new structure, they're absolute-positioned siblings rendered by the React root view on top of the camera.

If the Android `CameraView` implementation captures the entire React root view (not just its own native surface), the new overlay siblings — particularly the ZIP acquisition overlay at lines 853-906 with its orbit animations, semi-transparent background (`rgba(17,19,24,0.92)`), and status text — would be captured as part of the image sent to Claude. This would:
- Obscure the storefronts behind the overlay
- Add text/graphics that confuse the detection model
- Potentially cause Claude to return fewer or zero businesses

However, this is **less likely** because:
- `takePictureAsync` in `expo-camera` v15 captures from the native camera hardware, not the React view hierarchy
- The overlay has `pointerEvents="box-none"` which doesn't affect rendering
- The ZIP overlay only shows when `!location?.zip` (before ZIP acquisition) or `zipJustAcquired` (1.4s after ZIP acquired) — by the time the user taps capture, the overlay should be gone

**Verdict:** Unlikely to be the root cause but should be verified by checking whether the captured image contains overlay artifacts. This can be confirmed by inspecting `photoData.uri` in the debug console or saving the captured image to the device gallery for visual inspection.

---

### #3 (LOW LIKELIHOOD): AbortController Race Condition Discarding Valid Results

**File:** `src/screens/LeadLockCameraScreen.js:547-632`

The BETA-58 changes added an `AbortController` to `handleDetectBusinesses`. If detection completes but `isStopped` becomes true during the async call, the result is silently discarded at line 557-559:
```js
if (isStopped || abortController.signal.aborted) {
  console.log('[LeadLockCamera] Detection result discarded — stopped/aborted during call');
  return;
}
```

This return skips both the success and failure paths — no toast, no detection result set, no `stopProcessing()` call. The user would see the detection spinner indefinitely (or until the 60s ProcessingContext auto-clear).

**However**, `isStopped` is only set by `handleStop` (line 440), which is triggered by the user pressing the ⏹ Stop button. It's not set during normal capture flow. This is a **latent bug** but not the cause of the current regression.

---

### #4 (INCONCLUSIVE): Claude API Key / Rate Limit / Model Deprecation

**File:** `src/utils/multiBusinessDetection.js:12-13`

The API key (`process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY`) is read from the `.env` file, which is gitignored. The `.env` file was not modified in any tracked commit. However:

- The model is hardcoded as `claude-opus-4-5` (line 122). This model was released Nov 2025 and was current through mid-2026. It is a valid model name per Anthropic's API.
- The API endpoint is `https://api.anthropic.com/v1/messages` (line 12), which is the standard endpoint.
- There are no rate limit headers being checked. If the API key hit a rate limit, the response would be HTTP 429, which would throw at line 149: `throw new Error('Claude API 429: ...')`. This error would be caught and returned as `{ success: false, error: 'Claude API 429: ...' }`, which the camera screen logs but doesn't surface.

**Cannot determine from diff alone.** Requires checking:
- The actual `.env` file for `EXPO_PUBLIC_ANTHROPIC_API_KEY` validity
- Whether `claude-opus-4-5` is still accessible (it should be, per Anthropic's model versioning)
- Whether there's an account-level rate limit or billing issue

---

## Root Cause Summary

**Most likely:** The BETA-58 prompt expansion in `src/utils/multiBusinessDetection.js:76-112` is causing Claude to either (a) return truncated JSON that fails to parse, or (b) return zero businesses due to the stricter extraction rules and "do NOT guess" instruction. The error is swallowed by the catch block at line 176 and the generic "No businesses detected" toast at `LeadLockCameraScreen.js:610`.

**Cannot be confirmed from diff alone.** Device-side logging is required to confirm. Specifically:

1. **`adb logcat | grep LeadLock`** — look for:
   - `[LeadLock] Claude raw response:` — shows the first 200 chars of Claude's response. If this is empty or contains `{"businesses": [],`, the API returned zero results.
   - `[LeadLock] JSON parse failed:` — confirms truncation/malformed JSON.
   - `[LeadLock] Vision detection error:` — confirms API-level failure.
   - `[LeadLock] Detected N businesses` — if N is always 0, the issue is at the API level.

2. **Save the captured image** — inspect whether the image sent to Claude actually contains visible businesses. If the CameraView restructuring caused overlay bleed, the image may be obscured.

3. **Temporarily revert the prompt** — change the system prompt back to the BETA-56 version (lines 76-112 of `multiBusinessDetection.js`) and test. If detection resumes, the prompt expansion is confirmed as the root cause.

---

## Files Touched (detection call path only)

| File | Lines Changed | Impact |
|------|--------------|--------|
| `src/utils/multiBusinessDetection.js` | Lines 76-112 (system prompt) | **PRIMARY SUSPECT** — expanded schema + strictness rules |
| `src/screens/LeadLockCameraScreen.js` | Lines 804-923 (CameraView restructuring) | **SECONDARY** — overlay moved to sibling; unlikely to affect capture |
| `src/screens/LeadLockCameraScreen.js` | Lines 539-632 (abort/pause/stop logic) | **UNRELATED** — added pause/stop; no change to core detection call |
| `src/utils/enrichmentNormalizer.js` | No changes | Not in scope |
| `src/services/leadLockSupabaseService.js` | No changes | Not in scope |
