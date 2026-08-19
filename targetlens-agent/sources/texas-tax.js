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
  const baseUrl = PROPERTY_TAX_SOURCES.tx.harris.url;
  const params = new URLSearchParams({
    where: '1=1',
    outFields: 'HCAD_NUM,owner_name_1,owner_name_2,owner_name_3,site_str_num,site_str_name,site_str_sfx,site_city,site_zip,land_value,bld_value,impr_value,total_appraised_val,total_market_val,state_class,land_use,Acreage,land_sqft,new_owner_date',
    returnGeometry: 'false',
    resultRecordCount: '200',
    f: 'json',
  });
  const url = `${baseUrl}?${params.toString()}`;
  try {
    const res = await fetchWithRetry(url);
    const data = await res.json();
    const features = data.features || [];
    return features.map(f => normalizeHcadRecord(f.attributes || {}));
  } catch (err) {
    console.warn('[TX-Tax] Harris fetch failed:', err.message);
    return [];
  }
}

async function fetchTarrantCounty() {
  const baseUrl = PROPERTY_TAX_SOURCES.tx.tarrant.url;
  const params = new URLSearchParams({
    where: '1=1',
    outFields: 'TAXPIN,OWNER_NAME,SITUS_ADDR,STREET_NO,STREET_NAM,STREET_TYP,CITY,ZIPCODE,APPRAISEDV,LAND_VALUE,IMPR_VALUE,TOTAL_VALU,YEAR_BUILT,LIVING_ARE,LAND_SQFT',
    returnGeometry: 'false',
    resultRecordCount: '200',
    f: 'json',
  });
  const url = `${baseUrl}?${params.toString()}`;
  try {
    const res = await fetchWithRetry(url);
    const data = await res.json();
    const features = data.features || [];
    return features.map(f => normalizeTadRecord(f.attributes || {}));
  } catch (err) {
    console.warn('[TX-Tax] Tarrant fetch failed:', err.message);
    return [];
  }
}

async function fetchTravisCounty() {
  const baseUrl = PROPERTY_TAX_SOURCES.tx.travis.url;
  const params = new URLSearchParams({
    where: '1=1',
    outFields: 'py_owner_name,situs_address,situs_num,situs_street,situs_city,situs_zip,market_value,appraised_val,assessed_val,F1year_imprv,PROP_ID,legal_desc,tcad_acres,land_homesite_val,land_non_homesite_val,imprv_homesite_val,imprv_non_homesite_val',
    returnGeometry: 'false',
    resultRecordCount: '200',
    f: 'json',
  });
  const url = `${baseUrl}?${params.toString()}`;
  try {
    const res = await fetchWithRetry(url);
    const data = await res.json();
    const features = data.features || [];
    return features.map(f => normalizeTcadRecord(f.attributes || {}));
  } catch (err) {
    console.warn('[TX-Tax] Travis fetch failed:', err.message);
    return [];
  }
}

function normalizeTadRecord(raw) {
  const strNo = raw.STREET_NO ? String(Math.round(raw.STREET_NO)) : '';
  const strNam = (raw.STREET_NAM || '').trim();
  const strTyp = (raw.STREET_TYP || '').trim();
  const parts = [strNo, strNam, strTyp].filter(Boolean);
  const situsAddress = parts.length > 0 ? parts.join(' ') : (raw.SITUS_ADDR || '').trim();
  const city = (raw.CITY || '').trim();
  let zip = (raw.ZIPCODE || '').trim();
  if (!zip) {
    const situsMatch = (raw.SITUS_ADDR || '').match(/(\d{5})\s*$/);
    if (situsMatch) zip = situsMatch[1];
  }
  const yearBuilt = parseInt(raw.YEAR_BUILT || 0, 10) || 0;

  return {
    account_number: (raw.TAXPIN || '').trim(),
    owner_name: (raw.OWNER_NAME || '').trim(),
    mailing_address: '',
    situs_address: situsAddress,
    city,
    state: 'TX',
    zip,
    appraised_value: parseFloat(raw.TOTAL_VALU || raw.APPRAISEDV || 0),
    land_value: parseFloat(raw.LAND_VALUE || 0),
    improvement_value: parseFloat(raw.IMPR_VALUE || 0),
    sq_footage: parseInt(raw.LIVING_ARE || raw.LAND_SQFT || 0, 10),
    year_built: yearBuilt,
    property_class_code: '',
    land_use: '',
    exemptions: [],
    county: 'Tarrant',
    lat: null,
    lng: null,
  };
}

function normalizeTcadRecord(raw) {
  const situsAddr = (raw.situs_address || '').trim();
  let zip = (raw.situs_zip || '').trim();
  if (!zip) {
    const zipMatch = situsAddr.match(/(\d{5})\s*$/);
    if (zipMatch) zip = zipMatch[1];
  }
  const yearBuilt = parseInt(raw.F1year_imprv || 0, 10) || 0;

  // Parse each value field individually to avoid string concatenation
  const landHomesite = parseInt(raw.land_homesite_val || 0, 10) || 0;
  const landNonHomesite = parseInt(raw.land_non_homesite_val || 0, 10) || 0;
  const imprvHomesite = parseInt(raw.imprv_homesite_val || 0, 10) || 0;
  const imprvNonHomesite = parseInt(raw.imprv_non_homesite_val || 0, 10) || 0;

  return {
    account_number: String(raw.PROP_ID || ''),
    owner_name: (raw.py_owner_name || '').trim(),
    mailing_address: '',
    situs_address: situsAddr,
    city: (raw.situs_city || '').trim(),
    state: 'TX',
    zip,
    appraised_value: parseInt(raw.appraised_val || 0, 10) || 0,
    land_value: landHomesite + landNonHomesite,
    improvement_value: imprvHomesite + imprvNonHomesite,
    sq_footage: 0,
    year_built: yearBuilt,
    property_class_code: '',
    land_use: '',
    exemptions: [],
    county: 'Travis',
    lat: null,
    lng: null,
  };
}

function normalizeHcadRecord(raw) {
  // Reconstruct situs address from ArcGIS components
  const strNum = raw.site_str_num || raw.siteStrNum || '';
  const strName = raw.site_str_name || raw.siteStrName || '';
  const strSfx = raw.site_str_sfx || raw.siteStrSfx || '';
  const parts = [strNum, strName, strSfx].filter(Boolean);
  const situsAddress = parts.length > 0 ? parts.join(' ') : (raw.situs_address || raw.address || '');

  // Build owner string from up to 3 owner fields
  const owners = [raw.owner_name_1, raw.owner_name_2, raw.owner_name_3]
    .filter(n => n && n.trim().length > 0)
    .map(n => n.trim());
  const ownerName = owners.join(' & ') || raw.owner_name || raw.own_name || '';

  return {
    account_number: raw.HCAD_NUM || raw.account || raw.acct || '',
    owner_name: ownerName,
    mailing_address: raw.mail_addr || '',
    situs_address: situsAddress,
    city: raw.site_city || raw.city || '',
    state: 'TX',
    zip: raw.site_zip || raw.zip || '',
    appraised_value: parseFloat(raw.total_appraised_val || raw.appraised_val || raw.total_val || 0),
    land_value: parseFloat(raw.land_value || raw.land_val || 0),
    improvement_value: parseFloat(raw.bld_value || raw.impr_value || raw.impr_val || 0),
    sq_footage: parseInt(raw.land_sqft || raw.building_sqft || raw.gross_sqft || 0, 10),
    year_built: parseInt(raw.year_built || raw.yr_built || 0, 10),
    property_class_code: raw.state_class || raw.property_class || raw.class_code || '',
    land_use: raw.land_use || '',
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
      } else if (key === 'tarrant') {
        const records = await fetchTarrantCounty();
        allRecords.push(...records);
      } else if (key === 'travis') {
        const records = await fetchTravisCounty();
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

module.exports = { fetchTexasProperties, fetchHarrisCounty, fetchTarrantCounty, fetchTravisCounty };
