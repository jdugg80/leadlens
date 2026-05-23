import * as FileSystem from 'expo-file-system';
import { extractLeadsWithDebugFromImage, extractRawOcrFromImage } from './claudeApi';
import { expandCandidatesFromOcrSummary } from './captureIntelligence';
import { cropImageToLeadLockTarget, createLeadLockFullImageVariant } from './leadLockImageCrop';

function clean(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function uniqueStrings(values = []) {
  const seen = new Set();
  const output = [];
  values.forEach((value) => {
    const text = clean(value);
    if (!text) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    output.push(text);
  });
  return output;
}

function firstNonEmpty(...values) {
  return values.map(clean).find(Boolean) || '';
}

function looksLikeEmail(value = '') {
  return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(String(value || ''));
}

function normalizePhone(value = '') {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return clean(value);
}

function looksLikePhone(value = '') {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 12;
}

function looksLikeWebsite(value = '') {
  const text = String(value || '').trim();
  return /(https?:\/\/|www\.|\.com\b|\.net\b|\.org\b|\.biz\b|\.co\b)/i.test(text);
}

function isBadBusinessNameCandidate(value = '') {
  const text = clean(value).toLowerCase();
  if (!text || text.length < 3) return true;
  if (looksLikePhone(text) || looksLikeEmail(text) || looksLikeWebsite(text)) return true;
  const banned = [
    'open', 'closed', 'hours', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun',
    'suite', 'ste', 'unit', 'phone', 'tel', 'fax', 'exit', 'entrance', 'parking',
    'push', 'pull', 'welcome', 'drive thru', 'drive-thru', 'employees only',
    'no smoking', 'restroom', 'available', 'for lease', 'now hiring', 'help wanted',
  ];
  return banned.some((term) => text === term || text.includes(term));
}

function extractCandidatesFromLines(lines = []) {
  const businessNameCandidates = [];
  const addressCandidates = [];
  const suiteCandidates = [];
  const phoneCandidates = [];
  const emailCandidates = [];
  const websiteCandidates = [];

  lines.forEach((line) => {
    const text = clean(line);
    if (!text) return;

    if (looksLikePhone(text)) phoneCandidates.push(normalizePhone(text));
    if (looksLikeEmail(text)) emailCandidates.push(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || text);
    if (looksLikeWebsite(text)) websiteCandidates.push(text);
    if (/\b(suite|ste\.?|unit|#)\s*[a-z0-9-]+\b/i.test(text)) suiteCandidates.push(text);
    if (/\b\d{2,6}\s+[a-z0-9 .'-]+\b/i.test(text) && /\b(st|street|rd|road|ave|avenue|blvd|boulevard|dr|drive|ln|lane|pkwy|parkway|way|ct|court|circle|cir|hwy|highway)\b/i.test(text)) {
      addressCandidates.push(text);
    }
    if (!isBadBusinessNameCandidate(text)) businessNameCandidates.push(text);
  });

  return {
    businessNameCandidates: uniqueStrings(businessNameCandidates).slice(0, 8),
    addressCandidates: uniqueStrings(addressCandidates).slice(0, 8),
    suiteCandidates: uniqueStrings(suiteCandidates).slice(0, 8),
    phoneCandidates: uniqueStrings(phoneCandidates).slice(0, 6),
    emailCandidates: uniqueStrings(emailCandidates).slice(0, 6),
    websiteCandidates: uniqueStrings(websiteCandidates).slice(0, 6),
  };
}

function splitAddress(address = '') {
  const text = clean(address);
  if (!text) return {};

  const suiteMatch = text.match(/\b(?:suite|ste\.?|unit|#)\s*([a-z0-9-]+)\b/i);
  const addressLine2 = suiteMatch ? `Suite ${suiteMatch[1]}` : '';

  const zipMatch = text.match(/\b(\d{5})(?:-\d{4})?\b/);
  const stateMatch = text.match(/\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY)\b/i);
  const streetMatch = text.match(/^\s*(\d{2,6})\s+(.+?)(?:,|\s+\b(?:suite|ste\.?|unit|#)\b|\s+\b(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY)\b|\s+\d{5}\b|$)/i);

  return {
    streetNumber: streetMatch?.[1] || '',
    streetName: clean(streetMatch?.[2] || ''),
    addressLine2,
    state: stateMatch?.[1]?.toUpperCase() || '',
    zip: zipMatch?.[1] || '',
  };
}

function leadFromRawOcr(raw = {}, source = 'ocr') {
  const lines = Array.isArray(raw.visibleTextLines) ? raw.visibleTextLines : [];
  const inferred = extractCandidatesFromLines(lines);

  const businessNameCandidates = uniqueStrings([
    ...(raw.businessNameCandidates || []),
    ...inferred.businessNameCandidates,
  ]);
  const addressCandidates = uniqueStrings([
    ...(raw.addressCandidates || []),
    ...inferred.addressCandidates,
  ]);
  const suiteCandidates = uniqueStrings([
    ...(raw.suiteCandidates || []),
    ...inferred.suiteCandidates,
  ]);
  const phoneCandidates = uniqueStrings([
    ...(raw.phoneCandidates || []),
    ...inferred.phoneCandidates,
  ]);
  const emailCandidates = uniqueStrings([
    ...(raw.emailCandidates || []),
    ...inferred.emailCandidates,
  ]);
  const websiteCandidates = uniqueStrings([
    ...(raw.websiteCandidates || []),
    ...inferred.websiteCandidates,
  ]);

  const addressParts = splitAddress(addressCandidates[0] || '');

  return {
    lead: {
      businessName: firstNonEmpty(businessNameCandidates[0]),
      phone: firstNonEmpty(phoneCandidates[0]),
      email: firstNonEmpty(emailCandidates[0]),
      website: firstNonEmpty(websiteCandidates[0]),
      streetNumber: addressParts.streetNumber || '',
      streetName: addressParts.streetName || '',
      addressLine2: firstNonEmpty(addressParts.addressLine2, suiteCandidates[0]),
      state: addressParts.state || '',
      zip: addressParts.zip || '',
      notes: raw.notes ? `OCR ${source}: ${raw.notes}` : '',
      confidence: raw.confidence || 'medium',
    },
    candidates: {
      businessNameCandidates,
      addressCandidates,
      suiteCandidates,
      phoneCandidates,
      emailCandidates,
      websiteCandidates,
    },
    visibleTextLines: uniqueStrings(lines),
  };
}

function scoreOcr({ lead = {}, candidates = {}, visibleTextLines = [], source = '', usedTargetBox = false }) {
  let score = 0;
  const factors = [];

  if (lead.businessName) { score += 32; factors.push('business name'); }
  if (lead.streetNumber || lead.streetName || candidates.addressCandidates?.length) { score += 22; factors.push('address clue'); }
  if (lead.addressLine2 || candidates.suiteCandidates?.length) { score += 8; factors.push('suite/unit clue'); }
  if (lead.phone || candidates.phoneCandidates?.length) { score += 12; factors.push('phone'); }
  if (lead.email || candidates.emailCandidates?.length) { score += 10; factors.push('email'); }
  if (lead.website || candidates.websiteCandidates?.length) { score += 8; factors.push('website'); }
  if (visibleTextLines.length >= 3) { score += 8; factors.push('multiple text lines'); }
  if (usedTargetBox && String(source).includes('target')) { score += 10; factors.push('target box OCR'); }

  score = Math.min(100, Math.round(score));
  const level = score >= 75 ? 'high' : score >= 45 ? 'medium' : score > 0 ? 'low' : 'failed';

  return { score, level, factors };
}

function mergeNonEmpty(...items) {
  const merged = {};
  for (const item of items) {
    Object.entries(item || {}).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') merged[key] = value;
    });
  }
  return merged;
}

async function readImageAsBase64(uri) {
  if (!uri) return null;
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
}

async function runOcrVariant(variant, activeProfile = null) {
  if (!variant?.uri) return null;
  const startedAt = Date.now();
  const base64 = await readImageAsBase64(variant.uri);
  if (!base64) return null;

  let raw = null;
  let leadExtraction = null;
  let rawError = null;
  let extractionError = null;

  try {
    // Only perform the debug extraction network call to save memory and bandwidth.
    // It calls the exact same Supabase edge function and returns the same schema.
    leadExtraction = await extractLeadsWithDebugFromImage(base64, 'image/jpeg', {
      source: variant.source,
      priority: variant.priority,
      activeProfile, // Pass industry focus
    });

    if (leadExtraction && leadExtraction.leads && leadExtraction.leads[0]) {
      const result = leadExtraction.leads[0];
      // Map the structured results back into the raw OCR format
      raw = {
        visibleTextLines: leadExtraction.ocrSummary ? leadExtraction.ocrSummary.split('\n') : [],
        businessNameCandidates: [result.businessName].filter(Boolean),
        addressCandidates: [`${result.streetNumber || ''} ${result.streetName || ''}`.trim()].filter(Boolean),
        suiteCandidates: [result.addressLine2].filter(Boolean),
        phoneCandidates: [result.phone].filter(Boolean),
        emailCandidates: [result.email].filter(Boolean),
        websiteCandidates: [result.website].filter(Boolean),
        imageQuality: 'clear',
        confidence: (result.confidence || 0) > 70 ? 'high' : 'medium',
        notes: leadExtraction.ocrSummary || '',
      };
    } else {
      raw = {
        visibleTextLines: leadExtraction?.ocrSummary ? leadExtraction.ocrSummary.split('\n') : [],
        businessNameCandidates: [],
        addressCandidates: [],
        suiteCandidates: [],
        phoneCandidates: [],
        emailCandidates: [],
        websiteCandidates: [],
        imageQuality: 'clear',
        confidence: 'medium',
        notes: leadExtraction?.ocrSummary || '',
      };
    }
  } catch (err) {
    extractionError = err?.message || String(err);
    rawError = err?.message || String(err);
  }

  const rawLead = leadFromRawOcr(raw || {}, variant.source);
  const fallbackFromSummary = expandCandidatesFromOcrSummary(
    leadExtraction?.ocrSummary || rawLead.visibleTextLines.join(' | '),
    variant.source
  )?.[0] || {};

  const aiLead = leadExtraction?.leads?.[0] || {};
  const mergedLead = mergeNonEmpty(rawLead.lead, fallbackFromSummary, aiLead);
  const visibleTextLines = uniqueStrings([
    ...(rawLead.visibleTextLines || []),
    ...(Array.isArray(raw?.visibleTextLines) ? raw.visibleTextLines : []),
    leadExtraction?.ocrSummary || '',
  ]);

  const candidates = {
    businessNameCandidates: uniqueStrings([
      ...(rawLead.candidates.businessNameCandidates || []),
      ...(raw?.businessNameCandidates || []),
      aiLead.businessName || '',
      fallbackFromSummary.businessName || '',
    ]),
    addressCandidates: uniqueStrings([
      ...(rawLead.candidates.addressCandidates || []),
      ...(raw?.addressCandidates || []),
      [aiLead.streetNumber, aiLead.streetName, aiLead.city, aiLead.state, aiLead.zip].filter(Boolean).join(' '),
    ]),
    suiteCandidates: uniqueStrings([
      ...(rawLead.candidates.suiteCandidates || []),
      ...(raw?.suiteCandidates || []),
      aiLead.addressLine2 || '',
    ]),
    phoneCandidates: uniqueStrings([
      ...(rawLead.candidates.phoneCandidates || []),
      ...(raw?.phoneCandidates || []),
      aiLead.phone || '',
    ]),
    emailCandidates: uniqueStrings([
      ...(rawLead.candidates.emailCandidates || []),
      ...(raw?.emailCandidates || []),
      aiLead.email || '',
    ]),
    websiteCandidates: uniqueStrings([
      ...(rawLead.candidates.websiteCandidates || []),
      ...(raw?.websiteCandidates || []),
      aiLead.website || '',
    ]),
  };

  const ocrScore = scoreOcr({
    lead: mergedLead,
    candidates,
    visibleTextLines,
    source: variant.source,
    usedTargetBox: variant.usedTargetBox,
  });

  return {
    source: variant.source,
    priority: variant.priority,
    uri: variant.uri,
    crop: variant.crop || null,
    output: variant.output || null,
    raw,
    leadExtraction,
    lead: mergedLead,
    candidates,
    visibleTextLines,
    ocrSummary: leadExtraction?.ocrSummary || visibleTextLines.join(' | '),
    confidence: ocrScore,
    errors: { rawError, extractionError },
    elapsedMs: Date.now() - startedAt,
  };
}

function selectBestVariant(results = []) {
  const usable = results.filter(Boolean);
  if (!usable.length) return null;
  return usable.sort((a, b) => {
    const priorityDiff = (b.priority || 0) - (a.priority || 0);
    const scoreDiff = (b.confidence?.score || 0) - (a.confidence?.score || 0);
    if (scoreDiff !== 0) return scoreDiff;
    return priorityDiff;
  })[0];
}

import { LeadLockSupabaseService } from '../services/leadLockSupabaseService';

export async function runLeadLockOcrPipeline({
  imageUri,
  targetBox,
  locationContext = {},
  activeProfile = null,
  tags = [],
  targetWindow = null
}) {
  const debug = { imageUri, targetBox, targetWindow, tagsCount: tags.length, variantsAttempted: [], errors: [] };
  const variants = [];

  if (!imageUri) {
    return {
      mergedLead: {},
      bestText: '',
      ocrSummary: '',
      ocrSource: 'none',
      ocrConfidence: { score: 0, level: 'failed', factors: [] },
      usedTargetBox: false,
      businessNameCandidates: [],
      addressCandidates: [],
      warnings: ['No image URI was available for OCR.'],
      debug,
    };
  }

  // --- NEW: PHASE 1 SUPABASE INTEGRATION ---
  let captureId = null;
  const supabaseCapturePromise = LeadLockSupabaseService.createCapture({
    imageUri,
    rawOcrText: '',
    location: locationContext.location,
    heading: locationContext.heading,
    zoomLevel: locationContext.zoomLevel,
    captureType: tags.length > 0 ? 'tagged_capture' : (targetWindow ? 'window_capture' : 'full_frame'),
    deviceConfidence: 0,
    metadata: { tags, targetWindow }
  }).then(id => {
    captureId = id;
    return id;
  }).catch(err => {
    console.error('[LeadLockPipeline] Supabase capture creation failed:', err);
    return null;
  });

  // 1. Tag-Specific Crops (Highest Priority)
  for (const tag of tags) {
    try {
      const tagCrop = await cropImageToRegion(imageUri, {
        x: (targetWindow?.normalizedLeft || 0) + (tag.normalizedX * (targetWindow?.normalizedWidth || 1)) - 0.05,
        y: (targetWindow?.normalizedTop || 0) + (tag.normalizedY * (targetWindow?.normalizedHeight || 1)) - 0.04,
        width: 0.1,
        height: 0.08
      }, { compress: 0.95 });

      if (tagCrop?.uri) {
        variants.push({
          ...tagCrop,
          source: `tag-${tag.tagType}`,
          priority: 150,
          tagType: tag.tagType,
          guidance: `FOCUSED TAG: This is a ${tag.tagType}. Extract only the value for this specific field.`
        });
      }
    } catch (err) {
      debug.errors.push({ source: `tag-${tag.tagType}`, message: err.message });
    }
  }

  // 2. Targeting Window Crop (High Priority)
  if (targetWindow) {
    try {
      const windowCrop = await cropImageToRegion(imageUri, {
        x: targetWindow.normalizedLeft,
        y: targetWindow.normalizedTop,
        width: targetWindow.normalizedWidth,
        height: targetWindow.normalizedHeight
      }, { compress: 0.82 });

      if (windowCrop?.uri) {
        variants.push({
          ...windowCrop,
          source: 'target-window-3-4',
          priority: 120,
          usedTargetBox: true,
          guidance: 'PRIMARY SCAN AREA: This 3:4 window contains the main subject. Prioritize all text found here.',
        });
      }
    } catch (err) {
      debug.errors.push({ source: 'target-window-3-4', message: err.message });
    }
  }

  // 3. Original Target Box Fallback
  if (targetBox) {
    try {
      const targetEnhanced = await cropImageToLeadLockTarget(imageUri, targetBox, {
        paddingRatio: 0.12,
        minWidth: 1000,
        maxWidth: 1200,
        compress: 0.82,
      });
      if (targetEnhanced?.uri) {
        variants.push({
          ...targetEnhanced,
          source: 'target-box-legacy',
          priority: 100,
          usedTargetBox: true,
          guidance: 'LEGACY TARGET: Context around a specific point.',
        });
      }
    } catch (err) {
      debug.errors.push({ source: 'target-box-legacy', message: err?.message || String(err) });
    }
  }

  // 4. Full Image Fallback
  try {
    const fullOptimized = await createLeadLockFullImageVariant(imageUri, {
      maxWidth: 1200,
      compress: 0.80,
    });
    if (fullOptimized?.uri) {
      variants.push({
        ...fullOptimized,
        source: 'full-image-optimized',
        priority: 50,
        usedTargetBox: false,
        guidance: 'BROAD CONTEXT: Use this for general discovery if primary areas fail.',
      });
    }
  } catch (err) {
    debug.errors.push({ source: 'full-image-optimized', message: err?.message || String(err) });
  }

  const results = [];
  // Sort variants by priority and limit to top 5 to avoid heavy processing
  const prioritizedVariants = variants.sort((a, b) => b.priority - a.priority).slice(0, 5);

  for (const variant of prioritizedVariants) {
    debug.variantsAttempted.push({ source: variant.source, priority: variant.priority });
    try {
      const result = await runOcrVariant(variant, activeProfile);
      if (result) results.push(result);
    } catch (err) {
      debug.errors.push({ source: variant.source, message: err?.message || String(err) });
    }
  }

  const best = selectBestVariant(results);
  const mergedLead = mergeNonEmpty(...results.map((item) => item.lead).reverse());

  // Apply Tag Specific results directly to mergedLead
  results.forEach(res => {
    if (res.source.startsWith('tag-')) {
      const tagType = res.source.replace('tag-', '');
      const text = res.lead.businessName || res.visibleTextLines[0] || '';

      if (tagType === 'phone') mergedLead.phone = normalizePhone(text);
      if (tagType === 'email') mergedLead.email = text.toLowerCase();
      if (tagType === 'business_name' || tagType === 'business_sign') mergedLead.businessName = text;
      if (tagType === 'contact_name') mergedLead.pocName = text;
      if (tagType === 'suite_or_door_number') mergedLead.addressLine2 = text;
      if (tagType === 'address') {
        const parts = splitAddress(text);
        if (parts.streetName) {
            mergedLead.streetNumber = parts.streetNumber;
            mergedLead.streetName = parts.streetName;
            mergedLead.city = parts.city || mergedLead.city;
            mergedLead.zip = parts.zip || mergedLead.zip;
        }
      }
    }
  });

  const allTextLines = uniqueStrings(results.flatMap((item) => item.visibleTextLines || []));
  const allBusinessNames = uniqueStrings(results.flatMap((item) => item.candidates?.businessNameCandidates || []));
  const allAddresses = uniqueStrings(results.flatMap((item) => item.candidates?.addressCandidates || []));
  const allSuites = uniqueStrings(results.flatMap((item) => item.candidates?.suiteCandidates || []));

  // Prefer the best variant's business name over broad full-image guesses.
  if (best?.lead?.businessName) mergedLead.businessName = best.lead.businessName;

  const bestText = uniqueStrings([
    best?.ocrSummary || '',
    ...allTextLines,
  ]).join(' | ');

  const confidence = scoreOcr({
    lead: mergedLead,
    candidates: {
      businessNameCandidates: allBusinessNames,
      addressCandidates: allAddresses,
      suiteCandidates: allSuites,
      phoneCandidates: uniqueStrings(results.flatMap((item) => item.candidates?.phoneCandidates || [])),
      emailCandidates: uniqueStrings(results.flatMap((item) => item.candidates?.emailCandidates || [])),
      websiteCandidates: uniqueStrings(results.flatMap((item) => item.candidates?.websiteCandidates || [])),
    },
    visibleTextLines: allTextLines,
    source: best?.source || 'none',
    usedTargetBox: !!targetWindow || !!targetBox,
  });

  const warnings = [];
  if (!targetWindow && !targetBox) warnings.push('No targeting window was used.');
  if (!mergedLead.businessName) warnings.push('No strong business name was detected.');

  // --- UPDATE SUPABASE WITH OCR RESULTS ---
  if (captureId) {
    import('../lib/supabase').then(({ supabase }) => {
      supabase.from('leadlock_captures').update({
        raw_ocr_text: bestText,
        ocr_summary: bestText.slice(0, 500),
        ocr_confidence: confidence.score,
        detected_name: mergedLead.businessName,
        detected_phone: mergedLead.phone,
        detected_email: mergedLead.email,
        detected_address: [mergedLead.streetNumber, mergedLead.streetName, mergedLead.city, mergedLead.state, mergedLead.zip].filter(Boolean).join(' '),
      }).eq('id', captureId).catch(err => console.warn('[LeadLockPipeline] Supabase update failed:', err));
    });
  }

  return {
    captureId,
    mergedLead,
    bestText,
    ocrSummary: bestText,
    ocrSource: best?.source || 'none',
    ocrConfidence: confidence,
    usedTargetBox: !!targetWindow || !!targetBox,
    businessNameCandidates: allBusinessNames,
    addressCandidates: allAddresses,
    suiteCandidates: allSuites,
    taggedResults: results.filter(r => r.source.startsWith('tag-')),
    warnings,
    debug,
  };
}

