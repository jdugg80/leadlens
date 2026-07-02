# DIAGNOSIS: TerritoryMap Filter Rework

**Status:** Diagnosis only — no code changes.  
**Scope:** `TerritoryMapScreen.js`, LensSignals feed, TargetLens profile model, and underlying Supabase data sources for residential/commercial filter work.

---

## 1. Current `TerritoryMapScreen.js` Structure

### 1.1 Business / Homeowner top buttons (to be removed)
- **Location:** `src/screens/TerritoryMapScreen.js` lines 1147–1161.
- **Current implementation:** a `View` with `style={s.profileSwitcher}` containing two `TouchableOpacity` tabs labeled **“Business”** and **“Homeowner”**.
- **State bound:** `const [targetLensMode, setTargetLensMode] = useState('business');` (line 165).
- **Impact of removal:** moving the mode switch into the filter drawer is a pure UI refactor; the `targetLensMode` state variable and all downstream conditional rendering (homeowner data load, map layers, cards, filter chips) can stay in place.

### 1.2 Search bar placement
- **Current location:** lines 1172–1203, directly below the Business/Homeowner toggle.
- **Component:** a `TextInput` wrapped in `View style={s.searchBar}` with inline autocomplete suggestions.
- **Move to top:** straightforward — the search bar is already self-contained. Moving it above the map (but still under the screen header) only changes layout order; no logic changes.

### 1.3 Existing filter panel / drawer
- **Component:** `LeadFiltersBottomSheet` imported at line 122 and rendered at line 1494.
- **State:** `const [filtersVisible, setFiltersVisible] = useState(false);` (line 244).
- **Current content:** `LeadFiltersBottomSheet.js` is a full-screen-bottom `Modal` with:
  - Signals Only toggle
  - Business Type (single-select chip group: All, Food/Hospitality, Retail/Consumer, Industrial/Logistics, Office/Professional, Public/Facilities)
  - Lead Status (single-select)
  - Signals (multi-select: LensSignal, Contact Signal, Pest Indicator, Opening Signal, Priority)
  - Match Strength (single-select)
- **Verdict:** a reusable bottom-sheet filter panel already exists. The Residential/Commercial toggle and the new commercial/residential filter sets should be added inside this component rather than built from scratch.

### 1.4 Homeowner filter panel (current)
- **Component:** `HomeownerFilterPanel` imported at line 80 and rendered at lines 1163–1170.
- **Current controls:**
  - Ownership filter chips: All / New Owner / Current Owner / Rental
  - Lookback window: 30 / 60 / 90 / 120 Days
- **Verdict:** this panel is small and horizontally oriented. The spec’s expanded residential filters (Estimated Home Value, Approx. Square Footage, Occupancy Type, etc.) should probably move into the bottom sheet as well, replacing the inline `HomeownerFilterPanel` with a unified filter drawer.

### 1.5 Android-constraint conflicts

| Constraint | Current status in `TerritoryMapScreen.js` | Does the spec require violating it? |
|---|---|---|
| **No `Modal` components** | Already violated. `Modal` is used for `TargetLensProfileSelector` (line 1493) and `LeadFiltersBottomSheet` internally uses `Modal`. | No new Modal is required by the spec, but the existing filter drawer already uses Modal. If the project later wants to replace it with a non-Modal drawer, that is a larger refactor than this spec. |
| **No simultaneous `initialRegion` + `region` on `MapView`** | Clean. `MapView` uses only `initialRegion={region \|\| DEFAULT_TERRITORY_REGION}` (line 1210). No `region` prop is passed. | Not affected by the spec. |
| **`Circle` `onPress` unsupported on Android** | Clean. The `Circle` at line 1082 has no `onPress`. The `Polygon` at line 1074 uses `onPress`, which is supported. | Not affected by the spec. |

**Bottom line:** the proposed UI changes do not introduce new Android-constraint violations, but they do not resolve the existing Modal usage either.

---

## 2. LensSignals Feed / Component

### 2.1 Current signal-type filtering
- **Horizontal chip filter:** `LensSignalMapFilters.tsx` (`src/features/lenssignal/LensSignalMapFilters.tsx`).
- **Available chips:** LensSignal, Pest, Openings, Priority, Opportunity, Monitor, Good Standing.
- **State shape:** `showLensSignal`, `filterCompliance`, `filterOpening`, `filterPest`, `filterPriorityReview`, `filterOpportunity`, `filterMonitor`, `filterGoodStanding`.
- **Usage:** These are used to filter rendered `lensSignalRecords` on the map. They are not currently connected to the `LeadFiltersBottomSheet`.

### 2.2 Data fetch
- **Service:** `lensSignalService.ts` (`src/services/lensSignal/lensSignalService.ts`).
- **Flow:**
  1. Resolves jurisdictions from viewport via reverse geocoding.
  2. Checks `LENS_SIGNAL_SOURCES` in `lensSignalSourceRegistry.ts` for coverage.
  3. Calls `fetchLensSignalNearby(lat, lng, radiusMiles)` in `lenssignalApi.ts`.
  4. The API calls the Supabase RPC `get_lenssignal_nearby` against the `lenssignal_records` table.
- **Current signal categories in schema:** `lenssignal_records` supports `signal_layer` (Compliance / Opening / Standard), `score`, `grade`, `alert_level`, `pest_indicator`, `opening_status`, `permit_type`, `permit_date`.
- **Verdict:** the commercial signal split (Compliance vs Opening vs Ownership Change) is partially supported. The residential signal split is not yet sourced — the service only reads `lenssignal_records` and `lens_signals`, which are currently commercial/permit/health-code oriented.

### 2.3 Signal display
- **Card:** `LensSignalDetailsCard.tsx` renders compliance/opening details.
- **Map markers:** `LensSignalMapMarker.tsx` / `LensSignalMapMarker.js`.
- **Badge:** `LensSignalBadge.tsx`.

---

## 3. Data Feasibility for New Residential Filters

### 3.1 Tables inspected

| Table | Source file | Fields relevant to spec | Status |
|---|---|---|---|
| `targetlens_prospects` | `supabase/migrations/20260531000000_create_targetlens_tables.sql` lines 1–36 | `home_value_estimated`, `home_value_assessed`, `home_sq_footage`, `property_class`, `use_code`, `homestead_exemption`, `deed_transfer_date`, `prospect_type`, `upgrade_signals` | ✅ Exists |
| `targetlens_property_tax` | same file lines 54–73 | `appraised_value`, `land_value`, `improvement_value`, `sq_footage`, `year_built`, `property_class_code`, `exemptions` | ✅ Exists |
| `targetlens_mls_listings` | same file lines 85–107 | `list_price`, `close_price`, `close_date`, `sq_footage`, `property_type`, `seller_name`, `buyer_name` | ✅ Exists |
| `targetlens_permits` | — | building / renovation / new-construction permits | ❌ Not found in any migration or seed file |

### 3.2 Field-by-field feasibility

| Spec filter | Available field(s) | Table | Notes / gaps |
|---|---|---|---|
| **Estimated Home Value** | `home_value_estimated` (numeric), `home_value_assessed` (numeric) | `targetlens_prospects` | ✅ Directly available. `targetlens_property_tax.appraised_value` and `targetlens_mls_listings.close_price` can also be used as cross-checks. |
| **Approx. Square Footage** | `home_sq_footage` (integer) | `targetlens_prospects` | ✅ Directly available. Also `targetlens_property_tax.sq_footage` and `targetlens_mls_listings.sq_footage`. |
| **Occupancy Type** — Owner-Occupied / Rental / Leased | `prospect_type` text CHECK constraint: `('new_homeowner','current_homeowner','rental')` | `targetlens_prospects` | ⚠️ Partially available. `new_homeowner` and `current_homeowner` both map to **Owner-Occupied**. `rental` maps to **Rental**. **There is no `leased` value** in the current schema or seed data. Implementing the spec’s three categories requires either (a) a schema migration to add a new `occupancy_type` or `prospect_type` value, or (b) deriving “Leased” from `property_class`/`use_code`/`exemptions` heuristics. |
| **New Homeowner** (deed transfer) | `deed_transfer_date`, `prospect_type = 'new_homeowner'`, `days_since_transfer` | `targetlens_prospects` | ✅ Directly available. Current query already filters by `prospect_type`. |
| **Building/Renovation Permit** | — | `targetlens_permits` | ❌ Table does not exist. Would need to build schema + ingestion pipeline from county/city open data. |
| **New Construction Permit** | — | `targetlens_permits` | ❌ Same gap as above. |

### 3.3 `targetlens_property_tax` and occupancy derivation
- `exemptions` is stored as `jsonb` — could contain `homestead`, `over-65`, `disabled`, etc. Homestead presence strongly implies owner-occupied.
- `property_class_code` could be used to distinguish single-family, multi-family, commercial, etc.
- **Conclusion:** “Leased” is not currently derivable with confidence. The spec should either drop the third category or require a schema migration.

---

## 4. Compliance / Health-Code Data Coverage for TX / LA / MA

### 4.1 Current data sources
- **Registry:** `src/services/lensSignal/lensSignalSourceRegistry.ts` (`LENS_SIGNAL_SOURCES`).
- **Coverage today:**

| State | Jurisdictions | Signal types | Status |
|---|---|---|---|
| **TX** | Harris County, City of Houston, Fort Bend County, Brazoria County, Texas Statewide (openings) | compliance (health inspections), openings (permits, sales-tax) | ✅ Partially built — but only Houston metro + statewide openings |
| **LA** | — | — | ❌ No sources configured |
| **MA** | — | — | ❌ No sources configured |

### 4.2 Realistic assessment
- **TX:** The schema and ingestion placeholders exist, but the actual ingestion pipelines are not in the repo. Sources are hardcoded URLs with `queryMethod: 'api'` and no fetch implementation. The `lenssignal_records` table is the read path, but populating it is an external data-engineering task.
- **LA / MA:** No source registry entries, no migrations, no seed data. Health-code and permit open-data portals vary by parish/city (LA) and by town/city (MA). Realistic coverage would require identifying each jurisdiction’s API/Socrata/ArcGIS endpoint and building per-source parsers.
- **Health-code violations:** The current schema only has generic `violation_text` / `pest_details` / `compliance_findings`. “Health Code Violations” as a first-class filter would require a more structured field or parsing logic.
- **Verdict:** TX coverage is aspirational but scaffolded. LA and MA are **unrealistic for the current build** unless data-engineering time is allocated separately.

---

## 5. Google Places `types` → Commercial Taxonomy Mapping

### 5.1 Existing mapping
- **File:** `src/utils/nearbySearch.js`.
- **Buckets:** `BUSINESS_TYPE_BUCKETS` (lines 70–77) and `BUCKET_MAPPING` (lines 79–103).
- **Current buckets:**
  - Food / Hospitality
  - Retail / Consumer
  - Industrial / Logistics
  - Office / Professional
  - Public / Facilities
- **Function:** `classifyGooglePlace(place)` maps `place.types` / `place.primaryType` to a bucket.

### 5.2 Gap vs. spec
| Spec bucket | Current mapping | Gap |
|---|---|---|
| Food & Hospitality | Food / Hospitality | ✅ aligned |
| Retail | Retail / Consumer | ✅ aligned (just rename) |
| Office & Professional | Office / Professional | ✅ aligned |
| Industrial & Logistics | Industrial / Logistics | ✅ aligned |
| Multi-Family & Residential-Adjacent | `apartment_building` is currently under **Public / Facilities** | ⚠️ needs its own bucket and type mapping |
| Institutional | `school`, `hospital`, `government_office`, `church`, `courthouse` under **Public / Facilities** | ⚠️ needs to split out from Public/Facilities |
| Other (Auto, Agricultural) | `car_repair`, `farm`, `ranch` are scattered across Retail/Consumer and Industrial/Logistics | ⚠️ needs explicit “Other” fallback |

### 5.3 Raw type coverage
- The current mapping uses only ~30 raw types. The spec notes ~90 Google Places raw types. The existing mapping is **directionally correct but incomplete**; expanding to the full taxonomy is straightforward type-list work, not a structural change.

### 5.4 Rating field availability
- `searchGooglePlacesByText` already fetches `places.rating` and `places.userRatingCount` (line 278).
- `searchGooglePlacesNew` (nearby search) does **not** currently request rating in its field mask (line 230).
- **Verdict:** a “Business Rating min stars” filter is feasible but requires updating the nearby-search field mask to include `rating` and `userRatingCount`, and updating the normalization functions to expose them.

---

## 6. Per-Profile Default Toggle State Feasibility

### 6.1 Existing schema
- **File:** `src/config/targetLensProfiles.ts`.
- **Interface:** `TargetLensProfile` has:
  - `division: 'Commercial' | 'Residential' | 'Mixed'`
  - `suggestedFilters: Record<string, any>`
  - `category`, `label`, `primaryProspectTypes`, etc.

### 6.2 Natural place for the default
- **Option A (recommended):** add a new field to `TargetLensProfile`, e.g. `defaultMode: 'commercial' | 'residential'` or `defaultPropertyType: 'Commercial' | 'Residential'`.
- **Option B:** reuse `suggestedFilters` with a key such as `suggestedFilters.defaultMode` or `suggestedFilters.propertyType`.
- **Feasibility:** both are trivial. `TargetLensProfileSelector.tsx` already loads/saves the active profile to `AsyncStorage` (`TARGET_LENS_PROFILES_KEY`). The map screen can read the saved profile and set `targetLensMode` from the profile’s default on mount.
- **Current behavior:** `TerritoryMapScreen.js` loads the saved profile (lines 228–242) but always defaults `targetLensMode` to `'business'`. Changing that to use the profile’s default is a small state-initialization change.

### 6.3 Caveat
- `division` is currently `Commercial` / `Residential` / `Mixed`. Profiles with `Mixed` division need an explicit override (e.g. `defaultMode`) because `division` alone does not always imply a UI default.

---

## 7. Summary of Feasibility

| Area | Feasibility | Notes |
|---|---|---|
| UI refactor (move toggle, move search, extend filter drawer) | ✅ High | Existing components `LeadFiltersBottomSheet` and `HomeownerFilterPanel` can be reused/extended. |
| Residential/Commercial toggle + per-profile default | ✅ High | Add `defaultMode` to `TargetLensProfile`; initialize state from saved profile. |
| Universal commercial filters (status, distance, rating, contact completeness, activity date, signals) | ✅ High | Distance and status are already partly in place; rating needs field-mask update. |
| Universal residential filters (status, distance, activity date, new since scan) | ✅ High | Reuse commercial filter logic. |
| Residential-specific filters (home value, sq footage, occupancy) | ⚠️ Medium | Home value and sq footage exist. Occupancy needs schema work for “Leased” or a spec concession to two categories. |
| Residential signal filters (new homeowner, permits) | ⚠️ Medium / Low | New homeowner is ready. Building/renovation/new-construction permits require a new `targetlens_permits` table and ingestion pipeline. |
| Commercial signal filters (compliance, openings, ownership, health-code, compliance score) | ⚠️ Medium | Schema supports compliance/opening. Health-code violations and ownership changes need more structured fields or parsing. |
| Compliance data for TX | ⚠️ Medium | Scaffolded but not fully populated; ingestion pipeline is external. |
| Compliance data for LA / MA | ❌ Low | No sources, no schema, no ingestion. Not realistic for current build. |
| Google Places taxonomy mapping | ✅ High | Existing `BUCKET_MAPPING` covers most buckets; needs expansion for Multi-Family, Institutional, Other. |
| Android constraints | ⚠️ Medium | No new violations, but existing Modal usage in filter drawer/target-lens selector remains. |

---

## 8. Recommended Next Steps (awaiting build briefing)

1. **Decide on occupancy categories:** either add a `leased` value to `targetlens_prospects.prospect_type` or revise the spec to Owner-Occupied / Rental only.
2. **Decide on LA/MA scope:** defer compliance/health-code coverage for LA/MA to a future phase, or allocate separate data-engineering time.
3. **Confirm `targetlens_permits` table:** if Building/Renovation/New-Construction permits are required, design the schema and ingestion source before UI work.
4. **Define structured signal fields:** add explicit columns for `health_code_violations`, `ownership_change_date`, and `compliance_score` thresholds to `lenssignal_records` if those filters are required.
5. **Update Google Places field mask:** include `rating` and `userRatingCount` in the nearby search path so the Business Rating filter has data.
6. **Profile schema update:** add `defaultMode: 'commercial' | 'residential'` to `TargetLensProfile` and use it to initialize `targetLensMode`.

---

*No files were modified in this diagnostic pass.*
