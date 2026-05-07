-- Create table for Texas Comptroller business records
CREATE TABLE IF NOT EXISTS public.comptroller_business_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source TEXT DEFAULT 'texas_comptroller',
    signal_type TEXT NOT NULL,
    taxpayer_id TEXT,
    location_number TEXT,
    business_name TEXT,
    location_name TEXT,
    street TEXT,
    city TEXT,
    state TEXT,
    zip TEXT,
    permit_start_date DATE,
    permit_end_date DATE,
    permit_status TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    badge TEXT,
    priority TEXT,
    raw_payload JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_comptroller_zip ON public.comptroller_business_records(zip);
CREATE INDEX IF NOT EXISTS idx_comptroller_taxpayer_id ON public.comptroller_business_records(taxpayer_id);
CREATE INDEX IF NOT EXISTS idx_comptroller_permit_start_date ON public.comptroller_business_records(permit_start_date);
CREATE INDEX IF NOT EXISTS idx_comptroller_signal_type ON public.comptroller_business_records(signal_type);

-- Enable Row Level Security
ALTER TABLE public.comptroller_business_records ENABLE ROW LEVEL SECURITY;

-- Simple Authenticated Policies
CREATE POLICY "Authenticated users can select comptroller records"
ON public.comptroller_business_records
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert comptroller records"
ON public.comptroller_business_records
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update comptroller records"
ON public.comptroller_business_records
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Add a trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_comptroller_business_records_updated_at
    BEFORE UPDATE ON public.comptroller_business_records
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();
