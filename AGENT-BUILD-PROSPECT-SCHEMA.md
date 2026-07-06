# AGENT-BUILD-PROSPECT-SCHEMA.md

## Context

This is step 1 of the enrichment stack build sequence defined in `ENRICHMENT-STACK-DESIGN.md`. Every later step (manual-entry cascade refactor, territory discovery, dedupe/merge UI) depends on these fields existing on the prospects table. Read `ENRICHMENT-STACK-DESIGN.md` in full before starting — it's the source of truth for why these fields exist and how they'll be used.

Do not skip Step 0. The `targetlens_permits` schema mismatch from the reverted TerritoryMap work happened because a prior pass assumed a schema instead of checking it — do not repeat that here.

---

## Step 0: Diagnostic phase (report back before writing any migration)

1. Confirm the exact current name and full column list of the prospects table in the LeadLens Supabase project (ref `qkbvwryucaakkkqaqvka`). Do not assume the name — pull it live.
2. Check for any existing columns that already overlap in purpose with what this briefing proposes adding (e.g. an existing status/source field under a different name) — if found, report it and propose reusing/renaming rather than adding a duplicate-purpose column.
3. Check what RLS policies currently exist on the prospects table, and confirm whether adding nullable columns requires any policy updates (it shouldn't, but confirm rather than assume — per the RLS silent-failure pattern noted in project learnings).
4. Check every code location that currently reads or writes prospect records (ReviewScreen, BatchReviewScreen, ProspectQueueScreen, TerritoryMapScreen, and any Edge Functions) and confirm none of them do a `SELECT *` into a strictly-typed struct that would break on new columns, or an `INSERT`/`UPDATE` that would fail if these columns are `NOT NULL` without defaults.
5. Report findings in `DIAGNOSIS-PROSPECT-SCHEMA.md` before writing the migration.

---

## Migration (only after Step 0 is reported)

Add the following columns to the prospects table, all nullable with sensible defaults so existing rows and existing code paths are unaffected:

- `source_type` — text/enum. Values: `card_scan`, `leadlock`, `manual`, `territory_auto`. Default for existing rows: infer from whatever data is available (e.g. if a row has OCR-derived fields populated, default to the most likely prior source; otherwise `manual`). Report your inference logic before applying it — don't guess silently on existing production data.
- `discovery_signal` — text/enum, nullable. Values: `new_registration`, `building_permit`, `health_permit`, `ownership_change`. Only ever set when `source_type = territory_auto`. Null for all existing rows.
- `confidence_score` — numeric, nullable. No default needed; only populated going forward by the dedupe/match stage.
- `duplicate_of` — nullable foreign key referencing the prospects table itself (`id`). Used when a record is flagged pending a rep's merge-or-keep-separate decision.
- `enrichment_status` — text/enum, nullable. Suggested values: `not_started`, `partial`, `complete`, `failed`. Used to surface records that stalled partway through the cascade (e.g. Places matched but Place Details failed because the legacy API isn't enabled yet).

For each new column, add an explicit migration file (not a manual dashboard edit) so it's tracked in version control and can be rolled back.

## Backfill

- For `source_type` on existing rows: apply the inference logic reported and confirmed in Step 0 above.
- Do not backfill `confidence_score`, `discovery_signal`, or `enrichment_status` — leave null for historical rows. These only have meaning going forward.
- After backfill, run a count-by-value check on `source_type` and report the distribution (e.g. "X rows manual, Y rows card_scan, Z inferred/unknown") so the inference can be sanity-checked against known beta history.

## Verification

- Confirm the app still loads and displays existing prospects correctly on the dev device after the migration (no crashes from unexpected nulls).
- Confirm a test insert with all new fields populated round-trips correctly through `storageBridge` (write, force-close, reopen, read-back — per the MMKV flush learnings).
- Confirm a test insert with all new fields left null also round-trips correctly (this is the common case for every write until later pipeline steps are built).

## Constraints

- No emoji in any PowerShell output/scripts.
- PowerShell syntax for any shell instructions.
- Do not touch any enrichment API integration code in this pass — schema only.
- Do not start the manual-entry cascade refactor (step 2 in the build sequence) until this migration is verified and reported back.

## Close-out

Report: final column list added, backfill distribution for `source_type`, and confirmation that both null-field and populated-field round-trips passed. Wait for review before proceeding to step 2.

---

## Clarifications (added after initial diagnostic questions)

- **Existing 11 columns from migration `20260528`**: Step 0.2 above already requires checking for overlapping-purpose columns before adding new ones. Treat this as the primary thing to resolve in Step 0 — if any of the 11 already serve a purpose one of the 5 new columns would duplicate, reuse/rename the existing column instead of adding a new one. Report this explicitly rather than adding all 5 regardless.
- **Same table, not a new one**: all 5 columns (`source_type`, `discovery_signal`, `confidence_score`, `duplicate_of`, `enrichment_status`) are additive columns on the existing `prospects` table.
- **`source_type` backfill**: infer a value for every existing row using the signals described in the Backfill section (presence of OCR-derived fields suggests `card_scan`/`leadlock`; absence suggests `manual`). Do not leave rows null. If a row is genuinely ambiguous, use an explicit `unknown` value rather than null, so it stays queryable and distinguishable from rows that predate this migration entirely. Report the full distribution (including any `unknown` count) before considering backfill complete.
- **Dedupe threshold (used by later pipeline steps, defined here since it affects schema validation logic)**: fixed value, not rep-configurable yet. Rule: `place_id` exact match = high-confidence flag; otherwise, normalized-name similarity (Levenshtein ratio) ≥ 0.85 AND same ZIP or within a small geo radius = flag for review; below that threshold, create as new without flagging. This is a starting value to be revisited after real duplicate data accumulates — do not build in rep-facing configurability for it yet.

