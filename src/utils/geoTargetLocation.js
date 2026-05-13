import * as Location from 'expo-location';

const DEFAULT_TIMEOUT_MS = 6500;

function timeoutPromise(ms, label = 'Location request timed out') {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(label)), ms);
  });
}

async function withTimeout(promise, ms, label) {
  return Promise.race([promise, timeoutPromise(ms, label)]);
}

function getAccuracyScore(accuracyMeters) {
  if (accuracyMeters == null) return 10;
  if (accuracyMeters <= 5) return 100;
  if (accuracyMeters <= 10) return 95;
  if (accuracyMeters <= 25) return 85;
  if (accuracyMeters <= 50) return 72;
  if (accuracyMeters <= 100) return 55;
  if (accuracyMeters <= 250) return 35;
  return 20;
}

function getFreshnessScore(timestamp) {
  if (!timestamp) return 10;

  const ageSeconds = (Date.now() - timestamp) / 1000;

  if (ageSeconds <= 10) return 100;
  if (ageSeconds <= 30) return 90;
  if (ageSeconds <= 60) return 75;
  if (ageSeconds <= 180) return 55;
  if (ageSeconds <= 600) return 35;
  return 15;
}

function normalizeLocation(location, source = 'unknown') {
  if (!location?.coords) return null;

  const { coords, timestamp } = location;
  const accuracyScore = getAccuracyScore(coords.accuracy);
  const freshnessScore = getFreshnessScore(timestamp);
  const confidence = Math.round(accuracyScore * 0.75 + freshnessScore * 0.25);

  return {
    source,
    latitude: coords.latitude,
    longitude: coords.longitude,
    altitude: coords.altitude ?? null,
    accuracyMeters: coords.accuracy ?? null,
    altitudeAccuracyMeters: coords.altitudeAccuracy ?? null,
    heading: coords.heading ?? null,
    speed: coords.speed ?? null,
    timestamp: timestamp ?? Date.now(),
    ageSeconds: timestamp ? Math.max(0, Math.round((Date.now() - timestamp) / 1000)) : null,
    accuracyScore,
    freshnessScore,
    confidence,
  };
}

async function requestLocationPermission() {
  const servicesEnabled = await Location.hasServicesEnabledAsync();

  if (!servicesEnabled) {
    return {
      granted: false,
      reason: 'Location services are disabled on this device.',
    };
  }

  const existing = await Location.getForegroundPermissionsAsync();

  if (existing?.granted) {
    return {
      granted: true,
      status: existing.status,
    };
  }

  const requested = await Location.requestForegroundPermissionsAsync();

  return {
    granted: !!requested?.granted,
    status: requested?.status,
    reason: requested?.granted ? null : 'Location permission was not granted.',
  };
}

async function getHeadingSafe() {
  try {
    const heading = await withTimeout(
      Location.getHeadingAsync(),
      3500,
      'Heading request timed out'
    );

    return {
      magneticHeading: heading?.magHeading ?? null,
      trueHeading: heading?.trueHeading ?? null,
      headingAccuracy: heading?.accuracy ?? null,
      timestamp: Date.now(),
    };
  } catch (error) {
    return {
      magneticHeading: null,
      trueHeading: null,
      headingAccuracy: null,
      error: error?.message || String(error),
      timestamp: Date.now(),
    };
  }
}

async function reverseGeocodeSafe(latitude, longitude) {
  try {
    const result = await withTimeout(
      Location.reverseGeocodeAsync({ latitude, longitude }),
      5000,
      'Reverse geocode timed out'
    );

    const first = result?.[0];

    if (!first) return null;

    return {
      name: first.name ?? null,
      streetNumber: first.streetNumber ?? null,
      street: first.street ?? null,
      city: first.city ?? null,
      district: first.district ?? null,
      region: first.region ?? null,
      postalCode: first.postalCode ?? null,
      country: first.country ?? null,
      formattedAddress: first.formattedAddress ?? null,
    };
  } catch (error) {
    return {
      error: error?.message || String(error),
    };
  }
}

async function getLastKnownFix() {
  try {
    const lastKnown = await Location.getLastKnownPositionAsync({
      maxAge: 1000 * 60 * 5,
      requiredAccuracy: 250,
    });

    return normalizeLocation(lastKnown, 'last_known');
  } catch (error) {
    return null;
  }
}

async function getBalancedFix() {
  try {
    const current = await withTimeout(
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }),
      3500,
      'Balanced location timed out'
    );

    return normalizeLocation(current, 'balanced_fused');
  } catch (error) {
    return null;
  }
}

async function getHighAccuracyFix() {
  try {
    const preferredAccuracy = Location.Accuracy.BestForNavigation ?? Location.Accuracy.Highest;

    const current = await withTimeout(
      Location.getCurrentPositionAsync({
        accuracy: preferredAccuracy,
      }),
      DEFAULT_TIMEOUT_MS,
      'High accuracy location timed out'
    );

    return normalizeLocation(current, 'high_accuracy_gps');
  } catch (error) {
    return null;
  }
}

function selectBestFix(fixes = []) {
  const validFixes = fixes.filter(Boolean);

  if (!validFixes.length) return null;

  return validFixes.sort((a, b) => {
    const confidenceDiff = (b.confidence ?? 0) - (a.confidence ?? 0);
    if (confidenceDiff !== 0) return confidenceDiff;

    const aAccuracy = a.accuracyMeters ?? 999999;
    const bAccuracy = b.accuracyMeters ?? 999999;

    return aAccuracy - bAccuracy;
  })[0];
}

function buildGeoTargetStatus(bestFix) {
  if (!bestFix) {
    return {
      label: 'No Location Lock',
      level: 'none',
      message: 'No usable location was captured.',
    };
  }

  const accuracy = bestFix.accuracyMeters;

  if (accuracy != null && accuracy <= 10) {
    return {
      label: 'Precision Lock',
      level: 'excellent',
      message: 'Location lock is highly accurate.',
    };
  }

  if (accuracy != null && accuracy <= 50) {
    return {
      label: 'Strong Lock',
      level: 'good',
      message: 'Location lock is suitable for lead capture.',
    };
  }

  if (accuracy != null && accuracy <= 150) {
    return {
      label: 'Approximate Lock',
      level: 'fair',
      message: 'Location is usable, but should be verified against OCR or business lookup.',
    };
  }

  return {
    label: 'Weak Lock',
    level: 'poor',
    message: 'Location is rough and should be verified before saving.',
  };
}

export async function createGeoTargetSnapshot(options = {}) {
  const { includeAddress = true, requireHighAccuracy = false } = options;

  const permission = await requestLocationPermission();

  if (!permission.granted) {
    return {
      ok: false,
      permission,
      bestFix: null,
      fixes: [],
      heading: null,
      address: null,
      status: {
        label: 'Permission Needed',
        level: 'blocked',
        message: permission.reason || 'Location permission is required for GeoTarget Assist.',
      },
      capturedAt: new Date().toISOString(),
    };
  }

  const fixes = [];

  const lastKnownFix = await getLastKnownFix();
  if (lastKnownFix) fixes.push(lastKnownFix);

  const balancedFix = await getBalancedFix();
  if (balancedFix) fixes.push(balancedFix);

  const highAccuracyFix = await getHighAccuracyFix();
  if (highAccuracyFix) fixes.push(highAccuracyFix);

  const bestFix = selectBestFix(fixes);
  const heading = await getHeadingSafe();

  let address = null;

  if (includeAddress && bestFix?.latitude && bestFix?.longitude) {
    address = await reverseGeocodeSafe(bestFix.latitude, bestFix.longitude);
  }

  const status = buildGeoTargetStatus(bestFix);

  return {
    ok: !!bestFix,
    mode: requireHighAccuracy ? 'high_accuracy_required' : 'fast_fused_lock',
    bestFix,
    fixes,
    heading,
    address,
    status,
    capturedAt: new Date().toISOString(),
    futureReady: {
      rtkCompatible: true,
      mlRefinementReady: true,
      cameraBearingReady: true,
      businessMatchReady: true,
    },
  };
}

export function summarizeGeoTarget(geoTarget) {
  if (!geoTarget?.bestFix) {
    return {
      label: geoTarget?.status?.label || 'No Location Lock',
      accuracyText: 'Unknown',
      confidenceText: 'Unknown',
    };
  }

  const accuracy = geoTarget.bestFix.accuracyMeters;
  const confidence = geoTarget.bestFix.confidence;

  return {
    label: geoTarget?.status?.label || 'Location Captured',
    accuracyText: accuracy == null ? 'Unknown' : `${Math.round(accuracy)}m`,
    confidenceText: confidence == null ? 'Unknown' : `${confidence}%`,
  };
}
