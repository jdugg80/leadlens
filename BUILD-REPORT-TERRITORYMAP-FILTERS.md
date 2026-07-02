# BUILD REPORT: TerritoryMap Commercial + Residential Filter System

**Status:** Implementation complete. Migrations + JS code ready for Supabase deploy and EAS OTA update.  
**Date:** 2026-07-01

---

## 1. Summary

Implemented the full TerritoryMap filter rework per `AGENT-BUILD-TERRITORYMAP-FILTERS.md`:

- Created the missing `targetlens_permits` table and the `leased` occupancy type migration.
- Added `defaultMode` to every TargetLens profile and wired the map to initialize mode from the active profile.
- Removed the top-of-map Business/Homeowner toggle and moved the search bar to that top position.
- Rebuilt `LeadFiltersBottomSheet` as the unified filter panel with a Commercial/Residential mode toggle, universal filters, mode-conditional filters, and LensSignal filters.
- Updated Google Places taxonomy and field mask so Business Rating and Star Rating filters have data.
- Wired residential queries to `targetlens_prospects` plus the new `targetlens_permits` table, and added LensSignal filtering logic for commercial signals.

---

## 2. Database Migrations

### 2a. `targetlens_permits` table

**File:** `supabase/migrations/20260701204214_create_targetlens_permits_table.sql`

```sql
-- Migration: Create targetlens_permits table for residential building/renovation/new-construction signals.
-- Follows the same conventions as targetlens_prospects, targetlens_property_tax, and targetlens_mls_listings.

create table if not exists targetlens_permits (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  -- Permit classification
  permit_type text not null check (permit_type in ('building','renovation','new_construction')),
  permit_date date,
  status text default 'active',
  description text,

  -- Source / jurisdiction
  source text,
  source_jurisdiction text, -- e.g. "City of San Antonio"
  state text,
  county text,
  city text,

  -- Location
  address text,
  zip text,
  lat double precision,
  lng double precision,

  -- Raw enrichment payload
  raw_payload jsonb default '{}',

  -- Optional linkage to a known prospect or property record
  prospect_id uuid,
  property_tax_id uuid
);

-- Indexes
create index if not exists idx_targetlens_permits_type on targetlens_permits(permit_type);
create index if not exists idx_targetlens_permits_date on targetlens_permits(permit_date desc);
create index if not exists idx_targetlens_permits_jurisdiction on targetlens_permits(county, state);
create index if not exists idx_targetlens_permits_lat_lng on targetlens_permits(lat, lng);
create index if not exists idx_targetlens_permits_prospect on targetlens_permits(prospect_id);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_targetlens_permits_updated_at ON targetlens_permits;
CREATE TRIGGER set_targetlens_permits_updated_at
  BEFORE UPDATE ON targetlens_permits
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();

-- RLS
alter table targetlens_permits enable row level security;

create policy "Users can read targetlens_permits"
  on targetlens_permits for select
  using (auth.role() = 'authenticated');

create policy "Service role can manage targetlens_permits"
  on targetlens_permits for all
  using (auth.role() = 'service_role');
```

### 2b. `leased` occupancy type

**File:** `supabase/migrations/20260701204220_add_leased_to_targetlens_prospects.sql`

```sql
-- Migration: Add 'leased' to the prospect_type check constraint on targetlens_prospects
-- so the Occupancy Type filter can support Owner-Occupied / Rental / Leased.

alter table targetlens_prospects
  drop constraint if exists targetlens_prospects_prospect_type_check;

alter table targetlens_prospects
  add constraint targetlens_prospects_prospect_type_check
  check (prospect_type in ('new_homeowner','current_homeowner','rental','leased'));
```

**Note:** As requested in the briefing, the `targetlens_permits` table was noted as "applied" elsewhere but did not exist in this repo. The migration above creates it now. This discrepancy should be flagged back to Joe.

---

## 3. Modified Files

| File | What changed |
|---|---|
| `src/config/targetLensProfiles.ts` | Added `defaultMode: 'commercial' \| 'residential'` to the `TargetLensProfile` interface and to all 11 profiles. |
| `src/screens/TerritoryMapScreen.js` | Removed top toggle; moved search bar; initialized mode from active profile; expanded filter state; rewrote residential query to use new filters and fetch from `targetlens_permits`; added LensSignal filtering logic. |
| `src/components/LeadFiltersBottomSheet.js` | Completely rebuilt into unified filter panel with Commercial/Residential toggle, universal filters, mode-conditional filters, and LensSignal/residential signal filters. |
| `src/utils/nearbySearch.js` | Expanded `BUCKET_MAPPING` to match spec taxonomy and added `rating`/`userRatingCount` to the Places nearby-search field mask. |

---

## 4. Key Implementation Notes

### 4.1 Mode state and profile defaults
- `targetLensMode` now uses `'commercial'` / `'residential'` instead of `'business'` / `'homeowner'`.
- On mount, the active profile’s `defaultMode` sets the initial mode.
- When a rep changes the profile via `TargetLensProfileSelector`, the mode updates to the new profile’s default.
- The filter panel’s mode toggle updates `filters.mode`, which stays synced with `targetLensMode`.
- The mode is **reset to the profile default every time the screen loads**, so the per-session override is not persisted across sessions. This matches the briefing’s guidance to avoid over-building persistence.

### 4.2 Residential signal query
- The query now reads from `targetlens_prospects` and `targetlens_permits`.
- Occupancy types map to `prospect_type` values:
  - `owner_occupied` → `new_homeowner`, `current_homeowner`
  - `rental` → `rental`
  - `leased` → `leased`
- Residential property types map to `property_class` values (e.g., `single_family`, `condo`, `townhouse`, etc.).
- Permit signals are fetched from `targetlens_permits` and normalized to match the prospect shape for rendering.

### 4.3 LensSignal filtering (commercial)
- Filters applied to `lensSignalRecords` before clustering:
  - `newBusinessOpenings` → Opening signals that are not ownership-related.
  - `ownershipChanges` → Opening signals with ownership/transfer/change text.
  - `healthCodeViolations` → Compliance signals with pest/violation indicators.
  - `complianceScoreMin` → Numeric score threshold.
  - `starRatingMin` → Numeric rating threshold.
- Health Code Violations and Compliance Score are shown in the UI as **disabled** with a "TX-only for now" badge, matching the briefing’s LA/MA "Coming Soon" requirement.

### 4.4 Google Places taxonomy
- Renamed buckets to match the spec:
  - `Food & Hospitality`
  - `Retail`
  - `Office & Professional`
  - `Multi-Family & Residential-Adjacent`
  - `Industrial & Logistics`
  - `Institutional`
  - `Other`
- Added many more raw Google Places `types` to each bucket.
- The nearby search field mask now includes `places.rating` and `places.userRatingCount`, so the Business Rating filter has data.

---

## 5. Lint / Static Verification

Command run:

```bash
npx eslint src/screens/TerritoryMapScreen.js src/components/LeadFiltersBottomSheet.js src/config/targetLensProfiles.ts src/utils/nearbySearch.js
```

Result: **0 errors, warnings only**. All remaining warnings are pre-existing (unused imports, hook dependency warnings in pre-existing code, inline imports after module body, etc.). No new errors were introduced.

---

## 6. Manual Testing Checklist

Because this is a local code environment, full runtime verification requires the app to be built and run. The following was verified by code review / static analysis:

- ✅ `LeadFiltersBottomSheet` renders a Commercial/Residential toggle as the first control.
- ✅ Toggling the mode conditionally renders commercial-only vs residential-only filters.
- ✅ Removed top Business/Homeowner buttons and moved search bar to top of map.
- ✅ Residential filters map to real `targetlens_prospects` columns (`home_value_estimated`, `home_sq_footage`, `prospect_type`, `property_class`, `lookback_bucket`).
- ✅ `leased` is included in the `prospect_type` check constraint.
- ✅ `targetlens_permits` table supports `building`, `renovation`, and `new_construction` permit types.
- ✅ All 11 TargetLens profiles have a sensible `defaultMode`.
- ✅ Mode initializes from active profile and syncs with the filter panel.
- ✅ Business Rating filter now has `rating`/`userRatingCount` in the Places field mask.
- ✅ Health Code Violations / Compliance Score filters are disabled with "TX-only for now" badge.
- ✅ Lint passes with no errors.

### Runtime tests still needed (requires app build + Supabase migrations applied)

1. Open TerritoryMap with each profile and confirm the filter panel opens with the correct default mode.
2. Toggle Commercial/Residential in the filter panel and confirm the correct filter set renders.
3. Apply residential filters (Estimated Home Value, Sq Footage, Occupancy Type, Leased) and confirm the map query returns matching records.
4. Apply Business Rating filter and confirm nearby places populate with rating values.
5. Confirm permit signals appear as green pins in residential mode when the table has data.
6. Confirm TX LensSignals still display; LA/MA show "TX-only for now" badge instead of empty/broken behavior.

---

## 7. Deployment Steps

1. Apply the two new migrations directly to Supabase:
   ```bash
   supabase db push
   # or apply them manually in the Supabase SQL editor
   ```
2. Commit and push the JS changes:
   ```bash
   git add src/components/LeadFiltersBottomSheet.js src/config/targetLensProfiles.ts src/screens/TerritoryMapScreen.js src/utils/nearbySearch.js supabase/migrations/20260701204214_create_targetlens_permits_table.sql supabase/migrations/20260701204220_add_leased_to_targetlens_prospects.sql
   git commit -m "Add TerritoryMap/LensSignals commercial+residential filter system"
   git push
   ```
3. Publish an OTA update:
   ```bash
   eas update --branch development --message "Add TerritoryMap/LensSignals commercial+residential filter system"
   ```
4. Test on the development channel before promoting to production.

---

## 8. Discrepancies / Follow-ups

- **`targetlens_permits` table did not exist in the repo despite being noted as applied.** I created the migration; please confirm with Joe whether this table was supposed to already exist in a prior migration or if this is a new addition.
- **Mode persistence:** The rep’s in-session override is not persisted across sessions. The mode resets to the active profile’s `defaultMode` on every TerritoryMap screen load. This is the conservative implementation per the briefing.
- **LA/MA compliance data:** The UI shows "TX-only for now" for Health Code Violations and Compliance Score filters. Full LA/MA data ingestion is a separate data-engineering effort.
- **Residential permit signal data:** The `targetlens_permits` table will be empty until an ingestion pipeline populates it. UI code is ready to render it once data exists.
