import { fetchLensSignalNearby } from '../../features/lenssignal/lenssignalApi';
import { LensSignalRecord } from '../../features/lenssignal/lenssignalTypes';
import { resolveJurisdictionsForViewport, JurisdictionInfo } from './lensSignalJurisdictionService';
import { getSourcesForJurisdiction, LensSignalSource } from './lensSignalSourceRegistry';

export interface LensSignalSearchStatus {
  checkedJurisdictions: string[];
  missingCoverage: string[];
}

export async function runLensSignalSearchForViewport(params: {
  northEast: { latitude: number; longitude: number };
  southWest: { latitude: number; longitude: number };
}): Promise<{
  records: LensSignalRecord[];
  status: LensSignalSearchStatus;
}> {
  // 1. Detect jurisdictions in viewport
  const jurisdictions = await resolveJurisdictionsForViewport(params);

  // 2. Resolve sources and check coverage
  const checkedJurisdictions: string[] = [];
  const missingCoverage: string[] = [];

  for (const j of jurisdictions) {
    const name = j.county ? `${j.county} County` : j.city || 'Unknown';
    checkedJurisdictions.push(name);

    const sources = getSourcesForJurisdiction(j);
    if (sources.length === 0) {
      missingCoverage.push(name);
    }
  }

  // 3. Fetch from Supabase (the centralized store for all jurisdictions)
  const center = {
    latitude: (params.northEast.latitude + params.southWest.latitude) / 2,
    longitude: (params.northEast.longitude + params.southWest.longitude) / 2,
  };

  // Calculate radius from actual viewport bounds so it covers the full visible area
  const latDiff = Math.abs(params.northEast.latitude - params.southWest.latitude);
  const lngDiff = Math.abs(params.northEast.longitude - params.southWest.longitude);
  const latMiles = latDiff * 69;
  const lngMiles = lngDiff * Math.cos((center.latitude * Math.PI) / 180) * 69;
  const radiusMiles = Math.min(Math.max(latMiles, lngMiles) / 2 + 10, 75); // half-diagonal + buffer, cap 75mi

  const records = await fetchLensSignalNearby(center.latitude, center.longitude, radiusMiles);

  return {
    records,
    status: {
      checkedJurisdictions: Array.from(new Set(checkedJurisdictions)),
      missingCoverage: Array.from(new Set(missingCoverage)),
    }
  };
}
