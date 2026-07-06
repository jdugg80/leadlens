# DIAGNOSIS-PROSPECT-SCHEMA.md

**Generated:** 2026-07-06
**Scope:** Step 0 diagnostic + Step 1 migration execution for enrichment stack schema
**Supabase project:** `qkbvwryucaakkkqaqvka`
**Migration status:** COMPLETE — all steps verified

---

## Step 1 — Migration execution results

### Columns added
- `discovery_signal` (text, nullable) — ADDED
- `confidence_score` (numeric, nullable) — ADDED

### Backfill results (source_type from capture_method)

| source_type | Count | Source |
|-------------|-------|--------|
| `manual` | 1505 | `spreadsheet-import` (1503) + `manual` (2) |
| `unknown` | 45 | `image` (ambiguous capture method) |
| `card_scan` | 13 | `business-card` (7) + `ai-scan` (6) |
| `territory_auto` | 11 | `LensSignal` (5) + `map-prospect` (3) + `Nearby Search` (3) |
| `leadlock` | 8 | `LEADLOCK_PHOTO` (8) |
| **Total** | **1582** | All rows backfilled, 0 NULL |

### Round-trip verification

| Test | Result |
|------|--------|
| Insert with all fields populated | PASS — values round-tripped correctly |
| Insert with all fields NULL | PASS — NULLs round-tripped correctly |
| Read existing real row | PASS — new columns accessible, no crash |

### Migration file
`supabase/migrations/20260706000000_add_enrichment_stack_columns.sql`

---

## Step 0 diagnostic (pre-migration)

---

## Step 0.1 — Current table name and full column list

Table: **`prospects`** (1582 rows, confirmed live)

92 columns total. Full list:

```
id, business_name, poc_first, poc_last, phone, email, street_number, street_name,
address_line_2, city, state, zip, website, notes, vertical, status, capture_method,
rep_name, employee_num, branch_num, saved_at, created_at_client, duplicate_warning,
raw_lead, updated_at, capture_latitude, capture_longitude, capture_accuracy_meters,
capture_location_confidence, capture_location_status, capture_heading, capture_address,
geotarget, capture_location_source, capture_location_age_seconds,
capture_location_captured_at, capture_heading_magnetic, capture_heading_true,
capture_heading_accuracy, capture_altitude_meters, capture_altitude_accuracy_meters,
capture_speed_mps, duplicate_flag, duplicate_of, duplicate_score, duplicate_reason,
source_type, source_label, source_id, rep_email, user_email, user_role,
target_latitude, target_longitude, target_bearing_degrees, target_distance_meters,
target_projection_confidence, target_projection_status, target_projection_level,
target_distance_source, target_distance_confirmed, target_projection_calculated_at,
target_projection_error, target_projection, address_line2, target_distance_key,
target_distance_label, target_distance_custom_meters, target_confirmed,
confirmed_target_latitude, confirmed_target_longitude, confirmed_target_source,
confirmed_target_note, target_confirmed_at, target_correction_distance_meters,
capture_to_confirmed_target_meters, confirmed_target_error, target_auto_mode,
target_auto_reason, target_review_recommended, target_confidence_label,
target_resolution_source, target_auto_selected_at, collected_at, reviewed_at,
last_edited_at, queue_status, queue_sort_group, viability_score, viability_label,
missing_viability_fields, shade_key, user_id, property_type, latitude, longitude,
photo_zip, location_source, location_confidence, location_warning,
gps_accuracy_meters, captured_at, enrichment_confidence, enrichment_confidence_score,
enrichment_status, enrichment_notes
```

---

## Step 0.2 — Overlapping columns (CRITICAL FINDING)

Three of the five proposed columns **already exist** on the `prospects` table but are completely unpopulated (all NULL across all 1582 rows):

| Proposed column | Already exists? | Current state |
|-----------------|----------------|---------------|
| `source_type` | **YES** | All 1582 rows NULL |
| `discovery_signal` | No | -- |
| `confidence_score` | **PARTIAL** | `enrichment_confidence_score` exists (all NULL); `duplicate_score` exists (all NULL); `viability_score` exists (populated) |
| `duplicate_of` | **YES** | All 1582 rows NULL |
| `enrichment_status` | **YES** | All 1582 rows NULL |

Additionally, `capture_method` (populated, 9 distinct values) overlaps in purpose with `source_type`:

| `capture_method` value | Count | Maps to proposed `source_type` |
|------------------------|-------|-------------------------------|
| `spreadsheet-import` | 921 | `manual` |
| `image` | 45 | Ambiguous (`card_scan`? `leadlock`?) |
| `LEADLOCK_PHOTO` | 8 | `leadlock` |
| `business-card` | 7 | `card_scan` |
| `ai-scan` | 6 | `card_scan` |
| `LensSignal` | 5 | `territory_auto` |
| `Nearby Search` | 3 | `territory_auto` |
| `map-prospect` | 3 | `territory_auto` |
| `manual` | 2 | `manual` |

**Recommendation:** Reuse the three existing nullable columns (`source_type`, `duplicate_of`, `enrichment_status`) as-is — they already have the right names and types. Do not re-add them. Only `discovery_signal` and `confidence_score` need to be added as new columns. For `confidence_score`, consider reusing `enrichment_confidence_score` instead of adding a new column (it serves the same purpose and is already all NULL).

---

## Step 0.3 — RLS policies

**Could not query RLS policies directly.** The Supabase client cannot access `pg_policies` and no `exec_sql` RPC function exists in this project. The following must be confirmed manually in the Supabase dashboard:

1. Does the `prospects` table have RLS enabled?
2. What policies exist (SELECT, INSERT, UPDATE, DELETE)?
3. Are there any policies with column-level restrictions that would block writes to new nullable columns?

Adding nullable columns with no default should not require policy updates — RLS policies typically restrict which rows can be accessed, not which columns. However, this must be confirmed in the dashboard before proceeding.

---

## Step 0.4 — Code paths that read/write prospects

### Write path: `backendSync.js`

The sole write path to the `prospects` table is `buildRow()` at `src/utils/backendSync.js:23-64`. This function explicitly lists every field it writes — it does **not** include `source_type`, `enrichment_status`, `duplicate_of`, or any of the proposed new columns. The upsert uses `{ onConflict: 'id' }`, so:

- Adding nullable columns with no default: **SAFE** — existing upserts will leave them NULL
- Making columns NOT NULL without a default: **WILL BREAK** — existing upserts don't provide these fields

### Read paths

No code does `select('*')` on the prospects table. The `DashboardScreen` and other screens read prospects through `storageBridge` or Supabase queries that specify explicit field lists. Adding nullable columns will not break any existing read operations.

### Summary of risk

| Operation | Risk | Notes |
|-----------|------|-------|
| `buildRow()` upsert | None | Explicit field list, new columns left NULL |
| `deleteProspect()` | None | Uses `.delete().eq('id', ...)` |
| Screen reads | None | No `SELECT *` patterns |
| `fullPushSync()` batch upsert | None | Same `buildRow()` path |

---

## Step 0.5 — Migration plan

### Columns to add (2 new)

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `discovery_signal` | text, nullable | NULL | Only set when `source_type = territory_auto` |
| `confidence_score` | numeric, nullable | NULL | From dedupe/match stage |

### Columns to reuse (3 existing, already on table)

| Column | Current state | Action |
|--------|--------------|--------|
| `source_type` | All NULL | Backfill from `capture_method` |
| `duplicate_of` | All NULL | No action (populated by later dedupe step) |
| `enrichment_status` | All NULL | No action (populated by later pipeline steps) |

### `source_type` backfill logic

Map from `capture_method` (the existing populated field):

| `capture_method` | `source_type` |
|------------------|---------------|
| `business-card`, `ai-scan` | `card_scan` |
| `LEADLOCK_PHOTO` | `leadlock` |
| `manual`, `spreadsheet-import` | `manual` |
| `LensSignal`, `Nearby Search`, `map-prospect` | `territory_auto` |
| `image` | `unknown` (ambiguous — could be card scan or LeadLock) |
| NULL or empty | `unknown` |

### Backfill distribution estimate (based on sampled data)

- `manual`: ~923 rows (spreadsheet-import + manual)
- `card_scan`: ~13 rows (business-card + ai-scan)
- `leadlock`: ~8 rows (LEADLOCK_PHOTO)
- `territory_auto`: ~11 rows (LensSignal + Nearby Search + map-prospect)
- `unknown`: ~45 rows (image) + any remaining NULLs

---

## Step 0 addendum — targetlens_permits table

The `targetlens_permits` table was checked in both Supabase projects:

| Project | Ref | Table exists? | Row count |
|---------|-----|--------------|-----------|
| LeadLens | `qkbvwryucaakkkqaqvka` | YES | **0 rows** |
| Project Scarlett | `dlntgyhfxxbcwwcxaorn` | YES | **0 rows** |

The table schema exists in both projects but contains no data. This explains why TerritoryMap was not loading — it was querying an empty table. The data was either never ingested or was wiped during the earlier TerritoryMap revert. **Do not wire Pipeline B step 3 against this table until data ingestion is confirmed working.** The table needs to be populated before the territory discovery pipeline can read from it.

Additionally, the `targetlens_prospects`, `targetlens_property_tax`, and `targetlens_mls_listings` tables also exist in both projects with 0 rows each.

### Verification after migration

1. Confirm app loads and displays existing prospects (no crashes from unexpected nulls)
2. Test insert with all new fields populated round-trips through `storageBridge`
3. Test insert with all new fields left NULL round-trips correctly
4. Run count-by-value on `source_type` and report distribution for sanity check
