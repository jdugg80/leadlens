// src/config/prospectVerticals.js
//
// Vertical options for "Prospect Around". Now derived from businessVerticals.js -- the same
// list the filter chips and result classification use -- so a vertical means the same thing
// everywhere. Each vertical's `types` are real Google Places API (New) Table A types, sent
// directly to Nearby Search's `includedTypes` (max 50 per request; the largest vertical has 35).
//
// Filtering happens server-side (the actual API request), not as a client-side post-filter --
// the deliberate fix for the bug class found on 2026-09-25: a client-side filter can silently
// zero out real results with no visible reason why. A server-side type filter can't do that --
// if Google returns zero, that's a real, honest answer.

import { BUSINESS_VERTICALS } from './businessVerticals';

export const PROSPECT_VERTICALS = [
  {
    id: 'any',
    label: 'Any Business',
    includedTypes: [], // empty = omit `includedTypes` entirely (Google returns all types)
  },
  ...BUSINESS_VERTICALS.map((v) => ({ id: v.id, label: v.name, includedTypes: v.types })),
];

export function getProspectVerticalById(id) {
  return PROSPECT_VERTICALS.find((v) => v.id === id) || PROSPECT_VERTICALS[0];
}

export default PROSPECT_VERTICALS;
