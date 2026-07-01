/**
 * BizCollect Enrichment Provider
 * 
 * Searches for business contacts via BizCollect's async API.
 * Free tier: 200 signup credits + 20/day.
 * 
 * Flow: POST /api/v1/search with wait:true → single sync call → match by name.
 * 
 * Cost: 20 credits per keyword per page (standard search).
 * We use 1 keyword + 1 page = 20 credits per lookup.
 */

const BIZCOLLECT_BASE = 'https://kindly-lyrebird-376.convex.site/api/v1';

function getApiKey() {
  return process.env.EXPO_PUBLIC_BIZCOLLECT_API_KEY || '';
}

export function isAvailable() {
  return !!getApiKey();
}

export function getProviderName() {
  return 'BizCollect';
}

/**
 * Build search keywords from business vertical/type.
 * Maps LeadLens verticals to BizCollect search keywords.
 */
function buildKeywords(vertical, businessName) {
  const keywords = [];

  // Use vertical as primary keyword if available
  if (vertical) {
    keywords.push(vertical.toLowerCase());
  }

  // Always include a generic fallback
  if (!keywords.includes('business')) {
    keywords.push('business');
  }

  return keywords.slice(0, 3); // Max 3 keywords to conserve credits
}

/**
 * Build location string from query.
 */
function buildLocation(query) {
  if (query.city && query.state) {
    return `${query.city}, ${query.state}`;
  }
  if (query.zip) {
    return query.zip;
  }
  if (query.city) {
    return query.city;
  }
  return null;
}

/**
 * Calculate string similarity for name matching.
 * Returns 0-1 score.
 */
function nameSimilarity(a, b) {
  if (!a || !b) return 0;
  const normalize = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const na = normalize(a);
  const nb = normalize(b);

  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;

  // Jaccard on words
  const wordsA = new Set(na.split(/\s+/));
  const wordsB = new Set(nb.split(/\s+/));
  const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);
  return union.size > 0 ? intersection.size / union.size : 0;
}

/**
 * Find the best matching business from BizCollect results.
 */
function findBestMatch(businesses, query) {
  if (!businesses || !businesses.length) return null;

  let best = null;
  let bestScore = 0;

  for (const biz of businesses) {
    const score = nameSimilarity(biz.name, query.businessName);
    if (score > bestScore) {
      bestScore = score;
      best = biz;
    }
  }

  // Require minimum 50% similarity to avoid bad matches
  if (bestScore < 0.5) return null;

  return best;
}

/**
 * Extract the best contact from a BizCollect business result.
 */
function extractContact(biz) {
  if (!biz) return null;

  // Prefer named contacts from people[] or email_details[].contact
  const namedContacts = [];

  // From people[] array
  if (biz.people && Array.isArray(biz.people)) {
    for (const p of biz.people) {
      if (p.first_name || p.full_name) {
        namedContacts.push({
          firstName: p.first_name || '',
          lastName: p.last_name || '',
          fullName: p.full_name || `${p.first_name || ''} ${p.last_name || ''}`.trim(),
          title: p.title || '',
          email: (p.emails && p.emails[0]) || '',
          sourceUrl: (p.source_urls && p.source_urls[0]) || '',
          confidence: p.name_confidence || 'medium',
        });
      }
    }
  }

  // From email_details[] with contact info
  if (namedContacts.length === 0 && biz.email_details && Array.isArray(biz.email_details)) {
    for (const ed of biz.email_details) {
      if (ed.contact && (ed.contact.first_name || ed.contact.full_name)) {
        namedContacts.push({
          firstName: ed.contact.first_name || '',
          lastName: ed.contact.last_name || '',
          fullName: ed.contact.full_name || `${ed.contact.first_name || ''} ${ed.contact.last_name || ''}`.trim(),
          title: ed.contact.title || '',
          email: ed.email || '',
          sourceUrl: ed.contact.evidence_url || '',
          confidence: ed.contact.name_confidence || 'medium',
        });
      }
    }
  }

  // Pick the best contact: prefer high confidence, then owner/manager/officer
  const preferred = namedContacts.find(c =>
    /owner|manager|officer|principal|founder|ceo|director/i.test(c.title)
  ) || namedContacts.find(c => c.confidence === 'high') || namedContacts[0];

  if (preferred) {
    return {
      ...preferred,
      phone: biz.phone || '',
    };
  }

  // Fallback: use business-level email if no named contact
  const bestEmail = (biz.emails && biz.emails[0]) || '';
  if (bestEmail) {
    return {
      firstName: '',
      lastName: '',
      fullName: '',
      title: '',
      email: bestEmail,
      phone: biz.phone || '',
      sourceUrl: biz.website || '',
      confidence: 'low',
    };
  }

  return null;
}

/**
 * Search for business contacts via BizCollect.
 * 
 * @param {import('./providerInterface').BusinessQuery} query
 * @returns {Promise<import('./providerInterface').EnrichmentResult|null>}
 */
export async function search(query) {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const location = buildLocation(query);
  if (!location) {
    console.warn('[BizCollect] No location available for search');
    return null;
  }

  const keywords = buildKeywords(query.vertical, query.businessName);

  try {
    console.log(`[BizCollect] Searching: "${query.businessName}" in "${location}" (keywords: ${keywords.join(', ')})`);

    const response = await fetch(`${BIZCOLLECT_BASE}/search`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        location,
        keywords,
        radius_km: 15,
        result_pages: 1,
        scrape_emails: true,
        resolve_contacts: true,
        wait: true,
        wait_timeout_seconds: 60, // Don't block too long
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.warn(`[BizCollect] API error ${response.status}:`, err.error?.message || response.statusText);
      return null;
    }

    const data = await response.json();

    if (data.status === 'failed') {
      console.warn('[BizCollect] Job failed:', data.error);
      return null;
    }

    if (data.wait_timed_out) {
      console.warn('[BizCollect] Request timed out');
      return null;
    }

    const businesses = data.businesses || [];
    console.log(`[BizCollect] Found ${businesses.length} businesses, resolving contacts...`);

    const match = findBestMatch(businesses, query);
    if (!match) {
      console.log('[BizCollect] No matching business found');
      return null;
    }

    const contact = extractContact(match);

    console.log(`[BizCollect] Matched: ${match.name} (${match.phone || 'no phone'})`);

    return {
      source: 'BizCollect',
      sourceType: 'contact_enrichment',
      contact,
      contacts: contact ? [contact] : [],
      raw: match,
    };
  } catch (err) {
    console.warn('[BizCollect] Search failed:', err.message);
    return null;
  }
}
