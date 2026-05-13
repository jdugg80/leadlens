-- PHASE 1: LEADLOCK MATCHING BRAIN - RPC (TYPE COMPATIBILITY FIX)
-- Adjusts for TEXT-based IDs in prospects and lens_signals

create or replace function match_leadlock_capture(
  p_capture_id uuid,
  p_radius_meters integer default 250
)
returns table (
  match_id text, -- Changed to text
  match_type text,
  name text,
  address text,
  total_score numeric,
  match_details jsonb
) language plpgsql as $$
declare
  v_cap record;
begin
  select * into v_cap from leadlock_captures where id = p_capture_id;
  if v_cap is null then raise exception 'Capture not found'; end if;
  if v_cap.user_id != auth.uid() then raise exception 'Unauthorized'; end if;

  return query
  with raw_matches as (
    -- Match Prospects
    select
      p.id as m_id, -- text
      'prospect' as m_type,
      p.business_name as m_name,
      (coalesce(p.street_number, '') || ' ' || coalesce(p.street_name, '')) as m_addr,
      similarity(p.business_name, v_cap.normalized_ocr_text) as s_name,
      0.0::numeric as s_dist
    from prospects p
    where p.user_id = auth.uid()
    and p.business_name % v_cap.normalized_ocr_text

    union all

    -- Match Signals
    select
      ls.id as m_id, -- text
      'signal' as m_type,
      ls.establishment_name as m_name,
      ls.address as m_addr,
      similarity(ls.establishment_name, v_cap.normalized_ocr_text) as s_name,
      (case when st_dwithin(ls.location, v_cap.location, p_radius_meters) then 1.0 else 0.0 end) as s_dist
    from lens_signals ls
    where ls.establishment_name % v_cap.normalized_ocr_text
    or st_dwithin(ls.location, v_cap.location, p_radius_meters)
  )
  select
    m_id, m_type, m_name, m_addr,
    (s_name * 0.7 + s_dist * 0.3)::numeric as total_score,
    jsonb_build_object('name_sim', s_name, 'dist_score', s_dist)
  from raw_matches
  order by 5 desc limit 10;
end;
$$;
