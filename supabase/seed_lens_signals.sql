-- Seed data for LensSignal testing
-- Area: San Antonio near 29.5321, -98.4936

-- 1. Compliance Signal (Pest Warning)
insert into lenssignal_records (
  establishment_name,
  signal_layer,
  alert_level,
  score,
  pest_indicator,
  pest_terms,
  violation_text,
  latitude,
  longitude,
  source_name,
  is_seed_data
) values (
  'Test Taco Shop',
  'Compliance Signal',
  'Priority Review',
  78,
  true,
  array['roach'],
  'Observed roach activity near food prep area.',
  29.5321,
  -98.4936,
  'Local Health Dept',
  true
);

-- 2. Opening Signal
insert into lenssignal_records (
  establishment_name,
  signal_layer,
  alert_level,
  opening_status,
  permit_type,
  latitude,
  longitude,
  source_name,
  is_seed_data
) values (
  'Future Coffee Spot',
  'Opening Signal',
  'Opportunity',
  'Pre-Opening',
  'Food Permit Activity',
  29.5331,
  -98.4926,
  'City Planning',
  true
);

-- 3. Clean Compliance Signal
insert into lenssignal_records (
  establishment_name,
  signal_layer,
  alert_level,
  score,
  pest_indicator,
  latitude,
  longitude,
  source_name,
  is_seed_data
) values (
  'Clean Test Cafe',
  'Compliance Signal',
  'Good Standing',
  96,
  false,
  29.5311,
  -98.4946,
  'Local Health Dept',
  true
);

-- Test Query to verify:
/*
select *
from public.get_lenssignal_nearby(
  29.5321,
  -98.4936,
  10,
  null
);
*/
