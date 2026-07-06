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
2. **Extract and structure** (Claude) — OCR + structured parse for card/photo captures. For manual entry, this stage is a pass-through (already structured) or a light normalization pass (address formatting, business name cleanup).
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
- **Tier 1 — existing internal data**: `targetlens_permits` (building/construction permits) — already ingested, just needs the discovery pipeline wired to read from it instead of only powering TerritoryMap filters directly.
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

- `source_type`: `card_scan` / `leadlock` / `manual` / `territory_auto`
- `discovery_signal`: nullable, only set when `source_type = territory_auto`
- `confidence_score`: numeric, from the dedupe/match stage
- `duplicate_of`: nullable FK, set when a record is flagged and awaiting rep merge decision
- `enrichment_status`: tracks how far a record got through the cascade (useful for surfacing partially-enriched records when an API in the chain is down, per the audit findings)

**Note:** CAD parcel fields (square footage, year built, land use type, owner name) are a separate, later schema addition — likely a `property_details` JSONB column rather than individual typed columns, since the field set may need to grow as more counties/states are added and each source's exact fields vary. Don't fold this into the step-1 migration already drafted in `AGENT-BUILD-PROSPECT-SCHEMA.md`; scope it as its own migration when the CAD adapter is actually built (step 3b below).

---

## Suggested build sequence (separate briefings, not one big one)

1. Schema migration for the fields above
2. Refactor Pipeline A so manual entry enters the same cascade (biggest behavior change, smallest scope)
3. Wire `targetlens_permits` into the territory discovery job (data already exists)
3b. CAD parcel data adapter (TxGIO free statewide feed) — dual-purpose: enrichment field source for Pipeline A, ownership-change signal for Pipeline B. Needs its own `property_details` schema addition (see above) before this can start.
4. Comptroller-based new-registration ingestion job (once the 405 fix ships)
5. Dedupe/merge review UI (rep-facing — needed before territory-auto goes live, since flag-for-review depends on it)
6. Expo push wiring for territory discoveries
7. First Socrata adapter for whichever metro area is highest priority, as a template for future jurisdictions

This spec is the reference point for each of those briefings — each one should link back to the relevant section here rather than re-deriving the architecture.
