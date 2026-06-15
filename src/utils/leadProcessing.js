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

export function normalizeFixedFieldValue(value) {
  if (!value) return "";
  const normalized = String(value).trim().toLowerCase();
  const fixedMap = {
    suspect: "Suspect",
    commercial: "Commercial",
    work: "Work",
  };
  return fixedMap[normalized] ?? String(value).trim();
}

const STATE_NAME_MAP = {
  alabama:'AL',alaska:'AK',arizona:'AZ',arkansas:'AR',california:'CA',colorado:'CO',connecticut:'CT',delaware:'DE',florida:'FL',georgia:'GA',hawaii:'HI',idaho:'ID',illinois:'IL',indiana:'IN',iowa:'IA',kansas:'KS',kentucky:'KY',louisiana:'LA',maine:'ME',maryland:'MD',massachusetts:'MA',michigan:'MI',minnesota:'MN',mississippi:'MS',missouri:'MO',montana:'MT',nebraska:'NE',nevada:'NV','new hampshire':'NH','new jersey':'NJ','new mexico':'NM','new york':'NY','north carolina':'NC','north dakota':'ND',ohio:'OH',oklahoma:'OK',oregon:'OR',pennsylvania:'PA','rhode island':'RI','south carolina':'SC','south dakota':'SD',tennessee:'TN',texas:'TX',utah:'UT',vermont:'VT',virginia:'VA',washington:'WA','west virginia':'WV',wisconsin:'WI',wyoming:'WY',
};

export function normalizeState(value = '') {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  if (STATE_NAME_MAP[lower]) return STATE_NAME_MAP[lower];
  return trimmed.toUpperCase().slice(0, 2);
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
  { vertical: 'Restaurants', terms: ['restaurant', 'grill', 'bbq', 'cafe', 'taqueria', 'taco', 'pizza', 'burger', 'kitchen', 'eatery', 'bistro', 'diner'] },
  { vertical: 'Food & Beverage Processing', terms: ['food processing', 'bakery', 'meat market', 'catering', 'commissary', 'food plant', 'brewery'] },
  { vertical: 'Retail', terms: ['store', 'shop', 'boutique', 'retail', 'market', 'grocery', 'pharmacy', 'salon'] },
  { vertical: 'Logistics / Distribution', terms: ['distribution', 'logistics', 'freight', 'shipping', 'terminal', 'fulfillment'] },
  { vertical: 'Warehousing', terms: ['warehouse', 'storage', 'cold storage'] },
  { vertical: 'Hotels / Motels / Apartments', terms: ['apartments', 'apartment', 'multifamily', 'leasing office', 'resident', 'townhomes', 'hotel', 'motel', 'inn', 'suites', 'hospitality', 'lodge', 'resort'] },
  { vertical: 'Office Buildings', terms: ['office', 'insurance', 'agency', 'law firm', 'attorney', 'real estate', 'accounting', 'professional', 'hoa', 'community association', 'clubhouse', 'amenity center'] },
  { vertical: 'Medical', terms: ['medical', 'clinic', 'hospital', 'dental', 'dentist', 'orthodont', 'doctor', 'pediatric', 'urgent care', 'surgery'] },
  { vertical: 'Schools / Daycares', terms: ['school', 'daycare', 'academy', 'learning center', 'childcare', 'elementary', 'isd', 'college'] },
  { vertical: 'Government', terms: ['city of', 'town of', 'police', 'fire department', 'municipal', 'county', 'public works', 'government'] },
  { vertical: 'Pest Control', terms: ['pest control', 'exterminator', 'pest management', 'bug', 'termite', 'roach', 'rodent', 'pesticide', 'fumigation', 'mosquito'] },
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
  lead.website = String(lead.website || '').trim();
  lead.facebookUrl = String(lead.facebookUrl || '').trim();
  lead.instagramUrl = String(lead.instagramUrl || '').trim();
  lead.linkedinUrl = String(lead.linkedinUrl || '').trim();
  lead.tiktokUrl = String(lead.tiktokUrl || '').trim();
  lead.youtubeUrl = String(lead.youtubeUrl || '').trim();
  lead.xUrl = String(lead.xUrl || '').trim();
  lead.socialConfidence = String(lead.socialConfidence || '').trim() || 'none';
  lead.socialSource = String(lead.socialSource || '').trim();
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
  lead.propertyType = normalizeFixedFieldValue(classification.propertyType || lead.propertyType);
  lead.status = normalizeFixedFieldValue(lead.status);
  lead.verticalConfidence = classification.verticalConfidence;
  return lead;
}
