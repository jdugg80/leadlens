const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_KEY = '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';

/**
 * Send an image (base64) to Claude and extract lead fields as structured JSON.
 * @param {string} base64Image  - pure base64, no data-URI prefix
 * @param {string} mimeType     - e.g. 'image/jpeg'
 * @returns {Promise<object>}   - extracted lead fields
 */
export async function extractLeadFromImage(base64Image, mimeType = 'image/jpeg') {
  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mimeType, data: base64Image },
            },
            {
              type: 'text',
              text: `You are a lead extraction system. Analyze this image (business card, storefront, screenshot, or any image with contact/business info) and extract all available lead data.

Return ONLY a raw JSON object with NO markdown, no backticks, no preamble. Use exactly these keys:
{
  "businessName": "",
  "pocFirst": "",
  "pocLast": "",
  "phone": "",
  "email": "",
  "streetNumber": "",
  "streetName": "",
  "addressLine2": "",
  "city": "",
  "state": "",
  "zip": "",
  "confidence": "high|medium|low",
  "notes": ""
}

Leave a field as empty string if not found. Format phone as (XXX) XXX-XXXX if possible. State as 2-letter abbreviation. confidence reflects overall extraction quality.`,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => 'no body');
    throw new Error(`Claude API ${response.status}: ${errBody}`);
  }

  const data = await response.json();
  const text = data.content?.map((b) => b.text || '').join('') || '{}';

  try {
    return JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch {
    return {};
  }
}
