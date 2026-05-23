/**
 * Nominatim Geocoding Service
 * Validates and geocodes addresses using free OpenStreetMap Nominatim API
 * Optimized for speed with caching and rate limiting
 */

// Simple in-memory cache for geocoding results
const geocodeCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Rate limiting: max 1 request per second to comply with Nominatim policy
let lastRequestTime = 0;
const REQUEST_DELAY = 1000; // 1 second minimum

/**
 * Add delay to respect Nominatim rate limits
 * @private
 */
async function respectRateLimit() {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < REQUEST_DELAY) {
    await new Promise(resolve => 
      setTimeout(resolve, REQUEST_DELAY - timeSinceLastRequest)
    );
  }
  
  lastRequestTime = Date.now();
}

/**
 * Geocode a single address
 * @param {string} address - Address to geocode
 * @returns {promise} { lat, lng, formatted, confidence, raw }
 */
export async function geocodeAddress(address) {
  if (!address || typeof address !== 'string') {
    return { success: false, error: 'Invalid address' };
  }

  const cleanAddress = address.trim();
  const cacheKey = cleanAddress.toLowerCase();

  // Check cache first
  if (geocodeCache.has(cacheKey)) {
    const cached = geocodeCache.get(cacheKey);
    if (Date.now() - cached.cachedAt < CACHE_TTL) {
      return cached.result;
    } else {
      geocodeCache.delete(cacheKey);
    }
  }

  try {
    // Respect rate limits
    await respectRateLimit();

    const encodedAddress = encodeURIComponent(cleanAddress);
    const url = `https://nominatim.openstreetmap.org/search?q=${encodedAddress}&format=json&limit=1`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'LeadLens-PestControl-App/1.0',
      },
      timeout: 5000,
    });

    if (!response.ok) {
      throw new Error(`Nominatim API error: ${response.status}`);
    }

    const data = await response.json();

    if (!Array.isArray(data) || data.length === 0) {
      const result = { 
        success: false, 
        error: 'Address not found',
        address: cleanAddress,
      };
      
      // Cache negative results for shorter period
      geocodeCache.set(cacheKey, {
        result,
        cachedAt: Date.now(),
      });
      
      return result;
    }

    const match = data[0];
    const result = {
      success: true,
      address: cleanAddress,
      latitude: parseFloat(match.lat),
      longitude: parseFloat(match.lon),
      formatted: match.display_name,
      boundingBox: match.boundingbox,
      placeType: match.type,
      confidence: calculateConfidence(match),
      raw: match,
    };

    // Cache successful result
    geocodeCache.set(cacheKey, {
      result,
      cachedAt: Date.now(),
    });

    return result;
  } catch (error) {
    console.error('Geocoding error:', error);
    return {
      success: false,
      error: error.message,
      address: cleanAddress,
    };
  }
}

/**
 * Geocode multiple addresses
 * Respects rate limits between requests
 * @param {array} addresses - Array of address strings
 * @returns {promise} Array of geocode results
 */
export async function geocodeAddresses(addresses) {
  if (!Array.isArray(addresses)) return [];

  const results = [];
  
  for (const address of addresses) {
    try {
      const result = await geocodeAddress(address);
      results.push(result);
    } catch (error) {
      results.push({ success: false, error: error.message, address });
    }
  }

  return results;
}

/**
 * Validate address format and completeness
 * @param {string} address - Address to validate
 * @returns {object} { isValid, issues, format }
 */
export function validateAddressFormat(address) {
  if (!address || typeof address !== 'string') {
    return { isValid: false, issues: ['Empty address'], format: null };
  }

  const issues = [];
  const words = address.trim().split(/\s+/);

  // Check length
  if (words.length < 3) {
    issues.push('Address too short');
  }

  // Check for street indicators
  const streetKeywords = ['st', 'street', 'ave', 'avenue', 'rd', 'road', 'blvd', 'boulevard', 'ln', 'lane', 'dr', 'drive'];
  const hasStreet = streetKeywords.some(keyword => 
    address.toLowerCase().includes(keyword)
  );

  if (!hasStreet && words.length < 5) {
    issues.push('May be incomplete (missing street/avenue)');
  }

  // Check for numbers (house number or zip)
  const hasNumbers = /\d/.test(address);
  if (!hasNumbers) {
    issues.push('No street number or zip code found');
  }

  return {
    isValid: issues.length === 0,
    issues,
    format: inferAddressFormat(address),
  };
}

/**
 * Infer address format (street, city, state, zip)
 * @private
 */
function inferAddressFormat(address) {
  const parts = address.split(/,|;/);
  return {
    street: parts[0]?.trim() || null,
    city: parts[1]?.trim() || null,
    stateZip: parts[2]?.trim() || null,
  };
}

/**
 * Calculate confidence score for geocoding result
 * @private
 */
function calculateConfidence(nominatimResult) {
  let score = 50;

  // Boost for exact matches
  if (nominatimResult.type === 'house' || nominatimResult.type === 'building') {
    score += 40;
  } else if (nominatimResult.type === 'street') {
    score += 30;
  } else if (nominatimResult.type === 'city') {
    score += 15;
  }

  // Adjust based on importance
  if (nominatimResult.importance) {
    score += nominatimResult.importance * 10;
  }

  return Math.min(Math.round(score), 100);
}

/**
 * Extract location from enriched business card data
 * @param {object} enrichedData - Data from businessCardEnricher
 * @returns {promise} Geocoded location data
 */
export async function extractLocationFromBusinessCard(enrichedData) {
  if (!enrichedData?.address) {
    return { success: false, error: 'No address found' };
  }

  const address = enrichedData.address;
  const validation = validateAddressFormat(address);

  const geocoded = await geocodeAddress(address);

  return {
    ...geocoded,
    validation,
    enrichedData: enrichedData ? { 
      businessType: enrichedData.businessInfo?.type,
      pestRiskScore: enrichedData.businessInfo?.pestRiskScore,
    } : null,
  };
}

/**
 * Clear geocode cache
 */
export function clearGeocodeCache() {
  geocodeCache.clear();
}

/**
 * Get cache stats
 */
export function getGeocachStats() {
  return {
    cacheSize: geocodeCache.size,
    cacheEntries: Array.from(geocodeCache.keys()),
  };
}

/**
 * Batch geocode with progress callback
 * @param {array} addresses - Addresses to geocode
 * @param {function} onProgress - Callback with { current, total }
 * @returns {promise} Array of results
 */
export async function batchGeocodeWithProgress(addresses, onProgress) {
  if (!Array.isArray(addresses)) return [];

  const results = [];

  for (let i = 0; i < addresses.length; i++) {
    const result = await geocodeAddress(addresses[i]);
    results.push(result);
    
    if (onProgress) {
      onProgress({ current: i + 1, total: addresses.length });
    }
  }

  return results;
}
