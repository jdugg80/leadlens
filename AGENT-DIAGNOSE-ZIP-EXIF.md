# DIAGNOSIS: ZIP Resolution EXIF Contradiction

## Verdict: VESTIGIAL — not a live blocker, safe to leave as-is or flag for cleanup

The ZipResolver call in the detection path is **redundant**. The app already has the ZIP code from an earlier, independent resolution path. The resolver failure is real but harmless.

---

## Flow Trace (3 independent ZIP resolution paths)

### Path A — Primary (load-bearing, works correctly)
**File:** `src/screens/LeadLockCameraScreen.js:182-229` (useEffect) + `:257-283` (initLocation)

On mount and whenever `leadLockGps` updates from the `useLeadLockLocationSnapshot` hook, a `useEffect` resolves the ZIP via `reverseGeocodeCoords()` and stores it in:
- `location` state (for UI display)
- `resolvedZipRef.current` (for caching)
- `storageBridge` `currentLocation` (for persistence)

This is the "shutter-gated ZIP acquisition" mentioned in the briefing. It runs **before** any photo is taken. By the time the user taps Capture, `resolvedZipRef.current` is already populated with the correct ZIP (e.g., `77515`).

### Path B — Detection path (vestigial, the failing call)
**File:** `src/screens/LeadLockCameraScreen.js:564-577`

Called inside `handleDetectBusinesses`, after Claude detection completes. The guard at line 564 checks `if (!resolvedZipRef.current)` — if Path A already populated the cache, this block is **skipped entirely**. The resolver is only called when the cache is empty.

When it IS called, it passes:
- `liveGps: leadLockGps` — from the hook (may be null if GPS hasn't resolved yet)
- `photoExif: exifData` — this is `rawExif` passed directly from `handleTakePhoto`

The log sequence shows this path failing, which means `resolvedZipRef.current` was null at that moment (Path A hadn't completed yet or was cleared by a territory change).

### Path C — Add-to-Queue path (vestigial, also fails silently)
**File:** `src/screens/LeadLockCameraScreen.js:684-698`

Called inside `handleAddToQueue`. Checks `resolvedZipRef.current` first (line 684) — if Path A populated it, uses the cache. Otherwise calls the resolver. The result feeds into `convertSelectedBusinessesToProspects` as a **fallback** for `latitude`, `longitude`, `city`, and `zip` — but these fields are already populated from Claude detection enrichment (lines 508-526 of `multiBusinessDetection.js`), so the fallback is never reached in practice.

---

## Why "Photo EXIF captured: yes" but "no EXIF coords present"

**The two checks are testing different things.**

| Log line | What it checks | Result |
|----------|---------------|--------|
| `Photo EXIF captured: yes` (LeadLockCameraScreen.js:515) | `rawExif ? 'yes' : 'no'` — is the EXIF **object** truthy? | `photo?.exif` returns an object containing camera settings (ISO, exposure, white balance, etc.) — always truthy when `exif: true` is passed to `takePictureAsync` |
| `no EXIF coords present` (resolveZipFromLeadLockPhoto.ts:145) | `extractExifCoords(photoExif)` — does the EXIF object contain **GPS coordinates** in a recognized shape? | Returns `null` because the EXIF object structure doesn't match any of the three patterns the function checks |

**Root cause of the contradiction:** `expo-camera` v15's `takePictureAsync({ exif: true })` returns an EXIF object containing camera metadata (ISO, focal length, exposure time, etc.) but the GPS coordinates are either:
- Not embedded in the EXIF block at all on Android (GPS requires separate location services + explicit configuration)
- Or embedded in a DMS (degrees/minutes/seconds) array format that `extractExifCoords` can't parse — it calls `Number()` on values like `[29, 45, 30.12]`, which returns `NaN`, failing the `!Number.isNaN()` guard

The `extractExifCoords` function at `resolveZipFromLeadLockPhoto.ts:17-37` checks three patterns:
1. `exif.GPSLatitude` / `exif.GPSLongitude` (line 20)
2. `exif.gps.latitude` / `exif.gps.longitude` (line 25)
3. `exif.latitude` / `exif.longitude` (line 31)

None of these match the actual shape of the EXIF object returned by `expo-camera` on Android.

---

## Is the resolver load-bearing?

**No.** Here's the evidence:

1. The log shows the resolver returning all-null (`zip: null, source: "unknown"`), and the app **proceeds successfully** — businesses are detected, enrichment runs, prospects are added with the correct ZIP (`photoZip: 77515`).

2. The correct ZIP comes from Path A (`useEffect` + `leadLockGps`), not from the resolver. Path A runs independently on mount/GPS update and stores the result in `resolvedZipRef.current`.

3. `convertSelectedBusinessesToProspects` (line 484 of `multiBusinessDetection.js`) uses `resolvedLocation` only as a **fallback** — the primary values come from `business.fullData.location` (latitude/longitude from enrichment) and `publicSources` (city/zip from Google Places). The fallback is never reached because enrichment already populates these fields.

4. The `resolvedLocation` state is consumed **only** for UI display (lines 963-973) — showing "Zip: 77515 | Source: leadLockGps" in the status bar. When the resolver fails, the UI shows the previously resolved value from Path A, not the all-null resolver result.

---

## Recommendation

**No fix pass warranted.** The ZipResolver call in the detection/add-to-queue path is dead code that runs harmlessly and fails silently. The app's ZIP resolution is load-bearing only in Path A (the `useEffect` + `initLocation` path), which works correctly.

**Optional cleanup (future pass, not urgent):**
- Remove the `resolveZipFromLeadLockPhoto` calls from `handleDetectBusinesses` (line 569) and `handleAddToQueue` (line 692) since they're redundant with Path A and the enrichment fallback
- Or fix `extractExifCoords` to handle the actual `expo-camera` EXIF shape (DMS arrays) if EXIF-based resolution is desired as a future fallback
- Either way, this is a cleanup task, not a bug fix
