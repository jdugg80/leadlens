// src/utils/txPermitCheck.js
import { supabase } from '../lib/supabase';

const _cache = {};

export async function checkPermitStatus(businessName, zipCode = null) {
  if (!businessName?.trim()) return { status: 'error', data: null };

  const cacheKey = `${businessName.trim().toLowerCase()}|${zipCode || ''}`;
  if (_cache[cacheKey]) return _cache[cacheKey];

  try {
    const mode = zipCode ? 'sales_location_zip' : 'sales_location_name';
    const params = zipCode
      ? { mode, zip: zipCode }
      : { mode, locationName: businessName.trim().toUpperCase() };

    const { data, error } = await supabase.functions.invoke('comptroller-lookup', {
      body: params,
    });

    if (error) {
      console.warn('[txPermitCheck] Edge function error:', error.message);
      return { status: 'error', data: null };
    }

    const results = data?.result?.data || data?.result?.results || [];

    if (!results.length) {
      const result = { status: 'not_found', data: null };
      _cache[cacheKey] = result;
      return result;
    }

    const upper = businessName.trim().toUpperCase();
    const match =
      results.find((r) =>
        r.LOCATION_NAME?.toUpperCase().includes(upper) ||
        r.TAXPAYER_NAME?.toUpperCase().includes(upper)
      ) || results[0];

    const isActive =
      match.PERMIT_STATUS?.toUpperCase() === 'ACTIVE' ||
      match.STATUS?.toUpperCase() === 'ACTIVE';

    const enriched = {
      businessName: match.LOCATION_NAME || match.TAXPAYER_NAME || businessName,
      address: match.LOCATION_ADDRESS,
      city: match.LOCATION_CITY,
      zip: match.LOCATION_ZIP,
      taxpayerId: match.TAXPAYER_NUMBER,
      permitStatus: match.PERMIT_STATUS || match.STATUS,
      permitStartDate: match.PERMIT_START_DT,
      permitEndDate: match.PERMIT_END_DT,
    };

    const result = { status: isActive ? 'active' : 'inactive', data: enriched };
    _cache[cacheKey] = result;

    supabase.functions
      .invoke('upsert-comptroller', {
        body: [{
          signal_type: 'permit_check',
          taxpayer_id: match.TAXPAYER_NUMBER,
          location_number: match.LOCATION_NUMBER || null,
          business_name: match.TAXPAYER_NAME || businessName,
          location_name: match.LOCATION_NAME || businessName,
          street: match.LOCATION_ADDRESS || null,
          city: match.LOCATION_CITY || null,
          state: 'TX',
          zip: match.LOCATION_ZIP || zipCode || null,
          permit_status: match.PERMIT_STATUS || match.STATUS || null,
          permit_start_date: match.PERMIT_START_DT || null,
          permit_end_date: match.PERMIT_END_DT || null,
          raw_payload: match,
        }],
      })
      .catch((e) => console.warn('[txPermitCheck] Cache upsert failed:', e.message));

    return result;
  } catch (e) {
    console.warn('[txPermitCheck] Unexpected error:', e.message);
    return { status: 'error', data: null };
  }
}

export function clearPermitCache() {
  Object.keys(_cache).forEach((k) => delete _cache[k]);
}
