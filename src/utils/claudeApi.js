const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_KEY = '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';

function cleanJsonText(text = '') {
  return String(text || '').replace(/```json|```/g, '').trim();
}

async function callClaude(payload) {
  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => 'no body');
    throw new Error(`Claude API ${response.status}: ${errBody}`);
  }

  const data = await response.json();
  return data.content?.map((b) => b.text || '').join('') || '{}';
}

export async function enrichLead(partialLead) {
  const known = Object.entries(partialLead)
    .filter(([k, v]) => v && !['captureMethod', 'imageUri', 'status', 'propertyType', 'duplicateWarning'].includes(k))
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

  const missing = ['businessName', 'pocFirst', 'pocLast', 'phone', 'email', 'streetNumber', 'streetName', 'city', 'state', 'zip']
    .filter((k) => !partialLead[k]);

  if (!missing.length) return partialLead;

  try {
    const text = await callClaude({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `You are a business data enrichment assistant. Based on the known information below, try to infer or suggest the missing fields for this business lead. Only fill in fields you are reasonably confident about based on the known data. Do not invent information.\n\nKnown information:\n${known}\n\nMissing fields to fill if possible: ${missing.join(', ')}\n\nReturn ONLY a raw JSON object with the missing field keys. Leave a field as empty string if you cannot confidently determine it. No markdown, no backticks.`,
      }],
    });
    const enriched = JSON.parse(cleanJsonText(text));
    const result = { ...partialLead };
    for (const key of missing) {
      if (enriched[key] && !result[key]) result[key] = enriched[key];
    }
    return result;
  } catch {
    return partialLead;
  }
}

export async function extractLeadsFromImage(base64Image, mimeType = 'image/jpeg') {
  const text = await callClaude({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1600,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: mimeType, data: base64Image },
        },
        {
          type: 'text',
          text: `You are a lead extraction system. Analyze this image. It may contain ONE OR MORE prospects, such as multiple business cards in one photo, a list, directory, screenshot, flyer, storefront cluster, or handwritten notes.

Return ONLY raw JSON with this exact top-level shape:
{
  "leads": [
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
  ]
}

Rules:
- Extract every distinct prospect you can reasonably separate from the image.
- If only one prospect exists, return one object in the leads array.
- If a field is not present, use an empty string.
- Format phone as (XXX) XXX-XXXX if possible.
- State should be 2-letter abbreviation if possible.
- Do not merge two different businesses into one object.
- No markdown, no backticks, no explanation.`,
        },
      ],
    }],
  });

  try {
    const parsed = JSON.parse(cleanJsonText(text));
    if (Array.isArray(parsed?.leads)) return parsed.leads;
    return [];
  } catch {
    return [];
  }
}

export async function extractLeadFromImage(base64Image, mimeType = 'image/jpeg') {
  const leads = await extractLeadsFromImage(base64Image, mimeType);
  return leads[0] || {};
}


export async function extractLeadsWithDebugFromImage(base64Image, mimeType = 'image/jpeg') {
  const text = await callClaude({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1800,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Image } },
        { type: 'text', text: `You are a lead extraction system. Analyze this image. It may contain ONE OR MORE prospects, storefront signage, or handwritten notes. Return ONLY raw JSON with this exact top-level shape:
{
  "ocrSummary": "",
  "leads": [
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
  ]
}
Rules:
- Extract every distinct prospect you can reasonably separate.
- For storefront scans, prioritize business name and suite/unit clues.
- If a field is not present, use an empty string.
- Do not guess the state from weak text.
- ocrSummary should briefly describe the most visible text/clues in the image.
- No markdown, no backticks, no explanation.` },
      ],
    }],
  });
  try {
    const parsed = JSON.parse(cleanJsonText(text));
    return { leads: Array.isArray(parsed?.leads) ? parsed.leads : [], ocrSummary: parsed?.ocrSummary || '' };
  } catch {
    return { leads: [], ocrSummary: '' };
  }
}
