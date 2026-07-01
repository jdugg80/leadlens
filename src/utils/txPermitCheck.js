// src/utils/txPermitCheck.js
// Texas Comptroller sales tax permit status check
// API key stored in AsyncStorage under TX_COMPTROLLER_API_KEY

import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = 'https://api.comptroller.texas.gov/public-data/v1/public';
const API_KEY_STORAGE = 'TX_COMPTROLLER_API_KEY';

// Cache results in memory during session to avoid hammering the API
const _cache = {};

async function getApiKey() {
  try {
    return await AsyncStorage.getItem(API_KEY_STORAGE);
  } catch {
    return null;
  }
}

/**
 * Check permit status for a business by name and optional zip code.
 * Returns: { status: 'active' | 'inactive' | 'not_found' | 'error', data: {...} }
 */
export async function checkPermitStatus(businessName, zipCode = null) {
  if (!businessName) return { status: 'error', data: null };

  const cacheKey = `${businessName}|${zipCode}`;
  if (_cache[cacheKey]) return _cache[cacheKey];

  const apiKey = await getApiKey();
  if (!apiKey) return { status: 'no_key', data: null };

  try {
    // Build query — search by location name + optional zip
    const params = new URLSearchParams({ LOCATION_NAME: businessName.toUpperCase() });
    if (zipCode) params.append('ZIPCODE', zipCode);

    const response = await fetch(
      `${BASE_URL}/sales-tax-payer-location?${params.toString()}`,
      {
        headers: { 'x-api-key': apiKey },
        timeout: 8000,
      }
    );

    if (response.status === 403) return { status: 'no_key', data: null };
    if (!response.ok) return { status: 'error', data: null };

    const json = await response.json();
    const results = json?.data || json?.results || [];

    if (!results.length) {
      const result = { status: 'not_found', data: null };
      _cache[cacheKey] = result;
      return result;
    }

    // Find best match — prefer exact name match
    const upper = businessName.toUpperCase();
    const match =
      results.find((r) => r.LOCATION_NAME?.toUpperCase() === upper) ||
      results[0];

    const isActive =
      match.PERMIT_STATUS?.toUpperCase() === 'ACTIVE' ||
      match.STATUS?.toUpperCase() === 'ACTIVE' ||
      match.ACTIVE === true;

    const result = {
      status: isActive ? 'active' : 'inactive',
      data: {
        businessName: match.LOCATION_NAME || match.TAXPAYER_NAME,
        address: match.LOCATION_ADDRESS,
        city: match.LOCATION_CITY,
        zip: match.LOCATION_ZIP,
        taxpayerId: match.TAXPAYER_NUMBER,
        permitStatus: match.PERMIT_STATUS || match.STATUS,
      },
    };

    _cache[cacheKey] = result;
    return result;
  } catch (e) {
    console.warn('[txPermitCheck] Error:', e.message);
    return { status: 'error', data: null };
  }
}

/**
 * Save the API key to AsyncStorage
 */
export async function saveTxApiKey(key) {
  await AsyncStorage.setItem(API_KEY_STORAGE, key);
}

/**
 * Clear session cache (call on logout)
 */
export function clearPermitCache() {
  Object.keys(_cache).forEach((k) => delete _cache[k]);
}
