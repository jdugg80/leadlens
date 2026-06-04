// supabase/functions/enrich-lead-batch/index.ts
// Batch enrichment for admin panel - enrich 10-1000 leads at once

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

interface BatchEnrichmentRequest {
  lead_ids?: string[]; // Enrich specific leads
  filters?: {
    territory?: string;
    city?: string;
    state?: string;
    status?: string; // 'not_enriched' | 'partial' | 'all'
  };
  limit?: number; // Default 100, max 1000
}

interface BatchEnrichmentResult {
  total_leads: number;
  enriched: number;
  partial: number;
  failed: number;
  cached: number;
  duration_seconds: number;
  start_time: string;
  results: Array<{
    lead_id: string;
    status: string;
    enrichment_sources: string[];
    error?: string;
  }>;
}

serve(async (req) => {
  if (req.method !== "POST") return new Response("Not found", { status: 404 });

  const startTime = Date.now();
  let stats = {
    total: 0,
    enriched: 0,
    partial: 0,
    failed: 0,
    cached: 0,
  };

  try {
    const client = createClient(supabaseUrl, supabaseAnonKey);
    const payload: BatchEnrichmentRequest = await req.json();

    // Get leads to enrich
    let leadsQuery = client.from("leads").select("id, business_name, city, state, website");

    if (payload.lead_ids && payload.lead_ids.length > 0) {
      // Enrich specific leads
      leadsQuery = leadsQuery.in("id", payload.lead_ids);
    } else if (payload.filters) {
      // Filter-based enrichment
      if (payload.filters.territory) {
        leadsQuery = leadsQuery.eq("territory", payload.filters.territory);
      }
      if (payload.filters.city) {
        leadsQuery = leadsQuery.eq("city", payload.filters.city);
      }
      if (payload.filters.state) {
        leadsQuery = leadsQuery.eq("state", payload.filters.state);
      }

      // Status filter
      if (payload.filters.status === "not_enriched") {
        leadsQuery = leadsQuery.is("enriched_at", null);
      }
    }

    const limit = Math.min(payload.limit || 100, 1000); // Max 1000
    const { data: leads, error: leadsError } = await leadsQuery.limit(limit);

    if (leadsError) throw leadsError;

    stats.total = leads?.length || 0;
    console.log(`Enriching ${stats.total} leads...`);

    const results = [];

    // Enrich in parallel batches of 5 (don't overwhelm state registries)
    for (let i = 0; i < (leads?.length || 0); i += 5) {
      const batch = leads!.slice(i, i + 5);

      const enrichPromises = batch.map((lead) =>
        enrichSingleLead(client, lead).catch((error) => ({
          lead_id: lead.id,
          status: "failed",
          error: error.message,
          enrichment_sources: [],
        }))
      );

      const batchResults = await Promise.allSettled(enrichPromises);

      for (const result of batchResults) {
        if (result.status === "fulfilled") {
          results.push(result.value);

          // Update stats
          if (result.value.status === "complete") stats.enriched++;
          else if (result.value.status === "partial") stats.partial++;
          else if (result.value.status === "cached") stats.cached++;
          else stats.failed++;
        } else {
          stats.failed++;
          results.push({
            lead_id: "unknown",
            status: "failed",
            error: result.reason?.message,
            enrichment_sources: [],
          });
        }
      }

      // Log progress every 5 leads
      console.log(
        `Progress: ${results.length}/${stats.total} (Enriched: ${stats.enriched}, Cached: ${stats.cached}, Failed: ${stats.failed})`
      );

      // Rate limit between batches (avoid overwhelming state registries)
      if (i + 5 < (leads?.length || 0)) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    const duration = (Date.now() - startTime) / 1000;

    const response: BatchEnrichmentResult = {
      total_leads: stats.total,
      enriched: stats.enriched,
      partial: stats.partial,
      failed: stats.failed,
      cached: stats.cached,
      duration_seconds: duration,
      start_time: new Date(startTime).toISOString(),
      results,
    };

    console.log("Batch enrichment complete:", response);

    return new Response(JSON.stringify(response), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Batch enrichment error:", error);
    return new Response(
      JSON.stringify({
        error: error.message,
        stats,
        duration_seconds: (Date.now() - startTime) / 1000,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});

async function enrichSingleLead(
  client: any,
  lead: {
    id: string;
    business_name: string;
    city: string;
    state: string;
    website?: string;
  }
) {
  // Call main enrich-lead function
  const response = await fetch(
    `${Deno.env.get("SUPABASE_URL")}/functions/v1/enrich-lead`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        lead_id: lead.id,
        business_name: lead.business_name,
        city: lead.city,
        state: lead.state,
        website: lead.website,
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Enrichment failed");
  }

  return {
    lead_id: lead.id,
    status: data.cached ? "cached" : data.enrichment_status,
    enrichment_sources: data.enrichment_sources || [],
    error: data.error,
  };
}
