-- Add signal_type column to lens_signals table if it doesn't exist
ALTER TABLE lens_signals ADD COLUMN IF NOT EXISTS signal_type text;

-- Populate signal_type based on existing data:
-- Priority: new_opening > pest_indicator > compliance > health_code
UPDATE lens_signals
SET signal_type = 
  CASE 
    WHEN is_new_opening = true THEN 'new_opening'
    WHEN has_pest_indicator = true THEN 'pest'
    WHEN compliance_level IS NOT NULL THEN 'compliance'
    WHEN compliance_source IS NOT NULL THEN 'health_code_violation'
    ELSE 'general'
  END
WHERE signal_type IS NULL;

-- Add index for signal_type queries
CREATE INDEX IF NOT EXISTS lens_signals_signal_type_idx ON lens_signals(signal_type);

-- Ensure new records have signal_type populated
-- This is handled by the application logic setting signal_type based on the specific signal
