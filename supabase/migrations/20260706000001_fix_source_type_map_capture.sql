-- Migration: Fix source_type — reclassify rep-driven map captures
-- Date: 2026-07-06
-- Context: The initial capture_method -> source_type mapping incorrectly folded
-- rep-initiated TerritoryMap actions (LensSignal, map-prospect, Nearby Search)
-- into territory_auto. These are rep-driven adds through the existing map/search
-- UI, not automated background discovery. Reclassify to map_capture.

-- Reclassify 11 rows from territory_auto to map_capture
UPDATE prospects
SET source_type = 'map_capture'
WHERE source_type = 'territory_auto'
  AND capture_method IN ('LensSignal', 'map-prospect', 'Nearby Search');

-- Verify: territory_auto should now be 0 rows, map_capture should be 11
SELECT source_type, count(*) FROM prospects
WHERE source_type IN ('territory_auto', 'map_capture')
GROUP BY source_type;
