-- Migration: Add 'leased' to the prospect_type check constraint on targetlens_prospects
-- so the Occupancy Type filter can support Owner-Occupied / Rental / Leased.

alter table targetlens_prospects
  drop constraint if exists targetlens_prospects_prospect_type_check;

alter table targetlens_prospects
  add constraint targetlens_prospects_prospect_type_check
  check (prospect_type in ('new_homeowner','current_homeowner','rental','leased'));
