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
