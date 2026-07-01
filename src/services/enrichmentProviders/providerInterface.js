/**
 * Enrichment Provider Interface
 * 
 * All enrichment providers must implement this interface.
 * Providers return a normalized EnrichmentResult that the pipeline
 * can consume regardless of the underlying data source.
 * 
 * To add a new provider:
 * 1. Create a file in this directory implementing the interface
 * 2. Register it in index.js
 * 3. Set the provider via ENRICHMENT_PROVIDER env var or config
 */

/**
 * @typedef {Object} EnrichmentResult
 * @property {string} source - Provider name (e.g. "BizCollect", "Cleanlist")
 * @property {string} sourceType - Category: "contact_enrichment", "public_record", etc.
 * @property {Object|null} contact - Best contact found
 * @property {string} [contact.firstName] 
 * @property {string} [contact.lastName]
 * @property {string} [contact.fullName]
 * @property {string} [contact.title]
 * @property {string} [contact.email]
 * @property {string} [contact.phone]
 * @property {string} [contact.sourceUrl] - Evidence URL
 * @property {Object[]} [contacts] - All contacts found
 * @property {Object} [raw] - Raw provider response for debugging
 */

/**
 * @typedef {Object} BusinessQuery
 * @property {string} businessName
 * @property {string} [city]
 * @property {string} [state]
 * @property {string} [zip]
 * @property {string} [phone]
 * @property {string} [vertical] - Business vertical/category
 * @property {number} [latitude]
 * @property {number} [longitude]
 */

/**
 * Search for business contact information.
 * 
 * @param {BusinessQuery} query - Business to look up
 * @returns {Promise<EnrichmentResult|null>} - Normalized result or null if no match
 */
export async function search(query) {
  throw new Error('Provider must implement search()');
}

/**
 * Check if this provider is configured and available.
 * @returns {boolean}
 */
export function isAvailable() {
  return false;
}

/**
 * Provider display name.
 * @returns {string}
 */
export function getProviderName() {
  return 'Unknown';
}
