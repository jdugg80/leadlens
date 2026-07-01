import { EMPTY_LEAD } from '../constants';

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

export function normalizeBusinessName(name = '') {
  return String(name || '').replace(/\s+/g, ' ').trim();
}

export function normalizePersonName(name = '') {
  const cleaned = String(name || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  return cleaned
    .split(' ')
    .map((part) => part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : '')
    .join(' ');
}

function splitStreetAddress(address = '') {
  const cleaned = String(address || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return { streetNumber: '', streetName: '' };
  const match = cleaned.match(/^\s*([0-9]+)\s+(.+)$/);
  if (!match) return { streetNumber: '', streetName: cleaned };
  return { streetNumber: match[1], streetName: match[2].trim() };
}

function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeLine2Value(value = '', type = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const cleaned = raw.replace(/\s+/g, ' ').trim();
  const normalizedType = String(type || '').toLowerCase();

  if (normalizedType === 'suite' || normalizedType === 'suitenumber') {
    return `Suite ${cleaned}`;
  }
  if (normalizedType === 'unit' || normalizedType === 'unitnumber') {
    return `Unit ${cleaned}`;
  }
  if (normalizedType === 'apt' || normalizedType === 'apartment' || normalizedType === 'apartmentnumber') {
    return `Apt ${cleaned}`;
  }
  if (normalizedType === 'building' || normalizedType === 'bldg') {
    return `Building ${cleaned}`;
  }
  if (normalizedType === 'floor' || normalizedType === 'fl') {
    return `Floor ${cleaned}`;
  }
  if (normalizedType === 'room' || normalizedType === 'rm') {
    return `Room ${cleaned}`;
  }
  return cleaned;
}

function normalizeAddressLine2FromText(text = '') {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';

  const labeled = raw.match(/\b(suite|ste|ste\.|unit|apt|apartment|apartmentnumber|building|bldg|floor|fl|room|rm|#)\b\.?\s*#?\s*([A-Za-z0-9-]+)\b/i);
  if (labeled) {
    let label = labeled[1].toLowerCase();
    const value = labeled[2];
    if (label === 'ste.' || label === 'ste') {
      label = 'suite';
    }
    return normalizeLine2Value(value, label);
  }

  const hashMatch = raw.match(/#\s*([A-Za-z0-9-]+)/);
  if (hashMatch) {
    return `#${hashMatch[1]}`;
  }

  return '';
}

function stripAddressLine2FromStreet(streetName = '', line2 = '') {
  if (!streetName || !line2) return String(streetName || '').trim();

  const escaped = escapeRegExp(line2);
  const cleaned = String(streetName || '').replace(new RegExp(`(?:,\s*)?${escaped}(?:\b|$)`, 'i'), '');

  return cleaned.replace(/\s+/g, ' ').trim().replace(/[ ,]+$/, '').trim();
}

export function getAddressLine2FromLead(lead = {}) {
  const explicitFields = [
    'addressLine2',
    'address2',
    'address_2',
    'suite',
    'suiteNumber',
    'suiteNum',
    'unit',
    'unitNumber',
    'unitNum',
    'apt',
    'aptNumber',
    'apartment',
    'apartmentNumber',
    'building',
    'bldg',
    'floor',
    'room',
    'secondaryAddress',
    'subpremise',
  ];

  for (const field of explicitFields) {
    const rawValue = lead[field];
    if (rawValue != null && String(rawValue || '').trim()) {
      return normalizeLine2Value(rawValue, field);
    }
  }

  const fallbackFields = ['fullAddress', 'formattedAddress', 'address', 'streetAddress', 'streetName'];
  for (const field of fallbackFields) {
    const extracted = normalizeAddressLine2FromText(lead[field]);
    if (extracted) return extracted;
  }

  return '';
}

export function normalizeLead(raw = {}) {
  const lead = { ...EMPTY_LEAD, ...raw };
  let streetNumber = String(lead.streetNumber || '').trim();
  let streetName = String(lead.streetName || '').replace(/\s+/g, ' ').trim();
  const rawAddressLine2 = getAddressLine2FromLead(lead);

  if ((!streetName || !streetNumber) && lead.streetAddress) {
    const parts = splitStreetAddress(lead.streetAddress);
    streetNumber = streetNumber || parts.streetNumber;
    streetName = streetName || parts.streetName;
  }

  return {
    ...lead,
    businessName: normalizeBusinessName(lead.businessName),
    pocFirst: normalizePersonName(lead.pocFirst),
    pocLast: normalizePersonName(lead.pocLast),
    phone: normalizePhone(lead.phone),
    email: normalizeEmail(lead.email),
    website: String(lead.website || '').trim(),
    facebookUrl: String(lead.facebookUrl || '').trim(),
    instagramUrl: String(lead.instagramUrl || '').trim(),
    linkedinUrl: String(lead.linkedinUrl || '').trim(),
    tiktokUrl: String(lead.tiktokUrl || '').trim(),
    youtubeUrl: String(lead.youtubeUrl || '').trim(),
    xUrl: String(lead.xUrl || '').trim(),
    socialConfidence: String(lead.socialConfidence || '').trim() || 'none',
    socialSource: String(lead.socialSource || '').trim(),
    streetNumber,
    streetName: stripAddressLine2FromStreet(streetName, rawAddressLine2),
    addressLine2: rawAddressLine2 || String(lead.addressLine2 || '').replace(/\s+/g, ' ').trim(),
    city: normalizePersonName(lead.city),
    state: normalizeState(lead.state),
    zip: normalizeZip(lead.zip),
    confidence: String(lead.confidence || '').trim().toLowerCase() || 'medium',
    status: normalizeFixedFieldValue(lead.status),
    propertyType: normalizeFixedFieldValue(lead.propertyType || 'Commercial'),
    notes: String(lead.notes || '').trim(),
  };
}

export function applyRequiredPlaceholders(lead = {}) {
  return {
    ...lead,
    pocFirst: String(lead.pocFirst || '').trim() || '.',
    pocLast: String(lead.pocLast || '').trim() || '.',
  };
}

function normalizedComparable(value = '') {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function getLeadFingerprint(lead = {}) {
  const domain = normalizeEmail(lead.email).split('@')[1] || '';
  return [
    normalizedComparable(lead.businessName),
    String(lead.phone || '').replace(/\D/g, ''),
    normalizeEmail(lead.email),
    normalizedComparable(`${lead.streetNumber} ${lead.streetName} ${lead.city} ${lead.state} ${lead.zip}`),
    domain,
  ].filter(Boolean).join('|');
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function normalizeDomain(website) {
  if (!website) return '';
  const w = String(website).toLowerCase().trim();
  return w.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').trim();
}

export function findDuplicateInLeads(candidate, leads = []) {
  const normalizedCandidate = normalizeLead(candidate);
  const candidatePhone = String(normalizedCandidate.phone || '').replace(/\D/g, '');
  const candidateEmail = normalizeEmail(normalizedCandidate.email);
  const candidateBusiness = normalizedComparable(normalizedCandidate.businessName);
  const candidateAddress = normalizedComparable(`${normalizedCandidate.streetNumber} ${normalizedCandidate.streetName} ${normalizedCandidate.addressLine2} ${normalizedCandidate.city} ${normalizedCandidate.state} ${normalizedCandidate.zip}`);
  const candidateWebsite = normalizeDomain(normalizedCandidate.website);
  const candidateLat = normalizedCandidate.latitude;
  const candidateLon = normalizedCandidate.longitude;

  for (let i = 0; i < leads.length; i += 1) {
    const existing = normalizeLead(leads[i]);
    const existingPhone = String(existing.phone || '').replace(/\D/g, '');
    const existingEmail = normalizeEmail(existing.email);
    const existingBusiness = normalizedComparable(existing.businessName);
    const existingAddress = normalizedComparable(`${existing.streetNumber} ${existing.streetName} ${existing.addressLine2} ${existing.city} ${existing.state} ${existing.zip}`);
    const existingWebsite = normalizeDomain(existing.website);
    const existingLat = existing.latitude;
    const existingLon = existing.longitude;

    let score = 0;
    const reasons = [];

    if (candidatePhone && existingPhone && candidatePhone === existingPhone) {
      score += 60;
      reasons.push('same phone');
    }
    if (candidateEmail && existingEmail && candidateEmail === existingEmail) {
      score += 70;
      reasons.push('same email');
    }
    if (candidateWebsite && existingWebsite && candidateWebsite === existingWebsite) {
      score += 50;
      reasons.push('same website');
    }
    if (candidateBusiness && existingBusiness && candidateBusiness === existingBusiness) {
      score += 35;
      reasons.push('same business');
    } else if (candidateBusiness && existingBusiness && (candidateBusiness.includes(existingBusiness) || existingBusiness.includes(candidateBusiness))) {
      score += 20;
      reasons.push('similar business');
    }
    if (candidateAddress && existingAddress && candidateAddress === existingAddress) {
      score += 35;
      reasons.push('same address');
    } else if (candidateAddress && existingAddress && (candidateAddress.includes(existingAddress) || existingAddress.includes(candidateAddress))) {
      score += 15;
      reasons.push('similar address');
    }
    if (normalizedCandidate.streetNumber && existing.streetNumber && normalizedCandidate.streetNumber === existing.streetNumber && normalizedCandidate.streetName && existing.streetName && normalizedComparable(normalizedCandidate.streetName) === normalizedComparable(existing.streetName)) {
      score += 15;
      if (!reasons.includes('same address')) reasons.push('same street');
    }
    if (normalizedCandidate.addressLine2 && existing.addressLine2 && normalizedComparable(normalizedCandidate.addressLine2) === normalizedComparable(existing.addressLine2)) {
      score += 10;
      reasons.push('same suite');
    }
    if (normalizedCandidate.zip && existing.zip && normalizedCandidate.zip === existing.zip && candidateBusiness && existingBusiness) {
      score += 10;
      if (!reasons.includes('same business')) reasons.push('same zip + business');
    }
    // GPS distance — soft signal only, never triggers duplicate on its own.
    // A field rep scans multiple businesses from the same location so GPS proximity
    // must not contribute unless a hard identifier (phone/email/exact name) already matched.
    const hasHardMatch = score >= 60; // phone=60, email=70 — hard identifiers already hit threshold
    if (candidateLat && candidateLon && existingLat && existingLon) {
      const dist = haversineDistance(candidateLat, candidateLon, existingLat, existingLon);
      if (hasHardMatch) {
        if (dist <= 46) {
          score += 10;
          reasons.push(`GPS within ${Math.round(dist)}m`);
        } else if (dist <= 150) {
          score += 5;
          reasons.push(`GPS nearby ${Math.round(dist)}m`);
        }
      }
    }

    if (score >= 80) {
      return {
        index: i,
        existing,
        reason: reasons.join(', '),
        confidence: score >= 95 ? 'high' : score >= 80 ? 'medium' : 'low',
        score,
      };
    }
  }
  return null;
}

export function inferVertical(lead = {}) {
  const haystack = [
    lead.businessName,
    lead.notes,
    lead.streetName,
    lead.email,
  ].join(' ').toLowerCase();

  const checks = [
    { vertical: 'Restaurants', patterns: ['restaurant', 'grill', 'bbq', 'cafe', 'taqueria', 'taco', 'pizza', 'burger', 'kitchen', 'eatery', 'bistro', 'diner', 'fast food', 'drive thru', 'drive-thru', 'subway', 'mcdonald', 'wendy', 'whataburger', 'sonic', 'popeyes', 'kfc', 'taco bell'] },
    { vertical: 'Medical', patterns: ['hospital', 'medical center', 'emergency room', 'er clinic', 'dental', 'dentist', 'clinic', 'medical', 'doctor', 'orthodont', 'urgent care', 'pediatrics', 'family medicine', 'chiropractic', 'vision', 'optometry', 'pharmacy'] },
    { vertical: 'Schools / Daycares', patterns: ['school', 'daycare', 'learning center', 'academy', 'childcare', 'child care', 'preschool'] },
    { vertical: 'Government', patterns: ['city of', 'county', 'municipal', 'police', 'fire department', 'public works', 'courthouse', 'government'] },
    { vertical: 'Hotels / Motels / Apartments', patterns: ['hotel', 'motel', 'inn', 'suites', 'resort', 'lodge', 'apartments', 'apartment', 'leasing', 'residents', 'condominiums', 'condos', 'townhomes'] },
    { vertical: 'Logistics / Distribution', patterns: ['distribution', 'logistics', 'fulfillment', 'freight', 'shipping', 'supply chain', 'cross dock', 'cross-dock', '3pl', 'moving company'] },
    { vertical: 'Warehousing', patterns: ['warehouse', 'cold storage', 'self storage', 'industrial park'] },
    { vertical: 'Food & Beverage Processing', patterns: ['food processing', 'beverage', 'brewery', 'bottling', 'meat processing', 'bakery plant', 'commissary', 'food manufacturer'] },
    { vertical: 'Office Buildings', patterns: ['office building', 'business office', 'professional office', 'corporate office', 'business park', 'law office', 'insurance agency', 'agency', 'accounting', 'financial office', 'real estate office', 'title company'] },
    { vertical: 'Retail', patterns: ['convenience', 'gas station', 'fuel', 'c-store', 'corner store', 'market express', 'dealership', 'auto sales', 'car dealer', 'toyota', 'ford', 'chevrolet', 'honda', 'nissan', 'dodge', 'jeep', 'ram', 'kia', 'hyundai', 'store', 'shop', 'boutique', 'market', 'mart', 'retail', 'outlet', 'dollar'] },
  ];

  for (const check of checks) {
    if (check.patterns.some((pattern) => haystack.includes(pattern))) {
      return { vertical: check.vertical, propertyType: 'Commercial' };
    }
  }

  return {
    vertical: lead.vertical || EMPTY_LEAD.vertical,
    propertyType: normalizeFixedFieldValue(lead.propertyType || 'Commercial'),
  };
}

export function getLeadTimestamp(lead = {}) {
  const dateValue = lead.collectedAt || lead.createdAt || lead.savedAt || lead.capturedAt || lead.created_at_client;
  const parsed = new Date(dateValue || '');
  return Number.isFinite(parsed.getTime()) ? parsed.getTime() : Date.now();
}

export function ensureLeadCreatedAt(lead = {}) {
  if (lead.createdAt) return lead;
  const createdAt = lead.savedAt || lead.capturedAt || lead.created_at_client || new Date().toISOString();
  return { ...lead, createdAt: new Date(createdAt).toISOString() };
}

export function sortLeadsNewestFirst(leads = []) {
  return (Array.isArray(leads) ? leads : [])
    .map(ensureLeadCreatedAt)
    .sort((a, b) => getLeadTimestamp(b) - getLeadTimestamp(a));
}

export function hasUsableAddress(prospect) {
  return Boolean(
    prospect.fullAddress ||
    prospect.formattedAddress ||
    (
      (prospect.street || prospect.streetName || prospect.address) &&
      prospect.city &&
      prospect.state
    )
  );
}

export function hasUsablePhone(prospect) {
  return Boolean(prospect.phone && String(prospect.phone).trim().length >= 7);
}

export function hasUsableEmail(prospect) {
  return Boolean(
    prospect.email &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(prospect.email).trim())
  );
}

export function calculateLeadViability(prospect) {
  const missing = [];

  const hasAddress = hasUsableAddress(prospect);
  const hasPhone = hasUsablePhone(prospect);
  const hasEmail = hasUsableEmail(prospect);

  if (!hasAddress) missing.push("Address");
  if (!hasPhone) missing.push("Phone");
  if (!hasEmail) missing.push("Email");

  const score =
    (hasAddress ? 1 : 0) +
    (hasPhone ? 1 : 0) +
    (hasEmail ? 1 : 0);

  let viabilityLabel = "Incomplete";
  let shadeKey = "red";

  if (score === 3) {
    viabilityLabel = "Viable";
    shadeKey = "green";
  } else if (score === 2) {
    viabilityLabel = "Needs One Field";
    shadeKey = "yellow";
  } else if (score === 1) {
    viabilityLabel = "Weak Lead";
    shadeKey = "orange";
  }

  return {
    viabilityScore: score,
    viabilityLabel,
    missingViabilityFields: missing,
    shadeKey
  };
}

export function sortQueueProspects(prospects) {
  return [...prospects].sort((a, b) => {
    const aGroup = a.queueSortGroup ?? (a.reviewedAt ? 1 : 0);
    const bGroup = b.queueSortGroup ?? (b.reviewedAt ? 1 : 0);

    if (aGroup !== bGroup) {
      return aGroup - bGroup;
    }

    if (aGroup === 0) {
      const aCollected = new Date(a.collectedAt || a.createdAt || 0).getTime();
      const bCollected = new Date(b.collectedAt || b.createdAt || 0).getTime();
      return bCollected - aCollected;
    }

    const aReviewed = new Date(a.reviewedAt || a.lastEditedAt || a.updatedAt || 0).getTime();
    const bReviewed = new Date(b.reviewedAt || b.lastEditedAt || b.updatedAt || 0).getTime();
    return aReviewed - bReviewed;
  });
}

export function getLeadId(lead = {}) {
  return String(
    lead?.id ||
    lead?.leadId ||
    lead?.queueId ||
    lead?.createdAt ||
    lead?.savedAt ||
    lead?.capturedAt ||
    lead?.businessName ||
    ''
  ).trim();
}

export function matchLeadByAnyId(leads = [], target = {}) {
  const targetId = getLeadId(target);
  return targetId ? leads.findIndex(l => getLeadId(l) === targetId) : -1;
}

// Merge OCR-extracted data into an existing prospect.
// Empty fields auto-fill. Filled fields that conflict are flagged.
// Conflicts default to keeping the existing value.
export function mergeProspectWithScreenshot(existing, extracted) {
  if (!existing || !extracted) return { prospect: existing, conflicts: [] };

  const prospect = { ...existing };
  const conflicts = [];
  const now = new Date().toISOString();

  const fieldMap = {
    businessName: 'businessName',
    phone: 'phone',
    email: 'email',
    streetNumber: 'streetNumber',
    streetName: 'streetName',
    city: 'city',
    state: 'state',
    zip: 'zip',
    website: 'website',
    pocFirst: 'pocFirst',
    pocLast: 'pocLast',
    notes: 'notes',
  };

  for (const [targetField, sourceField] of Object.entries(fieldMap)) {
    const existingVal = String(existing[targetField] || '').trim();
    const extractedVal = String(extracted[sourceField] || '').trim();

    if (!extractedVal) continue; // nothing extracted for this field

    if (!existingVal) {
      // Field is empty — auto-fill from extraction
      prospect[targetField] = extractedVal;
    } else if (existingVal.toLowerCase() !== extractedVal.toLowerCase()) {
      // Field is filled and conflicts — flag for manual resolution
      conflicts.push({
        field: targetField,
        label: targetField.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()),
        existing: existingVal,
        extracted: extractedVal,
      });
      // Default: keep existing value (no overwrite)
    }
  }

  prospect.lastEditedAt = now;
  prospect.screenshotEnrichedAt = now;
  if (prospect.captureMethod && !prospect.captureMethod.includes('screenshot')) {
    prospect.captureMethod = `${prospect.captureMethod}+screenshot`;
  }

  return { prospect, conflicts };
}

