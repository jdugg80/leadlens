// src/config/prospectVerticals.js
//
// Vertical options for "Prospect Around" -- each maps to real Google Places API
// (New) types, sent directly to Nearby Search's `includedTypes` param server-side.
// Deliberately NOT the classifyGooglePlace/BUSINESS_TYPE_BUCKETS system (used by the
// general map filter panel) and NOT the TargetLensProfile system (Phase 1, in
// progress, meant for a future multi-industry pivot -- its categories are for
// fuzzy/keyword matching across trades, not real Places API type values).
//
// The type list itself is grounded in PEST_PLACE_TYPES from signal-ingest's
// index.ts -- an already-proven, already-vetted set of pest-control-relevant
// Google types -- just split into named verticals a rep can pick between,
// instead of one undifferentiated bucket.
//
// Filtering happens server-side (the actual API request), not as a client-side
// post-filter -- this is the deliberate fix for the exact bug class found on
// 2026-09-25: a client-side filter can silently zero out real results with no
// visible reason why. A server-side type filter can't do that -- if Google
// returns zero, that's a real, honest answer.

export const PROSPECT_VERTICALS = [
  {
    id: 'any',
    label: 'Any Business',
    includedTypes: [], // empty = omit `includedTypes` entirely (Google returns all types)
  },
  {
    id: 'food_service',
    label: 'Restaurants & Food Service',
    includedTypes: ['restaurant', 'food', 'bakery', 'bar', 'cafe', 'meal_delivery', 'meal_takeaway', 'night_club'],
  },
  {
    id: 'hospitality',
    label: 'Hotels & Lodging',
    includedTypes: ['lodging'],
  },
  {
    id: 'healthcare',
    label: 'Healthcare & Pharmacy',
    includedTypes: ['hospital', 'health', 'pharmacy'],
  },
  {
    id: 'education',
    label: 'Schools',
    includedTypes: ['school'],
  },
  {
    id: 'grocery_retail',
    label: 'Grocery & Convenience',
    includedTypes: ['grocery_or_supermarket', 'supermarket', 'convenience_store'],
  },
];

export function getProspectVerticalById(id) {
  return PROSPECT_VERTICALS.find((v) => v.id === id) || PROSPECT_VERTICALS[0];
}

export default PROSPECT_VERTICALS;
