/**
 * Property Records Service
 *
 * Uses Harris County Appraisal District (HCAD) public API for property data.
 * Original CKAN resource IDs were placeholder UUIDs that never existed.
 * HCAD provides real queryable property data for Harris County, TX.
 */

const HCAD_API = 'https://hcad.org/api/';
const HCAD_SEARCH = 'https://hcad.org/hcad-resources/hcad-property-records/';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;

const propertyCache = new Map();
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Get property information. Tries HCAD API, falls back to AI estimation.
 */
export async function getPropertyRecord(address) {
  if (!address || typeof address !== 'string') {
    return { success: false, error: 'Invalid address', property: null };
  }

  const cacheKey = address.toLowerCase();
  if (propertyCache.has(cacheKey)) {
    const cached = propertyCache.get(cacheKey);
    if (Date.now() - cached.cachedAt < CACHE_TTL) return { ...cached.data, fromCache: true };
    propertyCache.delete(cacheKey);
  }

  // Try HCAD with timeout
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const url = `${HCAD_API}property?address=${encodeURIComponent(address)}`;
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      if (data && (data.property || data.result)) {
        const property = parsePropertyRecord(data.property || data.result);
        const pestRiskFactors = assessPropertyPestRisk(property);
        const result = {
          success: true, address, property,
          pestRiskFactors, pestRiskScore: calculatePropertyPestRiskScore(property, pestRiskFactors),
          dataSource: 'hcad', fetchedAt: new Date().toISOString(),
        };
        propertyCache.set(cacheKey, { data: result, cachedAt: Date.now() });
        return result;
      }
    }
  } catch (err) {
    console.warn('[PropertyService] HCAD unavailable:', err.message);
  }

  // AI fallback — estimate property risk from address context
  if (ANTHROPIC_API_KEY) {
    try {
      const estimated = await estimatePropertyRiskWithAI(address);
      const result = { success: true, address, property: estimated.property, pestRiskFactors: estimated.riskFactors, pestRiskScore: estimated.riskScore, dataSource: 'ai_estimate', fetchedAt: new Date().toISOString() };
      propertyCache.set(cacheKey, { data: result, cachedAt: Date.now() });
      return result;
    } catch (err) {
      console.warn('[PropertyService] AI estimation failed:', err.message);
    }
  }

  return { success: false, error: 'Property data unavailable', address };
}

async function estimatePropertyRiskWithAI(address) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    signal: controller.signal,
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: 'You estimate commercial property pest risk from an address. Return ONLY valid JSON — no markdown, no code fences, no commentary, no bullet points before or after. Just the raw JSON object: {"property":{"propertyType":"COMMERCIAL|INDUSTRIAL|RETAIL|OFFICE|OTHER","estimatedAge":years_or_null,"landUse":"description"},"riskScore":0-100,"riskFactors":{"factors":["factor1"],"warnings":["warning1"]}}',
      messages: [{ role: 'user', content: `Estimate pest control risk for: "${address}". Base on address clues (street name, business district, area type).` }],
    }),
  });
  clearTimeout(timeout);

  const data = await response.json();
  const text = (data.content?.[0]?.text || '').trim();
  // Strip markdown code fences and leading bullet/heading characters
  const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '')
    .replace(/^[\s]*[-*]\s*/gm, '').trim();
  try {
    return JSON.parse(clean);
  } catch (parseErr) {
    console.warn('[PropertyService] JSON parse failed, raw:', text.slice(0, 200));
    throw new Error(`JSON Parse error: ${parseErr.message}`);
  }
}

function parsePropertyRecord(record) {
  const currentYear = new Date().getFullYear();
  const buildingYear = parseInt(record['Year Built'] || record.yearBuilt || 0);
  return {
    address: record.Address || record.address,
    city: record.City || record.city,
    state: record.State || record.state || 'TX',
    zip: record.ZIP || record.zip,
    parcelNumber: record['Parcel Number'] || record.parcelNumber,
    squareFeet: parseInt(record['Square Feet'] || record.squareFeet || 0),
    yearBuilt: buildingYear,
    buildingAge: buildingYear > 0 ? currentYear - buildingYear : null,
    stories: parseInt(record.Stories || record.stories || 0),
    zoning: record.Zoning || record.zoning,
    landUse: record['Land Use'] || record.landUse,
    propertyType: record['Property Type'] || record.propertyType || 'COMMERCIAL',
    totalValue: parseFloat(record['Total Value'] || record.totalValue || 0),
    condition: record.Condition || record.condition,
    owner: record.Owner || record.owner,
  };
}

function assessPropertyPestRisk(property) {
  const factors = [];
  const warnings = [];

  if (property.buildingAge) {
    if (property.buildingAge > 50) { factors.push('BUILDING_AGE_50PLUS'); warnings.push('Building 50+ years — structural vulnerabilities likely'); }
    else if (property.buildingAge > 30) { factors.push('BUILDING_AGE_30PLUS'); }
  }
  if (property.squareFeet > 100000) { factors.push('LARGE_FOOTPRINT'); warnings.push('Large building — more pest entry points'); }
  if (property.stories > 3) { factors.push('MULTI_STORY'); warnings.push('Multi-story — vertical pest migration risk'); }
  if ((property.condition || '').toLowerCase().includes('poor')) { factors.push('POOR_CONDITION'); warnings.push('Poor condition — likely structural issues'); }
  const lu = (property.landUse || '').toLowerCase();
  if (lu.includes('food') || lu.includes('restaurant')) { factors.push('FOOD_SERVICE_USE'); warnings.push('Food service — high pest risk'); }
  else if (lu.includes('warehouse') || lu.includes('industrial')) { factors.push('WAREHOUSE_USE'); warnings.push('Warehouse/Industrial — pest harborage areas likely'); }
  else if (lu.includes('commercial') || lu.includes('retail')) { factors.push('COMMERCIAL_USE'); }

  return { factors, warnings };
}

function calculatePropertyPestRiskScore(property, riskFactors) {
  let score = 50;
  if (property.buildingAge > 50) score += 25;
  else if (property.buildingAge > 30) score += 15;
  if (property.squareFeet > 100000) score += 15;
  else if (property.squareFeet > 50000) score += 10;
  if (property.stories > 3) score += 10;
  if ((property.condition || '').toLowerCase().includes('poor')) score += 20;
  const lu = (property.landUse || '').toLowerCase();
  if (lu.includes('restaurant') || lu.includes('food')) score += 30;
  else if (lu.includes('warehouse') || lu.includes('industrial')) score += 20;
  else if (lu.includes('commercial')) score += 15;
  return Math.min(score, 100);
}

export async function searchPropertiesByCriteria(criteria, limit = 50) {
  return { success: false, properties: [], error: 'Use getPropertyRecord for individual lookups', criteria };
}

export async function getHighRiskPropertiesInZip(zip) {
  return { success: false, properties: [], error: 'ZIP-level search not available' };
}

export async function batchGetPropertyRecords(addresses) {
  if (!Array.isArray(addresses)) return [];
  return Promise.all(addresses.map(addr => getPropertyRecord(addr)));
}

export function clearPropertyCache() { propertyCache.clear(); }
export function getPropertyCacheStats() { return { cacheSize: propertyCache.size }; }
