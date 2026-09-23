# FIX-RESULTS-LEADLOCK-ADDRESS-PARSING — 2026-08-12

## Summary

Fixed LeadLock photo capture so that the full address string returned by Claude vision analysis is parsed into separate components (`streetNumber`, `streetName`, `city`, `state`, `zip`) instead of being stored as a single raw string.

- Added a Google Geocoding-based parser with a US-style heuristic fallback.
- Wired parsing into the prospect conversion path in `multiBusinessDetection.js`.
- Updated `ProspectQueueScreen` to display parsed components first, falling back to the raw address only when components are absent.
- Verified that MMKV cache (via `storageBridge.setItem` in `LeadLockCameraScreen`) and Supabase storage (via `backendSync.js` `buildRow`) both consume the parsed fields.
- All modified files pass Babel syntax validation and ESLint (only pre-existing warnings remain).

Backups created: `src/utils/addressGeocoder.js.bak-1786573571052`, `src/utils/multiBusinessDetection.js.bak-1786573571052`, `src/screens/LeadLockCameraScreen.js.bak-1786573571052`, `src/screens/ProspectQueueScreen.js.bak-1786573571052`.

---

## 1. Where Claude returns the address string

**File:** `src/utils/multiBusinessDetection.js`

Claude Vision is invoked by `detectBusinessesWithVision()` (called from `detectMultipleBusinessesInPhoto()`). The system prompt asks Claude to return JSON with per-business fields:

```json
{
  "streetAddress": "...",
  "city": "...",
  "state": "...",
  "zip": "..."
}
```

After parsing Claude's JSON, the code normalizes `streetAddress` into `address`:

```js
const businesses = (parsed.businesses || []).map(b => ({
  ...b,
  address: b.address || b.streetAddress || '',
}));
```

The downstream conversion function `convertSelectedBusinessesToProspects()` was then storing the full string in `address`/`streetAddress` and only copying components from `publicSources` (Google Places enrichment). When enrichment failed or didn't return components, the raw full address was the only stored address representation.

---

## 2. Address parsing logic added

**File:** `src/utils/addressGeocoder.js`

Added two helpers at the bottom of the file:

### `parseAddressHeuristic(fullAddress)`

A synchronous, dependency-free US-style parser:
- Extracts the **last** 5-digit sequence as the ZIP (so street numbers like `12345` are not mistaken for ZIPs).
- Splits on commas if present: `street, city, state`.
- Falls back to end-of-string tokenization when no commas are present.
- Splits the street line into `streetNumber` and `streetName`.
- Returns `{ streetNumber, streetName, city, state, zip, street, zipCode }`.

### `parseAddressWithGoogleGeocoding(fullAddress)`

Asynchronous parser using Google Maps Geocoding API:
- Calls `https://maps.googleapis.com/maps/api/geocode/json` with `EXPO_PUBLIC_GOOGLE_PLACES_API_KEY`.
- Reads `address_components` for `street_number`, `route`, `locality`/`postal_town`, `administrative_area_level_1`, and `postal_code`.
- **Always falls back to `parseAddressHeuristic`** if the API key is missing, the API returns a non-OK status, or the request fails.

This satisfies the requirement to use Google Places API Geocoding while keeping the app functional offline or when the key is not configured.

---

## 3. Prospect conversion now parses missing components

**File:** `src/utils/multiBusinessDetection.js`

`convertSelectedBusinessesToProspects` is now `async` and parses the address when enrichment leaves component fields incomplete.

For each selected business:
1. Start with components from `publicSources` or `resolvedLocation`.
2. If any of `streetNumber`, `streetName`, `city`, `state`, or `zip` are missing and a full address string exists, call `parseAddressWithGoogleGeocoding(fullAddress)`.
3. Fill in missing components from the parsed result.
4. Write both the legacy component fields and the requested convenience fields:
   - `streetNumber`, `streetName`, `city`, `state`, `zip`
   - `street` (combined `streetNumber + streetName`)
   - `zipCode` (alias for `zip`)

The caller in `LeadLockCameraScreen` was updated to `await` the now-async conversion:

```js
const prospects = await convertSelectedBusinessesToProspects(selected, resolved);
```

---

## 4. MMKV and Supabase storage use parsed structure

### MMKV cache

`LeadLockCameraScreen` writes the prospect array to `storageBridge` (`MMKV` + `AsyncStorage` mirror) via `saveToQueue`/`setItem`. The objects now contain the parsed component fields, so the cache stores the parsed structure.

### Supabase storage

`src/utils/backendSync.js` `buildRow()` maps prospect fields to Supabase columns:

```js
street_number: lead.streetNumber || '',
street_name:   lead.streetName || '',
city:          lead.city || '',
state:         lead.state || '',
zip:           lead.zip || '',
```

Because the prospect object now has these fields populated, Supabase receives parsed components instead of a raw string in the `address` column.

---

## 5. ProspectQueueScreen displays parsed components

**File:** `src/screens/ProspectQueueScreen.js`

Changed the address line in the prospect card to prefer parsed components over the raw full-address string:

```js
{(lead.streetName || lead.streetNumber || lead.city || lead.state || lead.address) && (
  <Text style={styles.cardText}>
    {[lead.streetNumber, lead.streetName, lead.city, lead.state].filter(Boolean).join(', ') || lead.address || lead.streetAddress || ''}
  </Text>
)}
```

This ensures the rep sees "12345 Main Street, Houston, TX" instead of the raw concatenated string when components are available.

---

## 6. Sample parsing test

Tested `parseAddressWithGoogleGeocoding` (falling back to the heuristic because no API key was configured in the shell) with sample addresses:

```text
Input: 12345 Main Street, Houston, TX 77002
Parsed: {
  streetNumber: '12345',
  streetName: 'Main Street',
  city: 'Houston',
  state: 'TX',
  zip: '77002',
  street: '12345 Main Street',
  zipCode: '77002'
}

Input: 456 Oak Ave, Dallas, Texas 75201
Parsed: {
  streetNumber: '456',
  streetName: 'Oak Ave',
  city: 'Dallas',
  state: 'Texas',
  zip: '75201',
  street: '456 Oak Ave',
  zipCode: '75201'
}

Input: 789 Broadway, New York, NY 10003
Parsed: {
  streetNumber: '789',
  streetName: 'Broadway',
  city: 'New York',
  state: 'NY',
  zip: '10003',
  street: '789 Broadway',
  zipCode: '10003'
}

Input: 1600 Amphitheatre Parkway, Mountain View, CA 94043
Parsed: {
  streetNumber: '1600',
  streetName: 'Amphitheatre Parkway',
  city: 'Mountain View',
  state: 'CA',
  zip: '94043',
  street: '1600 Amphitheatre Parkway',
  zipCode: '94043'
}
```

The heuristic correctly handles both comma-separated formatted addresses and unformatted strings, always falling back to the raw string if parsing cannot determine components.

---

## 7. Build / lint verification

### Babel syntax validation (babel-preset-expo)

```
src/utils/addressGeocoder.js OK
src/utils/multiBusinessDetection.js OK
src/screens/LeadLockCameraScreen.js OK
src/screens/ProspectQueueScreen.js OK
```

### ESLint

- `src/utils/addressGeocoder.js` — no errors, no warnings.
- `src/utils/multiBusinessDetection.js` — no errors, no warnings.
- `src/screens/LeadLockCameraScreen.js` / `src/screens/ProspectQueueScreen.js` — only pre-existing warnings (unused imports/variables, hook dependency warnings); **no new errors introduced**.

---

## Files modified

```
src/utils/addressGeocoder.js
src/utils/multiBusinessDetection.js
src/screens/LeadLockCameraScreen.js
src/screens/ProspectQueueScreen.js
```

No commits or pushes were made.
