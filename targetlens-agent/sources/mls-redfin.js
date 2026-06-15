/**
 * MLS Listing Source — Redfin Public Data
 * Free endpoint, no API key required
 */

const { MLS_SOURCES } = require('../config');

async function fetchRedfinListings(state = 'texas') {
  const { baseUrl, params } = MLS_SOURCES.redfin;
  const qs = new URLSearchParams({ ...params, market: state });
  const url = `${baseUrl}?${qs.toString()}`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'LeadLens-TargetLens/1.0' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const csv = await res.text();
    return parseCsvToRecords(csv);
  } catch (err) {
    console.warn('[MLS-Redfin] Fetch failed:', err.message);
    return [];
  }
}

function parseCsvToRecords(csv) {
  const lines = csv.split('\n').filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return lines.slice(1).map(line => {
    const values = line.split(',');
    const row = {};
    headers.forEach((h, i) => { row[h] = (values[i] || '').trim(); });
    return {
      address: row.address || row.street_address || '',
      city: row.city || '',
      state: row.state_or_province || '',
      zip: row.zip || '',
      list_price: parseFloat(row.list_price || 0) || null,
      close_price: parseFloat(row.close_price || 0) || null,
      close_date: row.close_date || row.sold_date || null,
      days_on_market: parseInt(row.days_on_market || 0, 10) || null,
      sq_footage: parseInt(row.living_area || row.square_feet || 0, 10) || null,
      bedrooms: parseInt(row.beds || 0, 10) || null,
      bathrooms: parseFloat(row.baths || 0) || null,
      year_built: parseInt(row.year_built || 0, 10) || null,
      lat: parseFloat(row.latitude || 0) || null,
      lng: parseFloat(row.longitude || 0) || null,
      mls_source: 'redfin',
    };
  }).filter(r => r.address);
}

module.exports = { fetchRedfinListings };
