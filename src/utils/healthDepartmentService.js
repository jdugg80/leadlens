/**
 * Health Department Violations Service
 * 
 * NOTE: Houston's health inspection data is published as static Excel files
 * per fiscal year — NOT via a queryable CKAN datastore. The SQL API approach
 * originally used placeholder resource IDs that never existed.
 *
 * This version uses Claude AI to assess pest/health risk based on business
 * type, location context, and known industry patterns. When a real queryable
 * API becomes available (e.g. Harris County portal), swap the fetchFromAPI
 * function below.
 */

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;

// Cache by business key
const violationsCache = new Map();
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Assess health/pest risk for a business using AI.
 * Falls back to rule-based scoring if API key not available.
 */
export async function searchHealthViolations(businessName, city = 'Houston', businessType = '') {
  if (!businessName || typeof businessName !== 'string') {
    return { success: false, error: 'Invalid business name', violations: [] };
  }

  const cacheKey = `${businessName.toLowerCase()}-${city.toLowerCase()}`;
  if (violationsCache.has(cacheKey)) {
    const cached = violationsCache.get(cacheKey);
    if (Date.now() - cached.cachedAt < CACHE_TTL) {
      return { ...cached.data, fromCache: true };
    }
    violationsCache.delete(cacheKey);
  }

  try {
    let result;
    if (ANTHROPIC_API_KEY) {
      result = await assessRiskWithClaude(businessName, city, businessType);
    } else {
      result = assessRiskWithRules(businessName, businessType);
    }

    const final = {
      success: true,
      violations: result.violations,
      count: result.violations.length,
      riskScore: result.riskScore,
      riskLevel: result.riskLevel,
      riskFactors: result.riskFactors,
      businessName,
      city,
      dataSource: ANTHROPIC_API_KEY ? 'ai_assessment' : 'rule_based',
      fetchedAt: new Date().toISOString(),
    };

    violationsCache.set(cacheKey, { data: final, cachedAt: Date.now() });
    return final;
  } catch (error) {
    console.error('[HealthService] Assessment error:', error);
    return { success: false, error: error.message, violations: [], businessName, city };
  }
}

async function assessRiskWithClaude(businessName, city, businessType) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system: `You are a pest control risk assessment system. Based on business name and type, estimate pest/health risk.
Return ONLY valid JSON: {"riskScore":0-100,"riskLevel":"LOW|MEDIUM|HIGH|CRITICAL","riskFactors":["factor1"],"violations":[{"description":"desc","severity":"MINOR|MAJOR|CRITICAL_PEST","riskFactors":["factor"]}],"notes":"brief explanation"}`,
        messages: [{
          role: 'user',
          content: `Business: "${businessName}", Type: "${businessType || 'unknown'}", City: "${city}". Assess pest/health risk for a pest control sales prospect. Be specific about why this business type has the risk level you assign.`
        }],
      }),
    });

    clearTimeout(timeout);
    if (!response.ok) throw new Error(`API ${response.status}`);
    const data = await response.json();
    const raw = (data.content?.[0]?.text || '').replace(/```json|```/g, '').trim();
    return JSON.parse(raw);
  } catch (err) {
    clearTimeout(timeout);
    console.warn('[HealthService] Claude assessment failed, using rules:', err.message);
    return assessRiskWithRules(businessName, businessType);
  }
}

function assessRiskWithRules(businessName, businessType) {
  const name = (businessName + ' ' + businessType).toLowerCase();
  let riskScore = 30;
  const riskFactors = [];
  const violations = [];

  const highRisk = ['restaurant', 'food', 'kitchen', 'cafe', 'deli', 'bakery', 'grocery',
    'market', 'buffet', 'catering', 'bar', 'pub', 'brewery', 'hotel', 'motel'];
  const medRisk = ['warehouse', 'storage', 'industrial', 'manufacturing', 'retail', 'gym',
    'school', 'daycare', 'hospital', 'medical', 'dental', 'apartment'];

  if (highRisk.some(t => name.includes(t))) {
    riskScore = 75;
    riskFactors.push('FOOD_SERVICE', 'HIGH_PEST_PRESSURE');
    violations.push({ description: 'Food service facility — high pest pressure risk', severity: 'CRITICAL_PEST', riskFactors: ['FOOD_SERVICE'] });
  } else if (medRisk.some(t => name.includes(t))) {
    riskScore = 50;
    riskFactors.push('COMMERCIAL_USE');
    violations.push({ description: 'Commercial facility with moderate pest risk', severity: 'MAJOR', riskFactors: ['COMMERCIAL_USE'] });
  }

  return {
    riskScore,
    riskLevel: riskScore >= 70 ? 'HIGH' : riskScore >= 50 ? 'MEDIUM' : 'LOW',
    riskFactors,
    violations,
  };
}

export async function getViolationStats(businessName) {
  const result = await searchHealthViolations(businessName);
  return {
    businessName,
    totalViolations: result.violations?.length || 0,
    criticalCount: result.violations?.filter(v => v.severity?.startsWith('CRITICAL')).length || 0,
    majorCount: result.violations?.filter(v => v.severity === 'MAJOR').length || 0,
    minorCount: result.violations?.filter(v => v.severity === 'MINOR').length || 0,
    riskScore: result.riskScore || 0,
    riskLevel: result.riskLevel || 'UNKNOWN',
    allRiskFactors: result.riskFactors || [],
  };
}

export function clearViolationsCache() { violationsCache.clear(); }
export function getCacheStats() { return { cacheSize: violationsCache.size }; }
export async function batchSearchViolations(businessNames) {
  if (!Array.isArray(businessNames)) return [];
  return Promise.all(businessNames.map(name => searchHealthViolations(name)));
}
