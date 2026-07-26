# DIAGNOSIS: Address Autocomplete Not Showing Suggestions

## Files

| What | File | Lines |
|------|------|-------|
| Search input + suggestions JSX | `src/screens/TerritoryMapScreen.js` | 1538-1570 |
| `handleAddressChange` (debounce + API call) | `src/screens/TerritoryMapScreen.js` | 1275-1291 |
| `selectSuggestion` (geocode + map move) | `src/screens/TerritoryMapScreen.js` | 1293-1315 |
| `searchByAddress` (raw geocode on submit) | `src/screens/TerritoryMapScreen.js` | 1317-1340 |
| Suggestions dropdown styles | `src/screens/TerritoryMapScreen.js` | 1989-1994 |

---

## Autocomplete Flow (working as designed)

1. User types → `handleAddressChange` fires (line 1275)
2. Clears suggestions, starts 350ms debounce timer (lines 1277-1290)
3. After 350ms, calls Google Places Autocomplete API (line 1283):
   ```
   https://maps.googleapis.com/maps/api/place/autocomplete/json
     ?input=<text>&key=<GOOGLE_MAPS_API_KEY>&types=geocode|establishment&components=country:us
   ```
4. If results arrive, `setAutocompleteSuggestions(data.predictions.slice(0, 5))` (line 1287)
5. Suggestions render as a dropdown below the search bar (lines 1557-1569), each calling `selectSuggestion` on tap

The debounce, minimum character threshold (3), state management, and rendering logic are all correct.

---

## Root Cause: Silent API Failure

The autocomplete API call at line 1283 is failing silently. The evidence:

1. **The catch block is empty** (line 1289): `catch {}` — any network error, HTTP error, or JSON parse error is swallowed with no log, no toast, no user-visible feedback.

2. **The raw geocode on submit works** (line 1321): `searchByAddress` uses `maps.googleapis.com/maps/api/geocode/json` and successfully returns a result (the "01103" marker). This confirms the API key is valid for the Geocoding API.

3. **Places Autocomplete is a separate API** from Geocoding in Google Cloud Console. A key valid for Geocoding may not have Places Autocomplete enabled. Both must be individually enabled under "Enabled APIs" in the Google Cloud Console project.

4. **Most likely failure mode**: The `fetch()` call to `maps.googleapis.com/maps/api/place/autocomplete/json` returns an HTTP error (403/400) or a JSON response with `status: "REQUEST_DENIED"` / `status: "INVALID_REQUEST"`, and the empty catch block swallows it. `data.predictions` is never populated, so `autocompleteSuggestions` stays `[]`, and the dropdown never renders.

**Other possible (less likely) causes:**
- API key has HTTP referrer restrictions that block requests from the React Native app (would affect both autocomplete AND geocode, but geocode works, so this is less likely)
- API key has Android app restrictions that only allow specific package names (same reasoning — geocode works, so the key is reachable)
- Network/firewall blocking the specific autocomplete endpoint (unlikely since geocode endpoint works)

---

## Why the Raw Search Returns Wrong Location ("01103")

This is a **separate bug**, not related to the autocomplete failure. The raw search path (`searchByAddress`, line 1317) sends the user's typed text directly to the Geocoding API:
```
https://maps.googleapis.com/maps/api/geocode/json?address=<addressQuery>&key=<key>
```

When the user types "407 E Peach" and hits search without selecting a suggestion, the geocoder interprets this as a partial/ambiguous address and returns the best global match — which may be "Peach Street" in a completely different state. The autocomplete suggestions are precisely what would prevent this: they let the user pick the correct, fully-qualified address before submitting.

**Recommendation:** Fix the autocomplete (this diagnosis) and the wrong-location issue resolves as a side effect — users will select from suggestions instead of submitting raw partial text.

---

## Recommended Fix

1. **Replace the empty catch block** with logging to surface the actual error:
   ```js
   catch (err) {
     console.warn('[TerritoryMap] Autocomplete API error:', err?.message || err);
   }
   ```

2. **Check Google Cloud Console**: Verify that "Places API (New)" or "Places Autocomplete" is enabled for the project associated with `EXPO_PUBLIC_GOOGLE_PLACES_API_KEY`. This is under APIs & Services > Enabled APIs. If only "Geocodes API" is enabled, enable "Places API (New)" as well.

3. **If the API is enabled but still failing**: Check the response status in the catch block — if it's `REQUEST_DENIED`, check API key restrictions (HTTP referrers, Android app restrictions). If it's `ZERO_RESULTS`, the query format may need adjustment (e.g., adding `location` bias or `radius` parameter to bias toward Houston).

4. **After confirming the API works**: Remove the temporary logging from step 1.
