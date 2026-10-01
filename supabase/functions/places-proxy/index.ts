// supabase/functions/places-proxy/index.ts  (LeadLens Supabase project)
//
// Secrets to set:
//   supabase secrets set GOOGLE_PLACES_SERVER_KEY=...   (NEW key, restricted to Places API only)
//   supabase secrets set PLACES_DAILY_CAP=60            (optional, calls per user per UTC day)
//   supabase secrets set PLACES_MAX_RADIUS=5000         (optional, meters)
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DAILY_CAP = Number(Deno.env.get("PLACES_DAILY_CAP") ?? "60");
const MAX_RADIUS = Number(Deno.env.get("PLACES_MAX_RADIUS") ?? "5000");
const GOOGLE_KEY = Deno.env.get("GOOGLE_PLACES_SERVER_KEY") ?? "";

// The field mask decides the SKU you are billed. Keep it to the cheap identity fields.
// Get phone/hours later via Place Details, only for places that survive filtering.
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.businessStatus",
  "places.types",
].join(",");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-device-id",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!GOOGLE_KEY) return json({ error: "server_not_configured" }, 500);

  // Identify the caller: real auth user if there is one, otherwise the device id header.
  let userId: string | null = null;
  const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "");
  if (token) {
    const { data } = await admin.auth.getUser(token);
    userId = data?.user?.id ?? null;
  }
  if (!userId) userId = req.headers.get("x-device-id");
  if (!userId) return json({ error: "no_identity" }, 401);

  // Parse and clamp input.
  let input: any;
  try {
    input = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return json({ error: "bad_coordinates" }, 400);
  }
  const radius = Math.min(Math.max(Number(input.radius) || 1000, 100), MAX_RADIUS);
  const maxResultCount = Math.min(Math.max(Number(input.maxResultCount) || 20, 1), 20);
  const includedTypes: string[] | undefined = Array.isArray(input.includedTypes)
    ? input.includedTypes.slice(0, 10).map(String)
    : undefined;

  // Enforce the per-user daily cap BEFORE spending money.
  const { data: allowed, error: quotaError } = await admin.rpc("places_take_quota", {
    p_user: userId,
    p_cap: DAILY_CAP,
  });
  if (quotaError) {
    console.error("quota_error", quotaError.message);
    return json({ error: "quota_check_failed" }, 500);
  }
  if (!allowed) {
    console.log(JSON.stringify({ event: "places_denied", userId }));
    return json({ error: "daily_limit", cap: DAILY_CAP }, 429);
  }

  const googleBody: Record<string, unknown> = {
    maxResultCount,
    locationRestriction: {
      circle: { center: { latitude, longitude }, radius },
    },
  };
  if (includedTypes?.length) googleBody.includedTypes = includedTypes;

  const res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_KEY,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify(googleBody),
  });

  const text = await res.text();
  console.log(JSON.stringify({ event: "places_call", userId, status: res.status, radius }));

  return new Response(text, {
    status: res.status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
