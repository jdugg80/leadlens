-- Migration: Create business_data table for LeadLock pipeline
-- Stores enriched business records from Google Places and other public sources.

CREATE TABLE IF NOT EXISTS public.business_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source TEXT NOT NULL DEFAULT 'google_places',
    place_id TEXT UNIQUE,
    business_name TEXT NOT NULL,
    formatted_address TEXT,
    street_number TEXT,
    street_name TEXT,
    city TEXT,
    state TEXT,
    zip_code TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    phone TEXT,
    website TEXT,
    email TEXT,
    types TEXT[],
    primary_type TEXT,
    business_status TEXT,
    rating NUMERIC,
    user_rating_count INTEGER,
    pest_risk_score INTEGER,
    pest_indicators TEXT[],
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Performance indexes for LeadLock zip/location lookups
CREATE INDEX IF NOT EXISTS idx_business_data_zip_code ON public.business_data(zip_code);
CREATE INDEX IF NOT EXISTS idx_business_data_place_id ON public.business_data(place_id);
CREATE INDEX IF NOT EXISTS idx_business_data_city ON public.business_data(city);
CREATE INDEX IF NOT EXISTS idx_business_data_state ON public.business_data(state);
CREATE INDEX IF NOT EXISTS idx_business_data_business_name ON public.business_data USING gin (to_tsvector('english', business_name));
CREATE INDEX IF NOT EXISTS idx_business_data_coords ON public.business_data USING gist (point(longitude, latitude));

-- Enable Row Level Security
ALTER TABLE public.business_data ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read business_data (shared reference data for reps)
CREATE POLICY "Authenticated users can read business_data"
  ON public.business_data
  FOR SELECT
  TO authenticated
  USING (true);

-- Service role can do everything (used by Edge Functions / backend enrichment)
CREATE POLICY "Service role can manage business_data"
  ON public.business_data
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Anonymous read-only access is intentionally disabled.
-- If you need public reads, create a separate, limited policy.

-- Trigger function for updated_at
CREATE OR REPLACE FUNCTION update_business_data_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger
DROP TRIGGER IF EXISTS update_business_data_updated_at ON public.business_data;
CREATE TRIGGER update_business_data_updated_at
    BEFORE UPDATE ON public.business_data
    FOR EACH ROW
    EXECUTE FUNCTION update_business_data_updated_at();

-- Comments for documentation
COMMENT ON TABLE public.business_data IS 'Enriched business records from Google Places and LeadLock pipelines.';
COMMENT ON COLUMN public.business_data.zip_code IS 'US ZIP code used for territory and pipeline lookups.';
COMMENT ON COLUMN public.business_data.place_id IS 'Google Places (or other source) place identifier.';
