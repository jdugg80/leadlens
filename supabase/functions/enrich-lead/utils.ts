// supabase/functions/enrich-lead/utils.ts
// Helper utilities for 50-state registry enrichment

/**
 * RETRY LOGIC FOR RESILIENCE
 * Some state registries are slow or flaky. Use exponential backoff.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 2,
  baseDelayMs: number = 500
): Promise<T | null> {
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, i);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        console.error(`Failed after ${maxRetries + 1} attempts:`, error.message);
        return null;
      }
    }
  }
  return null;
}

/**
 * ADVANCED HTML PARSING
 * Remove script/style tags, normalize whitespace, extract structured text
 */
export function cleanHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * SMART ADDRESS EXTRACTOR
 * Recognizes US address patterns and validates format
 */
export function extractAddress(text: string): string {
  const addressPattern =
    /(\d+)\s+([a-z\s]+)\s+(street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|circle|cir|court|ct|way|plaza|pl|terrace|ter|square|sq|trail|trl|parkway|pkwy|place|pl|point|pt|row|run|summit|summit|valley|val|view|vw|village|vlg|vista|vis|woods|wds)\b[,\s]+([a-z\s]+)[,\s]+([a-z]{2})\s+(\d{5})/i;

  const match = text.match(addressPattern);
  if (match) {
    return match[0].trim();
  }

  // Fallback: just grab text that looks address-like
  const simplePattern = /\d+\s+[a-z\s]+\s+(?:street|avenue|road|boulevard|drive|lane|circle|court|way|plaza|place|point|parkway)\b[^<\n]*\b[a-z]{2}\s+\d{5}/i;
  const fallbackMatch = text.match(simplePattern);
  return fallbackMatch ? fallbackMatch[0].trim() : "";
}

/**
 * SMART NAME EXTRACTOR
 * Gets person names from various HTML structures
 */
export function extractPersonName(text: string): string {
  // Look for name patterns: "FirstName LastName"
  const namePattern = /(?:agent|manager|officer|president|owner|director|organizer)[\s:]*([a-z]+)\s+([a-z]+)/i;
  const match = text.match(namePattern);

  if (match) {
    return `${match[1]} ${match[2]}`.trim();
  }

  // Fallback: look for two consecutive capitalized words
  const simplePattern = /\b([A-Z][a-z]+)\s+([A-Z][a-z]+)\b/;
  const simpleMatch = text.match(simplePattern);
  return simpleMatch ? `${simpleMatch[1]} ${simpleMatch[2]}` : "";
}

/**
 * STATE-SPECIFIC PARSERS
 * Custom logic for each state's unique HTML structure
 */

export const STATE_PARSERS: {
  [key: string]: (html: string, businessName: string) => { address: string; owner: string };
} = {
  TX: (html, businessName) => {
    const cleaned = cleanHtml(html);
    const address = extractAddress(cleaned);
    const ownerMatch = cleaned.match(/(?:manager|president|owner):\s*([a-z\s]+)(?=\s+(?:manager|president|owner|address|file))/i);
    return {
      address,
      owner: ownerMatch ? ownerMatch[1].trim() : "",
    };
  },

  CA: (html, businessName) => {
    const cleaned = cleanHtml(html);
    const address = extractAddress(cleaned);
    const owner = extractPersonName(cleaned);
    return { address, owner };
  },

  NY: (html, businessName) => {
    const cleaned = cleanHtml(html);
    const address = extractAddress(cleaned);
    const agentMatch = cleaned.match(/registered agent[:\s]+([^<\n]+?)(?=county|county|registered|active)/i);
    return {
      address,
      owner: agentMatch ? agentMatch[1].trim() : "",
    };
  },

  FL: (html, businessName) => {
    const cleaned = cleanHtml(html);
    const addressMatch = cleaned.match(/principal address[:\s]*([^\n<]+)/i);
    const ownerMatch = cleaned.match(/registered agent[:\s]*([^\n<]+)/i);
    return {
      address: addressMatch ? addressMatch[1].trim().substring(0, 200) : "",
      owner: ownerMatch ? ownerMatch[1].trim() : "",
    };
  },

  IL: (html, businessName) => {
    const cleaned = cleanHtml(html);
    const address = extractAddress(cleaned);
    const owner = extractPersonName(cleaned);
    return { address, owner };
  },

  OH: (html, businessName) => {
    const cleaned = cleanHtml(html);
    const address = extractAddress(cleaned);
    const owner = extractPersonName(cleaned);
    return { address, owner };
  },

  PA: (html, businessName) => {
    const cleaned = cleanHtml(html);
    const address = extractAddress(cleaned);
    const agentMatch = cleaned.match(/registered agent[:\s]+([^<\n]+?)(?=city|address|county)/i);
    return {
      address,
      owner: agentMatch ? agentMatch[1].trim() : "",
    };
  },

  MI: (html, businessName) => {
    const cleaned = cleanHtml(html);
    const address = extractAddress(cleaned);
    const owner = extractPersonName(cleaned);
    return { address, owner };
  },

  NC: (html, businessName) => {
    const cleaned = cleanHtml(html);
    const address = extractAddress(cleaned);
    const ownerMatch = cleaned.match(/(?:registered agent|manager)[\s:]*([^\n<]+)/i);
    return {
      address,
      owner: ownerMatch ? ownerMatch[1].trim() : "",
    };
  },

  GA: (html, businessName) => {
    const cleaned = cleanHtml(html);
    const address = extractAddress(cleaned);
    const owner = extractPersonName(cleaned);
    return { address, owner };
  },
};

/**
 * FALLBACK STATE PARSER
 * Works across most state registries with generic patterns
 */
export function parseStateRegistry(
  html: string,
  stateCode: string,
  businessName: string
): { address: string; owner: string } {
  const parser = STATE_PARSERS[stateCode];

  if (parser) {
    return parser(html, businessName);
  }

  // Generic parsing
  const cleaned = cleanHtml(html);
  const address = extractAddress(cleaned);
  const owner = extractPersonName(cleaned);

  return { address, owner };
}

/**
 * EMAIL VALIDATION
 * Check if email looks legitimate (not generic/test)
 */
export function isValidEmail(email: string): boolean {
  const blocklist = ["noreply", "no-reply", "test", "example", "localhost", "temp"];
  const lowerEmail = email.toLowerCase();

  return !blocklist.some((blocked) => lowerEmail.includes(blocked)) && email.includes("@");
}

/**
 * PHONE NUMBER NORMALIZATION
 * Convert phone formats: (123) 456-7890 -> 1234567890
 */
export function normalizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}

/**
 * DOMAIN EXTRACTION FROM URL
 * Get naked domain: https://www.example.com/path -> example.com
 */
export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * BUSINESS NAME NORMALIZATION
 * "ABC Pest Control, Inc." -> "abc pest control"
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/,?\s+(?:inc|inc\.|llc|llc\.|corp|corp\.|co|co\.)\b/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

/**
 * FUZZY MATCH FOR BUSINESS NAMES
 * Check if found business name is close match
 */
export function fuzzyMatchBusinessName(found: string, expected: string): number {
  const foundNorm = normalizeName(found);
  const expectedNorm = normalizeName(expected);

  // Exact match
  if (foundNorm === expectedNorm) return 1.0;

  // Partial match (found contains expected or vice versa)
  if (foundNorm.includes(expectedNorm) || expectedNorm.includes(foundNorm)) {
    return 0.8;
  }

  // Levenshtein distance for close matches
  const distance = levenshteinDistance(foundNorm, expectedNorm);
  const maxLength = Math.max(foundNorm.length, expectedNorm.length);
  return Math.max(0, 1 - distance / maxLength);
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * CACHE KEY GENERATOR
 * Unique key for caching enrichment results
 */
export function getCacheKey(
  businessName: string,
  city: string,
  state: string
): string {
  return `enrichment:${normalizeName(businessName)}:${city.toLowerCase()}:${state.toUpperCase()}`;
}

/**
 * RESULT CONFIDENCE SCORER
 * Score enrichment result quality (0-100)
 */
export function scoreEnrichmentResult(
  address: string,
  owner: string,
  businessNameMatch: number
): number {
  let score = 0;

  // Address quality (40 points)
  if (address && address.length > 10) score += 40;
  else if (address && address.length > 5) score += 20;

  // Owner/contact info (35 points)
  if (owner && owner.split(/\s+/).length >= 2) score += 35;
  else if (owner && owner.length > 3) score += 15;

  // Name match confidence (25 points)
  score += Math.round(businessNameMatch * 25);

  return Math.min(100, score);
}
