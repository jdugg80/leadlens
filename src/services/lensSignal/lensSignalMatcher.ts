import { LensSignalRecord } from '../../features/lenssignal/lenssignalTypes';

export interface MatchCandidate {
  name: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  latitude?: number;
  longitude?: number;
}

export function calculateMatchConfidence(
  record: LensSignalRecord,
  candidate: MatchCandidate
): { score: number; method: string } {
  let score = 0;
  const matchedFields: string[] = [];

  // 1. Name Match (Normalized)
  const normRecordName = (record.establishment_name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const normCandidateName = (candidate.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  if (normRecordName && normRecordName === normCandidateName) {
    score += 0.5;
    matchedFields.push('name');
  } else if (normRecordName && (normRecordName.includes(normCandidateName) || normCandidateName.includes(normRecordName))) {
    score += 0.3;
    matchedFields.push('partial_name');
  }

  // 2. Address Match
  const normRecordAddr = (record.address || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const normCandidateAddr = (candidate.address || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  if (normRecordAddr && normRecordAddr === normCandidateAddr) {
    score += 0.4;
    matchedFields.push('address');
  }

  // 3. Location Match (Lat/Lng distance)
  if (record.latitude && record.longitude && candidate.latitude && candidate.longitude) {
    const dist = getDistanceMeters(
      { lat: record.latitude, lng: record.longitude },
      { lat: candidate.latitude, lng: candidate.longitude }
    );

    if (dist < 50) {
      score += 0.4;
      matchedFields.push('location_exact');
    } else if (dist < 200) {
      score += 0.2;
      matchedFields.push('location_near');
    }
  }

  // 4. ZIP/City Match (Fallback if address/location weak)
  if (record.zip && record.zip === candidate.zip) {
    score += 0.1;
  }

  if (record.phone && candidate.phone && record.phone.replace(/\D/g, '') === candidate.phone.replace(/\D/g, '')) {
    score += 0.5;
    matchedFields.push('phone');
  }

  return {
    score: Math.min(score, 1.0),
    method: matchedFields.join('+') || 'none',
  };
}

function getDistanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.sqrt(h));
}
