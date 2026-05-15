ALTER TABLE prospects
ADD COLUMN IF NOT EXISTS collected_at timestamptz,
ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
ADD COLUMN IF NOT EXISTS last_edited_at timestamptz,
ADD COLUMN IF NOT EXISTS queue_status text DEFAULT 'new',
ADD COLUMN IF NOT EXISTS queue_sort_group integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS viability_score integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS viability_label text,
ADD COLUMN IF NOT EXISTS missing_viability_fields jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS shade_key text;