import { supabase } from '../lib/supabase';

/**
 * Calls the Supabase Edge Function 'extract-prospect' to process an image or text
 * using Claude AI without exposing API keys on the client.
 *
 * @param {Object} options
 * @param {string} [options.imageBase64] - Optional base64 encoded image data
 * @param {string} [options.mimeType] - MIME type of the image (default 'image/jpeg')
 * @param {string} [options.text] - Optional raw text to process
 * @param {string} [options.mode] - Extraction mode ('leadlock', 'card', 'manual')
 * @param {string} [options.context] - Additional context for the AI
 * @returns {Promise<Object|null>} Structured prospect data or null if failed
 */
export async function extractProspectAI({
  imageBase64,
  mimeType = 'image/jpeg',
  text = '',
  mode = 'leadlock',
  context = '',
}) {
  const { data, error } = await supabase.functions.invoke('extract-prospect', {
    body: {
      imageBase64,
      mimeType,
      text,
      mode,
      context,
    },
  });

    if (error) {
    // supabase-js only puts a generic message on error.message for a
    // non-2xx response — the actual error body the Edge Function returned
    // (which extract-prospect deliberately includes) is on error.context,
    // the raw Response object. Without reading it, the real reason (e.g.
    // the actual Anthropic API error) never reaches any log at all.
    let detail = error.message || JSON.stringify(error);
    try {
      if (error.context && typeof error.context.json === 'function') {
        const body = await error.context.json();
        detail = JSON.stringify(body);
      }
    } catch (parseErr) {
      // Response body couldn't be read/parsed — fall back to the generic message.
    }
    console.error('extract-prospect function error:', detail);
    throw new Error(`extract-prospect failed: ${detail}`);
  }

  if (!data?.ok) {
    const detail = JSON.stringify(data).slice(0, 200);
    console.error('extract-prospect returned error:', detail);
    throw new Error(`extract-prospect returned error: ${detail}`);
  }

  return data.result;
}

/**
 * Extracts a list of addresses/businesses from an image or PDF document —
 * used for bulk address import (route planning, territory-filtered
 * opportunity import), as opposed to the single-business extraction
 * extractProspectAI() above is built for.
 *
 * @param {Object} options
 * @param {string} [options.imageBase64] - Optional base64 encoded image data
 * @param {string} [options.mimeType] - MIME type of the image (default 'image/jpeg')
 * @param {string} [options.pdfBase64] - Optional base64 encoded PDF data
 * @param {string} [options.context] - Additional context for the AI
 * @returns {Promise<{businessName: string, rawAddress: string}[]>}
 */
export async function extractAddressListFromDocument({
  imageBase64,
  mimeType = 'image/jpeg',
  pdfBase64,
  context = '',
}) {
  const { data, error } = await supabase.functions.invoke('extract-prospect', {
    body: {
      imageBase64,
      mimeType,
      pdfBase64,
      mode: 'address-list',
      context,
    },
  });

  if (error) {
    let detail = error.message || JSON.stringify(error);
    try {
      if (error.context && typeof error.context.json === 'function') {
        const body = await error.context.json();
        detail = JSON.stringify(body);
      }
    } catch (parseErr) {
      // Response body couldn't be read/parsed — fall back to the generic message.
    }
    console.error('extract-prospect (address-list) function error:', detail);
    throw new Error(`extract-prospect failed: ${detail}`);
  }

  if (!data?.ok) {
    const detail = JSON.stringify(data).slice(0, 200);
    console.error('extract-prospect (address-list) returned error:', detail);
    throw new Error(`extract-prospect returned error: ${detail}`);
  }

  const addresses = Array.isArray(data.result?.addresses) ? data.result.addresses : [];
  return addresses.map((a) => ({
    businessName: String(a.businessName || '').trim(),
    rawAddress: String(a.address || '').trim(),
  })).filter((e) => e.rawAddress);
}