import { enqueueTask, TASK_TYPES } from './taskQueue';
import { extractProspectAI } from '../services/extractProspectAI';

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
      // Map AI returned firstName/lastName back to internal pocFirst/pocLast if needed
      const aiKey = key === 'pocFirst' ? 'firstName' : (key === 'pocLast' ? 'lastName' : key);
      if (result[aiKey] && !merged[key]) {
        merged[key] = result[aiKey];
      }
    }
    return merged;
  } catch (err) {
    if (__DEV__) console.warn('[enrichLead] failed:', err);
    // For enrichment, we often prefer to just return the original lead silently
    return partialLead;
  }
}

export async function enqueueEnrichLead(lead) {
  return enqueueTask(TASK_TYPES.ENRICH_LEAD, { lead });
}

/**
 * Extracts multiple leads from a base64 image.
 */
export async function extractLeadsFromImage(base64Image, mimeType = 'image/jpeg') {
  // Let errors bubble up to the caller (e.g. CaptureScreen) to show alerts
  const result = await extractProspectAI({
    imageBase64: base64Image,
    mimeType,
    mode: 'batch',
    context: 'Analyze this image for one or more business leads/cards.'
  });

  if (result) {
    // Map AI names back
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
 * Enhanced extraction with industry guidance.
 */
export async function extractLeadsWithDebugFromImage(base64Image, mimeType = 'image/jpeg', options = {}) {
  const { activeProfile } = options;

  let industryGuidance = '';
  if (activeProfile && activeProfile.category !== 'Pest Control') {
    industryGuidance = `
User Industry: ${activeProfile.category} (${activeProfile.label}).
Target Types: ${activeProfile.primaryProspectTypes?.join(', ') || ''}.
Keywords: ${activeProfile.searchKeywords?.join(', ') || ''}.
`;
  }

  // Let errors bubble up
  const result = await extractProspectAI({
    imageBase64: base64Image,
    mimeType,
    mode: 'debug',
    context: `Signage/Storefront analysis. ${industryGuidance}`
  });

  return {
    leads: result ? [{ ...result, pocFirst: result.firstName, pocLast: result.lastName }] : [],
    ocrSummary: result?.notes || ''
  };
}

export async function enqueueExtractLeadsFromImage(imageUri, mimeType = 'image/jpeg') {
  return enqueueTask(TASK_TYPES.EXTRACT_LEADS, { imageUri, mimeType });
}

/**
 * Raw OCR extraction (legacy compatibility).
 */
export async function extractRawOcrFromImage(base64Image, mimeType = 'image/jpeg', context = {}) {
  // Let errors bubble up
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
