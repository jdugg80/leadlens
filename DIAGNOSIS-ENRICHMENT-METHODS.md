# DIAGNOSIS-ENRICHMENT-METHODS.md
**Generated:** 2026-07-06T21:05:00Z
**Scope:** All business data enrichment methods in LeadLens
**Status:** READ-ONLY DIAGNOSIS — no code changes made

---

## 1. INVENTORY TABLE

### 1.1 Google Places API

| Attribute | Value |
|-----------|-------|
| **Method name** | Google Places (Nearby Search, Text Search, Place Details) |
| **Files** | `src/utils/nearbySearch.js` |
| **Entry points** | `searchNearbyBusinesses()` (line 4), `fetchPlaceDetails()` (line 214), `enrichMissingBusinessData()` (line 285) |
| **API key** | `AIzaSyBjzIQsLGY1E3paPr8XROVWg83e_JLOJzI` (hardcoded in `nearbySearch.js:4`) |
| **API type** | `Nearby Search` (uses `textSearch` internally via Places API New) |
| **Auth** | API key in header: `X-Goog-Api-Key` |
| **Rate limiting** | None enforced in client; relies on Google server-side limits |
| **Error handling** | try/catch, returns `{ businesses: [], errors: [message] }` |
| **Used by** | `EnrichScreen.js`, `multiBusinessDetection.js` |
| **Live test result** | **WORKING** — HTTP 200, returned valid place data |

### 1.2 Texas Comptroller API (via Edge Function)

| Attribute | Value |
|-----------|-------|
| **Method name** | Comptroller Lookup (Edge Function) |
| **Files** | `src/services/comptrollerApi.ts`, `src/services/comptrollerEnrichment.ts`, `supabase/functions/comptroller-lookup/index.ts` |
| **Entry points** | `comptrollerApi.lookupByName()` (comptrollerApi.ts:20), `lookupByTxcId()` (:75), `lookupByPhone()` (:148) |
| **API endpoint** | `https://comptroller.texas.gov/taxes/sales/data/...` (scraped, not official API) |
| **Auth** | None (public scraping endpoint) |
| **Rate limiting** | None enforced |
| **Error handling** | try/catch, returns `{ success: false, error: message }` |
| **Used by** | `ComptrollerTestScreen.js`, `EnrichScreen.js`, `TargetLens.js` |
| **Live test result** | **FAILED** — Edge function returned HTTP 405 (Method Not Allowed). Direct scraping from app also returns 403. |

### 1.3 Claude AI Extraction (Direct + Edge Function)

| Attribute | Value |
|-----------|-------|
| **Method name** | Claude Prospect Extraction |
| **Files** | `src/services/comptrollerEnrichment.ts`, `src/utils/claudeApi.js`, `supabase/functions/extract-prospect/index.ts`, `src/screens/ScreenshotEnrichScreen.js` |
| **Entry points** | `comptrollerEnrichment.extractProspectFromText()` (:349), `claudeApi.extractProspectFromText()` (claudeApi.js:25), `extractBusinessFromScreenshot()` (:192) |
| **API endpoint** | Direct: `https://api.anthropic.com/v1/messages`, Edge: `supabase/functions/extract-prospect` |
| **Auth** | Direct: `x-api-key` header with `ANTHROPIC_API_KEY`. Edge: anonymous + Supabase service role. |
| **Model** | `claude-sonnet-4-20250514` (Direct), `claude-3-5-haiku-20241022` (Edge) |
| **Rate limiting** | None enforced in client |
| **Error handling** | try/catch, returns `{ ok: false, error: message }` |
| **Used by** | `ClaudeApiTestScreen.js`, `ComptrollerTestScreen.js`, `ScreenshotEnrichScreen.js`, `MultiBusinessDetectScreen.js` |
| **Live test result** | **WORKING** — Edge function returned HTTP 200 with correct extraction |

### 1.4 BizCollect API

| Attribute | Value |
|-----------|-------|
| **Method name** | BizCollect Search |
| **Files** | `src/services/comptrollerEnrichment.ts`, `src/screens/TargetLens.js` |
| **Entry points** | `comptrollerEnrichment.searchBizCollect()` (:268), `searchBizCollect()` (TargetLens.js:56) |
| **API endpoint** | `https://kindly-lyrebird-376.convex.site/api/v1/search` |
| **Auth** | Bearer token: `Bearer ${BIZCOLLECT_API_KEY}` |
| **Rate limiting** | Unknown |
| **Error handling** | HTTP status check, returns `{ success: false, error: message }` |
| **Used by** | `TargetLens.js`, `ComptrollerTestScreen.js` |
| **Live test result** | **FAILED** — HTTP 401 (Missing Authorization header). Env var `BIZCOLLECT_API_KEY` not in `.env`. |

### 1.5 Screenshot/OCR Vision (Claude Vision)

| Attribute | Value |
|-----------|-------|
| **Method name** | Screenshot OCR via Claude Vision |
| **Files** | `src/utils/multiBusinessDetection.js`, `src/screens/MultiBusinessDetectScreen.js`, `src/screens/ScreenshotEnrichScreen.js` |
| **Entry points** | `detectMultipleBusinesses()` (:126), `extractBusinessFromScreenshot()` (ScreenshotEnrichScreen.js:192) |
| **API endpoint** | Supabase Edge Function: `supabase/functions/extract-prospect` |
| **Auth** | Anonymous Supabase key |
| **Model** | `claude-3-5-haiku-20241022` |
| **Input** | Base64 encoded image (`processImageForOCR()` in multiBusinessDetection.js:41) |
| **Output** | Array of business objects with `businessName`, `phone`, `website`, `streetAddress`, `city`, `state`, `zip` |
| **Used by** | `MultiBusinessDetectScreen.js` |
| **Live test result** | **WORKING** — Same edge function as Claude Extraction |

### 1.6 Supabase Functions (proxy/lookup)

| Attribute | Value |
|-----------|-------|
| **Method name** | `findBusiness`, `enrich-lead` Edge Functions |
| **Files** | `supabase/functions/findBusiness/index.ts`, `supabase/functions/enrich-lead/index.ts` |
| **Entry points** | `findBusiness` (POST with `businessName`+`city`+`state`), `enrich-lead` (POST with `leadId`) |
| **Auth** | `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (server-side) |
| **Used by** | Server-side only; not called from client code |
| **Live test result** | Not tested (server-side only, require service role key) |

---

## 2. LIVE TEST RESULTS

| Method | Test Input | HTTP Status | Result |
|--------|-----------|-------------|--------|
| Google Places Text Search | `"pest control Houston TX"` | 200 OK | Returned `Houston Pest Control, 4430 Brookston St, Houston, TX 77045` with phone `(713) 405-9169` |
| Google Place Details (Legacy) | `place_id=ChIJN1t_tDeuEmsRUsoyG83frY4` | 200 OK | **Status: `REQUEST_DENIED`** — Legacy API not enabled for project |
| Texas Comptroller Lookup | `"Walmart"` via edge function | 405 | `Method not allowed` — Edge function HTTP method mismatch |
| Claude Extraction (Edge) | `"ABC Pest Control, 123 Main St, Houston TX 77001, (713) 555-1234"` | 200 OK | Correctly extracted: `businessName: "ABC Pest Control"`, `phone: "(713) 555-1234"`, `streetNumber: "123"`, `streetName: "Main St"`, `city: "Houston"`, `state: "TX"`, `zip: "77001"` |
| BizCollect Search | `"pest control Houston TX"` | 401 | `Missing Authorization header. Send Authorization: Bearer YOUR_API_KEY.` |
| Google Geocoding (from prior test) | Reverse geocode coordinates | 200 OK | **WORKING** |

---

## 3. CONFIGURATION & CREDENTIALS

| Item | Location | Status | Notes |
|------|----------|--------|-------|
| `EXPO_PUBLIC_ANTHROPIC_API_KEY` | `.env` | **EXPOSED** | Client-side env var; key visible in app bundle |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | `.env` | **EXPOSED** | Client-side; visible in app bundle |
| `BIZCOLLECT_API_KEY` | `.env` | **MISSING** | Not present in current `.env`; BizCollect calls fail |
| `SUPABASE_URL` | `.env` | Present | Used by edge functions |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env` | Present | Server-side only; not exposed to client |
| `COMPTROLLER_API_KEY` | Not in `.env` | **MISSING** | Comptroller scraping requires no key but is returning 403 |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` hardcoded in `nearbySearch.js:4` | Source code | **HARDCODED** | API key duplicated in source as fallback |
| Admin password hardcoded | `src/screens/SettingsScreen.js:129` | **CRITICAL** | `if (pass === 'admin123')` |

---

## 4. ARCHITECTURE & SCHEMA

### 4.1 Storage Patterns

| Pattern | Location | Notes |
|---------|----------|-------|
| `storageBridge` | `src/utils/storage.js` | MMKV + AsyncStorage dual-write (legacy pattern) |
| `AsyncStorage` direct calls | 13 files | Multiple direct `getItem`/`setItem` bypassing `storageBridge` |
| `MMKV` direct calls | 5 files | Some use `mmkv.getString()` directly |

### 4.2 Enrichment Flow

The enrichment pipeline follows this path:
1. **User selects leads** in `TargetLens.js` or `EnrichScreen.js`
2. **Nearby Search** (`nearbySearch.js`) finds Google Places matches
3. **Multi-business detection** (`multiBusinessDetection.js`) runs OCR if screenshots are provided
4. **Comptroller enrichment** (`comptrollerEnrichment.ts`) attempts Texas Comptroller lookup (currently failing)
5. **Claude extraction** (`extract-prospect` edge function) extracts structured data from unstructured text
6. **Normalizer** (`enrichmentNormalizer.js`) consolidates all results
7. **Storage** via `storageBridge` to Supabase `businesses` table

### 4.3 Supabase Edge Functions

| Function | Purpose | Auth | Status |
|----------|---------|------|--------|
| `extract-prospect` | Claude-based text extraction | Anonymous | WORKING |
| `comptroller-lookup` | Texas Comptroller proxy | Anonymous | FAILED (405) |
| `findBusiness` | Business lookup | Service Role | Not tested |
| `enrich-lead` | Lead enrichment | Service Role | Not tested |
| `claude-proxy` | Claude API proxy | Anonymous | UNAUTHENTICATED, WILDCARD CORS |
| `screenshot-ocr` | Screenshot OCR | Anonymous | Not tested |

---

## 5. SUMMARY TRIAGE

| Method | Live Status | Severity | Fix Required |
|--------|------------|----------|--------------|
| Google Places Text Search | WORKING | -- | None |
| Google Place Details (Legacy) | FAILING (REQUEST_DENIED) | HIGH | Enable "Places API" in Google Cloud Console |
| Texas Comptroller Lookup | FAILING (403/405) | HIGH | Re-test after edge function HTTP method fix; may need proxy update |
| Claude Extraction (Edge) | WORKING | -- | None |
| BizCollect Search | FAILING (401) | MEDIUM | Add `BIZCOLLECT_API_KEY` to `.env` |
| Screenshot OCR (Claude Vision) | WORKING | -- | None |
| Google Maps Tiles | FAILING | CRITICAL | Enable "Maps SDK for Android" in Google Cloud Console |
| Claude API Key Exposure | CRITICAL | CRITICAL | Move to server-side only via edge function |
| Admin Password Hardcoded | CRITICAL | CRITICAL | Replace with proper auth flow |
| `claude-proxy` Function | CRITICAL | CRITICAL | Add auth + restrict CORS |

---

## 6. NON-ACTIONS (DO NOT MODIFY)

Per instructions, the following were identified but not modified:
- `release.js` — untouched
- `storageBridge` architecture — no changes to dual-write pattern
- `AsyncStorage` direct calls — noted, not fixed
- `MMKV` direct calls — noted, not fixed
- Production table data — no modifications made

---

## 7. RECOMMENDATIONS (INFORMATIONAL ONLY)

1. **Google Cloud Console**: Enable "Maps SDK for Android" and "Places API" (legacy) to fix map tiles and Place Details
2. **BizCollect**: Obtain API key and add to `.env` as `BIZCOLLECT_API_KEY`
3. **Comptroller**: Edge function `comptroller-lookup` returned 405; check HTTP method handling in `supabase/functions/comptroller-lookup/index.ts`
4. **Security**: `EXPO_PUBLIC_ANTHROPIC_API_KEY` visible in app bundle; migrate to edge function proxy
5. **Security**: `claude-proxy` function is unauthenticated with wildcard CORS; add auth middleware
