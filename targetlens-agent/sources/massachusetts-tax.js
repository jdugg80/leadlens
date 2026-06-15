/**
 * Massachusetts Property Tax Source
 * Expands MassGIS data with use_code, sq footage, values, sale dates
 */

const { MA_USE_CODES } = require('../config');

const MASSGIS_URL = 'https://mass.maps.arcgis.com/sharing/rest/content/items';

async function fetchMassachusettsParcels(stateFilter = 'MA') {
  try {
    const url = `${MASSGIS_URL}?f=json&q=level+3+parcels+massachusetts`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'LeadLens-TargetLens/1.0' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return (data.results || []).map(normalizeMassGisRecord).filter(Boolean);
  } catch (err) {
    console.warn('[MA-Tax] MassGIS fetch failed:', err.message);
    return [];
  }
}

function normalizeMassGisRecord(raw) {
  const useCode = String(raw.use_code || raw.usecode || '');
  if (MA_USE_CODES.EXCLUDE(useCode)) return null;

  return {
    account_number: raw.parcel_id || raw.pid || '',
    owner_name: raw.owner1 || raw.owner || '',
    mailing_address: raw.mail_address || '',
    situs_address: raw.address || raw.situs || '',
    city: raw.town || raw.city || '',
    state: 'MA',
    zip: raw.zip || '',
    appraised_value: parseFloat(raw.total_value || raw.totalvalue || 0),
    land_value: parseFloat(raw.land_value || raw.landvalue || 0),
    improvement_value: parseFloat(raw.bldg_value || raw.bldgvalue || 0),
    sq_footage: parseInt(raw.res_area || raw.livingarea || 0, 10),
    year_built: parseInt(raw.year_built || raw.yrbuilt || 0, 10),
    property_class_code: useCode,
    exemptions: [],
    use_code: useCode,
    lat: parseFloat(raw.lat || raw.latitude || 0) || null,
    lng: parseFloat(raw.lng || raw.longitude || 0) || null,
    county: raw.county || '',
  };
}

module.exports = { fetchMassachusettsParcels };
