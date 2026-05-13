const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_KEY = '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';

import { enqueueTask, TASK_TYPES } from './taskQueue';

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

  const missing = ['businessName', 'pocFirst', 'pocLast', 'phone', 'email', 'website', 'facebookUrl', 'instagramUrl', 'linkedinUrl', 'tiktokUrl', 'youtubeUrl', 'xUrl', 'streetNumber', 'streetName', 'city', 'state', 'zip']
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

export async function enqueueEnrichLead(lead) {
  return enqueueTask(TASK_TYPES.ENRICH_LEAD, { lead });
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
      "website": "",
      "facebookUrl": "",
      "instagramUrl": "",
      "linkedinUrl": "",
      "tiktokUrl": "",
      "youtubeUrl": "",
      "xUrl": "",
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
- Capture company website URL if visible.
- Capture exact social media profile URLs only if visibly present; do not guess social handles.
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


export async function extractLeadsWithDebugFromImage(base64Image, mimeType = 'image/jpeg', options = {}) {
  const { activeProfile } = options;

  let industryGuidance = '';
  if (activeProfile && activeProfile.category !== 'Pest Control') {
    industryGuidance = `
Special Focus: This user is in the ${activeProfile.category} industry (${activeProfile.label}).
Prioritize extracting prospects related to: ${activeProfile.primaryProspectTypes.join(', ')}.
Look for these specific keywords or signs in the image: ${activeProfile.searchKeywords.join(', ')}.
Also look for these specific Opportunity Signals: ${activeProfile.opportunitySignals.map(s => `${s.label} (${s.keywords.join(', ')})`).join('; ')}.
If you see these signals, mention them in the "notes" field for that lead.
`;
  }

  const text = await callClaude({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1800,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mimeType,
            data: base64Image,
          },
        },
        {
          type: 'text',
          text: `You are a lead extraction system. Analyze this image. It may contain ONE OR MORE prospects, storefront signage, or handwritten notes. ${industryGuidance}

Return ONLY raw JSON with this exact top-level shape:
{
  "ocrSummary": "",
  "leads": [
    {
      "businessName": "",
      "pocFirst": "",
      "pocLast": "",
      "phone": "",
      "email": "",
      "website": "",
      "facebookUrl": "",
      "instagramUrl": "",
      "linkedinUrl": "",
      "tiktokUrl": "",
      "youtubeUrl": "",
      "xUrl": "",
      "streetNumber": "",
      "streetName": "",
      "addressLine2": "",
      "city": "",
      "state": "",
      "zip": "",
      "confidence": "high|medium|low",
      "notes": "",
      "boundingBox": {
        "normalizedX": 0,
        "normalizedY": 0,
        "normalizedWidth": 0,
        "normalizedHeight": 0
      }
    }
  ]
}
Rules:
- Extract every distinct prospect you can reasonably separate.
- For storefront scans, prioritize business name and suite/unit clues.
- If a field is not present, use an empty string.
- Capture company website URL if visible.
- Capture exact social media profile URLs only if visibly present; do not guess social handles.
- Do not guess the state from weak text.
- ocrSummary should briefly describe the most visible text/clues in the image.
- For each lead, provide a boundingBox with normalized coordinates (0.0 to 1.0) covering the prospect's info or the business card.
- No markdown, no backticks, no explanation.`,
        },
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

export async function enqueueExtractLeadsFromImage(imageUri, mimeType = 'image/jpeg') {
  return enqueueTask(TASK_TYPES.EXTRACT_LEADS, { imageUri, mimeType });
}

export async function extractRawOcrFromImage(base64Image, mimeType = 'image/jpeg', context = {}) {
  if (!base64Image) {
    return {
      visibleTextLines: [],
      businessNameCandidates: [],
      addressCandidates: [],
      suiteCandidates: [],
      phoneCandidates: [],
      emailCandidates: [],
      websiteCandidates: [],
      notes: '',
      confidence: 'low',
      imageQuality: 'unknown',
    };
  }

  const { activeProfile } = context;
  const sourceLabel = context?.source || 'image';
  let guidance = context?.guidance || 'Prioritize visible business identity text, storefront signs, business cards, suite numbers, addresses, phone numbers, emails, and websites.';

  if (activeProfile && activeProfile.category !== 'Pest Control') {
    guidance += `\nAdditional Focus Keywords: ${activeProfile.searchKeywords.join(', ')}. Look for signage related to ${activeProfile.label}.`;
  }

  const text = await callClaude({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2200,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mimeType,
            data: base64Image,
          },
        },
        {
          type: 'text',
          text: `Read this ${sourceLabel} like a strict OCR engine for a field-sales lead capture app.

${guidance}

Return ONLY raw JSON with this exact top-level shape:
{
  "visibleTextLines": [],
  "businessNameCandidates": [],
  "addressCandidates": [],
  "suiteCandidates": [],
  "phoneCandidates": [],
  "emailCandidates": [],
  "websiteCandidates": [],
  "imageQuality": "clear|mixed|blurry|dark|glare|unknown",
  "confidence": "high|medium|low",
  "notes": ""
}

Rules:
- visibleTextLines must list readable text line-by-line, as close to exactly visible as possible.
- Do not invent missing words, names, emails, phone numbers, addresses, or URLs.
- Include partial/uncertain text in visibleTextLines and explain uncertainty in notes.
- For storefronts, prioritize large signage and door/window business identity text.
- For business cards, prioritize company name, contact name, phone, email, website, and address.
- Suite/unit text belongs in suiteCandidates.
- If a field is not visible, return an empty array.
- No markdown, no backticks, no explanation outside JSON.` },
      ],
    }],
  });

  try {
    const parsed = JSON.parse(cleanJsonText(text));
    const asArray = (value) => Array.isArray(value) ? value.filter(Boolean).map((item) => String(item).trim()).filter(Boolean) : [];
    return {
      visibleTextLines: asArray(parsed.visibleTextLines),
      businessNameCandidates: asArray(parsed.businessNameCandidates),
      addressCandidates: asArray(parsed.addressCandidates),
      suiteCandidates: asArray(parsed.suiteCandidates),
      phoneCandidates: asArray(parsed.phoneCandidates),
      emailCandidates: asArray(parsed.emailCandidates),
      websiteCandidates: asArray(parsed.websiteCandidates),
      imageQuality: parsed.imageQuality || 'unknown',
      confidence: parsed.confidence || 'medium',
      notes: parsed.notes || '',
    };
  } catch {
    return {
      visibleTextLines: [],
      businessNameCandidates: [],
      addressCandidates: [],
      suiteCandidates: [],
      phoneCandidates: [],
      emailCandidates: [],
      websiteCandidates: [],
      imageQuality: 'unknown',
      confidence: 'low',
      notes: 'Raw OCR JSON parse failed.',
    };
  }
}
