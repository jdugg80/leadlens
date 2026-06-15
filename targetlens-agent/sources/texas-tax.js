/**
 * Texas Property Tax Source
 * Fetches property data from HCAD, TAD, Dallas CAD, and Travis CAD
 */

const { PROPERTY_TAX_SOURCES } = require('../config');

async function fetchWithRetry(url, opts = {}, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, {
        ...opts,
        headers: { 'User-Agent': 'LeadLens-TargetLens/1.0', ...opts.headers },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      if (i === retries) throw err;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

async function fetchHarrisCounty() {
  const url = `${PROPERTY_TAX_SOURCES.tx.harris.url}?limit=200`;
  try {
    const res = await fetchWithRetry(url);
    const data = await res.json();
    return (data || []).map(normalizeHcadRecord);
  } catch (err) {
    console.warn('[TX-Tax] Harris fetch failed:', err.message);
    return [];
  }
}

function normalizeHcadRecord(raw) {
  return {
    account_number: raw.account || raw.acct || '',
    owner_name: raw.owner_name || raw.own_name || '',
    mailing_address: raw.mail_addr || '',
    situs_address: raw.situs_address || raw.address || '',
    city: raw.city || '',
    state: 'TX',
    zip: raw.zip || '',
    appraised_value: parseFloat(raw.appraised_val || raw.total_val || 0),
    land_value: parseFloat(raw.land_val || 0),
    improvement_value: parseFloat(raw.impr_val || 0),
    sq_footage: parseInt(raw.building_sqft || raw.gross_sqft || 0, 10),
    year_built: parseInt(raw.year_built || raw.yr_built || 0, 10),
    property_class_code: raw.property_class || raw.class_code || '',
    exemptions: Array.isArray(raw.exemptions) ? raw.exemptions : [],
    county: 'Harris',
    lat: parseFloat(raw.latitude || raw.lat || 0) || null,
    lng: parseFloat(raw.longitude || raw.lng || 0) || null,
  };
}

async function fetchTexasProperties(countyFilter = null) {
  const allRecords = [];

  const counties = countyFilter
    ? Object.entries(PROPERTY_TAX_SOURCES.tx).filter(([, v]) => v.county === countyFilter)
    : Object.entries(PROPERTY_TAX_SOURCES.tx);

  for (const [key, source] of counties) {
    try {
      console.log(`[TX-Tax] Fetching ${source.county}...`);
      if (key === 'harris') {
        const records = await fetchHarrisCounty();
        allRecords.push(...records);
      } else {
        console.log(`[TX-Tax] ${source.county} source placeholder — implement parser`);
      }
    } catch (err) {
      console.warn(`[TX-Tax] ${source.county} failed:`, err.message);
    }
    await new Promise(r => setTimeout(r, 2000));
  }

  return allRecords;
}

module.exports = { fetchTexasProperties, fetchHarrisCounty };
