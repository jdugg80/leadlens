import { supabase } from '../lib/supabase';

const FETCH_TIMEOUT_MS = 8000;
const MAX_COMMON_PAGES = 8;
const MAX_SITEMAP_PAGES = 6;

export const SOCIAL_PLATFORM_META = {
  facebook: {
    field: 'facebookUrl',
    icon: '👥',
    label: 'Facebook',
    hostPattern: /(^|\.)facebook\.com$/i,
  },
  instagram: {
    field: 'instagramUrl',
    icon: '📸',
    label: 'Instagram',
    hostPattern: /(^|\.)instagram\.com$/i,
  },
  linkedin: {
    field: 'linkedinUrl',
    icon: '💼',
    label: 'LinkedIn',
    hostPattern: /(^|\.)linkedin\.com$/i,
  },
  tiktok: {
    field: 'tiktokUrl',
    icon: '🎵',
    label: 'TikTok',
    hostPattern: /(^|\.)tiktok\.com$/i,
  },
  youtube: {
    field: 'youtubeUrl',
    icon: '▶️',
    label: 'YouTube',
    hostPattern: /(^|\.)youtube\.com$|(^|\.)youtu\.be$/i,
  },
  x: {
    field: 'xUrl',
    icon: '𝕏',
    label: 'X',
    hostPattern: /(^|\.)(x|twitter)\.com$/i,
  },
};

const COMMON_PAGE_PATHS = [
  '/',
  '/contact',
  '/contact-us',
  '/about',
  '/about-us',
  '/locations',
  '/team',
  '/social',
  '/menu',
  '/connect',
  '/follow-us',
];

function stripHtmlEntities(value = '') {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\\\//g, '/')
    .trim();
}

// ─── Email Extraction ────────────────────────────────────────────────────────

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

const JUNK_EMAIL_PATTERNS = [
  /^(noreply|no-reply|donotreply|do-not-reply|mailer|bounce|daemon|postmaster|webmaster|spam|abuse|unsubscribe|marketing|newsletter|notifications?|alerts?|automated|bot|robot|support-noreply)@/i,
];

function isJunkEmail(email = '') {
  return JUNK_EMAIL_PATTERNS.some(p => p.test(email));
}

function normalizeEmail(email = '') {
  return String(email || '').toLowerCase().trim();
}

function extractEmailsFromHtml(html = '', domain = '') {
  const found = new Set();
  const decoded = stripHtmlEntities(html);

  // 1. mailto: links (most reliable)
  const mailtoRegex = /mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/gi;
  let match;
  while ((match = mailtoRegex.exec(decoded))) {
    const email = normalizeEmail(match[1]);
    if (!isJunkEmail(email)) found.add(email);
  }

  // 2. Raw email patterns in text
  const emailMatches = decoded.match(EMAIL_REGEX) || [];
  for (const email of emailMatches) {
    const normalized = normalizeEmail(email);
    if (!isJunkEmail(normalized)) found.add(normalized);
  }

  // 3. JSON-LD structured data email fields
  const jsonBlocks = extractJsonLdBlocks(decoded);
  for (const block of jsonBlocks) {
    try {
      const parsed = JSON.parse(block);
      const stack = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (stack.length) {
        const item = stack.shift();
        if (!item || typeof item !== 'object') continue;
        if (item.email && typeof item.email === 'string') {
          const e = normalizeEmail(item.email.replace('mailto:', ''));
          if (e && !isJunkEmail(e)) found.add(e);
        }
        Object.values(item).forEach(v => {
          if (v && typeof v === 'object') stack.push(v);
        });
      }
    } catch {}
  }

  // Filter to emails matching the domain if domain is provided
  const arr = Array.from(found);
  if (domain) {
    const domainEmails = arr.filter(e => e.endsWith('@' + domain) || e.endsWith('.' + domain));
    if (domainEmails.length > 0) return domainEmails.slice(0, 5);
  }
  return arr.slice(0, 5);
}

// ─── Email Pattern Inference ──────────────────────────────────────────────────

export function inferEmailCandidates(domain = '', firstName = '', lastName = '') {
  if (!domain) return [];

  const f = (firstName || '').toLowerCase().replace(/[^a-z]/g, '');
  const l = (lastName || '').toLowerCase().replace(/[^a-z]/g, '');
  const fi = f.charAt(0);
  const li = l.charAt(0);

  const candidates = [];

  // Generic company emails always included
  candidates.push(`info@${domain}`);
  candidates.push(`contact@${domain}`);
  candidates.push(`sales@${domain}`);
  candidates.push(`hello@${domain}`);

  if (f && l) {
    // Most common corporate patterns first
    candidates.unshift(
      `${f}.${l}@${domain}`,       // john.smith@
      `${fi}${l}@${domain}`,        // jsmith@
      `${f}${l}@${domain}`,         // johnsmith@
      `${f}@${domain}`,             // john@
      `${f}${li}@${domain}`,        // johns@
      `${fi}.${l}@${domain}`,       // j.smith@
      `${l}.${f}@${domain}`,        // smith.john@
      `${l}@${domain}`,             // smith@
    );
  } else if (f) {
    candidates.unshift(`${f}@${domain}`);
  }

  return [...new Set(candidates)].slice(0, 10);
}

function cleanUrlCandidate(value = '') {
  return stripHtmlEntities(value)
    .replace(/["'<>),;]+$/g, '')
    .replace(/^url\(/i, '')
    .trim();
}

export function normalizeWebsiteUrl(url = '') {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw.replace(/^\/+/, '')}`;
}

function getHostname(url = '') {
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

function getOrigin(url = '') {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

function absolutizeUrl(url = '', baseUrl = '') {
  const cleaned = cleanUrlCandidate(url);
  if (!cleaned || cleaned.startsWith('mailto:') || cleaned.startsWith('tel:') || cleaned.startsWith('sms:')) return '';
  try {
    return new URL(cleaned, baseUrl).toString();
  } catch {
    return '';
  }
}

function getPlatformForUrl(url = '') {
  let host = '';
  try {
    host = new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
  return Object.entries(SOCIAL_PLATFORM_META).find(([, meta]) => meta.hostPattern.test(host))?.[0] || null;
}

function isGenericOrBadSocialUrl(url = '') {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return true;
  }
  const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
  const path = parsed.pathname.replace(/\/+$/g, '').toLowerCase();
  const full = `${host}${path}`.toLowerCase();

  if (!path || path === '/') return true;
  if (/\/(share|sharer|intent|login|signin|signup|home|privacy|terms|help|plugins|dialog|search|hashtag|explore|reel|reels|p|watch|embed)\b/i.test(path)) return true;
  if (/facebook\.com\/pages\/create/i.test(full)) return true;
  if (/linkedin\.com\/(feed|login|signup|jobs|learning|help)/i.test(full)) return true;
  if (/instagram\.com\/(accounts|explore|p|reel|stories)/i.test(full)) return true;
  if (/(x|twitter)\.com\/(intent|share|home|search|hashtag)/i.test(full)) return true;
  if (/youtube\.com\/(watch|embed|shorts|playlist|results)/i.test(full)) return true;
  return false;
}

function normalizeSocialUrl(url = '') {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    parsed.search = '';
    parsed.pathname = parsed.pathname.replace(/\/{2,}/g, '/').replace(/\/+$/g, '');
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

function addSocialUrl(found, url, source = 'website') {
  const normalized = normalizeSocialUrl(url);
  if (!normalized || isGenericOrBadSocialUrl(normalized)) return;
  const platform = getPlatformForUrl(normalized);
  if (!platform || found[platform]) return;
  const meta = SOCIAL_PLATFORM_META[platform];
  found[platform] = {
    url: normalized,
    icon: meta.icon,
    label: meta.label,
    source,
  };
}

function extractJsonLdBlocks(html = '') {
  const blocks = [];
  const regex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = regex.exec(html))) {
    blocks.push(stripHtmlEntities(match[1]));
  }
  return blocks;
}

function scanTextForSocialLinks(text = '', baseUrl = '', source = 'website') {
  const found = {};
  const decoded = stripHtmlEntities(text);
  const urlRegex = /https?:\\?\/\\?\/[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?:\\?\/[A-Za-z0-9_@:%+.,~#?&=\-/]*)?/gi;
  const hrefRegex = /(?:href|src|content)\s*=\s*["']([^"']+)["']/gi;
  const sameAsRegex = /"sameAs"\s*:\s*(\[[\s\S]*?\]|"[^"]+")/gi;

  let match;
  while ((match = urlRegex.exec(decoded))) {
    addSocialUrl(found, cleanUrlCandidate(match[0]).replace(/\\\//g, '/'), source);
  }
  while ((match = hrefRegex.exec(decoded))) {
    const absolute = absolutizeUrl(match[1], baseUrl);
    if (absolute) addSocialUrl(found, absolute, source);
  }

  while ((match = sameAsRegex.exec(decoded))) {
    const sameAsText = match[1];
    const urls = sameAsText.match(urlRegex) || [];
    urls.forEach((url) => addSocialUrl(found, cleanUrlCandidate(url).replace(/\\\//g, '/'), 'sameAs'));
  }

  extractJsonLdBlocks(decoded).forEach((block) => {
    try {
      const parsed = JSON.parse(block);
      const stack = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (stack.length) {
        const item = stack.shift();
        if (!item || typeof item !== 'object') continue;
        const sameAs = item.sameAs;
        if (Array.isArray(sameAs)) sameAs.forEach((url) => addSocialUrl(found, String(url), 'sameAs'));
        else if (sameAs) addSocialUrl(found, String(sameAs), 'sameAs');
        Object.values(item).forEach((value) => {
          if (value && typeof value === 'object') stack.push(value);
        });
      }
    } catch {
      const urls = block.match(urlRegex) || [];
      urls.forEach((url) => addSocialUrl(found, cleanUrlCandidate(url).replace(/\\\//g, '/'), 'json-ld'));
    }
  });

  return found;
}

export function extractSocialLinksFromText(text = '') {
  const socialLinks = scanTextForSocialLinks(text, '', 'ocr-text');
  return {
    socialLinks,
    ...socialLinksToLeadFields(socialLinks, 'medium', 'ocr-text'),
  };
}

async function fetchText(url = '') {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS) : null;
  try {
    const resp = await fetch(url, {
      signal: controller?.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    if (timer) clearTimeout(timer);
    if (!resp.ok) return '';
    return await resp.text();
  } catch {
    if (timer) clearTimeout(timer);
    return '';
  }
}

function mergeSocialLinks(target = {}, next = {}) {
  const merged = { ...target };
  Object.entries(next || {}).forEach(([platform, data]) => {
    if (!merged[platform] && data?.url) merged[platform] = data;
  });
  return merged;
}

function socialCount(socialLinks = {}) {
  return Object.keys(socialLinks || {}).filter((key) => !!socialLinks[key]?.url).length;
}

function getCommonPageUrls(websiteUrl = '') {
  const origin = getOrigin(websiteUrl);
  if (!origin) return [];
  return COMMON_PAGE_PATHS.slice(0, MAX_COMMON_PAGES).map((path) => `${origin}${path}`);
}

async function getSitemapCandidateUrls(websiteUrl = '') {
  const origin = getOrigin(websiteUrl);
  if (!origin) return [];
  const sitemap = await fetchText(`${origin}/sitemap.xml`);
  if (!sitemap) return [];
  const urls = (sitemap.match(/<loc>([\s\S]*?)<\/loc>/gi) || [])
    .map((item) => stripHtmlEntities(item.replace(/<\/?loc>/gi, '')).trim())
    .filter((url) => /\/((contact|about|location|locations|team|connect|social)(\/|$|-))/i.test(url))
    .slice(0, MAX_SITEMAP_PAGES);
  return Array.from(new Set(urls));
}

/**
 * Searches for a missing Point of Contact by querying state tax/public records,
 * followed by looking at team/about pages on the company website.
 */
export async function enrichMissingPOC(prospect = {}) {
  const isMissing = !prospect.pocFirst || !prospect.pocLast || !prospect.title;
  if (!isMissing) {
    return { ok: true, found: false, reason: 'not_missing' };
  }

  let candidates = [];

  const businessName = prospect.businessName || prospect.establishment_name || prospect.business_name || prospect.name || "";

  // --- 1. State / Public Records Lookup ---
  try {
    const searchLat = prospect.latitude || prospect.lat || prospect.locationLat || 0;
    const searchLng = prospect.longitude || prospect.lng || prospect.locationLng || 0;

    if (searchLat && searchLng && businessName) {
      const { data } = await supabase.rpc('get_lenssignal_nearby', {
        p_latitude: searchLat,
        p_longitude: searchLng,
        p_radius_miles: 1
      });

      if (data && data.length > 0) {
        // Find best match by prioritizing exact business name match, DBA match, or exact street match
        const match = data.find(s =>
          (s.establishment_name && businessName && s.establishment_name.toLowerCase().includes(businessName.toLowerCase())) ||
          (s.dba_name && businessName && s.dba_name.toLowerCase().includes(businessName.toLowerCase())) ||
          (s.address && prospect.streetName && s.address.toLowerCase().includes(prospect.streetName.toLowerCase()))
        );

        if (match && match.owner_name && match.owner_name.trim().length > 2) {
          const nameParts = match.owner_name.trim().split(' ');
          const first = nameParts[0] || '';
          const last = nameParts.slice(1).join(' ') || '';

          // Filter out obvious corporate entities holding the license (we want humans)
          // Also explicitly ignore Property/Landlord records unless it's a real estate business
          const isEntity = [
            'llc', 'inc', 'corp', 'company', 'ltd', 'limited', 'holdings', 'group', 'the', 'trust', 'properties', 'management', 'enterprises'
          ].some(w => last.toLowerCase().endsWith(w) || first.toLowerCase() === w || match.owner_name.toLowerCase().includes(` ${w}`));

          const isPropertyOwner = (match.source_name || '').toLowerCase().includes('appraisal') ||
                                  (match.source_name || '').toLowerCase().includes('cad ') ||
                                  (match.source_name || '').toLowerCase().includes('property');

          if (first && last && !isEntity && !isPropertyOwner) {
            console.log('[SocialEnrichment] Candidate found in public records');
            console.log('[SocialEnrichment] Confidence score calculated: High (100)');

            // Format the source nicely based on what the DB returned
            let formattedSource = 'Public Business Record';
            const rawSource = (match.source_name || '').toLowerCase();
            if (rawSource.includes('comptroller') || rawSource.includes('tax')) formattedSource = 'Texas Comptroller (Sales Tax Permit)';
            else if (rawSource.includes('tabc') || rawSource.includes('liquor')) formattedSource = 'TABC Liquor License';
            else if (rawSource.includes('health') || rawSource.includes('inspection')) formattedSource = 'Health Dept Inspection';
            else if (rawSource.includes('sos') || rawSource.includes('secretary')) formattedSource = 'Secretary of State (Entity Reg)';
            else if (rawSource.includes('dba') || rawSource.includes('county')) formattedSource = 'County DBA / Assumed Name';
            else if (rawSource.includes('permit') || rawSource.includes('occupancy')) formattedSource = 'Certificate of Occupancy';
            else if (match.source_name) formattedSource = match.source_name;

            candidates.push({
              first,
              last,
              title: 'Owner/Manager',
              confidence: 'high',
              confidenceScore: 100,
              source: formattedSource,
              phone: match.phone || null,
            });
          }
        }
      }
    }
  } catch (err) {
    console.warn('[SocialEnrichment] Public record lookup error:', err);
  }

  if (candidates.some(c => c.confidence === 'high')) {
    const best = candidates.find(c => c.confidence === 'high');
    console.log(`[SocialEnrichment] Found POC via Public Records: ${best.first} ${best.last}`);
    return { ok: true, found: true, poc: best, candidates };
  }


  // --- 2. Website Team / About Us Scraping ---
  if (!prospect.website) {
     return { ok: true, found: false, reason: 'no_website' };
  }

  try {
    const origin = getOrigin(normalizeWebsiteUrl(prospect.website));
    if (!origin) return { ok: false, reason: 'invalid_website' };

    console.log(`[SocialEnrichment] Attempting Website POC extraction from: ${origin}`);
    console.log(`[SocialEnrichment] Source checked: Website Team Pages`);

    // Look specifically at pages likely to contain team info
    const pageCandidates = [
      `${origin}/about`,
      `${origin}/about-us`,
      `${origin}/team`,
      `${origin}/our-team`,
      `${origin}/contact`
    ];

    for (const url of pageCandidates) {
      const html = await fetchText(url);
      if (!html) continue;

      const decoded = stripHtmlEntities(html);

      // Look for common corporate titles near capitalized names
      // (e.g. "John Doe, CEO" or "Manager: Jane Smith")
      const titleRegex = /(?:CEO|Owner|President|Founder|Manager|Director|General Manager)\s*[:-]?\s*([A-Z][a-z]+)\s+([A-Z][a-z]+)|([A-Z][a-z]+)\s+([A-Z][a-z]+)[,\s]+(?:CEO|Owner|President|Founder|Manager|Director|General Manager)/g;

      let match;
      while ((match = titleRegex.exec(decoded))) {
        let first = '', last = '';
        if (match[1] && match[2]) {
          first = match[1]; last = match[2];
        } else if (match[3] && match[4]) {
          first = match[3]; last = match[4];
        }

        if (first && last && first.toLowerCase() !== 'the' && last.toLowerCase() !== 'manager') {
          // Determine the title based on what matched in the regex
          const contextStr = match[0].toLowerCase();
          let extractedTitle = 'Manager';
          if (contextStr.includes('ceo')) extractedTitle = 'CEO';
          else if (contextStr.includes('owner')) extractedTitle = 'Owner';
          else if (contextStr.includes('president')) extractedTitle = 'President';
          else if (contextStr.includes('founder')) extractedTitle = 'Founder';
          else if (contextStr.includes('director')) extractedTitle = 'Director';

          let score = 50; // Base score for finding a named entity near a title
          if (extractedTitle === 'Owner' || extractedTitle === 'CEO') score += 20; // Medium confidence

          let websiteMatch = {
            first,
            last,
            title: extractedTitle,
            confidence: score >= 70 ? 'medium' : 'low',
            confidenceScore: score,
            source: 'Website Team Page',
            sourceUrl: url,
          };

          // Look for phone numbers in the text
          if (!websiteMatch.phone) {
              const phoneRegex = /(?:phone|tel|mobile|call)?\s*[:-]?\s*(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/gi;
              let pMatch;
              while ((pMatch = phoneRegex.exec(decoded))) {
                  websiteMatch.phone = `(${pMatch[1]}) ${pMatch[2]}-${pMatch[3]}`;
                  break; // take the first one found near the team info
              }
          }

          // Look for emails in the text
          if (!websiteMatch.email) {
              const emailMatches = extractEmailsFromHtml(html, getHostname(url));
              if (emailMatches && emailMatches.length > 0) {
                  websiteMatch.email = emailMatches[0];
              }
          }

          console.log('[SocialEnrichment] Candidate found on website');
          console.log(`[SocialEnrichment] Confidence score calculated: ${websiteMatch.confidence} (${websiteMatch.confidenceScore})`);
          candidates.push(websiteMatch);

          if (websiteMatch.confidence === 'medium') break; // Good enough to suggest
        }
      }
    }

  } catch (error) {
    console.warn('[SocialEnrichment] enrichMissingPOC failed:', error);
  }

  if (candidates.length > 0) {
      // Sort candidates by score descending
      candidates.sort((a, b) => b.confidenceScore - a.confidenceScore);
      const best = candidates[0];

      if (best.confidence === 'high') {
           console.log('[SocialEnrichment] POC auto-filled');
      } else if (best.confidence === 'medium') {
           console.log('[SocialEnrichment] POC confirmation required');
      } else {
           console.log('[SocialEnrichment] No reliable POC found (only low confidence)');
      }

      return { ok: true, found: true, poc: best, candidates };
  }

  console.log('[SocialEnrichment] No reliable POC found');
  return { ok: true, found: false, candidates };

}

export async function extractSocialLinksFromWebsite(websiteUrl = '', options = {}) {
  const startUrl = normalizeWebsiteUrl(websiteUrl);
  if (!startUrl) {
    return {
      socialLinks: {},
      socialConfidence: 'none',
      socialSource: '',
    };
  }

  let socialLinks = {};
  let discoveredEmails = [];
  const visited = new Set();
  const domain = getHostname(startUrl);
  const candidates = Array.from(new Set([startUrl, ...getCommonPageUrls(startUrl)]));

  for (const url of candidates) {
    if (visited.has(url)) continue;
    visited.add(url);
    const html = await fetchText(url);
    if (!html) continue;
    socialLinks = mergeSocialLinks(socialLinks, scanTextForSocialLinks(html, url, url === startUrl ? 'website-homepage' : 'website-page'));

    // Extract emails on every page pass — no extra fetch needed
    if (discoveredEmails.length === 0) {
      discoveredEmails = extractEmailsFromHtml(html, domain);
    }

    if (!options.deep && socialCount(socialLinks) > 0) break;
    if (socialCount(socialLinks) >= Object.keys(SOCIAL_PLATFORM_META).length) break;
  }

  if (options.deep !== false && socialCount(socialLinks) < 2) {
    const sitemapUrls = await getSitemapCandidateUrls(startUrl);
    for (const url of sitemapUrls) {
      if (visited.has(url)) continue;
      visited.add(url);
      const html = await fetchText(url);
      if (!html) continue;
      socialLinks = mergeSocialLinks(socialLinks, scanTextForSocialLinks(html, url, 'sitemap-page'));
      if (discoveredEmails.length === 0) {
        discoveredEmails = extractEmailsFromHtml(html, domain);
      }
      if (socialCount(socialLinks) >= Object.keys(SOCIAL_PLATFORM_META).length) break;
    }
  }

  // Add inferred email patterns if POC name provided
  const inferredEmails = options.pocFirst || options.pocLast
    ? inferEmailCandidates(domain, options.pocFirst || '', options.pocLast || '')
    : inferEmailCandidates(domain); // generic company emails only

  const fields = socialLinksToLeadFields(
    socialLinks,
    socialCount(socialLinks) > 0 ? 'high' : 'none',
    socialCount(socialLinks) > 0 ? 'website-deep-scan' : ''
  );

  return {
    socialLinks,
    ...fields,
    discoveredEmails,
    inferredEmails,
    emailCandidates: [...new Set([...discoveredEmails, ...inferredEmails])],
    // Best email candidate: prefer discovered, fall back to inferred
    bestEmail: discoveredEmails[0] || inferredEmails[0] || '',
  };
}

export function socialLinksToLeadFields(socialLinks = {}, confidence = 'none', source = '') {
  const fields = {
    facebookUrl: '',
    instagramUrl: '',
    linkedinUrl: '',
    tiktokUrl: '',
    youtubeUrl: '',
    xUrl: '',
    socialConfidence: confidence,
    socialSource: source,
  };

  Object.entries(SOCIAL_PLATFORM_META).forEach(([platform, meta]) => {
    if (socialLinks?.[platform]?.url) fields[meta.field] = socialLinks[platform].url;
  });

  if (!Object.values(SOCIAL_PLATFORM_META).some((meta) => fields[meta.field])) {
    fields.socialConfidence = 'none';
    fields.socialSource = '';
  }

  return fields;
}

export function leadFieldsToSocialLinks(lead = {}) {
  const socialLinks = {};
  Object.entries(SOCIAL_PLATFORM_META).forEach(([platform, meta]) => {
    const url = lead?.[meta.field];
    if (url) socialLinks[platform] = { url, icon: meta.icon, label: meta.label, source: lead.socialSource || 'lead' };
  });
  return socialLinks;
}

export function mergeSocialFieldsIntoLead(lead = {}, result = {}) {
  const socialLinks = result.socialLinks || leadFieldsToSocialLinks(result);
  const nextFields = socialLinksToLeadFields(
    socialLinks,
    result.socialConfidence || (socialCount(socialLinks) ? 'high' : 'none'),
    result.socialSource || (socialCount(socialLinks) ? 'website-deep-scan' : '')
  );

  const merged = { ...lead };
  Object.entries(nextFields).forEach(([key, value]) => {
    if (value && !merged[key]) merged[key] = value;
  });
  return merged;
}
