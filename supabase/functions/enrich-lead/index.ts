// supabase/functions/enrich-lead/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const googleMapsApiKey = Deno.env.get("GOOGLE_MAPS_API_KEY")!;

// State registry mapping
const STATE_REGISTRIES = {
  AL: {
    name: "Alabama",
    source: "https://arc-sos.alabama.gov/cgi-bin/corpdb.pl",
    type: "web_scrape",
  },
  AK: { name: "Alaska", source: "https://www.commerce.alaska.gov/web/cbpl/BusinessEntitySearch.aspx", type: "web_scrape" },
  AZ: { name: "Arizona", source: "https://apps.azcc.gov/business/query/", type: "web_scrape" },
  AR: { name: "Arkansas", source: "https://www.sos.arkansas.gov/corporations/entity-search", type: "web_scrape" },
  CA: { name: "California", source: "https://onlineservices.sos.ca.gov/", type: "web_scrape" },
  CO: { name: "Colorado", source: "https://www.sos.state.co.us/pls/business/", type: "web_scrape" },
  CT: { name: "Connecticut", source: "https://portal.ct.gov/SOTS/Division-of-Corporations/Corporation-Search", type: "web_scrape" },
  DE: { name: "Delaware", source: "https://delaware.gov/sos/", type: "web_scrape" },
  FL: { name: "Florida", source: "https://dos.myflorida.com/businesses/", type: "web_scrape" },
  GA: { name: "Georgia", source: "https://sos.ga.gov/cgi-bin/", type: "web_scrape" },
  HI: { name: "Hawaii", source: "https://businessregistration.hawaii.gov/", type: "web_scrape" },
  ID: { name: "Idaho", source: "https://sos.idaho.gov/business-entity-search/", type: "web_scrape" },
  IL: { name: "Illinois", source: "https://cyberdriveillinois.com/departments/index/business/default.html", type: "web_scrape" },
  IN: { name: "Indiana", source: "https://sos.in.gov/business/", type: "web_scrape" },
  IA: { name: "Iowa", source: "https://sos.iowa.gov/business/", type: "web_scrape" },
  KS: { name: "Kansas", source: "https://sos.kansas.gov/business/", type: "web_scrape" },
  KY: { name: "Kentucky", source: "https://sos.ky.gov/business/", type: "web_scrape" },
  LA: { name: "Louisiana", source: "https://www.sos.louisiana.gov/tabid/136/default.aspx", type: "web_scrape" },
  ME: { name: "Maine", source: "https://maine.gov/sos/corporate/", type: "web_scrape" },
  MD: { name: "Maryland", source: "https://www.sos.maryland.gov/business/", type: "web_scrape" },
  MA: { name: "Massachusetts", source: "https://www.sec.state.ma.us/cis/cislistserv.html", type: "web_scrape" },
  MI: { name: "Michigan", source: "https://www.michigan.gov/sos/", type: "web_scrape" },
  MN: { name: "Minnesota", source: "https://mblsportal.sos.state.mn.us/", type: "web_scrape" },
  MS: { name: "Mississippi", source: "https://www.sos.ms.gov/business-services/", type: "web_scrape" },
  MO: { name: "Missouri", source: "https://www.sos.mo.gov/business/", type: "web_scrape" },
  MT: { name: "Montana", source: "https://sos.mt.gov/business/", type: "web_scrape" },
  NE: { name: "Nebraska", source: "https://sos.nebraska.gov/business/", type: "web_scrape" },
  NV: { name: "Nevada", source: "https://sos.nv.gov/business/", type: "web_scrape" },
  NH: { name: "New Hampshire", source: "https://www.sos.nh.gov/business/", type: "web_scrape" },
  NJ: { name: "New Jersey", source: "https://www.nj.gov/state/sos/", type: "web_scrape" },
  NM: { name: "New Mexico", source: "https://www.sos.state.nm.us/business/", type: "web_scrape" },
  NY: { name: "New York", source: "https://dos.ny.gov/business-services/", type: "web_scrape" },
  NC: { name: "North Carolina", source: "https://www.sosnc.gov/divisions/business/business_registration_divisions", type: "web_scrape" },
  ND: { name: "North Dakota", source: "https://sos.nd.gov/business/", type: "web_scrape" },
  OH: { name: "Ohio", source: "https://www.sos.state.oh.us/", type: "web_scrape" },
  OK: { name: "Oklahoma", source: "https://www.sos.ok.gov/business/", type: "web_scrape" },
  OR: { name: "Oregon", source: "https://www.oregon.gov/sos/business/Pages/default.aspx", type: "web_scrape" },
  PA: { name: "Pennsylvania", source: "https://www.sos.pa.gov/business-services/", type: "web_scrape" },
  RI: { name: "Rhode Island", source: "https://sos.ri.gov/business/", type: "web_scrape" },
  SC: { name: "South Carolina", source: "https://www.sos.sc.gov/business/", type: "web_scrape" },
  SD: { name: "South Dakota", source: "https://sdsos.gov/business-services/", type: "web_scrape" },
  TN: { name: "Tennessee", source: "https://www.sos.tn.gov/business/", type: "web_scrape" },
  TX: { name: "Texas", source: "https://www.sos.state.tx.us/cgi-bin/corp_forms_search.pl", type: "web_scrape" },
  UT: { name: "Utah", source: "https://www.utah.gov/business/", type: "web_scrape" },
  VT: { name: "Vermont", source: "https://sos.vermont.gov/business/", type: "web_scrape" },
  VA: { name: "Virginia", source: "https://www.scc.virginia.gov/", type: "web_scrape" },
  WA: { name: "Washington", source: "https://www.sos.wa.gov/business/", type: "web_scrape" },
  WV: { name: "West Virginia", source: "https://sos.wv.gov/business-licensing/", type: "web_scrape" },
  WI: { name: "Wisconsin", source: "https://www.sos.state.wi.us/business/", type: "web_scrape" },
  WY: { name: "Wyoming", source: "https://sos.wyo.gov/business/", type: "web_scrape" },
};

interface EnrichmentRequest {
  lead_id: string;
  business_name: string;
  city: string;
  state: string;
  address?: string;
  website?: string;
}

interface RegistryResult {
  address: string;
  owner_name: string;
  owner_title?: string;
  file_number?: string;
  source: string;
  searchAttempted: boolean;
  success: boolean;
  error?: string;
}

serve(async (req) => {
  if (req.method !== "POST") return new Response("Not found", { status: 404 });

  try {
    const client = createClient(supabaseUrl, supabaseAnonKey);
    const payload: EnrichmentRequest = await req.json();

    // Check cache first (don't re-enrich within 7 days)
    const { data: existingEnrichment } = await client
      .from("enrichment_results")
      .select("*")
      .eq("lead_id", payload.lead_id)
      .gte("last_enriched_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .single();

    if (existingEnrichment?.enrichment_status === "complete") {
      console.log(`Cache hit for lead ${payload.lead_id}`);
      return new Response(JSON.stringify({ ...existingEnrichment, cached: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Mark as in_progress
    await client
      .from("enrichment_results")
      .upsert({
        lead_id: payload.lead_id,
        enrichment_status: "in_progress",
        updated_at: new Date().toISOString(),
      });

    // Run all enrichment sources in parallel with timeout
    const [googleMapsData, stateRegistryData, websiteData, linkedinData] = await Promise.allSettled([
      enrichFromGoogleMaps(payload),
      enrichFromStateRegistry(payload),
      enrichFromWebsite(payload),
      enrichFromLinkedIn(payload),
    ]);

    // Compile results
    const enrichedData = {
      lead_id: payload.lead_id,
      address_google_maps: googleMapsData.status === "fulfilled" ? googleMapsData.value?.address : null,
      phone_google_maps: googleMapsData.status === "fulfilled" ? googleMapsData.value?.phone : null,
      address_state_registry: stateRegistryData.status === "fulfilled" ? stateRegistryData.value?.address : null,
      poc_name: stateRegistryData.status === "fulfilled" ? stateRegistryData.value?.owner_name : null,
      emails_website: websiteData.status === "fulfilled" ? websiteData.value?.emails || [] : [],
      emails_domain_pattern: websiteData.status === "fulfilled" ? websiteData.value?.domain_patterns || [] : [],
      phone_website: websiteData.status === "fulfilled" ? websiteData.value?.phone : null,
      poc_title: stateRegistryData.status === "fulfilled" ? stateRegistryData.value?.owner_title : null,
      poc_linkedin_url: linkedinData.status === "fulfilled" ? linkedinData.value?.linkedin_url : null,
      enrichment_sources: [
        googleMapsData.status === "fulfilled" && googleMapsData.value ? "google_maps" : null,
        stateRegistryData.status === "fulfilled" && stateRegistryData.value?.success ? "state_registry" : null,
        websiteData.status === "fulfilled" && websiteData.value ? "website_scrape" : null,
        linkedinData.status === "fulfilled" && linkedinData.value ? "linkedin" : null,
      ].filter(Boolean),
      enrichment_status: "complete",
      last_enriched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Save results
    const { error } = await client.from("enrichment_results").upsert(enrichedData);

    if (error) {
      console.error("DB error:", error);
      throw error;
    }

    return new Response(JSON.stringify(enrichedData), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Enrichment error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

// ===== ENRICHMENT FUNCTIONS =====

async function enrichFromGoogleMaps(payload: EnrichmentRequest): Promise<{ address: string; phone: string; website: string } | null> {
  try {
    const searchQuery = `${payload.business_name} ${payload.city} ${payload.state}`;
    const encodedQuery = encodeURIComponent(searchQuery);

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodedQuery}&key=${googleMapsApiKey}`,
      { signal: AbortSignal.timeout(5000) }
    );

    const data = await response.json();

    if (data.results?.[0]) {
      const place = data.results[0];
      const detailsResponse = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=formatted_address,formatted_phone_number,website&key=${googleMapsApiKey}`,
        { signal: AbortSignal.timeout(5000) }
      );

      const detailsData = await detailsResponse.json();

      return {
        address: detailsData.result?.formatted_address || "",
        phone: detailsData.result?.formatted_phone_number || "",
        website: detailsData.result?.website || "",
      };
    }

    return null;
  } catch (error) {
    console.error("Google Maps error:", error.message);
    return null;
  }
}

async function enrichFromStateRegistry(payload: EnrichmentRequest): Promise<RegistryResult | null> {
  const stateCode = payload.state.toUpperCase();
  const registry = STATE_REGISTRIES[stateCode as keyof typeof STATE_REGISTRIES];

  if (!registry) {
    console.warn(`No registry config for state: ${stateCode}`);
    return null;
  }

  try {
    console.log(`Searching ${registry.name} registry for: ${payload.business_name}`);

    // Dispatch to state-specific handler
    const result = await searchStateRegistry(stateCode, payload.business_name, registry);

    return result;
  } catch (error) {
    console.error(`State registry error for ${stateCode}:`, error.message);
    return {
      address: "",
      owner_name: "",
      source: registry.name,
      searchAttempted: true,
      success: false,
      error: error.message,
    };
  }
}

async function searchStateRegistry(
  stateCode: string,
  businessName: string,
  registry: typeof STATE_REGISTRIES[keyof typeof STATE_REGISTRIES]
): Promise<RegistryResult> {
  try {
    // State-specific handlers for major states with reliable data structures
    switch (stateCode) {
      case "TX":
        return await searchTexasRegistry(businessName, registry);
      case "CA":
        return await searchCaliforniaRegistry(businessName, registry);
      case "NY":
        return await searchNewYorkRegistry(businessName, registry);
      case "FL":
        return await searchFloridaRegistry(businessName, registry);
      case "DE":
        return await searchDelawareRegistry(businessName, registry);
      default:
        // Generic web scrape fallback
        return await genericStateRegistrySearch(businessName, registry);
    }
  } catch (error) {
    return {
      address: "",
      owner_name: "",
      source: registry.name,
      searchAttempted: true,
      success: false,
      error: error.message,
    };
  }
}

// ===== STATE-SPECIFIC HANDLERS =====

async function searchTexasRegistry(businessName: string, registry: any): Promise<RegistryResult> {
  try {
    const response = await fetch(
      `${registry.source}?type=ALL&search_type=name&keywords=${encodeURIComponent(businessName)}`,
      { signal: AbortSignal.timeout(8000) }
    );

    const html = await response.text();

    // Texas HTML parsing
    const addressMatch = html.match(
      /(?:Address:|Principal Place of Business:)\s*<\/[^>]+>\s*([^<]+)</i
    );
    const ownerMatch = html.match(/(?:Manager|President|Owner):\s*<\/[^>]+>\s*([^<]+)</i);

    return {
      address: addressMatch ? addressMatch[1].trim().substring(0, 200) : "",
      owner_name: ownerMatch ? ownerMatch[1].trim() : "",
      source: registry.name,
      searchAttempted: true,
      success: !!(addressMatch || ownerMatch),
    };
  } catch (error) {
    return {
      address: "",
      owner_name: "",
      source: registry.name,
      searchAttempted: true,
      success: false,
      error: error.message,
    };
  }
}

async function searchCaliforniaRegistry(businessName: string, registry: any): Promise<RegistryResult> {
  try {
    const response = await fetch(
      `${registry.source}?action=search&type=FEIN&search=Keyword&searchstring=${encodeURIComponent(
        businessName
      )}&showfilter=true`,
      { signal: AbortSignal.timeout(8000) }
    );

    const html = await response.text();

    // California simplified parsing
    const nameMatch = html.match(/<tr[^>]*>[\s\S]*?<td[^>]*>([^<]+)<\/td>/i);
    const addressMatch = html.match(/(?:Street Address|Address):\s*([^<\n]+)/i);

    return {
      address: addressMatch ? addressMatch[1].trim() : "",
      owner_name: nameMatch ? nameMatch[1].trim() : "",
      source: registry.name,
      searchAttempted: true,
      success: !!(nameMatch || addressMatch),
    };
  } catch (error) {
    return {
      address: "",
      owner_name: "",
      source: registry.name,
      searchAttempted: true,
      success: false,
      error: error.message,
    };
  }
}

async function searchNewYorkRegistry(businessName: string, registry: any): Promise<RegistryResult> {
  try {
    const response = await fetch(
      `${registry.source}?appName=CorpLook&cCondition=&doSearch=Y&form_type=4CRRN&jurisdiction=&namelookup=Exact&name=${encodeURIComponent(
        businessName
      )}&county=ALL`,
      { signal: AbortSignal.timeout(8000) }
    );

    const html = await response.text();

    const addressMatch = html.match(/<td[^>]*>([^<]*(?:Street|Avenue|Road|Boulevard|Drive|Way|Lane)[^<]*)<\/td>/i);
    const ownerMatch = html.match(/(?:Officer|Agent):\s*<[^>]+>([^<]+)</i);

    return {
      address: addressMatch ? addressMatch[1].trim() : "",
      owner_name: ownerMatch ? ownerMatch[1].trim() : "",
      source: registry.name,
      searchAttempted: true,
      success: !!(addressMatch || ownerMatch),
    };
  } catch (error) {
    return {
      address: "",
      owner_name: "",
      source: registry.name,
      searchAttempted: true,
      success: false,
      error: error.message,
    };
  }
}

async function searchFloridaRegistry(businessName: string, registry: any): Promise<RegistryResult> {
  try {
    const response = await fetch(
      `https://dos.myflorida.com/cgi-bin/doscorp.exe?action=search&company_name=${encodeURIComponent(businessName)}`,
      { signal: AbortSignal.timeout(8000) }
    );

    const html = await response.text();

    const addressMatch = html.match(/Principal Address[:\s]*<[^>]+>([^<]+)</i);
    const ownerMatch = html.match(/Officer[:\s]*<[^>]+>([^<]+)</i);

    return {
      address: addressMatch ? addressMatch[1].trim() : "",
      owner_name: ownerMatch ? ownerMatch[1].trim() : "",
      source: registry.name,
      searchAttempted: true,
      success: !!(addressMatch || ownerMatch),
    };
  } catch (error) {
    return {
      address: "",
      owner_name: "",
      source: registry.name,
      searchAttempted: true,
      success: false,
      error: error.message,
    };
  }
}

async function searchDelawareRegistry(businessName: string, registry: any): Promise<RegistryResult> {
  try {
    const response = await fetch(
      `https://delaware.gov/sos/ucc/entity.shtml?businessname=${encodeURIComponent(businessName)}`,
      { signal: AbortSignal.timeout(8000) }
    );

    const html = await response.text();

    const addressMatch = html.match(/<td[^>]*>([^<]*\d+[^<]*(?:Street|Avenue|Road)[^<]*)<\/td>/i);
    const ownerMatch = html.match(/(?:Registered Agent|Manager):\s*([^<\n]+)/i);

    return {
      address: addressMatch ? addressMatch[1].trim() : "",
      owner_name: ownerMatch ? ownerMatch[1].trim() : "",
      source: registry.name,
      searchAttempted: true,
      success: !!(addressMatch || ownerMatch),
    };
  } catch (error) {
    return {
      address: "",
      owner_name: "",
      source: registry.name,
      searchAttempted: true,
      success: false,
      error: error.message,
    };
  }
}

// Generic fallback for all other states
async function genericStateRegistrySearch(businessName: string, registry: any): Promise<RegistryResult> {
  try {
    const response = await fetch(`${registry.source}`, {
      signal: AbortSignal.timeout(8000),
    });

    const html = await response.text();

    // Generic patterns that work across most state registries
    const addressPatterns = [
      /(?:Address|Street):\s*<[^>]*>([^<]+)</i,
      /<td[^>]*>([^<]*\d+\s+(?:Street|Avenue|Road|Boulevard|Drive)[^<]*)<\/td>/i,
      /(?:Principal|Registered)\s+(?:Office|Address):\s*([^<\n]+)/i,
    ];

    const ownerPatterns = [
      /(?:Agent|Manager|Officer|President):\s*<[^>]*>([^<]+)</i,
      /(?:Owner|Organizer):\s*([^<\n]+)/i,
    ];

    let address = "";
    let owner = "";

    for (const pattern of addressPatterns) {
      const match = html.match(pattern);
      if (match) {
        address = match[1].trim().substring(0, 200);
        break;
      }
    }

    for (const pattern of ownerPatterns) {
      const match = html.match(pattern);
      if (match) {
        owner = match[1].trim().substring(0, 100);
        break;
      }
    }

    return {
      address,
      owner_name: owner,
      source: registry.name,
      searchAttempted: true,
      success: !!(address || owner),
    };
  } catch (error) {
    return {
      address: "",
      owner_name: "",
      source: registry.name,
      searchAttempted: true,
      success: false,
      error: error.message,
    };
  }
}

// ===== WEBSITE SCRAPER =====

async function enrichFromWebsite(
  payload: EnrichmentRequest
): Promise<{ emails: string[]; domain_patterns: string[]; phone: string } | null> {
  try {
    if (!payload.website) return null;

    const response = await fetch(payload.website, {
      signal: AbortSignal.timeout(5000),
    });

    const html = await response.text();

    // Extract emails
    const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;
    const foundEmails = Array.from(new Set(html.match(emailRegex) || [])).filter(
      (email) =>
        !email.includes("noreply") &&
        !email.includes("no-reply") &&
        !email.endsWith("@example.com") &&
        !email.includes("test@")
    );

    // Extract phones
    const phoneRegex = /(\+?1[-.\s]?)?(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/g;
    const foundPhones = Array.from(new Set(html.match(phoneRegex) || []));

    // Generate domain patterns
    const domainPatterns = generateEmailPatterns(payload.website, payload.business_name);

    return {
      emails: foundEmails.slice(0, 5),
      domain_patterns: domainPatterns,
      phone: foundPhones[0] || "",
    };
  } catch (error) {
    console.error("Website scrape error:", error.message);
    return null;
  }
}

function generateEmailPatterns(website: string, businessName: string): string[] {
  const domain = website
    .replace(/https?:\/\//, "")
    .replace(/www\./, "")
    .replace(/\/$/, "")
    .split("/")[0];

  const baseNameParts = businessName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((p) => p.length > 0);

  const patterns: string[] = [
    `info@${domain}`,
    `contact@${domain}`,
    `owner@${domain}`,
    `admin@${domain}`,
    `hello@${domain}`,
  ];

  if (baseNameParts.length <= 2) {
    patterns.push(
      `${baseNameParts[0]}@${domain}`,
      `${baseNameParts.join(".")}@${domain}`,
      baseNameParts.length === 2
        ? `${baseNameParts[0]}.${baseNameParts[1]}@${domain}`
        : ""
    );
  }

  return patterns.filter((p) => p && p.includes("@"));
}

// ===== LINKEDIN SCRAPER =====

async function enrichFromLinkedIn(
  payload: EnrichmentRequest
): Promise<{ poc_name: string; poc_title: string; linkedin_url: string } | null> {
  try {
    const apifyKey = Deno.env.get("APIFY_API_KEY");
    if (!apifyKey) {
      console.warn("APIFY_API_KEY not set, skipping LinkedIn enrichment");
      return null;
    }

    const searchQuery = `${payload.business_name} ${payload.city}`;

    const response = await fetch(
      `https://api.apify.com/v2/acts/stefano~linkedin-profile-scraper/run?token=${apifyKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          searchQuery,
          maxRequests: 1,
        }),
        signal: AbortSignal.timeout(10000),
      }
    );

    const result = await response.json();

    if (result.data?.output?.[0]) {
      const profile = result.data.output[0];
      return {
        poc_name: profile.name || "",
        poc_title: profile.headline || "",
        linkedin_url: profile.url || "",
      };
    }

    return null;
  } catch (error) {
    console.error("LinkedIn enrichment error:", error.message);
    return null;
  }
}
