# LeadLens Prospect Enrichment Stack — Design Spec

## Overview

Two independent pipelines feed the prospect table:

- **Pipeline A — Capture-time enrichment**: triggered by a rep action (card scan, LeadLock photo, manual entry). Runs synchronously against the same cascade regardless of which capture method started it.
- **Pipeline B — Territory discovery**: runs on a schedule against public records, with no rep action required. Creates prospects automatically and pushes a notification.

Both write to the same prospect record schema, distinguished by a `source_type` field so the UI and reporting can tell rep-captured prospects from auto-discovered ones.

---

## Pipeline A — Capture-time enrichment cascade

Stages, in order:

1. **Capture input** — card scan, LeadLock photo (single or multi-business), or manual entry. Manual entry currently skips enrichment entirely; it should instead enter the same cascade at stage 2 using whatever name/address the rep typed. This is the main architectural change from today's behavior.
2. **Extract and structure** (Claude) — OCR + structured parse for card/photo captures. For manual entry, this stage is a normalization pass: address formatting, phone formatting, and business-name suffix stripping (LLC/Inc/Co) — but only to produce a derived matching key (e.g. `name_normalized`), not to alter what the rep actually typed. The original `name` field stays exactly as entered; the normalized version is used internally by stage 3's matching and stage 5's dedupe logic only.
3. **Match and verify** (Google Places Text Search — currently working) — confirms the entity against a real place, returns `place_id`, lat/lng, category. This is the anchor point everything else keys off of.
4. **Enrich details** (Google Place Details + BizCollect + CAD parcel data) — supplemental fields: hours, phone, website, rating from Place Details; whatever BizCollect's active fields are (needs confirming once the key is added — treat as a second enrichment source keyed on the same `place_id`/name+address match, not a replacement for Places); and for residential-type prospects specifically, county appraisal district (CAD) parcel data — square footage, year built, land use type, owner name — keyed on address match rather than `place_id`. CAD data is the one enrichment source in this stage that's genuinely useful for both current pest control targeting (home age/type) and the planned HVAC/roofing/solar verticals (roof age proxy, home size), so it's worth wiring in now rather than treating it as vertical-specific.
5. **Dedupe and score** — fuzzy match against the existing prospects table (by `place_id` first, then normalized address/name) before writing. Produces a confidence score used in both pipelines' merge logic (see Duplicate Handling below).
6. **Prospect record** — written through `storageBridge` with `source_type` tagged (`card_scan` / `leadlock` / `manual`).

---

## Pipeline B — Territory discovery pipeline

Stages, in order:

1. **Public data sources** — see tiering plan below.
2. **Scheduled ingestion** — a Supabase Edge Function on a cron schedule, filtered per active territory and per vertical (pest control only cares about certain signal types; HVAC/roofing/solar cares about `targetlens_permits.upgrade_category` instead).
3. **Dedupe check** — same fuzzy-match logic as Pipeline A, run against the full prospects table (not just other territory-discovered records).
4. **Create prospect record** — tagged `source_type: territory_auto` plus a `discovery_signal` field (`new_registration` / `building_permit` / `health_permit` / `ownership_change`).
5. **Push notification** — instant, per new record, via Expo Push API to whichever rep(s) own the territory the record falls in.

### Data source tiering plan (nationwide rollout)

Since there's no unified national feed for any of these signal types, coverage has to be built as independent per-jurisdiction adapters that all normalize into the same internal event shape (`{source, jurisdiction, record_type, business_name, address, effective_date, raw_payload}`). Proposed rollout order:

- **Tier 0 — statewide, already free and no-key (highest leverage first)**: Texas Comptroller taxable entity search for new registrations and officer/ownership changes. This is real-time, requires no additional integration work beyond the 405 fix already in progress, and is the only signal source in this list that's genuinely statewide today.
- **Tier 1 — `targetlens_permits`**: schema exists in both Supabase projects but is confirmed empty (0 rows in both LeadLens and Project Scarlett as of the latest audit). This is not existing internal data ready to wire in — it needs an ingestion adapter built from scratch, including identifying what data source the schema was originally designed to accept.
- **Tier 1 — county appraisal district (CAD) parcel data**: free statewide aggregation exists via the Texas Geographic Information Office (TxGIO), refreshed annually from all 254 county appraisal districts, standardized into a common schema. This is dual-purpose: it's both a Pipeline A enrichment source (property characteristics on any residential prospect) and a Pipeline B discovery signal (ownership/owner-name changes on a parcel, which the Comptroller feed doesn't catch since Comptroller only tracks registered business entities, not individual property owners). Start with the free TxGIO annual refresh; a paid unified API (e.g. TaxNetUSA, which covers all TX counties plus FL in a standardized real-time-ish format) is worth revisiting once annual refresh cadence proves too stale for ownership-change detection specifically.
- **Tier 2 — Socrata/open-data-portal jurisdictions**: cities and counties that already publish machine-readable health/food-service permit data (a meaningful chunk of large metros do, via Socrata's SODA API or similar). Build one generic Socrata adapter, then a per-dataset config (endpoint + field mapping) for each jurisdiction as it's added — this is additive, not a rewrite, as coverage expands.
- **Tier 3 — no open data, manual/scraped, or paid aggregator**: everywhere else, including Brazoria County specifically. These either need a scraper against whatever the county publishes (fragile, needs monitoring), a paid data aggregator if one exists for the jurisdiction, or get skipped until a rep in that territory asks for it.

Practical recommendation: prioritize Tier 2 jurisdictions where current or likely-near-term beta users actually operate, rather than trying to build breadth before there's a rep to benefit from it. Nationwide "as much as I can get" is the right target, but it's reached by continuously adding Tier 2/3 adapters over time, not a single build.

**Current scope decision: Texas and Louisiana only, until beta testers exist elsewhere.** Within that scope, Texas Comptroller (Tier 0) covers new registrations/ownership changes statewide already. Louisiana has no equivalent free statewide entity-search API with the same characteristics — the Louisiana Secretary of State's commercial database search is the closest analog and would need its own adapter, likely Tier 2/3 depending on whether it exposes a usable API versus requiring scraping. That should get its own diagnostic pass when Louisiana territory work actually starts, rather than assumed now.

### Deferred sources (revisit when relevant vertical work starts)

- **NOAA storm/hail data** — free public Storm Events Database, with established paid aggregators (HailTrace, RoofLink) that overlay hail swath maps on top of it. This is close to industry-standard for door-to-door roofing lead generation, but it has no relevance to pest control. Hold this until the roofing/solar vertical is actually being built rather than integrating it now — it would sit unused in the pest-control-only current phase.

---

## Duplicate handling (both pipelines)

When a new capture or discovery matches an existing prospect above the fuzzy-match threshold:

- Do **not** auto-merge and do **not** silently create a duplicate.
- Flag the incoming record for rep review, surfaced in-app, with two explicit actions: **Merge** (fold new fields into the existing record, keeping edit history of what changed) or **Keep as separate** (create a distinct record anyway, for cases where the fuzzy match was wrong — e.g. two different businesses at the same strip-mall address).
- This applies identically whether the collision is capture-vs-capture, capture-vs-territory-auto, or territory-auto-vs-territory-auto.

## Notification logic

- Territory-discovered prospects push instantly, one notification per new record, to the rep(s) whose territory contains the location.
- This means high-volume jurisdictions (once Tier 2 sources come online) could generate notification noise — worth revisiting cadence per-jurisdiction later if reps start muting the app, but ship instant-per-record first since that's the explicit decision.

## Schema additions needed on the prospects table

**Standing principle for every step below: enrichment cascades run on new/incoming records only. Never bulk-run Pipeline A or B enrichment (Places, BizCollect, CAD, Comptroller) against the existing 1582+ historical rows without an explicit, separate, cost-scoped decision to do so.** A backfill job that "also enriches while it's at it" is an easy way to rack up unplanned API costs across paid sources (BizCollect, CAD's paid tier) — if a retroactive enrichment pass is ever wanted, it should be its own briefing with an explicit row count and cost estimate, not a side effect of building the pipeline.

- `source_type`: `card_scan` / `leadlock` / `manual` / `map_capture` / `territory_auto`
- `discovery_signal`: nullable, only set when `source_type = territory_auto`
- `confidence_score`: numeric, from the dedupe/match stage
- `duplicate_of`: nullable FK, set when a record is flagged and awaiting rep merge decision
- `enrichment_status`: tracks how far a record got through the cascade (useful for surfacing partially-enriched records when an API in the chain is down, per the audit findings)

**Note:** CAD parcel fields (square footage, year built, land use type, owner name) are a separate, later schema addition — likely a `property_details` JSONB column rather than individual typed columns, since the field set may need to grow as more counties/states are added and each source's exact fields vary. Don't fold this into the step-1 migration already drafted in `AGENT-BUILD-PROSPECT-SCHEMA.md`; scope it as its own migration when the CAD adapter is actually built (step 3b below). **Update: step 2's diagnostic found `propertyRecordsService.js` already exists and already distinguishes HCAD-verified data from an AI-estimate fallback via a `dataSource` field (`hcad` / `ai_estimate`), but that distinction was buried 3 levels deep in a raw lookup object and never reached the rep-facing UI. Fix in progress: a `property_records_source` column extracts this value, and a visible badge on ReviewScreen surfaces it. This is separate from step 3b (the still-unbuilt multi-county CAD adapter) — HCAD only covers Harris County; everywhere else still falls back to the AI estimate until 3b actually builds out statewide TxGIO coverage.**

---

## Suggested build sequence (separate briefings, not one big one)

1. Schema migration for the fields above
2. Refactor Pipeline A so manual entry enters the same cascade (biggest behavior change, smallest scope)
3. **Build the permits ingestion adapter** — `targetlens_permits` schema exists in both the LeadLens and Project Scarlett Supabase projects, but both are confirmed empty (0 rows). **This step targets the LeadLens project (`qkbvwryucaakkkqaqvka`) only** — Project Scarlett is the admin/beta-tracking backend (BetaTracker sessions, `beta_events`) and has no role in the enrichment stack. The matching empty schema in Scarlett is likely leftover scaffolding rather than intentional; confirm nothing references it before ignoring it, but don't build against it. This is not a "wire existing data in" step as originally assumed — there is no ingestion source feeding this table yet. Before any code is written, identify what data source the schema's fields (`work_class`, `upgrade_category`, `is_efficiency_related`) were originally designed against — likely a specific city/county building-permit or energy-efficiency-rebate data feed — since nothing in current documentation confirms what that source was supposed to be. Treat this as its own diagnostic pass, not an assumption to build on top of.
3b. CAD parcel data adapter (TxGIO free statewide feed) — dual-purpose: enrichment field source for Pipeline A, ownership-change signal for Pipeline B. Needs its own `property_details` schema addition (see above) before this can start. **Pipeline A (step 2) ships without CAD data first** — the enrich-details stage works with just Place Details + BizCollect initially, and CAD is added into that same stage as an additive source once 3b completes. 3b is not a blocker for step 2 going live.
4. Comptroller-based new-registration ingestion job (once the 405 fix ships) — **the 405 fix is a prerequisite for this step specifically, not for the build sequence overall. Steps 1, 2, 3, and 3b can all proceed independently of it.**
5. Dedupe/merge review UI (rep-facing — needed before territory-auto goes live, since flag-for-review depends on it)
6. Expo push wiring for territory discoveries
7. First Socrata adapter for whichever metro area is highest priority, as a template for future jurisdictions

This spec is the reference point for each of those briefings — each one should link back to the relevant section here rather than re-deriving the architecture.
