/**
 * Ported LeadLens normalization and parsing logic for the Web App.
 */

export function normalizePhone(phone = '') {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return normalizePhone(digits.slice(1));
  }
  if (digits.length !== 10) return String(phone || '').trim();
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function normalizeEmail(email = '') {
  return String(email || '').trim().toLowerCase();
}

const STATE_NAME_MAP = {
  alabama:'AL',alaska:'AK',arizona:'AZ',arkansas:'AR',california:'CA',colorado:'CO',connecticut:'CT',delaware:'DE',florida:'FL',georgia:'GA',hawaii:'HI',idaho:'ID',illinois:'IL',indiana:'IN',iowa:'IA',kansas:'KS',kentucky:'KY',louisiana:'LA',maine:'ME',maryland:'MD',massachusetts:'MA',michigan:'MI',minnesota:'MN',mississippi:'MS',missouri:'MO',montana:'MT',nebraska:'NE',nevada:'NV','new hampshire':'NH','new jersey':'NJ','new mexico':'NM','new york':'NY','north carolina':'NC','north dakota':'ND',ohio:'OH',oklahoma:'OK',oregon:'OR',pennsylvania:'PA','rhode island':'RI','south carolina':'SC','south dakota':'SD',tennessee:'TN',texas:'TX',utah:'UT',vermont:'VT',virginia:'VA',washington:'WA','west virginia':'WV',wisconsin:'WI',wyoming:'WY',
};

export function normalizeState(state = '') {
  const trimmed = String(state || '').trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  if (STATE_NAME_MAP[lower]) return STATE_NAME_MAP[lower];
  return trimmed.toUpperCase().slice(0, 2);
}

export function normalizeZip(zip = '') {
  const digits = String(zip || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.slice(0, 5);
}

export function normalizePersonName(name = '') {
  const cleaned = String(name || '').replace(/\s+/g, ' ').trim();
  if (!cleaned || cleaned === '.') return '';
  return cleaned
    .split(' ')
    .map((part) => part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : '')
    .join(' ');
}

function normalizeLine2Value(value = '', type = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const cleaned = raw.replace(/\s+/g, ' ').trim();
  const normalizedType = String(type || '').toLowerCase();

  if (normalizedType === 'suite' || normalizedType === 'suitenumber') return `Suite ${cleaned}`;
  if (normalizedType === 'unit' || normalizedType === 'unitnumber') return `Unit ${cleaned}`;
  if (normalizedType === 'apt' || normalizedType === 'apartment') return `Apt ${cleaned}`;
  if (normalizedType === 'building' || normalizedType === 'bldg') return `Building ${cleaned}`;
  if (normalizedType === 'floor' || normalizedType === 'fl') return `Floor ${cleaned}`;
  if (normalizedType === 'room' || normalizedType === 'rm') return `Room ${cleaned}`;

  return cleaned;
}

export function extractAddressLine2(text = '') {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';

  const labeled = raw.match(/\b(suite|ste|ste\.|unit|apt|apartment|building|bldg|floor|fl|room|rm)\b\.?\s*#?\s*([A-Za-z0-9-]+)\b/i);
  if (labeled) {
    let label = labeled[1].toLowerCase();
    const value = labeled[2];
    if (label === 'ste.' || label === 'ste') label = 'suite';
    return normalizeLine2Value(value, label);
  }

  const hashMatch = raw.match(/#\s*([A-Za-z0-9-]+)/);
  if (hashMatch) return `#${hashMatch[1]}`;

  return '';
}

export function stripAddressLine2(streetName = '', line2 = '') {
  if (!streetName || !line2) return String(streetName || '').trim();
  const escaped = line2.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const cleaned = String(streetName || '').replace(new RegExp(`(?:,\\s*)?${escaped}(?:\\b|$)`, 'i'), '');
  return cleaned.replace(/\s+/g, ' ').trim().replace(/[ ,]+$/, '').trim();
}

/**
 * Whitelist of valid prospect keys for database operations.
 */
const VALID_PROSPECT_KEYS = [
  'id',
  'business_name',
  'poc_first',
  'poc_last',
  'phone',
  'email',
  'website',
  'facebook_url',
  'instagram_url',
  'linkedin_url',
  'tiktok_url',
  'youtube_url',
  'x_url',
  'social_confidence',
  'social_source',
  'street_number',
  'street_name',
  'address_line_2',
  'city',
  'state',
  'zip',
  'status',
  'vertical',
  'capture_method',
  'confidence',
  'notes',
  'rep_name',
  'employee_num',
  'branch_num',
];

/**
 * Normalizes a prospect record, handling the POC placeholder logic,
 * address line 2 extraction, and strict key filtering for Supabase.
 */
export function normalizeProspect(raw = {}) {
  const lead = { ...raw };

  // 1. Address Line 2 Separation
  const currentStreet = String(lead.street_name || '').trim();
  const detectedLine2 = extractAddressLine2(currentStreet);
  if (detectedLine2) {
    lead.address_line_2 = detectedLine2;
    lead.street_name = stripAddressLine2(currentStreet, detectedLine2);
  }

  // 2. POC Placeholder Logic
  if (!lead.poc_first?.trim()) lead.poc_first = '.';
  if (!lead.poc_last?.trim()) lead.poc_last = '.';

  // 3. General Normalization
  lead.phone = normalizePhone(lead.phone);
  lead.email = normalizeEmail(lead.email);
  lead.state = normalizeState(lead.state);
  lead.zip = normalizeZip(lead.zip);

  // 4. Strict Key Filtering (REMOVE extra columns like "Alexa Rank")
  const filtered = {};
  VALID_PROSPECT_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(lead, key)) {
      // Don't send null/empty IDs to avoid constraint violations
      if (key === 'id' && !lead[key]) return;

      filtered[key] = lead[key];
    }
  });

  return filtered;
}
