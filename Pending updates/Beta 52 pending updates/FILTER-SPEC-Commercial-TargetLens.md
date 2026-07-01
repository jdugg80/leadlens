# Prospect Filter Spec — TerritoryMap & LensSignals (Commercial + Residential)

> For future implementation. Covers universal filters, commercial + residential property type taxonomies, and LensSignals filters for both prospect types.

---

## 0. Residential/Commercial Toggle — Recommended Approach

**Toggle lives inside the filter panel**, not as standalone buttons at the top of the map. See Section 0a below for the full layout context — the old "Business"/"Homeowner" top buttons are being removed in favor of a direct search bar, so the toggle is relocated to the first control inside the filter panel/drawer rather than eliminated.

**Why this approach over alternatives:**
- Two fully separate filter panels = duplicated UI, more maintenance surface, fragments the rep's mental model
- No toggle, profile-locked to one type = breaks for verticals that legitimately work both sides (HVAC, security) — would need retrofitting later anyway
- Auto-detecting from search results = doesn't help before a search has returned something, so it can't be the sole mechanism
- Toggle inside filter panel + conditional rendering below it = one state variable, minimal UI footprint, scales cleanly as new verticals are added, and doesn't require map-top real estate

**Implementation note:** Toggle position likely needs to persist per-session (or per-profile default) so reps don't have to reset it every time they open the map.

---

## 0a. TerritoryMap Layout Update

**Change:** Remove the "Business" / "Homeowner" buttons currently at the top of the map. Move the search bar to the top for direct search access.

**Resulting layout:**
- **Top of map:** Search bar (direct address/business search)
- **Existing map buttons:** Remain in place, unchanged
- **Filter panel/drawer:** Now contains the Residential/Commercial toggle as its first control, with the rest of the filter set (universal + conditional residential/commercial filters) rendering beneath it based on toggle state

**Why this works:** Keeps the map top clean and search-first, without losing the filter-logic dependency the rest of this spec is built around — every residential/commercial filter split documented below still needs *something* to switch between filter sets, and that job now belongs to the toggle inside the filter panel instead of the removed top buttons.

---

## 1. TerritoryMap — Universal Prospect Filters

Designed to work identically across all 11 TargetLens verticals (no vertical-specific config needed).

| Filter | Type | Notes |
|---|---|---|
| Prospect Status | Multi-select | New/Uncontacted, Contacted, Follow-Up Needed, Customer, Not Interested, Do Not Contact — pulled from CRM pipeline data |
| Distance / Radius | Slider/presets | 0.5mi / 1mi / 3mi / 5mi |
| Business Rating (min stars) | Slider/threshold | Pulled from Google Places |
| Contact Completeness | Toggle | Has phone / enriched vs. not yet enriched |
| Last Activity Date | Multi-select | Never contacted / 7-30-90 days / stale (90+) |
| *(Optional)* New Since Last Scan | Toggle | Surfaces businesses new since rep's last pass |

**Deliberately excluded:** category/business-type tags — these are vertical-specific and would break cross-profile reuse. Handle separately (see Section 2).

---

## 1a. TerritoryMap — Residential Adjustments

When toggle is set to Residential, swap the following filters (universal filters above remain unchanged):

| Filter | Commercial version | Residential version |
|---|---|---|
| Business Rating (min stars) | Google Places rating | **Replaced** — no public rating for homes |
| *(new)* | — | **Estimated Home Value** — slider/min-max threshold |
| *(new)* | — | **Approx. Square Footage** — slider/min-max threshold |
| *(new)* | — | **Occupancy Type** — multi-select: Owner-Occupied / Rental (Tenant-Occupied) / Leased — if determinable from property records |

All other universal filters (Status, Distance, Contact Completeness, Last Activity, New Since Last Scan) apply identically to residential.

**Occupancy Type note:** This matters beyond just filtering — it affects who the rep should actually be pitching. Owner-Occupied means the resident is the decision-maker. Rental means the tenant isn't the decision-maker (the landlord/property owner is), so reps may want to skip or handle differently. Leased is worth keeping distinct from Rental if it maps to a different contract-holder scenario (e.g., corporate lease, lease-to-own) in your data — otherwise consider merging Rental and Leased into one category to keep it simple. **Decide before build** whether this distinction is meaningful enough in your data source to justify three categories vs. two.

---

## 2. Commercial Property Type Taxonomy

For classifying prospects by business/property type. Intended to map from Google Places `types` field down into these buckets.

**Food & Hospitality**
- Restaurants / Food Service
- Hotels / Motels
- Bars / Nightlife

**Retail**
- Retail Stores (general)
- Shopping Centers / Strip Malls

**Office & Professional**
- Office Buildings
- Medical / Professional Offices (clinics, dental, legal, etc.)

**Multi-Family & Residential-Adjacent**
- Multi-Family (apartments, condos)
- Assisted Living / Senior Living *(consider merging with Multi-Family unless pitch/compliance differs enough to warrant separation)*

**Industrial & Logistics**
- Warehouses / Distribution
- Manufacturing / Industrial

**Institutional**
- Schools / Educational
- Government / Municipal
- Religious Facilities

**Other**
- Auto (dealerships, repair shops, gas stations) — *low volume, keep only if a specific profile needs it*
- Agricultural / Rural Commercial — *low volume, keep only if a specific profile needs it*

**To-do before build:** Pull Google Places' actual `types` taxonomy (~90 raw types) and map to these buckets.

---

## 2a. Residential Property Type Taxonomy

Shorter list than commercial — covers nearly everything a door-to-door rep encounters residentially.

- Single-Family Home
- Multi-Family (2–4 units)
- Condo / Townhouse
- Mobile / Manufactured Home
- New Construction *(kept separate — pre-emptive pitch vs. replacing/upgrading existing service is a distinct sales motion)*

---

## 3. LensSignals — Commercial Signal Filters (Simplified)

Real-time feed filters, focused on actionable events rather than static prospect attributes.

**Signal Type (multi-select checkboxes):**
- ☐ New Business Openings (permit-based, pre-launch or recently opened)
- ☐ Ownership Changes (new owner/operator on file)
- ☐ Health Code Violations (flagged inspection issues)
- Compliance Score / Rating — **slider/min threshold** (not checkbox, since it's a score not an event)
- Star Rating (Google/Yelp) — **slider/min threshold**

**Design notes:**
- Compliance Score and Star Rating use threshold sliders (e.g., "show compliance scores below 80") since reps want to surface struggling businesses, not just flag score existence.
- **Data availability caveat:** Compliance score publication varies by jurisdiction. Some cities (e.g., NYC) publish clean numeric/letter grades; many don't publish structured data at all. Filter should show "No Data" state rather than silently omitting businesses, so reps don't mistake missing data for a clean record.
- **Action item:** Verify what TX, LA, and MA (current beta states) actually expose for health/compliance data before finalizing this as a core filter — coverage may be inconsistent across states.

---

## 3a. LensSignals — Residential Signal Filters

Replaces health code/compliance signals entirely when toggle is set to Residential.

**Signal Type (multi-select checkboxes):**
- ☐ New Homeowner (recent sale/deed transfer — high value across nearly every vertical, since new owners are actively shopping for service providers)
- ☐ Building/Renovation Permit (roof, pool, addition, fence — need signaled depends on vertical)
- ☐ New Construction Permit (property still being built — pre-emptive outreach opportunity)
- Estimated Home Value — **slider/min-max threshold** (replaces Compliance Score/Star Rating as the "quality" signal)

**Does NOT carry over from commercial:** Health Code Violations, Compliance Score. "Ownership Changes" is reframed as "New Homeowner" since it's centered on the sale event rather than a business entity change.

---

## Open Questions for Later

- Should Signal Type categories be one universal enum across all 11 verticals, or per-profile subsets (e.g., pest control wouldn't care about electrical permits)? Affects whether this is a shared enum or a per-profile config table.
- Decide whether vertical-specific filter *presets* (default radius, rating threshold, etc.) are needed on top of the universal TerritoryMap filters.
- Confirm data source for Estimated Home Value and Approx. Square Footage (county appraisal records? third-party API?) and check coverage/reliability across TX, LA, MA before building the filter UI.
- Decide default toggle state per TargetLens profile (e.g., pest control likely defaults to Residential, HVAC might default to a 50/50 split) and whether reps can override that default.
- Confirm data source for Occupancy Type (Owner-Occupied/Rental/Leased) — likely county property/tax records — and whether Rental vs. Leased is a meaningful distinction in that data or should be collapsed into two categories instead of three.
