// supabase/functions/import-address-list/index.ts
//
// Takes a list name and an array of raw address rows from a rep's spreadsheet upload,
// geocodes each one (Census Bureau first -- free -- Google Geocoding as fallback, same
// pattern as compliance-ingest), and writes them into imported_address_lists /
// imported_address_list_items under the calling rep's own user_id.
//
// Runs server-side (not on the rep's phone) so a 100+ row import doesn't mean 100+
// sequential geocode calls over the rep's cellular connection, and isn't interrupted
// if the app gets backgrounded mid-import.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_ROWS_PER_REQUEST = 500; // safety cap -- matches the pattern used elsewhere

// ── Geocoding: Census (free) first, Google (paid, optional) as fallback ──────────────
// Identical logic to compliance-ingest -- kept duplicated rather than shared, since
// these are two separate Edge Functions with no shared deploy unit in this project.
async function geocodeCensus(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = new URL('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress');
    url.searchParams.append('address', address);
    url.searchParams.append('benchmark', 'Public_AR_Current');
    url.searchParams.append('format', 'json');
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const data = await res.json();
    const match = data?.result?.addressMatches?.[0];
    const coords = match?.coordinates;
    if (!coords || typeof coords.x !== 'number' || typeof coords.y !== 'number') return null;
    return { lat: coords.y, lng: coords.x };
  } catch {
    return null;
  }
}

async function geocodeGoogle(address: string, apiKey: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.append('address', address);
    url.searchParams.append('key', apiKey);
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const data = await res.json();
    const loc = data?.results?.[0]?.geometry?.location;
    if (!loc) return null;
    return { lat: loc.lat, lng: loc.lng };
  } catch {
    return null;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const GOOGLE_MAPS_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY') ?? '';

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return json({ error: 'Missing Supabase config' }, 500);
    }

    // The rep's own JWT identifies WHOSE list this is -- the function uses the service
    // key to write (since inserts aren't granted to `authenticated` directly, see the
    // SQL file), but every row is still scoped to this specific user, never a service
    // account or someone else's data.
    const authHeader = req.headers.get('authorization') || '';
    const userToken = authHeader.replace(/^Bearer\s+/i, '');
    if (!userToken) return json({ error: 'Missing Authorization header' }, 401);

    const whoamiRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${userToken}`, apikey: SERVICE_KEY },
    });
    if (!whoamiRes.ok) return json({ error: 'Invalid or expired session' }, 401);
    const whoami = await whoamiRes.json();
    const userId = whoami?.id;
    if (!userId) return json({ error: 'Could not resolve calling user' }, 401);

    const body = await req.json().catch(() => ({}));
    const listName = String(body?.listName || '').trim();
    const rows = Array.isArray(body?.rows) ? body.rows : [];

    if (!listName) return json({ error: 'listName is required' }, 400);
    if (!rows.length) return json({ error: 'rows array is required' }, 400);
    if (rows.length > MAX_ROWS_PER_REQUEST) {
      return json({ error: `Too many rows in one request (max ${MAX_ROWS_PER_REQUEST}). Split into multiple uploads.` }, 400);
    }

    // ── Find or create the named list for this rep ──────────────────────────────────
    const findRes = await fetch(
      `${SUPABASE_URL}/rest/v1/imported_address_lists?user_id=eq.${userId}&name=eq.${encodeURIComponent(listName)}&select=id`,
      { headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY } }
    );
    const findData = await findRes.json().catch(() => []);
    let listId = Array.isArray(findData) && findData[0]?.id ? findData[0].id : null;

    if (!listId) {
      const createRes = await fetch(`${SUPABASE_URL}/rest/v1/imported_address_lists`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SERVICE_KEY}`,
          apikey: SERVICE_KEY,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({ user_id: userId, name: listName }),
      });
      if (!createRes.ok) {
        const errText = await createRes.text();
        return json({ error: `Could not create list: ${errText.slice(0, 200)}` }, 500);
      }
      const created = await createRes.json();
      listId = Array.isArray(created) ? created[0]?.id : created?.id;
    }

    if (!listId) return json({ error: 'Could not resolve list id' }, 500);

    // ── Geocode each row (Census first, Google fallback) ────────────────────────────
    let geocodedViaCensus = 0;
    let geocodedViaGoogle = 0;
    let geocodeFailed = 0;
    const itemRows: any[] = [];

    for (const row of rows) {
      const businessName = String(row?.businessName || row?.name || '').trim() || null;
      const address = String(row?.address || '').trim();
      const city = String(row?.city || '').trim() || null;
      const state = String(row?.state || '').trim() || null;
      const zip = String(row?.zip || '').trim() || null;

      if (!address) {
        geocodeFailed++;
        continue; // no address to geocode -- skip, don't insert a useless row
      }

      const fullAddress = [address, city, state, zip].filter(Boolean).join(', ');

      let lat: number | null = null;
      let lng: number | null = null;
      let source = 'failed';

      const census = await geocodeCensus(fullAddress);
      if (census) {
        lat = census.lat;
        lng = census.lng;
        source = 'census';
        geocodedViaCensus++;
      } else if (GOOGLE_MAPS_KEY) {
        const google = await geocodeGoogle(fullAddress, GOOGLE_MAPS_KEY);
        if (google) {
          lat = google.lat;
          lng = google.lng;
          source = 'google';
          geocodedViaGoogle++;
        }
      }

      if (lat === null || lng === null) geocodeFailed++;

      itemRows.push({
        list_id: listId,
        business_name: businessName,
        address,
        city,
        state,
        zip,
        latitude: lat,
        longitude: lng,
        geocode_source: source,
        raw_row: row,
      });
    }

    // ── Insert in chunks ─────────────────────────────────────────────────────────────
    let inserted = 0;
    for (let i = 0; i < itemRows.length; i += 200) {
      const chunk = itemRows.slice(i, i + 200);
      const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/imported_address_list_items`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SERVICE_KEY}`,
          apikey: SERVICE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(chunk),
      });
      if (insertRes.ok) {
        inserted += chunk.length;
      } else {
        const errText = await insertRes.text();
        return json({
          error: `Insert failed partway through (${inserted} of ${itemRows.length} rows saved): ${errText.slice(0, 200)}`,
          inserted, listId, listName,
        }, 500);
      }
    }

    return json({
      ok: true,
      listId,
      listName,
      inserted,
      geocodedViaCensus,
      geocodedViaGoogle,
      geocodeFailed,
      totalRowsReceived: rows.length,
    });
  } catch (err) {
    return json({ error: `import-address-list failed: ${err instanceof Error ? err.message : String(err)}` }, 500);
  }
});
