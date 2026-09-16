/**
 * Claude Business Card Enrichment Service
 * Uses Claude AI to normalize extracted data and link information
 * Runs efficiently without breaking existing functionality
 */

import { supabase } from '../lib/supabase';

/**
 * Call Claude via claude-proxy Edge Function (failover-safe, no client-side key exposure)
 * @private
 */
async function callClaudeVision(payload) {
  const { data, error } = await supabase.functions.invoke('claude-proxy', {
    body: payload,
  });

  if (error) {
    throw new Error(`claude-proxy error: ${error.message || JSON.stringify(error)}`);
  }

  if (data && data.error) {
    throw new Error(`Claude API error: ${data.error.message || JSON.stringify(data.error)}`);
  }

  return data;
}

/**
 * Enrich business card data using Claude
 * Normalizes formats, links related data, identifies business type
 * @param {object} extractedData - Raw extracted data from businessCardExtractor
 * @returns {promise} Enriched data object
 */
export async function enrichBusinessCardWithClaude(extractedData) {
  if (!extractedData) return null;
  
  // Build prompt for Claude
  const prompt = `You are a business data enrichment AI. Given extracted business card data, normalize it and link related information.

EXTRACTED DATA:
- Phones: ${JSON.stringify(extractedData.phones)}
- Emails: ${JSON.stringify(extractedData.emails)}
- Websites: ${JSON.stringify(extractedData.websites)}
- Social Media: ${JSON.stringify(extractedData.social)}
- Addresses: ${JSON.stringify(extractedData.addresses)}
- Contact Names: ${JSON.stringify(extractedData.contacts.names)}
- Contact Titles: ${JSON.stringify(extractedData.contacts.titles)}
- Raw Text: ${extractedData.rawText.substring(0, 500)}

TASK:
1. Identify the primary contact person (best guess based on names/titles)
2. Identify the business type (food service, office, warehouse, etc.)
3. Assign a pest risk score 1-10 (based on business type)
4. Normalize all phone numbers to E.164 format (+1XXXXXXXXXX)
5. Validate email addresses
6. Categorize websites (company website, social, other)
7. Flag suspicious or duplicate data

RESPOND ONLY WITH VALID JSON (no markdown, no preamble):
{
  "primaryContact": {
    "name": "string or null",
    "title": "string or null",
    "email": "string or null",
    "phone": "string or null"
  },
  "businessInfo": {
    "type": "string (food_service|office|warehouse|retail|healthcare|other)",
    "pestRiskScore": number (1-10),
    "riskFactors": ["string array"]
  },
  "normalizedPhones": ["string array in E.164 format"],
  "validEmails": ["string array"],
  "websites": {
    "company": "string or null",
    "social": ["string array"]
  },
  "address": "string or null",
  "quality": {
    "dataCompleteness": number (0-100),
    "confidence": number (0-100),
    "issues": ["string array"]
  }
}`;

  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await callClaudeVision({
        model: 'claude-opus-4-20250805',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      });

      const responseText = response.content?.[0]?.type === 'text'
        ? response.content[0].text
        : null;

      if (!responseText) throw new Error('No text response from Claude');

      const enriched = JSON.parse(responseText);

      return {
        ...enriched,
        source: 'businessCard',
        enrichedAt: new Date().toISOString(),
        claudeConfidence: enriched.quality?.confidence || 0,
      };

    } catch (error) {
      if (attempt === MAX_RETRIES) {
        console.error('[businessCardEnricher] All retries exhausted:', error);
        return getFallbackEnrichment(extractedData);
      }
      const delay = Math.min(1000 * 2 ** (attempt - 1), 8000);
      console.warn(`[businessCardEnricher] Error on attempt ${attempt} — retrying in ${delay}ms:`, error.message);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

/**
 * Fallback enrichment if Claude is unavailable
 * Uses local heuristics to enrich data
 * @param {object} extractedData - Raw extracted data
 * @returns {object} Enriched data using local logic
 */
function getFallbackEnrichment(extractedData) {
  const primaryContact = {
    name: extractedData.contacts.names[0] || null,
    title: extractedData.contacts.titles[0] || null,
    email: extractedData.emails[0] || null,
    phone: extractedData.phones[0] || null,
  };

  // Simple business type detection
  const textLower = (extractedData.rawText || '').toLowerCase();
  let businessType = 'other';
  let pestRiskScore = 5;

  if (textLower.includes('restaurant') || textLower.includes('cafe')) {
    businessType = 'food_service';
    pestRiskScore = 9;
  } else if (textLower.includes('office') || textLower.includes('corp')) {
    businessType = 'office';
    pestRiskScore = 5;
  } else if (textLower.includes('warehouse') || textLower.includes('storage')) {
    businessType = 'warehouse';
    pestRiskScore = 8;
  } else if (textLower.includes('retail') || textLower.includes('store')) {
    businessType = 'retail';
    pestRiskScore = 6;
  } else if (textLower.includes('hospital') || textLower.includes('clinic')) {
    businessType = 'healthcare';
    pestRiskScore = 7;
  }

  return {
    primaryContact,
    businessInfo: {
      type: businessType,
      pestRiskScore,
      riskFactors: businessType === 'food_service' 
        ? ['Food prep areas', 'Organic waste', 'High traffic']
        : [],
    },
    normalizedPhones: extractedData.phones,
    validEmails: extractedData.emails,
    websites: {
      company: extractedData.websites[0] || null,
      social: Object.values(extractedData.social)
        .flat()
        .filter(Boolean),
    },
    address: extractedData.addresses[0] || null,
    quality: {
      dataCompleteness: Math.round(
        (extractedData.phones.length + 
         extractedData.emails.length + 
         extractedData.addresses.length) / 3 * 100
      ),
      confidence: 60,
      issues: extractedData.phones.length === 0 ? ['No phone found'] : [],
    },
    source: 'businessCard',
    enrichedAt: new Date().toISOString(),
    claudeConfidence: 0,
    isFallback: true,
  };
}

/**
 * Batch enrich multiple business cards
 * @param {array} extractedDataArray - Array of extracted data objects
 * @returns {promise} Array of enriched objects
 */
export async function enrichBusinessCardsInBatch(extractedDataArray) {
  if (!Array.isArray(extractedDataArray)) return [];
  
  const batchSize = 3;
  const results = [];

  for (let i = 0; i < extractedDataArray.length; i += batchSize) {
    const batch = extractedDataArray.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(data => enrichBusinessCardWithClaude(data))
    );
    results.push(...batchResults);
  }

  return results;
}
