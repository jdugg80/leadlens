const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_KEY = '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';

/**
 * Enrich a lead by asking Claude to fill in missing fields
 * using the business name and any known info as context.
 */
export async function enrichLead(partialLead) {
  const known = Object.entries(partialLead)
    .filter(([k, v]) => v && !['captureMethod', 'imageUri', 'status', 'propertyType'].includes(k))
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

  const missing = ['businessName', 'pocFirst', 'pocLast', 'phone', 'email', 'streetNumber', 'streetName', 'city', 'state', 'zip']
    .filter(k => !partialLead[k]);

  if (!missing.length) return partialLead;

  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `You are a business data enrichment assistant. Based on the known information below, try to infer or suggest the missing fields for this business lead. Only fill in fields you are reasonably confident about based on the known data. Do not invent information.

Known information:
${known}

Missing fields to fill if possible: ${missing.join(', ')}

Return ONLY a raw JSON object with the missing field keys. Leave a field as empty string if you cannot confidently determine it. No markdown, no backticks.`,
      }],
    }),
  });

  if (!response.ok) return partialLead;

  const data = await response.json();
  const text = data.content?.map(b => b.text || '').join('') || '{}';
  try {
    const enriched = JSON.parse(text.replace(/```json|```/g, '').trim());
    // Only fill in fields that were actually missing
    const result = { ...partialLead };
    for (const k of missing) {
      if (enriched[k] && !result[k]) result[k] = enriched[k];
    }
    return result;
  } catch {
    return partialLead;
  }
}
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
