import { enhanceProspectWithGeoTarget } from './geoTargetProspectEnhancer';

export async function insertProspectWithGeoTarget({
  supabase,
  table = 'prospects',
  payload,
  geoOptions = {},
  select = true,
  single = false,
}) {
  if (!supabase) {
    throw new Error('insertProspectWithGeoTarget requires a Supabase client.');
  }

  const enhancedPayload = await enhanceProspectWithGeoTarget(payload, geoOptions);

  let query = supabase.from(table).insert(enhancedPayload);

  if (select) {
    query = query.select();
  }

  if (single && select) {
    query = query.single();
  }

  return query;
}

export async function upsertProspectWithGeoTarget({
  supabase,
  table = 'prospects',
  payload,
  geoOptions = {},
  upsertOptions,
  select = true,
  single = false,
}) {
  if (!supabase) {
    throw new Error('upsertProspectWithGeoTarget requires a Supabase client.');
  }

  const enhancedPayload = await enhanceProspectWithGeoTarget(payload, geoOptions);

  let query = supabase.from(table).upsert(enhancedPayload, upsertOptions);

  if (select) {
    query = query.select();
  }

  if (single && select) {
    query = query.single();
  }

  return query;
}
