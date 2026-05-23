/**
 * Building Permits Service
 * Fetches building permits and construction activity from city data APIs
 * Identifies new businesses and structural vulnerabilities
 */

const HOUSTON_PERMITS_API = 'https://data.houstontx.gov/api/3/action/datastore_search_sql';
const PERMITS_RESOURCE_ID = 'a1f234ab-7a22-4c2e-b8c3-2f1d2e3f4a6c'; // Houston permits dataset

// Cache permits by address
const permitsCache = new Map();
const CACHE_TTL = 14 * 24 * 60 * 60 * 1000; // 14 days

/**
 * Search for recent building permits at an address
 * @param {string} address - Street address
 * @param {number} days - How many days back to search (default: 90)
 * @returns {promise} Array of permit records
 */
export async function searchBuildingPermits(address, days = 90) {
  if (!address || typeof address !== 'string') {
    return { success: false, error: 'Invalid address', permits: [] };
  }

  const cacheKey = `${address.toLowerCase()}-${days}`;

  // Check cache
  if (permitsCache.has(cacheKey)) {
    const cached = permitsCache.get(cacheKey);
    if (Date.now() - cached.cachedAt < CACHE_TTL) {
      return { ...cached.data, fromCache: true };
    } else {
      permitsCache.delete(cacheKey);
    }
  }

  try {
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - days);
    const dateStr = daysAgo.toISOString().split('T')[0];

    const query = `
      SELECT * FROM "${PERMITS_RESOURCE_ID}"
      WHERE LOWER("Address") LIKE LOWER('%${escapeSql(address)}%')
      AND "Issue Date" >= '${dateStr}'
      ORDER BY "Issue Date" DESC
      LIMIT 50
    `;

    const url = `${HOUSTON_PERMITS_API}?sql=${encodeURIComponent(query)}`;

    const response = await fetch(url, { timeout: 5000 });

    if (!response.ok) throw new Error(`API error: ${response.status}`);

    const data = await response.json();

    if (!data.success || !data.result.records) {
      return {
        success: false,
        violations: [],
        address,
        days,
      };
    }

    const permits = data.result.records.map(record => ({
      permitNumber: record['Permit Number'],
      address: record.Address,
      issueDate: record['Issue Date'],
      permitType: record['Permit Type'],
      permitClass: record['Permit Class'],
      description: record.Description,
      estimatedCost: record['Estimated Cost'],
      contractorName: record['Contractor Name'],
      status: record.Status,
      pesSignificance: assessPermitPestSignificance(record),
    }));

    const result = {
      success: true,
      permits,
      count: permits.count,
      address,
      days,
      dateRange: `Last ${days} days`,
      fetchedAt: new Date().toISOString(),
    };

    // Cache result
    permitsCache.set(cacheKey, {
      data: result,
      cachedAt: Date.now(),
    });

    return result;
  } catch (error) {
    console.error('Building permits fetch error:', error);
    return {
      success: false,
      error: error.message,
      permits: [],
      address,
    };
  }
}

/**
 * Search for permits by business type
 * @param {string} type - Permit type (renovation, new, expansion, etc.)
 * @param {string} city - City name
 * @returns {promise} Recent permits of that type
 */
export async function searchPermitsByType(type, city = 'Houston') {
  try {
    const query = `
      SELECT * FROM "${PERMITS_RESOURCE_ID}"
      WHERE LOWER("Permit Type") LIKE LOWER('%${escapeSql(type)}%')
      AND LOWER(City) LIKE LOWER('%${escapeSql(city)}%')
      ORDER BY "Issue Date" DESC
      LIMIT 100
    `;

    const url = `${HOUSTON_PERMITS_API}?sql=${encodeURIComponent(query)}`;

    const response = await fetch(url, { timeout: 5000 });

    if (!response.ok) throw new Error(`API error: ${response.status}`);

    const data = await response.json();

    if (!data.success || !data.result.records) {
      return { success: false, permits: [] };
    }

    return {
      success: true,
      permits: data.result.records.map(r => ({
        permitNumber: r['Permit Number'],
        address: r.Address,
        issueDate: r['Issue Date'],
        type: r['Permit Type'],
        description: r.Description,
        pestSignificance: assessPermitPestSignificance(r),
      })),
      count: data.result.records.length,
      type,
      city,
    };
  } catch (error) {
    console.error('Permit type search error:', error);
    return { success: false, error: error.message, permits: [] };
  }
}

/**
 * Assess permit significance for pest control prospecting
 * @private
 */
function assessPermitPestSignificance(permit) {
  const desc = (permit.Description || '').toLowerCase();
  const type = (permit['Permit Type'] || '').toLowerCase();

  const significance = {
    score: 0,
    factors: [],
    prospectPotential: 'LOW',
  };

  // New construction = potential new business
  if (type.includes('new') || type.includes('construction')) {
    significance.score += 30;
    significance.factors.push('NEW_CONSTRUCTION');
    significance.prospectPotential = 'HIGH';
  }

  // Renovations = vulnerabilities opening up
  if (type.includes('renovation') || type.includes('remodel')) {
    significance.score += 20;
    significance.factors.push('RENOVATION_ACTIVITY');
    significance.prospectPotential = 'MEDIUM';
  }

  // Food service related
  if (desc.includes('restaurant') || desc.includes('food') || 
      desc.includes('kitchen') || desc.includes('cafe')) {
    significance.score += 25;
    significance.factors.push('FOOD_SERVICE');
    significance.prospectPotential = 'HIGH';
  }

  // Structural work = entry points vulnerable
  if (desc.includes('foundation') || desc.includes('wall') || 
      desc.includes('roof') || desc.includes('exterior')) {
    significance.score += 15;
    significance.factors.push('STRUCTURAL_WORK');
  }

  // Utility work = gaps in building envelope
  if (desc.includes('electrical') || desc.includes('plumbing') || 
      desc.includes('hvac') || desc.includes('ductwork')) {
    significance.score += 10;
    significance.factors.push('UTILITY_WORK');
  }

  return significance;
}

/**
 * Escape SQL safely
 * @private
 */
function escapeSql(str) {
  return str.replace(/'/g, "''");
}

/**
 * Get permit statistics for an area (zip code or neighborhood)
 * @param {string} zip - Zip code or area name
 * @param {number} days - Days to look back
 * @returns {promise} Permit statistics and prospects
 */
export async function getAreaPermitStats(zip, days = 90) {
  try {
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - days);
    const dateStr = daysAgo.toISOString().split('T')[0];

    const query = `
      SELECT "Permit Type", COUNT(*) as count, AVG("Estimated Cost") as avg_cost
      FROM "${PERMITS_RESOURCE_ID}"
      WHERE (LOWER("Address") LIKE LOWER('%${escapeSql(zip)}%') OR ZIP = '${zip}')
      AND "Issue Date" >= '${dateStr}'
      GROUP BY "Permit Type"
      ORDER BY count DESC
    `;

    const url = `${HOUSTON_PERMITS_API}?sql=${encodeURIComponent(query)}`;

    const response = await fetch(url, { timeout: 5000 });

    if (!response.ok) throw new Error(`API error`);

    const data = await response.json();

    if (!data.success) {
      return { success: false, stats: {} };
    }

    const permits = data.result.records || [];

    return {
      success: true,
      area: zip,
      days,
      totalPermits: permits.reduce((sum, p) => sum + p.count, 0),
      byType: permits,
      prospectCount: permits.filter(p => 
        p['Permit Type'].toLowerCase().includes('new') || 
        p['Permit Type'].toLowerCase().includes('renovation')
      ).reduce((sum, p) => sum + p.count, 0),
    };
  } catch (error) {
    console.error('Area stats error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Identify new business openings from permits
 * @param {string} city - City to search
 * @param {number} days - Days back to search (default: 30)
 * @returns {promise} Recent new business prospects
 */
export async function findNewBusinessOpenings(city = 'Houston', days = 30) {
  try {
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - days);
    const dateStr = daysAgo.toISOString().split('T')[0];

    const query = `
      SELECT * FROM "${PERMITS_RESOURCE_ID}"
      WHERE LOWER("Permit Type") LIKE '%new%'
      AND (LOWER(Description) LIKE '%restaurant%' OR LOWER(Description) LIKE '%food%'
           OR LOWER(Description) LIKE '%retail%' OR LOWER(Description) LIKE '%office%')
      AND "Issue Date" >= '${dateStr}'
      ORDER BY "Issue Date" DESC
      LIMIT 200
    `;

    const url = `${HOUSTON_PERMITS_API}?sql=${encodeURIComponent(query)}`;

    const response = await fetch(url, { timeout: 5000 });

    if (!response.ok) throw new Error(`API error`);

    const data = await response.json();

    if (!data.success) {
      return { success: false, openings: [] };
    }

    return {
      success: true,
      newOpenings: data.result.records.map(r => ({
        address: r.Address,
        permitType: r['Permit Type'],
        description: r.Description,
        issueDate: r['Issue Date'],
        estimatedCost: r['Estimated Cost'],
        prospectTier: calculateProspectTier(r),
      })),
      count: data.result.records.length,
      city,
      daysBack: days,
    };
  } catch (error) {
    console.error('New openings search error:', error);
    return { success: false, error: error.message, openings: [] };
  }
}

/**
 * Calculate prospect tier for a new business
 * @private
 */
function calculateProspectTier(permit) {
  const desc = (permit.Description || '').toLowerCase();
  
  if (desc.includes('restaurant') || desc.includes('food service')) return 'TIER_1_HOT';
  if (desc.includes('retail') || desc.includes('grocery')) return 'TIER_2_WARM';
  if (desc.includes('office') || desc.includes('warehouse')) return 'TIER_3_COOL';
  
  return 'TIER_4_COLD';
}

/**
 * Clear permits cache
 */
export function clearPermitsCache() {
  permitsCache.clear();
}

/**
 * Get cache stats
 */
export function getPermitsCacheStats() {
  return {
    cacheSize: permitsCache.size,
    entries: Array.from(permitsCache.keys()),
  };
}
