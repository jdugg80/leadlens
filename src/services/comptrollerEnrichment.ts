import {
  lookupComptrollerByBusinessName,
  lookupFranchiseByName,
  lookupSalesTaxpayerById
} from './comptrollerApi';
import { normalizeComptrollerResults, NormalizedComptrollerBusiness } from './comptrollerNormalizer';
import { supabase } from '../lib/supabase';

export type EnrichmentResult = {
  matches: NormalizedComptrollerBusiness[];
  bestMatch?: NormalizedComptrollerBusiness;
  source: string;
};

/**
 * Enriches a prospect using Texas Comptroller Public Records.
 */
export async function enrichProspectWithComptroller(businessName: string): Promise<EnrichmentResult> {
  if (!businessName || businessName.length < 3) {
    return { matches: [], source: 'Texas Comptroller Public Records' };
  }

  try {
    console.log(`[ComptrollerEnrichment] Searching for: ${businessName}`);

    // 1. Parallel lookup: Sales Tax and Franchise Tax
    const [salesData, franchiseData] = await Promise.all([
      lookupComptrollerByBusinessName(businessName).catch(() => null),
      lookupFranchiseByName(businessName).catch(() => null)
    ]);

    const salesMatches = normalizeComptrollerResults(salesData);
    const franchiseMatches = normalizeComptrollerResults(franchiseData);

    const allMatches = [...salesMatches, ...franchiseMatches];

    // 2. Determine best match (prefer active permits, then recent dates)
    const bestMatch = allMatches.sort((a, b) => {
      // Prefer high priority (recent signals)
      const priorityScore = { high: 3, medium: 2, low: 1 };
      const scoreA = priorityScore[a.priority || 'low'];
      const scoreB = priorityScore[b.priority || 'low'];
      if (scoreA !== scoreB) return scoreB - scoreA;

      // Then prefer those with coordinates
      if (a.latitude && !b.latitude) return -1;
      if (b.latitude && !a.latitude) return 1;

      // Finally newest start date
      const dateA = a.permitStartDate ? new Date(a.permitStartDate).getTime() : 0;
      const dateB = b.permitStartDate ? new Date(b.permitStartDate).getTime() : 0;
      return dateB - dateA;
    })[0];

    // 3. Save to enrichment cache table
    if (allMatches.length > 0) {
      await saveComptrollerMatchesToDb(allMatches);
    }

    return {
      matches: allMatches,
      bestMatch,
      source: 'Texas Comptroller Public Records'
    };
  } catch (error) {
    console.error('[ComptrollerEnrichment] Failed:', error);
    return { matches: [], source: 'Texas Comptroller Public Records' };
  }
}

async function saveComptrollerMatchesToDb(matches: NormalizedComptrollerBusiness[]) {
  const rows = matches.map(m => ({
    source: m.source,
    signal_type: m.signalType,
    taxpayer_id: m.taxpayerId,
    location_number: m.locationNumber,
    business_name: m.businessName,
    location_name: m.locationName,
    street: m.street,
    city: m.city,
    state: m.state,
    zip: m.zip,
    permit_start_date: m.permitStartDate,
    permit_end_date: m.permitEndDate,
    permit_status: m.permitStatus,
    latitude: m.latitude,
    longitude: m.longitude,
    badge: m.badge,
    priority: m.priority,
    raw_payload: m.rawPayload,
    updated_at: new Date().toISOString()
  }));

  const { error } = await supabase
    .from('comptroller_business_records')
    .upsert(rows, { onConflict: 'taxpayer_id, location_number' });

  if (error) {
    console.warn('[ComptrollerEnrichment] DB Save Failed:', error.message);
  }
}
