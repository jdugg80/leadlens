/**
 * Enrichment Provider Registry
 * 
 * Central registry for all enrichment providers. To add a new provider:
 * 1. Create a provider file implementing the interface
 * 2. Import and register it here
 * 3. Set ENRICHMENT_PROVIDER env var to the provider name (optional)
 * 
 * Provider priority: first available provider wins.
 * Set ENRICHMENT_PROVIDER to override (e.g. "BizCollect", "Cleanlist").
 */

import * as bizcollect from './bizcollectProvider';

const providers = [
  bizcollect,
  // Add more providers here as they're built:
  // import * as cleanlist from './cleanlistProvider';
  // import * as openmart from './openmartProvider';
];

const PROVIDER_OVERRIDE = process.env.EXPO_PUBLIC_ENRICHMENT_PROVIDER || '';

/**
 * Get the active enrichment provider.
 * Returns the first available provider, or the one specified by env var.
 */
export function getActiveProvider() {
  // If a specific provider is configured, use it
  if (PROVIDER_OVERRIDE) {
    const named = providers.find(p => p.getProviderName() === PROVIDER_OVERRIDE);
    if (named && named.isAvailable()) return named;
    console.warn(`[Enrichment] Configured provider "${PROVIDER_OVERRIDE}" not available, falling back`);
  }

  // Otherwise use first available
  return providers.find(p => p.isAvailable()) || null;
}

/**
 * Search for business contacts using the active provider.
 * @param {import('./providerInterface').BusinessQuery} query
 * @returns {Promise<import('./providerInterface').EnrichmentResult|null>}
 */
export async function searchContacts(query) {
  const provider = getActiveProvider();
  if (!provider) {
    console.log('[Enrichment] No contact enrichment provider available');
    return null;
  }

  console.log(`[Enrichment] Using provider: ${provider.getProviderName()}`);
  return provider.search(query);
}

/**
 * List all registered providers and their availability status.
 */
export function getProviderStatus() {
  return providers.map(p => ({
    name: p.getProviderName(),
    available: p.isAvailable(),
    active: p === getActiveProvider(),
  }));
}
