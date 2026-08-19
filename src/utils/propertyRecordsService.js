/**
 * Property Records Service
 *
 * Multi-county Texas property data via ArcGIS MapServer.
 * Supports Harris (HCAD), Tarrant (TAD), and Travis (TCAD) counties.
 * Falls back to AI estimation for unsupported counties or query failures.
 */

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;

const propertyCache = new Map();
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

// ---------------------------------------------------------------------------
// County routing — ZIP code to county name lookup
// ---------------------------------------------------------------------------

const COUNTY_BY_ZIP = {
  // Harris County (Houston metro)
  '77002':'Harris','77003':'Harris','77004':'Harris','77005':'Harris','77006':'Harris',
  '77007':'Harris','77008':'Harris','77009':'Harris','77010':'Harris','77011':'Harris',
  '77012':'Harris','77013':'Harris','77014':'Harris','77015':'Harris','77016':'Harris',
  '77017':'Harris','77018':'Harris','77019':'Harris','77020':'Harris','77021':'Harris',
  '77022':'Harris','77023':'Harris','77024':'Harris','77025':'Harris','77026':'Harris',
  '77027':'Harris','77028':'Harris','77029':'Harris','77030':'Harris','77031':'Harris',
  '77032':'Harris','77033':'Harris','77034':'Harris','77035':'Harris','77036':'Harris',
  '77037':'Harris','77038':'Harris','77039':'Harris','77040':'Harris','77041':'Harris',
  '77042':'Harris','77043':'Harris','77044':'Harris','77045':'Harris','77046':'Harris',
  '77047':'Harris','77048':'Harris','77049':'Harris','77050':'Harris','77051':'Harris',
  '77053':'Harris','77054':'Harris','77055':'Harris','77056':'Harris','77057':'Harris',
  '77058':'Harris','77059':'Harris','77060':'Harris','77061':'Harris','77062':'Harris',
  '77063':'Harris','77064':'Harris','77065':'Harris','77066':'Harris','77067':'Harris',
  '77068':'Harris','77069':'Harris','77070':'Harris','77071':'Harris','77072':'Harris',
  '77073':'Harris','77074':'Harris','77075':'Harris','77076':'Harris','77077':'Harris',
  '77078':'Harris','77079':'Harris','77080':'Harris','77081':'Harris','77082':'Harris',
  '77083':'Harris','77084':'Harris','77085':'Harris','77086':'Harris','77087':'Harris',
  '77088':'Harris','77089':'Harris','77090':'Harris','77091':'Harris','77092':'Harris',
  '77093':'Harris','77094':'Harris','77095':'Harris','77096':'Harris','77098':'Harris',
  '77099':'Harris','77201':'Harris','77202':'Harris','77203':'Harris','77204':'Harris',
  '77205':'Harris','77206':'Harris','77207':'Harris','77208':'Harris','77209':'Harris',
  '77210':'Harris','77212':'Harris','77213':'Harris','77215':'Harris','77216':'Harris',
  '77217':'Harris','77218':'Harris','77219':'Harris','77220':'Harris','77221':'Harris',
  '77222':'Harris','77223':'Harris','77224':'Harris','77225':'Harris','77227':'Harris',
  '77228':'Harris','77229':'Harris','77230':'Harris','77231':'Harris','77233':'Harris',
  '77234':'Harris','77235':'Harris','77236':'Harris','77237':'Harris','77238':'Harris',
  '77240':'Harris','77241':'Harris','77242':'Harris','77243':'Harris','77244':'Harris',
  '77245':'Harris','77248':'Harris','77249':'Harris','77250':'Harris','77251':'Harris',
  '77252':'Harris','77253':'Harris','77254':'Harris','77255':'Harris','77256':'Harris',
  '77257':'Harris','77258':'Harris','77259':'Harris','77261':'Harris','77262':'Harris',
  '77263':'Harris','77265':'Harris','77266':'Harris','77267':'Harris','77268':'Harris',
  '77269':'Harris','77270':'Harris','77271':'Harris','77272':'Harris','77273':'Harris',
  '77274':'Harris','77275':'Harris','77277':'Harris','77279':'Harris','77280':'Harris',
  '77282':'Harris','77284':'Harris','77287':'Harris','77288':'Harris','77289':'Harris',
  '77291':'Harris','77292':'Harris','77293':'Harris','77297':'Harris','77299':'Harris',
  // Tarrant County (Fort Worth / Arlington metro)
  '76006':'Tarrant','76011':'Tarrant','76012':'Tarrant','76013':'Tarrant','76014':'Tarrant',
  '76015':'Tarrant','76016':'Tarrant','76017':'Tarrant','76018':'Tarrant','76019':'Tarrant',
  '76020':'Tarrant','76021':'Tarrant','76022':'Tarrant','76023':'Tarrant','76028':'Tarrant',
  '76031':'Tarrant','76034':'Tarrant','76035':'Tarrant','76036':'Tarrant','76039':'Tarrant',
  '76040':'Tarrant','76044':'Tarrant','76050':'Tarrant','76051':'Tarrant','76052':'Tarrant',
  '76053':'Tarrant','76054':'Tarrant','76055':'Tarrant','76060':'Tarrant','76063':'Tarrant',
  '76065':'Tarrant','76092':'Tarrant','76096':'Tarrant','76102':'Tarrant','76103':'Tarrant',
  '76104':'Tarrant','76105':'Tarrant','76106':'Tarrant','76107':'Tarrant','76108':'Tarrant',
  '76109':'Tarrant','76110':'Tarrant','76111':'Tarrant','76112':'Tarrant','76114':'Tarrant',
  '76115':'Tarrant','76116':'Tarrant','76117':'Tarrant','76118':'Tarrant','76119':'Tarrant',
  '76120':'Tarrant','76123':'Tarrant','76124':'Tarrant','76126':'Tarrant','76127':'Tarrant',
  '76129':'Tarrant','76131':'Tarrant','76132':'Tarrant','76133':'Tarrant','76134':'Tarrant',
  '76135':'Tarrant','76137':'Tarrant','76140':'Tarrant','76148':'Tarrant','76155':'Tarrant',
  '76162':'Tarrant','76164':'Tarrant','76177':'Tarrant','76179':'Tarrant','76180':'Tarrant',
  '76182':'Tarrant','76185':'Tarrant','76192':'Tarrant','76193':'Tarrant','76196':'Tarrant',
  '76197':'Tarrant','76199':'Tarrant',
  // Travis County (Austin metro)
  '73301':'Travis','73344':'Travis','78602':'Travis','78610':'Travis','78613':'Travis',
  '78615':'Travis','78617':'Travis','78621':'Travis','78626':'Travis','78628':'Travis',
  '78634':'Travis','78642':'Travis','78645':'Travis','78653':'Travis','78660':'Travis',
  '78664':'Travis','78681':'Travis','78701':'Travis','78702':'Travis','78703':'Travis',
  '78704':'Travis','78705':'Travis','78708':'Travis','78709':'Travis','78710':'Travis',
  '78711':'Travis','78712':'Travis','78713':'Travis','78714':'Travis','78715':'Travis',
  '78716':'Travis','78717':'Travis','78718':'Travis','78719':'Travis','78720':'Travis',
  '78721':'Travis','78722':'Travis','78723':'Travis','78724':'Travis','78725':'Travis',
  '78726':'Travis','78727':'Travis','78728':'Travis','78729':'Travis','78730':'Travis',
  '78731':'Travis','78732':'Travis','78733':'Travis','78734':'Travis','78735':'Travis',
  '78736':'Travis','78737':'Travis','78738':'Travis','78739':'Travis','78741':'Travis',
  '78742':'Travis','78744':'Travis','78745':'Travis','78746':'Travis','78747':'Travis',
  '78748':'Travis','78749':'Travis','78750':'Travis','78751':'Travis','78752':'Travis',
  '78753':'Travis','78754':'Travis','78756':'Travis','78757':'Travis','78758':'Travis',
  '78759':'Travis','78799':'Travis',
};

// ---------------------------------------------------------------------------
// County-specific ArcGIS endpoint configuration
// ---------------------------------------------------------------------------

const COUNTY_CONFIG = {
  Harris: {
    url: 'https://www.gis.hctx.net/arcgis/rest/services/HCAD/Parcels/MapServer/0/query',
    dataSource: 'hcad',
    outFields: 'HCAD_NUM,owner_name_1,owner_name_2,owner_name_3,site_str_num,site_str_name,site_str_sfx,site_city,site_zip,land_value,bld_value,impr_value,total_appraised_val,total_market_val,state_class,land_use,Acreage,land_sqft,new_owner_date',
  },
  Tarrant: {
    url: 'https://mapit.tarrantcounty.com/arcgis/rest/services/Tax/TCProperty/MapServer/0/query',
    dataSource: 'tad',
    outFields: 'TAXPIN,OWNER_NAME,SITUS_ADDR,STREET_NO,STREET_NAM,STREET_TYP,CITY,ZIPCODE,APPRAISEDV,LAND_VALUE,IMPR_VALUE,TOTAL_VALU,YEAR_BUILT,LIVING_ARE,LAND_SQFT,BEDROOMS,BATHROOMS',
  },
  Travis: {
    url: 'https://gis.traviscountytx.gov/server1/rest/services/Boundaries_and_Jurisdictions/TCAD/MapServer/0/query',
    dataSource: 'tcad',
    outFields: 'py_owner_name,situs_address,situs_num,situs_street,situs_city,situs_zip,market_value,appraised_val,assessed_val,F1year_imprv,PROP_ID,legal_desc,tcad_acres,land_homesite_val,land_non_homesite_val,imprv_homesite_val,imprv_non_homesite_val',
  },
};

// ---------------------------------------------------------------------------
// Address regex — extracts street number, name, direction, city, zip
// ---------------------------------------------------------------------------

const ADDRESS_REGEX = /^(\d+)\s+(.+?)(?:\s+(N|S|E|W|NE|NW|SE|SW))?\s+(?:ST|STREET|AVE|AVENUE|BLVD|BOULEVARD|DR|DRIVE|RD|ROAD|LN|LANE|CT|COURT|PL|PLACE|WAY|CY|CIRCLE|PKWY|PARKWAY|FWY|FREEWAY|HWY|HIGHWAY)\b\.?\s+(.+?),?\s+(?:TX|TEXAS)\s+(\d{5})/i;

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Get property information. Routes to county-specific ArcGIS, falls back to AI.
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

  // Parse address components
  const match = address.match(ADDRESS_REGEX);
  const strNum = match ? match[1] : null;
  const strNameRaw = match ? match[2] : null;
  const strDir = match ? match[3] : null;
  const cityRaw = match ? match[4] : null;
  const zip = match ? match[5] : null;

  // Determine county from ZIP
  const county = zip ? COUNTY_BY_ZIP[zip] : null;

  // Build list of counties to try
  const countiesToTry = county ? [county] : ['Harris', 'Tarrant', 'Travis'];

  for (const cty of countiesToTry) {
    const config = COUNTY_CONFIG[cty];
    if (!config) continue;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);

      let result;
      if (cty === 'Harris') {
        result = await queryHarrisProperty(config, strNum, strNameRaw, cityRaw, zip, address, controller.signal);
      } else if (cty === 'Tarrant') {
        result = await queryTarrantProperty(config, strNum, strNameRaw, cityRaw, zip, address, controller.signal);
      } else if (cty === 'Travis') {
        result = await queryTravisProperty(config, strNum, strNameRaw, cityRaw, zip, address, controller.signal);
      }

      clearTimeout(timeout);

      if (result) {
        const pestRiskFactors = assessPropertyPestRisk(result.property);
        const fullResult = {
          success: true, address, property: result.property,
          pestRiskFactors, pestRiskScore: calculatePropertyPestRiskScore(result.property, pestRiskFactors),
          dataSource: result.dataSource, fetchedAt: new Date().toISOString(),
        };
        propertyCache.set(cacheKey, { data: fullResult, cachedAt: Date.now() });
        return fullResult;
      }
    } catch (err) {
      console.warn(`[PropertyService] ${cty} ArcGIS query failed:`, err.message);
    }
  }

  // AI fallback
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

// ---------------------------------------------------------------------------
// Harris County (HCAD) query
// ---------------------------------------------------------------------------

async function queryHarrisProperty(config, strNum, strNameRaw, cityRaw, zip, address, signal) {
  const whereParts = [];
  if (strNameRaw) {
    const cleanName = strNameRaw.replace(/[^a-zA-Z0-9\s]/g, '').trim();
    whereParts.push(`UPPER(site_str_name) LIKE '%${cleanName.toUpperCase().replace(/\s+/g, '%')}%'`);
  }
  if (cityRaw) {
    whereParts.push(`UPPER(site_city) = '${cityRaw.trim().toUpperCase()}'`);
  }
  if (zip) {
    whereParts.push(`site_zip = '${zip}'`);
  }
  if (whereParts.length === 0) return null;

  const params = new URLSearchParams({
    where: whereParts.join(' AND '), outFields: config.outFields,
    returnGeometry: 'false', resultRecordCount: '10', f: 'json',
  });
  const response = await fetch(`${config.url}?${params.toString()}`, { signal });
  if (!response.ok) return null;

  const data = await response.json();
  const features = data.features || [];
  if (features.length === 0) return null;

  let best = features[0].attributes;
  if (strNum) {
    const numMatch = features.find(f => String(f.attributes.site_str_num) === strNum);
    if (numMatch) best = numMatch.attributes;
  }
  return { property: parseArcGISProperty(best), dataSource: config.dataSource };
}

// ---------------------------------------------------------------------------
// Tarrant County (TAD) query
// ---------------------------------------------------------------------------

async function queryTarrantProperty(config, strNum, strNameRaw, cityRaw, zip, address, signal) {
  const whereParts = [];
  if (strNameRaw) {
    const cleanName = strNameRaw.replace(/[^a-zA-Z0-9\s]/g, '').trim();
    whereParts.push(`UPPER(STREET_NAM) LIKE '%${cleanName.toUpperCase().replace(/\s+/g, '%')}%'`);
  }
  if (cityRaw) {
    whereParts.push(`UPPER(CITY) LIKE '%${cityRaw.trim().toUpperCase()}%'`);
  }
  if (zip) {
    whereParts.push(`ZIPCODE = '${zip}'`);
  }
  if (whereParts.length === 0) return null;

  const params = new URLSearchParams({
    where: whereParts.join(' AND '), outFields: config.outFields,
    returnGeometry: 'false', resultRecordCount: '10', f: 'json',
  });
  const response = await fetch(`${config.url}?${params.toString()}`, { signal });
  if (!response.ok) return null;

  const data = await response.json();
  const features = data.features || [];
  if (features.length === 0) return null;

  let best = features[0].attributes;
  if (strNum) {
    const numMatch = features.find(f => String(Math.round(f.attributes.STREET_NO)) === strNum);
    if (numMatch) best = numMatch.attributes;
  }
  return { property: parseTadProperty(best), dataSource: config.dataSource };
}

// ---------------------------------------------------------------------------
// Travis County (TCAD) query
// ---------------------------------------------------------------------------

async function queryTravisProperty(config, strNum, strNameRaw, cityRaw, zip, address, signal) {
  const whereParts = [];
  if (strNameRaw) {
    const cleanName = strNameRaw.replace(/[^a-zA-Z0-9\s]/g, '').trim();
    whereParts.push(`UPPER(situs_address) LIKE '%${cleanName.toUpperCase().replace(/\s+/g, '%')}%'`);
  }
  if (zip) {
    whereParts.push(`situs_zip = '${zip}'`);
  }
  if (whereParts.length === 0) return null;

  const params = new URLSearchParams({
    where: whereParts.join(' AND '), outFields: config.outFields,
    returnGeometry: 'false', resultRecordCount: '10', f: 'json',
  });
  const response = await fetch(`${config.url}?${params.toString()}`, { signal });
  if (!response.ok) return null;

  const data = await response.json();
  const features = data.features || [];
  if (features.length === 0) return null;

  let best = features[0].attributes;
  if (strNum) {
    const numMatch = features.find(f => {
      const addr = (f.attributes.situs_address || '').trim();
      return addr.startsWith(strNum + ' ');
    });
    if (numMatch) best = numMatch.attributes;
  }
  return { property: parseTcadProperty(best), dataSource: config.dataSource };
}

// ---------------------------------------------------------------------------
// Parsers — ArcGIS attribute -> app property object
// ---------------------------------------------------------------------------

function parseArcGISProperty(attrs) {
  const currentYear = new Date().getFullYear();
  const strParts = [attrs.site_str_num, attrs.site_str_name, attrs.site_str_sfx].filter(Boolean);
  const fullAddress = strParts.length > 0 ? strParts.join(' ') : '';

  const classCode = (attrs.state_class || '').toUpperCase();
  let propertyType = 'COMMERCIAL';
  if (classCode.startsWith('A')) propertyType = 'RESIDENTIAL';
  else if (classCode.startsWith('B')) propertyType = 'COMMERCIAL';
  else if (classCode.startsWith('F')) propertyType = 'INDUSTRIAL';
  else if (classCode.startsWith('S')) propertyType = 'RETAIL';
  else if (classCode.startsWith('X')) propertyType = 'EXEMPT';

  return {
    address: fullAddress,
    city: attrs.site_city || '',
    state: 'TX',
    zip: attrs.site_zip || '',
    parcelNumber: attrs.HCAD_NUM || '',
    squareFeet: parseInt(attrs.land_sqft || 0, 10),
    yearBuilt: null,
    buildingAge: null,
    stories: null,
    zoning: null,
    landUse: attrs.land_use || '',
    propertyType,
    totalValue: parseFloat(attrs.total_appraised_val || 0),
    landValue: parseFloat(attrs.land_value || 0),
    buildingValue: parseFloat(attrs.bld_value || 0),
    marketValue: parseFloat(attrs.total_market_val || 0),
    condition: null,
    owner: [attrs.owner_name_1, attrs.owner_name_2, attrs.owner_name_3]
      .filter(n => n && n.trim().length > 0)
      .map(n => n.trim())
      .join(' & ') || '',
    acreage: attrs.Acreage || '',
  };
}

function parseTadProperty(attrs) {
  const currentYear = new Date().getFullYear();
  // Reconstruct address from components
  const strNo = attrs.STREET_NO ? String(Math.round(attrs.STREET_NO)) : '';
  const strNam = (attrs.STREET_NAM || '').trim();
  const strTyp = (attrs.STREET_TYP || '').trim();
  const preDir = (attrs.PREDIR || '').trim();
  const parts = [strNo, preDir, strNam, strTyp].filter(Boolean);
  const fullAddress = parts.join(' ');
  const city = (attrs.CITY || '').trim();
  let zip = (attrs.ZIPCODE || '').trim();
  if (!zip) {
    // Try extracting from SITUS_ADDR
    const situsMatch = (attrs.SITUS_ADDR || '').match(/(\d{5})\s*$/);
    if (situsMatch) zip = situsMatch[1];
  }
  const yearBuilt = parseInt(attrs.YEAR_BUILT || 0, 10) || null;

  return {
    address: fullAddress,
    city,
    state: 'TX',
    zip,
    parcelNumber: (attrs.TAXPIN || '').trim(),
    squareFeet: parseInt(attrs.LIVING_ARE || 0, 10),
    yearBuilt,
    buildingAge: yearBuilt > 0 ? currentYear - yearBuilt : null,
    stories: null,
    zoning: null,
    landUse: '',
    propertyType: 'COMMERCIAL',
    totalValue: parseFloat(attrs.TOTAL_VALU || attrs.APPRAISEDV || 0),
    landValue: parseFloat(attrs.LAND_VALUE || 0),
    buildingValue: parseFloat(attrs.IMPR_VALUE || 0),
    marketValue: parseFloat(attrs.APPRAISEDV || 0),
    condition: null,
    owner: (attrs.OWNER_NAME || '').trim(),
    acreage: parseFloat(attrs.LAND_ACRES || 0) || '',
  };
}

function parseTcadProperty(attrs) {
  const currentYear = new Date().getFullYear();
  // situs_address is combined: "1801 CONGRESS AVE 78701"
  const situsAddr = (attrs.situs_address || '').trim();
  // Parse zip from situs_address if situs_zip is missing
  let zip = (attrs.situs_zip || '').trim();
  if (!zip) {
    const zipMatch = situsAddr.match(/(\d{5})\s*$/);
    if (zipMatch) zip = zipMatch[1];
  }
  // Parse city — situs_city may be null, try extracting from address context
  let city = (attrs.situs_city || '').trim();
  if (!city && zip) {
    // Fallback: leave city empty, zip is sufficient for display
    city = '';
  }
  // Parse year built from F1year_imprv (First year 1st Floor Improvement)
  const yearBuilt = parseInt(attrs.F1year_imprv || 0, 10) || null;

  // Sum value fields — parse each individually to avoid string concatenation
  const landHomesite = parseInt(attrs.land_homesite_val || 0, 10) || 0;
  const landNonHomesite = parseInt(attrs.land_non_homesite_val || 0, 10) || 0;
  const imprvHomesite = parseInt(attrs.imprv_homesite_val || 0, 10) || 0;
  const imprvNonHomesite = parseInt(attrs.imprv_non_homesite_val || 0, 10) || 0;

  return {
    address: situsAddr,
    city,
    state: 'TX',
    zip,
    parcelNumber: String(attrs.PROP_ID || ''),
    squareFeet: 0,
    yearBuilt,
    buildingAge: yearBuilt > 0 ? currentYear - yearBuilt : null,
    stories: null,
    zoning: null,
    landUse: '',
    propertyType: 'COMMERCIAL',
    totalValue: parseInt(attrs.appraised_val || 0, 10) || 0,
    landValue: landHomesite + landNonHomesite,
    buildingValue: imprvHomesite + imprvNonHomesite,
    marketValue: parseInt(attrs.market_value || 0, 10) || 0,
    condition: null,
    owner: (attrs.py_owner_name || '').trim(),
    acreage: parseFloat(attrs.tcad_acres || 0) || '',
  };
}

// ---------------------------------------------------------------------------
// AI fallback
// ---------------------------------------------------------------------------

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
  const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '')
    .replace(/^[\s]*[-*]\s*/gm, '').trim();
  try {
    return JSON.parse(clean);
  } catch (parseErr) {
    console.warn('[PropertyService] JSON parse failed, raw:', text.slice(0, 200));
    throw new Error(`JSON Parse error: ${parseErr.message}`);
  }
}

// ---------------------------------------------------------------------------
// Pest risk assessment
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

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