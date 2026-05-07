import {
  EnrichedContact,
  ContactSignalEnrichment,
  ContactConfidence,
  ContactSource,
  ContactRoleType
} from './contactSignalTypes';

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
  const normalizedName = (params.name || '').toLowerCase().trim();
  const normalizedAddress = (params.address || '').toLowerCase().trim();

  console.log('[ContactSignal] Starting enrichment for:', {
    name: normalizedName,
    address: normalizedAddress
  });

  const contacts: EnrichedContact[] = [];
  const sourcesChecked: ContactSource[] = [
    'texas_sos', 'county_dba', 'tabc', 'health_permit',
    'certificate_of_occupancy', 'building_permit', 'property_record'
  ];

  // 1. Mock logic: Simulate finding a TABC license holder
  if (normalizedName.includes('bar') || normalizedName.includes('grill') || normalizedName.includes('bistro')) {
    contacts.push({
      id: `cs_${Date.now()}_1`,
      fullName: 'Maria Lopez',
      firstName: 'Maria',
      lastName: 'Lopez',
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
    contacts.push({
      id: `cs_${Date.now()}_2`,
      fullName: 'John Smith, Esq.',
      firstName: 'John',
      lastName: 'Smith',
      title: 'Registered Agent',
      roleType: 'registered_agent',
      companyName: 'Smith & Associates Legal',
      mailingAddress: 'PO Box 123, Austin, TX 78701',
      source: 'texas_sos',
      confidence: 'possible',
      matchedBy: { nameMatch: true, addressMatch: false, entityMatch: true },
      lastCheckedAt: new Date().toISOString(),
    });
  }

  // 3. Mock logic: Simulate property owner
  if (normalizedAddress) {
    contacts.push({
      id: `cs_${Date.now()}_3`,
      fullName: 'Commercial Realty Group LLC',
      roleType: 'property_owner',
      source: 'property_record',
      confidence: 'weak',
      matchedBy: { nameMatch: false, addressMatch: true },
      lastCheckedAt: new Date().toISOString(),
    });
  }

  // Determine overall enrichment status
  const bestContact = contacts.sort(compareConfidence).find(c => c.confidence !== 'weak');
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
  const scores = { verified: 4, strong: 3, possible: 2, weak: 1 };
  return scores[b.confidence] - scores[a.confidence];
}
