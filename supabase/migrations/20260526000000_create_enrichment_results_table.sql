-- Create enrichment_results table for 50-state lead enrichment system
-- Tracks enrichment data from state registries, Google Maps, websites, and other sources

CREATE TABLE IF NOT EXISTS enrichment_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  
  -- Address (multiple sources)
  address_google_maps TEXT,
  address_state_registry TEXT,
  address_verified BOOLEAN DEFAULT FALSE,
  
  -- Phone (multiple sources)
  phone_google_maps TEXT,
  phone_website TEXT,
  phone_verified BOOLEAN DEFAULT FALSE,
  
  -- Email (multiple sources)
  emails_domain_pattern TEXT[],
  emails_website TEXT[],
  emails_hunter TEXT[],
  emails_verified BOOLEAN DEFAULT FALSE,
  
  -- POC (Point of Contact)
  poc_name TEXT,
  poc_title TEXT,
  poc_linkedin_url TEXT,
  poc_verified BOOLEAN DEFAULT FALSE,
  
  -- Metadata
  enrichment_status TEXT DEFAULT 'pending', -- pending|in_progress|complete|failed
  enrichment_sources TEXT[], -- ['google_maps', 'state_registry', 'website_scrape', 'linkedin']
  enrichment_confidence INT, -- 0-100 score
  last_enriched_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(lead_id)
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_enrichment_lead_id ON enrichment_results(lead_id);
CREATE INDEX IF NOT EXISTS idx_enrichment_status ON enrichment_results(enrichment_status);
CREATE INDEX IF NOT EXISTS idx_enrichment_updated ON enrichment_results(updated_at);

-- Enable RLS for security
ALTER TABLE enrichment_results ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view enrichment results for their own leads
CREATE POLICY "Users can view enrichment results for their leads"
  ON enrichment_results FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM leads
      WHERE leads.id = enrichment_results.lead_id
      AND leads.user_id = auth.uid()
    )
  );

-- RLS Policy: Admin users can manage all enrichment results
CREATE POLICY "Admin can manage enrichment results"
  ON enrichment_results FOR ALL
  USING (
    auth.jwt() ->> 'role' = 'admin'
  );
