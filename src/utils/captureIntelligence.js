import { normalizeLead } from './leadHelpers';

function cleanLine(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function looksLikePhone(value = '') {
  const digits = String(value).replace(/\D/g, '');
  return digits.length >= 10;
}

function looksLikeEmail(value = '') {
  return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(String(value || ''));
}

function looksLikeBusiness(value = '') {
  const text = cleanLine(value);
  if (!text || text.length < 3) return false;
  if (looksLikePhone(text) || looksLikeEmail(text)) return false;
  const banned = ['street', 'suite', 'ste', 'road', 'drive', 'blvd', 'boulevard', 'avenue', 'ave', 'tx', 'texas'];
  const lower = text.toLowerCase();
  if (banned.some((term) => lower === term || lower.startsWith(term))) return false;
  return /[A-Za-z]/.test(text);
}

export function expandCandidatesFromOcrSummary(ocrSummary = '', sourceType = 'image') {
  const lines = String(ocrSummary || '')
    .split(/\n|\||•|·|,\s(?=[A-Z0-9])/)
    .map(cleanLine)
    .filter(Boolean);

  if (lines.length < 2) return [];

  const candidates = [];
  let current = null;

  for (const line of lines) {
    if (looksLikeBusiness(line)) {
      if (current?.businessName) candidates.push(current);
      current = {
        businessName: line,
        pocFirst: '',
        pocLast: '',
        phone: '',
        email: '',
        notes: `OCR fallback candidate from ${sourceType} summary`,
        confidence: 'low',
      };
      continue;
    }

    if (!current) continue;

    if (!current.phone && looksLikePhone(line)) {
      current.phone = line;
      continue;
    }
    if (!current.email && looksLikeEmail(line)) {
      current.email = line;
      continue;
    }
    if (!current.notes.includes(line)) {
      current.notes = `${current.notes} | ${line}`;
    }
  }

  if (current?.businessName) candidates.push(current);

  return candidates.slice(0, 10).map((item) => normalizeLead(item));
}

export function detectCaptureSourceType(lead = {}) {
  const method = String(lead.captureMethod || '').toLowerCase();
  if (method === 'storefront') return 'storefront';
  if (method === 'manual') return 'manual';
  if (method === 'excel') return 'spreadsheet';
  if (method === 'image') {
    if (lead.locationSource || lead.captureLat || lead.captureLng) return 'storefront';
    if (String(lead.notes || '').toLowerCase().includes('ocr fallback')) return 'screenshot';
    return 'card-or-image';
  }
  return method || 'image';
}

export function inferHandwritingRisk(lead = {}) {
  const notes = String(lead.notes || '').toLowerCase();
  const summary = String(lead.ocrSummary || '').toLowerCase();
  const combined = `${notes} ${summary}`;
  const weirdName = /[^a-z .'-]/i.test(`${lead.pocFirst || ''}${lead.pocLast || ''}`);
  if (combined.includes('handwritten') || combined.includes('hand writing') || weirdName) {
    return 'medium';
  }
  return 'low';
}

export function annotateLeadForReview(lead = {}, sourceType = 'image') {
  const normalized = normalizeLead(lead);
  const labels = [];
  const warnings = [];
  const sourceAwareType = detectCaptureSourceType({ ...normalized, captureMethod: sourceType });

  if (sourceAwareType === 'storefront') labels.push('Storefront GPS match');
  if (sourceAwareType === 'spreadsheet') labels.push('Spreadsheet import');
  if (sourceAwareType === 'screenshot') labels.push('Screenshot fallback');
  if (normalized.locationNeedsReview) {
    labels.push('Needs Review');
    warnings.push('Address confidence is weak.');
  }
  if (normalized.phone || normalized.email) labels.push('Enriched');

  const handwritingRisk = inferHandwritingRisk(normalized);
  if (handwritingRisk !== 'low') {
    labels.push('Handwriting uncertain');
    warnings.push('One or more contact fields may need review.');
  }

  const overallConfidence = normalized.locationConfidence || normalized.confidence || 'medium';
  if (overallConfidence === 'high') labels.push('High confidence');
  if (overallConfidence === 'low' && !labels.includes('Needs Review')) labels.push('Needs Review');

  return {
    ...normalized,
    captureSourceType: sourceAwareType,
    reviewLabels: Array.from(new Set(labels)),
    reviewWarnings: Array.from(new Set(warnings)),
    handwritingRisk,
  };
}

export function buildDuplicateBadge(duplicate) {
  if (!duplicate) return '';
  const prefix = duplicate.confidence === 'high' ? 'Likely duplicate' : 'Possible duplicate';
  return `${prefix}: ${duplicate.reason}`;
}
