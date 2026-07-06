# DIAGNOSIS-PROPERTY-SOURCE-FLAG.md

**Generated:** 2026-07-06
**Scope:** Step 0 diagnostic for property source flag fix
**Reference:** AGENT-FIX-PROPERTY-SOURCE-FLAG.md

---

## Step 0.1 — HCAD vs Haiku branch

**File:** `src/utils/propertyRecordsService.js`

The branch happens at lines 40-53 (HCAD) and 58-67 (AI fallback):

| Path | Lines | Trigger | `dataSource` value |
|------|-------|---------|-------------------|
| HCAD | 40-53 | `response.ok` AND `data.property` or `data.result` exists | `'hcad'` |
| AI fallback | 58-67 | HCAD fails (timeout, non-200, or no property data) AND `ANTHROPIC_API_KEY` exists | `'ai_estimate'` |
| Neither | 70 | Both fail | `success: false`, no `dataSource` |

**HCAD path returns** (line 45-51): `parsePropertyRecord()` fields — address, city, state, zip, parcelNumber, squareFeet, yearBuilt, buildingAge, stories, zoning, landUse, propertyType, totalValue, condition, owner. Plus `pestRiskFactors` and `pestRiskScore`.

**AI fallback returns** (line 62): `estimatePropertyRiskWithAI()` fields — propertyType, estimatedAge (not yearBuilt), landUse. No parcelNumber, no squareFeet, no stories, no zoning, no totalValue, no condition, no owner. The AI returns a subset of the HCAD fields.

Both paths include `dataSource` in the return value.

---

## Step 0.2 — Does a source distinction exist in the data layer?

**YES.** The `dataSource` field is carried through the entire chain:

1. `propertyRecordsService.js:48/62` — set to `'hcad'` or `'ai_estimate'`
2. `enrichmentNormalizer.js:716` — stored as `enrichment.propertyRisk.dataSource`
3. `buildProspectUpdatesFromLookup` line 1156 — stored in `enrichment.rawLookup` (entire enrichment result)

**But it is buried 3 levels deep:** `lead.enrichment.rawLookup.enrichment.propertyRisk.dataSource`

No code extracts this to a top-level field. No code reads it for display purposes. It exists in the data but is effectively invisible.

---

## Step 0.3 — UI surfaces that display property details

**Property details are NOT displayed in any UI.**

The enrichment profile on ReviewScreen (lines 969-1174) shows:
- Google Places data (name, status, rating, phone, website, hours)
- Email candidates
- Social links
- Enrichment confidence score
- Business match label

It does NOT show:
- Square footage
- Year built / building age
- Land use
- Property type from HCAD
- Total value
- Owner name
- Any property-specific fields

Property data is used ONLY for internal risk scoring (`pestRiskScore`, `pestRiskFactors`) which feeds into `viability_score` — a numeric score shown elsewhere, but without the underlying property details or their source.

**No UI surface currently shows the HCAD-vs-AI distinction to the rep.**

---

## Step 0.4 — Summary

| Question | Answer |
|----------|--------|
| Does a source distinction exist in data? | YES — `dataSource: 'hcad'` or `'ai_estimate'` |
| Is it extracted to a readable location? | NO — buried in `enrichment.rawLookup.enrichment.propertyRisk.dataSource` |
| Is it displayed in any UI? | NO — property details themselves aren't displayed at all |
| Does the rep have any way to know if property data is verified or estimated? | NO |

**Conclusion:** A fix is needed. The distinction exists in the data but reaches no one. Two things must happen:
1. Extract `dataSource` to a top-level field on the prospect record
2. Display property details with a visible source badge in the UI

---

## Fix plan

### 1. Extract `property_records_source` to top-level

In `buildProspectUpdatesFromLookup` (enrichmentNormalizer.js:1003), extract `dataSource` from the enrichment result and set it as a top-level field:

```
property_records_source: enrichmentResult.enrichment?.propertyRisk?.dataSource || null
```

This is additive — nullable, no DDL needed if stored in the existing `enrichment` JSONB or as a new text column.

### 2. Add `property_records_source` column to prospects

The prospects table does NOT have a `property_records_source` column. Add it as nullable text (same pattern as the step 1 migration).

### 3. Set the field in `buildProspectUpdatesFromLookup`

After the existing enrichment metadata extraction (line 1130-1136), add:

```js
const propertySource = enrichmentResult.enrichment?.propertyRisk?.dataSource || safeProspect.property_records_source || null;
```

Include it in the return object at line 1138.

### 4. Surface in ReviewScreen UI

In the enrichment profile section (ReviewScreen.js ~line 969), after the existing property display, add a visible source indicator. Since property details aren't currently shown, this requires adding a property details section that shows key fields (yearBuilt, squareFeet, landUse) with a source badge.

### 5. Migration SQL

```sql
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS property_records_source text;
```

No backfill — existing rows stay null until re-enriched.
