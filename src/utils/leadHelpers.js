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

export function normalizeState(state = '') {
  return String(state || '').trim().toUpperCase().slice(0, 2);
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

export function normalizeLead(raw = {}) {
  const lead = { ...EMPTY_LEAD, ...raw };
  return {
    ...lead,
    businessName: normalizeBusinessName(lead.businessName),
    pocFirst: normalizePersonName(lead.pocFirst),
    pocLast: normalizePersonName(lead.pocLast),
    phone: normalizePhone(lead.phone),
    email: normalizeEmail(lead.email),
    streetNumber: String(lead.streetNumber || '').trim(),
    streetName: String(lead.streetName || '').replace(/\s+/g, ' ').trim(),
    addressLine2: String(lead.addressLine2 || '').replace(/\s+/g, ' ').trim(),
    city: normalizePersonName(lead.city),
    state: normalizeState(lead.state),
    zip: normalizeZip(lead.zip),
    confidence: String(lead.confidence || '').trim().toLowerCase() || 'medium',
    propertyType: 'Commercial',
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

export function findDuplicateInLeads(candidate, leads = []) {
  const normalizedCandidate = normalizeLead(candidate);
  const candidatePhone = String(normalizedCandidate.phone || '').replace(/\D/g, '');
  const candidateEmail = normalizeEmail(normalizedCandidate.email);
  const candidateBusiness = normalizedComparable(normalizedCandidate.businessName);
  const candidateAddress = normalizedComparable(`${normalizedCandidate.streetNumber} ${normalizedCandidate.streetName} ${normalizedCandidate.addressLine2} ${normalizedCandidate.city} ${normalizedCandidate.state} ${normalizedCandidate.zip}`);

  for (let i = 0; i < leads.length; i += 1) {
    const existing = normalizeLead(leads[i]);
    const existingPhone = String(existing.phone || '').replace(/\D/g, '');
    const existingEmail = normalizeEmail(existing.email);
    const existingBusiness = normalizedComparable(existing.businessName);
    const existingAddress = normalizedComparable(`${existing.streetNumber} ${existing.streetName} ${existing.addressLine2} ${existing.city} ${existing.state} ${existing.zip}`);

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

    if (score >= 65) {
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
    { vertical: 'Healthcare / Medical', patterns: ['dental', 'dentist', 'clinic', 'medical', 'doctor', 'orthodont', 'urgent care', 'pediatrics', 'family medicine'] },
    { vertical: 'Restaurant', patterns: ['restaurant', 'grill', 'cafe', 'pizza', 'bbq', 'burger', 'taqueria', 'kitchen', 'bistro'] },
    { vertical: 'Hotel / Hospitality', patterns: ['hotel', 'inn', 'suites', 'resort', 'lodge'] },
    { vertical: 'Multi-Family / Apartments', patterns: ['apartments', 'apartment', 'leasing', 'residents', 'condominiums', 'condos'] },
    { vertical: 'Warehouse / Distribution', patterns: ['warehouse', 'distribution', 'logistics', 'fulfillment'] },
    { vertical: 'School / Daycare', patterns: ['school', 'daycare', 'learning center', 'academy', 'childcare'] },
    { vertical: 'Government / Municipal', patterns: ['city of', 'county', 'municipal', 'police', 'fire department', 'public works'] },
    { vertical: 'Retail', patterns: ['store', 'shop', 'boutique', 'market', 'mart'] },
    { vertical: 'Commercial Office', patterns: ['law office', 'insurance', 'agency', 'office', 'accounting', 'financial'] },
  ];

  for (const check of checks) {
    if (check.patterns.some((pattern) => haystack.includes(pattern))) {
      return { vertical: check.vertical, propertyType: 'Commercial' };
    }
  }

  return {
    vertical: lead.vertical || EMPTY_LEAD.vertical,
    propertyType: 'Commercial',
  };
}
