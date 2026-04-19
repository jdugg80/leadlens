import { INDUSTRY_VERTICALS } from '../constants';

export function normalizePhone(value = '') {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return normalizePhone(digits.slice(1));
  }
  if (digits.length !== 10) return String(value || '').trim();
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function normalizeEmail(value = '') {
  return String(value || '').trim().toLowerCase();
}

export function normalizeState(value = '') {
  return String(value || '').trim().toUpperCase().slice(0, 2);
}

export function normalizeZip(value = '') {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length > 5) return `${digits.slice(0, 5)}-${digits.slice(5, 9)}`;
  return digits.slice(0, 5);
}

export function normalizeName(value = '', fallbackDot = false) {
  const cleaned = String(value || '').trim();
  if (!cleaned) return fallbackDot ? '.' : '';
  return cleaned;
}

export function splitStreetAddress(address = '') {
  const cleaned = String(address || '').trim();
  if (!cleaned) return { streetNumber: '', streetName: '' };
  const match = cleaned.match(/^(\d+[A-Za-z\-]*)\s+(.*)$/);
  if (!match) return { streetNumber: '', streetName: cleaned };
  return { streetNumber: match[1], streetName: match[2] };
}

const VERTICAL_PATTERNS = [
  { vertical: 'Restaurant', terms: ['restaurant', 'grill', 'bbq', 'cafe', 'taqueria', 'taco', 'pizza', 'burger', 'kitchen', 'eatery', 'bistro', 'diner'] },
  { vertical: 'Food Service / Processing', terms: ['food processing', 'bakery', 'meat market', 'catering', 'commissary', 'food plant', 'brewery'] },
  { vertical: 'Retail', terms: ['store', 'shop', 'boutique', 'retail', 'market', 'grocery', 'pharmacy', 'salon'] },
  { vertical: 'Warehouse / Distribution', terms: ['warehouse', 'distribution', 'logistics', 'freight', 'storage', 'terminal', 'fulfillment'] },
  { vertical: 'Multi-Family / Apartments', terms: ['apartments', 'apartment', 'multifamily', 'leasing office', 'resident', 'townhomes'] },
  { vertical: 'HOA / Community', terms: ['hoa', 'community association', 'clubhouse', 'amenity center'] },
  { vertical: 'Commercial Office', terms: ['office', 'insurance', 'agency', 'law firm', 'attorney', 'real estate', 'accounting', 'professional'] },
  { vertical: 'Healthcare / Medical', terms: ['medical', 'clinic', 'hospital', 'dental', 'dentist', 'orthodont', 'doctor', 'pediatric', 'urgent care', 'surgery'] },
  { vertical: 'School / Daycare', terms: ['school', 'daycare', 'academy', 'learning center', 'childcare', 'elementary', 'isd', 'college'] },
  { vertical: 'Hotel / Hospitality', terms: ['hotel', 'inn', 'suites', 'hospitality', 'lodge', 'resort'] },
  { vertical: 'Government / Municipal', terms: ['city of', 'town of', 'police', 'fire department', 'municipal', 'county', 'public works', 'government'] },
];

export function classifyVertical(lead = {}) {
  const haystack = [
    lead.businessName,
    lead.notes,
    lead.streetName,
    lead.city,
    lead.email,
    lead.website,
    lead.sourceText,
  ].filter(Boolean).join(' ').toLowerCase();

  let best = { vertical: lead.vertical || 'Other', score: 0 };
  for (const pattern of VERTICAL_PATTERNS) {
    const score = pattern.terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
    if (score > best.score) best = { vertical: pattern.vertical, score };
  }

  const vertical = best.score > 0 ? best.vertical : (lead.vertical && INDUSTRY_VERTICALS.includes(lead.vertical) ? lead.vertical : 'Other');
  const propertyType = verticalToPropertyType(vertical);
  return {
    vertical,
    verticalConfidence: best.score >= 2 ? 'high' : best.score === 1 ? 'medium' : 'low',
    propertyType,
  };
}

export function verticalToPropertyType(vertical = '') {
  return 'Commercial';
}

export function normalizeLead(rawLead = {}, { fillNameDots = false } = {}) {
  const lead = { ...rawLead };
  lead.businessName = String(lead.businessName || '').trim();
  lead.pocFirst = normalizeName(lead.pocFirst, fillNameDots);
  lead.pocLast = normalizeName(lead.pocLast, fillNameDots);
  lead.phone = normalizePhone(lead.phone);
  lead.email = normalizeEmail(lead.email);
  lead.state = normalizeState(lead.state);
  lead.zip = normalizeZip(lead.zip);
  lead.streetNumber = String(lead.streetNumber || '').trim();
  lead.streetName = String(lead.streetName || '').trim();
  lead.addressLine2 = String(lead.addressLine2 || '').trim();
  lead.city = String(lead.city || '').trim();
  if ((!lead.streetName || !lead.streetNumber) && lead.streetAddress) {
    const parts = splitStreetAddress(lead.streetAddress);
    lead.streetNumber = lead.streetNumber || parts.streetNumber;
    lead.streetName = lead.streetName || parts.streetName;
  }
  const classification = classifyVertical(lead);
  if (!lead.vertical || lead.vertical === 'Restaurant' || lead.vertical === 'Other') {
    lead.vertical = classification.vertical;
  }
  lead.propertyType = 'Commercial';
  lead.verticalConfidence = classification.verticalConfidence;
  return lead;
}
