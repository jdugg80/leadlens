// supabase/functions/compliance-ingest/index.ts
//
// Rebuild of the original compliance-ingest. Three fixes from the version that was
// live before:
//   1. Every record no longer gets Houston's downtown coordinates hardcoded — each
//      address is actually geocoded now (Census Bureau, free, tried first; Google
//      Geocoding only as a fallback for addresses Census can't resolve).
//   2. Already-geocoded addresses are never re-geocoded on a later run — this is what
//      keeps recurring runs close to $0 instead of re-billing the same addresses.
//   3. Houston's CKAN API was only ever queried for the first 100 records per ZIP with
//      no pagination — any ZIP with more inspections than that was silently truncated.
//      This now pages through with a safety cap.
//
// Writes to `lenssignal_records` (via the upsert_lenssignal_records RPC — see the
// paired SQL file), NOT `lens_signals`. `lens_signals` is a different table used by a
// separate function (signal-ingest) and is not what the map's LensSignal layer reads.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const HOUSTON_RESOURCE_ID = 'd1d9a226-6510-4d61-9002-dd664aac4ef3';
const HOUSTON_PAGE_SIZE = 100;
const HOUSTON_MAX_RECORDS_PER_ZIP = 500; // safety cap so one ZIP can't run away with the batch

const PEST_VIOLATION_TERMS = [
  'roach', 'cockroach', 'rodent', 'rat', 'mice', 'mouse', 'vermin', 'pest',
  'insect', 'fly infestation', 'flies present', 'gnat', 'infestation',
];

function detectPestFromViolationText(text: string): { flagged: boolean; terms: string[] } {
  const lower = (text || '').toLowerCase();
  const hits = PEST_VIOLATION_TERMS.filter((t) => lower.includes(t));
  return { flagged: hits.length > 0, terms: hits };
}

// Same score-band logic already used by the other get_lenssignal_nearby overload's
// derivation, applied here at ingest time since this table's grade/alert_level columns
// are stored, not computed on read.
function scoreToGrade(score: number | null): string | null {
  if (score === null || !isFinite(score)) return null;
  if (score === 0) return 'A';
  if (score <= 10) return 'B';
  if (score <= 25) return 'C';
  if (score <= 50) return 'D';
  return 'F';
}

function deriveAlertLevel(status: string, score: number | null): string {
  const s = (status || '').toUpperCase();
  if (s === 'FAIL') return 'Priority Review';
  if (s === 'CONDITIONAL') return 'Monitor';
  if (score !== null && isFinite(score)) {
    if (score > 50) return 'Priority Review';
    if (score > 25) return 'Monitor';
    if (score > 10) return 'Opportunity';
    if (score === 0) return 'Good Standing';
  }
  if (s === 'PASS') return 'Good Standing';
  return 'Monitor';
}

function mapHoustonRating(status: string): string {
  const s = (status || '').toUpperCase();
  if (s === 'PASS') return 'Good Standing';
  if (s === 'FAIL') return 'Priority Review';
  if (s === 'CONDITIONAL') return 'Opportunity';
  return 'Unknown';
}

async function stableUUID(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  const hex = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(12, 15)}-${hex.slice(15, 19)}-${hex.slice(19, 31)}`;
}

// ── Fetch ALL Houston records for a ZIP, paginated, capped at HOUSTON_MAX_RECORDS_PER_ZIP ──
async function fetchHoustonRecords(zip: string): Promise<any[]> {
  const all: any[] = [];
  let offset = 0;
  while (all.length < HOUSTON_MAX_RECORDS_PER_ZIP) {
    const url = new URL('https://data.houstontx.gov/api/3/action/datastore_search');
    url.searchParams.append('resource_id', HOUSTON_RESOURCE_ID);
    url.searchParams.append('filters', JSON.stringify({ FacilityZip: zip }));
    url.searchParams.append('limit', String(HOUSTON_PAGE_SIZE));
    url.searchParams.append('offset', String(offset));

    const res = await fetch(url.toString());
    if (!res.ok) break;
    const bodyJson = await res.json().catch(() => null);
    const records = bodyJson?.result?.records || [];
    if (!records.length) break;

    all.push(...records);
    if (records.length < HOUSTON_PAGE_SIZE) break; // last page
    offset += HOUSTON_PAGE_SIZE;
  }
  return all;
}

// ── Geocoding: Census (free) first, Google (paid, optional) as fallback ──────────────
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

    const reqBody = await req.json().catch(() => ({}));
    const zipCodes: string[] = Array.isArray(reqBody?.zipCodes) ? reqBody.zipCodes : [];
    if (!zipCodes.length) return json({ error: 'zipCodes array is required' }, 400);

    let inserted = 0;
    let geocodedFromCache = 0;
    let geocodedViaCensus = 0;
    let geocodedViaGoogle = 0;
    let geocodeFailed = 0;
    const errors: any[] = [];

    for (const zip of zipCodes) {
      try {
        const records = await fetchHoustonRecords(zip);
        if (!records.length) continue;

        const rows: any[] = [];

        for (const rec of records) {
          try {
            const name = String(rec.FacilityName || '').trim();
            const address = String(rec.FacilityFullStreetAddress || '').trim();
            if (!name || !address) continue;

            const city = rec.FacilityCity || 'Houston';
            const state = rec.FacilityState || 'TX';
            const fullAddress = `${address}, ${city}, ${state} ${rec.FacilityZip || zip}`;

            const idSeed = rec.FacilityHashID ? `houston:${rec.FacilityHashID}` : `houston:${name}|${address}`;
            const id = await stableUUID(idSeed);

            // ── Cache check: skip geocoding if this record already has real coordinates ──
            let lat: number | null = null;
            let lng: number | null = null;
            let source = '';
            const cacheRes = await fetch(
              `${SUPABASE_URL}/rest/v1/lenssignal_records?id=eq.${id}&select=latitude,longitude`,
              { headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY } }
            ).catch(() => null);
            if (cacheRes?.ok) {
              const existing = await cacheRes.json().catch(() => []);
              const row = Array.isArray(existing) ? existing[0] : null;
              if (row && isFinite(Number(row.latitude)) && isFinite(Number(row.longitude))) {
                lat = Number(row.latitude);
                lng = Number(row.longitude);
                source = 'cache';
                geocodedFromCache++;
              }
            }

            if (lat === null || lng === null) {
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
            }

            if (lat === null || lng === null) {
              geocodeFailed++;
              errors.push({ zip, name, reason: 'geocode failed (Census + Google)' });
              continue; // never insert a record with no real coordinates
            }

            const score = rec.InspectionScore !== undefined && rec.InspectionScore !== null
              ? Number(rec.InspectionScore)
              : null;
            const status = String(rec.InspectionStatus || '');
            const violationText = String(rec.InspectionComments || '');
            const pest = detectPestFromViolationText(violationText);

            rows.push({
              id,
              signal_layer: 'compliance',
              signal_type: 'Compliance Signal',
              latitude: lat,
              longitude: lng,
              establishment_name: name,
              address,
              city,
              state,
              zip: rec.FacilityZip || zip,
              score,
              grade: scoreToGrade(score),
              violation_text: violationText || null,
              pest_indicator: pest.flagged,
              pest_terms: pest.terms, // array — [] when no hits, never null (RPC coalesces to '{}')
              opening_status: null,
              permit_type: null,
              permit_date: null,
              alert_level: deriveAlertLevel(status, score),
              source_name: 'Houston Health Department',
              source_record_url: null,
              compliance_score: score,
              compliance_rating: mapHoustonRating(status),
              health_violation_flag: pest.flagged,
              signal_date: rec.InspectionDate || null,
              raw_record: {
                inspection_date: rec.InspectionDate,
                inspection_uid: rec.InspectionUID,
                facility_hash_id: rec.FacilityHashID,
                inspection_type: rec.InspectionType,
                establishment_type: rec.EstablishmentType,
                risk_profile: rec.FacilityRiskProfile,
                facility_status: rec.FacilityCurrentStatus,
                geocode_source: source,
                ingested_at: new Date().toISOString(),
              },
            });
          } catch (recErr) {
            errors.push({ zip, reason: recErr instanceof Error ? recErr.message : String(recErr) });
          }
        }

        // ── Dedupe: keep only the MOST RECENT inspection per facility ──────────────
        // Houston's dataset is one row per inspection, so a facility inspected several
        // times over the years produces several records that all resolve to the same
        // deterministic `id`. A single upsert statement can't apply two writes to the
        // same conflict target at once (Postgres error 21000), and semantically we only
        // want the current status on the map anyway, not overlapping historical pins.
        const latestById = new Map<string, any>();
        for (const row of rows) {
          const existing = latestById.get(row.id);
          if (!existing) {
            latestById.set(row.id, row);
            continue;
          }
          const existingDate = Date.parse(existing.signal_date || '') || 0;
          const rowDate = Date.parse(row.signal_date || '') || 0;
          if (rowDate >= existingDate) latestById.set(row.id, row);
        }
        const dedupedRows = [...latestById.values()];

        // Upsert in chunks of 200 (RPC caps a single call at 1000 rows; keeping well
        // under that bounds request size and gives partial progress if one chunk fails).
        for (let i = 0; i < dedupedRows.length; i += 200) {
          const chunk = dedupedRows.slice(i, i + 200);
          const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/upsert_lenssignal_records`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${SERVICE_KEY}`,
              apikey: SERVICE_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ p_rows: chunk }),
          });
          if (!upsertRes.ok) {
            const errText = await upsertRes.text();
            errors.push({ zip, reason: `upsert failed: ${errText.slice(0, 200)}` });
          } else {
            const count = await upsertRes.json().catch(() => chunk.length);
            inserted += Number(count) || chunk.length;
          }
        }
      } catch (zipErr) {
        errors.push({ zip, reason: zipErr instanceof Error ? zipErr.message : String(zipErr) });
      }
    }

    return json({
      ok: true,
      inserted,
      geocodedFromCache,
      geocodedViaCensus,
      geocodedViaGoogle,
      geocodeFailed,
      zipsProcessed: zipCodes.length,
      errors: errors.slice(0, 25),
    });
  } catch (err) {
    return json({ error: `compliance-ingest failed: ${err instanceof Error ? err.message : String(err)}` }, 500);
  }
});
