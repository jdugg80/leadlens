const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { zipCodes = [] } = await req.json();

    if (!zipCodes.length) {
      return new Response(
        JSON.stringify({ error: 'Missing zipCodes array' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      return new Response(
        JSON.stringify({ error: 'Missing Supabase config' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let inserted = 0;
    let skipped = 0;
    const errors = [];

    // Houston Health Department food service inspection dataset
    const resourceId = 'd1d9a226-6510-4d61-9002-dd664aac4ef3';

    for (const zip of zipCodes) {
      try {
        console.log(`[compliance-ingest] Fetching Houston records for ZIP ${zip}...`);

        // Query Houston CKAN datastore with correct filter syntax
        const dataUrl = new URL('https://data.houstontx.gov/api/3/action/datastore_search');
        dataUrl.searchParams.append('resource_id', resourceId);
        dataUrl.searchParams.append('filters', JSON.stringify({ FacilityZip: zip }));
        dataUrl.searchParams.append('limit', '100');

        console.log(`[compliance-ingest] Fetching URL: ${dataUrl.toString()}`);

        const ckanRes = await fetch(dataUrl.toString());
        const ckanBody = await ckanRes.text();

        if (!ckanRes.ok) {
          console.warn(`[compliance-ingest] Houston CKAN error for ${zip}: ${ckanRes.status}`);
          console.warn(`[compliance-ingest] Response: ${ckanBody.substring(0, 200)}`);
          errors.push({ zip, reason: `HTTP ${ckanRes.status}` });
          continue;
        }

        let ckanData;
        try {
          ckanData = JSON.parse(ckanBody);
        } catch (parseErr) {
          console.error(`[compliance-ingest] Parse error:`, parseErr.message);
          errors.push({ zip, reason: `Parse error` });
          continue;
        }

        const records = ckanData?.result?.records || [];

        if (!records.length) {
          console.log(`[compliance-ingest] No records found for ${zip}`);
          skipped += 0;
          continue;
        }

        console.log(`[compliance-ingest] Got ${records.length} records for ${zip}`);

        // Transform Houston records to lens_signals format
        const signals = records
          .map((rec: any) => {
            try {
              // Map Houston CKAN fields to our schema
              return {
                id: crypto.randomUUID(),
                establishment_name: rec.FacilityName || 'Unknown',
                address: rec.FacilityFullStreetAddress || '',
                city: rec.FacilityCity || 'Houston',
                state: rec.FacilityState || 'TX',
                zip: rec.FacilityZip || zip,
                latitude: 29.7589,  // Houston center coordinates (placeholder until geocoded)
                longitude: -95.3677,
                compliance_score: rec.InspectionScore ? String(rec.InspectionScore) : '0',
                compliance_level: mapHoustonStatus(rec.InspectionStatus),
                compliance_source: 'Houston Health Department',
                compliance_findings: rec.InspectionComments || '',
                signal_type: 'compliance',
                signal_layer: 'compliance',
                opening_date: null,
                is_new_opening: false,
                has_pest_indicator: false,
                pest_details: null,
                metadata: {
                  inspection_date: rec.InspectionDate,
                  inspection_uid: rec.InspectionUID,
                  facility_hash_id: rec.FacilityHashID,
                  inspection_type: rec.InspectionType,
                  establishment_type: rec.EstablishmentType,
                  risk_profile: rec.FacilityRiskProfile,
                  facility_status: rec.FacilityCurrentStatus,
                },
              };
            } catch (e) {
              console.warn(`[compliance-ingest] Failed to transform record:`, e.message);
              return null;
            }
          })
          .filter(Boolean);

        if (!signals.length) {
          skipped += records.length;
          continue;
        }

        // Deduplicate within this batch by establishment name and address
        const seen = new Set();
        const deduped = signals.filter((s: any) => {
          const key = `${s.establishment_name}|${s.address}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        // Insert to lens_signals via REST API
        const insertRes = await fetch(`${supabaseUrl}/rest/v1/lens_signals`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(deduped),
        });

        if (!insertRes.ok) {
          const errText = await insertRes.text();
          console.error(`[compliance-ingest] Insert error for ${zip}:`, errText.substring(0, 200));
          errors.push({ zip, reason: `Insert failed: ${insertRes.status}` });
        } else {
          inserted += deduped.length;
          console.log(`[compliance-ingest] Inserted ${deduped.length} records for ${zip}`);
        }
      } catch (zipErr: any) {
        console.error(`[compliance-ingest] Error processing ${zip}:`, zipErr.message);
        errors.push({ zip, reason: zipErr.message });
      }
    }

    return new Response(
      JSON.stringify({ inserted, skipped, errors, message: 'Houston compliance sync complete' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[compliance-ingest] Fatal error:', err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Map Houston inspection status to our compliance levels
function mapHoustonStatus(status: string): string {
  if (!status) return 'Unknown';
  const s = String(status).toUpperCase();
  if (s === 'PASS') return 'Good Standing';
  if (s === 'FAIL') return 'Priority Review';
  if (s === 'CONDITIONAL') return 'Opportunity';
  return 'Monitor';
}