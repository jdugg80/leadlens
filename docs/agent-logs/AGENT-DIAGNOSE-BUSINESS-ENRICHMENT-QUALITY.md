# Business Enrichment Quality Diagnostic

**Date:** 2026-08-19
**Repo:** C:\Projects\03-BusinessApps\leadlens
**Scope:** End-to-end business enrichment pipeline — LeadLock photo capture through scored, enriched business record

---

## Section 1: End-to-End Flow Trace

### The Flow

The business enrichment pipeline has two entry points, both converging on the same core enrichment:

**Entry Point A — LeadLock Camera (Multi-Business):**
```
LeadLockCameraScreen.js:524 → detectMultipleBusinessesInPhoto()
  → multiBusinessDetection.js:29 — Claude Opus vision (model: claude-opus-4-5)
    → detectBusinessesWithVision() — parses JSON response at line 160
    → enrichBusinessDetection() per business (line 196):
      1. extractLocationFromBusinessCard() — geocode
      2. enrichBusinessWithPublicSources() — THE PRIMARY ENRICHMENT (enrichmentNormalizer.js:458)
      3. enrichProspectProfile() — health/permits/property (dataEnrichmentOrchestrator.js:20)
    → formatMultiBusinessesForDisplay() — UI formatting
    → convertSelectedBusinessesToProspects() — queue objects
```

**Entry Point B — Review Screen / Manual Entry:**
```
ReviewScreen.js:182 → enrichBusinessWithPublicSources(lead)
  OR
ReviewScreen.js:535 → enrichBusinessWithPublicSources(enrichmentLead) [fire-and-forget]
```

### `enrichBusinessWithPublicSources()` Call Order (enrichmentNormalizer.js:458-859)

This is the single most important function in the pipeline. Every business enrichment flows through it. The call order is:

1. **Google Places text search** (lines 490-577) — 7 fallback strategies: name+zip → name+city+state → name+nearby → name+phone → name+state → name-only → OCR+zip
2. **Google Place Details** (lines 580-637) — `fetchPlaceDetails()` via legacy REST API. Fire-and-forget Supabase upsert to `business_data` (line 611)
3. **Texas Comptroller** (lines 640-653) — `enrichProspectWithComptroller()`
4. **Contact Enrichment Provider** (lines 655-682) — BizCollect (if POC missing)
5. **LensSignal / Website POC** (lines 684-706) — `enrichMissingPOC()`
6. **Health violations** (lines 708-718) — `searchHealthViolations()`
7. **Property records** (lines 720-732) — `getPropertyRecord()`

### Partial Failure Handling

**The pipeline is resilient to partial failure.** Each step is wrapped in try/catch (lines 460, 575, 634, 650, 679, 704, 717, 730). If any source fails:
- The error is caught and logged with `console.warn`
- The pipeline continues to the next source
- Missing sources are noted in `enrichment_notes` (line 760-764)
- The enrichment still completes and returns a result

**However:** A partially-enriched record looks structurally identical to a fully-enriched one. The only signal is the `enrichment_confidence` score and `enrichment_notes` string. There is no explicit `enrichment_status: 'partial'` flag — it's either `'complete'` (score > 0) or `'none'` (line 757). A record with only Google Places search match (no details, no public record, no contacts) gets `enrichment_confidence: 'Low'` with score 20, but still shows as `'complete'`.

### Two Orchestration Files — Confusion Risk

`dataEnrichmentOrchestrator.js` is **NOT** the main business enrichment entry point for LeadLock. It provides:
- `enrichProspectProfile()` — used only by `multiBusinessDetection.js` for health/permit/property intel (step 2 in the multi-business flow)
- `enrichBusinessCard()` — separate business-card-from-photo flow (not LeadLock)
- `findProspectsInArea()` — area prospect search (not LeadLock)

The actual LeadLock enrichment is `enrichBusinessWithPublicSources()` in `enrichmentNormalizer.js`. This is the function called by `ReviewScreen.js`, `TerritoryMapScreen.js`, and `multiBusinessDetection.js`.

**Severity:** cosmetic (no data quality impact, but architectural clarity suffers)
**Risk to sales reps:** None — but developers maintaining this code may be confused about which orchestrator to modify.

---

## Section 2: Google Places — Business Discovery & Details Quality

### business_status — Collected But Never Checked

| API | Field Name | Requested? | Normalized? | Filtered On? |
|---|---|---|---|---|
| Google New Text Search | `businessStatus` | Yes (nearbySearch.js:372) | Yes (line 223) | **No** |
| Google New Nearby | `businessStatus` | Yes (line 316) | Yes (line 223) | **No** |
| Google Legacy Details | `business_status` | Yes (line 619) | No (raw passthrough) | **No** |
| Google Legacy Nearby | `permanently_closed` | **Not requested** | **No** | **No** |

**Finding:** A permanently-closed business returned by Google will flow through the entire enrichment pipeline as if it were active. The `businessStatus: 'CLOSED_PERMANENTLY'` value is stored in `business_data` (businessDataPipeline.js:99,123) but nothing downstream checks it.

**Downstream consumers that could be affected:**
- `enrichmentNormalizer.js:99` — copies to `businessStatus` field, never reads it
- `businessDataPipeline.js:99` — stores in `business_status` column, never filters on it
- `ReviewScreen.js` — renders business status somewhere in the UI but doesn't block enrichment

**Severity:** blocking — permanently-closed businesses get enriched, scored, and queued as if active
**Real risk:** A sales rep could visit a permanently-closed restaurant thinking it's open, because the enrichment pipeline found all its data (phone, website, POC) and assigned a "High" confidence score
**Note:** Google's `permanently_closed` (legacy) vs `businessStatus: 'CLOSED_PERMANENTLY'` (New API) are different field names. The legacy Nearby Search API returns `permanently_closed: true` as a boolean, but this field is never requested in the field mask.

### OSM Fallback — Data Quality Gap

**OSM results carry `source: 'osm_overpass'`** (nearbySearch.js:505), which propagates through:
- `nearbySearch.js:599` → assigned to `finalResults` without deduplication
- `enrichmentNormalizer.js:480` → pushed into sources array
- `enrichmentNormalizer.js:737` → source type `'place_search_result'` (if from search) or no type

**The critical issue:** OSM data is **never merged with Google data**. It's a strict cascade: try Google 3 ways, if all fail, try OSM. If OSM succeeds, those are the only results. OSM business listings are often stale — no phone, no website, no hours, no business_status equivalent. The enrichment confidence score will be lower (no place_details = no +45 points), but the record still gets created.

**Severity:** degraded-but-functional — OSM results are weaker but the pipeline handles them correctly
**Real risk:** Low. OSM is a fallback for businesses Google doesn't know. The real risk is if OSM returns a different business at the same address (e.g., a closed restaurant that's now a hardware store, with OSM still showing the old listing).

---

## Section 3: Social Enrichment (`socialEnrichment.js`)

### What It Does

`socialEnrichment.js` is a **website scraper**, not a social media API client. It:

1. **Scrapes social links** from a business website (`extractSocialLinksFromWebsite`, line 585):
   - Fetches homepage + up to 8 common pages (/contact, /about, /team, etc.)
   - Scans HTML for social URLs (href attributes, JSON-LD `sameAs`, raw URL patterns)
   - If <2 links found, tries sitemap.xml for additional pages
   - Returns discovered social profiles (Facebook, Instagram, LinkedIn, TikTok, YouTube, X)

2. **Extracts emails** (`extractEmailsFromHtml`, line 88):
   - `mailto:` links (most reliable)
   - Raw email patterns in text
   - JSON-LD structured data
   - Filters junk emails (noreply, bounce, etc.)
   - Domain-matching filter

3. **Infers email candidates** (`inferEmailCandidates`, line 138):
   - Generates common patterns: `info@`, `contact@`, `sales@`, `hello@`
   - If POC name known: `john.smith@`, `jsmith@`, `johnsmith@`, etc.

4. **Enriches missing POC** (`enrichMissingPOC`, line 386):
   - Step 1: LensSignal/Supabase nearby lookup — searches public records (Comptroller, TABC, SOS)
   - Step 2: Website team/about page scraping — regex looks for "CEO:", "Owner:", "Manager:" near capitalized names
   - Step 3: Email + phone extraction from the same pages

### Success/Failure Pattern

**Robust try/catch structure.** Every external call is wrapped:
- `fetchText()` (line 333): 8-second timeout via AbortController, returns empty string on failure
- `enrichMissingPOC()` (line 386): LensSignal lookup wrapped in try/catch (line 459), website scraping wrapped in try/catch (line 560)
- `extractSocialLinksFromWebsite()` (line 585): Each page fetch is independent; failure of one page doesn't stop others

**Failure pattern:** Silent failure — errors are caught and logged with `console.warn`, but the function returns `{ ok: true, found: false }` even on network errors. There's no distinction between "no data found" and "network failure."

### enrichMissingPOC — Overwrite Risk

**Line 387:** `enrichMissingPOC` only runs when POC fields are missing:
```js
const isMissing = !prospect.pocFirst || !prospect.pocLast || !prospect.title;
if (!isMissing) {
  return { ok: true, found: false, reason: 'not_missing' };
}
```

**However**, the caller in `enrichmentNormalizer.js:686` pushes the result as `enrichment_candidate` type into the sources array. The `buildEnrichmentBundle()` (line 353) then picks the "best" POC via `extractBestPOC()` (line 328), which prefers candidates with titles matching `/owner|manager|registered agent|officer|contact/i` (line 334).

**Risk:** If a POC was found via a more reliable source (e.g., Google Places owner_name or Comptroller registered agent), but the prospect's `pocFirst`/`pocLast` fields are still empty (because `buildProspectUpdatesFromLookup` hasn't run yet), `enrichMissingPOC` will still run and potentially return a lower-quality website-scraped name. The sources array ordering means the last-pushed source wins in some cases, but `extractBestPOC` picks by title match, not recency.

**Severity:** degraded-but-functional — the priority ordering in `extractBestPOC` helps, but there's no explicit "don't overwrite" guard for POC
**Real risk:** A website-scraped "Manager" title could be preferred over a Comptroller-registered "Owner" if the Comptroller result didn't have a title field. The `enrichMissingPOC` function at line 423 explicitly filters out corporate entities (`llc`, `inc`, `corp`) and property owners, which helps.

### Social Confidence Signal

The `socialConfidence` field (line 662) is set to:
- `'high'` if any social links found
- `'none'` if no links found

This is binary — there's no distinction between "found 5 social profiles" and "found 1 LinkedIn link." The downstream consumer (ReviewScreen) displays this as a badge, so a single link looks just as good as comprehensive social presence.

**Severity:** cosmetic — not a data quality risk, but misrepresents social coverage

---

## Section 4: Claude Haiku / Opus Extraction — Field Validation Gap

### Where Claude Is Used

**Two separate Claude calls in the pipeline:**

1. **Multi-business detection** (`multiBusinessDetection.js:114`): `claude-opus-4-5` vision model. Prompt requests JSON with: `name`, `signage`, `streetAddress`, `city`, `state`, `zip`, `phoneNumber`, `website`, `email`, `businessType`, `position`, `confidence`, `pestIndicators`, `notes`

2. **OCR pipeline** (`leadLockOcrPipeline.js:223`): Calls `extractLeadsWithDebugFromImage()` which uses Claude (via Supabase Edge Function) to extract structured lead data from cropped images.

### Post-Parse Validation

**Multi-business detection (`multiBusinessDetection.js:156-171`):**
```js
const clean = rawText.replace(/```json|```/g, '').trim();
parsed = JSON.parse(clean);
const businesses = (parsed.businesses || []).map(b => ({
  ...b,
  address: b.address || b.streetAddress || '',
}));
```

**There is zero post-parse field validation.** No checks for:
- Business name length or content (could be "Pest Control" truncated from "ABC Pest Control Services")
- Phone format (could be garbage text)
- Address format
- Business type validity (the prompt specifies allowed values but nothing enforces them)
- Confidence value range

**OCR pipeline (`leadLockOcrPipeline.js:53-64`):**
The `isBadBusinessNameCandidate()` function filters OCR text lines for bad candidates (too short, looks like phone/email/website, banned words like "hours", "suite", "drive thru"). But this is used for **line-by-line OCR text filtering**, not for validating Claude's extracted business name.

### Actual Risk — Truncated/Garbage Names

**Scenario:** Claude sees a sign that says "ABC Pest Control Services" but extracts "Pest Control" as the business name. This flows through:

1. `multiBusinessDetection.js:166` — stored as `business.name`
2. `enrichBusinessDetection()` (line 196) — used as `business.businessName`
3. `enrichBusinessWithPublicSources()` (line 233) — used for Google Places search query
4. Google search returns no match (name too generic)
5. Pipeline continues with OSM fallback or no match
6. `enrichment_confidence: 'Low'` (score 20 or less)
7. Record saved with truncated name

**No downstream code catches this.** The `scoreBusinessMatch()` function (line 1012) compares the Claude-extracted name against the Google Places name, but only to calculate a match score — it doesn't reject bad names.

**Phone/address validation:** Similarly absent. If Claude returns `"Call us!"` as a phone number, it passes through `normalizePhone()` (line 12) which tries to extract digits. If no valid digits are found, it returns the raw string `"Call us!"` as the phone.

**Severity:** blocking — garbage extraction from Claude flows straight into the record with no validation
**Real risk:** High for business names (truncation is common with signage OCR), medium for phone/address (Claude is usually better at these but no guarantee)

---

## Section 5: Business Match Scoring

### Where It's Calculated

`scoreBusinessMatch()` in `enrichmentNormalizer.js:1012-1129`. Called at line 770, only when a `place_details` or `place_search_result` source exists.

### Scoring Logic

| Factor | Max Points | Lines |
|---|---|---|
| Name similarity | 35 | 1022-1043 |
| Zip/city/state match | 20 | 1045-1063 |
| GPS distance | 20 | 1065-1092 |
| Address match | 15 | 1094-1105 |
| Phone/website match | 10 | 1107-1120 |
| **Total** | **100** | |

**Labels:** ≥85 = "High", ≥65 = "Medium", ≥35 = "Low", <35 = "Missing"

### Is This Score Meaningful?

**Yes, it's a genuine disambiguation score.** It checks:
- Exact name match (35 pts) vs partial vs word overlap
- GPS proximity (<50m = 20 pts, <150m = 15 pts, etc.)
- Exact address match (15 pts)
- Phone/website match (10 pts)

This is designed to answer: "Did we match the correct Google Places result for this LeadLock-detected business?" For example, if a strip mall has 3 restaurants and the OCR detected "Pizza Hut," the score confirms we found the right Pizza Places result at that address.

**However**, the score is only calculated when a Google candidate exists. If Google search fails and only OSM data is available, `business_match_score` remains `null` (line 810).

**Severity:** degraded-but-functional — the score is meaningful when calculated, but absent when Google is unavailable

### Two Separate Enrichment Code Paths — Drift Risk

| Path | Entry | Enrichment Function | Detection |
|---|---|---|---|
| Single business (ReviewScreen) | `enrichBusinessWithPublicSources()` directly | Full 7-step pipeline | N/A |
| Multi-business (LeadLock) | `detectMultipleBusinessesInPhoto()` | `enrichBusinessDetection()` → `enrichBusinessWithPublicSources()` | Claude vision |

**Both paths call `enrichBusinessWithPublicSources()`,** so the core enrichment is consistent. The multi-business path adds Claude vision detection on top, then calls the same enrichment function per business.

**The drift risk is in `enrichBusinessDetection()`** (multiBusinessDetection.js:196), which adds:
- Geocoding from business address (line 206)
- Intelligence enrichment via `enrichProspectProfile()` (line 265) — this calls `dataEnrichmentOrchestrator.js`, which is a **separate** health/permit/property lookup
- Risk score calculation (line 275) that duplicates logic in `businessDataPipeline.js:48`

**Severity:** degraded-but-functional — the core enrichment is shared, but the risk scoring is duplicated and could drift

---

## Section 6: Confidence Scoring Accuracy

### enrichment_confidence_score Calculation (enrichmentNormalizer.js:736-750)

```js
let enrichmentScore = 0;
if (hasPlaceDetails) enrichmentScore += 45;      // Google Place Details found
if (hasSearchMatch) enrichmentScore += 20;        // Google search match found
if (hasPublicRecord) enrichmentScore += 20;       // Comptroller match found
if (hasContacts) enrichmentScore += 15;           // POC/contact found
if (enrichmentBundle.primaryPhone) enrichmentScore += 10;
if (enrichmentBundle.emailCandidates.length > 0) enrichmentScore += 10;
if (enrichmentBundle.contacts.length > 0) enrichmentScore += 10;
enrichmentScore = Math.min(100, enrichmentScore);
```

### Does It Reflect Genuine Data Quality?

**Partially.** The score weights are:

- **Google Place Details (45 pts):** This is the strongest signal. If we found the business on Google and got full details, the data is likely real. **Good signal.**
- **Search match (20 pts):** Found in Google search but didn't get full details. Weaker but still meaningful. **Good signal.**
- **Public record (20 pts):** Comptroller match. **Good signal** when Comptroller is working (currently broken).
- **Contacts (15 pts):** POC found via LensSignal or website. **Decent signal.**
- **Phone (10 pts):** Any phone found from any source. **Weaker** — could be a wrong number.
- **Email (10 pts):** Any email found. **Weaker** — could be a generic `info@` address.
- **Contacts array (10 pts):** Any contacts in the array. **Weaker** — could be duplicates.

### The Overstatement Problem

**Scenario: Worst case**
- Google Places search returns a result (no details) → +20
- Result has a phone → +10
- OSM found some social links that included an email → +10
- Website scraping found a "Manager" name → +15 contacts

**Total: 55 → "Medium" confidence**

But we have: no Google Place Details (no verified address, website, hours), no Comptroller match, and only a website-scraped contact. The "Medium" label overstates the verification level.

**Conversely, the best case:**
- Google Place Details found → +45
- Search match (redundant with details) → +20
- Comptroller match → +20
- Phone + email + contacts → +30

**Total: 100 → "High" confidence**

This is accurate — 3 independent sources confirm the business exists.

### Zero-Source Edge Case

Can a record get a confidence score that overstates verification when zero real sources succeeded?

**No — but close.** If Google fails, Comptroller fails, BizCollect is inactive, and LensSignal finds nothing:
- `enrichmentScore = 0`
- `enrichmentConfidenceLabel = 'Missing'`
- `enrichmentStatus = 'none'`

The record is created with confidence "Missing." This is correct. The pipeline doesn't fake confidence.

**However**, if Google search returns *any* result (even a wrong one), the score starts at 20. There's no cross-validation that the search result is actually the right business. The `scoreBusinessMatch()` function exists but only produces a *separate* `business_match_score` — it doesn't reduce the `enrichment_confidence_score` if the match is weak.

**Severity:** degraded-but-functional — confidence scores are directionally correct but can overstate when Google returns a low-quality match
**Real risk:** A "Medium" confidence record might have only a Google search match (no details, no public record, no verified contact). A sales rep seeing "Medium" might assume more verification occurred than actually did.

---

## Section 7: BizCollect & Comptroller Status

### BizCollect — Real Code, No Key

| Attribute | Status |
|---|---|
| File | `src/services/enrichmentProviders/bizcollectProvider.js` |
| Implementation | **Real** — actual HTTP calls to `kindly-lyrebird-376.convex.site/api/v1/search` |
| API Key | `EXPO_PUBLIC_BIZCOLLECT_API_KEY` — **empty** in `.env` |
| `isAvailable()` | Returns `false` (line 19-21: checks for non-empty key) |
| Runtime status | **Inactive** — code exists but never executes |

**Impact:** The `searchContactEnrichment()` call in `enrichmentNormalizer.js:661` silently returns nothing. The enrichment pipeline continues without contact data from BizCollect. This means:
- No third-party POC data (name, email, phone from business directories)
- The `enrichMissingPOC` fallback (LensSignal + website scraping) compensates partially
- Contact enrichment is limited to public records and website scraping

**Joe's action required:** Decide whether to activate BizCollect (get API key) or replace with alternative provider.

### Comptroller — Real Code, Broken Upstream

| Attribute | Status |
|---|---|
| File | `src/services/comptrollerEnrichment.ts` |
| Implementation | **Real** — calls Supabase Edge Function `comptroller-lookup` |
| API calls | Parallel: `lookupComptrollerByBusinessName`, `lookupFranchiseByName`, `lookupSalesTaxpayerById` |
| Runtime status | **Documented as broken/failing** (DIAGNOSIS-ENRICHMENT-METHODS.md:140) |

**Impact:** The Comptroller lookup at `enrichmentNormalizer.js:642` silently fails. The enrichment loses:
- Texas Comptroller sales tax permit data (business name, owner, address, phone)
- Franchise tax records
- The `enrichment_confidence_score` loses 20 points (no `public_record` source)
- The `enrichMissingPOC` LensSignal fallback partially compensates (it also queries public records)

**Joe's action required:** The Comptroller Edge Function needs investigation — likely an API key issue, rate limiting, or upstream API change.

### Contact Signal Service — Dead Mock

| Attribute | Status |
|---|---|
| File | `src/services/contactSignal/contactSignalService.ts` |
| Implementation | **Dead mock** — deterministic hash-based fake names, zero API calls |
| Status | Not called by the enrichment pipeline (no imports found in enrichment flow) |

**Impact:** None on the current pipeline. This file is not imported by any enrichment code. It exists as dead code.

### Web Enrichment Service — Dead Mock

| Attribute | Status |
|---|---|
| File | `web/src/services/enrichmentService.js` |
| Implementation | **Dead mock** — hardcoded fake contacts and social URLs |
| Status | Only `fetchLensSignalsNearby()` is real (DB query). The two enrichment functions are mocks. |

**Impact:** Only affects the web dashboard (not the mobile app). The web `BatchEnrichmentPanel.jsx` may call these mock functions, showing fake data in the dashboard.

---

## Summary: Priority Findings

### Blocking (Must Fix Before Sales Reps Use This)

1. **No business_status filtering** (Section 2) — permanently-closed businesses get enriched as active
2. **No Claude extraction validation** (Section 4) — garbage/truncated business names flow straight into records
3. **Confidence score can overstate verification** (Section 6) — "Medium" confidence with only a weak Google search match

### Degraded But Functional (Fix Soon)

4. **Two orchestration files** (Section 1) — architectural confusion, not a data quality issue
5. **enrichMissingPOC overwrite risk** (Section 3) — website-scraped POC could compete with higher-quality sources
6. **OSM fallback has no cross-validation** (Section 2) — weaker data treated same as Google
7. **Duplicate risk scoring** (Section 5) — `multiBusinessDetection.js` and `businessDataPipeline.js` both calculate pest risk independently
8. **Social confidence is binary** (Section 3) — "high" or "none" with no granularity

### Blocked on External Dependencies

9. **BizCollect inactive** (Section 7) — needs API key from Joe
10. **Comptroller broken** (Section 7) — needs Edge Function investigation by Joe
11. **Google Places API key** — degraded externally, confirmed working in-device per prior audit

### Cosmetic

12. **Social confidence binary** — could be "high/medium/low" based on link count
13. **Architecture confusion** — `dataEnrichmentOrchestrator.js` vs `enrichmentNormalizer.js` naming

---

## Fix Pass Recommendations (Priority Order)

### P0 — Before Sales Reps Get Access

1. **Filter `business_status`** in `enrichmentNormalizer.js:580` — after `fetchPlaceDetails()`, check `placeDetails.business_status` and `placeDetails.permanently_closed`. If `'CLOSED_PERMANENTLY'` or `true`, skip the business or flag it.

2. **Add Claude extraction validation** in `multiBusinessDetection.js:166` — after JSON.parse:
   - Business name: reject if <3 chars, matches `isBadBusinessNameCandidate()` patterns, or is a common truncation ("Pest Control", "Services", "LLC" alone)
   - Phone: validate with `normalizePhone()` and reject if result doesn't match `/^\(\d{3}\) \d{3}-\d{4}$/`
   - Address: basic format check (has street number + street name)
   - Confidence: clamp to 0-1 range

3. **Reduce confidence overstatement** — add a penalty when `business_match_score` is low. If the Google result doesn't match the prospect well (score < 50), reduce `enrichment_confidence_score` by a factor.

### P1 — First Enrichment Quality Pass

4. **Add `enrichment_status: 'partial'`** — when some but not all sources succeed, mark the record differently from fully-enriched ones.

5. **Add source-quality weighting** to confidence — OSM-only results should not get the same score as Google-details results. Consider: `if (source === 'osm_overpass') score *= 0.5`.

6. **Fix `enrichMissingPOC` priority** — when a POC is already found via a high-confidence source, skip website scraping entirely (currently it always runs if `pocFirst`/`pocLast` are empty, even if `pocCandidates` already has a good match).

7. **Deduplicate risk scoring** — `multiBusinessDetection.js:275-305` duplicates `businessDataPipeline.js:48-66`. Extract shared logic.

### P2 — Polish

8. **Social confidence granularity** — instead of binary, use link count: 3+ = high, 1-2 = medium, 0 = none

9. **Document the two orchestrators** — add JSDoc to `dataEnrichmentOrchestrator.js` and `enrichmentNormalizer.js` clarifying which is used for what.

10. **Clean up dead mocks** — `contactSignalService.ts` and `web/src/services/enrichmentService.js` enrichment functions should be deleted or clearly marked as unused.
