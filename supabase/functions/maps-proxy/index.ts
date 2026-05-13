const MAPS_BASE_URL = 'https://maps.googleapis.com/maps/api';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

type MapsMode =
  | 'geocode'
  | 'reverse_geocode'
  | 'autocomplete'
  | 'place_details';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');

    if (!apiKey) {
      return jsonResponse({ error: 'Missing GOOGLE_MAPS_API_KEY in Supabase secrets' }, 500);
    }

    const url = new URL(req.url);
    const mode = url.searchParams.get('mode') as MapsMode | null;

    switch (mode) {

      // ── Geocode: address → lat/lng ─────────────────────────────────────────
      case 'geocode': {
        const address = clean(url.searchParams.get('address'));
        if (!address) return jsonResponse({ error: 'address is required' }, 400);

        const endpoint = `/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
        return await proxyGet(endpoint);
      }

      // ── Reverse geocode: lat/lng → address ────────────────────────────────
      case 'reverse_geocode': {
        const lat = clean(url.searchParams.get('lat'));
        const lng = clean(url.searchParams.get('lng'));
        if (!lat || !lng) return jsonResponse({ error: 'lat and lng are required' }, 400);

        const endpoint = `/geocode/json?latlng=${encodeURIComponent(`${lat},${lng}`)}&key=${apiKey}`;
        return await proxyGet(endpoint);
      }

      // ── Autocomplete: partial input → place suggestions ───────────────────
      case 'autocomplete': {
        const input = clean(url.searchParams.get('input'));
        if (!input) return jsonResponse({ error: 'input is required' }, 400);

        const types   = clean(url.searchParams.get('types'))   || 'address';
        const location = clean(url.searchParams.get('location'));
        const radius   = clean(url.searchParams.get('radius'));

        let endpoint = `/place/autocomplete/json?input=${encodeURIComponent(input)}&types=${types}&key=${apiKey}`;
        if (location) endpoint += `&location=${encodeURIComponent(location)}`;
        if (radius)   endpoint += `&radius=${encodeURIComponent(radius)}`;

        return await proxyGet(endpoint);
      }

      // ── Place details: place_id → full address + coords ───────────────────
      case 'place_details': {
        const placeId = clean(url.searchParams.get('place_id'));
        if (!placeId) return jsonResponse({ error: 'place_id is required' }, 400);

        const fields = clean(url.searchParams.get('fields')) || 'formatted_address,geometry,name,address_components';
        const endpoint = `/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=${encodeURIComponent(fields)}&key=${apiKey}`;
        return await proxyGet(endpoint);
      }

      default:
        return jsonResponse({
          error: 'Invalid mode',
          validModes: ['geocode', 'reverse_geocode', 'autocomplete', 'place_details'],
        }, 400);
    }

  } catch (error) {
    return jsonResponse({
      error: 'Maps proxy error',
      details: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

async function proxyGet(endpoint: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(`${MAPS_BASE_URL}${endpoint}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const data = await res.json();

    if (!res.ok) {
      return jsonResponse({ error: 'Google Maps API error', status: res.status, details: data }, res.status);
    }

    return jsonResponse(data);
  } catch (error) {
    clearTimeout(timeout);
    const isTimeout = error instanceof DOMException && error.name === 'AbortError';
    return jsonResponse({
      error: isTimeout ? 'Google Maps request timed out' : 'Fetch failed',
      details: error instanceof Error ? error.message : String(error),
    }, isTimeout ? 504 : 500);
  }
}

function clean(value: string | null): string | null {
  return value?.trim() || null;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}
