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
    console.error('extract-prospect function error:', error);
    throw new Error('Extraction failed. Please try again.');
  }

  if (!data?.ok) {
    console.error('extract-prospect returned error:', data);
    throw new Error('Extraction failed. Please try again.');
  }

  return data.result;
}
