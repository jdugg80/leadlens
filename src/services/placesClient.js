// src/services/placesClient.js
//
// Client wrapper for the places-proxy Edge Function (LeadLens Supabase project).
// Call configurePlacesClient() once at startup with your LeadLens supabase client
// and your storageBridge (needs async getItem / setItem).
//
// What it does:
//  - Sends a stable device id so the server can enforce the per-tester daily cap
//  - Skips a new search if you have not moved MIN_MOVE_METERS and nothing changed
//    (returns the last result from memory for this session only, never persisted)
//  - Shares one request between identical calls made at the same time
//  - Drops CLOSED_PERMANENTLY places here, before any Place Details call
//  - Throws PlacesLimitError on HTTP 429 so the UI can show a proper message

let _supabase = null;
let _storage = null;
let _deviceId = null;

const DEVICE_ID_KEY = 'll_device_id';
const MIN_MOVE_METERS = 100;
const MEMORY_TTL_MS = 5 * 60 * 1000;

let _last = null;     // { key, lat, lng, at, places }
let _inFlight = null; // { key, lat, lng, promise }

export class PlacesLimitError extends Error {
  constructor(cap) {
    super('daily_limit');
    this.name = 'PlacesLimitError';
    this.code = 'daily_limit';
    this.cap = cap;
  }
}

export function configurePlacesClient({ supabase, storage }) {
  _supabase = supabase;
  _storage = storage;
}

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

async function getDeviceId() {
  if (_deviceId) return _deviceId;
  try {
    const saved = await _storage.getItem(DEVICE_ID_KEY);
    if (saved) {
      _deviceId = saved;
      return saved;
    }
  } catch {
    // fall through and generate a new one
  }
  _deviceId = uuidv4();
  try {
    await _storage.setItem(DEVICE_ID_KEY, _deviceId);
  } catch {
    // still usable for this session
  }
  return _deviceId;
}

function metersBetween(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Maps a Places API (New) result to the fields the rest of the app usually needs.
// ADJUST this to whatever normalizeLead expects, and verify every field passes through.
function normalizePlace(p) {
  return {
    place_id: p.id,
    name: p.displayName?.text ?? '',
    address: p.formattedAddress ?? '',
    latitude: p.location?.latitude ?? null,
    longitude: p.location?.longitude ?? null,
    business_status: p.businessStatus ?? null,
    types: p.types ?? [],
  };
}

export async function searchNearby({
  latitude,
  longitude,
  radius = 1000,
  includedTypes,
  maxResultCount = 20,
  force = false,
}) {
  if (!_supabase) throw new Error('places client not configured');

  const key = JSON.stringify([radius, includedTypes ?? null, maxResultCount]);
  const now = Date.now();

  // 1) Same search, barely moved, recent: reuse this session's last result.
  if (
    !force &&
    _last &&
    _last.key === key &&
    now - _last.at < MEMORY_TTL_MS &&
    metersBetween(_last.lat, _last.lng, latitude, longitude) < MIN_MOVE_METERS
  ) {
    return { places: _last.places, fromMemory: true };
  }

  // 2) Identical search already running: share it.
  if (
    _inFlight &&
    _inFlight.key === key &&
    metersBetween(_inFlight.lat, _inFlight.lng, latitude, longitude) < MIN_MOVE_METERS
  ) {
    return _inFlight.promise;
  }

  const promise = (async () => {
    const deviceId = await getDeviceId();
    const { data, error } = await _supabase.functions.invoke('places-proxy', {
      body: { latitude, longitude, radius, includedTypes, maxResultCount },
      headers: { 'x-device-id': deviceId },
    });

    if (error) {
      if (error.context?.status === 429) {
        let cap;
        try {
          cap = (await error.context.json())?.cap;
        } catch {
          // ignore parse problems
        }
        throw new PlacesLimitError(cap);
      }
      throw error;
    }

    const places = (data?.places ?? [])
      .filter((p) => p.businessStatus !== 'CLOSED_PERMANENTLY')
      .map(normalizePlace);

    _last = { key, lat: latitude, lng: longitude, at: Date.now(), places };
    return { places, fromMemory: false };
  })();

  _inFlight = { key, lat: latitude, lng: longitude, promise };
  try {
    return await promise;
  } finally {
    if (_inFlight && _inFlight.promise === promise) _inFlight = null;
  }
}
