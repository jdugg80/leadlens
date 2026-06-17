/**
 * Phone extraction helpers for OCR/AI business card and storefront scanning.
 * Parses raw text for US-style phone numbers and detects common labels/abbreviations.
 */

const PHONE_REGEX = /(?:\+?1[-.\s]?)?\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})/g;

const MOBILE_LABELS = ['cell', 'cellular', 'mobile', 'mob', 'm', 'c', 'direct', 'dir', 'd'];
const OFFICE_LABELS = ['office', 'o', 'work', 'w', 'phone', 'ph', 'telephone', 'tel', 't', 'main'];
const FAX_LABELS = ['fax', 'f'];

function normalizePhone(digits) {
  const cleaned = String(digits || '').replace(/\D/g, '');
  if (cleaned.length === 11 && cleaned.startsWith('1')) return cleaned.slice(1);
  return cleaned;
}

function formatPhone(digits) {
  const d = normalizePhone(digits);
  if (d.length !== 10) return digits;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

function detectTypeFromContext(text, matchIndex) {
  const window = String(text || '').substring(Math.max(0, matchIndex - 80), matchIndex).toLowerCase();
  const words = window.split(/[\s:;,\-\(\)\[\]\/|]+/);
  const recent = words.slice(-6);

  if (MOBILE_LABELS.some(l => recent.includes(l))) return 'mobile';
  if (FAX_LABELS.some(l => recent.includes(l))) return 'fax';
  if (OFFICE_LABELS.some(l => recent.includes(l))) return 'office';
  return 'unknown';
}

export function extractPhoneCandidatesFromText(text) {
  if (!text) return [];
  const candidates = [];
  const seen = new Set();
  let match;

  while ((match = PHONE_REGEX.exec(text)) !== null) {
    const digits = normalizePhone(match[0]);
    if (digits.length !== 10) continue;
    if (seen.has(digits)) continue;
    seen.add(digits);

    candidates.push({
      number: formatPhone(digits),
      type: detectTypeFromContext(text, match.index),
      digits,
    });
  }

  return candidates;
}

export function selectBestPhone(candidates) {
  if (!Array.isArray(candidates) || !candidates.length) return '';
  const mobile = candidates.find(c => c.type === 'mobile');
  if (mobile) return mobile.number;
  return candidates[0].number;
}

export function mergePhoneCandidates(aiCandidates, textCandidates) {
  const merged = [];
  const seen = new Set();

  [...(aiCandidates || []), ...(textCandidates || [])].forEach(c => {
    const digits = normalizePhone(c.number || c.phone || c.digits || '');
    if (!digits || digits.length !== 10 || seen.has(digits)) return;
    seen.add(digits);
    merged.push({
      number: formatPhone(digits),
      type: c.type || 'unknown',
      digits,
    });
  });

  return merged;
}
