# AGENT-REFATOR-MANUAL-ENTRY-CASCADE.md

## Context

Step 2 of the enrichment stack build sequence. Manual entry currently skips the enrichment cascade entirely -- the user types business details, reviews, saves, and that's it. No Google Places match, no Comptroller lookup, no dedupe scoring. This step wires manual entry into the same cascade that card scans and LeadLock photos already use.

Reference: `ENRICHMENT-STACK-DESIGN.md`, Pipeline A stages 2-6.

---

## Current behavior

```
ManualEntryScreen.goReview()          (src/screens/ManualEntryScreen.js:27)
  -> normalizeLead() + inferVertical()
  -> navigation.navigate('Review', { editIdx: null })
    -> ReviewScreen.render()
      -> User taps "Save to Queue"    (line 1288)
        -> persistLead()              (line 408)
          -> AsyncStorage.setJSON()   (local save)
          -> upsertProspect()         (Supabase sync)
          -> NO enrichment anywhere
```

The "Look Up Business Profile" button exists on ReviewScreen (line 949) but is only rendered when `isEditing` is true. For a new manual entry, `editIdx: null` so `isEditing` is false -- the button is hidden.

---

## Target behavior

Manual entry enters the same cascade as card scans and LeadLock photos:

1. **Capture input** -- rep types business name, address, phone, etc. (already works)
2. **Normalize** -- `name_normalized` derived (LLC/Inc/Co stripping), phone formatted, address standardized. Original fields untouched.
3. **Match** -- Google Places Text Search confirms entity, returns `place_id`, lat/lng, category
4. **Enrich** -- Place Details, BizCollect (if key available), Comptroller (currently broken, skip for now)
5. **Dedupe** -- fuzzy match against existing prospects (place_id exact, then name+ZIP Levenshtein >= 0.85)
6. **Save** -- write through storageBridge with `source_type: manual`

---

## Key code analysis

### The enrichment function already exists and works

`fetchBusinessProfile` at `src/screens/ReviewScreen.js:173` does exactly what we need:

```js
const enriched = await enrichBusinessWithPublicSources(lead, {
  photoZip: lead.photo_zip || lead.zip || null,
  locationSource: lead.location_source || null,
  locationConfidence: lead.location_confidence ?? null,
});
const updates = buildProspectUpdatesFromLookup(lead, enriched);
setLead(updates);
```

It chains the full cascade: Google Places search (7 strategies) -> Place Details -> Comptroller -> Contact enrichment -> POC discovery -> Health violations -> Property records. Returns enriched data, safely merges into the lead via `buildProspectUpdatesFromLookup`.

### The button is gated by `isEditing` (the only thing blocking manual entry)

At `src/screens/ReviewScreen.js:949`:

```js
{isEditing && (
  <>
    <SectionLabel>Business Profile</SectionLabel>
    <Card>
      {!businessProfile && !profileLoading && (
        <TouchableOpacity style={s.profileLookupBtn} onPress={fetchBusinessProfile}>
          ...Look Up Business Profile...
        </TouchableOpacity>
      )}
```

When `editIdx: null` (new entry), `isEditing` is false, so the entire enrichment section is hidden.

### Deduplication already works on save

`persistLead` at line 442 calls `findDuplicateInLeads(normalized, leads)` which checks the existing leads array. This is local-only (AsyncStorage), not against the full Supabase table, but it's the existing behavior.

---

## Proposed changes

### Change 1: Show enrichment button for new manual entries

**File:** `src/screens/ReviewScreen.js`
**Line:** 949
**Current:** `{isEditing && (`
**Change to:** `{(isEditing || !isEditing) && (` -- or more precisely, remove the `isEditing` gate entirely from the enrichment section.

The enrichment button should show for ALL ReviewScreen visits, not just editing. Card scan and LeadLock leads also pass through ReviewScreen and could benefit from enrichment if it wasn't triggered earlier.

**Recommended condition:** Show enrichment button when `!businessProfile` is true (i.e., enrichment hasn't been run yet), regardless of `isEditing`. The existing `!businessProfile && !profileLoading` guard inside the card already handles this.

### Change 2: Add `name_normalized` to the normalization pass

**File:** `src/utils/leadHelpers.js` (or wherever `normalizeLead` is defined)
**Change:** Add a `name_normalized` field that strips LLC/Inc/Co/Corp/Ltd/PLLC/PLLC suffixes and lowercases. This field is for internal matching only -- never displayed to the user.

Example: "ABC Pest Control LLC" -> "abc pest control"

### Change 3: Wire `confidence_score` from enrichment match scoring

**File:** `src/screens/ReviewScreen.js`
**Location:** Inside `fetchBusinessProfile`, after `buildProspectUpdatesFromLookup`
**Change:** Extract `enrichment_confidence` from the enriched result and set it on the lead as `confidence_score`.

---

## Constraints

- No emoji in any PowerShell output/scripts.
- PowerShell syntax for any shell instructions.
- Do not modify `persistLead` save logic in this pass -- only wire enrichment before save.
- Do not change the dedupe threshold (0.85) -- that's for later pipeline steps.
- Do not add external API calls beyond what `enrichBusinessWithPublicSources` already calls.
- Manual entry must still work if enrichment APIs are down (enrichment is additive, not required for save).
- The rep must see enrichment results BEFORE tapping "Save to Queue" -- not after.

## Verification

1. Create a manual entry with a real business name (e.g. "Walmart" + Houston address)
2. Confirm "Look Up Business Profile" button appears on ReviewScreen
3. Tap the button, confirm enrichment completes and fields are populated (phone, website, etc.)
4. Save the prospect, confirm it syncs to Supabase with `source_type: manual`
5. Create a duplicate manual entry, confirm dedup warning fires
6. Confirm manual entry still works when offline (save without enrichment)

## Close-out

Report: list of files changed, confirmation that enrichment button appears for new manual entries, confirmation that round-trip save includes enriched fields. Wait for review before proceeding to step 3.
