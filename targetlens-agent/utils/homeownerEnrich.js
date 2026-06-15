/**
 * Homeowner contact enrichment — free sources, best effort
 * Rate limit: 1 req / 2s minimum
 */

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function enrichOwnerContact(firstName, lastName, city, state) {
  const results = { phone: null, email: null, confidence: 'low' };

  if (!firstName || !lastName) return results;

  try {
    const query = `${firstName}+${lastName}`;
    const url = `https://www.truepeoplesearch.com/results?name=${query}&citystatezip=${city}%2C+${state}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LeadLens/1.0)' },
    });
    if (!res.ok) return results;

    const html = await res.text();
    const phoneMatch = html.match(/\(\d{3}\)\s?\d{3}-\d{4}/);
    if (phoneMatch) {
      results.phone = phoneMatch[0];
      results.confidence = 'medium';
    }
  } catch (e) {
    // Silently skip — enrichment is best-effort
  }

  return results;
}

async function batchEnrichContacts(prospects, onProgress) {
  const enriched = [];
  for (let i = 0; i < prospects.length; i++) {
    const p = prospects[i];
    const name = (p.grantee_name || p.owner_name || '').trim();
    const parts = name.split(/\s+/);
    const firstName = parts[0] || '';
    const lastName = parts.slice(1).join(' ') || '';

    if (firstName && lastName) {
      const contact = await enrichOwnerContact(firstName, lastName, p.city, p.state);
      enriched.push({ ...p, ...contact });
    } else {
      enriched.push(p);
    }

    if (onProgress) onProgress({ current: i + 1, total: prospects.length });
    await sleep(2000);
  }
  return enriched;
}

module.exports = { enrichOwnerContact, batchEnrichContacts };
