import { reverseGeocodeCoords } from '../geoEnrich';

function isUsZip(value: string | null | undefined) {
  if (!value) return false;
  const v = String(value).trim();
  return /^[0-9]{5}(-[0-9]{4})?$/.test(v);
}

function extractExifCoords(exif: any) {
  if (!exif) return null;
  // Common EXIF shapes: { GPSLatitude, GPSLongitude } or nested gps
  if (exif.GPSLatitude && exif.GPSLongitude) {
    const lat = Number(exif.GPSLatitude);
    const lon = Number(exif.GPSLongitude);
    if (!Number.isNaN(lat) && !Number.isNaN(lon)) return { latitude: lat, longitude: lon };
  }
  if (exif.gps && (exif.gps.latitude || exif.gpsLongitude || exif.gpsLongitude)) {
    const lat = Number(exif.gps.latitude || exif.gpsLatitude || exif.gpsLatitudeRef);
    const lon = Number(exif.gps.longitude || exif.gpsLongitude || exif.gpsLongitudeRef);
    if (!Number.isNaN(lat) && !Number.isNaN(lon)) return { latitude: lat, longitude: lon };
  }
  // Try common names
  if (exif.latitude && exif.longitude) {
    const lat = Number(exif.latitude);
    const lon = Number(exif.longitude);
    if (!Number.isNaN(lat) && !Number.isNaN(lon)) return { latitude: lat, longitude: lon };
  }
  return null;
}

async function reverseGeocodeZip(lat: number, lon: number) {
  try {
    const res = await reverseGeocodeCoords({ latitude: lat, longitude: lon });
    console.log('[LeadLock ZipResolver] reverseGeocodeCoords result:', res);
    if (!res) {
      console.warn('[LeadLock ZipResolver] reverseGeocodeCoords returned null');
      return null;
    }
    const result = {
      zip: res.zip || null,
      city: res.city || null,
      state: res.state || null,
    };
    console.log('[LeadLock ZipResolver] extracted zip/city/state:', result);
    return result;
  } catch (err) {
    console.warn('[LeadLock ZipResolver] reverseGeocodeZip failed', err);
    return null;
  }
}

function getConfidenceLabel(source: string, accuracyMeters: number | null) {
  if (source === 'live_gps') {
    if (accuracyMeters !== null && accuracyMeters <= 25) return 0.95;
    if (accuracyMeters !== null && accuracyMeters <= 75) return 0.85;
    return 0.7;
  }
  if (source === 'photo_exif') return 0.82;
  if (source === 'business_address') return 0.78;
  if (source === 'device_fallback') return 0.62;
  return 0;
}

export default async function resolveZipFromLeadLockPhoto({
  liveGps,
  photoExif,
  businessAddressZip,
  allowDeviceFallback = true,
}: {
  liveGps?: any;
  photoExif?: any;
  businessAddressZip?: string | null;
  allowDeviceFallback?: boolean;
}) {
  try {
    console.log('[LeadLock ZipResolver] starting zip resolution, liveGps:', liveGps);

  const result = {
    zip: null as string | null,
    city: null as string | null,
    state: null as string | null,
    latitude: null as number | null,
    longitude: null as number | null,
    source: 'unknown' as string,
    confidence: 0,
    warning: null as string | null,
    gpsAccuracyMeters: null as number | null,
    capturedAt: new Date().toISOString(),
  };

  // 1. live_gps
  if (liveGps && liveGps.latitude && liveGps.longitude) {
    console.log('[LeadLock ZipResolver] liveGps available, accuracy:', liveGps.accuracy || null);
    const geo = await reverseGeocodeZip(liveGps.latitude, liveGps.longitude);
    if (geo && geo.zip) {
      result.zip = geo.zip;
      result.city = geo.city;
      result.state = geo.state;
      result.latitude = liveGps.latitude;
      result.longitude = liveGps.longitude;
      result.source = 'live_gps';
      result.gpsAccuracyMeters = liveGps.accuracy ?? null;
      result.confidence = getConfidenceLabel('live_gps', liveGps.accuracy ?? null);
      console.log('[LeadLock ZipResolver] selected live_gps zip:', result.zip, 'confidence:', result.confidence);
      return result;
    }
    console.log('[LeadLock ZipResolver] live_gps reverse geocode did not yield postal code');
  } else {
    console.log('[LeadLock ZipResolver] no liveGps available');
  }

  // 2. photo_exif
  const exifCoords = extractExifCoords(photoExif);
  if (exifCoords) {
    console.log('[LeadLock ZipResolver] photo EXIF coords found');
    const geo = await reverseGeocodeZip(exifCoords.latitude, exifCoords.longitude);
    if (geo && geo.zip) {
      result.zip = geo.zip;
      result.city = geo.city;
      result.state = geo.state;
      result.latitude = exifCoords.latitude;
      result.longitude = exifCoords.longitude;
      result.source = 'photo_exif';
      result.confidence = getConfidenceLabel('photo_exif', null);
      console.log('[LeadLock ZipResolver] selected photo_exif zip:', result.zip, 'confidence:', result.confidence);
      return result;
    }
    console.log('[LeadLock ZipResolver] photo_exif reverse geocode did not yield postal code');
  } else {
    console.log('[LeadLock ZipResolver] no EXIF coords present');
  }

  // 3. business_address (if provided and looks like a zip or contains a zip)
  if (businessAddressZip) {
    const trimmed = String(businessAddressZip).trim();
    // If it's a clean zip
    if (isUsZip(trimmed)) {
      result.zip = trimmed.match(/[0-9]{5}/)?.[0] || trimmed;
      result.source = 'business_address';
      result.confidence = getConfidenceLabel('business_address', null);
      console.log('[LeadLock ZipResolver] selected business_address zip:', result.zip, 'confidence:', result.confidence);
      return result;
    }
    // Try to extract zip from address string
    const m = trimmed.match(/([0-9]{5})(?:-[0-9]{4})?/);
    if (m) {
      result.zip = m[1];
      result.source = 'business_address';
      result.confidence = getConfidenceLabel('business_address', null);
      console.log('[LeadLock ZipResolver] extracted zip from business address:', result.zip);
      return result;
    }
    console.log('[LeadLock ZipResolver] businessAddress provided but no zip detected');
  }

  // 4. device_fallback
  if (allowDeviceFallback && liveGps && liveGps.latitude && liveGps.longitude) {
    console.log('[LeadLock ZipResolver] falling back to liveGps coords without postal match');
    result.latitude = liveGps.latitude;
    result.longitude = liveGps.longitude;
    result.source = 'device_fallback';
    result.gpsAccuracyMeters = liveGps.accuracy ?? null;
    result.confidence = getConfidenceLabel('device_fallback', liveGps.accuracy ?? null);
    result.warning = 'postal lookup failed, using coords as fallback';
    return result;
  }

  console.log('[LeadLock ZipResolver] resolution failed — returning unknown');
  return result;
  } catch (err) {
    console.error('[LeadLock ZipResolver] caught error:', err);
    return {
      zip: null,
      city: null,
      state: null,
      latitude: null,
      longitude: null,
      source: 'unknown',
      confidence: 0,
      warning: 'resolver error: ' + String(err),
      gpsAccuracyMeters: null,
      capturedAt: new Date().toISOString(),
    };
  }
}
