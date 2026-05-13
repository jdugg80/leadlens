import {
  EnrichedContact,
  ContactSignalEnrichment,
  ContactConfidence,
  ContactSource,
  ContactRoleType
} from './contactSignalTypes';

/**
 * Deterministic hash to generate semi-random but consistent mock data
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

const FIRST_NAMES = ['Robert', 'David', 'James', 'Michael', 'Susan', 'Linda', 'Patricia', 'Karen', 'Steven', 'Paul'];
const LAST_NAMES = ['Miller', 'Davis', 'Wilson', 'Anderson', 'Taylor', 'Thomas', 'Moore', 'White', 'Harris', 'Martin'];

/**
 * Enrichment logic for ContactSignal.
 * Searches public records (mocked for MVP) to find likely contacts for a business.
 */
export async function enrichWithContactSignal(params: {
  name: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  placeId?: string;
}): Promise<ContactSignalEnrichment> {
  const startTime = Date.now();
  const name = params.name || 'Business';
  const normalizedName = name.toLowerCase().trim();
  const normalizedAddress = (params.address || '').toLowerCase().trim();

  console.log('[ContactSignal] Starting enrichment for:', {
    name: normalizedName,
    address: normalizedAddress
  });

  const hash = simpleHash(name + (params.address || ''));
  const contacts: EnrichedContact[] = [];

  // 1. Mock logic: Simulate finding a TABC license holder
  if (normalizedName.includes('bar') || normalizedName.includes('grill') || normalizedName.includes('bistro') || (hash % 3 === 0)) {
    const fIdx = hash % FIRST_NAMES.length;
    const lIdx = (hash + 1) % LAST_NAMES.length;
    const fullName = `${FIRST_NAMES[fIdx]} ${LAST_NAMES[lIdx]}`;

    contacts.push({
      id: `cs_${hash}_1`,
      fullName,
      firstName: FIRST_NAMES[fIdx],
      lastName: LAST_NAMES[lIdx],
      roleType: 'license_holder',
      source: 'tabc',
      sourceUrl: 'https://www.tabc.texas.gov/public-inquiry/',
      confidence: 'strong',
      matchedBy: { nameMatch: true, addressMatch: true },
      lastCheckedAt: new Date().toISOString(),
    });
  }

  // 2. Mock logic: Simulate finding a Registered Agent via SOS
  if (normalizedName.length > 5) {
    const fIdx = (hash + 2) % FIRST_NAMES.length;
    const lIdx = (hash + 3) % LAST_NAMES.length;
    const fullName = `${FIRST_NAMES[fIdx]} ${LAST_NAMES[lIdx]}, Esq.`;

    contacts.push({
      id: `cs_${hash}_2`,
      fullName,
      firstName: FIRST_NAMES[fIdx],
      lastName: LAST_NAMES[lIdx],
      title: 'Registered Agent',
      roleType: 'registered_agent',
      companyName: `${LAST_NAMES[lIdx]} & Associates Legal`,
      mailingAddress: `${(hash % 999) + 100} Main St, Austin, TX 78701`,
      source: 'texas_sos',
      sourceUrl: 'https://mycpa.cpa.state.tx.us/coa/',
      confidence: 'possible',
      matchedBy: { nameMatch: true, addressMatch: false, entityMatch: true },
      lastCheckedAt: new Date().toISOString(),
    });
  }

  // 3. Mock logic: Simulate property owner
  if (normalizedAddress) {
    contacts.push({
      id: `cs_${hash}_3`,
      fullName: `${name.split(' ')[0]} Realty Holding LLC`,
      roleType: 'property_owner',
      source: 'property_record',
      sourceUrl: 'https://www.traviscad.org/property-search/',
      confidence: 'weak',
      matchedBy: { nameMatch: false, addressMatch: true },
      lastCheckedAt: new Date().toISOString(),
    });
  }

  // Determine overall enrichment status
  const bestContact = contacts.sort(compareConfidence).find(c => c.confidence !== 'weak') || contacts[0];
  const duration = Date.now() - startTime;

  const result: ContactSignalEnrichment = {
    contactSignal: contacts.length > 0,
    contactSignalConfidence: bestContact?.confidence || 'weak',
    contactSignalSources: Array.from(new Set(contacts.map(c => c.source))),
    contacts: contacts,
    primaryContactId: bestContact?.id,
  };

  console.log('[ContactSignal] Enrichment complete:', {
    duration: `${duration}ms`,
    contactsFound: contacts.length,
    confidence: result.contactSignalConfidence,
    sources: result.contactSignalSources
  });

  return result;
}

function compareConfidence(a: EnrichedContact, b: EnrichedContact) {
  const scores: Record<string, number> = { verified: 4, strong: 3, possible: 2, weak: 1 };
  return (scores[b.confidence] || 0) - (scores[a.confidence] || 0);
}
