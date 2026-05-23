import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PEST_PLACE_TYPES = [
  'restaurant','food','bakery','bar','cafe','meal_delivery','meal_takeaway',
  'night_club','lodging','hospital','health','pharmacy','school',
  'grocery_or_supermarket','supermarket','convenience_store',
];
const PEST_NAME_PATTERNS = [
  'restaurant','grill','bbq','cafe','kitchen','bistro','diner','food',
  'pizza','burger','taco','sushi','bakery','catering','hotel','motel',
  'inn','suites','warehouse','storage','clinic','medical','dental',
  'school','daycare','grocery','market','convenience','bar','brewery',
];

function detectPest(name: string, types: string[] = []): { has: boolean; details: string } {
  const lower = (name || '').toLowerCase();
  const n = PEST_NAME_PATTERNS.filter(p => lower.includes(p));
  const t = types.filter(t => PEST_PLACE_TYPES.includes(t));
  const all = [...new Set([...n, ...t])];
  return { has: all.length > 0, details: all.length > 0 ? `Indicators: ${all.join(', ')}` : '' };
}

async function stableUUID(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(12,15)}-${hex.slice(15,19)}-${hex.slice(19,31)}`;
}

async function geocodeZip(zip: string, apiKey: string): Promise<{ lat: number; lng: number; state: string; city: string } | null> {
  try {
    const res  = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${zip}&components=country:US&key=${apiKey}`);
    const data = await res.json();
    const result = data?.results?.[0];
    if (!result) return null;
    const loc   = result.geometry?.location;
    if (!loc) return null;
    const comps = result.address_components || [];
    const stateComp = comps.find((c: any) => c.types?.includes('administrative_area_level_1'));
    const cityComp  = comps.find((c: any) => c.types?.includes('locality') || c.types?.includes('postal_town'));
    return { lat: loc.lat, lng: loc.lng, state: stateComp?.short_name || 'US', city: cityComp?.long_name || '' };
  } catch { return null; }
}

// All 5 place type searches run in parallel
async function searchAllNearby(lat: number, lng: number, apiKey: string): Promise<any[]> {
  const searchTypes = ['restaurant', 'lodging', 'grocery_or_supermarket', 'school', 'hospital'];
  const allResults = await Promise.all(
    searchTypes.map(type =>
      fetch(`https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=3000&type=${type}&key=${apiKey}`)
        .then(r => r.json())
        .then(d => Array.isArray(d?.results) ? d.results : [])
        .catch(() => [])
    )
  );
  // Deduplicate by place_id
  const seen = new Set<string>();
  const deduped: any[] = [];
  for (const batch of allResults) {
    for (const r of batch) {
      if (r?.place_id && !seen.has(r.place_id)) {
        seen.add(r.place_id);
        deduped.push(r);
      }
    }
  }
  return deduped;
}

const CPA_BASE         = 'https://api.comptroller.texas.gov/public-data/v1/public';
const NEW_OPENING_DAYS = 90;

async function fetchNewOpenings(zip: string, apiKey: string): Promise<any[]> {
  try {
    const url = `${CPA_BASE}/sales-tax-payer-location?ZIPCODE=${zip}&page=1&pageSize=100&sortBy=PERMIT_START_DT&sortOrder=DESC`;
    const res = await fetch(url, { headers: { 'x-api-key': apiKey, 'accept': 'application/json' } });
    if (!res.ok) return [];
    const data    = await res.json();
    const records = Array.isArray(data?.result) ? data.result : Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
    const cutoff  = Date.now() - NEW_OPENING_DAYS * 86400000;
    return records.filter((r: any) => {
      if (!r?.PERMIT_START_DT) return false;
      const d = new Date(r.PERMIT_START_DT).getTime();
      return !isNaN(d) && d >= cutoff;
    });
  } catch { return []; }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL    = Deno.env.get('SUPABASE_URL') ?? '';
    const SERVICE_KEY     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const GOOGLE_MAPS_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY') ?? '';
    const CPA_KEY         = Deno.env.get('TEXAS_COMPTROLLER_API_KEY') ?? '';

    if (!GOOGLE_MAPS_KEY) return jsonErr('Missing GOOGLE_MAPS_API_KEY secret');

    const body     = await req.json();
    const zipCodes: string[] = Array.isArray(body?.zipCodes) ? body.zipCodes : [];
    if (!zipCodes.length) return jsonErr('zipCodes array is required', 400);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    let inserted = 0, skipped = 0, newOpenings = 0;
    const errors: string[] = [];

    for (const zip of zipCodes) {
      try {
        // Geocode + all Places searches run in parallel
        const [center, ...rest] = await Promise.all([
          geocodeZip(zip, GOOGLE_MAPS_KEY),
        ]);
        if (!center) { errors.push(`ZIP ${zip}: geocode failed`); continue; }

        const { lat, lng, state, city } = center;

        // All 5 Places searches fire simultaneously
        const placesResults = await searchAllNearby(lat, lng, GOOGLE_MAPS_KEY);

        // Also kick off Comptroller fetch in parallel if TX
        const comptrollerPromise = (CPA_KEY && state === 'TX')
          ? fetchNewOpenings(zip, CPA_KEY)
          : Promise.resolve([]);

        // Build upsert rows for Places results
        const placeRows = await Promise.all(placesResults.map(async (place) => {
          const businessName = String(place?.name || '').trim();
          if (!businessName) return null;
          const types   = Array.isArray(place?.types) ? place.types : [];
          const pest    = detectPest(businessName, types);
          const placeId = String(place?.place_id || '');
          const isOpen  = place?.business_status === 'OPERATIONAL';
          const id      = await stableUUID(`gplaces:${placeId || businessName + zip}`);
          return {
            id, establishment_name: businessName,
            address: String(place?.vicinity || ''), city, state, zip,
            latitude: place?.geometry?.location?.lat ?? null,
            longitude: place?.geometry?.location?.lng ?? null,
            signal_layer: 'existing',
            compliance_level: isOpen ? 'ACTIVE' : (place?.business_status || 'UNKNOWN'),
            compliance_source: 'Google Places',
            signal_type: 'Existing', is_new_opening: false,
            has_pest_indicator: pest.has, pest_details: pest.details || null,
            metadata: { place_id: placeId, place_types: types, business_status: place?.business_status, source: 'google-places', ingested_at: new Date().toISOString() },
          };
        }));

        // Deduplicate by establishment_name+lat+lng before batch upsert
        const seenRows = new Map();
        for (const row of placeRows.filter(Boolean)) {
          const key = row.establishment_name + "|" + row.latitude + "|" + row.longitude;
          if (!seenRows.has(key)) seenRows.set(key, row);
        }
        const validPlaceRows = Array.from(seenRows.values());
        if (validPlaceRows.length > 0) {
          const { error } = await supabase.from('lens_signals').upsert(validPlaceRows, { onConflict: 'establishment_name,latitude,longitude' });
          if (error) { errors.push(`ZIP ${zip} batch: ${error.message}`); skipped += validPlaceRows.length; }
          else inserted += validPlaceRows.length;
        }

        // Now handle Comptroller results
        const newBiz = await comptrollerPromise;
        for (const biz of newBiz) {
          const businessName = String(biz?.LOCATION_NAME || biz?.TAXPAYER_NAME || '').trim();
          if (!businessName) continue;
          const address    = [biz?.LOCATION_ADDRESS, biz?.CITY, biz?.STATE_CODE].filter(Boolean).join(', ');
          const permitDt   = biz?.PERMIT_START_DT ? new Date(biz.PERMIT_START_DT).toISOString() : null;
          const taxpayerId = String(biz?.TAXPAYER_NUMBER || '');
          const id         = await stableUUID(`cpa:${taxpayerId || businessName + zip}`);
          const pest       = detectPest(businessName);
          const { error }  = await supabase.from('lens_signals').upsert({
            id, establishment_name: businessName, address: address || '',
            city: String(biz?.CITY || ''), state: 'TX', zip,
            latitude: null, longitude: null, signal_layer: 'new_opening',
            compliance_level: biz?.STATUS || 'ACTIVE', compliance_source: 'Texas Comptroller',
            signal_type: 'New Opening', opening_date: permitDt, is_new_opening: true,
            has_pest_indicator: pest.has, pest_details: pest.details || null,
            metadata: { taxpayer_id: taxpayerId, taxpayer_name: biz?.TAXPAYER_NAME, permit_start: permitDt, status: biz?.STATUS, source: 'texas-comptroller', ingested_at: new Date().toISOString() },
          }, { onConflict: 'establishment_name,latitude,longitude' });
          if (error) { errors.push(`[CPA] ${businessName}: ${error.message}`); skipped++; }
          else { inserted++; newOpenings++; }
        }

      } catch (zipErr) {
        errors.push(`ZIP ${zip}: ${zipErr instanceof Error ? zipErr.message : String(zipErr)}`);
      }
    }

    return jsonResponse({ ok: true, inserted, skipped, newOpenings, zipsProcessed: zipCodes.length, errors: errors.slice(0, 20) });
  } catch (err) {
    return jsonErr(`Signal ingest failed: ${err instanceof Error ? err.message : String(err)}`);
  }
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });
}
function jsonErr(msg: string, status = 500): Response {
  return jsonResponse({ error: msg }, status);
}
