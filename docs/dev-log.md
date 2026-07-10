# Development Log

## BETA-57 - 2026-07-09

### LeadLock Camera ZIP Acquisition UX
- Capture gated until ZIP resolves; centered acquisition overlay
- Solid-orbiting-dots dual animation (replaced border-arc technique)
- 18s timeout + retry, header restructured as siblings of CameraView (fixed Android rendering bug)
- ZIP badge restored in header once acquired

### Property Records Source Labeling
- Fallback-safe source resolution added to ReviewScreen
- Lightweight HCAD vs. AI-estimate badge added to ProspectQueueScreen modal

### Pipeline A Manual Entry Enrichment
- Manual entry now fires `enrichBusinessWithPublicSources()` after save
- Race-condition-safe merge-back: re-reads current storage state before writing

## BETA-56 - 2026-07-09

### Beta Feedback System
- Built and wired BetaFeedbackScreen and BetaFeedbackFAB components
- Feedback posts to Project Scarlett Supabase (dlntgyhfxxbcwwcxaorn) feedback_reports table
- Fixed user field mapping: repEmail/repName instead of email/name
- Fixed Scarlett feedback_reports RLS — added SELECT policy so Unity Core can read submissions
- AI error triage system live — triage-error Edge Function + PostgreSQL trigger on beta_events
- error_triage table created in Scarlett project

## 2026-07-08

- **Milestone: First successful LeadLock usage** — End-to-end LeadLock photo capture pipeline verified and working today.
  - Address field preserved from detected business all the way to the ProspectQueue card.
  - Address persisted through MMKV/AsyncStorage round-trip and mapped to Supabase `prospects.address`.
  - Live schema migration applied; `scripts/testLeadLockAddressFlow.js` passes.
- Global themed toast provider implemented and simple Alert notifications replaced across support and capture screens.
- TerritoryMap ZIP boundary re-render on mode toggle fixed.
- ProspectQueue scrollable filter panel added.
- SettingsScreen broken backendSync imports removed; full lint clean.

## 2026-04-12

- Created project structure
- Added starter documentation
- Prepared repository for Git tracking
- Defined initial purpose and milestone direction
