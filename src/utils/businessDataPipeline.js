/**
 * Business Data Pipeline
 * ────────────────────────────────────────────────────────────────
 * Maps Google Places (and other enrichment) results to the Supabase
 * business_data schema, upserts them, and provides read helpers for
 * the LeadLock pipeline.
 */

import { supabase } from '../lib/supabase';

const PIPELINE_LOG_PREFIX = '[BusinessDataPipeline]';

function log(level, ...args) {
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fn(`${PIPELINE_LOG_PREFIX}`, ...args);
}

function normalizePhone(value) {
  if (!value) return '';
  const digits = String(value).replace(/\D/g, '');
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits.startsWith('1')) {
    const d = digits.slice(1);
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return String(value).trim();
}

function extractAddressComponents(components = []) {
  const get = (type, long = true) => {
    const match = components.find(c =>
      Array.isArray(c.types) && c.types.includes(type)
    );
    if (!match) return '';
    return long
      ? (match.long_name || match.longText || '')
      : (match.short_name || match.shortText || '');
  };
  return {
    streetNumber: get('street_number'),
    streetName: get('route'),
    city: get('locality') || get('postal_town') || get('sublocality') || get('administrative_area_level_2'),
    state: get('administrative_area_level_1', false),
    zipCode: get('postal_code'),
  };
}

function calculatePestRiskScore(types = [], primaryType = '', indicators = []) {
  const allTypes = [primaryType, ...types].filter(Boolean).map(t => t.toLowerCase());
  let score = 0;
  const riskByType = {
    restaurant: 30, food: 30, bakery: 28, bar: 25, cafe: 25,
    grocery_or_supermarket: 25, supermarket: 25, convenience_store: 22,
    hotel: 20, lodging: 20, hospital: 20, health: 18, pharmacy: 15,
    school: 15, warehouse: 25, storage: 25, store: 15, retail: 15,
    office: 10, corporate_office: 10, medical: 20, doctor: 18, dentist: 18,
  };
  for (const [type, risk] of Object.entries(riskByType)) {
    if (allTypes.some(t => t.includes(type))) {
      score += risk;
      break;
    }
  }
  score += (indicators || []).length * 5;
  return Math.min(100, Math.round(score));
}

/**
 * Normalize a Google Places result (new or legacy) into business_data schema.
 */
export function normalizeBusinessData(place, source = 'google_places') {
  if (!place) {
    log('warn', 'normalizeBusinessData called with null place');
    return null;
  }

  const location = place.location || place.coords || place.geometry?.location || {};
  const latitude = typeof location.latitude === 'number' ? location.latitude : null;
  const longitude = typeof location.longitude === 'number' ? location.longitude : null;

  if (latitude === null || longitude === null) {
    log('warn', 'Skipping place without coordinates:', place.name);
    return null;
  }

  const components = place.addressComponents || place.address_components || [];
  const addr = extractAddressComponents(components);
  const formattedAddress = place.formattedAddress || place.formatted_address || place.address || place.vicinity || '';
  const zipCode = addr.zipCode || place.zip || place.postal_code || '';
  const city = addr.city || place.city || '';
  const state = addr.state || place.state || '';
  const streetNumber = addr.streetNumber || place.streetNumber || '';
  const streetName = addr.streetName || place.streetName || '';

  const phone = place.internationalPhoneNumber || place.formatted_phone_number || place.international_phone_number || place.nationalPhoneNumber || place.phone || '';
  const website = place.websiteUri || place.website || place.url || '';
  const types = Array.isArray(place.types) ? place.types : [];
  const primaryType = place.primaryType || place.primary_type || types[0] || '';
  const businessStatus = place.businessStatus || place.business_status || '';
  const rating = place.rating || null;
  const userRatingCount = place.userRatingCount || place.user_ratings_total || null;

  const pestIndicators = Array.isArray(place.pestIndicators) ? place.pestIndicators : [];
  const pestRiskScore = calculatePestRiskScore(types, primaryType, pestIndicators);

  return {
    source,
    place_id: place.placeId || place.place_id || place.id || null,
    business_name: place.name || place.businessName || 'Unknown Business',
    formatted_address: formattedAddress,
    street_number: streetNumber,
    street_name: streetName,
    city,
    state,
    zip_code: zipCode,
    latitude,
    longitude,
    phone: normalizePhone(phone),
    website,
    email: place.email || '',
    types,
    primary_type: primaryType,
    business_status: businessStatus,
    rating,
    user_rating_count: userRatingCount,
    pest_risk_score: pestRiskScore,
    pest_indicators: pestIndicators,
    metadata: {
      googleMapsUri: place.googleMapsUri || place.google_maps_uri || '',
      openingHours: place.regularOpeningHours || place.opening_hours || null,
      raw: place.raw || place,
      normalizedAt: new Date().toISOString(),
    },
  };
}

/**
 * Upsert a single business record into business_data.
 * Returns { ok, data, error }.
 */
export async function upsertBusinessData(record) {
  if (!record || !record.business_name) {
    log('warn', 'upsertBusinessData called with invalid record');
    return { ok: false, error: 'Invalid record', data: null };
  }

  log('info', 'Upserting business:', record.business_name, record.zip_code || '(no zip)');

  try {
    const { data, error } = await supabase
      .from('business_data')
      .upsert(record, {
        onConflict: 'place_id',
        ignoreDuplicates: false,
      })
      .select('id, business_name, zip_code, place_id')
      .single();

    if (error) {
      log('error', 'Supabase upsert failed:', error.message);
      return { ok: false, error: error.message, data: null };
    }

    log('info', 'Upsert successful:', data?.business_name, data?.id);
    return { ok: true, data, error: null };
  } catch (err) {
    log('error', 'Upsert exception:', err?.message || err);
    return { ok: false, error: err?.message || String(err), data: null };
  }
}

/**
 * Batch upsert multiple business records.
 */
export async function upsertBusinessDataBatch(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return { ok: true, inserted: 0, error: null };
  }

  const valid = records.filter(Boolean).filter(r => r.business_name && r.latitude && r.longitude);
  log('info', `Batch upserting ${valid.length} of ${records.length} records`);

  if (valid.length === 0) {
    return { ok: false, inserted: 0, error: 'No valid records to upsert' };
  }

  try {
    const { data, error } = await supabase
      .from('business_data')
      .upsert(valid, {
        onConflict: 'place_id',
        ignoreDuplicates: false,
      })
      .select('id, business_name, zip_code');

    if (error) {
      log('error', 'Batch upsert failed:', error.message);
      return { ok: false, inserted: 0, error: error.message };
    }

    log('info', `Batch upsert successful: ${data?.length || 0} records`);
    return { ok: true, inserted: data?.length || 0, error: null };
  } catch (err) {
    log('error', 'Batch upsert exception:', err?.message || err);
    return { ok: false, inserted: 0, error: err?.message || String(err) };
  }
}

/**
 * Query business_data by zip code.
 */
export async function getBusinessDataByZip(zipCode, options = {}) {
  if (!zipCode) {
    log('warn', 'getBusinessDataByZip called without zipCode');
    return { ok: false, data: [], error: 'Missing zipCode' };
  }

  const cleanZip = String(zipCode).trim().slice(0, 5);
  log('info', 'Querying business_data by zip:', cleanZip);

  try {
    let query = supabase
      .from('business_data')
      .select('*')
      .eq('zip_code', cleanZip);

    if (options.limit) query = query.limit(Number(options.limit));
    if (options.orderBy) query = query.order(options.orderBy, { ascending: options.ascending !== false });

    const { data, error } = await query;

    if (error) {
      log('error', 'Zip query failed:', error.message);
      return { ok: false, data: [], error: error.message };
    }

    log('info', `Zip query returned ${data?.length || 0} rows for ${cleanZip}`);
    return { ok: true, data: data || [], error: null };
  } catch (err) {
    log('error', 'Zip query exception:', err?.message || err);
    return { ok: false, data: [], error: err?.message || String(err) };
  }
}

/**
 * Count business_data rows by zip code (useful for LeadLock validation).
 */
export async function countBusinessDataByZip(zipCode) {
  if (!zipCode) return { ok: false, count: 0, error: 'Missing zipCode' };
  const cleanZip = String(zipCode).trim().slice(0, 5);

  try {
    const { count, error } = await supabase
      .from('business_data')
      .select('*', { count: 'exact', head: true })
      .eq('zip_code', cleanZip);

    if (error) {
      log('error', 'Count query failed:', error.message);
      return { ok: false, count: 0, error: error.message };
    }

    return { ok: true, count: count || 0, error: null };
  } catch (err) {
    log('error', 'Count query exception:', err?.message || err);
    return { ok: false, count: 0, error: err?.message || String(err) };
  }
}

export default {
  normalizeBusinessData,
  upsertBusinessData,
  upsertBusinessDataBatch,
  getBusinessDataByZip,
  countBusinessDataByZip,
};
