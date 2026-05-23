/**
 * Health Department Violations Service
 * Fetches food service inspection violations from Houston CKAN API
 * Optimized for speed with caching and batch processing
 */

const HOUSTON_CKAN_API = 'https://data.houstontx.gov/api/3/action/datastore_search_sql';
const RESOURCE_ID = 'a1f234ab-7a22-4c2e-b8c3-2f1d2e3f4a5b'; // Houston Health violations dataset

// Cache violations by business name
const violationsCache = new Map();
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Search for health violations by business name
 * @param {string} businessName - Business name to search for
 * @param {string} city - City (default: Houston)
 * @returns {promise} Array of violation records
 */
export async function searchHealthViolations(businessName, city = 'Houston') {
  if (!businessName || typeof businessName !== 'string') {
    return { success: false, error: 'Invalid business name', violations: [] };
  }

  const cacheKey = `${businessName.toLowerCase()}-${city.toLowerCase()}`;

  // Check cache first
  if (violationsCache.has(cacheKey)) {
    const cached = violationsCache.get(cacheKey);
    if (Date.now() - cached.cachedAt < CACHE_TTL) {
      return { ...cached.data, fromCache: true };
    } else {
      violationsCache.delete(cacheKey);
    }
  }

  try {
    // Build SQL query for CKAN
    const query = `
      SELECT * FROM "${RESOURCE_ID}"
      WHERE LOWER("Establishment Name") LIKE LOWER('%${escapeSql(businessName)}%')
      AND LOWER(City) LIKE LOWER('%${escapeSql(city)}%')
      ORDER BY "Inspection Date" DESC
      LIMIT 50
    `;

    const url = `${HOUSTON_CKAN_API}?sql=${encodeURIComponent(query)}`;

    const response = await fetch(url, {
      timeout: 5000,
    });

    if (!response.ok) {
      throw new Error(`CKAN API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.success || !data.result || !data.result.records) {
      return {
        success: false,
        error: 'No violations found',
        violations: [],
        businessName,
        city,
      };
    }

    const violations = data.result.records.map(record => ({
      id: record.Violation_ID || record.id,
      businessName: record['Establishment Name'],
      address: record.Address,
      city: record.City,
      zip: record.ZIP,
      inspectionDate: record['Inspection Date'],
      violationType: record['Violation Type'],
      description: record.Description,
      severity: categorizeViolationSeverity(record.Description),
      riskFactors: extractRiskFactors(record.Description),
    }));

    const result = {
      success: true,
      violations,
      count: violations.length,
      businessName,
      city,
      fetchedAt: new Date().toISOString(),
    };

    // Cache result
    violationsCache.set(cacheKey, {
      data: result,
      cachedAt: Date.now(),
    });

    return result;
  } catch (error) {
    console.error('Health violations fetch error:', error);
    return {
      success: false,
      error: error.message,
      violations: [],
      businessName,
      city,
    };
  }
}

/**
 * Get violations by address/zip
 * @param {string} address - Address to search
 * @returns {promise} Violations for that address
 */
export async function getViolationsByAddress(address) {
  if (!address) return { success: false, error: 'Invalid address', violations: [] };

  try {
    const query = `
      SELECT * FROM "${RESOURCE_ID}"
      WHERE LOWER(Address) LIKE LOWER('%${escapeSql(address)}%')
      ORDER BY "Inspection Date" DESC
      LIMIT 100
    `;

    const url = `${HOUSTON_CKAN_API}?sql=${encodeURIComponent(query)}`;

    const response = await fetch(url, { timeout: 5000 });

    if (!response.ok) throw new Error(`CKAN error: ${response.status}`);

    const data = await response.json();

    if (!data.success || !data.result.records) {
      return { success: false, violations: [] };
    }

    return {
      success: true,
      violations: data.result.records.map(r => ({
        businessName: r['Establishment Name'],
        address: r.Address,
        violationType: r['Violation Type'],
        description: r.Description,
        severity: categorizeViolationSeverity(r.Description),
        date: r['Inspection Date'],
      })),
      count: data.result.records.length,
    };
  } catch (error) {
    console.error('Address violations error:', error);
    return { success: false, error: error.message, violations: [] };
  }
}

/**
 * Categorize violation severity based on description
 * @private
 */
function categorizeViolationSeverity(description) {
  if (!description) return 'UNKNOWN';

  const desc = description.toLowerCase();

  // Critical violations
  if (desc.includes('rodent') || desc.includes('mouse') || desc.includes('rat') ||
      desc.includes('pest') || desc.includes('contamination') || 
      desc.includes('filth') || desc.includes('vermin')) {
    return 'CRITICAL_PEST';
  }

  if (desc.includes('temperature') || desc.includes('storage') || 
      desc.includes('handwash') || desc.includes('cross')) {
    return 'CRITICAL';
  }

  // Major violations
  if (desc.includes('clean') || desc.includes('sanit') || desc.includes('health')) {
    return 'MAJOR';
  }

  // Minor violations
  return 'MINOR';
}

/**
 * Extract pest-related risk factors from violation description
 * @private
 */
function extractRiskFactors(description) {
  if (!description) return [];

  const factors = [];
  const desc = description.toLowerCase();

  // Pest indicators
  if (desc.includes('rodent') || desc.includes('mouse') || desc.includes('rat')) {
    factors.push('RODENT_EVIDENCE');
  }
  if (desc.includes('roach') || desc.includes('cockroach')) {
    factors.push('ROACH_EVIDENCE');
  }
  if (desc.includes('insect') || desc.includes('pest')) {
    factors.push('PEST_EVIDENCE');
  }
  if (desc.includes('web') || desc.includes('spider')) {
    factors.push('WEB_EVIDENCE');
  }

  // Conditions favorable to pests
  if (desc.includes('clutter') || desc.includes('dirty') || desc.includes('filth')) {
    factors.push('UNSANITARY_CONDITIONS');
  }
  if (desc.includes('water') || desc.includes('leak') || desc.includes('moisture')) {
    factors.push('MOISTURE_PRESENT');
  }
  if (desc.includes('gap') || desc.includes('crack') || desc.includes('hole')) {
    factors.push('STRUCTURAL_VULNERABILITIES');
  }

  return factors;
}

/**
 * Escape SQL string for safe query
 * @private
 */
function escapeSql(str) {
  return str.replace(/'/g, "''");
}

/**
 * Get violation statistics for a business
 * @param {string} businessName - Business name
 * @returns {promise} Violation statistics
 */
export async function getViolationStats(businessName) {
  const result = await searchHealthViolations(businessName);

  if (!result.success || result.violations.length === 0) {
    return {
      businessName,
      totalViolations: 0,
      criticalCount: 0,
      majorCount: 0,
      minorCount: 0,
      riskScore: 0,
    };
  }

  const violations = result.violations;

  const stats = {
    businessName,
    totalViolations: violations.length,
    criticalCount: violations.filter(v => v.severity === 'CRITICAL' || v.severity === 'CRITICAL_PEST').length,
    majorCount: violations.filter(v => v.severity === 'MAJOR').length,
    minorCount: violations.filter(v => v.severity === 'MINOR').length,
    lastInspection: violations[0]?.inspectionDate,
    allRiskFactors: [...new Set(violations.flatMap(v => v.riskFactors))],
  };

  // Calculate risk score (0-100)
  stats.riskScore = calculateHealthRiskScore(stats);

  return stats;
}

/**
 * Calculate health-based risk score
 * @private
 */
function calculateHealthRiskScore(stats) {
  let score = 0;

  score += stats.criticalCount * 25;
  score += stats.majorCount * 10;
  score += stats.minorCount * 2;

  // Bonus if pest-related violations found
  if (stats.allRiskFactors.some(f => f.includes('PEST') || f.includes('RODENT') || f.includes('ROACH'))) {
    score += 15;
  }

  return Math.min(score, 100);
}

/**
 * Clear violations cache
 */
export function clearViolationsCache() {
  violationsCache.clear();
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  return {
    cacheSize: violationsCache.size,
    entries: Array.from(violationsCache.keys()),
  };
}

/**
 * Batch search violations for multiple businesses
 * @param {array} businessNames - Array of business names
 * @returns {promise} Array of results
 */
export async function batchSearchViolations(businessNames) {
  if (!Array.isArray(businessNames)) return [];

  const results = await Promise.all(
    businessNames.map(name => searchHealthViolations(name))
  );

  return results;
}
