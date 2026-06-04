import { enqueueTask, TASK_TYPES } from './taskQueue';
import { extractProspectAI } from '../services/extractProspectAI';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;

/**
 * Robust direct Claude extraction — handles business cards, storefronts,
 * signage, multi-business photos, and anything else a field sales rep
 * might photograph. Infers missing fields from context clues and GPS.
 */
export async function extractProspectRobust(base64Image, mimeType = 'image/jpeg', coords = null) {
  if (!ANTHROPIC_API_KEY) {
    console.warn('[extractProspectRobust] No API key — falling back to edge function');
    return null;
  }

  const locationHint = coords
    ? `The photo was taken at GPS coordinates ${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}.`
    : '';

  const systemPrompt = `You are an expert business intelligence extraction system for a field sales prospecting app targeting pest control companies.

You receive photos taken by field sales reps in the field. The photo could be:
- A business card (front or back)
- A storefront or building exterior
- Signage, a sign on a building, or a strip mall
- Multiple businesses visible in one photo
- A general commercial/industrial scene

YOUR TASK: Extract every piece of business contact information visible, AND intelligently fill in missing fields using context clues.

INFERENCE RULES:
- If you see a Texas city or zip code, state = "TX"
- If you see a business type (restaurant, dental, auto shop, etc.), set propertyType accordingly
- If you see a partial address with a city you recognize, fill in the state
- If a website domain matches a visible business name, infer the email format
- If multiple storefronts are visible, return ALL of them as separate businesses
- If only a business name and city are visible, still return what you have — partial data is better than nothing
- For business cards: extract EVERYTHING printed including social media handles, titles, taglines

CONFIDENCE: Set confidence 0-100 based on how clearly the field was visible (90-100 = clearly printed, 60-89 = partially visible or inferred from context, 0-59 = guessed).

${locationHint}

Return ONLY valid JSON, no markdown, no explanation, exactly this structure:
{
  "image_type": "business_card" | "storefront" | "signage" | "multi_business" | "general",
  "businesses": [
    {
      "businessName": "",
      "pocFirst": "",
      "pocLast": "",
      "pocTitle": "",
      "phone": "",
      "email": "",
      "website": "",
      "facebookUrl": "",
      "instagramUrl": "",
      "linkedinUrl": "",
      "streetNumber": "",
      "streetName": "",
      "addressLine2": "",
      "city": "",
      "state": "",
      "zip": "",
      "propertyType": "",
      "notes": "any relevant observations about the prospect",
      "confidence": 85,
      "inferredFields": ["state", "propertyType"]
    }
  ],
  "rawText": "all visible text from the image, line by line"
}

If nothing business-relevant is visible, return: {"image_type":"general","businesses":[],"rawText":""}`;

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mimeType, data: base64Image },
            },
            {
              type: 'text',
              text: 'Extract all business prospect information from this photo. Be thorough — extract and infer everything you can.',
            },
          ],
        }],
      }),
    });

    if (!response.ok) {
      console.warn('[extractProspectRobust] API error:', response.status);
      return null;
    }

    const data = await response.json();
    const rawText = data.content?.[0]?.text || '';
    const clean = rawText.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      console.warn('[extractProspectRobust] JSON parse failed, raw:', rawText.slice(0, 200));
      return null;
    }

    const businesses = parsed.businesses || [];
    console.log(`[extractProspectRobust] image_type=${parsed.image_type}, found ${businesses.length} business(es)`);

    // Map to internal lead format
    return {
      leads: businesses.map(b => ({
        businessName:  b.businessName  || '',
        pocFirst:      b.pocFirst      || '',
        pocLast:       b.pocLast       || '',
        pocTitle:      b.pocTitle      || '',
        phone:         b.phone         || '',
        email:         b.email         || '',
        website:       b.website       || '',
        facebookUrl:   b.facebookUrl   || '',
        instagramUrl:  b.instagramUrl  || '',
        linkedinUrl:   b.linkedinUrl   || '',
        streetNumber:  b.streetNumber  || '',
        streetName:    b.streetName    || '',
        addressLine2:  b.addressLine2  || '',
        city:          b.city          || '',
        state:         b.state         || '',
        zip:           b.zip           || '',
        propertyType:  b.propertyType  || 'Commercial',
        notes:         [b.notes, b.inferredFields?.length ? `AI-inferred: ${b.inferredFields.join(', ')}` : ''].filter(Boolean).join(' | '),
        confidence:    b.confidence    || 70,
        imageType:     parsed.image_type,
      })),
      ocrSummary: parsed.rawText || '',
      imageType:  parsed.image_type,
    };
  } catch (err) {
    console.warn('[extractProspectRobust] Error:', err.message);
    return null;
  }
}

/**
 * LeadLens Extraction API
 *
 * All direct Anthropic calls have been moved to Supabase Edge Functions
 * to protect API keys and centralize logic.
 */

/**
 * Enriches a lead with missing fields using AI.
 */
export async function enrichLead(partialLead) {
  const known = Object.entries(partialLead)
    .filter(([k, v]) => v && !['captureMethod', 'imageUri', 'status', 'propertyType', 'duplicateWarning'].includes(k))
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

  const missing = ['businessName', 'pocFirst', 'pocLast', 'phone', 'email', 'website', 'facebookUrl', 'instagramUrl', 'linkedinUrl', 'tiktokUrl', 'youtubeUrl', 'xUrl', 'streetNumber', 'streetName', 'city', 'state', 'zip']
    .filter((k) => !partialLead[k]);

  if (!missing.length) return partialLead;

  try {
    const result = await extractProspectAI({
      text: known,
      mode: 'enrichment',
      context: `Missing fields to fill if possible: ${missing.join(', ')}`
    });

    if (!result) return partialLead;

    const merged = { ...partialLead };
    for (const key of missing) {
      const aiKey = key === 'pocFirst' ? 'firstName' : (key === 'pocLast' ? 'lastName' : key);
      if (result[aiKey] && !merged[key]) {
        merged[key] = result[aiKey];
      }
    }
    return merged;
  } catch (err) {
    if (__DEV__) console.warn('[enrichLead] failed:', err);
    return partialLead;
  }
}

export async function enqueueEnrichLead(lead) {
  return enqueueTask(TASK_TYPES.ENRICH_LEAD, { lead });
}

export async function extractLeadsFromImage(base64Image, mimeType = 'image/jpeg') {
  const result = await extractProspectAI({
    imageBase64: base64Image,
    mimeType,
    mode: 'batch',
    context: 'Analyze this image for one or more business leads/cards.'
  });

  if (result) {
    const mapped = {
      ...result,
      pocFirst: result.firstName || '',
      pocLast: result.lastName || ''
    };
    return [mapped];
  }
  return [];
}

export async function extractLeadFromImage(base64Image, mimeType = 'image/jpeg') {
  const leads = await extractLeadsFromImage(base64Image, mimeType);
  return leads[0] || {};
}

/**
 * Enhanced extraction — tries robust direct Claude call first,
 * falls back to Supabase Edge Function if API key not set.
 */
export async function extractLeadsWithDebugFromImage(base64Image, mimeType = 'image/jpeg', options = {}) {
  const { activeProfile, coords } = options;
  const captureMethod = String(options?.captureMethod || '').toLowerCase();
  const isBusinessCardCapture =
    captureMethod.includes('business-card')
    || captureMethod.includes('business_card')
    || captureMethod === 'card';

  // Try robust direct extraction first
  const robust = await extractProspectRobust(base64Image, mimeType, coords);
  if (robust) return robust;

  // Fallback: Supabase Edge Function
  let industryGuidance = '';
  if (activeProfile && activeProfile.category !== 'Pest Control') {
    industryGuidance = `
User Industry: ${activeProfile.category} (${activeProfile.label}).
Target Types: ${activeProfile.primaryProspectTypes?.join(', ') || ''}.
Keywords: ${activeProfile.searchKeywords?.join(', ') || ''}.
`;
  }

  const result = await extractProspectAI({
    imageBase64: base64Image,
    mimeType,
    mode: isBusinessCardCapture ? 'card' : 'debug',
    context: isBusinessCardCapture
      ? `Business card analysis. Extract contact/person/company/address details printed on the card. ${industryGuidance}`
      : `Signage/Storefront analysis. ${industryGuidance}`,
  });

  return {
    leads: result ? [{ ...result, pocFirst: result.firstName, pocLast: result.lastName }] : [],
    ocrSummary: result?.notes || ''
  };
}

export async function enqueueExtractLeadsFromImage(imageUri, mimeType = 'image/jpeg') {
  return enqueueTask(TASK_TYPES.EXTRACT_LEADS, { imageUri, mimeType });
}

export async function extractRawOcrFromImage(base64Image, mimeType = 'image/jpeg', context = {}) {
  const result = await extractProspectAI({
    imageBase64: base64Image,
    mimeType,
    mode: 'ocr',
    context: context.guidance || ''
  });

  if (!result) throw new Error('No result');

  return {
    visibleTextLines: result.notes?.split('\n') || [],
    businessNameCandidates: [result.businessName].filter(Boolean),
    addressCandidates: [`${result.streetNumber} ${result.streetName}`].filter(s => s.trim()),
    suiteCandidates: [result.addressLine2].filter(Boolean),
    phoneCandidates: [result.phone].filter(Boolean),
    emailCandidates: [result.email].filter(Boolean),
    websiteCandidates: [result.website].filter(Boolean),
    imageQuality: 'clear',
    confidence: result.confidence > 70 ? 'high' : 'medium',
    notes: result.notes || '',
  };
}

/**
 * LeadLens Extraction API
 *
 * All direct Anthropic calls have been moved to Supabase Edge Functions
 * to protect API keys and centralize logic.
 */

