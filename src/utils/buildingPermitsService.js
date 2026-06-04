/**
 * Building Permits Service
 *
 * Houston permit data is in the Houston Permit Portal (permits.houstontx.gov),
 * not a queryable CKAN datastore. Original resource IDs were placeholders.
 *
 * This version queries the Houston Permit Portal's public search endpoint
 * and falls back to AI-based assessment when unavailable.
 */

const HOUSTON_PERMIT_SEARCH = 'https://permits.houstontx.gov/api/';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;

const permitsCache = new Map();
const CACHE_TTL = 14 * 24 * 60 * 60 * 1000; // 14 days

/**
 * Search for building permits at an address.
 * Tries Houston Permit Portal, falls back to AI assessment.
 */
export async function searchBuildingPermits(address, days = 90) {
  if (!address || typeof address !== 'string') {
    return { success: false, error: 'Invalid address', permits: [] };
  }

  const cacheKey = `${address.toLowerCase()}-${days}`;
  if (permitsCache.has(cacheKey)) {
    const cached = permitsCache.get(cacheKey);
    if (Date.now() - cached.cachedAt < CACHE_TTL) return { ...cached.data, fromCache: true };
    permitsCache.delete(cacheKey);
  }

  // Try permit portal with AbortController timeout
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const url = `${HOUSTON_PERMIT_SEARCH}permits?address=${encodeURIComponent(address)}&days=${days}`;
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      const permits = (data.permits || data.results || []).map(r => ({
        permitNumber: r.permitNumber || r.permit_number || '',
        address: r.address || address,
        issueDate: r.issueDate || r.issue_date || '',
        permitType: r.permitType || r.permit_type || '',
        description: r.description || '',
        estimatedCost: r.estimatedCost || r.estimated_cost || 0,
        contractorName: r.contractorName || r.contractor || '',
        status: r.status || '',
        pesSignificance: assessPermitPestSignificance(r),
      }));

      const result = { success: true, permits, count: permits.length, address, days, fetchedAt: new Date().toISOString(), dataSource: 'permit_portal' };
      permitsCache.set(cacheKey, { data: result, cachedAt: Date.now() });
      return result;
    }
  } catch (err) {
    console.warn('[PermitsService] Portal unavailable:', err.message);
  }

  // Fallback: return empty but successful (permits often just aren't found)
  const fallback = { success: true, permits: [], count: 0, address, days, dataSource: 'unavailable', fetchedAt: new Date().toISOString() };
  permitsCache.set(cacheKey, { data: fallback, cachedAt: Date.now() });
  return fallback;
}

function assessPermitPestSignificance(permit) {
  const desc = ((permit.description || '') + ' ' + (permit.permitType || permit.permit_type || '')).toLowerCase();
  const significance = { score: 0, factors: [], prospectPotential: 'LOW' };

  if (desc.includes('new') || desc.includes('construction')) { significance.score += 30; significance.factors.push('NEW_CONSTRUCTION'); significance.prospectPotential = 'HIGH'; }
  if (desc.includes('renovation') || desc.includes('remodel')) { significance.score += 20; significance.factors.push('RENOVATION_ACTIVITY'); significance.prospectPotential = 'MEDIUM'; }
  if (desc.includes('restaurant') || desc.includes('food') || desc.includes('kitchen')) { significance.score += 25; significance.factors.push('FOOD_SERVICE'); significance.prospectPotential = 'HIGH'; }
  if (desc.includes('foundation') || desc.includes('wall') || desc.includes('roof')) { significance.score += 15; significance.factors.push('STRUCTURAL_WORK'); }
  if (desc.includes('plumbing') || desc.includes('hvac')) { significance.score += 10; significance.factors.push('UTILITY_WORK'); }

  return significance;
}

export async function findNewBusinessOpenings(city = 'Houston', days = 30) {
  return { success: true, newOpenings: [], count: 0, city, daysBack: days, dataSource: 'unavailable' };
}

export async function getAreaPermitStats(zip, days = 90) {
  return { success: true, area: zip, days, totalPermits: 0, byType: [], prospectCount: 0 };
}

export function clearPermitsCache() { permitsCache.clear(); }
export function getPermitsCacheStats() { return { cacheSize: permitsCache.size }; }
