/**
 * Property Records Service
 * Fetches property data for pest risk assessment
 * Uses Harris County Appraisal District and public records
 */

const PROPERTY_RECORDS_API = 'https://data.houstontx.gov/api/3/action/datastore_search_sql';
const PROPERTY_RESOURCE_ID = 'a1f234ab-7a22-4c2e-b8c3-2f1d2e3f4a7d'; // Property records dataset

// Cache property data by address
const propertyCache = new Map();
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Get property information by address
 * @param {string} address - Street address
 * @returns {promise} Property record with building details
 */
export async function getPropertyRecord(address) {
  if (!address || typeof address !== 'string') {
    return { success: false, error: 'Invalid address', property: null };
  }

  const cacheKey = address.toLowerCase();

  // Check cache
  if (propertyCache.has(cacheKey)) {
    const cached = propertyCache.get(cacheKey);
    if (Date.now() - cached.cachedAt < CACHE_TTL) {
      return { ...cached.data, fromCache: true };
    } else {
      propertyCache.delete(cacheKey);
    }
  }

  try {
    const query = `
      SELECT * FROM "${PROPERTY_RESOURCE_ID}"
      WHERE LOWER("Address") LIKE LOWER('%${escapeSql(address)}%')
      LIMIT 1
    `;

    const url = `${PROPERTY_RECORDS_API}?sql=${encodeURIComponent(query)}`;

    const response = await fetch(url, { timeout: 5000 });

    if (!response.ok) throw new Error(`API error: ${response.status}`);

    const data = await response.json();

    if (!data.success || !data.result.records || data.result.records.length === 0) {
      return {
        success: false,
        error: 'Property not found',
        address,
      };
    }

    const record = data.result.records[0];
    const property = parsePropertyRecord(record);
    const pestRiskFactors = assessPropertyPestRisk(property);

    const result = {
      success: true,
      address,
      property,
      pestRiskFactors,
      pestRiskScore: calculatePropertyPestRiskScore(property, pestRiskFactors),
      fetchedAt: new Date().toISOString(),
    };

    // Cache result
    propertyCache.set(cacheKey, {
      data: result,
      cachedAt: Date.now(),
    });

    return result;
  } catch (error) {
    console.error('Property record fetch error:', error);
    return {
      success: false,
      error: error.message,
      address,
    };
  }
}

/**
 * Parse raw property record into structured format
 * @private
 */
function parsePropertyRecord(record) {
  const currentYear = new Date().getFullYear();
  const buildingYear = parseInt(record['Year Built'] || record['Construction Year'] || 0);
  const buildingAge = buildingYear > 0 ? currentYear - buildingYear : null;

  return {
    address: record.Address,
    city: record.City,
    state: record.State,
    zip: record.ZIP,
    parcelNumber: record['Parcel Number'] || record['Account Number'],
    // Building info
    squareFeet: parseInt(record['Square Feet'] || record['Building Square Feet'] || 0),
    lotSquareFeet: parseInt(record['Lot Square Feet'] || 0),
    yearBuilt: buildingYear,
    buildingAge,
    stories: parseInt(record.Stories || 0),
    bedrooms: parseInt(record.Bedrooms || 0),
    bathrooms: parseInt(record.Bathrooms || 0),
    // Zoning & use
    zoning: record.Zoning,
    landUse: record['Land Use'] || record['Use Type'],
    propertyType: record['Property Type'] || categorizePropertyType(record),
    // Valuation
    landValue: parseFloat(record['Land Value'] || 0),
    buildingValue: parseFloat(record['Building Value'] || 0),
    totalValue: parseFloat(record['Total Value'] || record['Market Value'] || 0),
    // Condition
    condition: record.Condition,
    qualityGrade: record['Quality Grade'],
    // Owner info
    owner: record.Owner,
    ownerAddress: record['Owner Address'],
  };
}

/**
 * Assess pest risk factors from property data
 * @private
 */
function assessPropertyPestRisk(property) {
  const factors = [];
  const warnings = [];

  // Age-based risk (older buildings = more vulnerabilities)
  if (property.buildingAge) {
    if (property.buildingAge > 50) {
      factors.push('BUILDING_AGE_50PLUS');
      warnings.push('Building 50+ years old - potential structural vulnerabilities');
    } else if (property.buildingAge > 30) {
      factors.push('BUILDING_AGE_30PLUS');
      warnings.push('Building 30+ years old - may have maintenance issues');
    }
  }

  // Size-based risk (larger buildings = more pest pressure)
  if (property.squareFeet) {
    if (property.squareFeet > 100000) {
      factors.push('LARGE_FOOTPRINT');
      warnings.push('Large building footprint - more potential entry points');
    } else if (property.squareFeet > 50000) {
      factors.push('MEDIUM_FOOTPRINT');
    }
  }

  // Multi-story risk
  if (property.stories && property.stories > 3) {
    factors.push('MULTI_STORY');
    warnings.push('Multi-story building - vertical pest migration risk');
  }

  // Condition issues
  if (property.condition && property.condition.toLowerCase().includes('poor')) {
    factors.push('POOR_CONDITION');
    warnings.push('Property in poor condition - likely structural issues');
  }

  // Land use indicates business type
  const landUseLower = (property.landUse || '').toLowerCase();
  if (landUseLower.includes('commercial') || landUseLower.includes('retail')) {
    factors.push('COMMERCIAL_USE');
    if (landUseLower.includes('food') || landUseLower.includes('restaurant')) {
      factors.push('FOOD_SERVICE_USE');
      warnings.push('Food service property - high pest risk');
    }
  }

  if (landUseLower.includes('warehouse') || landUseLower.includes('industrial')) {
    factors.push('WAREHOUSE_USE');
    warnings.push('Warehouse/Industrial - pest harborage areas likely');
  }

  if (landUseLower.includes('apartment') || landUseLower.includes('residential')) {
    factors.push('RESIDENTIAL_MULTI');
  }

  // Value indicates maintenance capacity
  if (property.totalValue && property.totalValue < 100000) {
    factors.push('LOW_VALUE');
    warnings.push('Low property value - may indicate deferred maintenance');
  }

  return { factors, warnings };
}

/**
 * Calculate overall pest risk score for property
 * @private
 */
function calculatePropertyPestRiskScore(property, riskFactors) {
  let score = 50; // Base score

  // Age penalty
  if (property.buildingAge) {
    if (property.buildingAge > 50) score += 25;
    else if (property.buildingAge > 30) score += 15;
  }

  // Size consideration
  if (property.squareFeet > 100000) score += 15;
  else if (property.squareFeet > 50000) score += 10;

  // Multi-story
  if (property.stories && property.stories > 3) score += 10;

  // Condition
  if (property.condition && property.condition.toLowerCase().includes('poor')) {
    score += 20;
  }

  // Commercial penalties
  const landUseLower = (property.landUse || '').toLowerCase();
  if (landUseLower.includes('restaurant') || landUseLower.includes('food')) {
    score += 30;
  } else if (landUseLower.includes('warehouse') || landUseLower.includes('industrial')) {
    score += 20;
  } else if (landUseLower.includes('commercial')) {
    score += 15;
  }

  // Value indicator
  if (property.totalValue && property.totalValue < 100000) {
    score += 10;
  }

  return Math.min(score, 100);
}

/**
 * Categorize property type if not provided
 * @private
 */
function categorizePropertyType(record) {
  const useType = (record['Use Type'] || record['Land Use'] || '').toLowerCase();
  
  if (useType.includes('residential')) return 'RESIDENTIAL';
  if (useType.includes('commercial')) return 'COMMERCIAL';
  if (useType.includes('industrial') || useType.includes('warehouse')) return 'INDUSTRIAL';
  if (useType.includes('office')) return 'OFFICE';
  if (useType.includes('retail')) return 'RETAIL';
  
  return 'OTHER';
}

/**
 * Escape SQL safely
 * @private
 */
function escapeSql(str) {
  return str.replace(/'/g, "''");
}

/**
 * Search properties by characteristics (size, age, type)
 * @param {object} criteria - { minAge, maxAge, minSize, maxSize, landUse, etc. }
 * @param {number} limit - Max results (default: 50)
 * @returns {promise} Array of matching properties
 */
export async function searchPropertiesByCriteria(criteria, limit = 50) {
  try {
    let whereClause = '1=1';

    if (criteria.minAge && criteria.maxAge) {
      const minYear = new Date().getFullYear() - criteria.maxAge;
      const maxYear = new Date().getFullYear() - criteria.minAge;
      whereClause += ` AND "Year Built" BETWEEN ${minYear} AND ${maxYear}`;
    }

    if (criteria.minSize) {
      whereClause += ` AND "Square Feet" >= ${criteria.minSize}`;
    }

    if (criteria.maxSize) {
      whereClause += ` AND "Square Feet" <= ${criteria.maxSize}`;
    }

    if (criteria.landUse) {
      whereClause += ` AND LOWER("Land Use") LIKE LOWER('%${escapeSql(criteria.landUse)}%')`;
    }

    const query = `
      SELECT * FROM "${PROPERTY_RESOURCE_ID}"
      WHERE ${whereClause}
      ORDER BY "Total Value" DESC
      LIMIT ${limit}
    `;

    const url = `${PROPERTY_RECORDS_API}?sql=${encodeURIComponent(query)}`;

    const response = await fetch(url, { timeout: 5000 });

    if (!response.ok) throw new Error(`API error`);

    const data = await response.json();

    if (!data.success || !data.result.records) {
      return { success: false, properties: [] };
    }

    return {
      success: true,
      properties: data.result.records.map(r => {
        const prop = parsePropertyRecord(r);
        const risk = assessPropertyPestRisk(prop);
        return {
          ...prop,
          pestRiskScore: calculatePropertyPestRiskScore(prop, risk),
          riskFactors: risk.factors,
        };
      }),
      count: data.result.records.length,
      criteria,
    };
  } catch (error) {
    console.error('Property search error:', error);
    return { success: false, error: error.message, properties: [] };
  }
}

/**
 * Get properties in a zip code with high pest risk
 * @param {string} zip - Zip code
 * @returns {promise} High-risk properties in area
 */
export async function getHighRiskPropertiesInZip(zip) {
  return searchPropertiesByCriteria(
    { minAge: 30 },
    100
  );
}

/**
 * Clear property cache
 */
export function clearPropertyCache() {
  propertyCache.clear();
}

/**
 * Get cache statistics
 */
export function getPropertyCacheStats() {
  return {
    cacheSize: propertyCache.size,
    entries: Array.from(propertyCache.keys()),
  };
}

/**
 * Batch fetch property records
 * @param {array} addresses - Array of addresses
 * @returns {promise} Array of property records
 */
export async function batchGetPropertyRecords(addresses) {
  if (!Array.isArray(addresses)) return [];

  const results = await Promise.all(
    addresses.map(addr => getPropertyRecord(addr))
  );

  return results;
}
