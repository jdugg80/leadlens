import { TargetLensProfile, TargetLensSearchMode } from '../../config/targetLensProfiles';

export interface TargetLensMatchResult {
  score: number;
  confidence: 'High' | 'Medium' | 'Low';
  reasons: string[];
  isIncluded: boolean;
  prospectType: string;
}

/**
 * Normalizes place types into lead-friendly prospect types.
 */
export function normalizeProspectTypes(candidate: any): string {
  const types = candidate.types || [];
  const name = (candidate.name || '').toLowerCase();

  if (types.includes('warehouse') || name.includes('warehouse') || name.includes('distribution')) return 'Warehouse';
  if (types.includes('restaurant') || types.includes('food')) return 'Restaurant';
  if (types.includes('hospital') || types.includes('health') || types.includes('doctor')) return 'Medical Facility';
  if (types.includes('hotel') || types.includes('lodging')) return 'Hotel';
  if (types.includes('school') || types.includes('university')) return 'School';
  if (types.includes('store') || types.includes('shopping_mall')) return 'Retail Center';
  if (types.includes('real_estate_agency') || name.includes('realty')) return 'Real Estate Office';
  if (name.includes('apartment') || name.includes('leasing')) return 'Apartment Complex';
  if (name.includes('construction') || name.includes('builder')) return 'Construction Site';

  return 'General Commercial';
}

/**
 * Generates human-readable reasons for why a prospect matched a profile.
 */
export function getTargetLensMatchReasons(candidate: any, profile: TargetLensProfile): string[] {
  const reasons: string[] = [];
  const type = normalizeProspectTypes(candidate);

  // Type-based reasons
  if (profile.primaryProspectTypes.includes(type)) {
    reasons.push(`${type} is a primary target for ${profile.label}`);
  } else if (profile.secondaryProspectTypes.includes(type)) {
    reasons.push(`${type} is a secondary opportunity`);
  } else if (profile.referralProspectTypes.includes(type)) {
    reasons.push(`${type} is a potential referral partner`);
  }

  // Signal-based reasons
  profile.opportunitySignals.forEach(signal => {
    const haystack = [candidate.name, candidate.notes, candidate.ocrSummary].join(' ').toLowerCase();
    if (signal.keywords.some(k => haystack.includes(k.toLowerCase()))) {
      reasons.push(`Detected signal: ${signal.label}`);
    }
  });

  // Data quality reasons
  if (candidate.phone) reasons.push('Verified phone number found');
  if (candidate.email) reasons.push('Direct email contact available');
  if (candidate.website) reasons.push('Business website available');
  if (candidate.lensSignal) reasons.push('Active local intelligence signal matched');

  return reasons;
}

/**
 * Calculates the TargetLens score for a candidate against a profile.
 */
export function scoreTargetLensMatch(candidate: any, profile: TargetLensProfile, searchMode: TargetLensSearchMode): number {
  let score = 0;
  const weights = profile.scoringWeights;
  const type = normalizeProspectTypes(candidate);

  // 1. Prospect Type Score (Name/Type Match)
  if (profile.primaryProspectTypes.includes(type)) score += (100 * weights.nameMatch);
  else if (profile.secondaryProspectTypes.includes(type)) score += (70 * weights.nameMatch);
  else if (profile.referralProspectTypes.includes(type)) score += (50 * weights.nameMatch);

  // 2. Keyword/OCR Match
  const searchHaystack = [candidate.name, candidate.notes, candidate.ocrSummary].join(' ').toLowerCase();
  const keywordHits = profile.searchKeywords.filter(k => searchHaystack.includes(k.toLowerCase())).length;
  if (keywordHits > 0) score += (Math.min(100, keywordHits * 25) * weights.keywordMatch);

  // 3. Opportunity Signal Match
  let signalScore = 0;
  profile.opportunitySignals.forEach(sig => {
    if (sig.keywords.some(k => searchHaystack.includes(k.toLowerCase()))) {
      const priorityBoost = sig.priority === 'critical' ? 100 : sig.priority === 'high' ? 80 : 50;
      signalScore = Math.max(signalScore, priorityBoost);
    }
  });
  score += (signalScore * weights.signalMatch);

  // 4. Data Quality / Proximity Boost
  let dataQuality = 0;
  if (candidate.phone) dataQuality += 30;
  if (candidate.website) dataQuality += 20;
  if (candidate.contactSignal || candidate.contacts?.length) dataQuality += 50;
  score += (Math.min(100, dataQuality) * weights.proximityMatch);

  // Apply Search Mode exclusions
  if (searchMode === 'Strict' && !profile.primaryProspectTypes.includes(type)) score *= 0.5;

  return Math.min(100, Math.round(score));
}

/**
 * Determines if a result should be displayed based on profile and search mode.
 */
export function shouldIncludeTargetLensResult(candidate: any, profile: TargetLensProfile, searchMode: TargetLensSearchMode): boolean {
  if (profile.category === 'Pest Control') return true; // Bypass for legacy stability

  const type = normalizeProspectTypes(candidate);

  // Filter based on Search Mode
  if (searchMode === 'Strict') {
    if (!profile.primaryProspectTypes.includes(type)) return false;
  } else if (searchMode === 'Expanded') {
    if (!profile.primaryProspectTypes.includes(type) && !profile.secondaryProspectTypes.includes(type)) return false;
  }
  // Referral mode allows primary + secondary + referral

  const score = scoreTargetLensMatch(candidate, profile, searchMode);
  return score >= profile.minimumScore;
}

/**
 * Full matching pipeline for a search result.
 */
export function processTargetLensMatch(candidate: any, profile: TargetLensProfile, searchMode: TargetLensSearchMode): TargetLensMatchResult {
  // If Pest Control is active, bypass and return a neutral pass
  if (profile.category === 'Pest Control') {
    return {
      score: 100,
      reasons: ['Pest Control mode active'],
      isIncluded: true,
      prospectType: normalizeProspectTypes(candidate),
      confidence: 'High'
    };
  }

  const score = scoreTargetLensMatch(candidate, profile, searchMode);
  const reasons = getTargetLensMatchReasons(candidate, profile);
  const isIncluded = shouldIncludeTargetLensResult(candidate, profile, searchMode);
  const prospectType = normalizeProspectTypes(candidate);

  return {
    score,
    reasons,
    isIncluded,
    prospectType,
    confidence: score >= 75 ? 'High' : score >= 55 ? 'Medium' : 'Low'
  };
}
