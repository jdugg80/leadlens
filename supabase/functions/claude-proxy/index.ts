// Supabase Edge Function: claude-proxy
// Proxies Claude API calls from the web portal to avoid CORS issues
// Deploy: supabase functions deploy claude-proxy

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY_PRIMARY = Deno.env.get("ANTHROPIC_API_KEY")!;

// Supabase auto-injects these into every Edge Function — no need to set them yourself
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RETRYABLE_STATUSES = [429, 500, 502, 503, 529];

async function getApiKeys(): Promise<string[]> {
  const keys = [ANTHROPIC_API_KEY_PRIMARY];

  const { data, error } = await supabaseAdmin.rpc("get_secret", {
    secret_name: "anthropic_api_key_secondary",
  });

  if (!error && data) {
    keys.push(data as string);
  } else if (error) {
    console.error("claude-proxy: couldn't load secondary key:", error.message);
  }

  return keys;
}

async function callClaudeWithFailover(payload: any) {
  const keys = await getApiKeys();
  let lastResponse: Response | null = null;

  for (let i = 0; i < keys.length; i++) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${keys[i]}`,
        "x-api-key": keys[i],
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: payload.model || "claude-haiku-4-5-20251001",
        max_tokens: payload.max_tokens || 1500,
        system: payload.system,
        messages: payload.messages,
      }),
    });

    if (response.ok) {
      if (i > 0) console.log(`claude-proxy: succeeded on fallback key ${i}`);
      return response;
    }

    lastResponse = response;

    if (RETRYABLE_STATUSES.includes(response.status)) {
      continue;
    }

    if (response.status === 400) {
      const cloned = response.clone();
      const errBody = await cloned.json().catch(() => null);
      if (errBody?.error?.message?.toLowerCase().includes("usage limit")) {
        console.log(`claude-proxy: key ${i} hit usage limit, trying next`);
        continue;
      }
    }

    break;
  }

  return lastResponse!;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    const response = await callClaudeWithFailover(body);
    const data = await response.json();

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: response.status,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});