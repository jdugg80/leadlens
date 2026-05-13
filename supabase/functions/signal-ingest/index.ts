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

function detectPest(name: string, types: string[]): { has: boolean; details: string } {
  const lower = (name || '').toLowerCase();
  const n = PEST_NAME_PATTERNS.filter(p => lower.includes(p));
  const t = types.filter(t => PEST_PLACE_TYPES.includes(t));
  const all = [...new Set([...n, ...t])];
  return { has: all.length > 0, details: all.length > 0 ? `Indicators: ${all.join(', ')}` : '' };
}

async function stableUUID(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`gplaces:${input}`));
  const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(12,15)}-${hex.slice(15,19)}-${hex.slice(19,31)}`;
}

async function geocodeZip(zip: string, apiKey: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${zip},TX&key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();
    const loc = data?.results?.[0]?.geometry?.location;
    return loc ? { lat: loc.lat, lng: loc.lng } : null;
  } catch { return null; }
}

async function searchNearby(lat: number, lng: number, type: string, apiKey: string): Promise<any[]> {
  try {
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=3000&type=${type}&key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();
    return Array.isArray(data?.results) ? data.results : [];
  } catch { return []; }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL    = Deno.env.get('SUPABASE_URL') ?? '';
    const SERVICE_KEY     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const GOOGLE_MAPS_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY') ?? '';

    if (!GOOGLE_MAPS_KEY) return jsonResponse({ error: 'Missing GOOGLE_MAPS_API_KEY secret' }, 500);

    const body = await req.json();
    const zipCodes: string[] = Array.isArray(body?.zipCodes) ? body.zipCodes : [];
    if (!zipCodes.length) return jsonResponse({ error: 'zipCodes array is required' }, 400);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    let inserted = 0, skipped = 0;
    const errors: string[] = [];
    const seenIds = new Set<string>();

    for (const zip of zipCodes) {
      try {
        const center = await geocodeZip(zip, GOOGLE_MAPS_KEY);
        if (!center) { errors.push(`ZIP ${zip}: geocode failed`); continue; }

        const searchTypes = ['restaurant', 'lodging', 'grocery_or_supermarket', 'school', 'hospital'];
        const allResults: any[] = [];

        for (const type of searchTypes) {
          const results = await searchNearby(center.lat, center.lng, type, GOOGLE_MAPS_KEY);
          for (const r of results) {
            if (r?.place_id && !seenIds.has(r.place_id)) {
              seenIds.add(r.place_id);
              allResults.push(r);
            }
          }
        }

        for (const place of allResults) {
          try {
            const businessName = String(place?.name || '').trim();
            if (!businessName) continue;

            const types   = Array.isArray(place?.types) ? place.types : [];
            const pest    = detectPest(businessName, types);
            const lat     = place?.geometry?.location?.lat ?? null;
            const lng     = place?.geometry?.location?.lng ?? null;
            const placeId = String(place?.place_id || '');
            const vicinity = String(place?.vicinity || '');
            const isOpen  = place?.business_status === 'OPERATIONAL';
            const id      = await stableUUID(placeId || `${businessName}-${zip}`);

            const result = await supabase.from('lens_signals').upsert({
              id,
              business_name:      businessName,
              address:            vicinity,
              city:               '',
              state:              'TX',
              zip,
              latitude:           lat,
              longitude:          lng,
              compliance_level:   isOpen ? 'ACTIVE' : place?.business_status || 'UNKNOWN',
              compliance_source:  'Google Places',
              opening_type:       'Existing',
              is_new_opening:     false,
              has_pest_indicator: pest.has,
              pest_details:       pest.details || null,
              metadata: {
                place_id:        placeId,
                place_types:     types,
                business_status: place?.business_status,
                source:          'google-places',
                ingested_at:     new Date().toISOString(),
              },
            }, { onConflict: 'id' });

            if (result?.error) {
              errors.push(`${businessName}: ${result.error.message}`);
              skipped++;
            } else {
              inserted++;
            }
          } catch (placeErr) {
            errors.push(`Place error: ${placeErr instanceof Error ? placeErr.message : String(placeErr)}`);
            skipped++;
          }
        }
      } catch (zipErr) {
        errors.push(`ZIP ${zip}: ${zipErr instanceof Error ? zipErr.message : String(zipErr)}`);
      }
    }

    return jsonResponse({ ok: true, inserted, skipped, zipsProcessed: zipCodes.length, errors: errors.slice(0, 20) });
  } catch (err) {
    return jsonResponse({ error: 'Signal ingest failed', details: err instanceof Error ? err.message : String(err) }, 500);
  }
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });
}
